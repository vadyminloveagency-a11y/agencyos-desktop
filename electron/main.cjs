const { app, BrowserWindow, Menu, ipcMain, session, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const net = require('net');
const { pathToFileURL } = require('url');

let mainWindow = null;
let serverPort = 0;
let mainBaseUrl = '';
const dreamWindows = new Set();
const dreamWindowByProfile = new Map();
const hiddenWindows = new Set();
const preparedDreamProfileIds = new Set();
let logPath = '';
let dreamLogoutBeforeQuitDone = false;
const DEFAULT_REMOTE_SERVER_URL = 'https://agencyos-server-096a.onrender.com';

function normalizeServerUrl(value = '') {
  const text = String(value || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(text)) return '';
  return text;
}

function configuredRemoteServerUrl() {
  const envUrl = normalizeServerUrl(process.env.AGENCYOS_SERVER_URL || process.env.DREAM_TEAM_REMOTE_URL || '');
  if (envUrl) return envUrl;
  if (app.isPackaged || process.env.AGENCYOS_USE_REMOTE === '1') return DEFAULT_REMOTE_SERVER_URL;
  return '';
}

function packageInfo() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  } catch {
    return {};
  }
}

function resolveUpdateRepository() {
  const envRepo = String(process.env.GITHUB_REPOSITORY || process.env.AGENCYOS_UPDATE_REPO || '').trim();
  if (/^[\w.-]+\/[\w.-]+$/.test(envRepo)) return envRepo;
  const pkg = packageInfo();
  const candidates = [
    pkg.repository && typeof pkg.repository === 'string' ? pkg.repository : '',
    pkg.repository && typeof pkg.repository === 'object' ? pkg.repository.url : '',
    pkg.homepage || ''
  ].map(value => String(value || '').trim());
  for (const value of candidates) {
    const match = value.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[#/?].*)?$/i);
    if (match) return `${match[1]}/${match[2]}`;
  }
  const publish = pkg.build?.publish;
  const item = Array.isArray(publish) ? publish[0] : publish;
  if (item?.provider === 'github' && item.owner && item.repo) return `${item.owner}/${item.repo}`;
  return '';
}

function normalizeVersion(value = '') {
  return String(value || '').trim().replace(/^v/i, '').split(/[+-]/)[0];
}

function compareVersions(a = '', b = '') {
  const left = normalizeVersion(a).split('.').map(part => Number(part) || 0);
  const right = normalizeVersion(b).split('.').map(part => Number(part) || 0);
  const length = Math.max(left.length, right.length, 3);
  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] || 0) - (right[index] || 0);
    if (diff) return diff > 0 ? 1 : -1;
  }
  return 0;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'AgencyOS-Updater'
    }
  });
  if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
  return response.json();
}

function logElectronError(label, error) {
  const text = `[${new Date().toISOString()}] [AgencyOS Electron] ${label}: ${error && error.stack ? error.stack : error}\n`;
  console.error(text);
  if (logPath) {
    try { fs.appendFileSync(logPath, text); } catch {}
  }
}

function logElectronInfo(label, details = '') {
  const text = `[${new Date().toISOString()}] [AgencyOS Electron] ${label}${details ? `: ${details}` : ''}\n`;
  console.log(text);
  if (logPath) {
    try { fs.appendFileSync(logPath, text); } catch {}
  }
}

function dreamPartitionForProfile(profileId) {
  return `persist:dream-profile-${String(profileId || '').replace(/[^\w.-]/g, '_')}`;
}

function knownDreamProfileIds() {
  const ids = new Set(preparedDreamProfileIds);
  for (const id of dreamWindowByProfile.keys()) ids.add(String(id || ''));
  try {
    const dbPath = path.join(__dirname, '..', 'data.json');
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    Object.keys(db.profiles || {}).forEach(id => ids.add(String(id || '')));
    Object.values(db.users || {}).forEach(user => {
      (user.profileIds || []).forEach(id => ids.add(String(id || '')));
    });
  } catch {}
  return [...ids].map(id => String(id || '').trim()).filter(id => /^\d{4,}$/.test(id));
}

