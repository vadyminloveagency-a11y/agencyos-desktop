import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const WINDOWS_RUNTIME_DIR = process.platform === 'win32' && process.env.APPDATA
  ? path.join(process.env.APPDATA, 'Electron')
  : '';
const DEFAULT_DATA_DIR = WINDOWS_RUNTIME_DIR && fs.existsSync(path.join(WINDOWS_RUNTIME_DIR, 'data.json'))
  ? WINDOWS_RUNTIME_DIR
  : __dirname;
const DATA_DIR = process.env.DREAM_TEAM_DATA_DIR || DEFAULT_DATA_DIR;
const USING_RUNTIME_DATA_DIR = path.resolve(DATA_DIR) !== path.resolve(__dirname);
const DB_PATH = process.env.DREAM_TEAM_DB_PATH || path.join(DATA_DIR, 'data.json');
const DB_BACKUP_PATH = process.env.DREAM_TEAM_DB_BACKUP_PATH || path.join(DATA_DIR, 'data.backup-before-profile-scope.json');
const PHOTOS_DIR = process.env.DREAM_TEAM_PHOTOS_DIR || (USING_RUNTIME_DATA_DIR ? path.join(DATA_DIR, 'photos') : path.join(__dirname, 'public', 'photos'));
const WORKSPACE_ATTACHMENTS_DIR = process.env.DREAM_TEAM_WORKSPACE_ATTACHMENTS_DIR || (USING_RUNTIME_DATA_DIR ? path.join(DATA_DIR, 'workspace-attachments') : path.join(__dirname, 'public', 'workspace-attachments'));
const ALLOWED_PROFILES_PATH = process.env.DREAM_TEAM_ALLOWED_PROFILES_PATH || path.join(DATA_DIR, 'allowed_profiles.json');
const CREDENTIAL_KEY_PATH = process.env.DREAM_TEAM_CREDENTIAL_KEY_PATH || path.join(DATA_DIR, '.credential-key');
const launchTokens = new Map();
const extensionTokens = new Map();
const dreamSessions = new Map();
const dreamHeartbeatTimers = new Map();
const dreamBrowserSessions = new Map();
let dbCache = null;
let dbCacheMtimeMs = 0;
let dbWriteTimer = null;
let dbWriteInFlight = Promise.resolve();
let dbDirty = false;
const DREAM_LOGIN_URL = 'https://www.dream-singles.com/login';
const DREAM_INBOX_URL = 'https://www.dream-singles.com/members/messaging/inbox';
const DREAM_ACCOUNT_URL = 'https://www.dream-singles.com/members/account/';
const DREAM_HEARTBEAT_INTERVAL_MS = Math.max(15_000, Number(process.env.DREAM_HEARTBEAT_INTERVAL_MS || 45_000) || 45_000);
const DREAM_BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache'
};
const DREAM_XHR_HEADERS = {
  Accept: 'application/json, text/javascript, */*; q=0.01',
  Referer: 'https://www.dream-singles.com/members/',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  'X-Requested-With': 'XMLHttpRequest',
  'sec-ch-ua': '"Google Chrome";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"'
};

const ALLOWED_STATUSES = ['', 'SERIOUS', 'SEXTER', 'OTHER'];
const DEFAULT_SALARY_RATES = [
  { min: 0, max: 1499, percent: 40 },
  { min: 1500, max: 1999, percent: 45 },
  { min: 2000, max: 2999, percent: 47.5 },
  { min: 3000, max: null, percent: 50 }
];

app.use(cors({ origin: true, credentials: true }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  next();
});
app.use(express.json({ limit: '80mb' }));
app.use('/photos', express.static(PHOTOS_DIR, {
  setHeaders(res) {
    res.setHeader('Cache-Control', 'public, max-age=3600');
  }
}));
app.use('/workspace-attachments', express.static(WORKSPACE_ATTACHMENTS_DIR, {
  setHeaders(res) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
}));
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (['.html', '.css', '.js'].includes(ext)) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      return;
    }
    if (['.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico', '.mp3', '.woff', '.woff2'].includes(ext)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return;
    }
    res.setHeader('Cache-Control', 'public, max-age=3600');
  }
}));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'dream-team', time: new Date().toISOString() });
});

function getDefaultProfileId() {
  try {
    const data = JSON.parse(fs.readFileSync(ALLOWED_PROFILES_PATH, 'utf8'));
    const profile = (data.profiles || []).find(item => item.active !== false);
    return profile ? String(profile.id) : '';
  } catch {
    return '';
  }
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function normalizeSalaryRates(rates) {
  const source = Array.isArray(rates) && rates.length ? rates : DEFAULT_SALARY_RATES;
  const normalized = source
    .map(item => ({
      min: Math.max(0, Number(item?.min ?? 0)),
      max: item?.max === null || item?.max === '' || item?.max === undefined ? null : Math.max(0, Number(item.max)),
      percent: Math.max(0, Number(item?.percent ?? 0))
    }))
    .filter(item => Number.isFinite(item.min) && (item.max === null || Number.isFinite(item.max)) && Number.isFinite(item.percent))
    .sort((a, b) => a.min - b.min);
  return normalized.length ? normalized : DEFAULT_SALARY_RATES;
}

function normalizeSalaryFeePercent(value) {
  const number = Number(value ?? 5);
  if (!Number.isFinite(number)) return 5;
  return Math.max(0, Math.min(100, number));
}

function salaryRateForTotal(total, rates) {
  const amount = Number(total || 0);
  const matched = normalizeSalaryRates(rates).find(item => amount >= item.min && (item.max === null || amount <= item.max));
  return matched?.percent ?? 0;
}

function salaryInfoForTotal(total, rates, feePercent = 0) {
  const balance = roundMoney(total);
  const siteFeePercent = normalizeSalaryFeePercent(feePercent);
  const siteFeeAmount = roundMoney(balance * siteFeePercent / 100);
  const salaryBase = roundMoney(balance - siteFeeAmount);
  const percent = salaryRateForTotal(salaryBase, rates);
  return { balance, siteFeePercent, siteFeeAmount, salaryBase, percent, salary: roundMoney(salaryBase * percent / 100) };
}

function emptyDb() {
  return { version: 4, profiles: {}, users: {}, sessions: {}, translator: {}, translationCache: {}, assignmentHistory: {}, agencyBonusLedger: {}, adminPanelCellColors: {}, adminPanelCellComments: {}, salaryRates: DEFAULT_SALARY_RATES, salaryFeePercent: 5 };
}

function currentMonthRegistrationDateIso(now = new Date()) {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1, 12, 0, 0)).toISOString();
}

function normalizeAdminPanelCellColors(value) {
  if (!value || typeof value !== 'object') return {};
  const normalized = {};
  for (const [month, colors] of Object.entries(value)) {
    if (!/^\d{4}-\d{2}$/.test(String(month)) || !colors || typeof colors !== 'object') continue;
    const monthColors = {};
    for (const [key, color] of Object.entries(colors)) {
      const safeKey = String(key || '').trim().slice(0, 180);
      const safeColor = String(color || '').trim().toLowerCase();
      if (!safeKey || (!/^#[0-9a-f]{6}$/.test(safeColor) && safeColor !== 'обуч')) continue;
      monthColors[safeKey] = safeColor;
    }
    normalized[month] = monthColors;
  }
  return normalized;
}

function normalizeAdminPanelCellComments(value) {
  if (!value || typeof value !== 'object') return {};
  const normalized = {};
  for (const [month, comments] of Object.entries(value)) {
    if (!/^\d{4}-\d{2}$/.test(String(month)) || !comments || typeof comments !== 'object') continue;
    const monthComments = {};
    for (const [key, comment] of Object.entries(comments)) {
      const safeKey = String(key || '').trim().slice(0, 180);
      const safeComment = String(comment || '').trim().slice(0, 20000);
      if (!safeKey || !safeComment) continue;
      monthComments[safeKey] = safeComment;
    }
    normalized[month] = monthComments;
  }
  return normalized;
}

function normalizeDb(raw) {
  if (raw?.profiles && typeof raw.profiles === 'object') {
    const profiles = raw.profiles;
    for (const [id, profile] of Object.entries(profiles)) {
      profile.id = id;
      profile.name ||= `Profile ${id}`;
      profile.active = profile.active !== false;
      profile.men ||= {};
      profile.otherMen ||= {};
      profile.workspaceInbox ||= [];
      profile.workspaceMediaGallery ||= [];
    }
    const users = raw.users || {};
    if (!Object.values(users).some(user => user.role === 'director')) {
      const firstAdmin = Object.values(users).find(user => user.username === 'Vados' && user.role === 'admin') ||
        Object.values(users).find(user => user.role === 'admin');
      if (firstAdmin) firstAdmin.role = 'director';
    }
    for (const user of Object.values(users)) {
      if (['admin', 'director'].includes(user.role) && !user.adminStartedAt) {
        user.adminStartedAt = user.createdAt || new Date().toISOString();
      }
      if (user.role === 'director') {
        user.profileIds = [];
        user.profileAssignmentsInitialized = true;
      }
    }
    return {
      ...raw,
      version: 4,
      profiles,
      users,
      sessions: raw.sessions || {},
      translator: raw.translator || {},
      translationCache: raw.translationCache || {},
      assignmentHistory: raw.assignmentHistory || {},
      agencyBonusLedger: raw.agencyBonusLedger || {},
      adminPanelCellColors: normalizeAdminPanelCellColors(raw.adminPanelCellColors),
      adminPanelCellComments: normalizeAdminPanelCellComments(raw.adminPanelCellComments),
      salaryRates: normalizeSalaryRates(raw.salaryRates),
      salaryFeePercent: normalizeSalaryFeePercent(raw.salaryFeePercent)
    };
  }

  const db = emptyDb();
  const profileId = getDefaultProfileId();
  if (profileId && raw?.men && typeof raw.men === 'object') {
    db.profiles[profileId] = {
      id: profileId,
      name: `Profile ${profileId}`,
      active: true,
      men: raw.men,
      createdAt: currentMonthRegistrationDateIso(),
      updatedAt: new Date().toISOString()
    };
  }
  return db;
}

function removeEmptyPlaceholderMen(profile) {
  if (!profile?.men) return 0;
  let removed = 0;
  for (const [id, man] of Object.entries(profile.men)) {
    const name = String(man?.name || '').trim();
    const safePlaceholder =
      /^\d{4,}$/.test(String(id)) &&
      new RegExp(`^Man\\s+${String(id)}$`, 'i').test(name) &&
      Number(man?.lettersCount || 0) <= 0 &&
      !String(man?.note || '').trim() &&
      !String(man?.photoUrl || '').trim() &&
      !String(man?.firstLetterDate || '').trim() &&
      !String(man?.lastLetterDate || '').trim();
    if (!safePlaceholder) continue;
    delete profile.men[id];
    removed++;
  }
  if (removed) profile.updatedAt = new Date().toISOString();
  return removed;
}

function dbFileMtimeMs() {
  try {
    return fs.statSync(DB_PATH).mtimeMs || 0;
  } catch {
    return 0;
  }
}

function readDb() {
  if (dbCache) {
    const fileMtimeMs = dbFileMtimeMs();
    if (!dbDirty && !dbWriteTimer && fileMtimeMs && fileMtimeMs !== dbCacheMtimeMs) {
      try {
        dbCache = normalizeDb(JSON.parse(fs.readFileSync(DB_PATH, 'utf8')));
        dbCacheMtimeMs = fileMtimeMs;
      } catch {}
    }
    return dbCache;
  }
  if (!fs.existsSync(DB_PATH)) {
    dbCache = emptyDb();
    dbCacheMtimeMs = 0;
    return dbCache;
  }

  try {
    dbCache = normalizeDb(JSON.parse(fs.readFileSync(DB_PATH, 'utf8')));
    dbCacheMtimeMs = dbFileMtimeMs();
    return dbCache;
  } catch {
    dbCache = emptyDb();
    dbCacheMtimeMs = 0;
    return dbCache;
  }
}

function writeDbSync(db) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const tempPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tempPath, DB_PATH);
  dbCacheMtimeMs = dbFileMtimeMs();
}

function flushQueuedDb() {
  dbWriteTimer = null;
  if (!dbDirty || !dbCache) return;
  dbDirty = false;
  const snapshot = dbCache;

  dbWriteInFlight = dbWriteInFlight
    .then(async () => {
      await fs.promises.mkdir(path.dirname(DB_PATH), { recursive: true });
      const tempPath = `${DB_PATH}.tmp`;
      await fs.promises.writeFile(tempPath, JSON.stringify(snapshot, null, 2), 'utf8');
      await fs.promises.rename(tempPath, DB_PATH);
      dbCacheMtimeMs = dbFileMtimeMs();
    })
    .catch(error => {
      dbDirty = true;
      console.error('Could not save database:', error);
    })
    .finally(() => {
      if (dbDirty && !dbWriteTimer) dbWriteTimer = setTimeout(flushQueuedDb, 150);
    });
}

function writeDb(db) {
  dbCache = db;
  dbDirty = true;
  if (!dbWriteTimer) dbWriteTimer = setTimeout(flushQueuedDb, 150);
}

function flushDbBeforeExit() {
  if (!dbCache || !dbDirty) return;
  try {
    writeDbSync(dbCache);
    dbDirty = false;
  } catch (error) {
    console.error('Could not save database before exit:', error);
  }
}

process.once('SIGINT', () => {
  flushDbBeforeExit();
  process.exit(0);
});
process.once('SIGTERM', () => {
  flushDbBeforeExit();
  process.exit(0);
});

function cleanWorkspaceAttachments(value) {
  const seen = new Set();
  return (Array.isArray(value) ? value : [])
    .map(item => {
      const url = String(item?.url || item?.src || '').trim();
      const localUrl = String(item?.localUrl || '').trim();
      const dedupeKey = localUrl || url;
      if (!dedupeKey || seen.has(dedupeKey)) return null;
      if (/emoji|smil|emoticon/i.test(url)) return null;
      seen.add(dedupeKey);
      const rawType = String(item?.type || '').toLowerCase();
      const type = rawType === 'video' || /\.(mp4|webm|mov|m4v)(?:[?#]|$)/i.test(url) ? 'video' : 'image';
      return { type, url: localUrl || url, sourceUrl: localUrl ? url : '', localUrl };
    })
    .filter(Boolean)
    .slice(0, 12);
}

function workspaceMessageIdentity(value = '') {
  try {
    const url = new URL(String(value || ''), DREAM_INBOX_URL);
    const match = decodeURIComponent(url.pathname).match(/\/members\/messaging\/read\/([^/?#]+)/i);
    if (match?.[1]) return match[1].toLowerCase();
  } catch {}
  return '';
}

function findSavedWorkspaceLetterByMessageLink(db, profileId = '', rawUrl = '') {
  const identity = workspaceMessageIdentity(rawUrl);
  if (!identity) return null;
  const letters = db?.profiles?.[String(profileId || '')]?.workspaceInbox;
  if (!Array.isArray(letters)) return null;
  return letters.find(letter => workspaceMessageIdentity(letter?.messageLink) === identity && (
    String(letter?.bodyText || '').trim() ||
    (Array.isArray(letter?.conversation) && letter.conversation.length) ||
    (Array.isArray(letter?.attachments) && letter.attachments.length)
  )) || null;
}

function mergeSavedWorkspaceLetterDetails(liveLetter = {}, savedLetter = null) {
  if (!savedLetter) return liveLetter;
  const savedAttachments = cleanWorkspaceAttachments(savedLetter.attachments || []);
  const liveAttachments = cleanWorkspaceAttachments(liveLetter.attachments || []);
  const attachments = liveAttachments.length ? liveAttachments : savedAttachments;
  const bodyText = String(liveLetter.bodyText || '').trim() || String(savedLetter.bodyText || '').trim();
  const conversation = Array.isArray(liveLetter.conversation) && liveLetter.conversation.length
    ? liveLetter.conversation
    : (Array.isArray(savedLetter.conversation) ? savedLetter.conversation : []);
  return {
    ...liveLetter,
    subject: liveLetter.subject || savedLetter.subject || '',
    dateText: liveLetter.dateText || savedLetter.dateText || '',
    bodyText,
    attachments,
    conversation: conversation.length ? conversation : (bodyText ? [{
      direction: savedLetter.direction === 'outgoing' ? 'outgoing' : 'incoming',
      author: savedLetter.direction === 'outgoing' ? 'Me' : (savedLetter.name || ''),
      dateText: liveLetter.dateText || savedLetter.dateText || '',
      text: bodyText
    }] : [])
  };
}

function removeWorkspaceAttachmentCacheForProfile(profileId = '') {
  const cleanProfileId = String(profileId || '').replace(/[^\w-]/g, '_');
  if (!cleanProfileId) return 0;
  const root = path.resolve(WORKSPACE_ATTACHMENTS_DIR);
  const target = path.resolve(root, cleanProfileId);
  if (!target.startsWith(`${root}${path.sep}`) || !fs.existsSync(target)) return 0;
  let removedBytes = 0;
  const stack = [target];
  while (stack.length) {
    const current = stack.pop();
    for (const item of fs.readdirSync(current, { withFileTypes: true })) {
      const itemPath = path.join(current, item.name);
      if (item.isDirectory()) stack.push(itemPath);
      else {
        try { removedBytes += fs.statSync(itemPath).size; } catch {}
      }
    }
  }
  fs.rmSync(target, { recursive: true, force: true });
  return removedBytes;
}

function workspaceAttachmentExtension(attachment, contentType = '') {
  if (attachment.type === 'video') return '.mp4';
  const fromUrl = String(attachment.sourceUrl || attachment.url || '').split('?')[0].match(/\.(jpe?g|png|gif|webp|mp4|webm|mov|m4v)$/i)?.[0];
  if (fromUrl) return fromUrl.toLowerCase().replace('.jpeg', '.jpg');
  if (/png/i.test(contentType)) return '.png';
  if (/gif/i.test(contentType)) return '.gif';
  if (/webp/i.test(contentType)) return '.webp';
  if (/video|mp4/i.test(contentType)) return '.mp4';
  return attachment.type === 'video' ? '.mp4' : '.jpg';
}

function workspaceAttachmentFileName(profileId, letterKey, index, attachment, contentType = '') {
  const hash = crypto
    .createHash('sha1')
    .update(`${letterKey}|${index}|${attachment.sourceUrl || attachment.url || ''}`)
    .digest('hex')
    .slice(0, 20);
  return `${String(profileId || 'profile').replace(/[^\w-]/g, '_')}/${String(letterKey || 'letter').replace(/[^\w-]/g, '_').slice(0, 80)}/${index + 1}-${hash}${workspaceAttachmentExtension(attachment, contentType)}`;
}

async function cacheWorkspaceAttachments(profileId, letterKey, attachments = []) {
  const clean = cleanWorkspaceAttachments(attachments);
  const cached = [];

  for (let index = 0; index < clean.length; index += 1) {
    const attachment = clean[index];
    if (attachment.localUrl && attachment.url.startsWith('/workspace-attachments/')) {
      cached.push(attachment);
      continue;
    }

    const sourceUrl = attachment.sourceUrl || attachment.url;
    try {
      const response = await fetch(sourceUrl);
      const contentType = response.headers.get('content-type') || '';
      const length = Number(response.headers.get('content-length') || 0);
      const maxBytes = attachment.type === 'video' ? 80 * 1024 * 1024 : 12 * 1024 * 1024;
      if (!response.ok || (contentType && !/image|video|octet-stream/i.test(contentType)) || length > maxBytes) {
        cached.push(attachment);
        continue;
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length || bytes.length > maxBytes) {
        cached.push(attachment);
        continue;
      }
      const relativeName = workspaceAttachmentFileName(profileId, letterKey, index, attachment, contentType);
      const absolutePath = path.join(WORKSPACE_ATTACHMENTS_DIR, relativeName);
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      fs.writeFileSync(absolutePath, bytes);
      const localUrl = `/workspace-attachments/${relativeName.replace(/\\/g, '/')}`;
      cached.push({ ...attachment, url: localUrl, localUrl, sourceUrl });
    } catch {
      cached.push(attachment);
    }
  }

  return cached;
}

function migrateDatabase() {
  if (!fs.existsSync(DB_PATH)) return;

  try {
    const raw = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    const db = normalizeDb(raw);
    let changed = raw?.profiles && raw.version === 4 ? false : true;
    if (changed && !fs.existsSync(DB_BACKUP_PATH)) fs.copyFileSync(DB_PATH, DB_BACKUP_PATH);

    const migrations = db.migrations && typeof db.migrations === 'object' ? db.migrations : {};
    const clearTetyanaMigration = 'clear-tetyana-men-2026-06-23';
    if (migrations[clearTetyanaMigration] !== true) {
      const profile = db.profiles?.['17838562'];
      if (profile) {
        const backupPath = path.join(
          path.dirname(DB_PATH),
          `data.backup-before-clear-tetyana-men-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
        );
        fs.copyFileSync(DB_PATH, backupPath);
        profile.men = {};
        profile.otherMen = {};
        profile.workspaceInbox = [];
        profile.updatedAt = new Date().toISOString();

        const attachmentsPath = path.resolve(WORKSPACE_ATTACHMENTS_DIR, '17838562');
        const attachmentsRoot = path.resolve(WORKSPACE_ATTACHMENTS_DIR);
        if (attachmentsPath.startsWith(`${attachmentsRoot}${path.sep}`) && fs.existsSync(attachmentsPath)) {
          fs.rmSync(attachmentsPath, { recursive: true, force: true });
        }

        console.log(`Cleared Tetyana men data. Backup: ${backupPath}`);
      }
      db.migrations = { ...migrations, [clearTetyanaMigration]: true };
      changed = true;
    }

    if (changed) writeDb(db);
  } catch (error) {
    console.error(`Database migration was skipped: ${error.message}`);
  }
}

function getProfileStore(db, profileId, create = false) {
  const id = String(profileId || '');
  if (!db.profiles[id] && create) {
    db.profiles[id] = {
      id,
      name: `Profile ${id}`,
      active: true,
      men: {},
      otherMen: {},
      workspaceInbox: [],
      workspaceMediaGallery: [],
      createdAt: currentMonthRegistrationDateIso(),
      updatedAt: new Date().toISOString()
    };
  }
  return db.profiles[id] || null;
}

function isAllowedProfile(profileId) {
  const db = readDb();
  const profile = db.profiles?.[String(profileId || '')];
  if (profile) return profile.active !== false;

  try {
    const data = JSON.parse(fs.readFileSync(ALLOWED_PROFILES_PATH, 'utf8'));
    return (data.profiles || []).some(profile =>
      String(profile.id) === String(profileId || '') && profile.active !== false
    );
  } catch {
    return false;
  }
}

function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map(part => {
    const index = part.indexOf('=');
    if (index < 0) return ['', ''];
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(([key]) => key));
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}

function passwordMatches(password, user) {
  const expected = Buffer.from(user.passwordHash || '', 'hex');
  const actual = Buffer.from(hashPassword(password, user.passwordSalt).hash, 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function credentialKey() {
  if (process.env.DREAM_TEAM_CREDENTIAL_KEY) {
    return crypto.createHash('sha256').update(process.env.DREAM_TEAM_CREDENTIAL_KEY).digest();
  }
  if (!fs.existsSync(CREDENTIAL_KEY_PATH)) {
    fs.mkdirSync(path.dirname(CREDENTIAL_KEY_PATH), { recursive: true });
    fs.writeFileSync(CREDENTIAL_KEY_PATH, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  }
  return Buffer.from(fs.readFileSync(CREDENTIAL_KEY_PATH, 'utf8').trim(), 'hex');
}

function encryptCredential(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', credentialKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`;
}

function decryptCredential(value) {
  const [iv, tag, encrypted] = String(value || '').split('.');
  if (!iv || !tag || !encrypted) throw new Error('Stored credentials are damaged');
  const decipher = crypto.createDecipheriv('aes-256-gcm', credentialKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString('utf8');
}

function publicUser(user, options = {}) {
  const result = {
    id: user.id,
    name: user.name || user.username,
    username: user.username,
    role: user.role,
    active: user.active !== false,
    createdAt: user.createdAt || '',
    adminStartedAt: user.adminStartedAt || '',
    profileIds: user.profileIds || [],
    managerId: user.managerId || '',
    translator: publicTranslatorSettings(user.translator || {}),
    agency: publicAgencySettings(user.agency || {})
  };
  if (options.includeSecrets) {
    result.sharedPassword = '';
    if (user.sharedPassword) {
      try { result.sharedPassword = decryptCredential(user.sharedPassword); } catch {}
    }
  }
  return result;
}

function normalizeTranslatorProvider(value) {
  const provider = String(value || '').trim().toLowerCase();
  return ['deepl', 'google'].includes(provider) ? provider : 'deepl';
}

function normalizeTranslatorLang(value, fallback = 'RU') {
  const lang = String(value || fallback).trim();
  return /^[a-z]{2}(?:-[a-z]{2})?$/i.test(lang) ? lang.toUpperCase() : fallback;
}

function publicTranslatorSettings(settings = {}) {
  return {
    provider: normalizeTranslatorProvider(settings.provider),
    targetLang: normalizeTranslatorLang(settings.targetLang || 'RU'),
    replyTargetLang: normalizeTranslatorLang(settings.replyTargetLang || 'EN', 'EN'),
    hasApiKey: Boolean(settings.apiKeyEncrypted)
  };
}

function normalizeAgencyBaseUrl(value) {
  const raw = String(value || 'https://agency.dream-singles.com').trim();
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new Error('Agency URL is invalid');
  }
  if (!/(^|\.)dream-singles\.com$/i.test(url.hostname)) {
    throw new Error('Agency URL must be a dream-singles.com address');
  }
  return url.origin;
}

function publicAgencySettings(settings = {}) {
  let baseUrl = 'https://agency.dream-singles.com';
  try {
    baseUrl = normalizeAgencyBaseUrl(settings.baseUrl || baseUrl);
  } catch {}
  return {
    baseUrl,
    username: String(settings.username || ''),
    hasPassword: Boolean(settings.passwordEncrypted),
    updatedAt: settings.updatedAt || ''
  };
}

function updateAgencySettings(user, body = {}) {
  const current = user.agency || {};
  const next = {
    ...current,
    baseUrl: normalizeAgencyBaseUrl(body.baseUrl || current.baseUrl),
    username: String(body.username ?? current.username ?? '').trim(),
    updatedAt: new Date().toISOString()
  };
  const password = String(body.password || '').trim();
  if (password) next.passwordEncrypted = encryptCredential(password);
  if (body.clearPassword === true) delete next.passwordEncrypted;
  user.agency = next;
  return next;
}

function readAgencyCredentials(user) {
  const settings = user?.agency || {};
  const baseUrl = normalizeAgencyBaseUrl(settings.baseUrl);
  const username = String(settings.username || '').trim();
  if (!username || !settings.passwordEncrypted) {
    throw new Error('Agency login and password are not configured');
  }
  return { baseUrl, username, password: decryptCredential(settings.passwordEncrypted) };
}

function directorWithAgencyAccess(db) {
  return Object.values(db.users || {}).find(user => {
    if (user?.role !== 'director' || user.active === false) return false;
    try {
      readAgencyCredentials(user);
      return true;
    } catch {
      return false;
    }
  }) || null;
}

function agencyAccessUserFor(db, ...users) {
  for (const user of users) {
    if (!user || user.active === false) continue;
    try {
      readAgencyCredentials(user);
      return user;
    } catch {}
  }
  const director = directorWithAgencyAccess(db);
  if (director) return director;
  return users.find(Boolean) || null;
}

function splitSetCookieHeader(value) {
  if (!value) return [];
  return String(value).split(/,(?=\s*[^;,=\s]+=[^;,]+)/g).map(item => item.trim()).filter(Boolean);
}

function storeResponseCookies(headers, jar) {
  const cookies = typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()
    : splitSetCookieHeader(headers.get('set-cookie'));
  for (const cookie of cookies) {
    const pair = String(cookie).split(';')[0];
    const index = pair.indexOf('=');
    if (index > 0) jar.set(pair.slice(0, index), pair.slice(index + 1));
  }
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([key, value]) => `${key}=${value}`).join('; ');
}

async function agencyFetch(url, options = {}, jar = new Map(), depth = 0) {
  if (depth > 6) throw new Error('Agency redirected too many times');
  const headers = new Headers(options.headers || {});
  const cookie = cookieHeader(jar);
  if (cookie) headers.set('Cookie', cookie);
  const timeoutMs = Math.max(5000, Math.min(120000, Number(options.timeoutMs || 45000) || 45000));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, { ...options, headers, redirect: 'manual', signal: options.signal || controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Agency request timed out');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  storeResponseCookies(response.headers, jar);
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get('location');
    if (!location) return response;
    const nextUrl = new URL(location, url).toString();
    const nextMethod = response.status === 303 ? 'GET' : options.method;
    return agencyFetch(nextUrl, { ...options, method: nextMethod, body: nextMethod === 'GET' ? undefined : options.body }, jar, depth + 1);
  }
  return response;
}

function readHtmlAttrs(tag) {
  const attrs = {};
  String(tag || '').replace(/([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g, (_, key, doubleValue, singleValue, bareValue) => {
    attrs[key.toLowerCase()] = decodeHtmlEntities(doubleValue ?? singleValue ?? bareValue ?? '');
    return '';
  });
  return attrs;
}

function findForm(html, predicate = () => true) {
  const forms = String(html || '').match(/<form\b[\s\S]*?<\/form>/gi) || [];
  for (const formHtml of forms) {
    const formAttrs = readHtmlAttrs(formHtml.match(/<form\b[^>]*>/i)?.[0] || '');
    const inputs = [];
    formHtml.replace(/<input\b[^>]*>/gi, tag => {
      inputs.push(readHtmlAttrs(tag));
      return tag;
    });
    const buttons = [];
    formHtml.replace(/<button\b[\s\S]*?<\/button>/gi, tag => {
      const attrs = readHtmlAttrs(tag.match(/<button\b[^>]*>/i)?.[0] || '');
      buttons.push({ ...attrs, text: cleanHtmlText(tag) });
      return tag;
    });
    const textareas = [];
    formHtml.replace(/<textarea\b[\s\S]*?<\/textarea>/gi, tag => {
      const attrs = readHtmlAttrs(tag.match(/<textarea\b[^>]*>/i)?.[0] || '');
      const value = decodeHtmlEntities(tag.replace(/^<textarea\b[^>]*>/i, '').replace(/<\/textarea>$/i, ''));
      textareas.push({ ...attrs, value });
      return tag;
    });
    const selects = [];
    formHtml.replace(/<select\b[\s\S]*?<\/select>/gi, tag => {
      const attrs = readHtmlAttrs(tag.match(/<select\b[^>]*>/i)?.[0] || '');
      const selected = tag.match(/<option\b[^>]*selected[^>]*>/i)?.[0] || tag.match(/<option\b[^>]*>/i)?.[0] || '';
      const optionAttrs = readHtmlAttrs(selected);
      selects.push({ ...attrs, value: optionAttrs.value || '' });
      return tag;
    });
    const form = { formAttrs, inputs, buttons, textareas, selects, html: formHtml };
    if (predicate(form)) return form;
  }
  return null;
}

function findLoginForm(html) {
  const form = findForm(html, item => /type=["']?password/i.test(item.html));
  if (!form) return null;
  const { formAttrs, inputs, buttons } = form;
  const passwordInput = inputs.find(input => String(input.type || '').toLowerCase() === 'password');
  if (!passwordInput?.name) return null;
  const usernameInput = inputs.find(input => {
    const type = String(input.type || 'text').toLowerCase();
    const name = String(input.name || '').toLowerCase();
    return ['text', 'email', ''].includes(type) && /(login|user|email|_username)/i.test(name);
  }) || inputs.find(input => ['text', 'email', ''].includes(String(input.type || 'text').toLowerCase()) && input.name);
  if (!usernameInput?.name) return null;
  const submitInput = inputs.find(input => {
    const type = String(input.type || '').toLowerCase();
    const label = String(input.value || input.name || '');
    return ['submit', 'button'].includes(type) && /login\s*now|log\s*in|sign\s*in/i.test(label);
  });
  const submitButton = buttons.find(button => /login\s*now|log\s*in|sign\s*in/i.test(`${button.text || ''} ${button.value || ''}`));
  const rememberInput = inputs.find(input => String(input.type || '').toLowerCase() === 'checkbox' && input.name);
  return {
    formAttrs,
    inputs,
    usernameName: usernameInput.name,
    passwordName: passwordInput.name,
    submitName: submitInput?.name || submitButton?.name || '',
    submitValue: submitInput?.value || submitButton?.value || submitButton?.text || submitInput?.name || 'Login',
    rememberName: rememberInput?.name || '',
    rememberValue: rememberInput?.value || '1'
  };
}

function extractDreamLoginError(html = '') {
  const text = cleanHtmlText(html);
  const match = text.match(/Your username or password combination is not correct\.?/i) ||
    text.match(/(?:invalid|incorrect|wrong)\s+(?:username|login|email|password|credentials)[^.]{0,120}\.?/i) ||
    text.match(/(?:captcha|verification|confirmation|required)[^.]{0,140}\.?/i);
  return match?.[0]?.trim() || '';
}

function cleanHtmlText(value) {
  return decodeHtmlEntities(String(value || '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function parseMoney(value) {
  const match = String(value || '').replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function parseAgencyBonusRows(html) {
  const rows = [];
  const rowMatches = String(html || '').match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
  for (const rowHtml of rowMatches) {
    const cells = [...rowHtml.matchAll(/<t[dh]\b[\s\S]*?<\/t[dh]>/gi)].map(match => cleanHtmlText(match[0]));
    if (cells.length >= 2 && cells.length < 5) {
      const targetText = cells[0];
      const amountText = cells[cells.length - 1];
      if (profileIdFromAgencyTarget(targetText) && /\$|\d+\.\d{2}/.test(amountText)) {
        rows.push({
          type: 'Profile total',
          byWhom: '',
          to: targetText,
          date: '',
          amountText,
          amount: parseMoney(amountText),
          summaryOnly: true,
          cells,
          rawText: cells.join(' ')
        });
      }
      continue;
    }
    if (cells.length < 5) continue;
    const first = cells[0].toLowerCase();
    if (first.includes('type of bonus') || first.includes('filter') || first.includes('required')) continue;
    const amountText = cells[cells.length - 1];
    if (!/\$|\d+\.\d{2}/.test(amountText)) continue;
    rows.push({
      type: cells[0],
      byWhom: cells[1],
      to: cells[2],
      date: cells[3],
      amountText,
      amount: parseMoney(amountText),
      cells,
      rawText: cells.join(' ')
    });
  }
  return rows;
}

function isAgencyGiftRow(row) {
  return /gift|подар/i.test(String(row?.type || ''));
}

function parseAgencyBonusPageLinks(html, currentUrl) {
  const current = new URL(currentUrl);
  const links = [];
  const anchorMatches = String(html || '').matchAll(/<a\b[^>]*href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi);
  for (const match of anchorMatches) {
    const href = decodeHtmlEntities(match[2] || '').trim();
    const label = cleanHtmlText(match[3] || '');
    if (!href || !/^\d+$|^>|next/i.test(label)) continue;
    let url;
    try {
      url = new URL(href, currentUrl);
    } catch {
      continue;
    }
    if (url.origin !== current.origin) continue;
    if (!/\/finances\/bonuses\/?$/.test(url.pathname)) continue;
    links.push(url.toString());
  }
  return [...new Set(links)];
}

function dedupeAgencyBonusRows(rows) {
  const seen = new Set();
  return rows.filter(row => {
    const key = [
      row.type,
      row.byWhom,
      row.to,
      row.date,
      row.amountText
    ].map(value => String(value || '').trim()).join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeAgencyDate(value, fallback = new Date()) {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const dotted = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (dotted) return `${dotted[3]}-${dotted[2]}-${dotted[1]}`;
  const date = raw ? new Date(raw) : fallback;
  if (Number.isNaN(date.getTime())) return fallback.toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function parseAgencyRowDate(value) {
  const raw = String(value || '').trim();
  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (us) {
    const date = new Date(
      Number(us[3]),
      Number(us[1]) - 1,
      Number(us[2]),
      Number(us[4] || 0),
      Number(us[5] || 0),
      Number(us[6] || 0)
    );
    if (!Number.isNaN(date.getTime())) return date;
  }
  const iso = new Date(raw);
  return Number.isNaN(iso.getTime()) ? null : iso;
}

function localDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function dreamBusinessDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const shifted = new Date(date.getTime() - 10 * 60 * 60 * 1000);
  return localDateKey(shifted);
}

function dreamBusinessDayBounds(dateKey) {
  const normalized = normalizeAgencyDate(dateKey, new Date());
  const [year, month, day] = normalized.split('-').map(Number);
  const start = new Date(year, month - 1, day, 10, 0, 0, 0);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { dateKey: normalized, start, end };
}

function profileIdFromAgencyTarget(value) {
  const match = String(value || '').match(/\[(\d+)\]/);
  return match ? match[1] : '';
}

function profileIdFromAgencyRow(row, allowedProfileIds = []) {
  const haystack = [
    row?.to,
    row?.byWhom,
    row?.type,
    row?.rawText,
    ...(Array.isArray(row?.cells) ? row.cells : [])
  ].map(value => String(value || '')).join(' ');
  const allowed = [...new Set((allowedProfileIds || []).map(id => String(id || '').trim()).filter(Boolean))];
  const matchedAllowed = allowed.find(id => haystack.includes(id));
  if (matchedAllowed) return matchedAllowed;
  return profileIdFromAgencyTarget(row?.to) ||
    profileIdFromAgencyTarget(row?.byWhom) ||
    profileIdFromAgencyTarget(row?.type) ||
    profileIdFromAgencyTarget(row?.rawText);
}

function currentAssignedUserForProfile(db, profileId) {
  const id = String(profileId || '');
  const history = Array.isArray(db.assignmentHistory?.[id]) ? db.assignmentHistory[id] : [];
  const active = history.find(item => !item.to);
  if (active?.operatorId && db.users?.[active.operatorId]?.active !== false) {
    return db.users[active.operatorId];
  }
  if (history.length) return null;
  const activeUsers = Object.values(db.users || {}).filter(user =>
    user.active !== false &&
    (user.profileIds || []).includes(id)
  );
  return activeUsers.find(user => user.role === 'operator') ||
    activeUsers.find(user => user.role === 'admin') ||
    null;
}

function activeOperatorForProfile(db, profileId) {
  const assigned = currentAssignedUserForProfile(db, profileId);
  return assigned?.role === 'operator' ? assigned : null;
}

function updateProfileAssignmentHistory(db, profileId, operatorId, actorId, changedAt = new Date(), previousOperatorId = '') {
  const id = String(profileId || '').trim();
  if (!id) return;
  db.assignmentHistory ||= {};
  const history = Array.isArray(db.assignmentHistory[id]) ? db.assignmentHistory[id] : [];
  const now = changedAt.toISOString();
  const active = history.find(item => !item.to);
  const nextOperatorId = String(operatorId || '').trim();
  const previousId = String(previousOperatorId || '').trim();
  if (!active && history.length === 0 && previousId && previousId !== nextOperatorId) {
    history.push({
      profileId: id,
      operatorId: previousId,
      from: '1970-01-01T00:00:00.000Z',
      to: now,
      assignedBy: actorId || '',
      createdAt: now,
      backfilled: true
    });
  }
  if (active && String(active.operatorId || '') === nextOperatorId) {
    db.assignmentHistory[id] = history;
    return;
  }
  if (active) active.to = now;
  if (nextOperatorId) {
    history.push({
      profileId: id,
      operatorId: nextOperatorId,
      from: now,
      to: '',
      assignedBy: actorId || '',
      createdAt: now
    });
  }
  db.assignmentHistory[id] = history;
}

function unassignUserFromProfiles(db, userId, actorId = '') {
  const id = String(userId || '').trim();
  if (!id) return;
  const changedAt = new Date();
  for (const profile of Object.values(db.profiles || {})) {
    if (String(profile?.ownerAdminId || '') === id) {
      delete profile.ownerAdminId;
      profile.updatedAt = changedAt.toISOString();
    }
  }
  for (const [profileId, history] of Object.entries(db.assignmentHistory || {})) {
    if (!Array.isArray(history)) continue;
    const active = history.find(item => !item.to && String(item.operatorId || '') === id);
    if (active) updateProfileAssignmentHistory(db, profileId, '', actorId, changedAt, id);
  }
}

function assignedUserForProfileAt(db, profileId, date) {
  const id = String(profileId || '').trim();
  if (!id) return null;
  const at = date instanceof Date && !Number.isNaN(date.getTime()) ? date.getTime() : Date.now();
  const history = Array.isArray(db.assignmentHistory?.[id]) ? db.assignmentHistory[id] : [];
  const item = history.find(entry => {
    const from = Date.parse(entry.from || 0);
    const to = entry.to ? Date.parse(entry.to) : Infinity;
    return Number.isFinite(from) && at >= from && at < to;
  });
  if (item?.operatorId && db.users?.[item.operatorId]) return db.users[item.operatorId];
  return history.length ? null : currentAssignedUserForProfile(db, id);
}

function isProfileAssignedToUserAt(db, user, profileId, date) {
  const id = String(profileId || '').trim();
  const userId = String(user?.id || '').trim();
  if (!id || !userId) return false;
  const at = date instanceof Date && !Number.isNaN(date.getTime()) ? date.getTime() : NaN;
  if (!Number.isFinite(at)) return false;
  const createdAt = Date.parse(user?.createdAt || 0);
  if (Number.isFinite(createdAt) && at < createdAt) return false;
  const history = Array.isArray(db.assignmentHistory?.[id]) ? db.assignmentHistory[id] : [];
  if (!history.length) {
    const profileCreatedAt = Date.parse(db.profiles?.[id]?.createdAt || 0);
    if (Number.isFinite(profileCreatedAt) && at < profileCreatedAt) return false;
    return (user.profileIds || []).includes(id);
  }
  return history.some(entry => {
    if (String(entry.operatorId || '') !== userId) return false;
    const from = Date.parse(entry.from || 0);
    const to = entry.to ? Date.parse(entry.to) : Infinity;
    return Number.isFinite(from) && at >= from && at < to;
  });
}

function rowVisibleForUserAssignment(db, user, row) {
  if (!['operator', 'admin'].includes(user?.role)) return true;
  const profileId = String(row?.profileId || profileIdFromAgencyTarget(row?.to) || '').trim();
  if (!profileId) return false;
  const rowDate = parseAgencyRowDate(row?.date);
  return isProfileAssignedToUserAt(db, user, profileId, rowDate);
}

function assignmentPeriodForUserProfile(db, user, profileId, from, to) {
  const id = String(profileId || '').trim();
  const userId = String(user?.id || '').trim();
  const fromDate = normalizeAgencyDate(from, new Date());
  const toDate = normalizeAgencyDate(to, new Date());
  const userCreatedDay = user?.createdAt ? String(user.createdAt).slice(0, 10) : '';
  const effectiveFromDate = userCreatedDay && userCreatedDay > fromDate ? userCreatedDay : fromDate;
  const monthFallback = effectiveFromDate || new Date().toISOString().slice(0, 8) + '01';
  const history = Array.isArray(db.assignmentHistory?.[id]) ? db.assignmentHistory[id] : [];
  const entries = history
    .filter(item => String(item.operatorId || '') === userId)
    .map(item => ({
      fromRaw: String(item.from || ''),
      toRaw: item.to ? String(item.to) : '',
      fromDay: String(item.from || '').slice(0, 10),
      toDay: item.to ? String(item.to).slice(0, 10) : ''
    }))
    .filter(item => item.fromDay && (!item.toDay || item.toDay >= fromDate) && item.fromDay <= toDate);
  if (entries.length) {
    const active = entries.some(item => !item.toRaw);
    const starts = entries
      .map(item => (item.fromDay < effectiveFromDate ? effectiveFromDate : item.fromRaw || item.fromDay))
      .sort();
    const ends = entries
      .map(item => {
        if (!item.toRaw) return toDate;
        return item.toDay > toDate ? toDate : item.toRaw;
      })
      .sort();
    return {
      from: starts[0] || monthFallback,
      to: active ? toDate : ends.at(-1) || toDate,
      active
    };
  }
  const currentlyAssigned = (user?.profileIds || []).includes(id);
  if (currentlyAssigned) return { from: monthFallback, to: toDate, active: true };
  return { from: '', to: '', active: false };
}

function assignmentPeriodsForUserProfile(db, user, profileId, from, to) {
  const id = String(profileId || '').trim();
  const userId = String(user?.id || '').trim();
  const fromDate = normalizeAgencyDate(from, new Date());
  const toDate = normalizeAgencyDate(to, new Date());
  const userCreatedDay = user?.createdAt ? String(user.createdAt).slice(0, 10) : '';
  const effectiveFromDate = userCreatedDay && userCreatedDay > fromDate ? userCreatedDay : fromDate;
  const history = Array.isArray(db.assignmentHistory?.[id]) ? db.assignmentHistory[id] : [];
  const entries = history
    .filter(item => String(item.operatorId || '') === userId)
    .map(item => ({
      fromDay: String(item.from || '').slice(0, 10),
      toDay: item.to ? String(item.to).slice(0, 10) : toDate
    }))
    .filter(item => item.fromDay && item.toDay && item.toDay >= fromDate && item.fromDay <= toDate)
    .map(item => ({
      from: item.fromDay < effectiveFromDate ? effectiveFromDate : item.fromDay,
      to: item.toDay > toDate ? toDate : item.toDay
    }))
    .filter(item => item.from <= item.to);
  if (entries.length) return entries;
  if ((user?.profileIds || []).includes(id)) return [{ from: effectiveFromDate, to: toDate }];
  return [];
}

function agencyLedgerDateInRange(row, from, to) {
  const date = parseAgencyRowDate(row.date);
  if (!date) return true;
  const businessDate = dreamBusinessDateKey(date);
  if (from && businessDate < from) return false;
  if (to && businessDate > to) return false;
  return true;
}

function agencyLedgerCalendarDateInRange(row, from, to) {
  const date = parseAgencyRowDate(row.date);
  if (!date) return true;
  const offset = date.getTimezoneOffset() * 60000;
  const calendarDate = new Date(date.getTime() - offset).toISOString().slice(0, 10);
  if (from && calendarDate < from) return false;
  if (to && calendarDate > to) return false;
  return true;
}

function agencyLedgerAccessScope(db, user) {
  if (user.role === 'director') {
    return {
      profileIds: new Set(),
      operatorIds: new Set([user.id])
    };
  }
  if (user.role === 'admin') {
    const profileIds = new Set(user.profileIds || []);
    const operatorIds = new Set([user.id]);
    Object.values(db.users || {}).forEach(item => {
      if (item.role === 'operator' && item.managerId === user.id) operatorIds.add(item.id);
    });
    return { profileIds, operatorIds };
  }
  const historicalProfileIds = Object.entries(db.assignmentHistory || {})
    .filter(([, history]) => Array.isArray(history) && history.some(item => String(item.operatorId || '') === String(user.id || '')))
    .map(([profileId]) => String(profileId));
  return {
    profileIds: new Set([...(user.profileIds || []), ...historicalProfileIds]),
    operatorIds: new Set([user.id])
  };
}

function readAgencyLedgerView(db, user, query = {}) {
  const scope = agencyLedgerAccessScope(db, user);
  const from = normalizeAgencyDate(query.from, new Date('1970-01-01'));
  const to = normalizeAgencyDate(query.to, new Date());
  const useCalendarDate = query.calendarDate === true || String(query.calendarDate || '') === '1';
  const profileFilter = String(query.profileId || '').trim();
  const operatorFilter = String(query.operatorId || '').trim();
  let rows = Object.values(db.agencyBonusLedger || {}).filter(row => {
    const profileAllowed = !row.profileId || scope.profileIds.has(String(row.profileId));
    const operatorAllowed = !row.assignedOperatorId || scope.operatorIds.has(String(row.assignedOperatorId));
    if (!profileAllowed && !operatorAllowed) return false;
    if (!rowVisibleForUserAssignment(db, user, row)) return false;
    if (profileFilter && String(row.profileId || '') !== profileFilter) return false;
    if (operatorFilter && String(row.assignedOperatorId || '') !== operatorFilter) return false;
    return useCalendarDate
      ? agencyLedgerCalendarDateInRange(row, from, to)
      : agencyLedgerDateInRange(row, from, to);
  });
  rows.sort((a, b) => (parseAgencyRowDate(b.date)?.getTime() || 0) - (parseAgencyRowDate(a.date)?.getTime() || 0));
  const totalWithoutGifts = roundMoney(rows
    .filter(row => !isAgencyGiftRow(row))
    .reduce((sum, row) => sum + Number(row.amount || 0), 0));
  const giftsTotal = roundMoney(rows
    .filter(row => isAgencyGiftRow(row))
    .reduce((sum, row) => sum + Number(row.amount || 0), 0));
  const totalsByProfile = {};
  const totalsByOperator = {};
  const dailyByDate = {};
  const monthlyByMonth = {};
  for (const row of rows) {
    const amount = Number(row.amount || 0);
    const profileId = String(row.profileId || '');
    const operatorId = String(row.assignedOperatorId || '');
    const rowDate = parseAgencyRowDate(row.date);
    if (rowDate) {
      const businessDate = dreamBusinessDateKey(rowDate);
      const month = businessDate.slice(0, 7);
      monthlyByMonth[month] ||= { month, total: 0, count: 0 };
      monthlyByMonth[month].total += amount;
      monthlyByMonth[month].count += 1;
    }
    if (profileId) {
      totalsByProfile[profileId] ||= {
        profileId,
        profileName: db.profiles?.[profileId]?.name || profileId,
        photoUrl: db.profiles?.[profileId]?.photoUrl || '',
        total: 0,
        count: 0,
        periodFrom: '',
        periodTo: '',
        active: (user.profileIds || []).includes(profileId)
      };
      totalsByProfile[profileId].total += amount;
      totalsByProfile[profileId].count += 1;
      if (rowDate) {
        const iso = dreamBusinessDateKey(rowDate);
        if (!totalsByProfile[profileId].periodFrom || iso < totalsByProfile[profileId].periodFrom) {
          totalsByProfile[profileId].periodFrom = iso;
        }
        if (!totalsByProfile[profileId].periodTo || iso > totalsByProfile[profileId].periodTo) {
          totalsByProfile[profileId].periodTo = iso;
        }
        dailyByDate[iso] ||= { date: iso, total: 0, count: 0, profiles: {} };
        dailyByDate[iso].total += amount;
        dailyByDate[iso].count += 1;
        dailyByDate[iso].profiles[profileId] ||= {
          profileId,
          profileName: db.profiles?.[profileId]?.name || profileId,
          photoUrl: db.profiles?.[profileId]?.photoUrl || '',
          total: 0,
          count: 0
        };
        dailyByDate[iso].profiles[profileId].total += amount;
        dailyByDate[iso].profiles[profileId].count += 1;
      }
    }
    if (operatorId) {
      const operator = db.users?.[operatorId];
      totalsByOperator[operatorId] ||= { operatorId, operatorName: operator?.name || operator?.username || operatorId, total: 0, count: 0 };
      totalsByOperator[operatorId].total += amount;
      totalsByOperator[operatorId].count += 1;
    }
  }
  for (const profileId of profileIdsAssignedToUserInDateRange(db, user, from, to)) {
    if (profileFilter && String(profileId) !== profileFilter) continue;
    totalsByProfile[profileId] ||= {
      profileId,
      profileName: db.profiles?.[profileId]?.name || profileId,
      photoUrl: db.profiles?.[profileId]?.photoUrl || '',
      total: 0,
      count: 0,
      periodFrom: '',
      periodTo: '',
      active: (user.profileIds || []).includes(profileId)
    };
  }
  const history = Object.entries(db.assignmentHistory || {})
    .filter(([profileId]) => !profileFilter || profileId === profileFilter)
    .flatMap(([profileId, items]) => (Array.isArray(items) ? items : []).map(item => ({
      ...item,
      profileName: db.profiles?.[profileId]?.name || profileId,
      operatorName: db.users?.[item.operatorId]?.name || db.users?.[item.operatorId]?.username || item.operatorId || ''
    })))
    .filter(item => {
      if (operatorFilter && String(item.operatorId || '') !== operatorFilter) return false;
      return scope.profileIds.has(String(item.profileId || '')) || scope.operatorIds.has(String(item.operatorId || ''));
    })
    .sort((a, b) => Date.parse(b.from || 0) - Date.parse(a.from || 0));
  const total = roundMoney(rows.reduce((sum, row) => sum + Number(row.amount || 0), 0));
  const salary = salaryInfoForTotal(totalWithoutGifts, db.salaryRates, db.salaryFeePercent);
  const rowLimit = Math.min(5000, Math.max(1, Number(query.limit || 250) || 250));
  const monthlySalary = Object.values(monthlyByMonth)
    .map(item => {
      const info = salaryInfoForTotal(item.total, db.salaryRates, db.salaryFeePercent);
      return { ...item, total: info.balance, siteFeePercent: info.siteFeePercent, siteFeeAmount: info.siteFeeAmount, salaryBase: info.salaryBase, percent: info.percent, salary: info.salary };
    })
    .sort((a, b) => b.month.localeCompare(a.month));
  return {
    from,
    to,
    rows: rows.slice(0, rowLimit),
    count: rows.length,
    total,
    totalWithoutGifts,
    giftsTotal,
    salaryBase: salary.salaryBase,
    siteFeePercent: salary.siteFeePercent,
    siteFeeAmount: salary.siteFeeAmount,
    salaryPercent: salary.percent,
    salaryTotal: salary.salary,
    salaryRates: normalizeSalaryRates(db.salaryRates),
    monthlySalary,
    totalsByProfile: Object.values(totalsByProfile).map(item => {
      const assignedPeriod = assignmentPeriodForUserProfile(db, user, item.profileId, from, to);
      return {
        ...item,
        periodFrom: assignedPeriod.from || item.periodFrom,
        periodTo: assignedPeriod.to || item.periodTo,
        active: assignedPeriod.active,
        total: roundMoney(item.total)
      };
    }),
    totalsByOperator: Object.values(totalsByOperator).map(item => ({ ...item, total: roundMoney(item.total) })),
    dailyProfiles: Object.values(dailyByDate).map(day => ({
      ...day,
      total: roundMoney(day.total),
      profiles: Object.values(day.profiles).map(item => ({ ...item, total: roundMoney(item.total) }))
    })).sort((a, b) => a.date.localeCompare(b.date)),
    history: history.slice(0, 100)
  };
}

function managedOperatorsForAdminPanel(db, requester) {
  const requesterId = String(requester?.id || '');
  if (!['admin', 'director'].includes(requester?.role)) return [];
  const workerRoles = new Set(['operator', 'admin']);
  const rolePriority = user => {
    if (String(user.id || '') === requesterId) return 0;
    if (user.role === 'admin') return 1;
    return 2;
  };
  return Object.values(db.users || {})
    .filter(user => {
      if (!workerRoles.has(user.role)) return false;
      if (requester.role === 'director') return true;
      return String(user.id || '') === requesterId ||
        (user.role === 'operator' && String(user.managerId || '') === requesterId);
    })
    .sort((a, b) =>
      Number(a.active === false) - Number(b.active === false) ||
      rolePriority(a) - rolePriority(b) ||
      String(a.name || a.username || '').localeCompare(String(b.name || b.username || ''))
    );
}

function operatorVisibleInDateRange(user, fromKey, toKey) {
  if (!user) return false;
  const fromBounds = dreamBusinessDayBounds(fromKey);
  const toBounds = dreamBusinessDayBounds(toKey);
  const rangeStart = fromBounds.start.getTime();
  const rangeEnd = toBounds.end.getTime();
  const startValue = user.role === 'admin'
    ? (user.adminStartedAt || user.createdAt)
    : user.createdAt;
  const createdAt = startValue ? Date.parse(startValue) : NaN;
  const deletedAt = user.active === false && user.deletedAt ? Date.parse(user.deletedAt) : NaN;
  if (Number.isFinite(createdAt) && createdAt >= rangeEnd) return false;
  if (Number.isFinite(deletedAt) && deletedAt < rangeStart) return false;
  return true;
}

function operatorSnapshotForDateRange(user, fromKey, toKey) {
  const toBounds = dreamBusinessDayBounds(toKey);
  const rangeEnd = toBounds.end.getTime();
  const inactive = user?.active === false;
  const deletedAt = inactive && user?.deletedAt ? Date.parse(user.deletedAt) : NaN;
  return {
    ...user,
    active: inactive && Number.isFinite(deletedAt) ? deletedAt >= rangeEnd : user?.active !== false
  };
}

function managedOperatorsForAdminPanelRange(db, requester, fromKey, toKey) {
  const requesterId = String(requester?.id || '');
  const operators = managedOperatorsForAdminPanel(db, requester)
    .filter(operator => operatorVisibleInDateRange(operator, fromKey, toKey))
    .map(operator => operatorSnapshotForDateRange(operator, fromKey, toKey));
  if (
    requesterId &&
    ['admin', 'operator'].includes(requester?.role) &&
    operatorVisibleInDateRange(requester, fromKey, toKey) &&
    !operators.some(operator => String(operator.id || '') === requesterId)
  ) {
    operators.unshift(operatorSnapshotForDateRange(requester, fromKey, toKey));
  }
  return operators.sort((a, b) => {
    const aSelf = String(a.id || '') === requesterId;
    const bSelf = String(b.id || '') === requesterId;
    if (aSelf !== bSelf) return aSelf ? -1 : 1;
    return 0;
  });
}

function profileIdsAssignedToUserInBusinessDay(db, user, dateKey) {
  const userId = String(user?.id || '');
  const { start, end } = dreamBusinessDayBounds(dateKey);
  const ids = new Set();
  for (const [profileId, history] of Object.entries(db.assignmentHistory || {})) {
    if (!Array.isArray(history)) continue;
    for (const item of history) {
      if (String(item.operatorId || '') !== userId) continue;
      const from = Date.parse(item.from || 0);
      const to = item.to ? Date.parse(item.to) : Infinity;
      if (!Number.isFinite(from)) continue;
      if (from < end.getTime() && to > start.getTime()) ids.add(String(profileId));
    }
  }
  for (const profileId of user?.profileIds || []) {
    const lastMoment = new Date(end.getTime() - 1);
    if (db.profiles?.[profileId]?.active === false) continue;
    if (!ids.has(String(profileId)) && isProfileAssignedToUserAt(db, user, profileId, lastMoment)) ids.add(String(profileId));
  }
  return [...ids].filter(id => db.profiles?.[id] || Array.isArray(db.assignmentHistory?.[id]));
}

function monthRangeForDateKey(dateKey) {
  const day = normalizeAgencyDate(dateKey, new Date());
  const [year, month] = day.split('-').map(Number);
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEndDate = new Date(year, month, 0);
  const monthEnd = `${monthEndDate.getFullYear()}-${String(monthEndDate.getMonth() + 1).padStart(2, '0')}-${String(monthEndDate.getDate()).padStart(2, '0')}`;
  return { month: `${year}-${String(month).padStart(2, '0')}`, monthStart, monthEnd, daysInMonth: monthEndDate.getDate() };
}

function dateKeysInRange(fromKey, toKey) {
  const from = normalizeAgencyDate(fromKey, new Date());
  const to = normalizeAgencyDate(toKey, new Date());
  const [fromYear, fromMonth, fromDay] = from.split('-').map(Number);
  const cursor = new Date(fromYear, fromMonth - 1, fromDay);
  const days = [];
  while (localDateKey(cursor) <= to) {
    days.push(localDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function profileIdsAssignedToUserInDateRange(db, user, fromKey, toKey) {
  const userId = String(user?.id || '');
  const fromBounds = dreamBusinessDayBounds(fromKey);
  const toBounds = dreamBusinessDayBounds(toKey);
  const start = fromBounds.start.getTime();
  const end = toBounds.end.getTime();
  const ids = new Set();
  for (const [profileId, history] of Object.entries(db.assignmentHistory || {})) {
    if (!Array.isArray(history)) continue;
    for (const item of history) {
      if (String(item.operatorId || '') !== userId) continue;
      const from = Date.parse(item.from || 0);
      const to = item.to ? Date.parse(item.to) : Infinity;
      if (!Number.isFinite(from)) continue;
      if (from < end && to > start) ids.add(String(profileId));
    }
  }
  for (const profileId of user?.profileIds || []) {
    if (db.profiles?.[profileId]?.active === false) continue;
    if (!ids.has(String(profileId)) && isProfileAssignedToUserAt(db, user, profileId, new Date(end - 1))) {
      ids.add(String(profileId));
    }
  }
  return [...ids].filter(id => db.profiles?.[id] || Array.isArray(db.assignmentHistory?.[id]));
}

function buildAdminOperatorMonthTable(db, operators, dateKey, requester) {
  const { month, monthStart, monthEnd, daysInMonth } = monthRangeForDateKey(dateKey);
  const dayKeys = Array.from({ length: daysInMonth }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`);
  const operatorMap = new Map(operators.map(operator => [String(operator.id), operator]));
  const rowsByKey = new Map();
  const operatorTotals = {};
  const giftsDaily = Object.fromEntries(dayKeys.map(day => [day, 0]));
  let giftsTotal = 0;

  function ensureRow(operator, profileId) {
    const key = `${operator.id}|${profileId}`;
    if (!rowsByKey.has(key)) {
      const profile = db.profiles?.[profileId] || {};
      const period = assignmentPeriodForUserProfile(db, operator, profileId, monthStart, monthEnd);
      const periods = assignmentPeriodsForUserProfile(db, operator, profileId, monthStart, monthEnd);
      rowsByKey.set(key, {
        key,
        startedAt: period.from || '',
        source: '',
        operatorId: String(operator.id),
        operatorName: operator.name || operator.username || operator.id,
        username: operator.username || '',
        operatorActive: operator.active !== false,
        operatorDeletedAt: operator.deletedAt || '',
        operatorCreatedAt: operator.createdAt || '',
        operatorSource: operator.adminPanelSource || '',
        workTime: '',
        profileId,
        profileName: profile.name || profileId,
        photoUrl: profile.photoUrl || '',
        periodFrom: period.from || '',
        periodTo: period.to || '',
        assignmentPeriods: periods,
        active: !!period.active,
        firedAt: period.active ? '' : period.to || '',
        operatorTotal: 0,
        advance: 0,
        total: 0,
        daily: Object.fromEntries(dayKeys.map(day => [day, 0]))
      });
    }
    return rowsByKey.get(key);
  }

  for (const operator of operators) {
    for (const profileId of profileIdsAssignedToUserInDateRange(db, operator, monthStart, monthEnd)) {
      ensureRow(operator, profileId);
    }
    for (const profileId of operator.profileIds || []) {
      if (db.profiles?.[profileId]?.active === false) continue;
      const monthEndMoment = new Date(dreamBusinessDayBounds(monthEnd).end.getTime() - 1);
      if (!isProfileAssignedToUserAt(db, operator, profileId, monthEndMoment)) continue;
      ensureRow(operator, String(profileId));
    }
  }

  for (const row of Object.values(db.agencyBonusLedger || {})) {
    if (row.summaryOnly) continue;
    const rowDate = parseAgencyRowDate(row.date);
    if (!rowDate) continue;
    const businessDate = dreamBusinessDateKey(rowDate);
    if (!businessDate.startsWith(month)) continue;
    const profileId = String(row.profileId || profileIdFromAgencyTarget(row.to) || '');
    if (!profileId) continue;
    const assigned = assignedUserForProfileAt(db, profileId, rowDate);
    let operator = assigned?.id ? operatorMap.get(String(assigned.id)) : null;
    const amount = Number(row.amount || 0);
    if (isAgencyGiftRow(row)) {
      if (!operator) continue;
      giftsDaily[businessDate] = roundMoney(Number(giftsDaily[businessDate] || 0) + amount);
      giftsTotal = roundMoney(Number(giftsTotal || 0) + amount);
      continue;
    }
    if (!operator) continue;
    const tableRow = ensureRow(operator, profileId);
    tableRow.daily[businessDate] = roundMoney(Number(tableRow.daily[businessDate] || 0) + amount);
    tableRow.total = roundMoney(Number(tableRow.total || 0) + amount);
    operatorTotals[String(operator.id)] = roundMoney(Number(operatorTotals[String(operator.id)] || 0) + amount);
  }

  for (const row of Object.values(db.agencyBonusLedger || {})) {
    if (!row.summaryOnly || String(row.summaryMonth || '') !== month) continue;
    const profileId = String(row.profileId || profileIdFromAgencyTarget(row.to) || '');
    if (!profileId) continue;
    const assigned = assignedUserForProfileAt(db, profileId, new Date(dreamBusinessDayBounds(monthEnd).end.getTime() - 1));
    const operator = assigned?.id ? operatorMap.get(String(assigned.id)) : null;
    if (!operator || isAgencyGiftRow(row)) continue;
    const amount = roundMoney(Number(row.amount || 0));
    const tableRow = ensureRow(operator, profileId);
    const oldTotal = Number(tableRow.total || 0);
    if (amount > oldTotal) {
      tableRow.total = amount;
      operatorTotals[String(operator.id)] = roundMoney(Number(operatorTotals[String(operator.id)] || 0) + (amount - oldTotal));
    }
  }

  const rows = [...rowsByKey.values()]
    .map(row => ({ ...row, operatorTotal: operatorTotals[row.operatorId] || 0 }))
    .sort((a, b) =>
      b.operatorTotal - a.operatorTotal ||
      String(a.operatorName).localeCompare(String(b.operatorName)) ||
      String(a.profileName).localeCompare(String(b.profileName))
    );

  return { month, monthStart, monthEnd, daysInMonth, dayKeys, rows, giftsDaily, giftsTotal };
}

function readAdminOperatorBalancesForDay(db, requester, dateKey, refreshErrors = {}) {
  const day = normalizeAgencyDate(dateKey, new Date());
  const { monthStart, monthEnd, month } = monthRangeForDateKey(day);
  const operators = managedOperatorsForAdminPanelRange(db, requester, monthStart, monthEnd);
  const operatorIds = new Set(operators.map(item => String(item.id)));
  const summaries = new Map(operators.map(operator => [String(operator.id), {
    operatorId: String(operator.id),
    operatorName: operator.name || operator.username || operator.id,
    username: operator.username || '',
    operatorActive: operator.active !== false,
    operatorDeletedAt: operator.deletedAt || '',
    operatorCreatedAt: operator.createdAt || '',
    total: 0,
    count: 0,
    profileCount: 0,
    profiles: [],
    error: refreshErrors[String(operator.id)] || ''
  }]));
  for (const operator of operators) {
    const profileIds = profileIdsAssignedToUserInDateRange(db, operator, monthStart, monthEnd);
    const summary = summaries.get(String(operator.id));
    summary.profileCount = profileIds.length;
    summary.profiles = profileIds.map(profileId => {
      const period = assignmentPeriodForUserProfile(db, operator, profileId, monthStart, monthEnd);
      return {
        profileId,
        profileName: db.profiles?.[profileId]?.name || profileId,
        photoUrl: db.profiles?.[profileId]?.photoUrl || '',
        assignmentPeriods: assignmentPeriodsForUserProfile(db, operator, profileId, monthStart, monthEnd),
        active: period.active,
        total: 0,
        count: 0
      };
    });
  }

  for (const row of Object.values(db.agencyBonusLedger || {})) {
    const rowDate = parseAgencyRowDate(row.date);
    if (!rowDate || dreamBusinessDateKey(rowDate) !== day) continue;
    const profileId = String(row.profileId || profileIdFromAgencyTarget(row.to) || '');
    const assigned = assignedUserForProfileAt(db, profileId, rowDate);
    let operatorId = String(assigned?.id || row.assignedOperatorId || '');
    let summary = operatorIds.has(operatorId) ? summaries.get(operatorId) : null;
    if (!summary) continue;
    const amount = Number(row.amount || 0);
    if (isAgencyGiftRow(row)) continue;
    summary.total += amount;
    summary.count += 1;
    let profileSummary = summary.profiles.find(item => item.profileId === profileId);
    if (!profileSummary && profileId) {
      profileSummary = {
        profileId,
        profileName: db.profiles?.[profileId]?.name || profileId,
        photoUrl: db.profiles?.[profileId]?.photoUrl || '',
        total: 0,
        count: 0
      };
      summary.profiles.push(profileSummary);
      summary.profileCount = summary.profiles.length;
    }
    if (profileSummary) {
      profileSummary.total += amount;
      profileSummary.count += 1;
    }
  }

  const resultOperators = [...summaries.values()].map(operator => ({
    ...operator,
    total: roundMoney(operator.total),
    profiles: operator.profiles
      .map(profile => ({ ...profile, total: roundMoney(profile.total) }))
      .sort((a, b) => b.total - a.total || String(a.profileName).localeCompare(String(b.profileName)))
  })).sort((a, b) => b.total - a.total || String(a.operatorName).localeCompare(String(b.operatorName)));

  return {
    date: day,
    generatedAt: new Date().toISOString(),
    selfOperatorId: String(requester?.id || ''),
    total: roundMoney(resultOperators.reduce((sum, item) => sum + Number(item.total || 0), 0)),
    count: resultOperators.reduce((sum, item) => sum + Number(item.count || 0), 0),
    operators: resultOperators,
    table: buildAdminOperatorMonthTable(db, operators, day, requester),
    cellColors: normalizeAdminPanelCellColors(db.adminPanelCellColors)[month] || {},
    cellComments: normalizeAdminPanelCellComments(db.adminPanelCellComments)[month] || {}
  };
}

async function refreshAdminOperatorBalancesForDay(db, requester, dateKey) {
  const day = normalizeAgencyDate(dateKey, new Date());
  const fetchTo = localDateKey(dreamBusinessDayBounds(day).end);
  const errors = {};
  const agencyUser = agencyAccessUserFor(db, requester);
  const profileIds = profilesForAdministration(db, requester).map(profile => String(profile.id || '')).filter(Boolean);
  if (profileIds.length) {
    try {
      for (const profileId of profileIds) {
        await fetchAgencyBonuses(agencyUser, {
          db,
          viewerUser: requester,
          from: day,
          to: fetchTo,
          profileId,
          allowedProfileIds: [profileId],
          groupBy: '0',
          maxBonusPages: 20,
          skipAssignmentFilter: true
        });
      }
    } catch (error) {
      errors[String(requester.id || '')] = error.message || 'Could not refresh profile balance';
    }
  }
  return readAdminOperatorBalancesForDay(db, requester, day, errors);
}

async function refreshAdminOperatorBalancesForMonth(db, requester, dateKey) {
  const day = normalizeAgencyDate(dateKey, new Date());
  const { monthStart, monthEnd } = monthRangeForDateKey(day);
  const fetchTo = localDateKey(dreamBusinessDayBounds(monthEnd).end);
  const errors = {};
  const agencyUser = agencyAccessUserFor(db, requester);
  const profileIds = profilesForAdministration(db, requester).map(profile => String(profile.id || '')).filter(Boolean);
  if (profileIds.length) {
    try {
      for (const profileId of profileIds) {
        await fetchAgencyBonuses(agencyUser, {
          db,
          viewerUser: requester,
          from: monthStart,
          to: fetchTo,
          profileId,
          allowedProfileIds: [profileId],
          groupBy: '0',
          skipAssignmentFilter: true
        });
      }
    } catch (error) {
      errors[String(requester.id || '')] = error.message || 'Could not refresh profile balance';
    }
  }
  return readAdminOperatorBalancesForDay(db, requester, day, errors);
}

function agencyBonusLedgerKey(row) {
  return crypto.createHash('sha1')
    .update([
      row.profileId,
      row.type,
      row.byWhom,
      row.to,
      row.date,
      row.amountText,
      row.summaryFrom,
      row.summaryTo
    ].map(value => String(value || '').trim()).join('|'))
    .digest('hex');
}

function persistAgencyBonusRows(db, rows = [], context = {}) {
  db.agencyBonusLedger ||= {};
  const now = new Date().toISOString();
  return rows.map(row => {
    const profileId = String(row.profileId || context.profileId || profileIdFromAgencyTarget(row.to) || '').trim();
    const rowDate = parseAgencyRowDate(row.date);
    const summaryDate = row.summaryTo ? new Date(dreamBusinessDayBounds(String(row.summaryTo).slice(0, 10)).end.getTime() - 1) : null;
    const assignedUser = assignedUserForProfileAt(db, profileId, rowDate || summaryDate || new Date());
    const enriched = {
      ...row,
      profileId,
      assignedOperatorId: assignedUser?.id || '',
      assignedOperatorName: assignedUser?.name || assignedUser?.username || '',
      fetchedAt: now
    };
    const key = agencyBonusLedgerKey(enriched);
    db.agencyBonusLedger[key] = {
      ...(db.agencyBonusLedger[key] || {}),
      ...enriched,
      id: key,
      firstFetchedAt: db.agencyBonusLedger[key]?.firstFetchedAt || now,
      lastFetchedAt: now
    };
    return enriched;
  });
}

async function openAgencyBonusesPage(user) {
  const credentials = readAgencyCredentials(user);
  const jar = new Map();
  const bonusesUrl = new URL('/finances/bonuses', credentials.baseUrl).toString();
  let response = await agencyFetch(bonusesUrl, { method: 'GET' }, jar);
  let html = await response.text();
  if (!/type=["']?password/i.test(html) && /Bonuses|Filter Results|Type of Bonus/i.test(html)) {
    return { credentials, jar, response, html };
  }

  const loginForm = findLoginForm(html);
  if (!loginForm) throw new Error('Agency login form was not found');
  const loginUrl = new URL(loginForm.formAttrs.action || response.url || '/', credentials.baseUrl).toString();
  const form = new URLSearchParams();
  for (const input of loginForm.inputs) {
    if (!input.name) continue;
    form.set(input.name, input.value || '');
  }
  form.set(loginForm.usernameName, credentials.username);
  form.set(loginForm.passwordName, credentials.password);
  if (loginForm.rememberName) form.set(loginForm.rememberName, loginForm.rememberValue || '1');
  if (loginForm.submitName) form.set(loginForm.submitName, loginForm.submitValue || 'Login');
  response = await agencyFetch(loginUrl, {
    method: String(loginForm.formAttrs.method || 'POST').toUpperCase(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString()
  }, jar);
  html = await response.text();
  response = await agencyFetch(bonusesUrl, { method: 'GET' }, jar);
  html = await response.text();
  if (/type=["']?password/i.test(html)) throw new Error('Agency login failed. Check login and password');
  if (!/Bonuses|Filter Results|Type of Bonus/i.test(html)) throw new Error('Agency opened, but bonuses page was not recognized');
  return { credentials, jar, response, html };
}

async function verifyAgencyAccess(user) {
  const session = await openAgencyBonusesPage(user);
  return { ok: true, baseUrl: session.credentials.baseUrl, authenticated: true };
}

function formBodyFromInputs(inputs = [], overrides = {}) {
  const body = new URLSearchParams();
  for (const input of inputs) {
    const name = String(input.name || '').trim();
    if (!name) continue;
    const type = String(input.type || 'text').toLowerCase();
    if (['submit', 'button', 'image', 'file'].includes(type)) continue;
    if ((type === 'checkbox' || type === 'radio') && input.checked === undefined) continue;
    body.append(name, String(input.value || ''));
  }
  for (const [key, value] of Object.entries(overrides)) {
    body.set(key, String(value ?? ''));
  }
  return body;
}

function dreamPageLooksLoggedOut(html = '', url = '') {
  return /\/login(?:[/?#]|$)|sign[-_]?in|auth/i.test(String(url || '')) ||
    (/<input[^>]+type=["']?password/i.test(String(html || '')) && /login|sign in|log in|password/i.test(String(html || '')));
}

function dreamLogoutReason(html = '', url = '') {
  const page = String(html || '');
  const target = String(url || '');
  if (/\/login(?:[/?#]|$)/i.test(target)) return 'redirected-to-login';
  if (/sign[-_]?in|auth/i.test(target)) return 'auth-url';
  if (/captcha|recaptcha|verify|verification|confirm|security check/i.test(page)) return 'verification-required';
  if (/<input[^>]+type=["']?password/i.test(page) && /login|sign in|log in|password/i.test(page)) return 'login-form-visible';
  return 'unknown';
}

function bestDreamPhotoUrl(html = '', profileId = '') {
  const urls = [];
  String(html || '').replace(/\b(?:src|data-src|data-original|content)=["']([^"']+)["']/gi, (_, url) => {
    urls.push(decodeHtmlEntities(url));
    return '';
  });
  return urls
    .map(url => {
      try { return new URL(url, 'https://www.dream-singles.com/').href; } catch { return ''; }
    })
    .filter(Boolean)
    .filter(url => /profile-photos-cdn|photo|avatar|profile|image|\.jpe?g|\.png|\.webp/i.test(url))
    .sort((a, b) => {
      const aScore = (profileId && a.includes(profileId) ? 1000 : 0) + (/profile-photos-cdn/i.test(a) ? 100 : 0);
      const bScore = (profileId && b.includes(profileId) ? 1000 : 0) + (/profile-photos-cdn/i.test(b) ? 100 : 0);
      return bScore - aScore;
    })[0] || '';
}

function extractDreamProfileIdentity(...htmlParts) {
  const html = htmlParts.filter(Boolean).join('\n');
  const text = cleanHtmlText(html);
  const profileId =
    html.match(/\bprofileId["']?\s*[:=]\s*["']?(\d{5,})/i)?.[1] ||
    html.match(/\b(?:lady|profile|member|woman|girl)[^<>{}"']{0,40}\bID\s*:?\s*(\d{5,})/i)?.[1] ||
    text.match(/\bID\s*:?\s*(\d{5,})\b/i)?.[1] ||
    html.match(/profile-photos-cdn\.dream-singles\.com\/im(\d{5,})/i)?.[1] ||
    '';
  const decode = value => decodeHtmlEntities(String(value || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
  const profileHeaderPattern = profileId
    ? new RegExp(`^([A-Za-zА-Яа-яЁё'’ -]{2,40}),\\s*ID\\s*:?\\s*${profileId}\\b`, 'i')
    : null;
  const lines = String(html || '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<\/?(?:div|p|h1|h2|h3|header|section|li|br)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .split(/\r?\n/)
    .map(decode)
    .filter(Boolean);
  const profileHeaderName = profileHeaderPattern
    ? lines.find(line => profileHeaderPattern.test(line))?.match(profileHeaderPattern)?.[1] || ''
    : '';
  const ogTitleName = decode(
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)?.[1] ||
    ''
  );
  const titleName = decodeHtmlEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '')
    .replace(/\s*[-|].*$/, '')
    .trim();
  const headingName = cleanHtmlText(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '');
  const explicitName =
    profileHeaderName ||
    text.match(/\bName\s*:?\s*([A-Za-zА-Яа-яЁё'’ -]{2,40})\b/i)?.[1] ||
    (profileId ? text.match(new RegExp(`([A-Za-zА-Яа-яЁё'’ -]{2,40})\\s*(?:,|-|·)?\\s*(?:ID\\s*:?\\s*)?${profileId}\\b`, 'i'))?.[1] : '') ||
    '';
  const cleanName = value => {
    const name = String(value || '').replace(/\s+/g, ' ').trim();
    if (!name) return '';
    if (/account options|account settings|create a name|new folder|folder create|inbox|messaging|dream singles|login|sign in/i.test(name)) return '';
    if (/^\d+$/.test(name)) return '';
    if (name.length > 40) return '';
    return name;
  };
  const name = cleanName(explicitName) || cleanName(ogTitleName) || cleanName(headingName) || cleanName(titleName);
  const photoUrl = bestDreamPhotoUrl(html, profileId);
  return { profileId, name, photoUrl };
}

async function downloadDreamPhotoDataUrl(photoUrl = '') {
  if (!photoUrl || !/^https:\/\/(?:[^/]+\.)?dream-singles\.com\//i.test(photoUrl)) return '';
  try {
    const response = await fetch(photoUrl);
    const contentType = response.headers.get('content-type') || '';
    const length = Number(response.headers.get('content-length') || 0);
    if (!response.ok || !/^image\/(jpeg|jpg|png|webp)/i.test(contentType) || length > 2 * 1024 * 1024) return '';
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 2 * 1024 * 1024) return '';
    const mime = contentType.match(/^image\/(?:jpeg|jpg|png|webp)/i)?.[0] || 'image/jpeg';
    return `data:${mime};base64,${bytes.toString('base64')}`;
  } catch {
    return '';
  }
}

async function resolveDreamSinglesAccess(login, password, options = {}) {
  const username = String(login || '').trim();
  const secret = String(password || '');
  if (!username || !secret) throw new Error('Enter Dream Singles login and password');

  const jar = new Map();
  let response = await agencyFetch(DREAM_LOGIN_URL, {
    method: 'GET',
    headers: DREAM_BROWSER_HEADERS
  }, jar);
  let html = await response.text();
  const loginForm = findLoginForm(html);
  if (!loginForm) throw new Error('Dream Singles login form was not found');

  const loginUrl = new URL(loginForm.formAttrs.action || response.url || DREAM_LOGIN_URL, DREAM_LOGIN_URL).toString();
  const method = String(loginForm.formAttrs.method || 'POST').toUpperCase();
  const body = formBodyFromInputs(loginForm.inputs, {
    [loginForm.usernameName]: username,
    [loginForm.passwordName]: secret
  });
  if (loginForm.rememberName) body.set(loginForm.rememberName, loginForm.rememberValue || '1');
  if (loginForm.submitName) body.set(loginForm.submitName, loginForm.submitValue || 'Login');
  const submitUrl = new URL(loginUrl);
  let submitBody = body;
  if (method === 'GET') {
    for (const [key, value] of body.entries()) submitUrl.searchParams.set(key, value);
    submitBody = undefined;
  }
  response = await agencyFetch(submitUrl.toString(), {
    method,
    headers: method === 'GET'
      ? { ...DREAM_BROWSER_HEADERS, Referer: response.url || DREAM_LOGIN_URL }
      : {
          ...DREAM_BROWSER_HEADERS,
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: new URL(loginUrl).origin,
          Referer: response.url || DREAM_LOGIN_URL
        },
    body: submitBody
  }, jar);
  if (!response.ok) throw new Error(`Dream Singles login failed (${response.status})`);
  html = await response.text();
  const loginError = extractDreamLoginError(html);
  if (loginError || dreamPageLooksLoggedOut(html, response.url)) {
    throw new Error(loginError || `Dream Singles rejected the login or requires confirmation (${dreamLogoutReason(html, response.url)})`);
  }

  response = await agencyFetch(DREAM_INBOX_URL, {
    method: 'GET',
    headers: { ...DREAM_BROWSER_HEADERS, Referer: DREAM_LOGIN_URL }
  }, jar);
  html = await response.text();
  if (!response.ok || dreamPageLooksLoggedOut(html, response.url)) {
    const reason = dreamLogoutReason(html, response.url);
    console.warn(`[dream-login] inbox rejected: status=${response.status} url=${response.url} cookies=${jar.size} reason=${reason}`);
    throw new Error(`Dream Singles rejected the login or requires confirmation (${reason})`);
  }

  let accountHtml = '';
  try {
    const accountResponse = await agencyFetch(DREAM_ACCOUNT_URL, { method: 'GET' }, jar);
    accountHtml = await accountResponse.text();
  } catch {}
  let identity = extractDreamProfileIdentity(html, accountHtml);
  let profileHtml = '';
  if (identity.profileId) {
    try {
      const profileResponse = await agencyFetch(`https://www.dream-singles.com/${encodeURIComponent(identity.profileId)}.html`, {
        method: 'GET'
      }, jar);
      profileHtml = await profileResponse.text();
      if (profileResponse.ok && !dreamPageLooksLoggedOut(profileHtml, profileResponse.url)) {
        const profileIdentity = extractDreamProfileIdentity(profileHtml);
        identity = {
          profileId: profileIdentity.profileId || identity.profileId,
          name: profileIdentity.name || identity.name,
          photoUrl: profileIdentity.photoUrl || identity.photoUrl
        };
      }
    } catch {}
  }
  const photoData = await downloadDreamPhotoDataUrl(identity.photoUrl);
  const dreamCookies = options.includeCookies
    ? [...jar.entries()].map(([name, value]) => ({ name, value }))
    : undefined;
  return { ok: true, ...identity, photoData, dreamCookies, jar: options.includeJar ? jar : undefined };
}

function dreamSessionStatus(profileId) {
  const session = dreamSessions.get(String(profileId || ''));
  if (!session) return { connected: false };
  return {
    connected: true,
    profileId: session.profileId,
    authenticatedAt: session.authenticatedAt,
    lastUsedAt: session.lastUsedAt,
    heartbeatActive: dreamHeartbeatTimers.has(String(profileId || '')),
    lastHeartbeatAt: session.lastHeartbeatAt || '',
    lastHeartbeatError: session.lastHeartbeatError || '',
    name: session.identity?.name || '',
    photoUrl: session.identity?.photoUrl || ''
  };
}

async function dreamHeartbeatTick(profileId) {
  const id = String(profileId || '');
  const session = dreamSessions.get(id);
  if (!session) return;
  try {
    const db = readDb();
    const profile = db.profiles?.[id];
    const configured = normalizeDreamHeartbeatConfig(profile?.serverDreamHeartbeat);
    const discoveredActivity = configured.length ? [] : await discoverDreamActivityTrackingRequests(id, session, profile).catch(() => []);
    const requests = configured.length ? configured : [
      ...discoveredActivity,
      { url: 'https://www.dream-singles.com/members/messaging/monitorMessages?__tcAction=getNewMessages', method: 'GET', headers: DREAM_XHR_HEADERS },
      { url: 'https://www.dream-singles.com/members/online/getMaleProfileForChatLikes', method: 'GET', headers: DREAM_XHR_HEADERS },
      { url: 'https://www.dream-singles.com/members/online/getMenForHomeFlirts', method: 'GET', headers: DREAM_XHR_HEADERS },
      { url: DREAM_ACCOUNT_URL, method: 'GET' },
      { url: DREAM_INBOX_URL, method: 'GET' },
      { url: 'https://www.dream-singles.com/members/account/', method: 'GET' },
      { url: 'https://www.dream-singles.com/members/messaging/inbox', method: 'GET' }
    ];
    const errors = [];
    let okCount = 0;
    for (const request of requests) {
      try {
        const response = await agencyFetch(request.url, {
          method: request.method || 'GET',
          headers: { ...DREAM_BROWSER_HEADERS, Referer: DREAM_INBOX_URL, ...(request.headers || {}) },
          body: request.body || undefined
        }, session.jar);
        const html = await response.text().catch(() => '');
        if (!response.ok || dreamPageLooksLoggedOut(html, response.url)) {
          errors.push(`${request.url}: ${response.status || 'no status'}`);
          continue;
        }
        okCount += 1;
      } catch (error) {
        errors.push(`${request.url}: ${error.message || 'failed'}`);
      }
    }
    if (!okCount) throw new Error(errors[0] || 'heartbeat rejected');
    session.lastHeartbeatAt = new Date().toISOString();
    session.lastHeartbeatError = errors.slice(0, 2).join(' | ');
    session.lastUsedAt = session.lastHeartbeatAt;
  } catch (error) {
    session.lastHeartbeatError = error.message || 'Heartbeat failed';
    session.lastHeartbeatAt = new Date().toISOString();
    console.warn(`[dream-heartbeat] ${id}: ${session.lastHeartbeatError}`);
  }
}

async function discoverDreamActivityTrackingRequests(profileId, session, profile = {}) {
  const candidates = Object.values(profile?.men || {})
    .map(man => String(man?.profileLink || '').trim())
    .filter(Boolean)
    .slice(0, 5);
  if (!candidates.length) {
    candidates.push(
      DREAM_ACCOUNT_URL,
      DREAM_INBOX_URL
    );
  }

  const requests = [];
  const seen = new Set();
  for (const candidate of candidates) {
    let pageUrl;
    try {
      pageUrl = new URL(candidate, 'https://www.dream-singles.com/').toString();
    } catch {
      continue;
    }
    if (!/(^|\.)dream-singles\.com$/i.test(new URL(pageUrl).hostname)) continue;
    const response = await agencyFetch(pageUrl, {
      method: 'GET',
      headers: { ...DREAM_BROWSER_HEADERS, Referer: DREAM_INBOX_URL }
    }, session.jar);
    const html = await response.text().catch(() => '');
    if (!response.ok || dreamPageLooksLoggedOut(html, response.url)) continue;
    const sourceUrl = response.url || pageUrl;
    const patterns = [
      /["']([^"']*\/members\/activityTracking\?[^"']+)["']/gi,
      /["']([^"']*activityTracking\?[^"']+)["']/gi,
      /\b(?:url|href)\s*:\s*["']([^"']*activityTracking\?[^"']+)["']/gi
    ];
    for (const pattern of patterns) {
      for (const match of html.matchAll(pattern)) {
        const raw = decodeHtmlEntities(match[1] || '').replace(/\\\//g, '/');
        let url;
        try {
          url = new URL(raw, sourceUrl).toString();
        } catch {
          continue;
        }
        if (!/(^|\.)dream-singles\.com$/i.test(new URL(url).hostname)) continue;
        if (seen.has(url)) continue;
        seen.add(url);
        requests.push({
          url,
          method: 'GET',
          headers: {
            ...DREAM_XHR_HEADERS,
            Accept: '*/*',
            Referer: sourceUrl,
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
          }
        });
      }
    }
    if (requests.length >= 3) break;
  }
  return requests;
}

function normalizeDreamHeartbeatConfig(value) {
  const source = Array.isArray(value) ? value : (value ? [value] : []);
  return source.map(item => {
    const rawUrl = String(item?.url || '').trim();
    let url;
    try {
      url = new URL(rawUrl, 'https://www.dream-singles.com/').toString();
    } catch {
      return null;
    }
    if (!/(^|\.)dream-singles\.com$/i.test(new URL(url).hostname)) return null;
    const method = String(item?.method || 'GET').trim().toUpperCase();
    const headers = {};
    for (const [key, val] of Object.entries(item?.headers || {})) {
      const name = String(key || '').trim();
      if (!name || /^(cookie|host|content-length)$/i.test(name)) continue;
      headers[name] = String(val ?? '');
    }
    return {
      url,
      method: ['GET', 'POST'].includes(method) ? method : 'GET',
      headers,
      body: item?.body == null ? '' : String(item.body)
    };
  }).filter(Boolean).slice(0, 5);
}

function startDreamHeartbeat(profileId) {
  const id = String(profileId || '');
  if (!id || dreamHeartbeatTimers.has(id)) return;
  dreamHeartbeatTick(id).catch(() => {});
  const timer = setInterval(() => {
    dreamHeartbeatTick(id).catch(() => {});
  }, DREAM_HEARTBEAT_INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref();
  dreamHeartbeatTimers.set(id, timer);
}

function stopDreamHeartbeat(profileId) {
  const id = String(profileId || '');
  const timer = dreamHeartbeatTimers.get(id);
  if (timer) clearInterval(timer);
  dreamHeartbeatTimers.delete(id);
}

function dreamBrowserStatus(profileId) {
  const session = dreamBrowserSessions.get(String(profileId || ''));
  if (!session) return { running: false };
  return {
    running: true,
    profileId: session.profileId,
    startedAt: session.startedAt,
    lastSeenAt: session.lastSeenAt || '',
    lastError: session.lastError || '',
    url: session.page?.url?.() || ''
  };
}

async function stopDreamBrowser(profileId) {
  const id = String(profileId || '');
  const session = dreamBrowserSessions.get(id);
  if (!session) return;
  dreamBrowserSessions.delete(id);
  if (session.keepAliveTimer) clearInterval(session.keepAliveTimer);
  try { await session.context?.close(); } catch {}
}

function dreamCookiesForBrowser(jar) {
  const source = jar instanceof Map ? jar : new Map();
  return [...source.entries()]
    .filter(([name, value]) => name && value != null)
    .map(([name, value]) => ({
      name: String(name),
      value: String(value),
      domain: '.dream-singles.com',
      path: '/',
      secure: true,
      httpOnly: false,
      sameSite: 'Lax'
    }));
}

function browserCookiesToDreamJar(cookies = []) {
  const jar = new Map();
  for (const cookie of Array.isArray(cookies) ? cookies : []) {
    const name = String(cookie?.name || '').trim();
    const value = cookie?.value == null ? '' : String(cookie.value);
    const domain = String(cookie?.domain || '');
    if (!name || !/(^|\.)dream-singles\.com$/i.test(domain.replace(/^\./, ''))) continue;
    jar.set(name, value);
  }
  return jar;
}

async function startDreamBrowser(db, user, profileId, options = {}) {
  const id = String(profileId || '');
  const profile = requireProfileForUser(db, user, id);
  const existing = dreamBrowserSessions.get(id);
  if (existing && options.force !== true) return existing;
  if (existing) await stopDreamBrowser(id);

  let playwright;
  try {
    playwright = await import('playwright');
  } catch {
    const error = new Error('Playwright is not installed. Run npm install playwright && npx playwright install chromium');
    error.status = 500;
    throw error;
  }

  const userDataDir = path.join(DATA_DIR, 'runtime-data', 'browser-profiles', id);
  fs.mkdirSync(userDataDir, { recursive: true });
  const context = await playwright.chromium.launchPersistentContext(userDataDir, {
    headless: options.headless !== false,
    viewport: { width: 1366, height: 768 },
    locale: 'en-US',
    timezoneId: 'Europe/Kiev',
    userAgent: DREAM_BROWSER_HEADERS['User-Agent'],
    args: [
      ...(options.appWindow ? ['--app=about:blank'] : []),
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-sandbox'
    ]
  });
  const page = context.pages()[0] || await context.newPage();
  const session = {
    profileId: id,
    userId: user.id,
    context,
    page,
    startedAt: new Date().toISOString(),
    lastSeenAt: '',
    lastError: '',
    appWindow: options.appWindow === true
  };
  dreamBrowserSessions.set(id, session);
  context.on('close', () => {
    if (dreamBrowserSessions.get(id) === session) dreamBrowserSessions.delete(id);
    if (session.keepAliveTimer) clearInterval(session.keepAliveTimer);
    if (session.appWindow && options.reopenHeadlessOnClose !== false) {
      setTimeout(() => {
        const freshDb = readDb();
        const freshUser = freshDb.users?.[user.id];
        if (!freshUser || dreamBrowserSessions.has(id)) return;
        startDreamBrowser(freshDb, freshUser, id, { force: true }).catch(error => {
          console.warn(`[dream-browser] ${id}: could not restore hidden browser after app close: ${error.message || error}`);
        });
      }, 1500).unref?.();
    }
  });

  if (options.skipDreamSessionSeed !== true) {
    try {
      const dreamSession = await openDreamSession(db, user, id, {
        force: options.refreshDreamSession === true,
        browserFallback: false
      });
      const cookies = Array.isArray(options.seedCookies) && options.seedCookies.length
        ? options.seedCookies
        : dreamCookiesForBrowser(dreamSession.jar);
      if (cookies.length) await context.addCookies(cookies);
    } catch (error) {
      console.warn(`[dream-browser] ${id}: could not seed browser cookies: ${error.message || error}`);
    }
  } else if (Array.isArray(options.seedCookies) && options.seedCookies.length) {
    await context.addCookies(options.seedCookies).catch(error => {
      console.warn(`[dream-browser] ${id}: could not seed provided browser cookies: ${error.message || error}`);
    });
  }

  async function safeDreamGoto(targetUrl, options = {}) {
    try {
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45_000, ...options });
      return true;
    } catch (error) {
      if (/ERR_ABORTED|Navigation interrupted|net::ERR_ABORTED/i.test(String(error?.message || ''))) {
        await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {});
        return false;
      }
      throw error;
    }
  }

  async function hasVisiblePasswordInput() {
    return await page.locator('input[type="password"]').evaluateAll(inputs =>
      inputs.some(input => {
        const style = window.getComputedStyle(input);
        const rect = input.getBoundingClientRect();
        return rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          input.offsetParent !== null;
      })
    ).catch(() => false);
  }

  async function dismissDreamPopups() {
    const labels = [
      /^OK$/i,
      /^I agree$/i,
      /^I don't want to know$/i,
      /^Enable Sound$/i
    ];
    for (const label of labels) {
      const control = page.locator('button, a, input[type="button"], input[type="submit"]').filter({ hasText: label }).first();
      if (await control.count().catch(() => 0)) {
        await control.click({ timeout: 1500 }).catch(() => {});
      }
    }
  }

  async function ensureLoggedIn() {
    await safeDreamGoto(DREAM_INBOX_URL);
    await dismissDreamPopups();
    const needsLogin = /\/login(?:[/?#]|$)|sign[-_]?in|auth/i.test(page.url()) ||
      await hasVisiblePasswordInput();
    if (needsLogin) {
      await safeDreamGoto(DREAM_LOGIN_URL);
      const login = decryptCredential(profile.credentials.login);
      const password = decryptCredential(profile.credentials.password);
      const loginInput = page.locator('input[type="email"], input[name*="email" i], input[type="text"]').first();
      const passwordInput = page.locator('input[type="password"]').first();
      await loginInput.fill(login, { timeout: 20_000 });
      await passwordInput.fill(password, { timeout: 20_000 });
      const submit = page.locator('button, input[type="submit"]').filter({ hasText: /login|sign in|log in/i }).first();
      if (await submit.count().catch(() => 0)) {
        await Promise.all([
          page.waitForLoadState('domcontentloaded', { timeout: 30_000 }).catch(() => {}),
          submit.click()
        ]);
      } else {
        await passwordInput.press('Enter');
        await page.waitForLoadState('domcontentloaded', { timeout: 30_000 }).catch(() => {});
      }
      await safeDreamGoto(DREAM_INBOX_URL);
      await dismissDreamPopups();
    }
    let currentUrl = page.url();
    let onMembersPage = /dream-singles\.com\/members(?:[/?#]|$)/i.test(currentUrl);
    let stillLogin = !onMembersPage && (
      /\/login(?:[/?#]|$)|sign[-_]?in|auth/i.test(currentUrl) ||
      await hasVisiblePasswordInput()
    );
    if (stillLogin && options.headless === false && options.allowManualLogin !== false) {
      session.lastError = 'Waiting for manual Dream Singles login';
      await page.bringToFront().catch(() => {});
      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline) {
        await page.waitForTimeout(2000).catch(() => {});
        await dismissDreamPopups();
        currentUrl = page.url();
        onMembersPage = /dream-singles\.com\/members(?:[/?#]|$)/i.test(currentUrl);
        if (onMembersPage && !(await hasVisiblePasswordInput())) break;
      }
      currentUrl = page.url();
      onMembersPage = /dream-singles\.com\/members(?:[/?#]|$)/i.test(currentUrl);
      stillLogin = !onMembersPage && (
        /\/login(?:[/?#]|$)|sign[-_]?in|auth/i.test(currentUrl) ||
        await hasVisiblePasswordInput()
      );
    }
    if (stillLogin) throw new Error('Dream Singles browser login failed or requires confirmation');
    session.lastSeenAt = new Date().toISOString();
    session.lastError = '';
  }

  await ensureLoggedIn();
  try {
    const freshCookies = await context.cookies('https://www.dream-singles.com/');
    const freshJar = browserCookiesToDreamJar(freshCookies);
    if (freshJar.size) {
      const freshDb = readDb();
      const freshProfile = freshDb.profiles?.[id];
      if (freshProfile) {
        saveDreamSessionJar(freshProfile, freshJar);
        freshProfile.updatedAt = new Date().toISOString();
        writeDb(freshDb);
      }
    }
  } catch (error) {
    console.warn(`[dream-browser] ${id}: could not save browser cookies: ${error.message || error}`);
  }
  await safeDreamGoto('https://www.dream-singles.com/members/').catch(() => {});

  session.keepAliveTimer = setInterval(async () => {
    try {
      if (page.isClosed()) throw new Error('Dream browser page was closed');
      const currentUrl = page.url();
      if (!/dream-singles\.com/i.test(currentUrl) || /\/login(?:[/?#]|$)/i.test(currentUrl)) {
        await ensureLoggedIn();
      } else {
        await page.evaluate(() => {
          window.dispatchEvent(new Event('focus'));
          document.dispatchEvent(new Event('visibilitychange'));
        }).catch(() => {});
        await safeDreamGoto('https://www.dream-singles.com/members/', { timeout: 30_000 }).catch(() => {});
      }
      session.lastSeenAt = new Date().toISOString();
      session.lastError = '';
    } catch (error) {
      session.lastError = error.message || 'Browser keep-online failed';
      console.warn(`[dream-browser] ${id}: ${session.lastError}`);
    }
  }, 45_000);
  if (typeof session.keepAliveTimer.unref === 'function') session.keepAliveTimer.unref();

  return session;
}

function serializeDreamJar(jar) {
  return JSON.stringify([...((jar instanceof Map ? jar : new Map()).entries())]);
}

function deserializeDreamJar(value) {
  try {
    const entries = JSON.parse(String(value || '[]'));
    return new Map(Array.isArray(entries) ? entries : []);
  } catch {
    return new Map();
  }
}

function saveDreamSessionJar(profile, jar) {
  try {
    profile.serverDreamCookies = encryptCredential(serializeDreamJar(jar));
    profile.serverDreamCookiesSavedAt = new Date().toISOString();
  } catch {}
}

function restoreDreamSessionFromProfile(profileId, profile, userId = '') {
  if (!profile?.serverDreamCookies) return null;
  try {
    const jar = deserializeDreamJar(decryptCredential(profile.serverDreamCookies));
    if (!jar.size) return null;
    const now = new Date().toISOString();
    const session = {
      profileId: String(profileId || profile.id || ''),
      userId,
      jar,
      identity: {
        profileId: String(profileId || profile.id || ''),
        name: profile.name || '',
        photoUrl: profile.photoUrl || ''
      },
      authenticatedAt: profile.serverDreamCookiesSavedAt || now,
      lastUsedAt: now,
      restored: true
    };
    dreamSessions.set(String(profileId || profile.id || ''), session);
    startDreamHeartbeat(String(profileId || profile.id || ''));
    return session;
  } catch {
    return null;
  }
}

async function openDreamSessionFromJar(db, user, profileId, profile, jar, options = {}) {
  const id = String(profileId || '');
  if (!(jar instanceof Map) || !jar.size) throw new Error('Dream Singles browser session did not return cookies');

  const inboxResponse = await agencyFetch(DREAM_INBOX_URL, {
    method: 'GET',
    headers: { ...DREAM_BROWSER_HEADERS, Referer: DREAM_LOGIN_URL }
  }, jar);
  const inboxHtml = await inboxResponse.text();
  if (!inboxResponse.ok || dreamPageLooksLoggedOut(inboxHtml, inboxResponse.url)) {
    throw new Error(`Dream Singles browser session is not authenticated (${dreamLogoutReason(inboxHtml, inboxResponse.url)})`);
  }

  let accountHtml = '';
  try {
    const accountResponse = await agencyFetch(DREAM_ACCOUNT_URL, { method: 'GET' }, jar);
    accountHtml = await accountResponse.text();
  } catch {}
  const identity = extractDreamProfileIdentity(inboxHtml, accountHtml);
  if (identity.name && !/^Profile\s+\d+$/i.test(identity.name)) profile.name = identity.name;
  if (identity.photoUrl) profile.photoUrl = identity.photoUrl;
  if (options.downloadPhoto !== false && identity.photoUrl) {
    const photoData = await downloadDreamPhotoDataUrl(identity.photoUrl);
    if (photoData) {
      const photoUrl = savePhotoData(id, '__profile', photoData);
      if (photoUrl) profile.photoUrl = photoUrl;
    }
  }

  profile.updatedAt = new Date().toISOString();
  saveDreamSessionJar(profile, jar);
  writeDb(db);

  const now = new Date().toISOString();
  const session = {
    profileId: id,
    userId: user.id,
    jar,
    identity: {
      profileId: identity.profileId || id,
      name: identity.name || profile.name || '',
      photoUrl: profile.photoUrl || identity.photoUrl || ''
    },
    authenticatedAt: now,
    lastUsedAt: now
  };
  dreamSessions.set(id, session);
  startDreamHeartbeat(id);
  return session;
}

function requireProfileForUser(db, user, profileId) {
  const id = String(profileId || '');
  const profile = db.profiles[id];
  if (!profile || !userHasWorkingProfile(db, user, id)) {
    const error = new Error('This profile is not assigned to you');
    error.status = 403;
    throw error;
  }
  if (!profile.credentials?.login || !profile.credentials?.password) {
    const error = new Error('Dream Singles access has not been configured for this profile');
    error.status = 409;
    throw error;
  }
  return profile;
}

async function openDreamSession(db, user, profileId, options = {}) {
  const id = String(profileId || '');
  const profile = requireProfileForUser(db, user, id);
  const existing = dreamSessions.get(id);
  if (existing && options.force !== true) {
    existing.lastUsedAt = new Date().toISOString();
    return existing;
  }
  if (options.force !== true) {
    const restored = restoreDreamSessionFromProfile(id, profile, user.id);
    if (restored) return restored;
  }

  let result;
  try {
    result = await resolveDreamSinglesAccess(
      decryptCredential(profile.credentials.login),
      decryptCredential(profile.credentials.password),
      { includeJar: true }
    );
  } catch (directError) {
    if (options.browserFallback === false) throw directError;
    console.warn(`[dream-login] ${id}: direct login failed, trying hidden browser fallback: ${directError.message || directError}`);
    try {
      const browserSession = await startDreamBrowser(db, user, id, {
        force: true,
        headless: true,
        skipDreamSessionSeed: true,
        reopenHeadlessOnClose: true
      });
      const cookies = await browserSession.context.cookies('https://www.dream-singles.com/');
      const jar = browserCookiesToDreamJar(cookies);
      return await openDreamSessionFromJar(db, user, id, profile, jar);
    } catch (browserError) {
      browserError.message = `${directError.message || 'Dream Singles direct login failed'}; browser fallback failed: ${browserError.message || browserError}`;
      throw browserError;
    }
  }

  if (result.name && !/^Profile\s+\d+$/i.test(result.name)) profile.name = result.name;
  if (result.photoData) {
    const photoUrl = savePhotoData(id, '__profile', result.photoData);
    if (photoUrl) profile.photoUrl = photoUrl;
  } else if (result.photoUrl) {
    profile.photoUrl = result.photoUrl;
  }
  profile.updatedAt = new Date().toISOString();
  saveDreamSessionJar(profile, result.jar || new Map());
  writeDb(db);

  const now = new Date().toISOString();
  const session = {
    profileId: id,
    userId: user.id,
    jar: result.jar || new Map(),
    identity: {
      profileId: result.profileId || id,
      name: result.name || profile.name || '',
      photoUrl: profile.photoUrl || result.photoUrl || ''
    },
    authenticatedAt: now,
    lastUsedAt: now
  };
  dreamSessions.set(id, session);
  startDreamHeartbeat(id);
  return session;
}

async function dreamSessionFetch(profileId, url, options = {}) {
  const session = dreamSessions.get(String(profileId || ''));
  if (!session) {
    const error = new Error('Dream Singles profile is not connected on the server');
    error.status = 409;
    throw error;
  }
  const response = await agencyFetch(url, {
    method: options.method || 'GET',
    headers: options.headers,
    body: options.body
  }, session.jar);
  const html = await response.text();
  session.lastUsedAt = new Date().toISOString();
  if (!response.ok || dreamPageLooksLoggedOut(html, response.url)) {
    dreamSessions.delete(String(profileId || ''));
    stopDreamHeartbeat(profileId);
    try {
      const db = readDb();
      const profile = db.profiles?.[String(profileId || '')];
      if (profile?.serverDreamCookies) {
        delete profile.serverDreamCookies;
        delete profile.serverDreamCookiesSavedAt;
        profile.updatedAt = new Date().toISOString();
        writeDb(db);
      }
    } catch {}
    const error = new Error('Dream Singles session expired or login is required');
    error.status = 401;
    throw error;
  }
  return { response, html, url: response.url || url };
}

function htmlToText(html = '') {
  return decodeHtmlEntities(String(html || '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|tr|td|th|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractDreamProfilePresence(html = '') {
  const text = htmlToText(html);
  const normalized = text.replace(/\s+/g, ' ').trim();
  const explicitActivity = normalized.match(/\bLast\s+activity\s*:?\s*(Online(?:\s+(?:now|\d+\s+\w+\(s\)\s+ago|\d+\s+(?:minute|minutes|hour|hours|day|days|week|weeks|month|months)\s+ago|\d{4}-\d{2}-\d{2}|[^|]{1,60}))?)/i)?.[1] || '';
  if (explicitActivity) {
    const cleanActivity = explicitActivity
      .replace(/\s+/g, ' ')
      .replace(/\b(?:message|favorite|chat|profile|photos|videos)\b.*$/i, '')
      .trim();
    return {
      onlineNow: /^Online\s+now$/i.test(cleanActivity),
      lastActivityText: cleanActivity
    };
  }

  const lines = text
    .split(/\n+/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const joined = lines.join(' | ');
  const patterns = [
    /\bLast\s*(?:Activity|Login|Seen|Online)\s*:?\s*([^|]{3,80})/i,
    /\b(?:Activity|Login)\s*:?\s*([^|]{3,80})/i,
    /\b(?:Last\s+seen|Was\s+online)\s+([^|]{3,80})/i,
    /\b((?:\d{1,2}\s*)?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}(?:\s+\d{1,2}:\d{2}\s*(?:am|pm)?)?)/i,
    /\b(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}(?:\s+\d{1,2}:\d{2})?)/i,
    /\b(\d+\s+(?:minute|minutes|hour|hours|day|days|week|weeks|month|months)\s+ago)\b/i
  ];
  for (const pattern of patterns) {
    const value = joined.match(pattern)?.[1] || '';
    const clean = value
      .replace(/\b(?:send\s+message|add\s+to\s+favorites|profile|photos|videos|chat|mail|message)\b.*$/i, '')
      .replace(/[|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (clean && clean.length <= 80) return { onlineNow: false, lastActivityText: clean };
  }
  return { onlineNow: false, lastActivityText: '' };
}

function attrFromTag(tag = '', attr = '') {
  const escaped = String(attr || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(tag || '').match(new RegExp(`\\s${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>` + '`' + `]+))`, 'i'));
  return decodeHtmlEntities(match?.[1] ?? match?.[2] ?? match?.[3] ?? '');
}

function absoluteDreamUrl(value = '', base = DREAM_INBOX_URL) {
  const raw = decodeHtmlEntities(String(value || '').trim());
  if (!raw || /^javascript:|^#$/i.test(raw)) return '';
  try {
    return new URL(raw, base || 'https://www.dream-singles.com/').href;
  } catch {
    return raw;
  }
}

function cleanWorkspaceText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeWorkspaceNameCandidate(value = '') {
  const name = cleanWorkspaceText(value)
    .replace(/^(?:profile|member|man|id)\s*:?\s*/i, '')
    .replace(/\b(?:read the message|unread|online now)\b/ig, '')
    .trim();
  if (/^(?:i['’`]?m\s+online|online|online\s+now|check\s+activity|read\s+the\s+message)$/i.test(name)) return '';
  return /^[A-Za-z][A-Za-z' -]{1,50}$/.test(name) ? name : '';
}

function safeWorkspaceName(value = '', fallback = '', id = '') {
  const normalized = normalizeWorkspaceNameCandidate(value);
  if (normalized) return normalized;
  const fallbackName = normalizeWorkspaceNameCandidate(fallback);
  if (fallbackName) return fallbackName;
  return id ? `Man ${id}` : '';
}

function workspaceReplyPreview(text = '') {
  const lines = String(text || '').split(/\n+/).map(cleanWorkspaceText).filter(Boolean);
  return lines.find(line =>
    line.length >= 12 &&
    line.length <= 260 &&
    !/^(?:read the message|unread|delete|reply|inbox|sent|date)$/i.test(line) &&
    !/\b20\d{2}-\d{2}-\d{2}\s+\d{1,2}:\d{2}\b/.test(line)
  ) || '';
}

function workspaceNameNearId(text = '', id = '') {
  const targetId = String(id || '').trim();
  if (!targetId) return '';
  const lines = String(text || '')
    .split(/\n+/)
    .map(line => cleanWorkspaceText(line))
    .filter(Boolean);
  for (const line of lines) {
    if (!new RegExp(`\\b${targetId}\\b`).test(line)) continue;
    const candidate = line
      .replace(new RegExp(`\\b(?:ID\\s*:?\\s*)?${targetId}\\b`, 'i'), ' ')
      .replace(/\b(?:i['’`]?m\s+online|online\s+now|online|read\s+the\s+message|unread|check\s+activity)\b/ig, ' ')
      .replace(/[^A-Za-z' -]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const normalized = normalizeWorkspaceNameCandidate(candidate);
    if (normalized) return normalized;
  }
  return '';
}

function extractElementById(html = '', id = '') {
  const pattern = new RegExp(`<([a-z0-9]+)\\b[^>]*\\bid\\s*=\\s*["']${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`, 'i');
  const match = pattern.exec(html);
  if (!match) return '';
  const tag = match[1];
  const start = match.index;
  let depth = 0;
  const tagPattern = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi');
  tagPattern.lastIndex = start;
  let tagMatch;
  while ((tagMatch = tagPattern.exec(html))) {
    if (tagMatch[0][1] === '/') depth -= 1;
    else depth += 1;
    if (depth === 0) return html.slice(start, tagPattern.lastIndex);
  }
  return html.slice(start);
}

function extractElementsByClassName(html = '', className = '') {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const blocks = [];
  const classPattern = new RegExp(`<([a-z0-9]+)\\b[^>]*class=["'][^"']*\\b${escaped}\\b[^"']*["'][^>]*>`, 'gi');
  let match;
  while ((match = classPattern.exec(html))) {
    const tag = match[1];
    const start = match.index;
    let depth = 0;
    const tagPattern = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi');
    tagPattern.lastIndex = start;
    let tagMatch;
    while ((tagMatch = tagPattern.exec(html))) {
      if (tagMatch[0][1] === '/') depth -= 1;
      else depth += 1;
      if (depth === 0) {
        blocks.push(html.slice(start, tagPattern.lastIndex));
        break;
      }
    }
  }
  return blocks;
}

function cleanWorkspaceLetterText(value = '', fallbackName = '') {
  const fallbackLower = String(fallbackName || '').trim().toLowerCase();
  const blocked = new Set([
    'home', 'members area', 'my messages', 'my connections', 'enter chat', 'my account',
    'logout', 'profile gallery', 'search', 'gentlemen online', 'services', 'live chat',
    'information', 'language', 'english', 'choose language', 'google', 'translate',
    'message', 'favorite', 'more', 'read the message', 'back to inbox', 'delete',
    'previous message', 'next message', 'reply', 'block him', 'my folders', 'move to',
    'send', 'save draft', 'cancel', 'back to messages', 'message history',
    'having trouble?', 'switch to advanced editor', 'attach photo', 'attach video',
    'select image', 'select video', 'unread', 'opened'
  ]);
  return String(value || '')
    .replace(/\r/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map(line => line.replace(/[ \t]+/g, ' ').trim())
    .filter(line => {
      if (!line) return false;
      const text = line.toLowerCase().replace(/\s+/g, ' ');
      if (blocked.has(text)) return false;
      if (fallbackLower && text === fallbackLower) return false;
      if (/^notification(?:\s+\d+\+?)?$/i.test(line)) return false;
      if (/^copyright\b|^(privacy policy|terms of use|cookie preferences)$/i.test(line)) return false;
      if (/^(replies left today|new messages left today)\s*:/i.test(line)) return false;
      if (/^[A-Za-z][A-Za-z' -]{1,40}\s+ID\s*:\s*\d{4,}$/i.test(line)) return false;
      if (/^\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}$/.test(line)) return false;
      return true;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function findWorkspaceComposeUrl(html = '', sourceUrl = DREAM_INBOX_URL) {
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = match[1] || '';
    if (!/\/members\/messaging\/compose\/|\/messaging\/compose\/|compose\//i.test(href)) continue;
    const text = htmlToText(match[2] || '');
    const absolute = absoluteDreamUrl(href, sourceUrl);
    if (absolute && /reply|message history|history|read/i.test(text + ' ' + href)) return absolute;
    if (absolute) return absolute;
  }
  return '';
}

function deriveWorkspaceComposeUrlFromReadUrl(value = '') {
  let url;
  try {
    url = new URL(value, DREAM_INBOX_URL);
  } catch {
    return '';
  }
  const match = decodeURIComponent(url.pathname).match(/\/members\/messaging\/read\/(letters_(?:read|unread)_[^/?#]*?:([0-9]+)-[0-9]+-[^/?#]+)/i);
  if (!match) return '';
  const replyId = match[1];
  const composeId = match[2];
  const page = url.searchParams.get('page') || '1';
  const view = url.searchParams.get('view') || 'all';
  return absoluteDreamUrl(
    `/members/messaging/compose/${encodeURIComponent(composeId)}?mode=inbox&page=${encodeURIComponent(page)}&view=${encodeURIComponent(view)}&replyId=${encodeURIComponent(replyId)}&date=`,
    url.href
  );
}

async function resolveWorkspaceReplyComposeUrl(profileId, rawUrl = '') {
  const url = new URL(rawUrl || DREAM_INBOX_URL, DREAM_INBOX_URL);
  if (/\/members\/messaging\/compose\/|\/messaging\/compose\/|compose\//i.test(url.href)) return url.href;
  const derivedUrl = deriveWorkspaceComposeUrlFromReadUrl(url.href);
  if (derivedUrl) return derivedUrl;
  const page = await dreamSessionFetch(profileId, url.href);
  const composeUrl = findWorkspaceComposeUrl(page.html, page.url || url.href) ||
    deriveWorkspaceComposeUrlFromReadUrl(page.url || url.href);
  if (composeUrl) return composeUrl;
  throw new Error(`Could not find reply link for the selected letter`);
}

function workspaceReplySendInfo(composeUrl = '') {
  const url = new URL(composeUrl || DREAM_INBOX_URL, DREAM_INBOX_URL);
  const memberId = (url.pathname.match(/\/members\/messaging\/compose\/(\d+)/i) || [])[1] || '';
  const replyId = url.searchParams.get('replyId') || '';
  const page = url.searchParams.get('page') || '1';
  const view = url.searchParams.get('view') || 'all';
  if (!memberId) throw new Error('Dream member ID was not found');
  return { memberId, replyId, page, view };
}

function workspaceReplyMediaForDirectSend(attachments = []) {
  const media = { galleryId: '', videoGalleryId: '' };
  const unsupported = [];
  for (const item of Array.isArray(attachments) ? attachments : []) {
    const kind = `${item?.kind || ''} ${item?.type || ''} ${item?.source || ''}`.toLowerCase();
    const rawId = String(/video/.test(kind)
      ? (item?.videoGalleryId || item?.galleryId || item?.id || '')
      : (item?.galleryId || item?.id || '')).trim();
    const id = (rawId.match(/\d{2,}/) || [])[0] || '';
    if (!id && /^data:/i.test(String(item?.dataUrl || ''))) {
      unsupported.push(item?.name || 'local attachment');
      continue;
    }
    if (!id) continue;
    if (/video/.test(kind)) {
      if (!media.videoGalleryId) media.videoGalleryId = id;
    } else if (!media.galleryId) {
      media.galleryId = id;
    }
  }
  if (unsupported.length) {
    throw new Error('Server sending supports Dream gallery media only. Select media from Dream gallery.');
  }
  return media;
}

function extractWorkspaceMediaRequestUrlsFromText(text = '', sourceUrl = 'https://www.dream-singles.com/') {
  const decode = value => String(value || '')
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&')
    .replace(/&#x2F;/gi, '/')
    .replace(/&quot;/g, '"');
  const urls = [];
  const seen = new Set();
  const add = value => {
    const raw = decode(value).trim();
    if (!raw || /^javascript:/i.test(raw)) return;
    let url = '';
    try { url = new URL(raw, sourceUrl).toString(); } catch { return; }
    if (seen.has(url)) return;
    if (!/^https:\/\/(?:[^/]+\.)?dream-singles\.com\//i.test(url)) return;
    if (!/loadImages|loadMedia|loadFolders|media\/gallery|gallery\/load|gallery/i.test(url)) return;
    if (/(?:delete|remove|trash|confirm|send|upload|destroy|clear)/i.test(url)) return;
    seen.add(url);
    urls.push(url);
  };
  const body = decode(text);
  let match;
  const attrPattern = /\b(?:href|src|data-url|data-href|data-link|action)=["']([^"']*(?:loadImages|loadMedia|loadFolders|media\/gallery|gallery)[^"']*)["']/gi;
  while ((match = attrPattern.exec(body))) add(match[1]);
  const quotedPattern = /["']([^"']*(?:loadImages|loadMedia|loadFolders|media\/gallery|gallery)[^"']*)["']/gi;
  while ((match = quotedPattern.exec(body))) add(match[1]);
  return urls;
}

function extractWorkspaceMediaFromText(text = '', sourceUrl = 'https://www.dream-singles.com/', requestedKind = 'photo', contentType = '') {
  const kind = String(requestedKind || '').toLowerCase() === 'video' ? 'video' : 'photo';
  let sourceMeta = { section: '', page: 1 };
  try {
    const source = new URL(sourceUrl);
    sourceMeta = {
      section: source.searchParams.get('status') || source.searchParams.get('category') || 'all',
      page: Math.max(1, Number(source.searchParams.get('page') || 1) || 1)
    };
  } catch {}
  const decode = value => String(value || '')
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&')
    .replace(/&#x2F;/gi, '/')
    .replace(/&quot;/g, '"');
  const absolutize = value => {
    const raw = decode(value).trim();
    if (!raw || /^data:/i.test(raw) || /^javascript:/i.test(raw)) return '';
    try { return new URL(raw, sourceUrl).toString(); } catch { return raw; }
  };
  const items = [];
  const seen = new Set();
  const extractGalleryId = value => {
    const textValue = String(value || '');
    return textValue.match(/\b(?:data-(?:media-)?id|data-(?:photo|image|gallery)-id|mediaId|media_id|photoId|photo_id|galleryId|gallery_id|id)=["']?(\d{2,})\b/i)?.[1] ||
      textValue.match(/[?&](?:mediaId|media_id|photoId|photo_id|galleryId|gallery_id|id)=(\d{2,})\b/i)?.[1] ||
      textValue.match(/\b(?:select|choose|send|delete|remove|edit|media|photo|video|gallery)[A-Za-z0-9_]*\s*\(\s*['"]?(\d{2,})['"]?/i)?.[1] ||
      textValue.match(/\/(?:deleteVideo|editVideo|video|media|gallery)\/(\d{2,})\b/i)?.[1] ||
      textValue.match(/\b(?:photo|image|video|media|gallery)[-_](\d{2,})\b/i)?.[1] ||
      '';
  };
  const add = (url, thumbUrl = '', label = '', context = '') => {
    const full = absolutize(url);
    const thumb = absolutize(thumbUrl || url);
    const marker = `${full} ${thumb} ${label} ${context}`.toLowerCase();
    const assetMarker = `${full} ${thumb} ${label}`.toLowerCase();
    const videoEvidence = /data-type=["']?6\b|deletevideo\/\d+|editvideo\/\d+|video-gallery|video_media|videogallery|video-gallery-selection|video-media-gallery-selection|loadmedia\/video|favorites-video|others-video/i.test(context);
    const galleryId = extractGalleryId(context) || extractGalleryId(label) || extractGalleryId(full);
    if (!full) return;
    if (/\/members\/media\/gallery\/(?:loadImages|loadMedia|loadFolders)\b/i.test(full)) return;
    if (/\.(?:css|js|woff2?|ttf|eot|svg|map)(?:[?#]|$)|\/(?:css|js|fonts?|libs?|assets\/(?:css|js|libs?|fonts?))\//i.test(assetMarker)) return;
    if (!galleryId && /profile-photos-cdn\.dream-singles\.com\/im\d+(?:_[a-z0-9-]+)?\.(?:jpe?g|png|webp|gif)|\/images\/modal\//i.test(assetMarker)) return;
    if (/logo|sprite|icon|blank|placeholder|avatar|delete|trash|loader|spinner/i.test(assetMarker)) return;
    if (kind === 'photo' && !/(?:profile-photos-cdn|uploads?|media|gallery|photo|image|album).*\.(?:jpe?g|png|webp|gif)(?:[?#]|$)|\.(?:jpe?g|png|webp|gif)(?:[?#]|$)/i.test(marker)) return;
    if (kind === 'video' && !galleryId) return;
    if (kind === 'video' && !(/\.(?:mp4|webm|mov|m4v)(?:[?#]|$)/i.test(marker) || videoEvidence)) return;
    const key = `${kind}:${galleryId || full}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push({
      source: 'dream-gallery',
      kind,
      id: galleryId || key,
      galleryId,
      videoGalleryId: kind === 'video' ? galleryId : '',
      url: full,
      thumbUrl: thumb || full,
      originalThumbUrl: thumb || full,
      mediaType: kind === 'video' ? 'video' : 'photo',
      label: String(label || (kind === 'video' ? 'Video' : 'Photo')).replace(/\s+/g, ' ').trim().slice(0, 120),
      section: sourceMeta.section,
      page: sourceMeta.page,
      index: items.length
    });
  };

  const body = decode(text);
  let match;
  if (/json|javascript/i.test(contentType) || /^[\s[{]/.test(body)) {
    const urlValues = [...body.matchAll(/(.{0,500})["'](?:url|src|href|thumb|thumbnail|image|photo|poster|file|path|preview|media)["']\s*:\s*["']([^"']+)["'](.{0,500})/gi)];
    urlValues.forEach(item => add(item[2], '', '', `${item[1]} ${item[0]} ${item[3]}`));
  }
  const wrapperPattern = /<div\b[^>]*\bdata-id=["']?(\d{2,})["']?[^>]*class=["'][^"']*gallery-media-wrapper[^"']*["'][\s\S]*?<\/div>\s*<\/div>/gi;
  while ((match = wrapperPattern.exec(body))) {
    const block = match[0];
    const imageMatch = block.match(/\b(?:src|data-src|data-original|data-lazy-src|data-full|data-url|data-image|data-img)=["']([^"']+)["']/i);
    if (imageMatch) add(imageMatch[1], '', '', `${block} data-id="${match[1]}"`);
  }
  const dreamAutoImagePattern = /<img\b([^>]*\bdata-id=["']?(\d{2,})["']?[^>]*)>/gi;
  while ((match = dreamAutoImagePattern.exec(body))) {
    const attrs = match[1];
    const imageMatch = attrs.match(/\b(?:src|data-src|data-original|data-lazy-src|data-full|data-url|data-image|data-img)=["']([^"']+)["']/i);
    if (imageMatch) add(imageMatch[1], '', '', `${attrs} data-id="${match[2]}"`);
  }
  const attrPattern = /\b(?:src|href|data-src|data-original|data-lazy-src|data-full|data-url|data-image|data-img|data-media|poster)=["']([^"']+)["']/gi;
  while ((match = attrPattern.exec(body))) add(match[1], '', '', body.slice(Math.max(0, match.index - 700), Math.min(body.length, match.index + 1200)));
  const quotedPattern = /["']([^"']*(?:profile-photos-cdn|dream-singles|uploads?|media|gallery|photo|image|video)[^"']*)["']/gi;
  while ((match = quotedPattern.exec(body))) add(match[1]);
  const plainUrlPattern = /https?:\/\/[^\s"'<>\\]+(?:jpe?g|png|webp|gif|mp4|webm|media|gallery|photo|video)[^\s"'<>\\]*/gi;
  while ((match = plainUrlPattern.exec(body))) add(match[0]);
  return items;
}

async function syncWorkspaceMediaGalleryDirect(profileId, options = {}) {
  const session = dreamSessions.get(String(profileId || ''));
  if (!session) {
    const error = new Error('Dream Singles profile is not connected on the server');
    error.status = 409;
    throw error;
  }
  const kind = String(options.kind || '').toLowerCase() === 'video' ? 'video' : 'photo';
  const maxGalleryPages = Math.min(100, Math.max(1, Number(options.maxGalleryPages || 100) || 100));
  const media = [];
  const seenMedia = new Set();
  const stats = [];

  const decodeHtml = value => String(value || '')
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&')
    .replace(/&#x2F;/gi, '/')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  const attrValue = (attrs, name) => {
    const match = String(attrs || '').match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
    return decodeHtml(match?.[1] || '');
  };
  const absolute = (value, sourceUrl = 'https://www.dream-singles.com/members/') => {
    const raw = decodeHtml(value).trim();
    if (!raw || /^javascript:/i.test(raw)) return '';
    try { return new URL(raw, sourceUrl).toString(); } catch { return raw; }
  };
  const paginatorLastPage = html => {
    let lastPage = 1;
    const paginatorMatch = String(html || '').match(/<[^>]+id=["']knpPaginator["'][^>]*>[\s\S]*?<\/[^>]+>/i);
    const paginatorHtml = paginatorMatch?.[0] || html || '';
    let match;
    const buttonPattern = /<[^>]+class=["'][^"']*\bbtn-pagenav\b[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/gi;
    while ((match = buttonPattern.exec(paginatorHtml))) {
      const value = Number(htmlToText(match[1]).trim());
      if (Number.isFinite(value)) lastPage = Math.max(lastPage, value);
    }
    return lastPage;
  };
  const addItem = item => {
    const id = String(item?.galleryId || item?.id || '').trim();
    const url = String(item?.url || item?.thumbUrl || '').trim();
    if (!id || !url) return;
    const key = `${item.kind}:${id}`;
    if (seenMedia.has(key)) return;
    seenMedia.add(key);
    media.push(item);
  };
  const recordStats = (section, page, count, url = '') => {
    stats.push({ section, page, count, url });
  };
  const fetchText = async (path, referer = 'https://www.dream-singles.com/members/') => {
    const url = absolute(path, referer);
    const response = await agencyFetch(url, {
      method: 'GET',
      headers: {
        Accept: 'text/html, application/json, text/javascript, */*;q=0.8',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: referer
      }
    }, session.jar);
    if (!response.ok) throw new Error(`Dream Singles media request failed (${response.status})`);
    const body = await response.text();
    if (dreamPageLooksLoggedOut(body, response.url || url)) throw new Error('Dream Singles login is required');
    return { html: body, url: response.url || url };
  };
  const extractDreamAutoPhotos = (html, sourceUrl, section, page) => {
    const items = [];
    const seen = new Set();
    const addPhoto = (id, src) => {
      const cleanId = String(id || '').trim();
      const url = absolute(src, sourceUrl);
      if (!cleanId || !url || seen.has(cleanId)) return;
      seen.add(cleanId);
      items.push({
        source: 'dream-gallery',
        kind: 'photo',
        id: `photo:${cleanId}`,
        galleryId: cleanId,
        url,
        thumbUrl: url,
        originalThumbUrl: url,
        mediaType: 'photo',
        label: `Photo ID ${cleanId}`,
        section,
        page,
        index: items.length
      });
    };
    let match;
    const imgPattern = /<img\b([^>]*\bdata-id\s*=\s*["']?\d{2,}[^>]*)>/gi;
    while ((match = imgPattern.exec(String(html || '')))) {
      const attrs = match[1];
      const id = attrValue(attrs, 'data-id') || String(attrs).match(/\bdata-id\s*=\s*["']?(\d{2,})/i)?.[1] || '';
      const src = attrValue(attrs, 'src') || attrValue(attrs, 'data-src') || attrValue(attrs, 'data-original');
      addPhoto(id, src);
    }
    const wrapperPattern = /<[^>]+(?=[^>]*\bgallery-media-wrapper\b)(?=[^>]*\bdata-id\s*=\s*["']?\d{2,})[^>]*>[\s\S]*?(?=<[^>]+(?=[^>]*\bgallery-media-wrapper\b)(?=[^>]*\bdata-id\s*=)|$)/gi;
    while ((match = wrapperPattern.exec(String(html || '')))) {
      const block = match[0];
      const id = block.match(/\bdata-id\s*=\s*["']?(\d{2,})/i)?.[1] || '';
      const imgAttrs = block.match(/<img\b([^>]*)>/i)?.[1] || '';
      const src = attrValue(imgAttrs, 'src') || attrValue(imgAttrs, 'data-src') || attrValue(imgAttrs, 'data-original');
      addPhoto(id, src);
    }
    return items;
  };
  const extractDreamAutoPhotoFolders = html => {
    const folders = [];
    const seen = new Set();
    const body = String(html || '');
    const addFolder = (id, block = '') => {
      const cleanId = String(id || '').trim();
      if (!cleanId || seen.has(cleanId)) return;
      seen.add(cleanId);
      const name = htmlToText(
        block.match(/<[^>]+class=["'][^"']*(?:folder-name|folder-title|text-break)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i)?.[1] ||
        block.match(/<span\b[^>]*>([\s\S]*?)<\/span>/i)?.[1] ||
        ''
      ).trim();
      folders.push({ id: cleanId, name: name || `Folder ${cleanId}` });
    };
    let match;
    const blockPattern = /<[^>]+class=["'][^"']*\bgallery-media-wrapper\b[^"']*["'][^>]*\bdata-id\s*=\s*["']?(\d{1,})[^>]*>[\s\S]*?(?=<[^>]+class=["'][^"']*\bgallery-media-wrapper\b|$)/gi;
    while ((match = blockPattern.exec(body))) {
      addFolder(match[1], match[0]);
    }
    const tagPattern = /<[^>]+(?=[^>]*\bclass=["'][^"']*\bgallery-media-wrapper\b[^"']*["'])(?=[^>]*\bdata-id\s*=\s*["']?\d{1,})[^>]*>/gi;
    while ((match = tagPattern.exec(body))) {
      const tag = match[0];
      const id = tag.match(/\bdata-id\s*=\s*["']?(\d{1,})/i)?.[1] || '';
      const block = body.slice(match.index, Math.min(body.length, match.index + 1200));
      addFolder(id, block);
    }
    const folderIdPattern = /[?&;](?:amp;)?folderId=(\d{1,})\b|["']folderId["']\s*[:=]\s*["']?(\d{1,})\b|\bfolderId\s*[:=]\s*["']?(\d{1,})\b/gi;
    while ((match = folderIdPattern.exec(body))) addFolder(match[1] || match[2] || match[3], body.slice(Math.max(0, match.index - 500), Math.min(body.length, match.index + 900)));
    return folders;
  };
  const extractDreamAutoVideos = (html, sourceUrl, section, page) => {
    const items = [];
    let match;
    const containerPattern = /<[^>]+class=["'][^"']*\bmediaContainer\b[^"']*["'][^>]*>[\s\S]*?(?=<[^>]+class=["'][^"']*\bmediaContainer\b|$)/gi;
    while ((match = containerPattern.exec(String(html || '')))) {
      const block = match[0];
      const imgMatch = block.match(/<img\b([^>]*\bdata-id\s*=\s*["']?\d{2,}[^>]*)>/i);
      if (!imgMatch) continue;
      const attrs = imgMatch[1];
      const id = attrValue(attrs, 'data-id') || String(attrs).match(/\bdata-id\s*=\s*["']?(\d{2,})/i)?.[1] || '';
      const src = attrValue(attrs, 'src') || attrValue(attrs, 'data-src') || attrValue(attrs, 'data-original');
      const mp4 = block.match(/<a\b[^>]*href=["']([^"']*\.mp4[^"']*)["']/i)?.[1] || '';
      const thumbUrl = absolute(src, sourceUrl);
      const videoUrl = absolute(mp4, sourceUrl) || thumbUrl;
      if (!id || !thumbUrl) continue;
      items.push({
        source: 'dream-gallery',
        kind: 'video',
        id: `video:${id}`,
        galleryId: id,
        videoGalleryId: id,
        url: videoUrl,
        thumbUrl,
        originalThumbUrl: thumbUrl,
        mediaType: 'video',
        label: `Video ID ${id}`,
        section,
        page,
        index: items.length
      });
    }
    return items;
  };
  const extractDreamAutoVideoFolders = html => {
    const folders = [];
    const seen = new Set();
    let match;
    const body = String(html || '');
    const addFolder = (id, block = '') => {
      const cleanId = String(id || '').trim();
      if (!cleanId || seen.has(cleanId)) return;
      seen.add(cleanId);
      const name = htmlToText(
        block.match(/<[^>]+class=["'][^"']*\btext-break\b[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i)?.[1] ||
        block.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] ||
        block.match(/<span\b[^>]*>([\s\S]*?)<\/span>/i)?.[1] ||
        ''
      ).trim();
      folders.push({ id: cleanId, name: name || `Video Folder ${cleanId}` });
    };
    const blockPattern = /<[^>]+class=["'][^"']*\bfolderContainer\b[^"']*["'][^>]*\bdata-id\s*=\s*["']?(\d{1,})[^>]*>[\s\S]*?(?=<[^>]+class=["'][^"']*\bfolderContainer\b|$)/gi;
    while ((match = blockPattern.exec(body))) addFolder(match[1], match[0]);
    const tagPattern = /<[^>]+(?=[^>]*\bclass=["'][^"']*\bfolderContainer\b[^"']*["'])(?=[^>]*\bdata-id\s*=\s*["']?\d{1,})[^>]*>/gi;
    while ((match = tagPattern.exec(body))) {
      const tag = match[0];
      const id = tag.match(/\bdata-id\s*=\s*["']?(\d{1,})/i)?.[1] || '';
      const block = body.slice(match.index, Math.min(body.length, match.index + 1200));
      addFolder(id, block);
    }
    return folders;
  };

  async function fetchDreamAutoPhotoSection(section, basePath) {
    const first = await fetchText(basePath);
    const firstItems = extractDreamAutoPhotos(first.html, first.url, section, 1);
    recordStats(section, 1, firstItems.length, first.url);
    firstItems.forEach(addItem);
    for (let page = 2; page <= maxGalleryPages; page += 1) {
      const next = await fetchText(`${basePath}&page=${page}`);
      const items = extractDreamAutoPhotos(next.html, next.url, section, page);
      recordStats(section, page, items.length, next.url);
      if (!items.length) break;
      items.forEach(addItem);
    }
  }

  async function fetchDreamAutoPhotoFolders() {
    const foldersPage = await fetchText('/members/media/gallery/loadMediaFolders?selectable=0&createFolder=true&checkbox=1&mediaGalleryPage=accountOption');
    const folders = extractDreamAutoPhotoFolders(foldersPage.html);
    for (const folder of folders) {
      const basePath = `/members/media/gallery/loadImages?selectable=0&status=others&checkbox=true&mediaGalleryPage=accountOption&folderId=${encodeURIComponent(folder.id)}`;
      for (let page = 1; page <= maxGalleryPages; page += 1) {
        const result = await fetchText(page > 1 ? `${basePath}&page=${page}` : basePath);
        const items = extractDreamAutoPhotos(result.html, result.url, `others:${folder.name}`, page);
        recordStats(`others:${folder.name}`, page, items.length, result.url);
        items.forEach(addItem);
        if (!items.length) break;
      }
    }
  }

  async function fetchDreamAutoVideoFolders() {
    const foldersPage = await fetchText('/members/media/gallery/loadFolders/2');
    const folders = extractDreamAutoVideoFolders(foldersPage.html);
    for (const folder of folders) {
      const basePath = `/members/media/gallery/loadMedia/video?category=others&folderId=${encodeURIComponent(folder.id)}`;
      for (let page = 1; page <= maxGalleryPages; page += 1) {
        const result = await fetchText(page > 1 ? `${basePath}&page=${page}` : basePath);
        const items = extractDreamAutoVideos(result.html, result.url, `others:${folder.name}`, page);
        recordStats(`others:${folder.name}`, page, items.length, result.url);
        items.forEach(addItem);
        if (!items.length) break;
      }
    }
  }

  async function fetchDreamAutoVideoSection(section, basePath) {
    const first = await fetchText(basePath);
    const firstItems = extractDreamAutoVideos(first.html, first.url, section, 1);
    recordStats(section, 1, firstItems.length, first.url);
    firstItems.forEach(addItem);
    for (let page = 2; page <= maxGalleryPages; page += 1) {
      const next = await fetchText(`${basePath}&page=${page}`);
      const items = extractDreamAutoVideos(next.html, next.url, section, page);
      recordStats(section, page, items.length, next.url);
      if (!items.length) break;
      items.forEach(addItem);
    }
  };

  if (kind === 'photo') {
    await fetchDreamAutoPhotoSection('firstLetters', '/members/media/gallery/loadImages?selectable=0&status=firstLetters&checkbox=1&mediaGalleryPage=accountOption');
    await fetchDreamAutoPhotoSection('favorites', '/members/media/gallery/loadImages?selectable=0&status=favorite&checkbox=1&mediaGalleryPage=accountOption');
    await fetchDreamAutoPhotoSection('all', '/members/media/gallery/loadImages?selectable=0&checkbox=1&mediaGalleryPage=accountOption');
    await fetchDreamAutoPhotoFolders();
  } else {
    await fetchDreamAutoVideoSection('favorites', '/members/media/gallery/loadMedia/video?category=favorite');
    await fetchDreamAutoVideoSection('others', '/members/media/gallery/loadMedia/video?category=others');
    await fetchDreamAutoVideoFolders();
  }

  return { media: media.slice(0, 5000), stats };
}

function extractWorkspaceReplyPostError(html = '') {
  const normalizeError = value => {
    const error = cleanWorkspaceLetterText(htmlToText(value)).trim();
    if (!error || /^(?:x|×|&times;|close)$/i.test(error)) return '';
    return error;
  };
  const alertMatch = String(html).match(/<[^>]+class=["'][^"']*(?:alert-danger|error|message-error)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i);
  if (alertMatch) {
    const error = normalizeError(alertMatch[1]);
    if (error) return error;
  }
  const text = htmlToText(html).slice(0, 1600);
  if (/sign in|login|authorization|required to log/i.test(text)) return 'Dream Singles login is required';
  const known = text.match(/(?:message is too short|not enough credits|already sent|required field|please enter[^.]+|could not[^.]+)/i);
  return known ? known[0] : '';
}

async function sendWorkspaceReplyDirect(profileId, composeUrl = '', replyText = '', attachments = []) {
  const session = dreamSessions.get(String(profileId || ''));
  if (!session) {
    const error = new Error('Dream Singles profile is not connected on the server');
    error.status = 409;
    throw error;
  }
  const { memberId, replyId, page, view } = workspaceReplySendInfo(composeUrl);
  const media = workspaceReplyMediaForDirectSend(attachments);

  const sendUrl = replyId
    ? `https://www.dream-singles.com/members/messaging/compose/${encodeURIComponent(memberId)}?mode=inbox&page=${encodeURIComponent(page)}&view=${encodeURIComponent(view)}&replyId=${encodeURIComponent(replyId)}&date=`
    : `https://www.dream-singles.com/members/messaging/compose/${encodeURIComponent(memberId)}`;

  const composeResponse = await agencyFetch(sendUrl, {
    method: 'GET',
    headers: { Accept: 'text/html' }
  }, session.jar);
  const composeHtml = await composeResponse.text();
  if (!composeResponse.ok || dreamPageLooksLoggedOut(composeHtml, composeResponse.url)) {
    throw new Error(extractWorkspaceReplyPostError(composeHtml) || 'Dream Singles login is required');
  }

  const composeForm = findForm(composeHtml, form =>
    /messaging_compose|plainMessage|htmlMessage|save draft|send/i.test(form.html)
  );
  if (!composeForm) throw new Error('Dream reply form was not found');

  const body = new URLSearchParams();
  for (const field of [...composeForm.inputs, ...(composeForm.textareas || []), ...(composeForm.selects || [])]) {
    const name = String(field.name || '').trim();
    if (!name) continue;
    const type = String(field.type || '').toLowerCase();
    if (['button', 'image', 'file'].includes(type)) continue;
    if ((type === 'checkbox' || type === 'radio') && field.checked === undefined) continue;
    body.append(name, String(field.value || ''));
  }

  const setFirst = (names, value) => {
    const existing = names.find(name => body.has(name));
    body.set(existing || names[0], value);
  };
  setFirst(['messaging_compose[plainMessage]', 'messaging_compose[message]', 'plainMessage', 'message', 'body'], replyText);
  if (body.has('messaging_compose[htmlMessage]')) body.set('messaging_compose[htmlMessage]', '');
  if (body.has('messaging_compose[replyId]')) body.set('messaging_compose[replyId]', replyId || body.get('messaging_compose[replyId]') || '');
  if (body.has('messaging_compose[type]')) body.set('messaging_compose[type]', body.get('messaging_compose[type]') || 'plain_message');
  if (body.has('messaging_compose[buttonClicked]')) body.set('messaging_compose[buttonClicked]', '1');
  if (body.has('messaging_compose[galleryId]')) body.set('messaging_compose[galleryId]', media.galleryId || '');
  if (body.has('messaging_compose[videoGalleryId]')) body.set('messaging_compose[videoGalleryId]', media.videoGalleryId || '');
  if (body.has('messaging_compose[videoReply]')) body.set('messaging_compose[videoReply]', '1');
  if (body.has('messaging_compose[submit2]')) body.set('messaging_compose[submit2]', '1');
  const submit = composeForm.inputs.find(input => {
    const type = String(input.type || '').toLowerCase();
    return ['submit', 'button'].includes(type) && input.name && /send|submit|reply/i.test(`${input.value || ''} ${input.name || ''}`);
  }) || composeForm.buttons.find(button => button.name && /send|submit|reply/i.test(`${button.text || ''} ${button.value || ''} ${button.name || ''}`));
  if (submit?.name) body.set(submit.name, submit.value || submit.text || 'Send');

  const method = String(composeForm.formAttrs.method || 'POST').toUpperCase();
  const actionUrl = new URL(composeForm.formAttrs.action || composeResponse.url || sendUrl, composeResponse.url || sendUrl);
  let targetUrl = actionUrl.toString();
  let requestBody = body;
  const headers = { Accept: 'text/html', Referer: composeResponse.url || sendUrl };
  if (method === 'GET') {
    for (const [key, value] of body.entries()) actionUrl.searchParams.set(key, value);
    targetUrl = actionUrl.toString();
    requestBody = undefined;
  } else {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }

  const headersObject = new Headers(headers);
  const cookie = cookieHeader(session.jar);
  if (cookie) headersObject.set('Cookie', cookie);
  const response = await fetch(targetUrl, {
    method,
    headers: headersObject,
    body: requestBody,
    redirect: 'manual'
  });
  storeResponseCookies(response.headers, session.jar);
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    session.lastUsedAt = new Date().toISOString();
    return {
      ok: true,
      url: new URL(response.headers.get('location') || targetUrl, targetUrl).toString(),
      background: true,
      redirected: true
    };
  }
  const html = await response.text().catch(() => '');
  session.lastUsedAt = new Date().toISOString();
  if (response.status === 429) throw new Error('Dream Singles rate limit reached. Try again later.');
  if (!response.ok || dreamPageLooksLoggedOut(html, response.url)) {
    const error = extractWorkspaceReplyPostError(html);
    if (/already sent/i.test(error)) return { ok: true, url: response.url || targetUrl, background: true, alreadySent: true };
    throw new Error(error || `Dream Singles did not accept the reply (${response.status})`);
  }
  const error = extractWorkspaceReplyPostError(html);
  if (/already sent/i.test(error)) return { ok: true, url: response.url || targetUrl, background: true, alreadySent: true };
  if (error) throw new Error(error);
  return { ok: true, url: response.url || sendUrl, background: true };
}

function collectWorkspaceLetterHtml(html = '', sourceUrl = DREAM_INBOX_URL, fallbackName = '', fallbackId = '', directionOverride = '') {
  if (dreamPageLooksLoggedOut(html, sourceUrl)) return { requiresLogin: true };
  const direction = directionOverride || (/[?&]mode=sent\b/i.test(sourceUrl) ? 'outgoing' : 'incoming');
  const pageText = htmlToText(html);
  const mainHtml =
    extractElementById(html, 'senderMsg') ||
    extractElementById(html, 'mailBody') ||
    extractElementById(html, 'mainMess') ||
    extractElementById(html, 'messageHistory') ||
    extractElementById(html, 'message_history') ||
    extractElementsByClassName(html, 'letter-body')[0] ||
    extractElementsByClassName(html, 'read_message')[0] ||
    extractElementsByClassName(html, 'message-item')[0] ||
    html;

  const subject = cleanWorkspaceLetterText(
    htmlToText(html.match(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i)?.[1] || html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ''),
    fallbackName
  ).slice(0, 180);
  const dateText = pageText.match(/\b20\d{2}-\d{2}-\d{2}\s+\d{1,2}:\d{2}\b/)?.[0] ||
    pageText.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+20\d{2}(?:\s+\d{1,2}:\d{2})?\b/i)?.[0] || '';
  const rawText = htmlToText(mainHtml);
  const bodyText = cleanWorkspaceLetterText(rawText.replace(/^.*?\bREAD THE MESSAGE\b/si, ''), fallbackName).slice(0, 20000);

  const attachments = [];
  const seenAttachments = new Set();
  const attachmentHtml = [
    extractElementById(html, 'attachment'),
    extractElementById(html, 'attachments'),
    extractElementById(html, 'video'),
    extractElementById(html, 'videos'),
    extractElementById(html, 'media'),
    ...extractElementsByClassName(html, 'attachment'),
    ...extractElementsByClassName(html, 'attachments'),
    ...extractElementsByClassName(html, 'mail-attachment'),
    ...extractElementsByClassName(html, 'message-attachment'),
    ...extractElementsByClassName(html, 'video'),
    ...extractElementsByClassName(html, 'videos'),
    ...extractElementsByClassName(html, 'boomerang'),
    ...extractElementsByClassName(html, 'media'),
    ...extractElementsByClassName(html, 'gallery')
  ].filter(Boolean).join('\n');
  const addAttachment = (type, url, label = '') => {
    const cleanUrl = String(url || '').trim();
    if (!cleanUrl || seenAttachments.has(cleanUrl)) return;
    if (!/(^|\.)dream-singles\.com\//i.test(cleanUrl) && !/profile-photos-cdn|dream-singles/i.test(cleanUrl)) return;
    seenAttachments.add(cleanUrl);
    attachments.push({ type, url: cleanUrl, label: cleanWorkspaceText(label || '') });
  };
  const attachmentTypeForUrl = (url = '', context = '') => {
    const source = `${url} ${context}`;
    if (/\.(?:mp4|webm|mov|m4v)(?:[?#]|$)|\/(?:video|videos|movie|movies|watch|play)\b|video[_-]?gallery|boomerang/i.test(source)) return 'video';
    if (/\.(?:jpe?g|png|webp|gif|bmp|avif)(?:[?#]|$)|\/(?:photo|image|gallery)\b/i.test(source)) return 'image';
    return '';
  };
  for (const img of attachmentHtml.matchAll(/<img\b[^>]*>/gi)) {
    const src = absoluteDreamUrl(attrFromTag(img[0], 'src') || attrFromTag(img[0], 'data-src'), sourceUrl);
    if (src && !/logo|banner|sprite|icon|captcha|avatar|emoji|smil|emoticon/i.test(src)) addAttachment('image', src);
  }
  for (const video of attachmentHtml.matchAll(/<video\b[^>]*>[\s\S]*?<\/video>|<video\b[^>]*>/gi)) {
    const block = video[0] || '';
    const src = absoluteDreamUrl(attrFromTag(block, 'src'), sourceUrl);
    const sourceSrc = absoluteDreamUrl(block.match(/<source\b[^>]*\bsrc=["']([^"']+)["']/i)?.[1] || '', sourceUrl);
    const poster = absoluteDreamUrl(attrFromTag(block, 'poster'), sourceUrl);
    if (src) addAttachment('video', src, 'Video');
    if (sourceSrc) addAttachment('video', sourceSrc, 'Video');
    if (!src && !sourceSrc && poster) addAttachment('image', poster, 'Video preview');
  }
  for (const anchor of attachmentHtml.matchAll(/<a\b[^>]*href=["'][^"']+\.(?:mp4|webm|mov|m4v|jpe?g|png|webp|gif)(?:[?#][^"']*)?["'][^>]*>/gi)) {
    const href = absoluteDreamUrl(attrFromTag(anchor[0], 'href'), sourceUrl);
    if (href) addAttachment(/\.(?:mp4|webm|mov|m4v)(?:[?#]|$)/i.test(href) ? 'video' : 'image', href);
  }
  for (const tag of attachmentHtml.matchAll(/<(?:a|button|div|span)\b[^>]*>/gi)) {
    const rawTag = tag[0] || '';
    const context = `${rawTag} ${htmlToText(rawTag)}`;
    for (const attr of ['href', 'data-href', 'data-url', 'data-src', 'data-video-url', 'data-file', 'src']) {
      const url = absoluteDreamUrl(attrFromTag(rawTag, attr), sourceUrl);
      if (!url) continue;
      const type = attachmentTypeForUrl(url, context);
      if (type) addAttachment(type, url, type === 'video' ? 'Video' : 'Photo');
    }
  }

  const replyUrl = findWorkspaceComposeUrl(html, sourceUrl) || deriveWorkspaceComposeUrlFromReadUrl(sourceUrl);
  return {
    requiresLogin: false,
    subject,
    dateText,
    bodyText,
    sourceUrl,
    replyUrl,
    attachments: attachments.slice(0, 12),
    conversation: bodyText ? [{
      direction: direction === 'outgoing' ? 'outgoing' : 'incoming',
      author: direction === 'outgoing' ? 'Me' : (fallbackName || ''),
      dateText,
      text: bodyText
    }] : []
  };
}

function extractWorkspaceMessageHistoryCandidates(html = '') {
  const candidates = [];
  const addCandidate = (value = '') => {
    const block = String(value || '').trim();
    if (!block) return;
    const text = htmlToText(block);
    if (!/message history|(?:\d{1,2}:\d{2}\s*(?:am|pm)?\s*,\s*)?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+20\d{2}/i.test(text)) return;
    if (!candidates.includes(block)) candidates.push(block);
  };

  [
    'messageHistory',
    'message_history',
    'message-history',
    'mailHistory',
    'mail_history',
    'historyModal',
    'messageHistoryModal'
  ].forEach(id => addCandidate(extractElementById(html, id)));

  [
    'message-history',
    'messageHistory',
    'mail-history',
    'mailHistory',
    'history-modal',
    'modal-body'
  ].forEach(className => {
    extractElementsByClassName(html, className).forEach(addCandidate);
  });

  const lower = String(html || '').toLowerCase();
  let index = lower.indexOf('message history');
  while (index >= 0 && candidates.length < 8) {
    addCandidate(String(html || '').slice(Math.max(0, index - 2600), Math.min(String(html || '').length, index + 18000)));
    index = lower.indexOf('message history', index + 15);
  }

  return candidates;
}

function parseWorkspaceMessageHistoryHtml(html = '', fallbackName = '') {
  const source = String(html || '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ');
  const entries = [];
  const seen = new Set();
  const datePattern = String.raw`(?:(?:\d{1,2}:\d{2}\s*(?:am|pm)?\s*,\s*)?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+20\d{2}|20\d{2}-\d{2}-\d{2}\s+\d{1,2}:\d{2}|(?:\d{1,2}\/\d{1,2}\/20\d{2})\s+\d{1,2}:\d{2}(?::\d{2})?)`;
  const headerRegex = new RegExp(`^[-•\\s]*(?:(.{1,70}?)\\s*:\\s*)?(${datePattern})\\s*(.*)$`, 'i');
  const addEntry = (author = '', dateText = '', text = '') => {
    const cleanText = cleanWorkspaceLetterText(text, fallbackName).replace(/^message history\s*/i, '').trim();
    if (!cleanText || cleanText.length < 2) return;
    const cleanAuthor = cleanWorkspaceText(author).replace(/^message history$/i, '').slice(0, 80);
    const key = `${cleanAuthor}|${dateText}|${cleanText.slice(0, 500)}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    entries.push({
      author: cleanAuthor || '',
      dateText: cleanWorkspaceText(dateText),
      text: cleanText
    });
  };

  const itemMatches = Array.from(source.matchAll(/<li\b[^>]*>[\s\S]*?(?=<li\b|<\/(?:ul|ol)>|$)/gi));
  for (const match of itemMatches) {
    const text = htmlToText(match[0]);
    const lines = text.split(/\n+/).map(line => cleanWorkspaceText(line)).filter(Boolean);
    if (!lines.length) continue;
    const header = lines[0].match(headerRegex);
    if (!header) continue;
    const body = [header[3] || '', ...lines.slice(1)].filter(Boolean).join('\n');
    addEntry(header[1] || '', header[2] || '', body);
  }

  if (entries.length) return entries;

  const lines = htmlToText(source)
    .split(/\n+/)
    .map(line => cleanWorkspaceText(line))
    .filter(Boolean)
    .filter(line => !/^message history$/i.test(line) && !/^close$/i.test(line));
  let current = null;
  for (const line of lines) {
    const header = line.match(headerRegex);
    if (header) {
      if (current) addEntry(current.author, current.dateText, current.lines.join('\n'));
      current = { author: header[1] || '', dateText: header[2] || '', lines: [] };
      if (header[3]) current.lines.push(header[3]);
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) addEntry(current.author, current.dateText, current.lines.join('\n'));

  return entries;
}

function extractWorkspaceMessageHistoryId(html = '') {
  const source = String(html || '');
  return source.match(/showMessageHistory\s*\(\s*['"]([^'"]+)['"]\s*\)/i)?.[1] ||
    source.match(/\/members\/messaging\/readMessageHistory\/([^"'<>\s)]+)/i)?.[1] ||
    source.match(/\bid=["']which_message["'][^>]*\bvalue=["']([^"']+)["']/i)?.[1] ||
    source.match(/\bname=["']messaging_compose\[replyId\]["'][^>]*\bvalue=["']([^"']+)["']/i)?.[1] ||
    '';
}

function parseWorkspaceMessageHistoryJson(text = '', fallbackName = '') {
  let data;
  try {
    data = JSON.parse(String(text || ''));
  } catch {
    return [];
  }
  const rows = Array.isArray(data?.results) ? data.results : (Array.isArray(data) ? data : []);
  return rows
    .map(item => {
      const author = cleanWorkspaceText(item?.from_name || item?.author || fallbackName || '');
      const dateText = cleanWorkspaceText(item?.hyperlink || item?.date || item?.dateText || '');
      const timestamp = Number(item?.sent_datetime || item?.timestamp || 0);
      const readAt = Number(item?.read || item?.read_at || item?.readAt || 0) || 0;
      const senderValue = Number(item?.sender);
      const body = cleanWorkspaceLetterText(htmlToText(item?.body || item?.message || item?.text || ''), fallbackName);
      const attachmentHash = cleanWorkspaceText(item?.attachment_hash || item?.attachmentHash || '');
      const videoAttachmentHash = cleanWorkspaceText(item?.video_attachment_hash || item?.videoAttachmentHash || '');
      return {
        author,
        dateText: dateText || (timestamp ? new Date(timestamp * 1000).toLocaleString('en-US', {
          month: 'short',
          day: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }) : ''),
        text: body,
        sender: Number.isFinite(senderValue) ? senderValue : null,
        readAt,
        readAtText: readAt ? new Date(readAt * 1000).toLocaleString('en-US', {
          month: 'short',
          day: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }) : '',
        readByMan: senderValue === 0 && readAt > 0,
        msgId: cleanWorkspaceText(item?.msgId || item?.msg_id || ''),
        msgHash: cleanWorkspaceText(item?.msg_hash || item?.msgHash || ''),
        senderId: cleanWorkspaceText(item?.sender_id || item?.senderId || ''),
        receiverId: cleanWorkspaceText(item?.receiver_id || item?.receiverId || ''),
        sentTimestamp: timestamp || 0,
        attachmentHash,
        videoAttachmentHash,
        hasPhoto: Boolean(attachmentHash),
        hasVideo: Boolean(videoAttachmentHash),
        replyTo: cleanWorkspaceText(item?.reply_to || item?.replyTo || ''),
        isReply: Boolean(Number(item?.is_reply || 0)),
        repliedAt: Number(item?.replied || 0) || 0
      };
    })
    .filter(item => item.text);
}

function findWorkspaceMessageHistoryUrls(html = '', sourceUrl = DREAM_INBOX_URL) {
  const urls = [];
  const seen = new Set();
  const addUrl = (value = '') => {
    const url = absoluteDreamUrl(value, sourceUrl);
    if (!url || seen.has(url)) return;
    if (!/(^|\.)dream-singles\.com\//i.test(url) && !/^https:\/\/www\.dream-singles\.com\//i.test(url)) return;
    if (!/history|message|messaging|reply/i.test(url)) return;
    seen.add(url);
    urls.push(url);
  };

  for (const tag of String(html || '').matchAll(/<(?:a|button)\b[^>]*>[\s\S]*?<\/(?:a|button)>/gi)) {
    const text = htmlToText(tag[0]);
    if (!/message history|history/i.test(text)) continue;
    ['href', 'data-url', 'data-href', 'data-remote', 'data-action'].forEach(attr => addUrl(attrFromTag(tag[0], attr)));
    for (const quoted of tag[0].matchAll(/["']([^"']*(?:history|message)[^"']*)["']/gi)) addUrl(quoted[1]);
  }
  for (const quoted of String(html || '').matchAll(/["']([^"']*(?:message[_-]?history|history)[^"']*)["']/gi)) {
    addUrl(quoted[1]);
  }
  return urls.slice(0, 6);
}

function workspaceHistoryMonthPrefix(timestamp = 0) {
  const date = new Date((Number(timestamp) || 0) * 1000);
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 2000) return '';
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}${month}01`;
}

function buildWorkspaceHistoryReadUrl(entry = {}, context = {}) {
  const msgId = cleanWorkspaceText(entry.msgId || '');
  if (!msgId) return '';
  const monthPrefix = workspaceHistoryMonthPrefix(entry.sentTimestamp);
  if (!monthPrefix) return '';
  const version = cleanWorkspaceText(
    String(context.historyPrefix || '').match(/_v\d+/i)?.[0]?.slice(1) || 'v20250103'
  );
  const isOutgoing = Number(entry.sender) === 0;
  const boxPrefix = `${isOutgoing ? 'letters_women_sent' : 'letters_read'}_${monthPrefix}_${version}`;
  const url = new URL(`/members/messaging/read/${boxPrefix}:${msgId}`, context.baseUrl || DREAM_INBOX_URL);
  url.searchParams.set('mode', isOutgoing ? 'sent' : 'inbox');
  url.searchParams.set('page', '1');
  url.searchParams.set('view', 'all');
  return url.toString();
}

async function collectWorkspaceMessageHistory(profileId, rawUrl = '', fallbackName = '') {
  const composeUrl = await resolveWorkspaceReplyComposeUrl(profileId, rawUrl);
  const page = await dreamSessionFetch(profileId, composeUrl);
  const historyId = extractWorkspaceMessageHistoryId(page.html);
  if (historyId) {
    const historyUrl = new URL(`/members/messaging/readMessageHistory/${historyId}`, page.url || composeUrl).toString();
    const historyPage = await dreamSessionFetch(profileId, historyUrl, {
      headers: {
        ...DREAM_XHR_HEADERS,
        Accept: 'application/json, text/javascript, */*; q=0.01',
        Referer: page.url || composeUrl
      }
    });
    const jsonEntries = parseWorkspaceMessageHistoryJson(historyPage.html, fallbackName);
    if (jsonEntries.length) {
      const historyPrefix = String(historyId || '').split(':')[0] || '';
      const entries = jsonEntries.map(entry => ({
        ...entry,
        historyUrl: buildWorkspaceHistoryReadUrl(entry, {
          historyPrefix,
          baseUrl: page.url || composeUrl
        })
      }));
      return { composeUrl, sourceUrl: historyPage.url || historyUrl, source: 'dream-json', historyId, historyPrefix, entries };
    }
  }
  const candidates = extractWorkspaceMessageHistoryCandidates(page.html);
  for (const candidate of candidates) {
    const entries = parseWorkspaceMessageHistoryHtml(candidate, fallbackName);
    if (entries.length) return { composeUrl, sourceUrl: page.url || composeUrl, source: 'compose', entries };
  }

  const ajaxUrls = findWorkspaceMessageHistoryUrls(page.html, page.url || composeUrl);
  for (const url of ajaxUrls) {
    try {
      const historyPage = await dreamSessionFetch(profileId, url, {
        headers: {
          Referer: page.url || composeUrl,
          'X-Requested-With': 'XMLHttpRequest'
        }
      });
      const blocks = extractWorkspaceMessageHistoryCandidates(historyPage.html);
      const directEntries = parseWorkspaceMessageHistoryHtml(historyPage.html, fallbackName);
      if (directEntries.length) return { composeUrl, sourceUrl: historyPage.url || url, source: 'ajax', entries: directEntries };
      for (const block of blocks) {
        const entries = parseWorkspaceMessageHistoryHtml(block, fallbackName);
        if (entries.length) return { composeUrl, sourceUrl: historyPage.url || url, source: 'ajax', entries };
      }
    } catch {}
  }

  return { composeUrl, sourceUrl: page.url || composeUrl, source: 'compose', entries: [] };
}

function collectWorkspaceInboxHtml(html = '', sourceUrl = DREAM_INBOX_URL, targetId = '') {
  if (dreamPageLooksLoggedOut(html, sourceUrl)) return { requiresLogin: true, letters: [] };

  const isSentMode = /[?&]mode=sent\b/i.test(sourceUrl);
  const isInboxMode = /\/members\/messaging\/inbox(?:[?#]|$)/i.test(sourceUrl);
  const expectedId = String(targetId || '').trim();
  const datePattern = /\b20\d{2}-\d{2}-\d{2}\s+\d{1,2}:\d{2}\b/;
  const systemBlock = text => /(?:Delete All Messages|Are you sure you want to delete ALL messages|There are no messages|personal folders)/i.test(String(text || ''));
  const hasReplyMarker = block => /(?:fa-reply|glyphicon-share-alt|icon-reply|reply-status|replied|answered|answer(?:ed)?|&#8617;|&#x21a9;)/i.test(String(block || '')
    .replace(/<a\b[^>]*>\s*(?:\S+\s+)?READ THE MESSAGE\s*<\/a>/ig, ''));
  const hasAttachmentMarker = block => /(?:paperclip|fa-paperclip|glyphicon-paperclip|icon-attach|attachment|attach-file|clip|&#128206;|&#x1f4ce;)/i.test(String(block || ''));

  const blocks = [];
  let match;
  const messageItemPattern = /<[^>]+class=["'][^"']*message-list-item[^"']*["'][\s\S]*?(?=<[^>]+class=["'][^"']*message-list-item|<\/body>|$)/gi;
  while ((match = messageItemPattern.exec(html))) blocks.push(match[0]);
  if (!blocks.length) {
    const readPattern = /(?:<tr\b[\s\S]*?read the message[\s\S]*?<\/tr>|<div\b[\s\S]{0,5000}?read the message[\s\S]{0,2500}?<\/div>)/gi;
    while ((match = readPattern.exec(html))) blocks.push(match[0]);
  }
  if (!blocks.length) {
    const anchorPattern = /<a\b[^>]*href=["'][^"']*(?:messaging|message|inbox)[^"']*["'][^>]*>[\s\S]*?<\/a>/gi;
    while ((match = anchorPattern.exec(html))) {
      blocks.push(html.slice(Math.max(0, match.index - 2500), Math.min(html.length, anchorPattern.lastIndex + 2500)));
    }
  }

  const letters = [];
  const seen = new Set();
  const expectedIdPattern = expectedId ? new RegExp(`(?:^|\\D)${expectedId}(?:\\D|$)`) : null;
  for (const block of blocks) {
    const text = htmlToText(block);
    const hasMessageContent = /read the message|unread|\b20\d{2}-\d{2}-\d{2}\b/i.test(text);
    if (!hasMessageContent || (systemBlock(text) && !/read the message|\b20\d{2}-\d{2}-\d{2}\s+\d{1,2}:\d{2}\b/i.test(text))) continue;
    const idMatch = block.match(/(?:^|\/)(\d{4,})\.html(?:[?#"']|$)/i) ||
      block.match(/[?&](?:id|member_id|profile_id)=(\d{4,})\b/i) ||
      text.match(/\bID\s*:?\s*(\d{4,})\b/i) ||
      text.match(/\b(\d{4,})\b/);
    const id = expectedIdPattern?.test(`${block} ${text}`) ? expectedId : (idMatch?.[1] || '');
    if (!id || (expectedId && id !== expectedId)) continue;

    const linkPattern = new RegExp(`<a\\b[^>]*href=["'][^"']*(?:${id}\\.html|id=${id}|member_id=${id}|profile_id=${id})[^"']*["'][^>]*>[\\s\\S]*?<\\/a>`, 'gi');
    const linkTags = Array.from(block.matchAll(linkPattern), item => item[0]);
    const linkTag = linkTags[0] || '';
    const name = linkTags.map(tag => normalizeWorkspaceNameCandidate(htmlToText(tag))).find(Boolean) ||
      workspaceNameNearId(text, id) ||
      normalizeWorkspaceNameCandidate(text.match(new RegExp(`([A-Za-z][A-Za-z' -]{1,40})\\s+(?:ID\\s*)?${id}\\b`, 'i'))?.[1] || '') ||
      `Man ${id}`;
    const dateText = text.match(datePattern)?.[0] || '';
    const imgTag = block.match(/<img\b[^>]*>/i)?.[0] || '';
    const photoUrl = absoluteDreamUrl(attrFromTag(imgTag, 'src') || attrFromTag(imgTag, 'data-src') || '', sourceUrl);
    const messageTag = block.match(/<a\b[^>]*href=["'][^"']*(?:messaging|message|inbox)[^"']*["'][^>]*>[\s\S]*?(?:read the message|open|<\/a>)/i)?.[0] || '';
    const messageHref = attrFromTag(messageTag, 'href') || attrFromTag(linkTag, 'href');
    const profileHref = attrFromTag(linkTag, 'href') || `/${id}.html`;
    const messageLink = absoluteDreamUrl(messageHref, sourceUrl);
    const profileLink = absoluteDreamUrl(profileHref, sourceUrl);
    const unreadBlock = block.replace(/Delete\s+All\s+Unread/ig, '');
    const unread = isInboxMode && (/<[^>]+class=["'][^"']*(?:\bunread\b|status|state|read)[^"']*["'][^>]*>\s*Unread\s*<\/[^>]+>/i.test(unreadBlock) ||
      /<button\b[^>]*>\s*Unread\s*<\/button>/i.test(unreadBlock) ||
      /<span\b[^>]*>\s*Unread\s*<\/span>/i.test(unreadBlock));
    const answered = isInboxMode && hasReplyMarker(block);
    const snippet = (workspaceReplyPreview(text) || cleanWorkspaceText(text
      .replace(/READ THE MESSAGE/ig, ' ')
      .replace(/Unread/ig, ' ')
      .replace(datePattern, ' ')
      .replace(new RegExp(`\\b(?:ID\\s*:?\\s*)?${id}\\b`, 'ig'), ' ')
      .replace(name, ' '))).slice(0, 260);
    const keyPart = messageLink || `${dateText || 'no-date'}:${letters.length}`;
    const key = `${isSentMode ? 'sent' : 'inbox'}:${id}:${keyPart}`;
    if (seen.has(key)) continue;
    seen.add(key);
    letters.push({
      key,
      id,
      name: cleanWorkspaceText(name).slice(0, 80),
      direction: isSentMode ? 'outgoing' : 'incoming',
      photoUrl,
      profileLink,
      messageLink,
      dateText,
      snippet,
      unread,
      unanswered: isInboxMode && !answered,
      attachmentsHint: hasAttachmentMarker(block),
      readByMan: isSentMode ? !unread : false,
      lettersCount: 1,
      sourceUrl
    });
  }
  return { requiresLogin: false, letters };
}

function workspaceInboxPageUrl(page = 1) {
  const url = new URL(DREAM_INBOX_URL);
  if (Number(page) > 1) url.searchParams.set('page', String(page));
  return url.toString();
}

function workspaceMessagingPageUrl(page = 1, options = {}) {
  const url = new URL(DREAM_INBOX_URL);
  const mode = String(options.mode || '').trim();
  const view = String(options.view || '').trim();
  const q = String(options.q || '').trim();
  if (mode) url.searchParams.set('mode', mode);
  url.searchParams.set('folder', '-1');
  url.searchParams.set('page', String(Math.max(1, Number(page) || 1)));
  if (view) url.searchParams.set('view', view);
  url.searchParams.set('fq', '');
  if (q) url.searchParams.set('q', q);
  url.searchParams.set('fd', '');
  url.searchParams.set('td', '');
  return url.toString();
}

function parseWorkspaceMessagingLastPage(html = '', sourceUrl = DREAM_INBOX_URL) {
  const pages = new Set([1]);
  const source = String(sourceUrl || DREAM_INBOX_URL);
  const hrefPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = hrefPattern.exec(String(html || '')))) {
    const href = match[1] || '';
    const text = htmlToText(match[2] || '');
    if (!/(?:page=|\bnext\b|\b\d+\b)/i.test(`${href} ${text}`)) continue;
    try {
      const url = new URL(href, source);
      const pageValue = Number(url.searchParams.get('page') || 1);
      if (Number.isFinite(pageValue) && pageValue > 0) pages.add(pageValue);
    } catch {}
    const textPage = Number(String(text || '').match(/^\d{1,4}$/)?.[0] || 0);
    if (Number.isFinite(textPage) && textPage > 0) pages.add(textPage);
  }
  const buttonPattern = /<(?:button|span|li)\b[^>]*>(\s*\d{1,4}\s*)<\/(?:button|span|li)>/gi;
  while ((match = buttonPattern.exec(String(html || '')))) {
    const pageValue = Number(htmlToText(match[1] || ''));
    if (Number.isFinite(pageValue) && pageValue > 0) pages.add(pageValue);
  }
  return Math.max(...pages);
}

function collectDreamOnlineFavorites(html = '', sourceUrl = 'https://www.dream-singles.com/members/connections/myFavorites?all=1&folder=-1') {
  const onlineIds = new Set();
  const rows = [];
  const rowPattern = /(?:<tr\b[\s\S]*?<\/tr>|<div\b[^>]*(?:class=["'][^"']*(?:favorite|member|profile|connection|man)[^"']*["'])[\s\S]*?<\/div>)/gi;
  let match;
  while ((match = rowPattern.exec(String(html || '')))) rows.push(match[0]);
  if (!rows.length) {
    const linkPattern = /<a\b[^>]*href=["'][^"']*\d{4,}\.html[^"']*["'][\s\S]*?<\/a>/gi;
    while ((match = linkPattern.exec(String(html || '')))) {
      rows.push(String(html || '').slice(Math.max(0, match.index - 1500), Math.min(String(html || '').length, linkPattern.lastIndex + 1500)));
    }
  }

  for (const row of rows) {
    const text = htmlToText(row);
    if (!/\bonline\b/i.test(text) && !/(?:online|green|available|chat-now)/i.test(row)) continue;
    if (/\boffline\b|last\s+seen|not\s+online/i.test(text)) continue;
    const id = row.match(/(?:^|\/)(\d{4,})\.html(?:[?#"']|$)/i)?.[1] ||
      row.match(/[?&](?:id|member_id|profile_id|manId|clientId)=(\d{4,})\b/i)?.[1] ||
      text.match(/\bID\s*:?\s*(\d{4,})\b/i)?.[1];
    if (id) onlineIds.add(id);
  }
  return [...onlineIds].map(id => ({ id, onlineNow: true, lastActivityText: 'Online now', sourceUrl }));
}

function collectDreamFavoriteIds(html = '') {
  const ids = new Set();
  const source = String(html || '');
  const linkPattern = /<a\b[^>]*href=["']([^"']*(?:\/|\b)(\d{4,})\.html[^"']*)["'][\s\S]*?<\/a>/gi;
  let match;
  while ((match = linkPattern.exec(source))) {
    const id = String(match[2] || '').trim();
    if (/^\d{4,}$/.test(id)) ids.add(id);
  }
  const idPattern = /\b(?:ID|id)\s*:?\s*(\d{4,})\b/g;
  while ((match = idPattern.exec(htmlToText(source)))) {
    const id = String(match[1] || '').trim();
    if (/^\d{4,}$/.test(id)) ids.add(id);
  }
  return [...ids];
}

async function syncDreamSiteFavorites(profileId) {
  const pageUrl = 'https://www.dream-singles.com/members/connections/myFavorites?all=1&folder=-1';
  const page = await dreamSessionFetch(profileId, pageUrl);
  const favoriteIds = collectDreamFavoriteIds(page.html);
  const db = readDb();
  const profile = getProfileStore(db, profileId, true);
  const favoriteSet = new Set(favoriteIds);
  const updatedAt = new Date().toISOString();
  let updated = 0;
  for (const man of Object.values(profile.men || {})) {
    const siteFavorite = favoriteSet.has(String(man.id || ''));
    if (man.siteFavorite !== siteFavorite) updated++;
    man.siteFavorite = siteFavorite;
    man.siteFavoriteUpdatedAt = updatedAt;
  }
  if (Array.isArray(profile.workspaceInbox)) {
    profile.workspaceInbox = profile.workspaceInbox.map(letter => ({
      ...letter,
      siteFavorite: favoriteSet.has(String(letter?.id || '')),
      siteFavoriteUpdatedAt: updatedAt
    }));
  }
  profile.updatedAt = updatedAt;
  writeDb(db);
  return {
    favoriteIds,
    favorites: favoriteIds.length,
    updated,
    checkedAt: updatedAt,
    sourceUrl: page.url || pageUrl
  };
}

function persistWorkspaceLetters(profileId, incoming = [], forcedDirection = 'incoming', options = {}) {
  const db = readDb();
  const profile = getProfileStore(db, profileId, true);
  const previousLetters = Array.isArray(profile.workspaceInbox) ? profile.workspaceInbox : [];
  const previous = new Map(previousLetters.map(letter => [String(letter?.key || ''), letter]).filter(([key]) => key));
  const seen = new Set();
  const now = new Date().toISOString();
  const direction = forcedDirection === 'outgoing' ? 'outgoing' : 'incoming';
  const replacePage = Math.max(0, Number(options.replacePage || 0) || 0);
  const replaceIds = new Set((Array.isArray(options.replaceIds) ? options.replaceIds : [])
    .map(id => String(id || '').trim())
    .filter(id => /^\d{4,}$/.test(id)));
  const replaceEmpty = options.replaceEmpty === true;

  const normalized = (Array.isArray(incoming) ? incoming : []).map((letter, index) => {
    const id = String(letter?.id || '').trim();
    if (!/^\d{4,}$/.test(id)) return null;
    const key = String(letter?.key || `${direction}:${id}:${letter?.dateText || index}`).trim();
    if (!key || seen.has(key)) return null;
    seen.add(key);
    const existing = previous.get(key) || {};
    const oldMan = profile.men?.[id] || {};
    return {
      key,
      id,
      direction,
      name: safeWorkspaceName(letter?.name, existing.name || oldMan.name, id).slice(0, 80),
      photoUrl: String(letter?.photoUrl || existing.photoUrl || oldMan.photoUrl || '').trim(),
      profileLink: String(letter?.profileLink || existing.profileLink || oldMan.profileLink || `https://www.dream-singles.com/${id}.html`).trim(),
      messageLink: String(letter?.messageLink || existing.messageLink || '').trim(),
      dateText: String(letter?.dateText || existing.dateText || '').trim().slice(0, 40),
      snippet: String(letter?.snippet || existing.snippet || '').trim().slice(0, 500),
      attachmentsHint: existing.attachmentsHint === true || letter?.attachmentsHint === true,
      unread: direction === 'incoming' && letter?.unread === true,
      unanswered: direction === 'incoming' && letter?.unanswered === true,
      readByMan: direction === 'outgoing' ? letter?.readByMan === true : false,
      lettersCount: Math.max(1, Number(letter?.lettersCount || existing.lettersCount || 1) || 1),
      dreamListPage: Math.max(1, Number(letter?.dreamListPage || existing.dreamListPage || 1) || 1),
      bodyText: String(existing.bodyText || letter?.bodyText || '').trim().slice(0, 20000),
      subject: String(existing.subject || letter?.subject || '').trim().slice(0, 200),
      sourceUrl: String(letter?.sourceUrl || existing.sourceUrl || '').trim(),
      readAt: existing.readAt || letter?.readAt || '',
      readError: String(letter?.readError || existing.readError || '').trim().slice(0, 300),
      conversation: Array.isArray(existing.conversation) ? existing.conversation : [],
      attachments: cleanWorkspaceAttachments(existing.attachments?.length ? existing.attachments : letter?.attachments),
      attachmentsChecked: existing.attachmentsChecked === true || letter?.attachmentsChecked === true,
      savedAt: now
    };
  }).filter(Boolean);

  const normalizedKeys = new Set(normalized.map(letter => letter.key));
  const canReplacePage = normalized.length > 0 || replaceEmpty;
  const shouldReplaceOldLetter = letter => {
    if (!canReplacePage || !replacePage || !replaceIds.size) return false;
    const id = String(letter?.id || letter?.profileId || '').trim();
    const oldDirection = String(letter?.direction || 'incoming') === 'outgoing' ? 'outgoing' : 'incoming';
    const oldPage = Math.max(1, Number(letter?.dreamListPage || 1) || 1);
    return replaceIds.has(id) && oldDirection === direction && oldPage === replacePage;
  };
  profile.workspaceInbox = [
    ...previousLetters.filter(letter => !normalizedKeys.has(String(letter?.key || '')) && !shouldReplaceOldLetter(letter)),
    ...normalized
  ].sort((a, b) => Date.parse(String(b.dateText || '').replace(' ', 'T')) - Date.parse(String(a.dateText || '').replace(' ', 'T')));

  for (const letter of normalized) {
    const old = profile.men[String(letter.id)] || {};
    profile.men[String(letter.id)] = {
      ...old,
      id: String(letter.id),
      name: safeWorkspaceName(letter.name, old.name, letter.id),
      lettersCount: Math.max(Number(old.lettersCount || 0), Number(letter.lettersCount || 1)),
      firstLetterDate: old.firstLetterDate || formatDateOnly(letter.dateText),
      lastLetterDate: newestDate(old.lastLetterDate, formatDateOnly(letter.dateText)),
      inboxLink: old.inboxLink || letter.messageLink || `https://www.dream-singles.com/members/messaging/inbox?q=${letter.id}`,
      profileLink: old.profileLink || letter.profileLink || `https://www.dream-singles.com/${letter.id}.html`,
      photoUrl: old.photoUrl || letter.photoUrl || '',
      note: old.note || '',
      status: normalizeStatus(old.status || ''),
      favorite: Boolean(old.favorite),
      pinned: Boolean(old.pinned),
      updatedAt: now
    };
  }

  profile.updatedAt = now;
  writeDb(db);
  return { letters: profile.workspaceInbox, imported: normalized.length };
}

async function syncDreamInbox(profileId, options = {}) {
  const maxPages = Math.min(20, Math.max(1, Number(options.maxPages || 3) || 3));
  const letters = [];
  const seen = new Set();
  for (let page = 1; page <= maxPages; page += 1) {
    const pageUrl = workspaceInboxPageUrl(page);
    const result = await dreamSessionFetch(profileId, pageUrl);
    const parsed = collectWorkspaceInboxHtml(result.html, result.url || pageUrl, '');
    if (parsed.requiresLogin) throw new Error('Dream Singles login is required');
    if (!parsed.letters.length) break;
    let addedOnPage = 0;
    for (const letter of parsed.letters) {
      const key = String(letter.key || '').trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      letters.push({ ...letter, dreamListPage: page });
      addedOnPage += 1;
    }
    if (!addedOnPage) break;
  }
  return persistWorkspaceLetters(profileId, letters, 'incoming');
}

async function syncDreamWorkspaceMessages(profileId, options = {}) {
  const maxPages = Math.min(200, Math.max(1, Number(options.maxPages || 3) || 3));
  const exactPage = Math.max(0, Number(options.page || 0) || 0);
  const startPage = exactPage > 0 ? exactPage : 1;
  let endPage = exactPage > 0 ? exactPage : maxPages;
  const direction = options.direction === 'outgoing' ? 'outgoing' : 'incoming';
  const targetIds = new Set((Array.isArray(options.targets) ? options.targets : [])
    .map(item => String(item?.id || item || '').trim())
    .filter(id => /^\d{4,}$/.test(id)));
  const mode = direction === 'outgoing' ? 'sent' : 'inbox';
  const view = String(options.view || 'all').trim();
  const targetQuery = targetIds.size === 1 ? [...targetIds][0] : '';
  const stopAtShortPage = options.stopAtShortPage === true;
  const stopAtExisting = options.stopAtExisting === true && !exactPage && direction === 'incoming' && targetQuery;
  const shortPageSize = Math.max(1, Number(options.shortPageSize || 12) || 12);
  const letters = [];
  const seen = new Set();
  let emptyPages = 0;
  let discoveredLastPage = 1;
  let reachedExistingLetter = false;
  const existingKeys = new Set();
  if (stopAtExisting) {
    const db = readDb();
    const profile = getProfileStore(db, profileId, true);
    for (const letter of Array.isArray(profile.workspaceInbox) ? profile.workspaceInbox : []) {
      if (String(letter?.id || '').trim() === targetQuery && String(letter?.direction || 'incoming') !== 'outgoing') {
        const key = String(letter?.key || '').trim();
        if (key) existingKeys.add(key);
      }
    }
  }

  for (let page = startPage; page <= endPage && !reachedExistingLetter; page += 1) {
    const pageUrl = workspaceMessagingPageUrl(page, { mode, view, q: targetQuery });
    const result = await dreamSessionFetch(profileId, pageUrl);
    discoveredLastPage = Math.max(discoveredLastPage, parseWorkspaceMessagingLastPage(result.html, result.url || pageUrl));
    if (!exactPage && page === startPage && discoveredLastPage > 1) endPage = Math.min(maxPages, discoveredLastPage);
    const parsed = collectWorkspaceInboxHtml(result.html, result.url || pageUrl, targetQuery);
    if (parsed.requiresLogin) throw new Error('Dream Singles login is required');
    let pageLetters = parsed.letters || [];
    const hasTargetLetter = !targetQuery || pageLetters.some(letter => String(letter?.id || '').trim() === targetQuery);
    if (direction === 'incoming' && targetQuery && exactPage && !hasTargetLetter) {
      const fallbackUrl = workspaceMessagingPageUrl(page, { mode, view });
      const fallbackResult = await dreamSessionFetch(profileId, fallbackUrl);
      discoveredLastPage = Math.max(discoveredLastPage, parseWorkspaceMessagingLastPage(fallbackResult.html, fallbackResult.url || fallbackUrl));
      const fallbackParsed = collectWorkspaceInboxHtml(fallbackResult.html, fallbackResult.url || fallbackUrl, targetQuery);
      if (fallbackParsed.requiresLogin) throw new Error('Dream Singles login is required');
      pageLetters = [...pageLetters, ...(fallbackParsed.letters || [])];
    }
    if (!pageLetters.length) {
      emptyPages += 1;
      if (targetQuery && endPage > page && emptyPages < 3) continue;
      break;
    }

    let addedOnPage = 0;
    let matchingOnPage = 0;
    for (const letter of pageLetters) {
      const id = String(letter?.id || '').trim();
      if (targetIds.size && !targetIds.has(id)) continue;
      matchingOnPage += 1;
      const key = String(letter.key || '').trim();
      if (!key || seen.has(key)) continue;
      if (stopAtExisting && existingKeys.has(key)) {
        reachedExistingLetter = true;
        break;
      }
      seen.add(key);
      letters.push({ ...letter, dreamListPage: page });
      addedOnPage += 1;
    }

    if (reachedExistingLetter) break;
    if (addedOnPage) emptyPages = 0;
    else emptyPages += 1;
    if (!targetIds.size && !addedOnPage) break;
    if (targetQuery && emptyPages >= 3) break;
    if (!exactPage && targetQuery && stopAtShortPage && matchingOnPage > 0 && matchingOnPage < shortPageSize) break;
  }

  if (options.persist === false) {
    const db = readDb();
    const profile = getProfileStore(db, profileId, true);
    const previousLetters = Array.isArray(profile.workspaceInbox) ? profile.workspaceInbox : [];
    const previous = new Map(previousLetters.map(letter => [String(letter?.key || ''), letter]).filter(([key]) => key));
    const seenLive = new Set();
    const normalized = letters.map((letter, index) => {
      const id = String(letter?.id || '').trim();
      if (!/^\d{4,}$/.test(id)) return null;
      const key = String(letter?.key || `${direction}:${id}:${letter?.dateText || index}`).trim();
      if (!key || seenLive.has(key)) return null;
      seenLive.add(key);
      const existing = previous.get(key) || {};
      const oldMan = profile.men?.[id] || {};
      return {
        key,
        id,
        direction,
        name: safeWorkspaceName(letter?.name, existing.name || oldMan.name, id).slice(0, 80),
        photoUrl: String(letter?.photoUrl || existing.photoUrl || oldMan.photoUrl || '').trim(),
        profileLink: String(letter?.profileLink || existing.profileLink || oldMan.profileLink || `https://www.dream-singles.com/${id}.html`).trim(),
        messageLink: String(letter?.messageLink || existing.messageLink || '').trim(),
        dateText: String(letter?.dateText || existing.dateText || '').trim().slice(0, 40),
        snippet: String(letter?.snippet || existing.snippet || '').trim().slice(0, 500),
        attachmentsHint: existing.attachmentsHint === true || letter?.attachmentsHint === true,
        unread: direction === 'incoming' && letter?.unread === true,
        unanswered: direction === 'incoming' && letter?.unanswered === true,
        readByMan: direction === 'outgoing' ? letter?.readByMan === true : false,
        lettersCount: Math.max(1, Number(letter?.lettersCount || existing.lettersCount || 1) || 1),
        dreamListPage: Math.max(1, Number(letter?.dreamListPage || exactPage || existing.dreamListPage || 1) || 1),
        bodyText: String(existing.bodyText || letter?.bodyText || '').trim().slice(0, 20000),
        subject: String(existing.subject || letter?.subject || '').trim().slice(0, 200),
        sourceUrl: String(letter?.sourceUrl || existing.sourceUrl || '').trim(),
        readAt: existing.readAt || letter?.readAt || '',
        readError: String(letter?.readError || existing.readError || '').trim().slice(0, 300),
        conversation: Array.isArray(existing.conversation) ? existing.conversation : [],
        attachments: cleanWorkspaceAttachments(existing.attachments?.length ? existing.attachments : letter?.attachments),
        attachmentsChecked: existing.attachmentsChecked === true || letter?.attachmentsChecked === true,
        transient: true
      };
    }).filter(Boolean);
    return { letters: normalized, imported: normalized.length, lastPage: discoveredLastPage };
  }

  const persisted = persistWorkspaceLetters(profileId, letters, direction, {
    replacePage: exactPage,
    replaceIds: targetQuery ? [targetQuery] : [],
    replaceEmpty: exactPage > 0 && Boolean(targetQuery) && options.replaceEmpty === true
  });
  return { ...persisted, lastPage: discoveredLastPage };
}

async function fetchAgencyBonuses(user, options = {}) {
  const session = await openAgencyBonusesPage(user);
  const db = options.db || null;
  const viewerUser = options.viewerUser || user;
  const from = normalizeAgencyDate(options.from, new Date());
  const to = normalizeAgencyDate(options.to, new Date());
  const profileFilter = String(options.profileId || '').trim();
  const allowedProfileIds = new Set((options.allowedProfileIds || []).map(id => String(id || '').trim()).filter(Boolean));
  const allowedProfileList = [...allowedProfileIds];
  const form = findForm(session.html, item => /form\[[^\]]+\]/i.test(item.html)) || { inputs: [], selects: [] };
  const params = new URLSearchParams();
  for (const input of form.inputs || []) {
    if (input.name) params.set(input.name, input.value || '');
  }
  for (const select of form.selects || []) {
    if (select.name) params.set(select.name, select.value || '');
  }
  params.set('form[startDate]', from);
  params.set('form[endDate]', to);
  if (!params.has('form[type]')) params.set('form[type]', '0');
  if (profileFilter) {
    params.set('form[profileId]', profileFilter);
  } else if (allowedProfileIds.size || !params.has('form[profileId]')) {
    params.set('form[profileId]', '0');
  }
  params.set('form[groupBy]', String(options.groupBy ?? params.get('form[groupBy]') ?? '1'));
  params.set('form[extra]', profileFilter || (allowedProfileIds.size && allowedProfileList.length === 1 ? allowedProfileList[0] : params.get('form[extra]') || ''));
  const url = new URL('/finances/bonuses', session.credentials.baseUrl);
  url.search = params.toString();
  const response = await agencyFetch(url.toString(), { method: 'GET' }, session.jar);
  const html = await response.text();
  if (/type=["']?password/i.test(html)) throw new Error('Agency session expired while loading bonuses');
  const fetched = new Set([url.toString()]);
  const queue = parseAgencyBonusPageLinks(html, url.toString());
  const maxBonusPages = Math.min(1000, Math.max(1, Number(options.maxBonusPages || 500) || 500));
  let rows = parseAgencyBonusRows(html);
  for (let index = 0; index < queue.length && fetched.size < maxBonusPages; index += 1) {
    const pageUrl = queue[index];
    if (fetched.has(pageUrl)) continue;
    fetched.add(pageUrl);
    const pageResponse = await agencyFetch(pageUrl, { method: 'GET' }, session.jar);
    const pageHtml = await pageResponse.text();
    if (/type=["']?password/i.test(pageHtml)) throw new Error('Agency session expired while loading bonus pages');
    rows.push(...parseAgencyBonusRows(pageHtml));
    for (const nextUrl of parseAgencyBonusPageLinks(pageHtml, pageUrl)) {
      if (!fetched.has(nextUrl) && !queue.includes(nextUrl)) queue.push(nextUrl);
    }
  }
  rows = dedupeAgencyBonusRows(rows);
  if (profileFilter) {
    rows = rows.filter(row => profileIdFromAgencyRow(row, [profileFilter]) === profileFilter);
  }
  rows = rows.map(row => ({
    ...row,
    profileId: profileIdFromAgencyRow(row, allowedProfileIds.size ? allowedProfileList : (profileFilter ? [profileFilter] : [])) || profileFilter,
    summaryMonth: row.summaryOnly ? from.slice(0, 7) : '',
    summaryFrom: row.summaryOnly ? from : '',
    summaryTo: row.summaryOnly ? to : ''
  }));
  if (allowedProfileIds.size) {
    rows = rows.filter(row => row.profileId && allowedProfileIds.has(String(row.profileId)));
  }
  if (db && !options.skipAssignmentFilter && ['operator', 'admin'].includes(viewerUser.role)) {
    rows = rows.filter(row => rowVisibleForUserAssignment(db, viewerUser, row));
  }
  if (db && options.persist !== false) rows = persistAgencyBonusRows(db, rows, { profileId: profileFilter });
  const total = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  return { from, to, profileId: profileFilter, rows, count: rows.length, total: Math.round(total * 100) / 100, pagesFetched: fetched.size };
}

function resolveAgencyStatsUser(db, requester, profileId) {
  const id = String(profileId || '').trim();
  if (!id) return requester;
  const profile = db.profiles?.[id];
  if (!profile || profile.active === false) {
    const error = new Error('Profile not found');
    error.status = 404;
    throw error;
  }
  if (requester.role !== 'director' && !(requester.profileIds || []).includes(id)) {
    const error = new Error('Access is denied for this profile');
    error.status = 403;
    throw error;
  }
  const assignedOperator = Object.values(db.users || {}).find(user =>
    user.role === 'operator' &&
    user.active !== false &&
    (user.profileIds || []).includes(id) &&
    (requester.role === 'director' || user.managerId === requester.id)
  );
  if (assignedOperator) return assignedOperator;
  const assignedDirector = requester.role === 'director' && (requester.profileIds || []).includes(id)
    ? requester
    : null;
  return assignedDirector || requester;
}

function translationCacheKey(provider, targetLang, text) {
  return crypto.createHash('sha256')
    .update(`${provider}\n${targetLang}\n${String(text || '')}`)
    .digest('hex');
}

function pruneTranslationCache(cache = {}) {
  const entries = Object.entries(cache);
  if (entries.length <= 1000) return cache;
  const keep = entries
    .sort((a, b) => Date.parse(b[1]?.createdAt || 0) - Date.parse(a[1]?.createdAt || 0))
    .slice(0, 1000);
  return Object.fromEntries(keep);
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&#(\d+);/g, (_, decimal) => {
      const code = parseInt(decimal, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}

async function translateWithDeepL(apiKey, text, targetLang) {
  const host = apiKey.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
  const response = await fetch(`${host}/v2/translate`, {
    method: 'POST',
    headers: {
      'Authorization': `DeepL-Auth-Key ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      text: [text],
      target_lang: targetLang.split('-')[0].toUpperCase()
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || `DeepL returned ${response.status}`);
  return String(result.translations?.[0]?.text || '').trim();
}

async function translateWithGoogle(apiKey, text, targetLang) {
  const response = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, target: targetLang.toLowerCase(), format: 'text' })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error?.message || `Google Translate returned ${response.status}`);
  return decodeHtmlEntities(result.data?.translations?.[0]?.translatedText || '').trim();
}

function getRequestUser(req, db) {
  const token = parseCookies(req).crm_session;
  if (!token) return null;
  const session = db.sessions?.[crypto.createHash('sha256').update(token).digest('hex')];
  if (!session || Date.parse(session.expiresAt) <= Date.now()) return null;
  const user = db.users?.[session.userId];
  return user?.active === false ? null : user || null;
}

function getExtensionAccess(req, db) {
  const token = String(req.get('X-Dream-Team-Token') || '').trim();
  if (!token) return null;
  const key = crypto.createHash('sha256').update(token).digest('hex');
  const access = extensionTokens.get(key);
  if (!access || access.expiresAt <= Date.now()) {
    extensionTokens.delete(key);
    return null;
  }
  const user = db.users?.[access.userId];
  const profile = db.profiles?.[access.profileId];
  if (!user || user.active === false || !profile || profile.active === false) return null;
  if (!(user.profileIds || []).includes(access.profileId)) return null;
  return { user, profileId: access.profileId };
}

function createSession(res, db, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const key = crypto.createHash('sha256').update(token).digest('hex');
  db.sessions[key] = {
    userId,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  };
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const sameSite = process.env.NODE_ENV === 'production' ? 'None' : 'Lax';
  res.setHeader('Set-Cookie', `crm_session=${token}; HttpOnly; SameSite=${sameSite}; Path=/; Max-Age=2592000${secure}`);
}

function requireUser(req, res, next) {
  const db = readDb();
  const user = getRequestUser(req, db);
  if (!user) return res.status(401).json({ ok: false, error: 'Authentication required' });
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  requireUser(req, res, () => {
    if (!['director', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ ok: false, error: 'Administrator access required' });
    }
    next();
  });
}

function requireDirector(req, res, next) {
  requireUser(req, res, () => {
    if (req.user.role !== 'director') return res.status(403).json({ ok: false, error: 'Director access required' });
    next();
  });
}

function requireAdminPanelUser(req, res, next) {
  requireUser(req, res, () => {
    if (!['director', 'admin'].includes(req.user.role)) return res.status(403).json({ ok: false, error: 'Administrator access required' });
    next();
  });
}

function requireAdminPanelViewer(req, res, next) {
  requireUser(req, res, () => {
    if (!['director', 'admin', 'mentor'].includes(req.user.role)) return res.status(403).json({ ok: false, error: 'Administrator access required' });
    next();
  });
}

function resolveAdminPanelRequester(db, requester, adminId = '') {
  const targetId = String(adminId || '').trim();
  if (requester?.role === 'director' && targetId) {
    const target = db.users?.[targetId];
    if (!target || target.role !== 'admin' || target.active === false) {
      const error = new Error('Administrator not found');
      error.status = 400;
      throw error;
    }
    return target;
  }
  if (requester?.role !== 'mentor') return requester;
  const target = db.users?.[targetId];
  if (!target || target.role !== 'admin' || target.active === false) {
    const error = new Error('Choose an administrator');
    error.status = 400;
    throw error;
  }
  return target;
}

function adminPanelAdminsForOwner(db) {
  return Object.values(db.users || {})
    .filter(user => user.role === 'admin' && user.active !== false)
    .sort((a, b) => String(a.name || a.username || '').localeCompare(String(b.name || b.username || '')))
    .map(user => ({
      id: user.id,
      name: user.name || user.username || user.id,
      username: user.username || '',
      createdAt: user.createdAt || '',
      adminStartedAt: user.adminStartedAt || ''
    }));
}

function profilesForUser(db, user) {
  if (user.role === 'director') return [];
  const ids = user.profileIds || [];
  return [...new Set(ids)].map(id => db.profiles[id]).filter(profile => profile?.active !== false)
    .map(profile => ({
      id: profile.id,
      name: profile.name || `Profile ${profile.id}`,
      photoUrl: profile.photoUrl || '',
      googleDriveUrl: profile.googleDriveUrl || ''
    }));
}

function profilesForAdministration(db, user) {
  const ids = user.role === 'director'
    ? Object.keys(db.profiles || {})
    : Object.values(db.profiles || {})
      .filter(profile =>
        String(profile?.ownerAdminId || '') === String(user?.id || '') ||
        (user.profileIds || []).includes(String(profile?.id || ''))
      )
      .map(profile => String(profile.id));
  return ids.map(id => db.profiles[id]).filter(profile => profile?.active !== false)
    .map(profile => {
      const assigned = currentAssignedUserForProfile(db, profile.id);
      return {
        id: profile.id,
        name: profile.name || `Profile ${profile.id}`,
        photoUrl: profile.photoUrl || '',
        googleDriveUrl: profile.googleDriveUrl || '',
        ownerAdminId: profile.ownerAdminId || '',
        assignedUserId: assigned?.id || '',
        createdAt: profile.createdAt || '',
        hasCredentials: Boolean(profile.credentials?.login && profile.credentials?.password)
      };
    });
}

function userCanManageProfile(db, user, profileId) {
  const id = String(profileId || '');
  const profile = db.profiles?.[id];
  if (!profile || profile.active === false || !user || user.active === false) return false;
  if (user.role === 'director') return true;
  if (user.role === 'admin') return String(profile.ownerAdminId || '') === String(user.id || '') ||
    (user.profileIds || []).includes(id);
  return false;
}

function userHasWorkingProfile(db, user, profileId) {
  const id = String(profileId || '');
  if (!id || !user || user.active === false) return false;
  if (user.role === 'admin') {
    const assigned = currentAssignedUserForProfile(db, id);
    return String(assigned?.id || '') === String(user.id || '') ||
      (user.profileIds || []).includes(id);
  }
  return (user.profileIds || []).includes(id);
}

function savePhotoData(profileId, id, value) {
  if (!value || typeof value !== 'string') return '';

  const match = value.match(/^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return '';

  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > 2 * 1024 * 1024) return '';

  const safeProfileId = String(profileId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const profilePhotosDir = path.join(PHOTOS_DIR, safeProfileId);
  fs.mkdirSync(profilePhotosDir, { recursive: true });
  const extension = match[1] === 'jpeg' ? 'jpg' : match[1];
  const safeId = String(id).replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `${safeId}.${extension}`;
  fs.writeFileSync(path.join(profilePhotosDir, fileName), buffer);

  return `/photos/${safeProfileId}/${fileName}`;
}

function formatDateOnly(value) {
  if (!value) return '';

  const str = String(value).trim();
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(str)) return str;

  const date = new Date(str.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return str;

  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();

  return `${dd}.${mm}.${yyyy}`;
}

function parseDate(value) {
  if (!value) return 0;

  const str = String(value).trim();
  const m = str.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);

  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}`).getTime();

  const d = new Date(str.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function newestDate(a, b) {
  if (!a) return b || '';
  if (!b) return a || '';
  return parseDate(b) > parseDate(a) ? b : a;
}

function normalizeStatus(value) {
  const status = String(value || '');
  return ALLOWED_STATUSES.includes(status) ? status : '';
}

app.get('/api/auth/status', (req, res) => {
  const db = readDb();
  res.json({ ok: true, needsSetup: !Object.values(db.users || {}).some(user => user.role === 'director') });
});

app.post('/api/auth/setup', (req, res) => {
  const db = readDb();
  if (Object.values(db.users || {}).some(user => user.role === 'director')) {
    return res.status(409).json({ ok: false, error: 'Administrator already exists' });
  }

  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  if (username.length < 3 || password.length < 6) {
    return res.status(400).json({ ok: false, error: 'Use at least 3 characters for login and 6 for password' });
  }

  const id = crypto.randomUUID();
  const passwordData = hashPassword(password);
  const createdAt = new Date().toISOString();
  db.users[id] = {
    id, username, role: 'director', active: true, profileIds: [],
    profileAssignmentsInitialized: true,
    passwordSalt: passwordData.salt,
    passwordHash: passwordData.hash,
    createdAt,
    adminStartedAt: createdAt
  };
  createSession(res, db, id);
  writeDb(db);
  res.json({ ok: true, user: publicUser(db.users[id]), profiles: profilesForUser(db, db.users[id]) });
});

app.post('/api/auth/login', (req, res) => {
  const db = readDb();
  const username = String(req.body?.username || '').trim().toLowerCase();
  const clientType = String(req.body?.clientType || 'web').trim().toLowerCase();
  const user = Object.values(db.users || {}).find(item => item.username.toLowerCase() === username);
  if (!user || user.active === false || !passwordMatches(String(req.body?.password || ''), user)) {
    return res.status(401).json({ ok: false, error: 'Invalid login or password' });
  }
  if (user.role === 'operator' && clientType !== 'desktop') {
    return res.status(403).json({ ok: false, error: 'Operators can sign in only from the desktop app' });
  }
  createSession(res, db, user.id);
  writeDb(db);
  res.json({ ok: true, user: publicUser(user), profiles: profilesForUser(db, user) });
});

app.post('/api/auth/logout', (req, res) => {
  const db = readDb();
  const token = parseCookies(req).crm_session;
  if (token) delete db.sessions[crypto.createHash('sha256').update(token).digest('hex')];
  writeDb(db);
  res.setHeader('Set-Cookie', 'crm_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/auth/me', requireUser, (req, res) => {
  const db = readDb();
  res.json({ ok: true, user: publicUser(req.user), profiles: profilesForUser(db, req.user) });
});

app.patch('/api/auth/me', requireUser, (req, res) => {
  const db = readDb();
  const user = db.users?.[req.user.id];
  if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

  if (typeof req.body?.name === 'string') {
    user.name = String(req.body.name || '').trim() || user.username;
  }
  if (typeof req.body?.username === 'string') {
    const username = String(req.body.username || '').trim();
    if (username.length < 3) return res.status(400).json({ ok: false, error: 'Use at least 3 characters for login' });
    if (Object.values(db.users).some(item => item.id !== user.id && item.username.toLowerCase() === username.toLowerCase())) {
      return res.status(409).json({ ok: false, error: 'This login already exists' });
    }
    user.username = username;
  }
  if (req.body?.password) {
    if (String(req.body.password).length < 6) return res.status(400).json({ ok: false, error: 'Password is too short' });
    const passwordData = hashPassword(req.body.password);
    user.passwordSalt = passwordData.salt;
    user.passwordHash = passwordData.hash;
    user.sharedPassword = encryptCredential(req.body.password);
  }
  if (req.body?.translator && typeof req.body.translator === 'object') {
    const current = user.translator || {};
    const apiKey = String(req.body.translator.apiKey || '').trim();
    user.translator = {
      ...current,
      provider: normalizeTranslatorProvider(req.body.translator.provider || current.provider),
      targetLang: normalizeTranslatorLang(req.body.translator.targetLang || current.targetLang || 'RU'),
      replyTargetLang: normalizeTranslatorLang(req.body.translator.replyTargetLang || current.replyTargetLang || 'EN', 'EN'),
      updatedAt: new Date().toISOString()
    };
    if (apiKey) user.translator.apiKeyEncrypted = encryptCredential(apiKey);
    if (req.body.translator.clearApiKey === true) delete user.translator.apiKeyEncrypted;
  }
  writeDb(db);
  res.json({ ok: true, user: publicUser(user), profiles: profilesForUser(db, user) });
});

app.get('/api/translator/settings', requireUser, (req, res) => {
  const db = readDb();
  const user = db.users?.[req.user.id];
  res.json({ ok: true, settings: publicTranslatorSettings(user?.translator || {}) });
});

app.put('/api/translator/settings', requireUser, (req, res) => {
  const db = readDb();
  const user = db.users?.[req.user.id];
  if (!user) return res.status(404).json({ ok: false, error: 'User not found' });
  const current = user.translator || {};
  const provider = normalizeTranslatorProvider(req.body?.provider || current.provider);
  const targetLang = normalizeTranslatorLang(req.body?.targetLang || current.targetLang || 'RU');
  const replyTargetLang = normalizeTranslatorLang(req.body?.replyTargetLang || current.replyTargetLang || 'EN', 'EN');
  const apiKey = String(req.body?.apiKey || '').trim();
  user.translator = {
    ...current,
    provider,
    targetLang,
    replyTargetLang,
    updatedAt: new Date().toISOString()
  };
  if (apiKey) user.translator.apiKeyEncrypted = encryptCredential(apiKey);
  if (req.body?.clearApiKey === true) delete user.translator.apiKeyEncrypted;
  writeDb(db);
  res.json({ ok: true, settings: publicTranslatorSettings(user.translator) });
});

app.get('/api/agency/settings', requireDirector, (req, res) => {
  const db = readDb();
  const user = db.users?.[req.user.id];
  res.json({ ok: true, settings: publicAgencySettings(user?.agency || {}) });
});

app.put('/api/agency/settings', requireDirector, (req, res) => {
  const db = readDb();
  const user = db.users?.[req.user.id];
  if (!user) return res.status(404).json({ ok: false, error: 'User not found' });
  try {
    updateAgencySettings(user, req.body || {});
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message || 'Could not save Agency settings' });
  }
  writeDb(db);
  res.json({ ok: true, settings: publicAgencySettings(user.agency) });
});

app.post('/api/agency/test', requireDirector, async (req, res) => {
  const db = readDb();
  const user = db.users?.[req.user.id];
  if (!user) return res.status(404).json({ ok: false, error: 'User not found' });
  try {
    const testUser = { ...user, agency: { ...(user.agency || {}) } };
    if (req.body && Object.keys(req.body).length) {
      updateAgencySettings(testUser, req.body || {});
    }
    const result = await verifyAgencyAccess(testUser);
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message || 'Could not verify Agency access' });
  }
});

app.post('/api/admin/users/:id/agency/test', requireAdmin, async (req, res) => {
  const db = readDb();
  const user = db.users[String(req.params.id)];
  const manageable = user && user.role !== 'director' &&
    ((req.user.role === 'director' && user.role === 'admin') ||
      (req.user.role === 'admin' && user.role === 'operator' && user.managerId === req.user.id));
  if (!manageable) return res.status(404).json({ ok: false, error: 'User not found' });
  try {
    const testUser = { ...user, agency: { ...(user.agency || {}) } };
    updateAgencySettings(testUser, req.body || {});
    const result = await verifyAgencyAccess(testUser);
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message || 'Could not verify Agency access' });
  }
});

app.get('/api/agency/bonuses', requireUser, async (req, res) => {
  const db = readDb();
  const user = db.users?.[req.user.id];
  if (!user) return res.status(404).json({ ok: false, error: 'User not found' });
  try {
    const statsUser = resolveAgencyStatsUser(db, user, req.query?.profileId);
    const agencyUser = agencyAccessUserFor(db, statsUser, user);
    const result = await fetchAgencyBonuses(agencyUser, {
      db,
      viewerUser: user,
      from: req.query?.from,
      to: req.query?.to,
      profileId: req.query?.profileId
    });
    writeDb(db);
    res.json({ ok: true, agencyUserId: agencyUser.id, ...result });
  } catch (error) {
    res.status(error.status || 400).json({ ok: false, error: error.message || 'Could not load Agency bonuses' });
  }
});

app.get('/api/agency/ledger', requireUser, (req, res) => {
  const db = readDb();
  const user = db.users?.[req.user.id];
  if (!user) return res.status(404).json({ ok: false, error: 'User not found' });
  try {
    res.json({ ok: true, ...readAgencyLedgerView(db, user, req.query || {}) });
  } catch (error) {
    res.status(error.status || 400).json({ ok: false, error: error.message || 'Could not load fixed balance' });
  }
});

function adminPanelEffectiveDate(value) {
  const today = dreamBusinessDateKey(new Date());
  const requested = normalizeAgencyDate(value || today, new Date());
  const currentMonth = today.slice(0, 7);
  if (requested === `${currentMonth}-01`) return today;
  return requested;
}

app.get('/api/admin/operator-balances/today', requireAdminPanelViewer, (req, res) => {
  const db = readDb();
  const user = db.users?.[req.user.id];
  if (!user) return res.status(404).json({ ok: false, error: 'User not found' });
  try {
    const requester = resolveAdminPanelRequester(db, user, req.query?.adminId);
    const date = adminPanelEffectiveDate(req.query?.date);
    res.json({
      ok: true,
      mentorViewingAdminId: requester.id,
      selectedAdminId: user.role === 'director' && requester.role === 'admin' ? requester.id : '',
      adminPanelAdmins: user.role === 'director' ? adminPanelAdminsForOwner(db) : [],
      readOnly: ['director', 'mentor'].includes(user.role),
      ...readAdminOperatorBalancesForDay(db, requester, date)
    });
  } catch (error) {
    res.status(error.status || 400).json({ ok: false, error: error.message || 'Could not load operator balances' });
  }
});

function dashboardYearRange(value) {
  const fallbackYear = Number(dreamBusinessDateKey(new Date()).slice(0, 4));
  const year = Number(value || fallbackYear);
  const safeYear = Number.isFinite(year) && year >= 2000 && year <= 2100 ? year : fallbackYear;
  return {
    year: safeYear,
    from: `${safeYear}-01-01`,
    to: `${safeYear}-12-31`
  };
}

function dashboardMonthRange(year, monthValue) {
  const fallbackMonth = Number(dreamBusinessDateKey(new Date()).slice(5, 7));
  const month = Number(monthValue || fallbackMonth);
  const safeMonth = Number.isFinite(month) && month >= 1 && month <= 12 ? month : fallbackMonth;
  const from = `${year}-${String(safeMonth).padStart(2, '0')}-01`;
  const endDate = new Date(year, safeMonth, 0);
  const to = `${year}-${String(safeMonth).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
  return { month: safeMonth, from, to };
}

function dashboardOperatorsForRange(db, requester, from, to) {
  return managedOperatorsForAdminPanelRange(db, requester, from, to)
    .sort((a, b) =>
      Number(a.active === false) - Number(b.active === false) ||
      String(a.name || a.username || '').localeCompare(String(b.name || b.username || ''))
    );
}

app.get('/api/agencyos/dashboard/operators', requireAdminPanelViewer, (req, res) => {
  const db = readDb();
  const user = db.users?.[req.user.id];
  if (!user) return res.status(404).json({ ok: false, error: 'User not found' });
  try {
    const requester = resolveAdminPanelRequester(db, user, req.query?.adminId);
    const yearRange = dashboardYearRange(req.query?.year);
    const monthRange = dashboardMonthRange(yearRange.year, req.query?.month);
    const operators = dashboardOperatorsForRange(db, requester, monthRange.from, monthRange.to);
    const rows = operators.map(operator => {
      const ledger = readAgencyLedgerView(db, operator, {
        from: monthRange.from,
        to: monthRange.to,
        operatorId: operator.id
      });
      const salary = salaryInfoForTotal(ledger.totalWithoutGifts || 0, db.salaryRates, db.salaryFeePercent);
      return {
        operatorId: String(operator.id || ''),
        role: operator.role || 'operator',
        name: operator.name || operator.username || operator.id,
        login: operator.username || '',
        active: operator.active !== false,
        deletedAt: operator.deletedAt || '',
        income: salary.balance,
        gifts: Number(ledger.giftsTotal || 0),
        percent: salary.percent,
        salary: salary.salary,
        profileCount: profileIdsAssignedToUserInDateRange(db, operator, monthRange.from, monthRange.to).length
      };
    });
    res.json({ ok: true, year: yearRange.year, month: monthRange.month, rows });
  } catch (error) {
    res.status(error.status || 400).json({ ok: false, error: error.message || 'Could not load dashboard operators' });
  }
});

app.get('/api/agencyos/dashboard/bonuses', requireAdminPanelViewer, async (req, res) => {
  const db = readDb();
  const user = db.users?.[req.user.id];
  if (!user) return res.status(404).json({ ok: false, error: 'User not found' });
  try {
    const requester = resolveAdminPanelRequester(db, user, req.query?.adminId);
    const yearRange = dashboardYearRange(req.query?.year);
    const monthRange = dashboardMonthRange(yearRange.year, req.query?.month);
    const rawFrom = String(req.query?.from || '').trim();
    const rawTo = String(req.query?.to || '').trim();
    const requestedProfileId = String(req.query?.profileId || '').trim();
    let from = rawFrom ? normalizeAgencyDate(rawFrom, monthRange.from) : monthRange.from;
    let to = rawTo ? normalizeAgencyDate(rawTo, monthRange.to) : monthRange.to;
    if (from > to) [from, to] = [to, from];
    const operators = dashboardOperatorsForRange(db, requester, from, to);
    const operatorById = new Map(operators.map(operator => [String(operator.id || ''), operator]));
    const allowedProfileIds = new Set();
    for (const operator of operators) {
      for (const profileId of profileIdsAssignedToUserInDateRange(db, operator, from, to)) {
        allowedProfileIds.add(String(profileId || '').trim());
      }
    }
    const profiles = [...allowedProfileIds]
      .map(profileId => db.profiles?.[profileId])
      .filter(profile => profile && profile.active !== false)
      .map(profile => ({
        id: String(profile.id || ''),
        name: profile.name || `Profile ${profile.id}`
      }))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    if (requestedProfileId) {
      if (!allowedProfileIds.has(requestedProfileId)) {
        return res.json({ ok: true, live: true, year: yearRange.year, month: monthRange.month, from, to, profileId: requestedProfileId, count: 0, total: 0, giftsTotal: 0, profiles, rows: [] });
      }
      allowedProfileIds.clear();
      allowedProfileIds.add(requestedProfileId);
    }
    if (!allowedProfileIds.size) {
      return res.json({ ok: true, live: true, year: yearRange.year, month: monthRange.month, from, to, count: 0, total: 0, giftsTotal: 0, profiles, rows: [] });
    }
    const agencyUser = agencyAccessUserFor(db, requester, user);
    const liveResult = await fetchAgencyBonuses(agencyUser, {
      db,
      viewerUser: requester,
      from,
      to,
      profileId: requestedProfileId,
      allowedProfileIds: [...allowedProfileIds],
      skipAssignmentFilter: true,
      persist: false,
      maxBonusPages: 1000
    });
    if (Array.isArray(liveResult.rows) && liveResult.rows.length) {
      persistAgencyBonusRows(db, liveResult.rows, { profileId: requestedProfileId });
      writeDb(db);
    }
    const byKey = new Map();
    for (const row of liveResult.rows || []) {
      const gift = isAgencyGiftRow(row);
      const profileId = String(row.profileId || profileIdFromAgencyRow(row, [...allowedProfileIds]) || profileIdFromAgencyTarget(row.to) || '').trim();
      if (!profileId || !allowedProfileIds.has(profileId)) continue;
      const rowDate = parseAgencyRowDate(row.date);
      const assigned = assignedUserForProfileAt(db, profileId, rowDate);
      const operator = assigned?.id ? operatorById.get(String(assigned.id)) : null;
      if (!operator) continue;
      const key = row.id || agencyBonusLedgerKey({ ...row, profileId });
      byKey.set(`${String(operator.id || '')}:${key}`, {
        id: String(key || ''),
        type: row.type || '',
        by: row.byWhom || row.by || '',
        to: row.to || '',
        date: row.date || '',
        amount: Number(row.amount || 0),
        amountText: row.amountText || '',
        gift,
        profileId,
        profileName: db.profiles?.[profileId]?.name || profileId,
        operatorId: String(operator.id || ''),
        operatorName: operator.name || operator.username || operator.id,
        operatorLogin: operator.username || '',
        operatorRole: operator.role || 'operator'
      });
    }
    const rows = [...byKey.values()].sort((a, b) =>
      (parseAgencyRowDate(b.date)?.getTime() || 0) - (parseAgencyRowDate(a.date)?.getTime() || 0) ||
      String(a.operatorName || '').localeCompare(String(b.operatorName || ''))
    );
    const total = Math.round(rows.filter(row => !row.gift).reduce((sum, row) => sum + Number(row.amount || 0), 0) * 100) / 100;
    const giftsTotal = Math.round(rows.filter(row => row.gift).reduce((sum, row) => sum + Number(row.amount || 0), 0) * 100) / 100;
    res.json({ ok: true, live: true, year: yearRange.year, month: monthRange.month, from, to, profileId: requestedProfileId, count: rows.length, total, giftsTotal, profiles, rows });
  } catch (error) {
    res.status(error.status || 400).json({ ok: false, error: error.message || 'Could not load dashboard bonuses' });
  }
});

app.get('/api/agencyos/dashboard/operators/:id/calendar', requireAdminPanelViewer, (req, res) => {
  const db = readDb();
  const user = db.users?.[req.user.id];
  if (!user) return res.status(404).json({ ok: false, error: 'User not found' });
  try {
    const requester = resolveAdminPanelRequester(db, user, req.query?.adminId);
    const yearRange = dashboardYearRange(req.query?.year);
    const operators = dashboardOperatorsForRange(db, requester, yearRange.from, yearRange.to);
    const operator = operators.find(item => String(item.id || '') === String(req.params.id || ''));
    if (!operator) return res.status(404).json({ ok: false, error: 'Operator not found' });
    const ledger = readAgencyLedgerView(db, operator, {
      from: yearRange.from,
      to: yearRange.to,
      operatorId: operator.id
    });
    res.json({
      ok: true,
      year: yearRange.year,
      operator: {
        operatorId: String(operator.id || ''),
        name: operator.name || operator.username || operator.id,
        login: operator.username || '',
        active: operator.active !== false,
        deletedAt: operator.deletedAt || ''
      },
      dailyProfiles: ledger.dailyProfiles || [],
      totalsByProfile: ledger.totalsByProfile || [],
      monthlySalary: ledger.monthlySalary || [],
      total: ledger.total || 0
    });
  } catch (error) {
    res.status(error.status || 400).json({ ok: false, error: error.message || 'Could not load operator calendar' });
  }
});

app.post('/api/admin/operator-balances/today/refresh', requireAdminPanelViewer, async (req, res) => {
  const db = readDb();
  const user = db.users?.[req.user.id];
  if (!user) return res.status(404).json({ ok: false, error: 'User not found' });
  try {
    const requester = resolveAdminPanelRequester(db, user, req.body?.adminId);
    const date = adminPanelEffectiveDate(req.body?.date);
    const result = await refreshAdminOperatorBalancesForMonth(db, requester, date);
    writeDb(db);
    res.json({
      ok: true,
      mentorViewingAdminId: requester.id,
      selectedAdminId: user.role === 'director' && requester.role === 'admin' ? requester.id : '',
      adminPanelAdmins: user.role === 'director' ? adminPanelAdminsForOwner(db) : [],
      readOnly: ['director', 'mentor'].includes(user.role),
      ...result
    });
  } catch (error) {
    res.status(error.status || 400).json({ ok: false, error: error.message || 'Could not refresh operator balances' });
  }
});

app.post('/api/admin/operator-balances/day/refresh', requireAdminPanelViewer, async (req, res) => {
  const db = readDb();
  const user = db.users?.[req.user.id];
  if (!user) return res.status(404).json({ ok: false, error: 'User not found' });
  try {
    const requester = resolveAdminPanelRequester(db, user, req.body?.adminId);
    const date = adminPanelEffectiveDate(req.body?.date);
    const result = await refreshAdminOperatorBalancesForDay(db, requester, date);
    writeDb(db);
    res.json({
      ok: true,
      mentorViewingAdminId: requester.id,
      selectedAdminId: user.role === 'director' && requester.role === 'admin' ? requester.id : '',
      adminPanelAdmins: user.role === 'director' ? adminPanelAdminsForOwner(db) : [],
      readOnly: ['director', 'mentor'].includes(user.role),
      ...result
    });
  } catch (error) {
    res.status(error.status || 400).json({ ok: false, error: error.message || 'Could not refresh operator balances' });
  }
});

app.post('/api/agencyos/dashboard/operators/month-actual/refresh', requireAdminPanelViewer, async (req, res) => {
  const db = readDb();
  const user = db.users?.[req.user.id];
  if (!user) return res.status(404).json({ ok: false, error: 'User not found' });
  try {
    const requester = resolveAdminPanelRequester(db, user, req.body?.adminId);
    const yearRange = dashboardYearRange(req.body?.year);
    const monthRange = dashboardMonthRange(yearRange.year, req.body?.month);
    const today = dreamBusinessDateKey(new Date());
    const targetDay = normalizeAgencyDate(req.body?.date || today, new Date());
    const refreshDay = targetDay < monthRange.from
      ? monthRange.from
      : (targetDay > monthRange.to ? monthRange.to : targetDay);
    const maxDays = Math.max(1, Math.min(6, Number(req.body?.limit || 4) || 4));
    db.agencyDashboardBalanceRefreshes ||= {};
    const requesterKey = String(requester.id || '');
    db.agencyDashboardBalanceRefreshes[requesterKey] ||= {};
    const refreshMarks = db.agencyDashboardBalanceRefreshes[requesterKey];
    const autoFill = req.body?.auto === true;
    const forceToday = req.body?.force === true;
    const staleMs = Math.max(5, Math.min(120, Number(req.body?.staleMinutes || 15) || 15)) * 60 * 1000;
    const nowMs = Date.now();
    const monthDays = dateKeysInRange(monthRange.from, refreshDay).filter(day => day <= today);
    const pastMissingDays = autoFill
      ? monthDays.filter(day => day < today && !refreshMarks[day]).slice(0, Math.max(0, maxDays - 1))
      : [];
    const todayMarkMs = Date.parse(refreshMarks[today] || '');
    const shouldRefreshToday = today >= monthRange.from && today <= monthRange.to && today <= refreshDay && (
      forceToday ||
      !Number.isFinite(todayMarkMs) ||
      nowMs - todayMarkMs > staleMs
    );
    const refreshDays = [...pastMissingDays];
    if (shouldRefreshToday && refreshDays.length < maxDays) refreshDays.push(today);
    if (!autoFill && !forceToday && refreshDays.length === 0 && refreshDay <= today && !refreshMarks[refreshDay]) {
      refreshDays.push(refreshDay);
    }
    const remainingMissingBefore = monthDays.filter(day => day < today && !refreshMarks[day]).length;
    const refreshed = [];
    const skipped = [];
    for (const day of refreshDays) {
      if (day !== today && refreshMarks[day]) {
        skipped.push(day);
        continue;
      }
      await refreshAdminOperatorBalancesForDay(db, requester, day);
      refreshMarks[day] = new Date().toISOString();
      refreshed.push(day);
    }
    const remainingMissing = monthDays.filter(day => day < today && !refreshMarks[day]).length;
    if (!refreshDays.length) skipped.push(refreshDay);
    writeDb(db);
    res.json({
      ok: true,
      year: yearRange.year,
      month: monthRange.month,
      refreshed,
      skipped,
      remainingMissing,
      remainingMissingBefore,
      from: monthRange.from,
      to: refreshDay
    });
  } catch (error) {
    res.status(error.status || 400).json({ ok: false, error: error.message || 'Could not refresh monthly balances' });
  }
});

app.get('/api/admin/operator-balances/debug-agency', requireAdminPanelViewer, async (req, res) => {
  const db = readDb();
  const user = db.users?.[req.user.id];
  if (!user) return res.status(404).json({ ok: false, error: 'User not found' });
  try {
    const requester = resolveAdminPanelRequester(db, user, req.query?.adminId);
    const date = adminPanelEffectiveDate(req.query?.date);
    const { monthStart, monthEnd } = monthRangeForDateKey(date);
    const fetchTo = localDateKey(dreamBusinessDayBounds(monthEnd).end);
    const agencyUser = agencyAccessUserFor(db, requester);
    const profiles = profilesForAdministration(db, requester)
      .map(profile => ({ id: String(profile.id || ''), name: profile.name || profile.id || '' }))
      .filter(profile => profile.id);
    const attempts = [];
    for (const groupBy of ['0', '1', '2', '3', '4', '5']) {
      const result = await fetchAgencyBonuses(agencyUser, {
        from: monthStart,
        to: fetchTo,
        groupBy,
        skipAssignmentFilter: true
      });
      const rows = Array.isArray(result.rows) ? result.rows : [];
      attempts.push({
        groupBy,
        pagesFetched: result.pagesFetched || 0,
        rowsFetched: rows.length,
        totalFetched: result.total || 0,
        rows
      });
    }
    const bestAttempt = attempts
      .map(attempt => ({
        ...attempt,
        matchedCount: profiles.reduce((sum, profile) => sum + attempt.rows.filter(row => {
          const text = [
            row.profileId,
            row.to,
            row.byWhom,
            row.type,
            row.rawText,
            ...(Array.isArray(row.cells) ? row.cells : [])
          ].map(value => String(value || '')).join(' ');
          return text.includes(profile.id);
        }).length, 0)
      }))
      .sort((a, b) => b.matchedCount - a.matchedCount || b.rowsFetched - a.rowsFetched)[0] || { rows: [] };
    const rows = Array.isArray(bestAttempt.rows) ? bestAttempt.rows : [];
    const byProfile = profiles.map(profile => {
      const matches = rows.filter(row => {
        const text = [
          row.profileId,
          row.to,
          row.byWhom,
          row.type,
          row.rawText,
          ...(Array.isArray(row.cells) ? row.cells : [])
        ].map(value => String(value || '')).join(' ');
        return text.includes(profile.id);
      });
      return {
        id: profile.id,
        name: profile.name,
        rows: matches.length,
        total: roundMoney(matches.reduce((sum, row) => sum + Number(row.amount || 0), 0)),
        examples: matches.slice(0, 5).map(row => ({
          profileId: row.profileId || '',
          type: row.type || '',
          byWhom: row.byWhom || '',
          to: row.to || '',
          date: row.date || '',
          amount: row.amount || 0,
          rawText: String(row.rawText || '').slice(0, 300)
        }))
      };
    });
    res.json({
      ok: true,
      adminId: requester.id,
      adminName: requester.name || requester.username || requester.id,
      from: monthStart,
      to: fetchTo,
      bestGroupBy: bestAttempt.groupBy || '',
      attempts: attempts.map(({ rows, ...attempt }) => attempt),
      pagesFetched: bestAttempt.pagesFetched || 0,
      rowsFetched: rows.length,
      totalFetched: bestAttempt.totalFetched || 0,
      byProfile
    });
  } catch (error) {
    res.status(error.status || 400).json({ ok: false, error: error.message || 'Could not debug Agency bonuses' });
  }
});

app.patch('/api/admin/operator-balances/source', requireAdminPanelUser, (req, res) => {
  const db = readDb();
  const requester = db.users?.[req.user.id];
  if (!requester) return res.status(404).json({ ok: false, error: 'User not found' });
  if (requester.role !== 'admin') return res.status(403).json({ ok: false, error: 'Read only access' });
  const operatorId = String(req.body?.operatorId || '').trim();
  const source = String(req.body?.source || '').trim().slice(0, 80);
  const allowed = managedOperatorsForAdminPanel(db, requester)
    .some(user => String(user.id || '') === operatorId);
  if (!operatorId || !allowed || !db.users?.[operatorId]) {
    return res.status(404).json({ ok: false, error: 'Operator not found' });
  }
  db.users[operatorId].adminPanelSource = source;
  writeDb(db);
  res.json({ ok: true, operatorId, source });
});

app.patch('/api/admin/operator-balances/cell-color', requireAdminPanelUser, (req, res) => {
  const db = readDb();
  const requester = db.users?.[req.user.id];
  if (!requester) return res.status(404).json({ ok: false, error: 'User not found' });
  if (requester.role !== 'admin') return res.status(403).json({ ok: false, error: 'Read only access' });
  const month = String(req.body?.month || '').trim().slice(0, 7);
  const key = String(req.body?.key || '').trim().slice(0, 180);
  const color = String(req.body?.color || '').trim().toLowerCase();
  if (!/^\d{4}-\d{2}$/.test(month) || !key) {
    return res.status(400).json({ ok: false, error: 'Bad color target' });
  }
  if (color && !/^#[0-9a-f]{6}$/.test(color) && color !== 'обуч') {
    return res.status(400).json({ ok: false, error: 'Bad color value' });
  }
  db.adminPanelCellColors = normalizeAdminPanelCellColors(db.adminPanelCellColors);
  db.adminPanelCellColors[month] ||= {};
  if (color) db.adminPanelCellColors[month][key] = color;
  else delete db.adminPanelCellColors[month][key];
  writeDb(db);
  res.json({ ok: true, month, key, color, cellColors: db.adminPanelCellColors[month] || {} });
});

app.patch('/api/admin/operator-balances/cell-comment', requireAdminPanelUser, (req, res) => {
  const db = readDb();
  const requester = db.users?.[req.user.id];
  if (!requester) return res.status(404).json({ ok: false, error: 'User not found' });
  if (requester.role !== 'admin') return res.status(403).json({ ok: false, error: 'Read only access' });
  const month = String(req.body?.month || '').trim().slice(0, 7);
  const key = String(req.body?.key || '').trim().slice(0, 180);
  const comment = String(req.body?.comment || '').trim().slice(0, 20000);
  if (!/^\d{4}-\d{2}$/.test(month) || !key) {
    return res.status(400).json({ ok: false, error: 'Bad comment target' });
  }
  db.adminPanelCellComments = normalizeAdminPanelCellComments(db.adminPanelCellComments);
  db.adminPanelCellComments[month] ||= {};
  if (comment) db.adminPanelCellComments[month][key] = comment;
  else delete db.adminPanelCellComments[month][key];
  writeDb(db);
  res.json({ ok: true, month, key, comment, cellComments: db.adminPanelCellComments[month] || {} });
});

app.get('/api/admin/salary-rates', requireDirector, (req, res) => {
  const db = readDb();
  res.json({ ok: true, rates: normalizeSalaryRates(db.salaryRates), feePercent: normalizeSalaryFeePercent(db.salaryFeePercent) });
});

app.put('/api/admin/salary-rates', requireDirector, (req, res) => {
  const db = readDb();
  const rates = normalizeSalaryRates(req.body?.rates);
  db.salaryRates = rates;
  db.salaryFeePercent = normalizeSalaryFeePercent(req.body?.feePercent);
  writeDb(db);
  res.json({ ok: true, rates, feePercent: db.salaryFeePercent });
});

app.post('/api/translate', requireUser, async (req, res) => {
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ ok: false, error: 'Text is required' });
  if (text.length > 12000) return res.status(400).json({ ok: false, error: 'Text is too long to translate' });

  const db = readDb();
  const user = db.users?.[req.user.id];
  const settings = user?.translator || {};
  const provider = normalizeTranslatorProvider(req.body?.provider || settings.provider);
  const targetLang = normalizeTranslatorLang(req.body?.targetLang || settings.targetLang || 'RU');
  if (!settings.apiKeyEncrypted) return res.status(409).json({ ok: false, error: 'Translator API key is not configured' });

  const cacheKey = translationCacheKey(provider, targetLang, text);
  const cached = db.translationCache?.[cacheKey];
  if (cached?.translatedText) {
    return res.json({ ok: true, provider, targetLang, translatedText: cached.translatedText, cached: true });
  }

  let apiKey = '';
  try {
    apiKey = decryptCredential(settings.apiKeyEncrypted);
  } catch {
    return res.status(500).json({ ok: false, error: 'Translator API key could not be read' });
  }

  try {
    const translatedText = provider === 'google'
      ? await translateWithGoogle(apiKey, text, targetLang)
      : await translateWithDeepL(apiKey, text, targetLang);
    if (!translatedText) throw new Error('Translator returned empty text');
    db.translationCache = pruneTranslationCache({
      ...(db.translationCache || {}),
      [cacheKey]: {
        provider,
        targetLang,
        translatedText,
        createdAt: new Date().toISOString()
      }
    });
    writeDb(db);
    res.json({ ok: true, provider, targetLang, translatedText, cached: false });
  } catch (error) {
    res.status(502).json({ ok: false, error: error.message || 'Could not translate text' });
  }
});

app.get('/api/admin/users', requireUser, (req, res) => {
  const db = readDb();
  let users = [];
  if (req.user.role === 'director') {
    users = Object.values(db.users).filter(user => ['admin', 'mentor', 'operator'].includes(user.role) && user.active !== false);
  } else if (req.user.role === 'admin') {
    users = Object.values(db.users).filter(user => user.role === 'operator' && user.managerId === req.user.id && user.active !== false);
  } else if (req.user.role === 'operator') {
    const manager = db.users?.[req.user.managerId];
    users = manager && manager.role === 'admin' && manager.active !== false ? [manager] : [];
  } else if (req.user.role !== 'operator') {
    return res.status(403).json({ ok: false, error: 'Administrator access required' });
  }
  res.json({ ok: true, users: users.map(publicUser), profiles: profilesForAdministration(db, req.user) });
});

app.get('/api/mentor/admin-panels', requireUser, (req, res) => {
  if (req.user.role !== 'mentor') return res.status(403).json({ ok: false, error: 'Mentor access required' });
  const db = readDb();
  const admins = Object.values(db.users || {})
    .filter(user => user.role === 'admin' && user.active !== false)
    .sort((a, b) => String(a.name || a.username || '').localeCompare(String(b.name || b.username || '')))
    .map(user => ({
      id: user.id,
      name: user.name || user.username,
      username: user.username,
      createdAt: user.createdAt || '',
      adminStartedAt: user.adminStartedAt || ''
    }));
  res.json({ ok: true, admins });
});

app.post('/api/admin/profiles/resolve', requireAdmin, async (req, res) => {
  const login = String(req.body?.login || '').trim();
  const password = String(req.body?.password || '');
  try {
    const result = await resolveDreamSinglesAccess(login, password);
    res.json(result);
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message || 'Could not verify Dream Singles access' });
  }
});

app.post('/api/admin/profiles', requireAdmin, (req, res) => {
  const db = readDb();
  const id = String(req.body?.id || '').trim();
  if (!/^[a-zA-Z0-9_-]{3,60}$/.test(id)) return res.status(400).json({ ok: false, error: 'Enter a valid lady login or profile ID' });
  const existing = db.profiles[id];
  if (req.user.role === 'admin' && existing && existing.ownerAdminId && existing.ownerAdminId !== req.user.id) {
    return res.status(403).json({ ok: false, error: 'This profile belongs to another administrator' });
  }
  const profile = getProfileStore(db, id, true);
  profile.id = id;
  profile.name = String(req.body?.name || '').trim() || `Profile ${id}`;
  profile.active = true;
  delete profile.archivedAt;
  if (req.user.role === 'admin') {
    profile.ownerAdminId = req.user.id;
  } else if (req.user.role === 'director') {
    db.users[req.user.id].profileIds ||= [];
  }
  const savedPhotoUrl = savePhotoData(id, '__profile', req.body?.photoData);
  if (savedPhotoUrl) profile.photoUrl = savedPhotoUrl;
  if (!savedPhotoUrl && /^https:\/\/[a-z0-9.-]*dream-singles\.com\//i.test(String(req.body?.photoUrl || ''))) {
    profile.photoUrl = String(req.body.photoUrl);
  }
  const login = String(req.body?.login || '').trim();
  const password = String(req.body?.password || '');
  if (login && password) {
    profile.credentials = {
      login: encryptCredential(login),
      password: encryptCredential(password),
      updatedAt: new Date().toISOString(),
      updatedBy: req.user.id
    };
  }
  writeDb(db);
  res.json({ ok: true, profile: { id: profile.id, name: profile.name, photoUrl: profile.photoUrl || '' } });
});

app.patch('/api/admin/profiles/:id/assignment', requireAdmin, (req, res) => {
  const db = readDb();
  const id = String(req.params.id);
  const profile = db.profiles[id];
  if (!profile || profile.active === false) {
    return res.status(404).json({ ok: false, error: 'Profile not found' });
  }

  const manageable = userCanManageProfile(db, req.user, id);
  if (!manageable) return res.status(403).json({ ok: false, error: 'Access is denied for this profile' });

  const assigneeId = String(req.body?.operatorId || '');
  const returnToOwner = req.user.role === 'admin' && assigneeId === '__return_owner';
  const scopeUsers = req.user.role === 'director'
    ? Object.values(db.users || {}).filter(user => ['admin', 'operator'].includes(user.role))
    : Object.values(db.users || {}).filter(user =>
      (returnToOwner && String(user.id || '') === String(req.user.id || '')) ||
      (user.role === 'operator' && user.managerId === req.user.id)
    );

  const assignee = assigneeId && !returnToOwner ? db.users[assigneeId] : null;
  const validAssignee = assignee && assignee.active !== false && (
    (req.user.role === 'director' && assignee.role === 'admin') ||
    (req.user.role === 'admin' && String(assignee.id || '') === String(req.user.id || '')) ||
    (req.user.role === 'admin' && assignee.role === 'operator' && assignee.managerId === req.user.id)
  );
  if (assigneeId && !returnToOwner && !validAssignee) {
    return res.status(400).json({ ok: false, error: req.user.role === 'director' ? 'Administrator not found' : 'Operator not found' });
  }

  const unassignFromAdmin = req.user.role === 'admin' && !assigneeId && !returnToOwner;
  const previousAssignee = currentAssignedUserForProfile(db, id);
  for (const user of scopeUsers) {
    user.profileIds = (user.profileIds || []).filter(profileId => profileId !== id);
  }
  if (unassignFromAdmin) {
    db.users[req.user.id].profileIds = (db.users[req.user.id].profileIds || []).filter(profileId => profileId !== id);
  }
  if (assignee) {
    assignee.profileIds ||= [];
    if (!assignee.profileIds.includes(id)) assignee.profileIds.push(id);
    profile.active = true;
    delete profile.archivedAt;
  } else if (req.user.role === 'admin' && !returnToOwner && !unassignFromAdmin) {
    const adminUser = db.users[req.user.id];
    adminUser.profileIds ||= [];
    if (!adminUser.profileIds.includes(id)) adminUser.profileIds.push(id);
    profile.active = true;
    delete profile.archivedAt;
  }
  if (req.user.role === 'director') {
    if (assignee) profile.ownerAdminId = assignee.id;
    else delete profile.ownerAdminId;
  } else if (unassignFromAdmin) {
    profile.ownerAdminId = req.user.id;
  } else if (returnToOwner) {
    profile.ownerAdminId = req.user.id;
  } else if (req.user.role === 'admin' && !profile.ownerAdminId) {
    profile.ownerAdminId = req.user.id;
  }
  const nextWorkingOperatorId = returnToOwner ? '' : assigneeId;
  updateProfileAssignmentHistory(db, id, nextWorkingOperatorId, req.user.id, new Date(), previousAssignee?.id || '');

  writeDb(db);
  res.json({
    ok: true,
    profileId: id,
    operatorId: nextWorkingOperatorId,
    users: Object.values(db.users).map(publicUser)
  });
});

app.patch('/api/agencyos/profiles/:id/assignment', requireAdmin, (req, res) => {
  const db = readDb();
  const id = String(req.params.id);
  const profile = db.profiles[id];
  if (!profile || profile.active === false) {
    return res.status(404).json({ ok: false, error: 'Profile not found' });
  }

  let adminId = String(req.body?.adminId || '').trim();
  let operatorId = String(req.body?.operatorId || '').trim();

  if (req.user.role === 'admin') {
    if (adminId && adminId !== req.user.id) {
      return res.status(403).json({ ok: false, error: 'Administrators can assign profiles only to themselves' });
    }
    if (profile.ownerAdminId && profile.ownerAdminId !== req.user.id) {
      return res.status(403).json({ ok: false, error: 'This profile belongs to another administrator' });
    }
    const operator = operatorId ? db.users?.[operatorId] : null;
    const adminTakesOwnProfile = operator && operator.role === 'admin' && String(operator.id || '') === String(req.user.id || '');
    const managedOperator = operator && operator.role === 'operator' && String(operator.managerId || '') === String(req.user.id || '');
    if (operatorId && (!operator || (!adminTakesOwnProfile && !managedOperator))) {
      return res.status(400).json({ ok: false, error: 'Operator not found' });
    }
    adminId = req.user.id;
  }

  const admin = adminId ? db.users?.[adminId] : null;
  const operator = operatorId ? db.users?.[operatorId] : null;

  if (adminId && (!admin || admin.role !== 'admin')) {
    return res.status(400).json({ ok: false, error: 'Administrator not found' });
  }
  if (operatorId && (!operator || !['admin', 'operator'].includes(operator.role))) {
    return res.status(400).json({ ok: false, error: 'Worker not found' });
  }

  if (adminId) {
    admin.active = true;
    profile.ownerAdminId = adminId;
  }
  else delete profile.ownerAdminId;

  const previousAssignee = currentAssignedUserForProfile(db, id);
  for (const user of Object.values(db.users || {})) {
    if (['admin', 'operator'].includes(user.role)) {
      user.profileIds = (user.profileIds || []).filter(profileId => String(profileId) !== id);
    }
  }
  if (operator) {
    operator.active = true;
    if (operator.role === 'operator' && adminId && admin?.role === 'admin') operator.managerId = adminId;
    operator.profileIds ||= [];
    if (!operator.profileIds.includes(id)) operator.profileIds.push(id);
  }
  updateProfileAssignmentHistory(db, id, operatorId, req.user.id, new Date(), previousAssignee?.id || '');

  profile.active = true;
  delete profile.archivedAt;
  profile.updatedAt = new Date().toISOString();
  writeDb(db);
  res.json({
    ok: true,
    profileId: id,
    adminId,
    operatorId,
    profiles: profilesForAdministration(db, req.user),
    users: Object.values(db.users).map(publicUser)
  });
});

app.post('/api/admin/profiles/:id/photo', requireAdmin, (req, res) => {
  const db = readDb();
  const id = String(req.params.id);
  const profile = db.profiles[id];
  if (!profile) return res.status(404).json({ ok: false, error: 'Profile not found' });
  if (!userCanManageProfile(db, req.user, id)) {
    return res.status(403).json({ ok: false, error: 'Access is denied for this profile' });
  }

  const photoUrl = savePhotoData(id, '__profile', req.body?.photoData);
  if (!photoUrl) return res.status(400).json({ ok: false, error: 'Use a JPG, PNG or WebP image up to 2 MB' });
  profile.photoUrl = photoUrl;
  profile.updatedAt = new Date().toISOString();
  writeDb(db);
  res.json({ ok: true, profile: { id: profile.id, name: profile.name, photoUrl } });
});

app.patch('/api/admin/me/profiles', requireDirector, (req, res) => {
  const db = readDb();
  const allowed = new Set(profilesForAdministration(db, req.user).map(profile => profile.id));
  const profileIds = [...new Set((req.body?.profileIds || []).map(String))].filter(id => allowed.has(id));
  db.users[req.user.id].profileIds = profileIds;
  db.users[req.user.id].profileAssignmentsInitialized = true;
  writeDb(db);
  res.json({ ok: true, user: publicUser(db.users[req.user.id]), profiles: profilesForUser(db, db.users[req.user.id]) });
});

app.put('/api/admin/profiles/:id/credentials', requireAdmin, (req, res) => {
  const db = readDb();
  const id = String(req.params.id);
  const profile = db.profiles[id];
  const manageable = userCanManageProfile(db, req.user, id);
  if (!manageable) return res.status(404).json({ ok: false, error: 'Profile not found' });

  const login = String(req.body?.login || '').trim();
  const password = String(req.body?.password || '');
  let googleDriveUrl = String(req.body?.googleDriveUrl || '').trim();
  if (googleDriveUrl && /^(drive|docs)\.google\.com\//i.test(googleDriveUrl)) {
    googleDriveUrl = `https://${googleDriveUrl}`;
  }
  if (googleDriveUrl && !/^https?:\/\/([a-z0-9-]+\.)?(drive|docs)\.google\.com\//i.test(googleDriveUrl)) {
    return res.status(400).json({ ok: false, error: 'Enter a valid Google Drive link' });
  }
  if ((login || password) && (!login || !password)) {
    return res.status(400).json({ ok: false, error: 'Enter both Dream Singles login and password' });
  }
  if (login && password) {
    profile.credentials = {
      login: encryptCredential(login),
      password: encryptCredential(password),
      updatedAt: new Date().toISOString(),
      updatedBy: req.user.id
    };
  }
  if (typeof req.body?.name === 'string') {
    const name = String(req.body.name || '').trim();
    profile.name = name || `Profile ${id}`;
  }
  profile.googleDriveUrl = googleDriveUrl;
  profile.updatedAt = new Date().toISOString();
  writeDb(db);
  res.json({
    ok: true,
    profile: {
      id: profile.id,
      name: profile.name || `Profile ${profile.id}`,
      photoUrl: profile.photoUrl || '',
      googleDriveUrl: profile.googleDriveUrl || '',
      hasCredentials: Boolean(profile.credentials?.login && profile.credentials?.password)
    }
  });
});

app.patch('/api/admin/profiles/:id/google-drive', requireAdmin, (req, res) => {
  const db = readDb();
  const id = String(req.params.id);
  const profile = db.profiles[id];
  const manageable = userCanManageProfile(db, req.user, id);
  if (!manageable) return res.status(404).json({ ok: false, error: 'Profile not found' });

  let googleDriveUrl = String(req.body?.googleDriveUrl || '').trim();
  if (googleDriveUrl && /^(drive|docs)\.google\.com\//i.test(googleDriveUrl)) {
    googleDriveUrl = `https://${googleDriveUrl}`;
  }
  if (googleDriveUrl && !/^https?:\/\/([a-z0-9-]+\.)?(drive|docs)\.google\.com\//i.test(googleDriveUrl)) {
    return res.status(400).json({ ok: false, error: 'Enter a valid Google Drive link' });
  }

  profile.googleDriveUrl = googleDriveUrl;
  if (typeof req.body?.name === 'string') {
    const name = String(req.body.name || '').trim();
    profile.name = name || `Profile ${id}`;
  }
  profile.updatedAt = new Date().toISOString();
  writeDb(db);
  res.json({
    ok: true,
    profile: {
      id: profile.id,
      name: profile.name || `Profile ${profile.id}`,
      photoUrl: profile.photoUrl || '',
      googleDriveUrl: profile.googleDriveUrl || '',
      hasCredentials: Boolean(profile.credentials?.login && profile.credentials?.password)
    }
  });
});

app.post('/api/admin/profiles/:id/sync-dream', requireAdmin, async (req, res) => {
  const db = readDb();
  const id = String(req.params.id);
  const profile = db.profiles[id];
  const manageable = userCanManageProfile(db, req.user, id);
  if (!manageable) return res.status(404).json({ ok: false, error: 'Profile not found' });
  if (!profile.credentials?.login || !profile.credentials?.password) {
    return res.status(409).json({ ok: false, error: 'Dream Singles access has not been configured for this profile' });
  }
  try {
    const result = await resolveDreamSinglesAccess(
      decryptCredential(profile.credentials.login),
      decryptCredential(profile.credentials.password),
      { includeCookies: true }
    );
    if (result.name && !/^Profile\s+\d+$/i.test(result.name)) profile.name = result.name;
    if (result.photoData) {
      const photoUrl = savePhotoData(id, '__profile', result.photoData);
      if (photoUrl) profile.photoUrl = photoUrl;
    } else if (result.photoUrl) {
      profile.photoUrl = result.photoUrl;
    }
    profile.updatedAt = new Date().toISOString();
    writeDb(db);
    res.json({
      ok: true,
      profile: {
        id: profile.id,
        name: profile.name || `Profile ${profile.id}`,
        photoUrl: profile.photoUrl || '',
        googleDriveUrl: profile.googleDriveUrl || '',
        hasCredentials: Boolean(profile.credentials?.login && profile.credentials?.password)
      }
    });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message || 'Could not load profile data from Dream Singles' });
  }
});

app.post('/api/profiles/:id/launch', requireUser, async (req, res) => {
  const db = readDb();
  const id = String(req.params.id);
  const profile = db.profiles[id];
  if (!profile || !userHasWorkingProfile(db, req.user, id)) {
    return res.status(403).json({ ok: false, error: 'This profile is not assigned to you' });
  }
  if (!profile.credentials?.login || !profile.credentials?.password) {
    return res.status(409).json({ ok: false, error: 'Dream Singles access has not been configured for this profile' });
  }
  let result = { dreamCookies: [] };
  try {
    result = await resolveDreamSinglesAccess(
      decryptCredential(profile.credentials.login),
      decryptCredential(profile.credentials.password),
      { includeCookies: true }
    );
    if (result.name && !/^Profile\s+\d+$/i.test(result.name)) profile.name = result.name;
    if (result.photoData) {
      const photoUrl = savePhotoData(id, '__profile', result.photoData);
      if (photoUrl) profile.photoUrl = photoUrl;
    } else if (result.photoUrl) {
      profile.photoUrl = result.photoUrl;
    }
    profile.updatedAt = new Date().toISOString();
  } catch (error) {
    console.warn(`[dream-launch] ${id}: ${error.message || error}`);
    result = { dreamCookies: [] };
  }
  const token = crypto.randomBytes(32).toString('hex');
  launchTokens.set(token, {
    profileId: id,
    userId: req.user.id,
    dreamCookies: Array.isArray(result.dreamCookies) ? result.dreamCookies : [],
    expiresAt: Date.now() + 60_000
  });
  writeDb(db);
  res.json({ ok: true, token, profileId: id });
});

app.get('/api/profiles/:id/server-status', requireUser, (req, res) => {
  const db = readDb();
  const id = String(req.params.id);
  try {
    requireProfileForUser(db, req.user, id);
    res.json({ ok: true, status: dreamSessionStatus(id) });
  } catch (error) {
    res.status(error.status || 500).json({ ok: false, error: error.message || 'Could not check Dream Singles connection' });
  }
});

app.post('/api/profiles/:id/server-connect', requireUser, async (req, res) => {
  const db = readDb();
  const id = String(req.params.id);
  try {
    const session = await openDreamSession(db, req.user, id, { force: req.body?.force === true });
    let browserWarning = '';
    if (req.body?.keepOnline !== false) {
      try {
        await startDreamBrowser(db, req.user, id, { force: req.body?.forceBrowser === true });
      } catch (error) {
        browserWarning = error.message || 'Dream browser did not start';
      }
    }
    let sync = { imported: 0, letters: [] };
    if (req.body?.syncInbox !== false) {
      sync = await syncDreamInbox(id, { maxPages: req.body?.maxPages || 3 });
    }
    res.json({
      ok: true,
      profileId: id,
      status: dreamSessionStatus(id),
      imported: sync.imported || 0,
      letters: Array.isArray(sync.letters) ? sync.letters : [],
      identity: session.identity || {},
      browser: dreamBrowserStatus(id),
      browserWarning
    });
  } catch (error) {
    res.status(error.status || 500).json({ ok: false, error: error.message || 'Could not connect Dream Singles profile on the server' });
  }
});

app.post('/api/profiles/:id/server-sync-inbox', requireUser, async (req, res) => {
  const db = readDb();
  const id = String(req.params.id);
  try {
    requireProfileForUser(db, req.user, id);
    if (!dreamSessions.has(id)) {
      await openDreamSession(db, req.user, id);
    }
    const sync = await syncDreamInbox(id, { maxPages: req.body?.maxPages || 5 });
    res.json({ ok: true, profileId: id, status: dreamSessionStatus(id), imported: sync.imported, letters: sync.letters });
  } catch (error) {
    res.status(error.status || 500).json({ ok: false, error: error.message || 'Could not sync Dream Singles inbox' });
  }
});

app.post('/api/profiles/:id/server-heartbeat', requireUser, async (req, res) => {
  const db = readDb();
  const id = String(req.params.id);
  try {
    requireProfileForUser(db, req.user, id);
    if (!dreamSessions.has(id)) await openDreamSession(db, req.user, id);
    startDreamHeartbeat(id);
    await dreamHeartbeatTick(id);
    res.json({ ok: true, profileId: id, status: dreamSessionStatus(id) });
  } catch (error) {
    res.status(error.status || 500).json({ ok: false, error: error.message || 'Could not run Dream Singles heartbeat' });
  }
});

app.get('/api/profiles/:id/server-browser-status', requireUser, (req, res) => {
  const db = readDb();
  const id = String(req.params.id);
  try {
    requireProfileForUser(db, req.user, id);
    res.json({ ok: true, status: dreamBrowserStatus(id) });
  } catch (error) {
    res.status(error.status || 500).json({ ok: false, error: error.message || 'Could not check Dream browser status' });
  }
});

app.post('/api/profiles/:id/server-browser-start', requireUser, async (req, res) => {
  const db = readDb();
  const id = String(req.params.id);
  try {
    const session = await startDreamBrowser(db, req.user, id, {
      force: req.body?.force === true,
      headless: req.body?.headless !== false
    });
    res.json({ ok: true, profileId: id, status: dreamBrowserStatus(id), startedAt: session.startedAt });
  } catch (error) {
    res.status(error.status || 500).json({ ok: false, error: error.message || 'Could not start Dream browser' });
  }
});

app.post('/api/profiles/:id/server-browser-visible-test', requireUser, async (req, res) => {
  const db = readDb();
  const id = String(req.params.id);
  try {
    const session = await startDreamBrowser(db, req.user, id, {
      force: true,
      headless: false
    });
    res.json({ ok: true, profileId: id, status: dreamBrowserStatus(id), startedAt: session.startedAt, visible: true });
  } catch (error) {
    res.status(error.status || 500).json({ ok: false, error: error.message || 'Could not start visible Dream browser' });
  }
});

app.post('/api/profiles/:id/server-browser-app-window', requireUser, async (req, res) => {
  const db = readDb();
  const id = String(req.params.id);
  try {
    const existing = dreamBrowserSessions.get(id);
    let seedCookies = [];
    if (existing?.context) {
      seedCookies = await existing.context.cookies('https://www.dream-singles.com/').catch(() => []);
    }
    if (existing) await stopDreamBrowser(id);
    const session = await startDreamBrowser(db, req.user, id, {
      force: true,
      headless: false,
      appWindow: true,
      seedCookies
    });
    res.json({ ok: true, profileId: id, status: dreamBrowserStatus(id), startedAt: session.startedAt, appWindow: true });
  } catch (error) {
    res.status(error.status || 500).json({ ok: false, error: error.message || 'Could not open Dream app window' });
  }
});

app.post('/api/profiles/:id/server-browser-stop', requireUser, async (req, res) => {
  const id = String(req.params.id);
  try {
    await stopDreamBrowser(id);
    res.json({ ok: true, profileId: id, status: dreamBrowserStatus(id) });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message || 'Could not stop Dream browser' });
  }
});

app.put('/api/profiles/:id/server-heartbeat-config', requireUser, async (req, res) => {
  const db = readDb();
  const id = String(req.params.id);
  try {
    const profile = requireProfileForUser(db, req.user, id);
    const config = normalizeDreamHeartbeatConfig(req.body?.requests || req.body?.request || req.body);
    if (!config.length) return res.status(400).json({ ok: false, error: 'Heartbeat request is invalid' });
    profile.serverDreamHeartbeat = config;
    profile.updatedAt = new Date().toISOString();
    writeDb(db);
    if (!dreamSessions.has(id)) await openDreamSession(db, req.user, id);
    startDreamHeartbeat(id);
    await dreamHeartbeatTick(id);
    res.json({ ok: true, profileId: id, config, status: dreamSessionStatus(id) });
  } catch (error) {
    res.status(error.status || 500).json({ ok: false, error: error.message || 'Could not save heartbeat config' });
  }
});

app.post('/api/profiles/:id/server-disconnect', requireUser, async (req, res) => {
  const id = String(req.params.id);
  dreamSessions.delete(id);
  stopDreamHeartbeat(id);
  await stopDreamBrowser(id);
  res.json({ ok: true, profileId: id, status: dreamSessionStatus(id) });
});

app.post('/api/profiles/launch/redeem', (req, res) => {
  const token = String(req.body?.token || '');
  const launch = launchTokens.get(token);
  launchTokens.delete(token);
  if (!launch || launch.expiresAt < Date.now()) {
    return res.status(401).json({ ok: false, error: 'The launch request has expired' });
  }
  const db = readDb();
  const user = db.users[launch.userId];
  const profile = db.profiles[launch.profileId];
  if (!user || user.active === false || !userHasWorkingProfile(db, user, launch.profileId) || !profile?.credentials) {
    return res.status(403).json({ ok: false, error: 'Profile access was revoked' });
  }
  try {
    const extensionToken = crypto.randomBytes(32).toString('hex');
    const extensionKey = crypto.createHash('sha256').update(extensionToken).digest('hex');
    extensionTokens.set(extensionKey, {
      profileId: launch.profileId,
      userId: launch.userId,
      expiresAt: Date.now() + 12 * 60 * 60 * 1000
    });
    res.json({
      ok: true,
      profileId: launch.profileId,
      extensionToken,
      dreamCookies: launch.dreamCookies || [],
      login: decryptCredential(profile.credentials.login),
      password: decryptCredential(profile.credentials.password)
    });
  } catch {
    res.status(500).json({ ok: false, error: 'Could not decrypt Dream Singles access' });
  }
});

app.delete('/api/admin/profiles/:id', requireAdmin, (req, res) => {
  const db = readDb();
  const id = String(req.params.id);
  const profile = db.profiles[id];
  if (!profile) return res.status(404).json({ ok: false, error: 'Profile not found' });
  if (req.user.role !== 'director' && String(profile.ownerAdminId || '') !== String(req.user.id || '')) {
    return res.status(403).json({ ok: false, error: 'Only the owner or assigned administrator can delete profiles' });
  }

  const archivedAt = new Date();
  const previousAssignee = currentAssignedUserForProfile(db, id);
  profile.active = false;
  profile.archivedAt = archivedAt.toISOString();
  for (const user of Object.values(db.users)) {
    user.profileIds = (user.profileIds || []).filter(profileId => profileId !== id);
  }
  updateProfileAssignmentHistory(db, id, '', req.user.id, archivedAt, previousAssignee?.id || '');
  writeDb(db);
  res.json({ ok: true });
});

app.post('/api/admin/users', requireAdmin, (req, res) => {
  const db = readDb();
  const name = String(req.body?.name || '').trim();
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const allowedIds = new Set(profilesForAdministration(db, req.user).map(profile => profile.id));
  const profileIds = [...new Set((req.body?.profileIds || []).map(String))].filter(id => allowedIds.has(id));
  const requestedRole = String(req.body?.role || '').trim();
  const role = req.user.role === 'director'
    ? (['admin', 'operator', 'mentor'].includes(requestedRole) ? requestedRole : 'admin')
    : 'operator';
  if (username.length < 3 || password.length < 6) {
    return res.status(400).json({ ok: false, error: 'Use at least 3 characters for login and 6 for password' });
  }
  if (Object.values(db.users).some(user => user.username.toLowerCase() === username.toLowerCase())) {
    return res.status(409).json({ ok: false, error: 'This login already exists' });
  }
  const id = crypto.randomUUID();
  const passwordData = hashPassword(password);
  const createdAt = new Date().toISOString();
  const requestedManagerId = String(req.body?.managerId || '').trim();
  const requestedManager = requestedManagerId ? db.users?.[requestedManagerId] : null;
  const managerId = role === 'operator'
    ? (req.user.role === 'admin'
      ? req.user.id
      : (requestedManager?.role === 'admin' && requestedManager.active !== false ? requestedManager.id : req.user.id))
    : req.user.id;
  db.users[id] = {
    id, name: name || username, username, role, active: true, profileIds: role === 'mentor' ? [] : profileIds,
    managerId,
    passwordSalt: passwordData.salt, passwordHash: passwordData.hash,
    sharedPassword: encryptCredential(password),
    createdAt,
    adminStartedAt: role === 'admin' ? createdAt : undefined
  };
  if (role === 'admin') {
    for (const profileId of profileIds) {
      const profile = db.profiles?.[profileId];
      if (!profile || profile.active === false) continue;
      profile.ownerAdminId = id;
      profile.updatedAt = createdAt;
    }
  }
  if (role === 'operator') {
    const manager = db.users[managerId];
    for (const profileId of profileIds) {
      const profile = db.profiles?.[profileId];
      if (!profile || profile.active === false) continue;
      if (manager?.role === 'admin') profile.ownerAdminId = manager.id;
      for (const other of Object.values(db.users || {})) {
        if (other.role === 'operator' && other.id !== id) {
          other.profileIds = (other.profileIds || []).filter(item => String(item) !== String(profileId));
        }
      }
      updateProfileAssignmentHistory(db, profileId, id, req.user.id, new Date(createdAt));
      profile.updatedAt = createdAt;
    }
  }
  writeDb(db);
  res.json({ ok: true, user: publicUser(db.users[id]) });
});

app.patch('/api/admin/users/:id', requireAdmin, (req, res) => {
  const db = readDb();
  const user = db.users[String(req.params.id)];
  const manageable = user && user.role !== 'director' &&
    ((req.user.role === 'director') ||
      (req.user.role === 'admin' && user.role === 'operator' && user.managerId === req.user.id));
  if (!manageable) return res.status(404).json({ ok: false, error: 'User not found' });
  const requestedRole = req.user.role === 'director'
    ? (['admin', 'operator', 'mentor'].includes(req.body?.role) ? req.body.role : user.role)
    : user.role;
  if (Array.isArray(req.body?.profileIds)) {
    const manager = user.role === 'operator' ? db.users[user.managerId] : null;
    const permittedProfiles = req.user.role === 'director' && manager?.role === 'admin'
      ? profilesForAdministration(db, manager)
      : profilesForAdministration(db, req.user);
    const allowedIds = new Set(permittedProfiles.map(profile => profile.id));
    user.profileIds = [...new Set(req.body.profileIds.map(String))].filter(id => allowedIds.has(id));
  }
  if (typeof req.body?.name === 'string') {
    user.name = String(req.body.name || '').trim() || user.username;
  }
  if (typeof req.body?.username === 'string') {
    const username = String(req.body.username || '').trim();
    if (username.length < 3) return res.status(400).json({ ok: false, error: 'Use at least 3 characters for login' });
    if (Object.values(db.users).some(item => item.id !== user.id && item.username.toLowerCase() === username.toLowerCase())) {
      return res.status(409).json({ ok: false, error: 'This login already exists' });
    }
    user.username = username;
  }
  if (req.user.role === 'director' && requestedRole !== user.role) {
    const previousRole = user.role;
    user.role = requestedRole;
    user.managerId = requestedRole === 'operator'
      ? String(req.body?.managerId || user.managerId || req.user.id)
      : req.user.id;
    if (requestedRole === 'mentor') {
      user.profileIds = [];
    }
    if (previousRole !== 'admin' && user.role === 'admin') {
      user.adminStartedAt = new Date().toISOString();
    }
  }
  if (req.user.role === 'director' && requestedRole === 'operator') {
    const managerId = String(req.body?.managerId || user.managerId || req.user.id);
    const manager = db.users[managerId];
    user.managerId = manager && manager.role === 'admin' ? managerId : req.user.id;
    if (manager && manager.role === 'admin') manager.active = true;
    if (manager && manager.role === 'admin') {
      for (const profileId of user.profileIds || []) {
        const profile = db.profiles?.[profileId];
        if (profile && profile.active !== false) {
          profile.ownerAdminId = manager.id;
          profile.updatedAt = new Date().toISOString();
        }
      }
    }
  }
  if (typeof req.body?.active === 'boolean') {
    user.active = req.body.active;
    if (user.active) delete user.deletedAt;
    else user.deletedAt ||= new Date().toISOString();
  }
  if (req.body?.translator && typeof req.body.translator === 'object') {
    const current = user.translator || {};
    const apiKey = String(req.body.translator.apiKey || '').trim();
    user.translator = {
      ...current,
      provider: normalizeTranslatorProvider(req.body.translator.provider || current.provider),
      targetLang: normalizeTranslatorLang(req.body.translator.targetLang || current.targetLang || 'RU'),
      replyTargetLang: normalizeTranslatorLang(req.body.translator.replyTargetLang || current.replyTargetLang || 'EN', 'EN'),
      updatedAt: new Date().toISOString()
    };
    if (apiKey) user.translator.apiKeyEncrypted = encryptCredential(apiKey);
    if (req.body.translator.clearApiKey === true) delete user.translator.apiKeyEncrypted;
  }
  if (req.body?.agency && typeof req.body.agency === 'object') {
    try {
      updateAgencySettings(user, req.body.agency);
    } catch (error) {
      return res.status(400).json({ ok: false, error: error.message || 'Agency access is invalid' });
    }
  }
  if (req.body?.password) {
    if (String(req.body.password).length < 6) return res.status(400).json({ ok: false, error: 'Password is too short' });
    const passwordData = hashPassword(req.body.password);
    user.passwordSalt = passwordData.salt;
    user.passwordHash = passwordData.hash;
    user.sharedPassword = encryptCredential(req.body.password);
  }
  writeDb(db);
  res.json({ ok: true, user: publicUser(user) });
});

app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  const db = readDb();
  const id = String(req.params.id);
  const user = db.users[id];
  const manageable = user && user.role !== 'director' &&
    ((req.user.role === 'director') ||
      (req.user.role === 'admin' && user.role === 'operator' && user.managerId === req.user.id));
  if (!manageable) return res.status(404).json({ ok: false, error: 'User not found' });

  if (user.role === 'admin') {
    for (const profile of Object.values(db.profiles)) {
      if (profile.ownerAdminId === id) delete profile.ownerAdminId;
    }
    for (const operator of Object.values(db.users)) {
      if (operator.managerId === id) {
        operator.managerId = req.user.id;
      }
    }
  }
  unassignUserFromProfiles(db, id, req.user.id);
  for (const [sessionId, session] of Object.entries(db.sessions)) {
    if (session.userId === id) delete db.sessions[sessionId];
  }
  delete db.users[id];
  writeDb(db);
  res.json({ ok: true });
});

app.get('/api/access/check', (req, res) => {
  const profileId = String(req.query.profileId || '');
  const allowed = isAllowedProfile(profileId);
  res.status(allowed ? 200 : 403).json({
    ok: allowed,
    profileId,
    error: allowed ? undefined : 'Profile was not found or is disabled'
  });
});

app.use('/api/men', (req, res, next) => {
  const profileId = req.get('X-Profile-ID') || req.body?.sourceProfileId;
  const db = readDb();
  const user = getRequestUser(req, db);
  const extensionAccess = getExtensionAccess(req, db);
  const assigned = user && userHasWorkingProfile(db, user, profileId);
  const extensionAssigned = extensionAccess && extensionAccess.profileId === String(profileId);

  if (!isAllowedProfile(profileId) || (!assigned && !extensionAssigned)) {
    return res.status(user ? 403 : 401).json({ ok: false, error: 'Access is denied for this profile' });
  }
  req.user = user || extensionAccess.user;
  req.profileId = String(profileId);
  next();
});

app.get('/api/men', (req, res) => {
  const db = readDb();
  const profile = getProfileStore(db, req.profileId);
  const removedPlaceholders = removeEmptyPlaceholderMen(profile);
  if (removedPlaceholders) writeDb(db);

  const men = Object.values(profile?.men || {})
    .sort((a, b) =>
      Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
      parseDate(b.lastLetterDate) - parseDate(a.lastLetterDate));

  res.json({ ok: true, men, removedPlaceholders });
});

app.post('/api/men', (req, res) => {
  const body = req.body || {};
  const incoming = Array.isArray(body) ? body : body.men || [];

  if (!Array.isArray(incoming)) {
    return res.status(400).json({ ok: false, error: 'men must be an array' });
  }

  const db = readDb();
  const profile = getProfileStore(db, req.profileId, true);

  let added = 0;
  let updated = 0;
  let migrated = 0;

  for (const man of incoming) {
    if (!man || !man.id) continue;

    const id = String(man.id);
    const otherMan = profile.otherMen?.[id];
    if (otherMan && body.mode !== 'full') continue;
    const old = profile.men[id] || {};

    if (old.id) updated++;
    else added++;

    const oldFirst = formatDateOnly(old.firstLetterDate || '');
    const newFirst = formatDateOnly(man.firstLetterDate || '');
    const oldLast = formatDateOnly(old.lastLetterDate || '');
    const newLast = formatDateOnly(man.lastLetterDate || '');
    const savedPhotoUrl = savePhotoData(req.profileId, id, man.photoData);

    profile.men[id] = {
      ...old,
      id,
      name: man.name || old.name || '',
      age: man.age || old.age || '',
      lettersCount: Math.max(
        Number(man.lettersCount || 0),
        Number(old.lettersCount || 0)
      ),
      firstLetterDate: oldFirst || newFirst,
      lastLetterDate: newestDate(oldLast, newLast),
      inboxLink: man.inboxLink || old.inboxLink || `https://www.dream-singles.com/members/messaging/inbox?q=${id}`,
      profileLink: man.profileLink || old.profileLink || `https://www.dream-singles.com/${id}.html`,
      photoUrl: savedPhotoUrl || man.photoUrl || old.photoUrl || otherMan?.photoUrl || '',
      note: old.note || otherMan?.note || '',
      status: normalizeStatus(old.status || otherMan?.status || man.status || ''),
      favorite: Boolean(old.favorite || otherMan || man.favorite),
      pinned: Boolean(old.pinned || man.pinned),
      updatedAt: new Date().toISOString()
    };
    if (otherMan) {
      delete profile.otherMen[id];
      migrated++;
    }
  }

  profile.updatedAt = new Date().toISOString();

  writeDb(db);

  res.json({
    ok: true,
    added,
    updated,
    migrated,
    total: Object.keys(profile.men).length
  });
});

app.use('/api/workspace', (req, res, next) => {
  const profileId = req.get('X-Profile-ID') || req.body?.sourceProfileId;
  const db = readDb();
  const user = getRequestUser(req, db);
  const extensionAccess = getExtensionAccess(req, db);
  const assigned = user && userHasWorkingProfile(db, user, profileId);
  const extensionAssigned = extensionAccess && extensionAccess.profileId === String(profileId);

  if (!isAllowedProfile(profileId) || (!assigned && !extensionAssigned)) {
    return res.status(user ? 403 : 401).json({ ok: false, error: 'Access is denied for this profile' });
  }
  req.user = user || extensionAccess.user;
  req.profileId = String(profileId);
  next();
});

app.post('/api/workspace/clear-cache', (req, res) => {
  const db = readDb();
  const profile = getProfileStore(db, req.profileId, true);
  const oldLetters = Array.isArray(profile.workspaceInbox) ? profile.workspaceInbox.length : 0;
  const oldMedia = Array.isArray(profile.workspaceMediaGallery) ? profile.workspaceMediaGallery.length : 0;
  const removedBytes = removeWorkspaceAttachmentCacheForProfile(req.profileId);
  profile.workspaceInbox = [];
  profile.workspaceMediaGallery = [];
  profile.workspaceMediaGallerySyncedAt = '';
  profile.updatedAt = new Date().toISOString();
  writeDb(db);
  res.json({
    ok: true,
    cleared: {
      letters: oldLetters,
      media: oldMedia,
      attachmentBytes: removedBytes
    }
  });
});

app.post('/api/workspace/read-letter', async (req, res) => {
  const rawUrl = String(req.body?.messageLink || req.body?.url || '').trim();
  let url;
  try {
    url = new URL(rawUrl, DREAM_INBOX_URL);
  } catch {
    return res.status(400).json({ ok: false, error: 'Letter link is invalid' });
  }
  if (!/(^|\.)dream-singles\.com$/i.test(url.hostname)) {
    return res.status(400).json({ ok: false, error: 'Letter link is not Dream Singles' });
  }

  try {
    const db = readDb();
    const savedLetter = findSavedWorkspaceLetterByMessageLink(db, req.profileId, url.href);
    if (!dreamSessions.has(req.profileId)) {
      await openDreamSession(db, req.user, req.profileId);
    }
    const page = await dreamSessionFetch(req.profileId, url.href);
    let letter = collectWorkspaceLetterHtml(
      page.html,
      page.url || url.href,
      String(req.body?.name || '').trim(),
      String(req.body?.id || '').trim(),
      String(req.body?.direction || '').trim()
    );
    letter = mergeSavedWorkspaceLetterDetails(letter, savedLetter);
    if (letter.requiresLogin) throw new Error('Dream Singles login is required');
    if (!letter.bodyText && !letter.conversation?.length && !letter.attachments?.length) {
      throw new Error('Could not read letter text');
    }
    res.json({ ok: true, letter: { ...letter, messageLink: rawUrl } });
  } catch (error) {
    const fallbackDb = readDb();
    const savedLetter = findSavedWorkspaceLetterByMessageLink(fallbackDb, req.profileId, rawUrl);
    const fallbackLetter = mergeSavedWorkspaceLetterDetails({
      requiresLogin: false,
      sourceUrl: rawUrl,
      replyUrl: rawUrl,
      attachments: [],
      conversation: []
    }, savedLetter);
    if (fallbackLetter.bodyText || fallbackLetter.conversation?.length || fallbackLetter.attachments?.length) {
      return res.json({ ok: true, letter: { ...fallbackLetter, messageLink: rawUrl, liveError: error.message || '' } });
    }
    res.status(error.status || 500).json({ ok: false, error: error.message || 'Could not read letter text' });
  }
});

app.post('/api/workspace/message-history', async (req, res) => {
  const rawUrl = String(req.body?.messageLink || req.body?.url || '').trim();
  let url;
  try {
    url = new URL(rawUrl, DREAM_INBOX_URL);
  } catch {
    return res.status(400).json({ ok: false, error: 'Letter link is invalid' });
  }
  if (!/(^|\.)dream-singles\.com$/i.test(url.hostname)) {
    return res.status(400).json({ ok: false, error: 'Letter link is not Dream Singles' });
  }

  try {
    if (!dreamSessions.has(req.profileId)) {
      const db = readDb();
      await openDreamSession(db, req.user, req.profileId);
    }
    const history = await collectWorkspaceMessageHistory(
      req.profileId,
      url.href,
      String(req.body?.name || '').trim()
    );
    res.json({
      ok: true,
      composeUrl: history.composeUrl,
      sourceUrl: history.sourceUrl,
      source: history.source,
      entries: history.entries || []
    });
  } catch (error) {
    res.status(error.status || 500).json({ ok: false, error: error.message || 'Could not load message history' });
  }
});

app.post('/api/workspace/send-reply', async (req, res) => {
  const text = String(req.body?.text || req.body?.body || '').trim();
  if (!text) return res.status(400).json({ ok: false, error: 'Reply text is empty' });

  const rawUrl = String(req.body?.messageLink || req.body?.url || '').trim();
  let url;
  try {
    url = new URL(rawUrl, DREAM_INBOX_URL);
  } catch {
    return res.status(400).json({ ok: false, error: 'Letter link is invalid' });
  }
  if (!/(^|\.)dream-singles\.com$/i.test(url.hostname)) {
    return res.status(400).json({ ok: false, error: 'Letter link is not Dream Singles' });
  }

  const attachments = Array.isArray(req.body?.attachments)
    ? req.body.attachments.map(item => ({
        name: String(item?.name || 'attachment').trim(),
        type: String(item?.type || '').trim(),
        dataUrl: String(item?.dataUrl || '').trim(),
        source: String(item?.source || '').trim(),
        kind: String(item?.kind || '').trim(),
        id: String(item?.id || '').trim(),
        galleryId: String(item?.galleryId || '').trim(),
        videoGalleryId: String(item?.videoGalleryId || '').trim(),
        url: String(item?.url || '').trim(),
        thumbUrl: String(item?.thumbUrl || '').trim(),
        originalThumbUrl: String(item?.originalThumbUrl || '').trim(),
        label: String(item?.label || '').trim()
      })).slice(0, 6)
    : [];

  try {
    if (!dreamSessions.has(req.profileId)) {
      const db = readDb();
      await openDreamSession(db, req.user, req.profileId);
    }
    const composeUrl = await resolveWorkspaceReplyComposeUrl(req.profileId, url.href);
    const result = await sendWorkspaceReplyDirect(req.profileId, composeUrl, text, attachments);
    res.json({ ok: true, result });
  } catch (error) {
    res.status(error.status || 500).json({ ok: false, error: error.message || 'Could not send reply' });
  }
});

app.post('/api/workspace/scan-inbox', async (req, res) => {
  try {
    if (!dreamSessions.has(req.profileId)) {
      const db = readDb();
      await openDreamSession(db, req.user, req.profileId);
    }
    const sync = await syncDreamWorkspaceMessages(req.profileId, {
      direction: 'incoming',
      maxPages: req.body?.maxPages || 3,
      page: req.body?.page || 0,
      targets: Array.isArray(req.body?.targets) ? req.body.targets : [],
      stopAtShortPage: req.body?.stopAtShortPage === true,
      stopAtExisting: req.body?.stopAtExisting === true,
      shortPageSize: 12,
      replaceEmpty: req.body?.replaceEmpty === true,
      persist: req.body?.persist === false ? false : true
    });
    let favorites = null;
    if (req.body?.syncFavorites !== false && req.body?.persist !== false) {
      try {
        favorites = await syncDreamSiteFavorites(req.profileId);
      } catch (error) {
        console.warn('[workspace] Could not sync Dream favorites:', error.message || error);
      }
    }
    const db = readDb();
    const profile = getProfileStore(db, req.profileId);
    const letters = Array.isArray(profile?.workspaceInbox) ? profile.workspaceInbox : (sync.letters || []);
    res.json({
      ok: true,
      imported: sync.imported || 0,
      letters,
      lastPage: sync.lastPage || 1,
      favorites
    });
  } catch (error) {
    res.status(error.status || 500).json({ ok: false, error: error.message || 'Could not scan Dream Singles inbox' });
  }
});

app.post('/api/workspace/scan-sent', async (req, res) => {
  try {
    if (!dreamSessions.has(req.profileId)) {
      const db = readDb();
      await openDreamSession(db, req.user, req.profileId);
    }
    const sync = await syncDreamWorkspaceMessages(req.profileId, {
      direction: 'outgoing',
      maxPages: req.body?.maxPages || 3,
      page: req.body?.page || 0,
      targets: Array.isArray(req.body?.targets) ? req.body.targets : [],
      view: req.body?.view || 'all',
      replaceEmpty: req.body?.replaceEmpty === true,
      persist: req.body?.persist === false ? false : true
    });
    res.json({ ok: true, imported: sync.imported || 0, letters: sync.letters || [], lastPage: sync.lastPage || 1 });
  } catch (error) {
    res.status(error.status || 500).json({ ok: false, error: error.message || 'Could not scan Dream Singles sent letters' });
  }
});

app.post('/api/workspace/online-men', async (req, res) => {
  try {
    if (!dreamSessions.has(req.profileId)) {
      const db = readDb();
      await openDreamSession(db, req.user, req.profileId);
    }
    const rawUrl = String(req.body?.url || 'https://www.dream-singles.com/members/connections/myFavorites?all=1&folder=-1').trim();
    const url = new URL(rawUrl, 'https://www.dream-singles.com/');
    if (!/(^|\.)dream-singles\.com$/i.test(url.hostname)) {
      return res.status(400).json({ ok: false, error: 'Online URL is not Dream Singles' });
    }
    const page = await dreamSessionFetch(req.profileId, url.href);
    if (dreamPageLooksLoggedOut(page.html, page.url || url.href)) throw new Error('Dream Singles login is required');
    const statuses = collectDreamOnlineFavorites(page.html, page.url || url.href);
    const db = readDb();
    const profile = getProfileStore(db, req.profileId, true);
    const checkedAt = new Date().toISOString();
    const onlineIds = new Set(statuses.map(item => String(item.id)));
    for (const man of Object.values(profile.men || {})) {
      const onlineNow = onlineIds.has(String(man.id));
      man.onlineNow = onlineNow;
      man.onlineCheckedAt = checkedAt;
      if (onlineNow) {
        man.lastSeenOnlineAt = checkedAt;
        man.lastActivityText = 'Online now';
      } else if (man.lastActivityText === 'Online now') {
        man.lastActivityText = '';
      }
    }
    if (Array.isArray(profile.workspaceInbox)) {
      profile.workspaceInbox = profile.workspaceInbox.map(letter => {
        const onlineNow = onlineIds.has(String(letter?.id || ''));
        return {
          ...letter,
          onlineNow,
          onlineCheckedAt: checkedAt,
          lastActivityText: onlineNow ? 'Online now' : (letter.lastActivityText === 'Online now' ? '' : letter.lastActivityText || '')
        };
      });
    }
    profile.updatedAt = checkedAt;
    writeDb(db);
    res.json({ ok: true, online: statuses.length, statuses, checkedAt });
  } catch (error) {
    res.status(error.status || 500).json({ ok: false, error: error.message || 'Could not load online men' });
  }
});

app.post('/api/workspace/check-activity', async (req, res) => {
  const id = String(req.body?.id || '').trim();
  if (!/^\d{4,}$/.test(id)) return res.status(400).json({ ok: false, error: 'Man ID is invalid' });

  let url;
  try {
    url = new URL(String(req.body?.profileUrl || `https://www.dream-singles.com/${id}.html`).trim(), 'https://www.dream-singles.com/');
  } catch {
    return res.status(400).json({ ok: false, error: 'Profile link is invalid' });
  }
  if (!/(^|\.)dream-singles\.com$/i.test(url.hostname)) {
    return res.status(400).json({ ok: false, error: 'Profile link is not Dream Singles' });
  }

  try {
    const db = readDb();
    if (!dreamSessions.has(req.profileId)) {
      await openDreamSession(db, req.user, req.profileId);
    }
    const page = await dreamSessionFetch(req.profileId, url.href);
    let presence = extractDreamProfilePresence(page.html);

    if (!presence.onlineNow) {
      try {
        const favoritesUrl = 'https://www.dream-singles.com/members/connections/myFavorites?all=1&folder=-1';
        const favoritesPage = await dreamSessionFetch(req.profileId, favoritesUrl);
        const statuses = collectDreamOnlineFavorites(favoritesPage.html, favoritesPage.url || favoritesUrl);
        if (statuses.some(item => String(item.id || '') === id && item.onlineNow === true)) {
          presence = { onlineNow: true, lastActivityText: 'Online now' };
        }
      } catch {}
    }

    const freshDb = readDb();
    const profile = getProfileStore(freshDb, req.profileId, true);
    const checkedAt = new Date().toISOString();
    const lastActivityText = presence.onlineNow ? 'Online now' : String(presence.lastActivityText || '').trim().slice(0, 100);
    profile.men ||= {};
    if (!profile.men[id]) {
      const letter = Array.isArray(profile.workspaceInbox)
        ? profile.workspaceInbox.find(item => String(item?.id || '') === id)
        : null;
      profile.men[id] = {
        id,
        name: String(letter?.name || req.body?.name || `Man ${id}`).trim(),
        photoUrl: String(letter?.photoUrl || '').trim(),
        profileLink: url.href,
        createdAt: checkedAt
      };
    }
    profile.men[id].onlineNow = presence.onlineNow === true;
    profile.men[id].lastActivityText = lastActivityText;
    profile.men[id].onlineCheckedAt = checkedAt;
    profile.men[id].updatedAt = checkedAt;
    profile.men[id].profileLink ||= url.href;

    if (Array.isArray(profile.workspaceInbox)) {
      profile.workspaceInbox = profile.workspaceInbox.map(letter => String(letter?.id || '') === id
        ? {
            ...letter,
            onlineNow: profile.men[id].onlineNow,
            lastActivityText,
            onlineCheckedAt: checkedAt,
            profileLink: letter.profileLink || url.href
          }
        : letter);
    }
    profile.updatedAt = checkedAt;
    writeDb(freshDb);
    res.json({
      ok: true,
      presence: {
        onlineNow: profile.men[id].onlineNow,
        lastActivityText,
        onlineCheckedAt: checkedAt,
        sourceUrl: page.url || url.href
      }
    });
  } catch (error) {
    res.status(error.status || 500).json({ ok: false, error: error.message || 'Could not check activity' });
  }
});

app.get('/api/workspace/inbox', (req, res) => {
  const db = readDb();
  const profile = getProfileStore(db, req.profileId);
  const letters = Array.isArray(profile?.workspaceInbox) ? profile.workspaceInbox : [];
  const decorated = letters.map(letter => {
    const man = profile?.men?.[String(letter?.id || '')];
    return man ? {
      ...letter,
      name: safeWorkspaceName(letter.name, man.name, letter.id),
      photoUrl: letter.photoUrl || man.photoUrl || '',
      profileLink: letter.profileLink || man.profileLink || `https://www.dream-singles.com/${letter.id}.html`,
      onlineNow: man.onlineNow === true,
      onlineCheckedAt: man.onlineCheckedAt || letter.onlineCheckedAt || '',
      lastActivityText: man.lastActivityText || letter.lastActivityText || '',
      siteFavorite: man.siteFavorite === true,
      siteFavoriteUpdatedAt: man.siteFavoriteUpdatedAt || letter.siteFavoriteUpdatedAt || ''
    } : letter;
  });
  res.json({ ok: true, letters: decorated });
});

function saveWorkspaceLetters(req, res, forcedDirection = 'incoming') {
  const incoming = Array.isArray(req.body?.letters) ? req.body.letters : [];
  const db = readDb();
  const profile = getProfileStore(db, req.profileId, true);
  const previousLetters = Array.isArray(profile.workspaceInbox) ? profile.workspaceInbox : [];
  const previous = new Map(previousLetters
    .map(letter => [String(letter?.key || ''), letter])
    .filter(([key]) => key));
  const seen = new Set();
  const now = new Date().toISOString();
  const direction = forcedDirection === 'outgoing' ? 'outgoing' : 'incoming';
  const replaceIds = new Set((Array.isArray(req.body?.replaceIds) ? req.body.replaceIds : [])
    .map(id => String(id || '').trim())
    .filter(id => /^\d{4,}$/.test(id)));
  const mergeOnly = req.body?.mergeOnly === true;

  const hasWorkspaceClock = value => /\b\d{1,2}:\d{2}\b/.test(String(value || ''));
  const dateFromWorkspaceKey = key => String(key || '').match(/\b20\d{2}-\d{2}-\d{2}\s+\d{1,2}:\d{2}\b/)?.[0] || '';
  const dateSortValue = value => {
    const time = Date.parse(String(value || '').replace(' ', 'T'));
    return Number.isNaN(time) ? 0 : time;
  };
  const latestIncomingById = new Map();
  for (const letter of previousLetters) {
    if (String(letter?.direction || 'incoming') === 'outgoing') continue;
    const id = String(letter?.id || '').trim();
    if (!id) continue;
    latestIncomingById.set(id, Math.max(latestIncomingById.get(id) || 0, dateSortValue(letter?.dateText)));
  }

  const normalized = incoming.map((letter, index) => {
    const id = String(letter?.id || '').trim();
    if (!/^\d{4,}$/.test(id)) return null;
    const letterDirection = direction;
    const rawDateText = String(letter?.dateText || '').trim().slice(0, 40);
    const key = String(letter?.key || `${letterDirection}:${id}:${rawDateText || index}`).trim();
    if (seen.has(key)) return null;
    seen.add(key);
    const existing = previous.get(key) || {};
    const existingDateText = String(existing.dateText || '').trim();
    const keyDateText = dateFromWorkspaceKey(key);
    const dateText = hasWorkspaceClock(rawDateText)
      ? rawDateText
      : (hasWorkspaceClock(existingDateText) ? existingDateText : (keyDateText || rawDateText));
    const unread = letterDirection === 'incoming' &&
      letter?.unread === true;
    const unanswered = letterDirection === 'incoming' &&
      letter?.unanswered === true;
    const oldMan = profile.men?.[id] || {};
    return {
      key,
      id,
      direction: letterDirection,
      name: safeWorkspaceName(letter?.name, existing.name || oldMan.name, id).slice(0, 80),
      photoUrl: String(letter?.photoUrl || existing.photoUrl || oldMan.photoUrl || '').trim(),
      profileLink: String(letter?.profileLink || existing.profileLink || oldMan.profileLink || `https://www.dream-singles.com/${id}.html`).trim(),
      messageLink: String(letter?.messageLink || '').trim(),
      dateText,
      snippet: String(letter?.snippet || '').trim().slice(0, 500),
      attachmentsHint: existing.attachmentsHint === true || letter?.attachmentsHint === true,
      unread,
      unanswered,
      readByMan: letterDirection === 'outgoing' ? letter?.readByMan === true : false,
      lettersCount: Math.max(1, Number(letter?.lettersCount || 1) || 1),
      bodyText: String(existing.bodyText || letter?.bodyText || '').trim().slice(0, 20000),
      subject: String(existing.subject || letter?.subject || '').trim().slice(0, 200),
      sourceUrl: String(existing.sourceUrl || letter?.sourceUrl || '').trim(),
      readAt: existing.readAt || letter?.readAt || '',
      readError: String(letter?.readError || '').trim().slice(0, 300),
      conversation: Array.isArray(existing.conversation) ? existing.conversation : [],
      attachments: cleanWorkspaceAttachments(existing.attachments?.length ? existing.attachments : letter?.attachments),
      attachmentsChecked: existing.attachmentsChecked === true || letter?.attachmentsChecked === true,
      savedAt: now
    };
  }).filter(Boolean);

  const normalizedKeys = new Set(normalized.map(letter => letter.key));
  const kept = previousLetters.filter(letter => {
    if (normalizedKeys.has(String(letter?.key || ''))) return false;
    if (mergeOnly) return true;
    const letterDirection = String(letter?.direction || 'incoming') === 'outgoing' ? 'outgoing' : 'incoming';
    if (letterDirection !== direction) return true;
    if (replaceIds.size && !replaceIds.has(String(letter?.id || ''))) return true;
    return false;
  });

  profile.workspaceInbox = [...kept, ...normalized]
    .sort((a, b) => Date.parse(String(b.dateText || '').replace(' ', 'T')) - Date.parse(String(a.dateText || '').replace(' ', 'T')));

  profile.updatedAt = now;
  writeDb(db);
  res.json({ ok: true, letters: profile.workspaceInbox });
}

app.post('/api/workspace/inbox', (req, res) => {
  saveWorkspaceLetters(req, res, 'incoming');
});

app.post('/api/workspace/sent', (req, res) => {
  saveWorkspaceLetters(req, res, 'outgoing');
});

app.post('/api/workspace/seen', (req, res) => {
  const ids = new Set((Array.isArray(req.body?.ids) ? req.body.ids : [])
    .map(id => String(id || '').trim())
    .filter(id => /^\d{4,}$/.test(id)));
  const keys = new Set((Array.isArray(req.body?.keys) ? req.body.keys : [])
    .map(key => String(key || '').trim())
    .filter(Boolean));
  const db = readDb();
  const profile = getProfileStore(db, req.profileId, true);
  const letters = Array.isArray(profile.workspaceInbox) ? profile.workspaceInbox : [];
  let changed = false;

  profile.workspaceInbox = letters.map(letter => {
    const direction = String(letter?.direction || 'incoming') === 'outgoing' ? 'outgoing' : 'incoming';
    const matchesId = ids.has(String(letter?.id || '').trim());
    const matchesKey = keys.has(String(letter?.key || '').trim());
    if (direction === 'incoming' && letter?.unread === true && (matchesId || matchesKey)) {
      changed = true;
      return { ...letter, unread: false };
    }
    return letter;
  });

  if (changed) {
    profile.updatedAt = new Date().toISOString();
    writeDb(db);
  }

  res.json({ ok: true, changed, letters: profile.workspaceInbox });
});

app.post('/api/workspace/answered', (req, res) => {
  const ids = new Set((Array.isArray(req.body?.ids) ? req.body.ids : [])
    .map(id => String(id || '').trim())
    .filter(id => /^\d{4,}$/.test(id)));
  const keys = new Set((Array.isArray(req.body?.keys) ? req.body.keys : [])
    .map(key => String(key || '').trim())
    .filter(Boolean));
  const db = readDb();
  const profile = getProfileStore(db, req.profileId, true);
  const letters = Array.isArray(profile.workspaceInbox) ? profile.workspaceInbox : [];
  let changed = false;

  profile.workspaceInbox = letters.map(letter => {
    const direction = String(letter?.direction || 'incoming') === 'outgoing' ? 'outgoing' : 'incoming';
    const matchesId = ids.has(String(letter?.id || '').trim());
    const matchesKey = keys.has(String(letter?.key || '').trim());
    if (direction === 'incoming' && letter?.unanswered === true && (matchesId || matchesKey)) {
      changed = true;
      return { ...letter, unanswered: false };
    }
    return letter;
  });

  if (changed) {
    profile.updatedAt = new Date().toISOString();
    writeDb(db);
  }

  res.json({ ok: true, changed, letters: profile.workspaceInbox });
});

app.get('/api/workspace/media-gallery', (req, res) => {
  const db = readDb();
  const profile = getProfileStore(db, req.profileId, true);
  const media = Array.isArray(profile.workspaceMediaGallery) ? profile.workspaceMediaGallery : [];
  res.json({
    ok: true,
    media,
    syncedAt: profile.workspaceMediaGallerySyncedAt || ''
  });
});

app.post('/api/workspace/media-gallery/sync', async (req, res) => {
  try {
    if (!dreamSessions.has(req.profileId)) {
      const db = readDb();
      await openDreamSession(db, req.user, req.profileId);
    }
    const result = await syncWorkspaceMediaGalleryDirect(req.profileId, {
      kind: req.body?.kind || 'photo',
      messageLink: req.body?.messageLink || '',
      maxGalleryPages: req.body?.maxGalleryPages || 100
    });
    const media = Array.isArray(result) ? result : (result.media || []);
    res.json({ ok: true, media, stats: Array.isArray(result?.stats) ? result.stats : [] });
  } catch (error) {
    res.status(error.status || 500).json({ ok: false, error: error.message || 'Could not sync Dream Singles media' });
  }
});

app.post('/api/workspace/media-gallery', (req, res) => {
  const incoming = Array.isArray(req.body?.media) ? req.body.media : [];
  const replaceKind = String(req.body?.replaceKind || '').toLowerCase();
  const merge = req.body?.merge === true;
  const db = readDb();
  const profile = getProfileStore(db, req.profileId, true);
  const previousMedia = Array.isArray(profile.workspaceMediaGallery) ? profile.workspaceMediaGallery : [];
  const now = new Date().toISOString();
  const seen = new Set();
  const media = incoming.map((item, index) => {
    const kind = String(item?.kind || '').toLowerCase() === 'video' ? 'video' : 'photo';
    const source = String(item?.source || '').trim();
    const url = String(item?.url || '').trim();
    const thumbUrl = String(item?.thumbUrl || '').trim();
    const originalThumbUrl = String(item?.originalThumbUrl || '').trim();
    const galleryId = String(item?.galleryId || '').trim();
    const mediaType = String(item?.mediaType || '').trim().toLowerCase();
    const isDreamGallery = source === 'dream-gallery' && galleryId;
    const marker = `${url} ${thumbUrl} ${originalThumbUrl}`.toLowerCase();
    if (/\.(?:css|js|woff2?|ttf|eot|svg|map)(?:[?#]|$)|\/(?:css|js|fonts?|libs?|assets\/(?:css|js|libs?|fonts?))\//i.test(marker)) return null;
    if (/\/members\/media\/gallery\/(?:loadImages|loadMedia|loadFolders)\b/i.test(marker)) return null;
    if (kind === 'photo' && !isDreamGallery && !/\.(?:jpe?g|png|webp|gif)(?:[?#]|$)|profile-photos-cdn|\/uploads?\//i.test(marker)) return null;
    if (kind === 'video' && !galleryId) return null;
    if (kind === 'video' && !isDreamGallery && !(mediaType === 'video' || /\.(?:mp4|webm|mov|m4v)(?:[?#]|$)|video|movie/i.test(marker))) return null;
    const stableUrl = String(url || originalThumbUrl || thumbUrl || '').split('?')[0];
    const id = String(item?.id || `${kind}:${galleryId || stableUrl || index}`).trim();
    const key = `${kind}:${galleryId || stableUrl || id}`;
    if (!url || seen.has(key)) return null;
    seen.add(key);
    return {
      source: source || 'dream-gallery',
      kind,
      id,
      galleryId,
      url,
      thumbUrl: thumbUrl || originalThumbUrl || url,
      originalThumbUrl,
      mediaType,
      label: String(item?.label || (kind === 'video' ? 'Video' : 'Photo')).trim().slice(0, 120),
      section: String(item?.section || '').trim().slice(0, 40),
      page: Math.max(1, Number(item?.page || 1) || 1),
      index: Number.isFinite(Number(item?.index)) ? Number(item.index) : index,
      savedAt: now
    };
  }).filter(Boolean).slice(0, 5000);

  if (merge) {
    const merged = [];
    const mergedSeen = new Set();
    [...media, ...previousMedia].forEach(item => {
      const kind = String(item?.kind || '').toLowerCase() === 'video' ? 'video' : 'photo';
      const galleryId = String(item?.galleryId || '').trim();
      const key = `${kind}:${galleryId || String(item?.url || item?.originalThumbUrl || item?.thumbUrl || item?.id || '').split('?')[0]}`;
      if (!key || mergedSeen.has(key)) return;
      mergedSeen.add(key);
      merged.push(item);
    });
    profile.workspaceMediaGallery = merged.slice(0, 5000);
  } else {
    profile.workspaceMediaGallery = replaceKind === 'photo' || replaceKind === 'video'
      ? [...previousMedia.filter(item => String(item?.kind || '') !== replaceKind), ...media]
      : media;
  }
  profile.workspaceMediaGallerySyncedAt = now;
  profile.updatedAt = now;
  writeDb(db);
  res.json({ ok: true, media: profile.workspaceMediaGallery, syncedAt: now });
});

app.post('/api/workspace/letter', async (req, res) => {
  const key = String(req.body?.key || '').trim();
  const incoming = req.body?.letter || {};
  const db = readDb();
  const profile = getProfileStore(db, req.profileId, true);
  const letters = Array.isArray(profile.workspaceInbox) ? profile.workspaceInbox : [];
  const index = letters.findIndex(letter => String(letter?.key || '') === key);
  if (!key || index < 0) return res.status(404).json({ ok: false, error: 'Letter was not found' });

  const cleanText = value => String(value || '').replace(/\r\n/g, '\n').trim();
  const looksLikeWorkspaceNavigation = value => {
    const text = cleanText(value);
    const navHits = [
      /Dream Singles is the Premier/i,
      /Cookie Consent/i,
      /VIP Gallery/i,
      /Success Stories/i,
      /Account Options/i,
      /Anti[-\s]?scam/i,
      /How to use chat/i,
      /#1 INTERNATIONAL DATING/i,
      /Create Folder/i,
      /Trash\s*\n\s*Sent\s*\n\s*Drafts/i,
      /Service and Refund Policy/i,
      /Schedule a Date service/i,
      /General Policy/i,
      /Contact Us/i
    ].filter(pattern => pattern.test(text)).length;
    const looksLikeReadShell = /letters_read_|letters_women_sent_/i.test(text) &&
      /Create Folder|Trash|Sent|Drafts|Confirm Delete/i.test(text);
    return navHits >= 3 || looksLikeReadShell;
  };
  const hasWorkspaceClock = value => /\b\d{1,2}:\d{2}\b/.test(String(value || ''));
  const dateFromWorkspaceKey = value => String(value || '').match(/\b20\d{2}-\d{2}-\d{2}\s+\d{1,2}:\d{2}\b/)?.[0] || '';
  const incomingDateText = String(incoming.dateText || '').trim();
  const currentDateText = String(letters[index].dateText || '').trim();
  const nextDateText = hasWorkspaceClock(incomingDateText)
    ? incomingDateText
    : (hasWorkspaceClock(currentDateText) ? currentDateText : (dateFromWorkspaceKey(key) || incomingDateText || currentDateText));
  const attachments = await cacheWorkspaceAttachments(
    req.profileId,
    key,
    incoming.attachments?.length ? incoming.attachments : letters[index].attachments
  );
  const conversation = Array.isArray(incoming.conversation)
    ? incoming.conversation.map(item => ({
        direction: String(item?.direction || 'incoming').slice(0, 20),
        author: String(item?.author || '').trim().slice(0, 80),
        dateText: String(item?.dateText || '').trim().slice(0, 80),
        text: cleanText(item?.text).slice(0, 20000)
      })).filter(item => item.text && !looksLikeWorkspaceNavigation(item.text)).slice(0, 30)
    : [];
  const nextBodyText = cleanText(incoming.bodyText || incoming.text || letters[index].bodyText);
  const cleanNextBodyText = looksLikeWorkspaceNavigation(nextBodyText) ? '' : nextBodyText;
  const hasLetterContent = Boolean(cleanNextBodyText || conversation.length || attachments.length);
  if (!hasLetterContent) {
    letters[index] = {
      ...letters[index],
      readError: 'Could not load letter text',
      attachmentsChecked: false
    };
    profile.workspaceInbox = letters;
    profile.updatedAt = new Date().toISOString();
    writeDb(db);
    return res.json({ ok: true, letter: letters[index], letters });
  }

  letters[index] = {
    ...letters[index],
    direction: String(incoming.direction || letters[index].direction || 'incoming') === 'outgoing' ? 'outgoing' : 'incoming',
    subject: String(incoming.subject || letters[index].subject || '').trim().slice(0, 200),
    bodyText: cleanNextBodyText.slice(0, 20000),
    sourceUrl: String(incoming.sourceUrl || incoming.url || letters[index].messageLink || '').trim(),
    dateText: nextDateText.slice(0, 80),
    conversation: conversation.length ? conversation : letters[index].conversation || [],
    attachments,
    attachmentsChecked: true,
    unread: false,
    readError: '',
    readAt: new Date().toISOString()
  };

  profile.workspaceInbox = letters;
  profile.updatedAt = new Date().toISOString();
  writeDb(db);
  res.json({ ok: true, letter: letters[index], letters });
});

app.use('/api/other-men', (req, res, next) => {
  const profileId = req.get('X-Profile-ID');
  const db = readDb();
  const user = getRequestUser(req, db);
  const assigned = user && userHasWorkingProfile(db, user, profileId);
  if (!isAllowedProfile(profileId) || !assigned) {
    return res.status(user ? 403 : 401).json({ ok: false, error: 'Access is denied for this profile' });
  }
  req.user = user;
  req.profileId = String(profileId);
  next();
});

app.get('/api/other-men', (req, res) => {
  const db = readDb();
  const profile = getProfileStore(db, req.profileId);
  const men = Object.values(profile?.otherMen || {}).sort((a, b) =>
    parseDate(b.chatOrderAt) - parseDate(a.chatOrderAt) ||
    parseDate(b.favoriteUpdatedAt) - parseDate(a.favoriteUpdatedAt) ||
    Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0)
  );
  res.json({ ok: true, men });
});

app.post('/api/other-men', (req, res) => {
  const db = readDb();
  const profile = getProfileStore(db, req.profileId, true);
  profile.otherMen ||= {};
  const incoming = req.body?.man || req.body || {};
  const id = String(incoming.id || '').trim();
  if (!/^\d{4,}$/.test(id)) return res.status(400).json({ ok: false, error: 'Enter a valid man ID' });
  if (profile.men?.[id]) return res.status(409).json({ ok: false, error: 'This man is already in the main Favorites list' });

  const old = profile.otherMen[id] || {};
  const savedPhotoUrl = savePhotoData(req.profileId, `other_${id}`, incoming.photoData);
  const now = new Date().toISOString();
  profile.otherMen[id] = {
    ...old,
    id,
    name: String(incoming.name || old.name || `Man ${id}`).trim(),
    profileLink: String(incoming.profileLink || old.profileLink || `https://www.dream-singles.com/${id}.html`),
    photoUrl: savedPhotoUrl || (incoming.verified === true
      ? String(incoming.photoUrl || '')
      : String(old.photoUrl || incoming.photoUrl || '')),
    lastActivityText: String(incoming.verified === true
      ? (incoming.lastActivityText || '')
      : (incoming.lastActivityText || old.lastActivityText || '')).slice(0, 100),
    onlineNow: incoming.onlineNow === true,
    note: String(old.note || ''),
    status: normalizeStatus(old.status || ''),
    favorite: old.id ? old.favorite === true : false,
    siteIgnored: incoming.siteIgnored === true || old.siteIgnored === true,
    siteIgnoredUpdatedAt: old.siteIgnoredUpdatedAt || '',
    createdAt: old.createdAt || now,
    chatOrderAt: old.chatOrderAt || now,
    updatedAt: now
  };
  profile.updatedAt = now;
  writeDb(db);
  res.json({ ok: true, man: profile.otherMen[id] });
});

app.patch('/api/other-men/:id/note', (req, res) => {
  const db = readDb();
  const profile = getProfileStore(db, req.profileId);
  const man = profile?.otherMen?.[String(req.params.id)];
  if (!man) return res.status(404).json({ ok: false, error: 'Man not found' });
  man.note = String(req.body?.note || '');
  man.updatedAt = new Date().toISOString();
  profile.updatedAt = man.updatedAt;
  writeDb(db);
  res.json({ ok: true, man });
});

app.patch('/api/other-men/:id/status', (req, res) => {
  const db = readDb();
  const profile = getProfileStore(db, req.profileId);
  const man = profile?.otherMen?.[String(req.params.id)];
  if (!man) return res.status(404).json({ ok: false, error: 'Man not found' });
  man.status = normalizeStatus(req.body?.status || '');
  man.updatedAt = new Date().toISOString();
  profile.updatedAt = man.updatedAt;
  writeDb(db);
  res.json({ ok: true, man });
});

app.patch('/api/other-men/:id/presence', (req, res) => {
  const db = readDb();
  const profile = getProfileStore(db, req.profileId);
  const man = profile?.otherMen?.[String(req.params.id)];
  if (!man) return res.status(404).json({ ok: false, error: 'Man not found' });

  const activityText = String(req.body?.lastActivityText || '').trim().slice(0, 100);
  man.onlineNow = req.body?.onlineNow === true || /^Online\s+now$/i.test(activityText);
  man.lastActivityText = man.onlineNow ? 'Online now' : activityText;
  man.onlineCheckedAt = new Date().toISOString();
  man.updatedAt = man.onlineCheckedAt;
  profile.updatedAt = man.updatedAt;
  writeDb(db);
  res.json({ ok: true, man });
});

app.patch('/api/other-men/:id/favorite', (req, res) => {
  const db = readDb();
  const profile = getProfileStore(db, req.profileId);
  const man = profile?.otherMen?.[String(req.params.id)];
  if (!man) return res.status(404).json({ ok: false, error: 'Man not found' });
  man.favorite = req.body?.favorite === true;
  man.favoriteUpdatedAt = new Date().toISOString();
  man.chatOrderAt = man.favorite ? man.favoriteUpdatedAt : '';
  man.updatedAt = man.favoriteUpdatedAt;
  profile.updatedAt = man.updatedAt;
  writeDb(db);
  res.json({ ok: true, man });
});

app.patch('/api/other-men/:id/site-ignored', (req, res) => {
  const db = readDb();
  const profile = getProfileStore(db, req.profileId);
  const man = profile?.otherMen?.[String(req.params.id)];
  if (!man) return res.status(404).json({ ok: false, error: 'Man not found' });
  man.siteIgnored = req.body?.siteIgnored === true;
  man.siteIgnoredUpdatedAt = new Date().toISOString();
  man.updatedAt = man.siteIgnoredUpdatedAt;
  profile.updatedAt = man.updatedAt;
  writeDb(db);
  res.json({ ok: true, man });
});

app.delete('/api/other-men/:id', (req, res) => {
  const db = readDb();
  const profile = getProfileStore(db, req.profileId);
  if (profile?.otherMen) delete profile.otherMen[String(req.params.id)];
  profile.updatedAt = new Date().toISOString();
  writeDb(db);
  res.json({ ok: true });
});

app.post('/api/men/online-status', (req, res) => {
  const db = readDb();
  const profile = getProfileStore(db, req.profileId);
  const statuses = Array.isArray(req.body?.statuses) ? req.body.statuses : [];
  if (!profile) return res.status(404).json({ ok: false, error: 'Profile not found' });

  if (req.body?.source === 'gentlemen-online') {
    for (const man of Object.values(profile.men || {})) {
      man.onlineNow = false;
      if (man.lastActivityText === 'Online now') man.lastActivityText = '';
    }
  }

  if (req.body?.source === 'gentlemen-online' && profile.presenceVersion !== 2) {
    for (const man of Object.values(profile.men || {})) {
      delete man.onlineNow;
      delete man.lastActivityText;
      delete man.lastSeenOnlineAt;
      delete man.onlineCheckedAt;
    }
    profile.presenceVersion = 2;
  }

  let updated = 0;
  const checkedAt = new Date().toISOString();
  const statusById = new Map();
  for (const status of statuses) {
    const id = String(status?.id || '');
    if (id) statusById.set(id, status);
    const man = profile.men?.[String(status?.id || '')];
    const activityText = String(status.lastActivityText || '').trim();
    const onlineNow = status.onlineNow === true || /^Online\s+now$/i.test(activityText);
    if (man) {
      man.onlineNow = onlineNow;
      if (man.onlineNow) {
        man.lastSeenOnlineAt = checkedAt;
        man.lastActivityText = 'Online now';
      } else if (activityText) {
        man.lastActivityText = activityText.slice(0, 100);
      } else if (man.lastActivityText === 'Online now') {
        man.lastActivityText = '';
      }
      man.onlineCheckedAt = checkedAt;
    }
    updated++;
  }
  if (Array.isArray(profile.workspaceInbox)) {
    profile.workspaceInbox = profile.workspaceInbox.map(letter => {
      const status = statusById.get(String(letter?.id || ''));
      if (!status) return letter;
      const activityText = String(status.lastActivityText || '').trim();
      const onlineNow = status.onlineNow === true || /^Online\s+now$/i.test(activityText);
      return {
        ...letter,
        onlineNow,
        onlineCheckedAt: checkedAt,
        lastActivityText: onlineNow ? 'Online now' : activityText.slice(0, 100)
      };
    });
  }
  profile.updatedAt = checkedAt;
  writeDb(db);
  res.json({ ok: true, updated, checkedAt });
});

app.post('/api/men/site-favorites', (req, res) => {
  const db = readDb();
  const profile = getProfileStore(db, req.profileId);
  if (!profile) return res.status(404).json({ ok: false, error: 'Profile not found' });

  const favoriteIds = new Set((Array.isArray(req.body?.favoriteIds) ? req.body.favoriteIds : []).map(String));
  const updatedAt = new Date().toISOString();
  let updated = 0;
  for (const man of Object.values(profile.men || {})) {
    const siteFavorite = favoriteIds.has(String(man.id));
    if (man.siteFavorite !== siteFavorite) updated++;
    man.siteFavorite = siteFavorite;
    man.siteFavoriteUpdatedAt = updatedAt;
  }
  if (Array.isArray(profile.workspaceInbox)) {
    profile.workspaceInbox = profile.workspaceInbox.map(letter => ({
      ...letter,
      siteFavorite: favoriteIds.has(String(letter?.id || '')),
      siteFavoriteUpdatedAt: updatedAt
    }));
  }
  profile.updatedAt = updatedAt;
  writeDb(db);
  res.json({ ok: true, added: 0, updated, favorites: favoriteIds.size });
});

app.post('/api/men/site-ignored', (req, res) => {
  const db = readDb();
  const profile = getProfileStore(db, req.profileId);
  if (!profile) return res.status(404).json({ ok: false, error: 'Profile not found' });

  const ignoredIds = new Set((Array.isArray(req.body?.ignoredIds) ? req.body.ignoredIds : []).map(String));
  const updatedAt = new Date().toISOString();
  let updated = 0;
  for (const man of Object.values(profile.men || {})) {
    const siteIgnored = ignoredIds.has(String(man.id));
    if (man.siteIgnored !== siteIgnored) updated++;
    man.siteIgnored = siteIgnored;
    man.siteIgnoredUpdatedAt = updatedAt;
  }
  if (Array.isArray(profile.workspaceInbox)) {
    profile.workspaceInbox = profile.workspaceInbox.map(letter => ({
      ...letter,
      siteIgnored: ignoredIds.has(String(letter?.id || '')),
      siteIgnoredUpdatedAt: updatedAt
    }));
  }
  profile.updatedAt = updatedAt;
  writeDb(db);
  res.json({ ok: true, added: 0, updated, ignored: ignoredIds.size });
});

app.post('/api/men/:id/profile', (req, res) => {
  const db = readDb();
  const id = String(req.params.id);
  const profileStore = getProfileStore(db, req.profileId);
  const man = profileStore?.men?.[id];

  if (!man) {
    return res.status(404).json({ ok: false, error: 'man not found' });
  }

  const incoming = req.body?.profile || {};
  const fields = [
    'age', 'birthDate', 'zodiac', 'height', 'occupation', 'weight',
    'education', 'hair', 'religion', 'eyes', 'relationshipStatus',
    'city', 'country', 'numberOfKids', 'smoker', 'aboutMe', 'online'
  ];
  const profile = {};

  for (const field of fields) {
    profile[field] = String(incoming[field] ?? '').trim();
  }

  const savedPhotoUrl = savePhotoData(req.profileId, id, req.body?.photoData);
  if (savedPhotoUrl) man.photoUrl = savedPhotoUrl;
  if (incoming.photoUrl && !man.photoUrl) man.photoUrl = String(incoming.photoUrl);

  man.profileDetails = profile;
  man.profileUpdatedAt = new Date().toISOString();
  man.updatedAt = man.profileUpdatedAt;
  profileStore.updatedAt = man.profileUpdatedAt;
  writeDb(db);

  res.json({ ok: true, man });
});

app.patch('/api/men/:id/note', (req, res) => {
  const db = readDb();
  const id = String(req.params.id);
  const profile = getProfileStore(db, req.profileId);

  if (!profile?.men?.[id]) {
    return res.status(404).json({ ok: false, error: 'man not found' });
  }

  profile.men[id].note = String(req.body?.note || '');
  profile.men[id].noteUpdatedAt = new Date().toISOString();
  profile.men[id].updatedAt = profile.men[id].noteUpdatedAt;
  profile.updatedAt = profile.men[id].updatedAt;

  writeDb(db);

  res.json({ ok: true, man: profile.men[id] });
});

app.patch('/api/men/:id/status', (req, res) => {
  const db = readDb();
  const id = String(req.params.id);
  const profile = getProfileStore(db, req.profileId);

  if (!profile?.men?.[id]) {
    return res.status(404).json({ ok: false, error: 'man not found' });
  }

  const status = normalizeStatus(req.body?.status || '');

  profile.men[id].status = status;
  profile.men[id].statusUpdatedAt = new Date().toISOString();
  profile.men[id].updatedAt = profile.men[id].statusUpdatedAt;
  profile.updatedAt = profile.men[id].updatedAt;

  writeDb(db);

  res.json({ ok: true, man: profile.men[id] });
});

app.patch('/api/men/:id/presence', (req, res) => {
  const db = readDb();
  const id = String(req.params.id);
  const profile = getProfileStore(db, req.profileId, true);
  const activityText = String(req.body?.lastActivityText || '').trim().slice(0, 100);
  const onlineNow = req.body?.onlineNow === true || /^Online\s+now$/i.test(activityText);
  const checkedAt = new Date().toISOString();

  profile.men ||= {};
  if (!profile.men[id]) {
    const letter = Array.isArray(profile.workspaceInbox)
      ? profile.workspaceInbox.find(item => String(item?.id || '') === id)
      : null;
    profile.men[id] = {
      id,
      name: String(letter?.name || `Man ${id}`).trim(),
      photoUrl: String(letter?.photoUrl || '').trim(),
      profileLink: String(letter?.profileLink || `https://www.dream-singles.com/${id}.html`).trim(),
      createdAt: checkedAt
    };
  }

  profile.men[id].onlineNow = onlineNow;
  profile.men[id].lastActivityText = onlineNow ? 'Online now' : activityText;
  profile.men[id].onlineCheckedAt = checkedAt;
  profile.men[id].updatedAt = checkedAt;

  if (Array.isArray(profile.workspaceInbox)) {
    profile.workspaceInbox = profile.workspaceInbox.map(letter => String(letter?.id || '') === id
      ? {
          ...letter,
          onlineNow,
          lastActivityText: profile.men[id].lastActivityText,
          onlineCheckedAt: checkedAt
        }
      : letter);
  }

  profile.updatedAt = checkedAt;
  writeDb(db);
  res.json({ ok: true, man: profile.men[id] });
});

app.patch('/api/men/:id/favorite', (req, res) => {
  const db = readDb();
  const id = String(req.params.id);
  const profile = getProfileStore(db, req.profileId);

  if (!profile?.men?.[id]) {
    return res.status(404).json({ ok: false, error: 'man not found' });
  }

  profile.men[id].favorite = req.body?.favorite === true;
  profile.men[id].favoriteUpdatedAt = new Date().toISOString();
  profile.men[id].updatedAt = profile.men[id].favoriteUpdatedAt;
  profile.updatedAt = profile.men[id].updatedAt;

  writeDb(db);

  res.json({ ok: true, man: profile.men[id] });
});

app.patch('/api/men/:id/pinned', (req, res) => {
  const db = readDb();
  const id = String(req.params.id);
  const profile = getProfileStore(db, req.profileId);

  if (!profile?.men?.[id]) {
    return res.status(404).json({ ok: false, error: 'man not found' });
  }

  profile.men[id].pinned = req.body?.pinned === true;
  profile.men[id].pinnedUpdatedAt = new Date().toISOString();
  profile.men[id].updatedAt = profile.men[id].pinnedUpdatedAt;
  profile.updatedAt = profile.men[id].updatedAt;

  writeDb(db);

  res.json({ ok: true, man: profile.men[id] });
});

app.patch('/api/men/:id/site-favorite', (req, res) => {
  const db = readDb();
  const id = String(req.params.id);
  const profile = getProfileStore(db, req.profileId);

  if (!profile) {
    return res.status(404).json({ ok: false, error: 'profile not found' });
  }
  if (!profile.men?.[id]) {
    const letter = Array.isArray(profile.workspaceInbox)
      ? profile.workspaceInbox.find(item => String(item?.id || '') === id)
      : null;
    profile.men ||= {};
    profile.men[id] = {
      id,
      name: String(letter?.name || `Man ${id}`).trim(),
      photoUrl: String(letter?.photoUrl || '').trim(),
      profileLink: String(letter?.profileLink || `https://www.dream-singles.com/${id}.html`).trim(),
      createdAt: new Date().toISOString()
    };
  }

  profile.men[id].siteFavorite = req.body?.siteFavorite === true;
  profile.men[id].siteFavoriteUpdatedAt = new Date().toISOString();
  profile.men[id].updatedAt = profile.men[id].siteFavoriteUpdatedAt;
  profile.updatedAt = profile.men[id].updatedAt;
  if (Array.isArray(profile.workspaceInbox)) {
    profile.workspaceInbox = profile.workspaceInbox.map(letter => String(letter?.id || '') === id
      ? {
          ...letter,
          siteFavorite: profile.men[id].siteFavorite,
          siteFavoriteUpdatedAt: profile.men[id].siteFavoriteUpdatedAt
        }
      : letter);
  }
  writeDb(db);

  res.json({ ok: true, man: profile.men[id] });
});

app.patch('/api/men/:id/site-ignored', (req, res) => {
  const db = readDb();
  const id = String(req.params.id);
  const profile = getProfileStore(db, req.profileId);
  if (!profile?.men?.[id]) return res.status(404).json({ ok: false, error: 'man not found' });

  profile.men[id].siteIgnored = req.body?.siteIgnored === true;
  profile.men[id].siteIgnoredUpdatedAt = new Date().toISOString();
  profile.men[id].updatedAt = profile.men[id].siteIgnoredUpdatedAt;
  profile.updatedAt = profile.men[id].updatedAt;
  writeDb(db);
  res.json({ ok: true, man: profile.men[id] });
});

app.delete('/api/men/:id', (req, res) => {
  if (req.user?.role === 'operator') {
    return res.status(403).json({ ok: false, error: 'Only a director can delete men' });
  }

  const db = readDb();
  const id = String(req.params.id);
  const profile = getProfileStore(db, req.profileId);

  if (profile?.men) {
    delete profile.men[id];
    profile.updatedAt = new Date().toISOString();
  }
  writeDb(db);

  res.json({ ok: true });
});

migrateDatabase();

app.listen(PORT, () => {
  console.log(`Dream Local CRM is running: http://localhost:${PORT}`);
});