process.on('uncaughtException', error => logElectronError('uncaughtException', error));
process.on('unhandledRejection', error => logElectronError('unhandledRejection', error));

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address();
      const port = Number(address && address.port);
      srv.close(() => resolve(port));
    });
  });
}

async function waitForServer(baseUrl, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('AgencyOS server did not start');
}

async function startLocalServer() {
  logPath = path.join(app.getPath('userData'), 'agencyos-electron.log');
  logElectronInfo('log-file', logPath);
  serverPort = await findFreePort();
  const runtimeDir = app.getPath('userData');
  process.env.PORT = String(serverPort);
  process.env.DREAM_TEAM_DESKTOP = '1';
  process.env.DREAM_TEAM_DATA_DIR = process.env.DREAM_TEAM_DATA_DIR || runtimeDir;
  process.env.DREAM_TEAM_DB_PATH = process.env.DREAM_TEAM_DB_PATH || path.join(runtimeDir, 'data.json');
  process.env.DREAM_TEAM_ALLOWED_PROFILES_PATH = process.env.DREAM_TEAM_ALLOWED_PROFILES_PATH || path.join(runtimeDir, 'allowed_profiles.json');
  process.env.DREAM_TEAM_CREDENTIAL_KEY_PATH = process.env.DREAM_TEAM_CREDENTIAL_KEY_PATH || path.join(runtimeDir, '.credential-key');
  process.env.DREAM_TEAM_PHOTOS_DIR = process.env.DREAM_TEAM_PHOTOS_DIR || path.join(runtimeDir, 'photos');
  process.env.DREAM_TEAM_WORKSPACE_ATTACHMENTS_DIR = process.env.DREAM_TEAM_WORKSPACE_ATTACHMENTS_DIR || path.join(runtimeDir, 'workspace-attachments');
  await import(pathToFileURL(path.join(__dirname, '..', 'server.js')).href);
  const baseUrl = `http://127.0.0.1:${serverPort}`;
  await waitForServer(baseUrl);
  return baseUrl;
}

async function resolveMainBaseUrl() {
  logPath = path.join(app.getPath('userData'), 'agencyos-electron.log');
  logElectronInfo('log-file', logPath);
  const remoteUrl = configuredRemoteServerUrl();
  if (remoteUrl) {
    logElectronInfo('remote-server-mode', remoteUrl);
    await waitForServer(remoteUrl, 90_000).catch(error => {
      logElectronError('remote-server-health', error);
    });
    return remoteUrl;
  }
  logElectronInfo('local-server-mode');
  return startLocalServer();
}

function createMainWindow(baseUrl) {
  logElectronInfo('create-main-window', baseUrl);
  const startupUrl = `${baseUrl}/?desktopVersion=${Date.now()}`;
  const appIcon = path.join(__dirname, '..', 'public', 'assets', 'app-logo.ico');
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1120,
    minHeight: 720,
    title: 'AgencyOS',
    icon: appIcon,
    backgroundColor: '#f7f3ef',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.setMenu(null);
  mainWindow.webContents.session.clearCache().catch(() => {});
  mainWindow.loadURL(startupUrl);
  const sendMainHome = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.executeJavaScript(`
      try {
        if (window.activateAgencyPanel) window.activateAgencyPanel('home', { persist: false });
      } catch {}
    `).catch(() => {});
  };
  const handleBackCommand = (event, command) => {
    if (String(command || '').toLowerCase() === 'browser-backward') {
      event.preventDefault();
      sendMainHome();
    }
  };
  mainWindow.on('app-command', handleBackCommand);
  mainWindow.webContents.on('app-command', handleBackCommand);
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (String(url || '').startsWith(baseUrl)) return;
    event.preventDefault();
    sendMainHome();
  });
  mainWindow.on('closed', () => {
    logElectronInfo('main-window-closed');
    mainWindow = null;
  });
}

async function redeemLaunch(baseUrl, token) {
  const response = await fetch(`${baseUrl}/api/profiles/launch/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) {
    throw new Error(result.error || 'Could not prepare Dream window');
  }
  return result;
}

async function seedDreamCookies(profileId, dreamCookies = []) {
  const partition = dreamPartitionForProfile(profileId);
  if (String(profileId || '').trim()) preparedDreamProfileIds.add(String(profileId || '').trim());
  const dreamSession = session.fromPartition(partition);
  for (const cookie of dreamCookies) {
    if (!cookie || !cookie.name || cookie.value == null) continue;
    await dreamSession.cookies.set({
      url: 'https://www.dream-singles.com',
      name: String(cookie.name),
      value: String(cookie.value),
      domain: '.dream-singles.com',
      path: '/',
      secure: true,
      httpOnly: false,
      sameSite: 'lax'
    }).catch(() => {});
  }
  return { dreamSession, partition };
}

async function waitForWebContentsLoad(webContents, timeoutMs = 30000) {
  return new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      webContents.removeListener('did-finish-load', finish);
      webContents.removeListener('did-fail-load', finish);
      webContents.removeListener('did-stop-loading', finish);
      webContents.removeListener('did-navigate', finish);
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    webContents.once('did-finish-load', finish);
    webContents.once('did-fail-load', finish);
    webContents.once('did-stop-loading', finish);
    webContents.once('did-navigate', finish);
  });
}

async function loadUrlLoose(win, url) {
  try {
    await win.loadURL(url);
    return true;
  } catch (error) {
    if (/ERR_ABORTED|navigation|aborted/i.test(String(error && error.message || error))) {
      await waitForWebContentsLoad(win.webContents, 5000).catch(() => {});
      return false;
    }
    throw error;
  }
}

async function dreamPageNeedsLogin(win) {
  const url = win.webContents.getURL();
  if (/\/login(?:[/?#]|$)|\/members\/login/i.test(url)) return true;
  return win.webContents.executeJavaScript(`
    Boolean(document.querySelector('input[type="password"]')) &&
    /login|sign in|password/i.test(document.body.innerText || '')
  `, true).catch(() => true);
}

async function ensureDreamLoggedIn(partition, credentials = {}) {
  logElectronInfo('ensure-dream-logged-in-start', partition);
  const login = String(credentials.login || '');
  const password = String(credentials.password || '');
  if (!login || !password) {
    logElectronInfo('ensure-dream-logged-in-missing-credentials');
    return false;
  }

  const hidden = new BrowserWindow({
    width: 1180,
    height: 820,
    show: false,
    webPreferences: {
      partition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  hiddenWindows.add(hidden);
  hidden.on('closed', () => {
    hiddenWindows.delete(hidden);
    logElectronInfo('hidden-login-window-closed');
  });

  try {
    logElectronInfo('hidden-load-inbox-before-login');
    await loadUrlLoose(hidden, 'https://www.dream-singles.com/members/messaging/inbox');
    if (!(await dreamPageNeedsLogin(hidden))) {
      logElectronInfo('hidden-already-logged-in');
      return true;
    }

    logElectronInfo('hidden-load-login');
    await loadUrlLoose(hidden, 'https://www.dream-singles.com/login');
    logElectronInfo('hidden-submit-login');
    const submitted = await hidden.webContents.executeJavaScript(`
      (() => {
        const login = ${JSON.stringify(login)};
        const password = ${JSON.stringify(password)};
        const loginInput = document.querySelector('input[type="email"], input[name*="email" i], input[type="text"]');
        const passwordInput = document.querySelector('input[type="password"]');
        if (!loginInput || !passwordInput) return false;
        loginInput.focus();
        loginInput.value = login;
        loginInput.dispatchEvent(new Event('input', { bubbles: true }));
        loginInput.dispatchEvent(new Event('change', { bubbles: true }));
        passwordInput.focus();
        passwordInput.value = password;
        passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
        passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
        const submit = [...document.querySelectorAll('button, input[type="submit"], input[type="button"]')]
          .find(item => /login|log in|sign in/i.test(item.innerText || item.value || item.textContent || ''));
        if (submit) submit.click();
        else passwordInput.closest('form')?.submit();
        return true;
      })();
    `, true);
    logElectronInfo('hidden-submit-login-result', String(submitted));
    await waitForWebContentsLoad(hidden.webContents, 12000);
    logElectronInfo('hidden-load-inbox-after-login');
    await loadUrlLoose(hidden, 'https://www.dream-singles.com/members/messaging/inbox').catch(() => {});
    const loggedIn = !(await dreamPageNeedsLogin(hidden));
    logElectronInfo('hidden-login-result', String(loggedIn));
    return loggedIn;
  } finally {
    if (!hidden.isDestroyed()) hidden.close();
  }
}

async function isDreamLoggedIn(partition) {
  logElectronInfo('check-dream-login-start', partition);
  const hidden = new BrowserWindow({
    width: 1180,
    height: 820,
    show: false,
    webPreferences: {
      partition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  hiddenWindows.add(hidden);
  hidden.on('closed', () => {
    hiddenWindows.delete(hidden);
    logElectronInfo('hidden-check-window-closed');
  });
  try {
    await loadUrlLoose(hidden, 'https://www.dream-singles.com/members/messaging/inbox');
    const loggedIn = !(await dreamPageNeedsLogin(hidden));
    logElectronInfo('check-dream-login-result', String(loggedIn));
    return loggedIn;
  } catch {
    logElectronInfo('check-dream-login-result', 'false');
    return false;
  } finally {
    if (!hidden.isDestroyed()) hidden.close();
  }
}

async function hasDreamSessionCookie(profileId) {
  const partition = dreamPartitionForProfile(profileId);
  const dreamSession = session.fromPartition(partition);
  const cookies = await dreamSession.cookies.get({ url: 'https://www.dream-singles.com' }).catch(() => []);
  return cookies.some(cookie => /^ds_SESSION_/i.test(String(cookie.name || '')));
}

async function logoutDreamProfile(profileId, options = {}) {
  const id = String(profileId || '').trim();
  if (!id) return { ok: false, error: 'Profile is not selected' };
  const partition = dreamPartitionForProfile(id);
  const label = options.reason ? `${id} ${options.reason}` : id;
  logElectronInfo('logout-dream-profile-start', label);
  const logoutWin = new BrowserWindow({
    width: 900,
    height: 700,
    show: false,
    webPreferences: {
      partition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  hiddenWindows.add(logoutWin);
  logoutWin.on('closed', () => hiddenWindows.delete(logoutWin));
  try {
    await loadUrlLoose(logoutWin, 'https://www.dream-singles.com/members/logout').catch(() => {});
    await loadUrlLoose(logoutWin, 'https://www.dream-singles.com/logout').catch(() => {});
  } finally {
    if (!logoutWin.isDestroyed()) logoutWin.close();
  }
  const dreamSession = session.fromPartition(partition);
  await dreamSession.clearStorageData({
    origin: 'https://www.dream-singles.com',
    storages: ['cookies', 'localstorage', 'indexdb', 'cachestorage', 'serviceworkers']
  }).catch(() => {});
  const cookies = await dreamSession.cookies.get({ url: 'https://www.dream-singles.com' }).catch(() => []);
  for (const cookie of cookies) {
    await dreamSession.cookies.remove('https://www.dream-singles.com', cookie.name).catch(() => {});
  }
  preparedDreamProfileIds.delete(id);
  logElectronInfo('logout-dream-profile-ok', label);
  return { ok: true, profileId: id };
}

async function logoutKnownDreamProfiles(reason = '') {
  const ids = knownDreamProfileIds();
  if (!ids.length) return;
  logElectronInfo('logout-known-dream-profiles-start', `${ids.length}${reason ? ` ${reason}` : ''}`);
  for (const id of ids) {
    await logoutDreamProfile(id, { reason }).catch(error => logElectronError(`logout-known-dream-profile ${id}`, error));
  }
  logElectronInfo('logout-known-dream-profiles-done', String(ids.length));
}

ipcMain.handle('agency:open-dream-window', async (_event, payload = {}) => {
  try {
    const profileId = String(payload.profileId || '');
    const token = String(payload.token || '');
    const baseUrl = String(payload.baseUrl || `http://127.0.0.1:${serverPort}`);
    let targetUrl = String(payload.url || 'https://www.dream-singles.com/members/messaging/inbox').trim();
    if (!profileId) return { ok: false, error: 'Profile is not selected' };
    logElectronInfo('open-dream-window-start', profileId);
    try {
      targetUrl = new URL(targetUrl || '/members/messaging/inbox', 'https://www.dream-singles.com').toString();
    } catch {
      targetUrl = 'https://www.dream-singles.com/members/messaging/inbox';
    }
    if (!/^https:\/\/([^/]+\.)?dream-singles\.com\//i.test(targetUrl)) {
      targetUrl = 'https://www.dream-singles.com/members/messaging/inbox';
    }

    let partition = `persist:dream-profile-${profileId.replace(/[^\w.-]/g, '_')}`;
    const hasCookie = await hasDreamSessionCookie(profileId);
    if (!hasCookie) {
      if (!token) return { ok: false, needsLaunch: true };
      logElectronInfo('open-dream-window-redeem-launch', profileId);
      const launch = await redeemLaunch(baseUrl, token);
      ({ partition } = await seedDreamCookies(profileId, launch.dreamCookies || []));
      const loggedIn = await ensureDreamLoggedIn(partition, launch);
      if (!loggedIn) logElectronInfo('hidden-login-not-confirmed-opening-visible-anyway', profileId);
    }

    const existingWin = dreamWindowByProfile.get(profileId);
    if (existingWin && !existingWin.isDestroyed()) {
      logElectronInfo('dream-window-reuse', `${profileId} ${targetUrl}`);
      existingWin.show();
      existingWin.focus();
      await loadUrlLoose(existingWin, targetUrl);
      return { ok: true };
    }

    const win = new BrowserWindow({
      width: 1180,
      height: 820,
      minWidth: 980,
      minHeight: 680,
      title: `Dream Singles - ${profileId}`,
      icon: path.join(__dirname, '..', 'public', 'assets', 'app-logo.ico'),
      backgroundColor: '#ffffff',
      autoHideMenuBar: true,
      webPreferences: {
        partition,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });
    dreamWindows.add(win);
    dreamWindowByProfile.set(profileId, win);
    win.setMenu(null);
    win.on('closed', () => {
      dreamWindows.delete(win);
      if (dreamWindowByProfile.get(profileId) === win) dreamWindowByProfile.delete(profileId);
      logElectronInfo('dream-window-closed', profileId);
    });
    logElectronInfo('dream-window-load-url', `${profileId} ${targetUrl}`);
    await loadUrlLoose(win, targetUrl);
    logElectronInfo('open-dream-window-ok', profileId);
    return { ok: true };
  } catch (error) {
    logElectronError('open-dream-window', error);
    return { ok: false, error: error.message || 'Could not open Dream window' };
  }
});

ipcMain.handle('agency:navigate', async (_event, action = '') => {
  if (!mainWindow || mainWindow.isDestroyed()) return { ok: false };
  const webContents = mainWindow.webContents;
  const command = String(action || '');
  if (command === 'back') {
    if (webContents.canGoBack()) webContents.goBack();
    return { ok: true };
  }
  if (command === 'refresh') {
    webContents.reload();
    return { ok: true };
  }
  if (command === 'zoom-in' || command === 'zoom-out') {
    const current = webContents.getZoomFactor();
    const delta = command === 'zoom-in' ? 0.1 : -0.1;
    const next = Math.min(1.5, Math.max(0.75, Math.round((current + delta) * 100) / 100));
    webContents.setZoomFactor(next);
    return { ok: true, zoom: next };
  }
  return { ok: false };
});

ipcMain.handle('agency:check-for-updates', async () => {
  try {
    const repo = resolveUpdateRepository();
    const currentVersion = app.getVersion() || packageInfo().version || '0.0.0';
    if (!repo) {
      return {
        ok: true,
        configured: false,
        currentVersion,
        message: 'Update channel is not configured yet.'
      };
    }
    const latest = await fetchJson(`https://api.github.com/repos/${repo}/releases/latest`);
    const latestVersion = normalizeVersion(latest.tag_name || latest.name || '');
    if (!latestVersion) throw new Error('Latest release does not have a version tag.');
    const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;
    const asset = Array.isArray(latest.assets)
      ? latest.assets.find(item => /\.(exe|msi|zip)$/i.test(String(item?.name || ''))) || latest.assets[0]
      : null;
    return {
      ok: true,
      configured: true,
      repo,
      currentVersion,
      latestVersion,
      hasUpdate,
      releaseUrl: latest.html_url || `https://github.com/${repo}/releases/latest`,
      downloadUrl: asset?.browser_download_url || latest.html_url || `https://github.com/${repo}/releases/latest`,
      message: hasUpdate ? `Update available: v${latestVersion}.` : 'No updates available.'
    };
  } catch (error) {
    logElectronError('check-for-updates', error);
    return { ok: false, error: error.message || 'Could not check for updates.' };
  }
});

ipcMain.handle('agency:open-external-url', async (_event, url = '') => {
  const targetUrl = String(url || '').trim();
  if (!/^https?:\/\//i.test(targetUrl)) return { ok: false, error: 'Invalid URL' };
  await shell.openExternal(targetUrl);
  return { ok: true };
});

ipcMain.handle('agency:prepare-dream-profile', async (_event, payload = {}) => {
  try {
    const profileId = String(payload.profileId || '');
    const token = String(payload.token || '');
    const baseUrl = String(payload.baseUrl || `http://127.0.0.1:${serverPort}`);
    if (!profileId) return { ok: false, error: 'Profile is not selected' };
    if (!token) return { ok: false, error: 'Launch token is missing' };
    logElectronInfo('prepare-dream-profile-start', profileId);
    const launch = await redeemLaunch(baseUrl, token);
    const { partition } = await seedDreamCookies(profileId, launch.dreamCookies || []);
    const loggedIn = await ensureDreamLoggedIn(partition, launch);
    logElectronInfo('prepare-dream-profile-result', `${profileId} ${loggedIn}`);
    return { ok: loggedIn, profileId };
  } catch (error) {
    logElectronError('prepare-dream-profile', error);
    return { ok: false, error: error.message || 'Could not prepare Dream profile' };
  }
});

ipcMain.handle('agency:logout-dream-profile', async (_event, payload = {}) => {
  try {
    const profileId = String(payload.profileId || '');
    return await logoutDreamProfile(profileId, { reason: 'manual' });
  } catch (error) {
    logElectronError('logout-dream-profile', error);
    return { ok: false, error: error.message || 'Could not logout Dream profile' };
  }
});

app.whenReady().then(async () => {
  try {
    Menu.setApplicationMenu(null);
    mainBaseUrl = await resolveMainBaseUrl();
    createMainWindow(mainBaseUrl);
  } catch (error) {
    logElectronError('startup', error);
    app.quit();
  }
});

app.on('before-quit', event => {
  if (dreamLogoutBeforeQuitDone) return;
  event.preventDefault();
  logElectronInfo('before-quit-dream-logout-start');
  Promise.race([
    logoutKnownDreamProfiles('before-quit'),
    new Promise(resolve => setTimeout(resolve, 12000))
  ]).catch(error => {
    logElectronError('before-quit-dream-logout', error);
  }).finally(() => {
    dreamLogoutBeforeQuitDone = true;
    logElectronInfo('before-quit-dream-logout-finish');
    app.quit();
  });
});

app.on('window-all-closed', () => {
  logElectronInfo('window-all-closed', `main=${Boolean(mainWindow)} dream=${dreamWindows.size} hidden=${hiddenWindows.size}`);
  app.quit();
});

app.on('activate', () => {
  if (!mainWindow && mainBaseUrl) createMainWindow(mainBaseUrl);
});
