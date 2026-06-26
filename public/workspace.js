let workspaceLetters = [];
let workspaceProfiles = [];
let workspaceSelectedId = '';
let workspaceSelectedLetterKey = '';
let workspaceLettersFilter = sessionStorage.getItem('dream_workspace_letters_filter') || 'all';
if (!['all', 'men'].includes(workspaceLettersFilter)) workspaceLettersFilter = 'all';
let workspaceOnlyOnline = sessionStorage.getItem('dream_workspace_top_online') === '1';
let workspaceListFilter = 'inbox';
let workspaceInboxListLoading = false;
let workspaceListLoadingFilter = '';
let workspaceInboxBackgroundScanning = false;
let workspaceInboxBackgroundTimer = null;
let workspaceListPage = 1;
const WORKSPACE_LIST_PAGE_SIZE = 20;
let workspaceLetterPage = 1;
const WORKSPACE_LETTER_PAGE_SIZE = 20;
const WORKSPACE_MIN_LETTER_PAGES = 5;
const WORKSPACE_LETTER_PAGE_WINDOW = 5;
const WORKSPACE_DREAM_PAGE_SIZE = 12;
let workspaceOnlineRefreshInProgress = false;
let copyReadIdsResetTimer = null;
let workspaceTranslatorSettings = { provider: 'deepl', targetLang: 'RU', hasApiKey: false };
const workspaceTranslationResults = new Map();
const workspaceTranslationLoading = new Set();
let workspaceReplyTranslating = false;
const workspaceLoadingLetterKeys = new Set();
const workspaceFavoriteLoadingIds = new Set();
const workspaceDialogSyncStates = new Map();
const workspaceRowSyncIds = new Set();
const workspaceLetterPageLoading = new Set();
const workspaceLetterStripScroll = new Map();
const workspaceLetterVisiblePages = new Map();
const workspaceLetterKnownEndPages = new Map();

const extensionRequests = new Map();
const activeProfileId = localStorage.getItem('dream_crm_profile_id') || '';
const workspaceSessionPrefix = `dream_workspace_${activeProfileId || 'default'}`;
try {
  window.history.replaceState({ workspace: true }, '', window.location.href);
  window.history.pushState({ workspaceGuard: true }, '', window.location.href);
} catch {}
window.addEventListener('popstate', () => {
  try {
    window.history.pushState({ workspaceGuard: true }, '', window.location.href);
  } catch {}
  if (workspaceEmbedded) {
    window.parent?.postMessage({ source: 'dream-workspace', type: 'OPEN_AGENCY_HOME' }, '*');
  }
});
const profileNameLabel = document.getElementById('workspaceProfileName');
const profileLabel = document.getElementById('workspaceProfileLabel');
const profileAvatar = document.getElementById('workspaceProfileAvatar');
const searchInput = document.getElementById('workspaceSearch');
const searchButton = document.querySelector('.workspace-search-button');
const menList = document.getElementById('workspaceMenList');
const hint = document.getElementById('workspaceHint');
const dialog = document.getElementById('workspaceDialog');
const headerTitle = document.getElementById('workspaceHeaderTitle');
const headerDialog = document.getElementById('workspaceHeaderDialog');
const headerLetters = document.getElementById('workspaceHeaderLetters');
const composer = document.querySelector('.workspace-composer');
const reply = document.getElementById('workspaceReply');
const replyCounter = document.getElementById('workspaceReplyCount');
const photoBtn = document.getElementById('workspacePhotoBtn');
const videoBtn = document.getElementById('workspaceVideoBtn');
const replyTranslateBtn = document.getElementById('workspaceReplyTranslateBtn');
const sendBtn = document.getElementById('workspaceSendBtn');
const attachmentQueue = document.getElementById('workspaceAttachmentQueue');
const mediaModal = document.getElementById('workspaceMediaModal');
const mediaTitle = document.getElementById('workspaceMediaTitle');
const mediaSections = document.getElementById('workspaceMediaSections');
const mediaRefresh = document.getElementById('workspaceMediaRefresh');
const mediaRefreshInline = document.getElementById('workspaceMediaRefreshInline');
const mediaSelect = document.getElementById('workspaceMediaSelect');
const mediaClose = document.getElementById('workspaceMediaClose');
const mediaCount = document.getElementById('workspaceMediaCount');
const mediaSummary = document.getElementById('workspaceMediaSummary');
const mediaPager = document.getElementById('workspaceMediaPager');
const mediaGrid = document.getElementById('workspaceMediaGrid');
const refreshBtn = document.getElementById('workspaceRefreshBtn');
const connectionToggleBtn = document.getElementById('workspaceConnectionToggle');
const syncRowsInput = document.getElementById('workspaceSyncRows');
const rowsUpdateBtn = document.getElementById('workspaceRowsUpdateBtn');
const syncStatus = document.getElementById('workspaceSyncStatus');
const onlyOnlineBtn = document.getElementById('workspaceOnlyOnlineBtn');
const topOnlineBtn = document.getElementById('workspaceTopOnlineBtn');
const translatorModal = document.getElementById('workspaceTranslatorModal');
const translatorClose = document.getElementById('workspaceTranslatorClose');
const translatorProvider = document.getElementById('workspaceTranslatorProvider');
const translatorTarget = document.getElementById('workspaceTranslatorTarget');
const translatorApiKey = document.getElementById('workspaceTranslatorApiKey');
const translatorState = document.getElementById('workspaceTranslatorState');
const translatorSave = document.getElementById('workspaceTranslatorSave');
const translatorTest = document.getElementById('workspaceTranslatorTest');
const inboxFilterBtn = document.getElementById('workspaceInboxFilterBtn');
const readFilterBtn = document.getElementById('workspaceReadFilterBtn');
const copyReadIdsBtn = document.getElementById('workspaceCopyReadIdsBtn');
const noReplyFilterBtn = document.getElementById('workspaceNoReplyFilterBtn');
const inboxLoading = document.getElementById('workspaceInboxLoading');
const sentBtn = document.getElementById('workspaceSentBtn');
const themeToggleBtn = document.getElementById('workspaceThemeToggle');
const replySentSound = new Audio('/assets/reply-sent.mp3');
replySentSound.preload = 'auto';
replySentSound.volume = 1;
const inboxNewMessageSound = new Audio('/assets/inbox-new-message.mp3');
inboxNewMessageSound.preload = 'auto';
inboxNewMessageSound.volume = 1;
let replySentSoundUnlocked = false;
let inboxNewMessageSoundUnlocked = false;
let workspacePendingReplyAttachments = [];
let workspaceMediaCache = [];
let workspaceMediaMode = 'photo';
let workspaceMediaSection = 'firstLetters';
let workspaceMediaPage = 1;
let workspaceMediaSelectedId = '';
let workspaceMediaSyncedAt = '';
let workspaceMediaPreviewId = '';
let workspaceMediaLastStats = [];
let workspaceProfileSyncRunning = false;
const MAX_REPLY_ATTACHMENT_SIZE = 25 * 1024 * 1024;
const WORKSPACE_MEDIA_PAGE_SIZE = 20;
const WORKSPACE_MEDIA_SECTIONS = {
  photo: [
    { id: 'others', label: 'Others' },
    { id: 'firstLetters', label: 'First Letters' },
    { id: 'favorites', label: 'Favorites' },
    { id: 'all', label: 'All' }
  ],
  video: [
    { id: 'others', label: 'Others' },
    { id: 'favorites', label: 'Favorites' }
  ]
};
const WORKSPACE_SYNC_ROWS_KEY = 'dream_workspace_sync_rows';
const WORKSPACE_SYNC_ROWS_DEFAULT = 10;
const WORKSPACE_REPLY_SENT_SYNC_ROWS = 3;
const WORKSPACE_INBOX_SYNC_PAGES = 5;
const WORKSPACE_INBOX_AUTH_REFRESH_PAGES = 3;
const WORKSPACE_INBOX_BACKGROUND_PAGES = 2;
const WORKSPACE_INBOX_BACKGROUND_INTERVAL_MS = 60 * 1000;
const WORKSPACE_FULL_SYNC_PAGES = 9999;
const WORKSPACE_THEME_KEY = 'dream_global_theme';
const workspaceUrlParams = new URLSearchParams(window.location.search);
const workspaceEmbedded = workspaceUrlParams.get('embedded') === '1';
const workspaceAutoloadInbox = workspaceUrlParams.get('autoloadInbox') === '1';
const savedWorkspaceListFilter = sessionStorage.getItem(`${workspaceSessionPrefix}_list_filter`) ||
  sessionStorage.getItem('dream_workspace_list_filter') ||
  'inbox';
workspaceListFilter = ['inbox', 'read', 'noreply'].includes(savedWorkspaceListFilter)
  ? savedWorkspaceListFilter
  : 'inbox';
if (workspaceAutoloadInbox) workspaceListFilter = 'inbox';

function persistWorkspaceListFilter() {
  const filter = ['inbox', 'read', 'noreply'].includes(workspaceListFilter) ? workspaceListFilter : 'inbox';
  workspaceListFilter = filter;
  sessionStorage.setItem(`${workspaceSessionPrefix}_list_filter`, filter);
  sessionStorage.setItem('dream_workspace_list_filter', filter);
}
persistWorkspaceListFilter();

if (workspaceEmbedded) {
  document.body.classList.add('workspace-embedded');
}

function applyWorkspaceTheme(theme) {
  const dark = theme === 'dark';
  document.body.classList.toggle('workspace-dark-theme', dark);
  if (themeToggleBtn) {
    themeToggleBtn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    themeToggleBtn.setAttribute('title', dark ? 'Light theme' : 'Dark theme');
  }
}

function installWorkspaceThemeToggle() {
  const legacyTheme = localStorage.getItem('dream_workspace_theme');
  const saved = localStorage.getItem(WORKSPACE_THEME_KEY) || legacyTheme || 'light';
  if (!localStorage.getItem(WORKSPACE_THEME_KEY)) localStorage.setItem(WORKSPACE_THEME_KEY, saved);
  applyWorkspaceTheme(saved);
  themeToggleBtn?.addEventListener('click', () => {
    const next = document.body.classList.contains('workspace-dark-theme') ? 'light' : 'dark';
    localStorage.setItem(WORKSPACE_THEME_KEY, next);
    applyWorkspaceTheme(next);
  });
  window.addEventListener('storage', event => {
    if (event.key === WORKSPACE_THEME_KEY) applyWorkspaceTheme(event.newValue === 'dark' ? 'dark' : 'light');
  });
}

function workspaceSyncRows() {
  const savedValue = syncRowsInput ? localStorage.getItem(WORKSPACE_SYNC_ROWS_KEY) : '';
  const value = Math.round(Number(syncRowsInput?.value || savedValue || WORKSPACE_SYNC_ROWS_DEFAULT));
  const rows = Math.min(WORKSPACE_FULL_SYNC_PAGES, Math.max(1, Number.isFinite(value) ? value : WORKSPACE_SYNC_ROWS_DEFAULT));
  if (syncRowsInput) syncRowsInput.value = String(rows);
  localStorage.setItem(WORKSPACE_SYNC_ROWS_KEY, String(rows));
  return rows;
}

function workspaceInboxSyncPages() {
  return Math.min(WORKSPACE_FULL_SYNC_PAGES, Math.max(1, WORKSPACE_INBOX_SYNC_PAGES));
}

function installWorkspacePageZoom() {
  const key = workspaceEmbedded ? 'dream_workspace_embedded_page_zoom' : 'dream_workspace_page_zoom';
  const min = 0.75;
  const max = 1.3;
  const step = 0.05;
  const normalize = value => Math.min(max, Math.max(min, Math.round(Number(value || 1) * 100) / 100));
  const apply = value => {
    const zoom = normalize(value);
    document.documentElement.style.setProperty('--workspace-zoom', String(zoom));
    localStorage.setItem(key, String(zoom));
  };

  if (workspaceEmbedded) {
    apply(localStorage.getItem(key) || 1);
    window.addEventListener('wheel', event => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      event.stopPropagation();
      const current = normalize(localStorage.getItem(key) || 1);
      apply(current + (event.deltaY > 0 ? -step : step));
    }, { passive: false, capture: true });
    window.addEventListener('keydown', event => {
      if (!event.ctrlKey) return;
      const keyName = event.key;
      if (keyName === '+' || keyName === '=' || keyName === '-' || keyName === '_' || keyName === '0') {
        event.preventDefault();
        event.stopPropagation();
        const current = normalize(localStorage.getItem(key) || 1);
        if (keyName === '0') apply(1);
        else apply(current + (keyName === '-' || keyName === '_' ? -step : step));
      }
    }, { capture: true });
    return;
  }

  apply(localStorage.getItem(key) || 1);

  window.addEventListener('wheel', event => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    const current = normalize(localStorage.getItem(key) || 1);
    apply(current + (event.deltaY > 0 ? -step : step));
  }, { passive: false });

  window.addEventListener('keydown', event => {
    if (!event.ctrlKey) return;
    const keyName = event.key;
    if (keyName === '+' || keyName === '=' || keyName === '-' || keyName === '_' || keyName === '0') {
      event.preventDefault();
      const current = normalize(localStorage.getItem(key) || 1);
      if (keyName === '0') apply(1);
      else apply(current + (keyName === '-' || keyName === '_' ? -step : step));
    }
  });
}

installWorkspacePageZoom();
if (syncRowsInput) {
  syncRowsInput.value = String(workspaceSyncRows());
  syncRowsInput.addEventListener('change', workspaceSyncRows);
  syncRowsInput.addEventListener('blur', workspaceSyncRows);
}

localStorage.removeItem('dream_workspace_search');
searchInput.value = '';
function clearWorkspaceSearchAutofill() {
  if (!searchInput) return;
  if (!searchInput.matches(':focus')) searchInput.value = '';
}
searchInput?.addEventListener('focus', () => {
  searchInput.removeAttribute('readonly');
  if (/^vados$/i.test(searchInput.value.trim())) searchInput.value = '';
});
searchInput?.addEventListener('pointerdown', () => {
  searchInput.removeAttribute('readonly');
}, { once: true });
[50, 250, 800, 1600].forEach(delay => window.setTimeout(clearWorkspaceSearchAutofill, delay));
workspaceSelectedId = sessionStorage.getItem(`${workspaceSessionPrefix}_selected_id`) || '';
workspaceSelectedLetterKey = sessionStorage.getItem(`${workspaceSessionPrefix}_selected_letter_key`) || '';

window.addEventListener('message', event => {
  if (event.data?.type === 'DREAM_CRM_STATUS') {
    if (workspaceEmbedded && event.source !== window.parent) return;
    if (!workspaceEmbedded && event.source !== window) return;
    updateProfileSyncStatus(event.data.status?.message || '', event.data.status);
    return;
  }

  const directResponse = event.data?.type === 'DREAM_CRM_RESPONSE' && event.source === window;
  const embeddedResponse = workspaceEmbedded &&
    event.data?.type === 'DREAM_CRM_WORKSPACE_RESPONSE' &&
    event.source === window.parent;
  if (!directResponse && !embeddedResponse) return;

  const pending = extensionRequests.get(event.data.requestId);
  if (!pending) return;
  extensionRequests.delete(event.data.requestId);
  pending(event.data.response || { ok: false, error: 'Extension did not respond' });
});

function updateProfileSyncStatus(message = '', status = {}) {
  if (!syncStatus || !workspaceProfileSyncRunning) return;
  const text = String(message || status?.phase || 'Syncing').trim();
  syncStatus.textContent = text || 'Syncing';
  syncStatus.hidden = false;
}

function setProfileSyncRunning(active, message = '') {
  workspaceProfileSyncRunning = active === true;
  if (refreshBtn) {
    refreshBtn.classList.toggle('syncing', workspaceProfileSyncRunning);
    refreshBtn.setAttribute('aria-busy', workspaceProfileSyncRunning ? 'true' : 'false');
    refreshBtn.title = workspaceProfileSyncRunning ? (message || 'Syncing Dream Singles') : 'Update inbox';
  }
  if (!syncStatus) return;
  if (workspaceProfileSyncRunning) {
    syncStatus.textContent = message || 'Syncing';
    syncStatus.hidden = false;
  } else {
    syncStatus.textContent = '';
    syncStatus.hidden = true;
  }
}

function setWorkspaceActionStatus(message = '', button = null) {
  const text = String(message || '').trim();
  if (button) button.title = text || button.getAttribute('aria-label') || button.textContent || 'Action';
  if (syncStatus) {
    syncStatus.textContent = text;
    syncStatus.hidden = !text;
  }
}

function extensionCommand(command, payload = {}, timeout = 45000) {
  return new Promise((resolve, reject) => {
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const timer = setTimeout(() => {
      extensionRequests.delete(requestId);
      reject(new Error('Extension is not responding'));
    }, timeout);

    extensionRequests.set(requestId, response => {
      clearTimeout(timer);
      response?.ok ? resolve(response) : reject(new Error(response?.error || 'Extension error'));
    });

    if (workspaceEmbedded) {
      window.parent.postMessage({
        type: 'DREAM_CRM_WORKSPACE_COMMAND',
        requestId,
        command,
        payload,
        timeout
      }, '*');
    } else {
      window.postMessage({ type: 'DREAM_CRM_COMMAND', requestId, command, payload }, '*');
    }
  });
}

function isWorkspaceLadyConnected() {
  return Boolean(activeProfileId) && localStorage.getItem(`dream_team_lady_connected_${activeProfileId}`) === '1';
}

async function openWorkspaceDreamUrl(url) {
  const targetUrl = String(url || '').trim();
  if (!targetUrl) return;
  if (workspaceEmbedded) {
    await extensionCommand('OPEN_DREAM_URL', { url: targetUrl }, 45000);
    return;
  }
  window.open(targetUrl, '_blank', 'noopener');
}

function updateWorkspaceConnectionToggle(connected = isWorkspaceLadyConnected(), busy = false) {
  if (!connectionToggleBtn) return;
  connectionToggleBtn.classList.toggle('connected', connected);
  connectionToggleBtn.classList.toggle('disconnected', !connected);
  connectionToggleBtn.disabled = busy;
  connectionToggleBtn.textContent = busy ? '...' : (connected ? 'ON' : 'OFF');
  connectionToggleBtn.setAttribute('aria-pressed', connected ? 'true' : 'false');
  connectionToggleBtn.setAttribute('title', connected ? 'Disconnect' : 'Connect');
}

function clampWorkspacePage(totalItems) {
  const totalPages = Math.max(1, Math.ceil(Math.max(0, totalItems) / WORKSPACE_LIST_PAGE_SIZE));
  workspaceListPage = Math.min(totalPages, Math.max(1, Number(workspaceListPage) || 1));
  return { page: workspaceListPage, totalPages };
}

function renderWorkspacePager(totalItems) {
  if (!menList?.parentElement) return;
  let pager = document.getElementById('workspaceListPager');
  if (!pager) {
    pager = document.createElement('div');
    pager.id = 'workspaceListPager';
    pager.className = 'workspace-list-pager';
  }
  if (pager.parentElement !== menList.parentElement || pager.nextSibling !== menList) {
    menList.parentElement.insertBefore(pager, menList);
  }
  const { page, totalPages } = clampWorkspacePage(totalItems);
  if (totalPages <= 1) {
    pager.innerHTML = '';
    pager.classList.add('hidden');
    return;
  }
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, page + 2);
  const buttons = [];
  if (start > 1) {
    buttons.push('<button type="button" data-workspace-page="1">1</button>');
    if (start > 2) buttons.push('<span>...</span>');
  }
  for (let i = start; i <= end; i += 1) {
    buttons.push(`<button class="${i === page ? 'active' : ''}" type="button" data-workspace-page="${i}">${i}</button>`);
  }
  if (end < totalPages) {
    if (end < totalPages - 1) buttons.push('<span>...</span>');
    buttons.push(`<button type="button" data-workspace-page="${totalPages}">${totalPages}</button>`);
  }
  pager.classList.remove('hidden');
  pager.innerHTML = `
    <small>Men ${totalItems}</small>
    <button type="button" data-workspace-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>&lsaquo;</button>
    ${buttons.join('')}
    <button type="button" data-workspace-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>&rsaquo;</button>
  `;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('`', '&#096;');
}

function activeProfile() {
  return workspaceProfiles.find(item => String(item.id) === String(activeProfileId)) || null;
}

function myProfileName() {
  return activeProfile()?.name || 'Me';
}

function unlockReplySentSound() {
  if (replySentSoundUnlocked) return;
  const wasMuted = replySentSound.muted;
  replySentSound.muted = true;
  replySentSound.currentTime = 0;
  replySentSound.play()
    .then(() => {
      replySentSound.pause();
      replySentSound.currentTime = 0;
      replySentSound.muted = wasMuted;
      replySentSoundUnlocked = true;
    })
    .catch(() => {
      replySentSound.muted = wasMuted;
    });
}

function unlockInboxNewMessageSound() {
  if (inboxNewMessageSoundUnlocked) return;
  const wasMuted = inboxNewMessageSound.muted;
  inboxNewMessageSound.muted = true;
  inboxNewMessageSound.currentTime = 0;
  inboxNewMessageSound.play()
    .then(() => {
      inboxNewMessageSound.pause();
      inboxNewMessageSound.currentTime = 0;
      inboxNewMessageSound.muted = wasMuted;
      inboxNewMessageSoundUnlocked = true;
    })
    .catch(() => {
      inboxNewMessageSound.muted = wasMuted;
    });
}

function playReplySentSound() {
  replySentSound.muted = false;
  replySentSound.volume = 1;
  replySentSound.currentTime = 0;
  replySentSound.play().catch(() => {
    const fallbackSound = new Audio('/assets/reply-sent.mp3');
    fallbackSound.volume = 1;
    fallbackSound.play().catch(() => {});
  });
}

function playInboxNewMessageSound() {
  const sound = new Audio('/assets/inbox-new-message.mp3');
  sound.preload = 'auto';
  sound.volume = 1;
  sound.play().catch(() => {
    inboxNewMessageSound.muted = false;
    inboxNewMessageSound.volume = 1;
    inboxNewMessageSound.currentTime = 0;
    inboxNewMessageSound.play().catch(() => {});
  });
}

function incomingLetterIdentity(letter) {
  if (!letter || letter.direction === 'outgoing') return '';
  return String(letter.key || `${letter.id || ''}:${letter.dateText || ''}:${letter.messageLink || ''}`).trim();
}

function incomingLetterIdentitySet(letters = workspaceLetters) {
  return new Set((letters || []).map(incomingLetterIdentity).filter(Boolean));
}

function pendingIncomingLetterIdentitySet(letters = workspaceLetters) {
  return new Set((letters || [])
    .filter(isFreshPendingIncomingLetter)
    .map(incomingLetterIdentity)
    .filter(Boolean));
}

function pendingIncomingManIdSet(letters = workspaceLetters) {
  return new Set((letters || [])
    .filter(isFreshPendingIncomingLetter)
    .map(letter => String(letter?.id || letter?.profileId || '').trim())
    .filter(id => /^\d{4,}$/.test(id)));
}

function hasNewIncomingActivity(beforeLetters = [], afterLetters = workspaceLetters) {
  const beforeLettersSet = pendingIncomingLetterIdentitySet(beforeLetters);
  const afterLettersSet = pendingIncomingLetterIdentitySet(afterLetters);
  if ([...afterLettersSet].some(key => !beforeLettersSet.has(key))) return true;

  const beforeMenSet = pendingIncomingManIdSet(beforeLetters);
  const afterMenSet = pendingIncomingManIdSet(afterLetters);
  return [...afterMenSet].some(id => !beforeMenSet.has(id));
}

function isFreshPendingIncomingLetter(letter) {
  const fiveMonthsAgo = Date.now() - 153 * 24 * 60 * 60 * 1000;
  const sortDate = parseDateValue(letter?.dateText);
  return letter?.direction !== 'outgoing' &&
    (letter?.unread === true || letter?.unanswered === true) &&
    sortDate > 0 &&
    sortDate >= fiveMonthsAgo;
}

function hasPendingIncomingLetters(letters = workspaceLetters) {
  return (letters || []).some(isFreshPendingIncomingLetter);
}

function unlockWorkspaceSounds() {
  unlockReplySentSound();
  unlockInboxNewMessageSound();
}

document.addEventListener('pointerdown', unlockWorkspaceSounds, { capture: true });
document.addEventListener('keydown', unlockWorkspaceSounds, { capture: true });

function renderProfileSummary() {
  const profile = activeProfile();
  const name = profile?.name || 'Profile';
  profileNameLabel.textContent = name;
  profileLabel.textContent = `ID ${activeProfileId}`;
  profileAvatar.setAttribute('role', 'button');
  profileAvatar.setAttribute('tabindex', '0');
  profileAvatar.setAttribute('title', 'Open profile');
  profileAvatar.setAttribute('aria-label', `Open ${name} profile`);
  const photoUrl = String(profile?.photoUrl || '').trim();
  if (photoUrl) {
    profileAvatar.innerHTML = `<img src="${escapeAttr(photoUrl)}" alt="${escapeAttr(name)}" loading="lazy" decoding="async">`;
  } else {
    profileAvatar.textContent = name.slice(0, 1).toUpperCase() || '?';
  }
}

function openActiveDreamProfile() {
  if (!activeProfileId) return;
  openWorkspaceDreamUrl(`https://www.dream-singles.com/${encodeURIComponent(activeProfileId)}.html`)
    .catch(error => alert(error.message || 'Could not open Dream window'));
}

function clearHeaderDialog() {
  headerTitle?.classList.remove('hidden');
  headerDialog?.classList.add('hidden');
  headerLetters?.classList.add('hidden');
  if (headerDialog) headerDialog.innerHTML = '';
  if (headerLetters) headerLetters.innerHTML = '';
}

function renderHeaderDialog(group) {
  if (!group) {
    clearHeaderDialog();
    return;
  }
  const name = group.name || `Man ${group.id}`;
  const first = name.slice(0, 1).toUpperCase() || '?';
  const photo = group.photoUrl
    ? `<img src="${escapeAttr(group.photoUrl)}" alt="${escapeAttr(name)}" loading="lazy" decoding="async">`
    : escapeHtml(first);
  const profileUrl = group.profileLink || (group.id ? `https://www.dream-singles.com/${group.id}.html` : '');
  const syncState = workspaceDialogSyncStates.get(String(group.id || '')) || '';
  const syncLabel = syncState || 'Sync';
  const isReadMode = workspaceListFilter === 'read';
  const rowSyncing = workspaceRowSyncIds.has(String(group.id || ''));
  headerTitle?.classList.add('hidden');
  headerDialog?.classList.remove('hidden');
  headerDialog?.classList.toggle('read-mode', isReadMode);
  headerDialog.innerHTML = `
    ${profileUrl
      ? `<a class="workspace-avatar workspace-header-avatar workspace-header-profile-link" href="${escapeAttr(profileUrl)}" target="_blank" rel="noopener" title="Open profile">${photo}</a>`
      : `<span class="workspace-avatar workspace-header-avatar">${photo}</span>`}
    <span class="workspace-header-info">
      <span class="workspace-header-name">${escapeHtml(name)}</span>
      <span class="workspace-header-id">ID ${escapeHtml(group.id || '')}${rowSyncing ? '<span class="workspace-header-sync-dots">...</span>' : ''}</span>
    </span>
    <span class="workspace-activity-panel">
      <button class="workspace-check-activity" type="button" title="Check profile activity">Check Activity</button>
      ${group.lastActivityText ? `<span class="workspace-activity-text">${escapeHtml(group.lastActivityText)}</span>` : ''}
    </span>
    <span class="workspace-dialog-local-actions">
      <span class="workspace-sync-menu-wrap ${isReadMode ? 'read-hidden' : ''}">
        <button class="workspace-dialog-sync ${syncState ? 'syncing' : ''}" type="button" title="Sync this man" ${syncState ? 'disabled aria-busy="true"' : ''}>${escapeHtml(syncLabel)}</button>
        <details class="workspace-sync-menu ${syncState ? 'disabled' : ''}">
          <summary title="More sync options" aria-label="More sync options">•</summary>
          <div class="workspace-sync-menu-popover">
            <button class="workspace-dialog-full-sync" type="button">Full sync</button>
          </div>
        </details>
      </span>
      <button class="workspace-dialog-exit" type="button" title="Exit dialog">Exit</button>
    </span>
  `;
}

function rememberSelectedDialog() {
  if (!workspaceSelectedId) return;
  sessionStorage.setItem(`${workspaceSessionPrefix}_selected_id`, workspaceSelectedId);
  sessionStorage.setItem(`${workspaceSessionPrefix}_selected_letter_key`, workspaceSelectedLetterKey || '');
}

function clearSelectedDialog() {
  workspaceSelectedId = '';
  workspaceSelectedLetterKey = '';
  sessionStorage.removeItem(`${workspaceSessionPrefix}_selected_id`);
  sessionStorage.removeItem(`${workspaceSessionPrefix}_selected_letter_key`);
}

function parseDateValue(value) {
  const raw = String(value || '').trim();
  if (!raw) return 0;
  const parsed = Date.parse(raw.replace(' ', 'T'));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatWorkspaceDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const hasTime = /\b\d{1,2}:\d{2}\b/.test(raw);
  const parsed = new Date(raw.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return raw;
  const month = parsed.toLocaleString('en-US', { month: 'long' });
  const day = String(parsed.getDate()).padStart(2, '0');
  const year = parsed.getFullYear();
  if (!hasTime) return `${month} ${day}, ${year}`;
  const hours = String(parsed.getHours()).padStart(2, '0');
  const minutes = String(parsed.getMinutes()).padStart(2, '0');
  return `${month} ${day}, ${year} ${hours}:${minutes}`;
}

function formatWorkspaceListDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const parsed = new Date(raw.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return raw.replace(/\s+\d{1,2}:\d{2}\b.*$/, '');
  const month = parsed.toLocaleString('en-US', { month: 'long' });
  const day = String(parsed.getDate()).padStart(2, '0');
  const year = parsed.getFullYear();
  return `${month} ${day}, ${year}`;
}

function formatWorkspaceMessageDate(value) {
  return formatWorkspaceDate(value);
}

function formatWorkspacePreview(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b20\d{2}-\d{2}-\d{2}(?:\s+\d{1,2}:\d{2})?\b/g, match => formatWorkspaceDate(match) || match);
}

function isWorkspaceReplyMarker(value) {
  return /\bThis is a reply to\b.{0,160}?\b(?:sent|received) on\s+(?:20\d{2}-\d{2}-\d{2}|[A-Z][a-z]+ \d{1,2}, \d{4})(?:\s+\d{1,2}:\d{2})?\.?/i
    .test(String(value || '').replace(/\s+/g, ' ').trim());
}

function isWorkspaceMediaRequestMarker(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return false;
  if (/^(?:Request Photo|Request Video|Video Inside|Photo Inside)(?:\s+20\d{2}-\d{2}-\d{2})?(?:\s+Free Boomerang)?$/i.test(text)) return true;
  return /^(?:Request Photo|Request Video|Video Inside|Photo Inside)\b/i.test(text) &&
    /\b(?:Delete Selected|Delete All|Delete All Messages|Block Selected|Are you sure you want to delete ALL messages)\b/i.test(text);
}

function usableWorkspaceSnippet(value) {
  if (isWorkspaceReplyMarker(value) || isWorkspaceMediaRequestMarker(value)) return '';
  return value;
}

function workspaceLetterTooltip(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  const match = text.match(/\bThis is a reply to\b.{0,120}?\b(?:sent|received) on\s+(?:20\d{2}-\d{2}-\d{2}|[A-Z][a-z]+ \d{1,2}, \d{4})(?:\s+\d{1,2}:\d{2})?\.?/i);
  if (match) return formatWorkspacePreview(match[0]);
  if (!usableWorkspaceSnippet(text)) return '';
  return '';
}

function groupedLetters(includeReadOnly = false) {
  const groups = new Map();

  workspaceLetters.forEach((letter, index) => {
    const id = String(letter.id || letter.profileId || '').trim();
    const groupKey = id || letter.profileLink || letter.name || `unknown-${index}`;
    const key = letter.key || `${groupKey}-${index}`;
    const normalizedLetter = {
      ...letter,
      key,
      sortDate: parseDateValue(letter.dateText)
    };

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        key: groupKey,
        id,
        name: letter.name || (id ? `Man ${id}` : 'Unknown man'),
        photoUrl: letter.photoUrl || '',
        profileLink: letter.profileLink || '',
        onlineNow: false,
        onlineCheckedAt: '',
        lastActivityText: '',
        siteFavorite: false,
        siteFavoriteUpdatedAt: '',
        unread: false,
        unreadCount: 0,
        unanswered: false,
        unansweredCount: 0,
        readByMan: false,
        readByManCount: 0,
        incomingCount: 0,
        latestDateText: '',
        latestSortDate: 0,
        letters: []
      });
    }

    const group = groups.get(groupKey);
    if (letter.name && (!group.name || group.name.startsWith('Man '))) group.name = letter.name;
    if (!group.photoUrl && letter.photoUrl) group.photoUrl = letter.photoUrl;
    if (!group.profileLink && letter.profileLink) group.profileLink = letter.profileLink;
    group.onlineNow = group.onlineNow || letter.onlineNow === true;
    if (!group.onlineCheckedAt && letter.onlineCheckedAt) group.onlineCheckedAt = letter.onlineCheckedAt;
    if (!group.lastActivityText && letter.lastActivityText) group.lastActivityText = letter.lastActivityText;
    group.siteFavorite = group.siteFavorite || letter.siteFavorite === true;
    if (!group.siteFavoriteUpdatedAt && letter.siteFavoriteUpdatedAt) group.siteFavoriteUpdatedAt = letter.siteFavoriteUpdatedAt;
    const isOutgoing = normalizedLetter.direction === 'outgoing';
    if (!isOutgoing) {
      group.incomingCount += 1;
      group.unread = group.unread || Boolean(letter.unread);
      if (letter.unread) group.unreadCount += 1;
      group.unanswered = group.unanswered || Boolean(letter.unanswered);
      if (letter.unanswered) group.unansweredCount += 1;
    } else if (letter.readByMan === true) {
      group.readByMan = true;
      group.readByManCount += 1;
    }
    group.letters.push(normalizedLetter);

    if (!isOutgoing && normalizedLetter.sortDate >= group.latestSortDate) {
      group.latestSortDate = normalizedLetter.sortDate;
      group.latestDateText = formatWorkspaceListDate(letter.dateText) || letter.snippet || 'Inbox letter';
    }
  });

  return [...groups.values()]
    .filter(group => group.incomingCount > 0 || (includeReadOnly && group.readByManCount > 0))
    .map(group => ({
      ...group,
      letters: group.letters
    }))
    .sort((a, b) => b.latestSortDate - a.latestSortDate);
}

function readLetterRows() {
  const q = searchInput.value.trim().toLowerCase();
  let rows = groupedLetters(true).flatMap(group =>
    group.letters
      .filter(isRecentReadLetter)
      .map(letter => ({
        ...group,
        readLetter: letter,
        key: `${group.key || group.id || 'man'}:${letter.key}`,
        groupKey: group.key || group.id,
        latestSortDate: letter.sortDate || 0,
        latestDateText: formatWorkspaceListDate(letter.dateText) || 'Read letter'
      }))
  );
  if (q) {
    rows = rows.filter(item =>
      String(item.name || '').toLowerCase().includes(q) ||
      String(item.id || '').toLowerCase().includes(q) ||
      String(item.readLetter?.snippet || '').toLowerCase().includes(q)
    );
  }
  return sortWorkspaceRows(rows);
}

function isRecentReadLetter(letter) {
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  return letter?.direction === 'outgoing' &&
    letter.readByMan === true &&
    Number(letter.sortDate || 0) >= dayAgo;
}

function isRecentUnansweredInboxLetter(letter) {
  const threeMonthsAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
  return letter?.direction !== 'outgoing' &&
    letter?.unanswered === true &&
    Number(letter.sortDate || 0) >= threeMonthsAgo;
}

function hasRecentUnansweredInboxLetters(letters = workspaceLetters) {
  return (letters || []).some(isRecentUnansweredInboxLetter);
}

function isNoReplyEligibleLetter(letter) {
  const sixMonthsAgo = Date.now() - 183 * 24 * 60 * 60 * 1000;
  const sortDate = Number(letter?.sortDate || 0);
  return letter?.direction !== 'outgoing' &&
    letter?.unanswered === true &&
    sortDate > 0 &&
    sortDate >= sixMonthsAgo;
}

function sortWorkspaceRows(rows) {
  return [...rows].sort((a, b) => {
    if (workspaceOnlyOnline) {
      const onlineDiff = Number(b.onlineNow === true) - Number(a.onlineNow === true);
      if (onlineDiff) return onlineDiff;
    }
    return Number(b.latestSortDate || 0) - Number(a.latestSortDate || 0);
  });
}

function filteredGroups() {
  const q = searchInput.value.trim().toLowerCase();
  let groups = groupedLetters();
  if (workspaceOnlyOnline) groups = groups.filter(item => item.onlineNow === true);
  if (q) {
    groups = groups.filter(item =>
    String(item.name || '').toLowerCase().includes(q) ||
    String(item.id || '').toLowerCase().includes(q)
    );
  }
  return sortWorkspaceRows(groups);
}

function noReplyLetterRows() {
  const q = searchInput.value.trim().toLowerCase();
  let rows = groupedLetters().flatMap(group =>
    group.letters
      .filter(isNoReplyEligibleLetter)
      .map(letter => ({
        ...group,
        noReplyLetter: letter,
        key: `${group.key || group.id || 'man'}:${letter.key}`,
        groupKey: group.key || group.id,
        latestSortDate: letter.sortDate || 0,
        latestDateText: formatWorkspaceListDate(letter.dateText) || 'No reply letter',
        unanswered: true
      }))
  );
  if (q) {
    rows = rows.filter(item =>
      String(item.name || '').toLowerCase().includes(q) ||
      String(item.id || '').toLowerCase().includes(q) ||
      String(item.noReplyLetter?.snippet || '').toLowerCase().includes(q)
    );
  }
  return sortWorkspaceRows(rows);
}

function renderList() {
  if (!isWorkspaceLadyConnected()) {
    renderDisconnectedWorkspace();
    return;
  }
  const listLoadingActive = workspaceListLoadingFilter === workspaceListFilter ||
    (workspaceInboxListLoading && workspaceListFilter === 'inbox');
  if (inboxLoading) inboxLoading.hidden = !listLoadingActive;

  const readRows = readLetterRows();
  const noReplyRows = noReplyLetterRows();
  const groups = workspaceListFilter === 'read'
    ? readRows
    : (workspaceListFilter === 'noreply' ? noReplyRows : filteredGroups());
  hint.textContent = '';
  const allGroups = groupedLetters();
  const readGroups = groupedLetters(true);
  const inboxUnansweredCount = allGroups.reduce((total, group) =>
    total + group.letters.filter(isRecentUnansweredInboxLetter).length, 0);
  const noReplyCount = allGroups.reduce((total, group) =>
    total + group.letters.filter(isNoReplyEligibleLetter).length, 0);
  const readCount = readGroups.reduce((total, group) =>
    total + group.letters.filter(letter =>
      letter.direction === 'outgoing' &&
      letter.readByMan === true &&
      Number(letter.sortDate || 0) >= Date.now() - 24 * 60 * 60 * 1000
    ).length, 0);
  if (!['inbox', 'read', 'noreply'].includes(workspaceListFilter)) workspaceListFilter = 'inbox';
  if (inboxFilterBtn) {
    inboxFilterBtn.disabled = false;
    inboxFilterBtn.classList.toggle('active', workspaceListFilter === 'inbox');
    inboxFilterBtn.classList.toggle('loading', listLoadingActive && workspaceListFilter === 'inbox');
    const backgroundDots = workspaceInboxBackgroundScanning
      ? '<span class="workspace-inbox-bg-dots" aria-label="Background scan"><i></i><i></i><i></i></span>'
      : '';
    inboxFilterBtn.innerHTML = `Inbox <span class="workspace-filter-count-text">+${escapeHtml(inboxUnansweredCount)}</span>${backgroundDots}`;
  }
  if (readFilterBtn) {
    readFilterBtn.disabled = false;
    readFilterBtn.classList.toggle('active', workspaceListFilter === 'read');
    readFilterBtn.classList.toggle('loading', listLoadingActive && workspaceListFilter === 'read');
    readFilterBtn.innerHTML = `Read <span class="workspace-filter-count-text">${escapeHtml(readCount)}</span>`;
  }
  if (copyReadIdsBtn) {
    const readIds = uniqueReadRowIds(readRows);
    copyReadIdsBtn.classList.toggle('hidden', workspaceListFilter !== 'read');
    copyReadIdsBtn.disabled = workspaceListFilter !== 'read' || readIds.length === 0;
    copyReadIdsBtn.title = readIds.length ? `Copy ${readIds.length} Read IDs` : 'Copy Read IDs';
    copyReadIdsBtn.setAttribute('aria-label', copyReadIdsBtn.title);
  }
  if (noReplyFilterBtn) {
    noReplyFilterBtn.disabled = false;
    noReplyFilterBtn.classList.toggle('active', workspaceListFilter === 'noreply');
    noReplyFilterBtn.classList.toggle('loading', listLoadingActive && workspaceListFilter === 'noreply');
    noReplyFilterBtn.innerHTML = `No Reply <span class="workspace-filter-count-text">+${escapeHtml(noReplyCount)}</span>`;
  }
  if (onlyOnlineBtn) {
    onlyOnlineBtn.classList.toggle('active', workspaceOnlyOnline);
    onlyOnlineBtn.setAttribute('aria-pressed', workspaceOnlyOnline ? 'true' : 'false');
  }
  if (topOnlineBtn) {
    topOnlineBtn.classList.toggle('active', workspaceOnlyOnline);
    topOnlineBtn.setAttribute('aria-pressed', workspaceOnlyOnline ? 'true' : 'false');
  }

  if (!groups.length) {
    const emptyText = workspaceListFilter === 'read'
      ? 'No Read Letters'
      : (workspaceListFilter === 'noreply'
        ? 'No Reply Letters'
        : 'No Letters Found');
    menList.innerHTML = `<div class="workspace-muted-state">${escapeHtml(emptyText)}</div>`;
    renderWorkspacePager(0);
    restoreMenListScroll();
    return;
  }

  const { page } = clampWorkspacePage(groups.length);
  const pagedGroups = groups.slice((page - 1) * WORKSPACE_LIST_PAGE_SIZE, page * WORKSPACE_LIST_PAGE_SIZE);
  const selectedGroupForPage = workspaceSelectedId
    ? groups.find(item => {
        const groupKey = item.groupKey || item.key || item.id;
        const letterKey = item.readLetter?.key || item.noReplyLetter?.key || '';
        const isLetterRow = workspaceListFilter === 'read' || workspaceListFilter === 'noreply';
        return isLetterRow
          ? String(groupKey) === String(workspaceSelectedId) && String(letterKey) === String(workspaceSelectedLetterKey)
          : String(item.key || item.id) === String(workspaceSelectedId);
      })
    : null;
  const selectedVisible = selectedGroupForPage
    ? pagedGroups.some(item => String(item.key || item.id) === String(selectedGroupForPage.key || selectedGroupForPage.id))
    : true;
  const visibleGroups = selectedGroupForPage && !selectedVisible
    ? [selectedGroupForPage, ...pagedGroups.slice(0, Math.max(0, WORKSPACE_LIST_PAGE_SIZE - 1))]
    : pagedGroups;
  renderWorkspacePager(groups.length);

  menList.innerHTML = visibleGroups.map(item => {
    const name = item.name || `Man ${item.id}`;
    const first = name.slice(0, 1).toUpperCase() || '?';
    const letterKey = item.readLetter?.key || item.noReplyLetter?.key || '';
    const groupKey = item.groupKey || item.key || item.id;
    const isLetterRow = workspaceListFilter === 'read' || workspaceListFilter === 'noreply';
    const active = isLetterRow
      ? String(groupKey) === String(workspaceSelectedId) && String(letterKey) === String(workspaceSelectedLetterKey)
      : String(item.key || item.id) === String(workspaceSelectedId);
    const noReplyBadgeCount = item.noReplyLetter ? 1 : Number(item.unansweredCount || 0);
    const noReplyBadge = item.unanswered && noReplyBadgeCount > 0
      ? `<span class="workspace-no-reply-badge">+ ${escapeHtml(noReplyBadgeCount)} new</span>`
      : '';
    const unreadBadgeCount = item.noReplyLetter?.unread || item.readLetter?.unread ? 1 : Number(item.unreadCount || 0);
    const unreadBadge = item.unread && unreadBadgeCount > 0
      ? `<span class="workspace-unread-badge">Unread ${escapeHtml(unreadBadgeCount)}</span>`
      : '';
    const syncState = [item.id, groupKey]
      .map(value => String(value || ''))
      .some(value => value && (workspaceDialogSyncStates.has(value) || workspaceRowSyncIds.has(value)));
    const photo = item.photoUrl
      ? `<img src="${escapeAttr(item.photoUrl)}" alt="${escapeAttr(name)}" loading="lazy" decoding="async">`
      : escapeHtml(first);
    return `
      <div class="workspace-man ${isLetterRow ? 'read-row' : ''} ${workspaceListFilter === 'noreply' ? 'no-reply-row' : ''} ${active ? 'active' : ''} ${syncState ? 'syncing' : ''} ${item.unread ? 'unread' : ''} ${item.unanswered ? 'unanswered' : ''}" role="button" tabindex="0" data-id="${escapeAttr(groupKey)}" ${letterKey ? `data-letter-key="${escapeAttr(letterKey)}"` : ''}>
        <span class="workspace-avatar">${photo}</span>
        <span class="workspace-man-info">
          <span class="workspace-man-name">${escapeHtml(name)}</span>
          <span class="workspace-man-meta">ID: <button class="workspace-copy-id" type="button" data-copy-id="${escapeAttr(item.id || '')}" title="Copy ID">${escapeHtml(item.id || '')}</button>${syncState ? '<span class="workspace-row-sync-state" aria-label="Loading"><span></span><span></span><span></span></span>' : ''}</span>
        </span>
        ${item.onlineNow ? '<span class="workspace-online-pill"><span></span>Online</span>' : '<span class="workspace-online-slot" aria-hidden="true"></span>'}
        <button class="workspace-favorite-star ${item.siteFavorite ? 'active' : ''} ${workspaceFavoriteLoadingIds.has(String(item.id || '')) ? 'loading' : ''}" type="button" data-favorite-id="${escapeAttr(item.id || '')}" title="${item.siteFavorite ? 'Remove from Favorite' : 'Add to Favorite'}" aria-label="${item.siteFavorite ? 'Remove from Favorite' : 'Add to Favorite'}" ${workspaceFavoriteLoadingIds.has(String(item.id || '')) ? 'disabled' : ''}>${item.siteFavorite ? '★' : '☆'}</button>
        <span class="workspace-man-date-stack">
          ${unreadBadge}
          ${noReplyBadge || '<span class="workspace-no-reply-slot" aria-hidden="true"></span>'}
          <span class="workspace-man-date-inline">${escapeHtml(item.latestDateText || 'Inbox letter')}</span>
        </span>
      </div>
    `;
  }).join('');
  restoreMenListScroll();
}

async function copyTextToClipboard(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return true;
  }
  const input = document.createElement('textarea');
  input.value = value;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.left = '-9999px';
  document.body.appendChild(input);
  input.select();
  const ok = document.execCommand('copy');
  input.remove();
  return ok;
}

async function copyWorkspaceManId(button) {
  const id = button?.dataset?.copyId || '';
  if (!id) return;
  const original = button.textContent;
  try {
    await copyTextToClipboard(id);
    button.classList.add('copied');
    button.textContent = 'COPIED';
    setTimeout(() => {
      button.classList.remove('copied');
      button.textContent = original;
    }, 900);
  } catch (error) {
    console.warn('Could not copy man ID:', error);
  }
}

function animateWorkspaceButton(button, className = 'pressed', duration = 520) {
  if (!button) return;
  button.classList.remove(className);
  void button.offsetWidth;
  button.classList.add(className);
  setTimeout(() => button.classList.remove(className), duration);
}

function translationKey(letterKey, index) {
  return `${String(letterKey || '')}:${Number(index) || 0}`;
}

function renderTranslatorState(message = '') {
  if (translatorProvider) translatorProvider.value = workspaceTranslatorSettings.provider || 'deepl';
  if (translatorTarget) translatorTarget.value = workspaceTranslatorSettings.targetLang || 'RU';
  if (translatorState) {
    translatorState.textContent = message ||
      (workspaceTranslatorSettings.hasApiKey
        ? `${workspaceTranslatorSettings.provider === 'google' ? 'Google' : 'DeepL'} key saved`
        : 'No API key saved');
  }
}

async function loadTranslatorSettings() {
  try {
    const result = await apiFetch('/api/translator/settings');
    workspaceTranslatorSettings = {
      ...workspaceTranslatorSettings,
      ...(result.settings || {})
    };
    renderTranslatorState();
  } catch (error) {
    console.warn('Could not load translator settings', error);
  }
}

function openTranslatorSettings() {
  alert('Translator API key is configured in Settings.');
  return;
  renderTranslatorState();
  if (translatorApiKey) translatorApiKey.value = '';
  translatorModal?.classList.remove('hidden');
  translatorModal?.setAttribute('aria-hidden', 'false');
  translatorApiKey?.focus();
}

function closeTranslatorSettings() {
  translatorModal?.classList.add('hidden');
  translatorModal?.setAttribute('aria-hidden', 'true');
}

async function saveTranslatorSettings(options = {}) {
  const button = options.button || translatorSave;
  const oldText = button?.textContent || '';
  if (button) {
    button.disabled = true;
    button.textContent = 'Saving';
  }
  try {
    const result = await apiFetch('/api/translator/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: translatorProvider?.value || 'deepl',
        targetLang: translatorTarget?.value || 'RU',
        apiKey: translatorApiKey?.value || ''
      })
    });
    workspaceTranslatorSettings = {
      ...workspaceTranslatorSettings,
      ...(result.settings || {})
    };
    if (translatorApiKey) translatorApiKey.value = '';
    renderTranslatorState('Translator saved');
    return true;
  } catch (error) {
    renderTranslatorState(error.message || 'Could not save translator');
    return false;
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = oldText || 'Save';
    }
  }
}

async function requestTranslation(text, targetLang = workspaceTranslatorSettings.targetLang || 'RU') {
  const result = await apiFetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      targetLang,
      provider: workspaceTranslatorSettings.provider || 'deepl'
    })
  });
  return String(result.translatedText || '').trim();
}

async function testTranslatorSettings() {
  const oldText = translatorTest?.textContent || '';
  if (translatorTest) {
    translatorTest.disabled = true;
    translatorTest.textContent = 'Testing';
  }
  try {
    const saved = await saveTranslatorSettings({ button: translatorTest });
    if (!saved) return;
    const translated = await requestTranslation('Hello, how are you?', translatorTarget?.value || 'RU');
    renderTranslatorState(translated ? `Test: ${translated}` : 'Translator returned empty text');
  } catch (error) {
    renderTranslatorState(error.message || 'Translator test failed');
  } finally {
    if (translatorTest) {
      translatorTest.disabled = false;
      translatorTest.textContent = oldText || 'Test';
    }
  }
}

async function translateMessage(button) {
  const group = findGroup(workspaceSelectedId);
  const letter = selectedLetterFromGroup(group);
  const index = Number(button?.dataset?.messageIndex || 0);
  const message = Array.isArray(letter?.conversation) ? letter.conversation[index] : null;
  const text = String(message?.text || letterText(letter) || '').trim();
  if (!text) return;

  if (!workspaceTranslatorSettings.hasApiKey) {
    openTranslatorSettings();
    renderTranslatorState('Add API key first');
    return;
  }

  const key = translationKey(letter?.key || workspaceSelectedLetterKey, index);
  if (workspaceTranslationLoading.has(key)) return;
  if (workspaceTranslationResults.has(key)) {
    workspaceTranslationResults.delete(key);
    renderDialog(group);
    return;
  }

  workspaceTranslationLoading.add(key);
  renderDialog(group);
  try {
    const translated = await requestTranslation(text);
    workspaceTranslationResults.set(key, translated);
  } catch (error) {
    workspaceTranslationResults.set(key, `Could not translate: ${error.message || 'Translator error'}`);
  } finally {
    workspaceTranslationLoading.delete(key);
    renderDialog(group);
  }
}

function uniqueReadRowIds(rows = readLetterRows()) {
  const seen = new Set();
  const ids = [];
  for (const row of rows) {
    const id = String(row?.id || '').trim();
    if (!/^\d{4,}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

async function copyReadIds(button = copyReadIdsBtn) {
  if (workspaceListFilter !== 'read') return;
  const ids = uniqueReadRowIds();
  if (!ids.length) return;
  const originalTitle = button?.title || 'Copy Read IDs';
  try {
    await copyTextToClipboard(ids.join('\n'));
    if (button) {
      clearTimeout(copyReadIdsResetTimer);
      animateWorkspaceButton(button, 'copied', 900);
      button.title = `Copied ${ids.length} IDs`;
      button.setAttribute('aria-label', button.title);
      copyReadIdsResetTimer = setTimeout(() => {
        button.classList.remove('copied');
        button.title = originalTitle;
        button.setAttribute('aria-label', originalTitle);
      }, 900);
    }
  } catch (error) {
    console.warn('Could not copy Read IDs:', error);
  }
}

function renderEmpty() {
  clearHeaderDialog();
  dialog.innerHTML = `
    <div class="workspace-empty-layout">
      <div class="workspace-empty-main">
        <div class="workspace-empty">
          <span class="workspace-empty-icon" aria-hidden="true">📩</span>
          <h1>Choose any letter</h1>
          <p>START YOUR DIALOG USING THE LEFT PANEL</p>
        </div>
      </div>
      <aside class="workspace-empty-side" aria-hidden="true"></aside>
    </div>
  `;
  composer?.classList.remove('hidden');
  reply.disabled = true;
  photoBtn.disabled = true;
  videoBtn.disabled = true;
  sendBtn.disabled = true;
  reply.value = '';
  reply.placeholder = 'Enter your message';
  clearPendingReplyAttachments();
}

function renderDisconnectedWorkspace() {
  workspaceLetters = [];
  workspaceSelectedId = '';
  workspaceSelectedLetterKey = '';
  workspaceInboxListLoading = false;
  workspaceListLoadingFilter = '';
  updateWorkspaceConnectionToggle(false);
  renderProfileSummary();
  if (hint) hint.textContent = '';
  if (inboxLoading) inboxLoading.hidden = true;
  if (inboxFilterBtn) {
    inboxFilterBtn.disabled = true;
    inboxFilterBtn.classList.add('active');
    inboxFilterBtn.classList.remove('loading');
    inboxFilterBtn.innerHTML = 'Inbox <span>0</span>';
  }
  if (readFilterBtn) {
    readFilterBtn.disabled = true;
    readFilterBtn.classList.remove('active', 'loading');
    readFilterBtn.innerHTML = 'Read <span>0</span>';
  }
  if (noReplyFilterBtn) {
    noReplyFilterBtn.disabled = true;
    noReplyFilterBtn.classList.remove('active', 'loading');
    noReplyFilterBtn.innerHTML = 'No Reply <span>0</span>';
  }
  if (menList) menList.innerHTML = '';
  clearHeaderDialog();
  headerTitle?.classList.add('hidden');
  if (dialog) dialog.innerHTML = '';
  composer?.classList.add('hidden');
  if (reply) {
    reply.disabled = true;
    reply.value = '';
    reply.placeholder = 'Enter your message';
  }
  if (photoBtn) photoBtn.disabled = true;
  if (videoBtn) videoBtn.disabled = true;
  if (sendBtn) sendBtn.disabled = true;
  clearPendingReplyAttachments();
}

function renderLoading() {
  clearHeaderDialog();
  headerTitle?.classList.add('hidden');
  dialog.innerHTML = `
    <div class="workspace-empty-layout">
      <div class="workspace-empty-main">
        <div class="workspace-loading-state" aria-live="polite">
          <span class="workspace-spinner"></span>
          <strong>Loading Inbox</strong>
          <span>Preparing your workspace...</span>
        </div>
      </div>
      <aside class="workspace-empty-side" aria-hidden="true"></aside>
    </div>
  `;
  composer?.classList.add('hidden');
  reply.disabled = true;
  sendBtn.disabled = true;
}

function renderLetterPreviewUnused(item) {
  if (!item) {
    renderEmpty();
    return;
  }

  const name = item.name || `Man ${item.id}`;
  dialog.innerHTML = `
    <div class="workspace-conversation">
      <h1>${escapeHtml(name)}</h1>
      <div class="workspace-conversation-meta">ID ${escapeHtml(item.id)} · ${escapeHtml(item.dateText || 'Inbox')}</div>
      <div class="workspace-message-placeholder">
        <strong>Inbox letter</strong>
        <p>${escapeHtml(item.snippet || 'The message text will appear here after we connect reading the selected letter.')}</p>
      </div>
    </div>
  `;
  reply.disabled = false;
  sendBtn.disabled = false;
}

function renderWorkspaceSidePanel(letterCards = '') {
  return `
    <aside class="workspace-account-panel letters-only" aria-label="Letters">
      <section class="workspace-right-letters">
        ${letterCards || '<div class="workspace-muted-state compact">No Letters</div>'}
      </section>
    </aside>
  `;
}

function renderWorkspaceLetterPager(totalItems = 0, currentPage = workspaceLetterPage, options = {}) {
  const minPages = Math.max(1, Number(options.minPages || WORKSPACE_MIN_LETTER_PAGES) || 1);
  const forcedPages = Math.max(0, Number(options.totalPages || 0) || 0);
  const totalPages = Math.max(
    minPages,
    forcedPages,
    Math.ceil(Math.max(0, totalItems) / WORKSPACE_LETTER_PAGE_SIZE)
  );
  workspaceLetterPage = Math.min(totalPages, Math.max(1, Number(currentPage) || 1));

  const page = workspaceLetterPage;
  const windowSize = Math.max(1, Number(options.windowSize || WORKSPACE_LETTER_PAGE_WINDOW) || WORKSPACE_LETTER_PAGE_WINDOW);
  const windowStart = Math.floor((page - 1) / windowSize) * windowSize + 1;
  const windowEnd = Math.min(totalPages, windowStart + windowSize - 1);
  const pages = [];
  for (let i = windowStart; i <= windowEnd; i += 1) pages.push(i);

  const buttons = [];
  if (windowStart > 1) buttons.push('<span class="workspace-letter-page-gap">...</span>');
  for (const item of pages) {
    const pageKey = `${workspaceSelectedId || ''}:${item}`;
    const isPageLoading = workspaceLetterPageLoading.has(pageKey);
    buttons.push(`<button class="${item === page ? 'active' : ''} ${isPageLoading ? 'loading' : ''}" type="button" data-letter-page="${item}" title="Show page ${item}${isPageLoading ? ' - loading from Dream' : ''}" ${isPageLoading ? 'aria-busy="true"' : ''}>${item}</button>`);
  }
  if (windowEnd < totalPages) buttons.push('<span class="workspace-letter-page-gap">...</span>');

  return `
    <div class="workspace-letter-pager" aria-label="Letter pages">
      <button type="button" data-letter-page="${Math.max(1, windowStart - windowSize)}" title="Previous pages" ${windowStart <= 1 ? 'disabled' : ''}>&lsaquo;</button>
      ${buttons.join('')}
      <button type="button" data-letter-page="${Math.min(totalPages, windowEnd + 1)}" title="Next pages" ${windowEnd >= totalPages ? 'disabled' : ''}>&rsaquo;</button>
    </div>
  `;
}

function selectLetter(id) {
  selectLetterGroup(id);
}

function findGroup(id) {
  return groupedLetters(workspaceListFilter === 'read').find(item => String(item.key || item.id) === String(id));
}

function workspaceLetterPageLimitKey(id = workspaceSelectedId) {
  return `${activeProfileId || 'default'}:${String(id || '').trim()}:letters`;
}

function workspaceLetterVisibleLimit(id = workspaceSelectedId) {
  const key = workspaceLetterPageLimitKey(id);
  return Math.max(WORKSPACE_MIN_LETTER_PAGES, Number(workspaceLetterVisiblePages.get(key) || 0) || WORKSPACE_MIN_LETTER_PAGES);
}

function setWorkspaceLetterVisibleLimit(id, limit) {
  const key = workspaceLetterPageLimitKey(id);
  workspaceLetterVisiblePages.set(key, Math.max(WORKSPACE_MIN_LETTER_PAGES, Number(limit) || WORKSPACE_MIN_LETTER_PAGES));
}

function workspaceLetterKnownEnd(id = workspaceSelectedId) {
  const key = workspaceLetterPageLimitKey(id);
  return Math.max(0, Number(workspaceLetterKnownEndPages.get(key) || 0) || 0);
}

function setWorkspaceLetterKnownEnd(id, lastPage) {
  const key = workspaceLetterPageLimitKey(id);
  workspaceLetterKnownEndPages.set(key, Math.max(1, Number(lastPage) || 1));
}

function clearWorkspaceLetterKnownEnd(id) {
  const key = workspaceLetterPageLimitKey(id);
  workspaceLetterKnownEndPages.delete(key);
}

function revealWorkspaceDreamLetterPages(id, currentPage, lastPage = 0) {
  const idText = String(id || workspaceSelectedId || '').trim();
  if (!idText) return;
  const page = Math.max(1, Number(currentPage || 1) || 1);
  const dreamLastPage = Math.max(0, Number(lastPage || 0) || 0);
  const currentLimit = workspaceLetterVisibleLimit(idText);
  const nextWindowLimit = page + WORKSPACE_MIN_LETTER_PAGES;
  const visibleLimit = dreamLastPage
    ? Math.min(dreamLastPage, Math.max(currentLimit, nextWindowLimit))
    : Math.max(currentLimit, nextWindowLimit);
  setWorkspaceLetterVisibleLimit(idText, visibleLimit);
  if (dreamLastPage > 1) setWorkspaceLetterKnownEnd(idText, dreamLastPage);
}

function maybeExpandWorkspaceLetterPages(id, pageNumber) {
  const idText = String(id || workspaceSelectedId || '').trim();
  if (!idText) return;
  const page = Math.max(1, Number(pageNumber) || 1);
  const currentLimit = workspaceLetterVisibleLimit(idText);
  if (page < currentLimit) return;
  const lettersOnPage = workspaceLetters.filter(letter =>
    String(letter?.id || letter?.profileId || '').trim() === idText &&
    Math.max(1, Number(letter?.dreamListPage || 1) || 1) === page
  ).length;
  if (lettersOnPage >= WORKSPACE_DREAM_PAGE_SIZE) {
    setWorkspaceLetterVisibleLimit(idText, currentLimit + WORKSPACE_MIN_LETTER_PAGES);
  }
}

function updateLetterInMemory(updatedLetter) {
  const key = String(updatedLetter?.key || '');
  if (!key) return;
  workspaceLetters = workspaceLetters.map(letter =>
    String(letter.key || '') === key ? { ...letter, ...updatedLetter } : letter
  );
}

function markGroupSeenInMemory(group) {
  if (!group?.unreadCount) return [];
  const keys = group.letters
    .filter(letter => letter.direction !== 'outgoing' && letter.unread === true)
    .map(letter => String(letter.key || '').trim())
    .filter(Boolean);
  if (!keys.length) return [];

  const seenKeys = new Set(keys);
  workspaceLetters = workspaceLetters.map(letter =>
    seenKeys.has(String(letter.key || '').trim()) ? { ...letter, unread: false } : letter
  );
  return keys;
}

async function persistGroupSeen(group, keys) {
  if (!activeProfileId || !group || !keys?.length) return;
  try {
    const saved = await apiFetch('/api/workspace/seen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceProfileId: activeProfileId,
        ids: group.id ? [group.id] : [],
        keys
      })
    });
    if (Array.isArray(saved.letters)) workspaceLetters = saved.letters;
    renderCurrentWorkspaceState();
  } catch (error) {
    console.warn('Could not mark workspace letters as seen', error);
  }
}

function selectedLetterFromGroup(group) {
  if (!group) return null;
  if (!workspaceSelectedLetterKey) return null;
  return group.letters.find(item => item?.listAnchor !== true && String(item.key) === String(workspaceSelectedLetterKey)) || null;
}

function workspaceLetterRestoreFingerprint(letter) {
  if (!letter) return null;
  return {
    key: String(letter.key || ''),
    id: String(letter.id || ''),
    direction: String(letter.direction || ''),
    dateText: String(letter.dateText || ''),
    messageLink: String(letter.messageLink || ''),
    snippet: String(letter.snippet || '').replace(/\s+/g, ' ').trim().slice(0, 120),
    bodyText: String(letterText(letter) || '').replace(/\s+/g, ' ').trim().slice(0, 120)
  };
}

function restoreWorkspaceSelectedLetterFromFingerprint(group, fingerprint) {
  if (!group || !fingerprint || !Array.isArray(group.letters)) return false;
  const exact = group.letters.find(letter => String(letter.key || '') === fingerprint.key);
  const byLink = !exact && fingerprint.messageLink
    ? group.letters.find(letter => String(letter.messageLink || '') === fingerprint.messageLink)
    : null;
  const byIdDate = !exact && !byLink && fingerprint.id && fingerprint.dateText
    ? group.letters.find(letter =>
        String(letter.id || '') === fingerprint.id &&
        String(letter.direction || '') === fingerprint.direction &&
        String(letter.dateText || '') === fingerprint.dateText
      )
    : null;
  const byText = !exact && !byLink && !byIdDate && (fingerprint.snippet || fingerprint.bodyText)
    ? group.letters.find(letter =>
        String(letter.direction || '') === fingerprint.direction &&
        String(letter.dateText || '') === fingerprint.dateText &&
        (
          (fingerprint.snippet && String(letter.snippet || '').replace(/\s+/g, ' ').trim().startsWith(fingerprint.snippet.slice(0, 60))) ||
          (fingerprint.bodyText && String(letterText(letter) || '').replace(/\s+/g, ' ').trim().startsWith(fingerprint.bodyText.slice(0, 60)))
        )
      )
    : null;
  const restored = exact || byLink || byIdDate || byText || null;
  if (!restored?.key) return false;
  workspaceSelectedLetterKey = String(restored.key);
  rememberSelectedDialog();
  return true;
}

function canReplyToLetter(letter) {
  return Boolean(letter && letter.direction !== 'outgoing' && letter.messageLink && !letter.readError);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function clearPendingReplyAttachments() {
  workspacePendingReplyAttachments = [];
  renderPendingReplyAttachments();
}

function resizeReplyBox() {
  if (!reply) return;
  const hasText = reply.value.length > 0;
  reply.classList.toggle('has-text', hasText);
  if (replyCounter) {
    replyCounter.textContent = String(reply.value.length);
    replyCounter.classList.toggle('visible', hasText);
  }
  const minHeight = 44;
  const maxHeight = Math.min(180, Math.max(118, Math.floor(window.innerHeight * 0.24)));
  reply.style.setProperty('height', 'auto', 'important');
  reply.style.setProperty('overflow-y', 'hidden', 'important');
  const contentHeight = Math.ceil(reply.scrollHeight);
  const nextHeight = Math.min(maxHeight, Math.max(minHeight, contentHeight));
  reply.style.setProperty('height', `${nextHeight}px`, 'important');
  reply.style.setProperty('overflow-y', contentHeight > maxHeight ? 'auto' : 'hidden', 'important');
  reply.parentElement?.style.setProperty('height', `${nextHeight}px`, 'important');
  updateReplyTranslateControls();
}

function updateReplyTranslateControls() {
  const hasText = Boolean(reply?.value.trim());
  const canUse = Boolean(reply && !reply.disabled && hasText && !workspaceReplyTranslating);
  if (replyTranslateBtn) {
    replyTranslateBtn.disabled = !canUse;
    replyTranslateBtn.classList.toggle('loading', workspaceReplyTranslating);
  }
}

async function translateReplyText() {
  const text = String(reply?.value || '').trim();
  if (!text || workspaceReplyTranslating) return;
  if (!workspaceTranslatorSettings.hasApiKey) {
    openTranslatorSettings();
    renderTranslatorState('Add API key first');
    return;
  }
  workspaceReplyTranslating = true;
  updateReplyTranslateControls();
  try {
    const target = workspaceTranslatorSettings.replyTargetLang || 'EN';
    const translated = await requestTranslation(text, target);
    if (translated) {
      reply.value = translated;
      reply.dispatchEvent(new Event('input', { bubbles: true }));
    }
  } catch (error) {
    alert(error.message || 'Could not translate reply');
  } finally {
    workspaceReplyTranslating = false;
    updateReplyTranslateControls();
    resizeReplyBox();
  }
}

function clearReplyTranslationState() {
  workspaceReplyTranslating = false;
  updateReplyTranslateControls();
}

function renderPendingReplyAttachments() {
  if (!attachmentQueue) return;
  if (!workspacePendingReplyAttachments.length) {
    attachmentQueue.classList.add('hidden');
    attachmentQueue.innerHTML = '';
    return;
  }
  attachmentQueue.classList.remove('hidden');
  attachmentQueue.innerHTML = workspacePendingReplyAttachments.map((item, index) => {
    const isVideo = item.kind === 'video' || String(item.type || '').startsWith('video/');
    const kind = isVideo ? 'Video' : 'Photo';
    const previewUrl = String(item.thumbUrl || item.url || item.originalThumbUrl || '').trim();
    const previewIsVideo = isVideo && /\.(?:mp4|webm|mov|m4v)(?:[?#]|$)/i.test(previewUrl);
    const preview = previewUrl
      ? `<span class="workspace-reply-attachment-preview">${previewIsVideo ? `<video src="${escapeAttr(previewUrl)}" muted playsinline preload="metadata"></video>` : `<img src="${escapeAttr(previewUrl)}" alt="">`}</span>`
      : '';
    return `
      <span class="workspace-reply-attachment-chip">
        <span>${escapeHtml(kind)}</span>
        ${preview}
        <button type="button" data-remove-attachment="${index}" title="Remove attachment">×</button>
      </span>
    `;
  }).join('');
}

function workspaceMediaGalleryId(item = {}) {
  const values = [
    item.galleryId,
    item.id,
    item.url,
    item.thumbUrl,
    item.originalThumbUrl,
    item.label
  ];
  for (const value of values) {
    const text = String(value || '');
    const tagged = text.match(/\b(?:galleryId|gallery_id|mediaId|media_id|photoId|photo_id|videoId|video_id|data-id|id)[=:/"'\s-]+(\d{2,})\b/i);
    if (tagged?.[1]) return tagged[1];
    const plain = text.match(/\b(\d{2,})\b/);
    if (plain?.[1]) return plain[1];
  }
  return '';
}

function normalizeWorkspaceReplyMedia(item = {}) {
  const isVideo = item.kind === 'video' || item.mediaType === 'video' || /^video\//i.test(String(item.type || ''));
  const galleryId = workspaceMediaGalleryId(item);
  return {
    ...item,
    source: 'dream-gallery',
    gallerySource: item.gallerySource || item.source || '',
    kind: isVideo ? 'video' : 'photo',
    mediaType: isVideo ? 'video' : 'photo',
    galleryId,
    id: `${isVideo ? 'video' : 'photo'}:${galleryId || item.id || item.url || item.thumbUrl || Date.now()}`
  };
}

async function chooseReplyAttachments() {
  await openMediaPicker('photo');
}

function defaultWorkspaceMediaSection(kind = workspaceMediaMode) {
  return kind === 'video' ? 'others' : 'firstLetters';
}

function normalizeWorkspaceMediaSection(kind = workspaceMediaMode) {
  const baseSections = WORKSPACE_MEDIA_SECTIONS[kind] || WORKSPACE_MEDIA_SECTIONS.photo;
  const folderSections = workspaceMediaCache
    .filter(item => item.kind === kind && String(item.section || '').startsWith('others:'))
    .map(item => String(item.section || '').trim());
  if (!baseSections.some(section => section.id === workspaceMediaSection) && !folderSections.includes(workspaceMediaSection)) {
    workspaceMediaSection = defaultWorkspaceMediaSection(kind);
  }
}

function mediaSectionMatches(item, sectionId) {
  const section = String(item?.section || '').trim();
  if (!sectionId) return true;
  if (sectionId === 'others') return section === 'others' || section.startsWith('others:');
  return section === sectionId;
}

function filteredWorkspaceMedia() {
  normalizeWorkspaceMediaSection(workspaceMediaMode);
  return workspaceMediaCache.filter(item => item.kind === workspaceMediaMode && mediaSectionMatches(item, workspaceMediaSection));
}

function renderWorkspaceMediaSummary(stats = workspaceMediaLastStats) {
  if (!mediaSummary) return;
  const kind = workspaceMediaMode === 'video' ? 'video' : 'photo';
  const total = workspaceMediaCache.filter(item => item.kind === kind).length;
  const label = kind === 'video' ? 'videos' : 'photos';
  const rows = Array.isArray(stats) ? stats : [];
  if (!rows.length) {
    const synced = workspaceMediaSyncedAt ? ` Last refresh: ${formatWorkspaceDate(workspaceMediaSyncedAt) || 'recently'}.` : '';
    mediaSummary.innerHTML = total
      ? `<strong>Saved:</strong> ${total} ${label}.${escapeHtml(synced)}`
      : `No saved ${label}. Click ${kind === 'video' ? 'Refresh Videos' : 'Refresh Photos'}.`;
    return;
  }
  const sections = new Set(rows.filter(row => Number(row?.count || 0) > 0).map(row => String(row?.section || '').trim()).filter(Boolean));
  mediaSummary.innerHTML = `<strong>Found:</strong> ${total} ${label}${sections.size ? ` in ${sections.size} folders` : ''}.`;
}

function renderWorkspaceMediaTabs() {
  if (mediaSections) {
    const baseSections = WORKSPACE_MEDIA_SECTIONS[workspaceMediaMode] || WORKSPACE_MEDIA_SECTIONS.photo;
    const folderSections = workspaceMediaCache
      .filter(item => item.kind === workspaceMediaMode && String(item.section || '').startsWith('others:'))
      .map(item => String(item.section || '').trim())
      .filter((section, index, list) => section && list.indexOf(section) === index)
      .map(section => ({ id: section, label: section.replace(/^others:/, '') }));
    const sections = [...baseSections, ...folderSections];
    mediaSections.innerHTML = sections.map(section => `
      <button type="button" class="${workspaceMediaSection === section.id ? 'active' : ''}" data-media-section="${escapeAttr(section.id)}" role="tab" aria-selected="${workspaceMediaSection === section.id ? 'true' : 'false'}">
        ${escapeHtml(section.label)}
      </button>
    `).join('');
  }
}

function renderMediaPicker() {
  normalizeWorkspaceMediaSection(workspaceMediaMode);
  renderWorkspaceMediaTabs();
  const media = filteredWorkspaceMedia();
  const totalForKind = workspaceMediaCache.filter(item => item.kind === workspaceMediaMode).length;
  const sectionLabel = (WORKSPACE_MEDIA_SECTIONS[workspaceMediaMode] || [])
    .find(section => section.id === workspaceMediaSection)?.label ||
    String(workspaceMediaSection || '').replace(/^others:/, '');
  const totalPages = Math.max(1, Math.ceil(media.length / WORKSPACE_MEDIA_PAGE_SIZE));
  workspaceMediaPage = Math.min(Math.max(1, workspaceMediaPage), totalPages);
  const pageItems = media.slice((workspaceMediaPage - 1) * WORKSPACE_MEDIA_PAGE_SIZE, workspaceMediaPage * WORKSPACE_MEDIA_PAGE_SIZE);
  mediaTitle.textContent = workspaceMediaMode === 'video' ? 'Choose Video' : 'Choose Photo';
  mediaRefresh.textContent = workspaceMediaMode === 'video' ? 'Refresh Videos' : 'Refresh Photos';
  if (mediaRefreshInline) mediaRefreshInline.textContent = 'Refresh gallery';
  mediaCount.textContent = `${sectionLabel ? `${sectionLabel}: ` : ''}${media.length} of ${totalForKind} ${workspaceMediaMode === 'video' ? 'videos' : 'photos'} - Page ${workspaceMediaPage}/${totalPages}`;
  renderWorkspaceMediaSummary();
  const pagerStart = Math.max(1, Math.min(workspaceMediaPage - 2, Math.max(1, totalPages - 4)));
  const pagerEnd = Math.min(totalPages, pagerStart + 4);
  const pageButtons = Array.from({ length: pagerEnd - pagerStart + 1 }, (_, index) => pagerStart + index)
    .map(page => `<button type="button" class="${page === workspaceMediaPage ? 'active' : ''}" data-media-page="${page}">${page}</button>`)
    .join('');
  mediaPager.innerHTML = `
    <button type="button" class="workspace-media-page-arrow" data-media-page="${Math.max(1, workspaceMediaPage - 1)}" ${workspaceMediaPage <= 1 ? 'disabled' : ''}>←</button>
    ${pageButtons}
    <button type="button" class="workspace-media-page-arrow" data-media-page="${Math.min(totalPages, workspaceMediaPage + 1)}" ${workspaceMediaPage >= totalPages ? 'disabled' : ''}>→</button>
  `;
  mediaGrid.innerHTML = pageItems.length ? pageItems.map(item => {
    const selected = item.id === workspaceMediaSelectedId;
    const previewLabel = item.kind === 'video' ? 'Preview video' : 'Preview photo';
    const mediaSrc = String(item.kind === 'video'
      ? (item.thumbUrl || item.originalThumbUrl || item.url || item.originalUrl || item.fullUrl || '')
      : (item.url || item.originalUrl || item.fullUrl || item.thumbUrl || item.originalThumbUrl || '')
    ).trim();
    const galleryId = workspaceMediaGalleryId(item);
    const idLabel = `${item.kind === 'video' ? 'Video' : 'Photo'}${galleryId ? ` ID ${galleryId}` : ''}`;
    const thumb = mediaSrc
      ? `<img src="${escapeAttr(mediaSrc)}" alt="" loading="lazy" decoding="async">`
      : `<span>${item.kind === 'video' ? 'Video' : 'Photo'}</span>`;
    return `
      <button type="button" class="workspace-media-tile ${selected ? 'selected' : ''}" data-media-id="${escapeAttr(item.id)}" title="${escapeAttr(idLabel)}">
        <div class="workspace-media-thumb ${item.kind === 'video' ? 'video' : ''}">
          ${thumb}
          <span class="workspace-media-id">${galleryId ? `ID: ${escapeHtml(galleryId)}` : escapeHtml(item.kind === 'video' ? 'Video' : 'Photo')}</span>
          <span class="workspace-media-preview-btn" role="button" tabindex="0" data-media-preview-id="${escapeAttr(item.id)}" title="${escapeAttr(previewLabel)}" aria-label="${escapeAttr(previewLabel)}"></span>
        </div>
      </button>
    `;
  }).join('') : '<div class="workspace-media-empty">No saved items. Click Refresh gallery.</div>';
  mediaSelect.disabled = !workspaceMediaSelectedId;
}

async function loadReplyMedia(force = false) {
  if (workspaceMediaCache.length && !force) {
    renderMediaPicker();
    return;
  }

  mediaCount.textContent = 'Loading saved gallery...';
  mediaGrid.innerHTML = '<div class="workspace-media-empty">Loading...</div>';
  mediaRefresh.disabled = true;
  if (mediaRefreshInline) mediaRefreshInline.disabled = true;
  try {
    const response = await apiFetch('/api/workspace/media-gallery');
    workspaceMediaCache = response.media || [];
    workspaceMediaSyncedAt = response.syncedAt || '';
    renderMediaPicker();
  } catch (error) {
    mediaGrid.innerHTML = `<div class="workspace-media-empty">${escapeHtml(error.message || 'Could not load gallery')}</div>`;
  } finally {
    mediaRefresh.disabled = false;
    if (mediaRefreshInline) mediaRefreshInline.disabled = false;
  }
}

async function openMediaPicker(mode) {
  const group = findGroup(workspaceSelectedId);
  const letter = selectedLetterFromGroup(group);
  if (!canReplyToLetter(letter)) return;
  workspaceMediaMode = mode === 'video' ? 'video' : 'photo';
  workspaceMediaSection = defaultWorkspaceMediaSection(workspaceMediaMode);
  workspaceMediaPage = 1;
  workspaceMediaSelectedId = '';
  mediaModal.classList.remove('hidden');
  mediaModal.setAttribute('aria-hidden', 'false');
  renderMediaPicker();
  await loadReplyMedia(false);
}

async function syncWorkspaceGallery(mode = workspaceMediaMode, options = {}) {
  const group = findGroup(workspaceSelectedId);
  const letter = selectedLetterFromGroup(group) || group?.letters?.find(canReplyToLetter) || null;
  if (!canReplyToLetter(letter)) {
    alert('Select a green letter first');
    return;
  }

  const kind = mode === 'video' ? 'video' : 'photo';
  const fullRefresh = true;
  const maxGalleryPages = fullRefresh ? 100 : 5;
  const oldText = mediaRefresh.textContent;
  mediaRefresh.disabled = true;
  if (mediaRefreshInline) mediaRefreshInline.disabled = true;
  mediaRefresh.textContent = fullRefresh
    ? (kind === 'video' ? 'Full sync videos...' : 'Full sync photos...')
    : (kind === 'video' ? 'Quick sync videos...' : 'Quick sync photos...');
  if (!mediaModal.classList.contains('hidden')) {
    mediaCount.textContent = fullRefresh
      ? (kind === 'video' ? 'Full sync videos from Dream...' : 'Full sync photos from Dream...')
      : (kind === 'video' ? 'Checking newest videos...' : 'Checking newest photos...');
    if (mediaSummary) mediaSummary.textContent = 'Refresh is running. I will show counts by section and page here.';
    mediaGrid.innerHTML = `<div class="workspace-media-empty">${fullRefresh ? 'Full sync...' : 'Checking new media...'}</div>`;
  }
  try {
    const response = await apiFetch('/api/workspace/media-gallery/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceProfileId: activeProfileId,
        id: group?.id || letter.id || '',
        name: group?.name || letter.name || '',
        messageLink: letter.messageLink,
        kind,
        maxGalleryPages
      })
    });
    if (Array.isArray(response.stats)) {
      const totalFetched = (response.media || []).filter(item => item.kind === kind).length;
      console.info(`[Dream media refresh] ${kind}: ${totalFetched} unique items`, response.stats);
      workspaceMediaLastStats = response.stats;
    }
    const saved = await apiFetch('/api/workspace/media-gallery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceProfileId: activeProfileId,
        replaceKind: kind,
        merge: false,
        media: response.media || []
      })
    });
    workspaceMediaCache = saved.media || [];
    workspaceMediaSyncedAt = saved.syncedAt || '';
    workspaceMediaSection = defaultWorkspaceMediaSection(kind);
    workspaceMediaPage = 1;
    workspaceMediaSelectedId = '';
    if (!mediaModal.classList.contains('hidden')) renderMediaPicker();
  } catch (error) {
    alert(error.message || `Could not sync ${kind === 'video' ? 'videos' : 'photos'}`);
    if (!mediaModal.classList.contains('hidden')) {
      mediaGrid.innerHTML = `<div class="workspace-media-empty">${escapeHtml(error.message || `Could not sync ${kind === 'video' ? 'videos' : 'photos'}`)}</div>`;
    }
  } finally {
    mediaRefresh.disabled = false;
    if (mediaRefreshInline) mediaRefreshInline.disabled = false;
    mediaRefresh.textContent = oldText;
    if (mediaRefreshInline) mediaRefreshInline.textContent = 'Refresh gallery';
  }
}

function closeMediaPicker() {
  closeMediaPreview();
  mediaModal.classList.add('hidden');
  mediaModal.setAttribute('aria-hidden', 'true');
}

function closeMediaPreview() {
  workspaceMediaPreviewId = '';
  const preview = mediaModal.querySelector('.workspace-media-lightbox');
  if (preview) preview.remove();
}

function openMediaPreview(id) {
  const item = workspaceMediaCache.find(media => String(media.id) === String(id));
  if (!item) return;
  workspaceMediaPreviewId = String(item.id);
  const src = String(item.url || item.thumbUrl || item.originalThumbUrl || '').trim();
  if (!src) return;
  closeMediaPreview();
  const isVideo = item.kind === 'video';
  const playsAsVideo = isVideo && /\.(?:mp4|webm|mov|m4v)(?:[?#]|$)/i.test(src);
  const preview = document.createElement('div');
  preview.className = 'workspace-media-lightbox';
  preview.innerHTML = `
    <button class="workspace-media-lightbox-close" type="button" aria-label="Close preview">×</button>
    <div class="workspace-media-lightbox-frame">
      ${playsAsVideo ? `<video src="${escapeAttr(src)}" controls autoplay muted playsinline></video>` : `<img src="${escapeAttr(src)}" alt="">`}
    </div>
  `;
  mediaModal.appendChild(preview);
}

function selectPickedMedia() {
  const item = workspaceMediaCache.find(media => media.id === workspaceMediaSelectedId);
  if (!item) return;
  const attachment = normalizeWorkspaceReplyMedia(item);
  if (!attachment.galleryId) {
    alert('Could not read media gallery id. Refresh gallery and choose this item again.');
    return;
  }
  if (!workspacePendingReplyAttachments.some(media => media.id === attachment.id)) {
    workspacePendingReplyAttachments = [...workspacePendingReplyAttachments, attachment].slice(0, 6);
  }
  renderPendingReplyAttachments();
  closeMediaPicker();
}

function letterText(letter) {
  const fallbackSnippet = usableWorkspaceSnippet(letter?.snippet);
  return String(letter?.bodyText || letter?.text || fallbackSnippet || '').trim();
}

function currentLetterStrip() {
  return dialog.querySelector('.workspace-account-panel.letters-only') ||
    dialog.querySelector('.workspace-right-letters') ||
    dialog.querySelector('.workspace-letter-strip');
}

function letterStripScrollKey(id = workspaceSelectedId, filter = workspaceLettersFilter) {
  return `${workspaceSessionPrefix}_letter_scroll_${String(id || '')}_${String(filter || 'all')}`;
}

function menListScrollKey(filter = workspaceListFilter) {
  return `${workspaceSessionPrefix}_men_scroll_${String(filter || 'inbox')}`;
}

function saveLetterStripScroll() {
  const strip = currentLetterStrip();
  if (strip && workspaceSelectedId) {
    const key = letterStripScrollKey();
    workspaceLetterStripScroll.set(key, strip.scrollTop);
    sessionStorage.setItem(key, String(strip.scrollTop));
  }
}

function restoreLetterStripScroll(group) {
  const strip = currentLetterStrip();
  if (!strip || !group) return;
  const key = String(group.key || group.id || workspaceSelectedId);
  const storageKey = letterStripScrollKey(key, workspaceLettersFilter);
  const scrollTop = workspaceLetterStripScroll.get(storageKey) ?? Number(sessionStorage.getItem(storageKey) || 0);
  const restore = () => {
    const nextStrip = currentLetterStrip();
    if (nextStrip) nextStrip.scrollTop = scrollTop;
  };
  requestAnimationFrame(() => {
    restore();
    requestAnimationFrame(restore);
  });
}

function saveMenListScroll() {
  if (!menList) return;
  const key = menListScrollKey();
  sessionStorage.setItem(key, String(menList.scrollTop || 0));
}

function restoreMenListScroll(filter = workspaceListFilter) {
  if (!menList) return;
  const scrollTop = Number(sessionStorage.getItem(menListScrollKey(filter)) || 0);
  const restore = () => {
    if (menList) menList.scrollTop = scrollTop;
  };
  requestAnimationFrame(() => {
    restore();
    requestAnimationFrame(restore);
  });
}

function setWorkspaceLettersFilter(nextFilter) {
  saveLetterStripScroll();
  const requested = ['all', 'men'].includes(nextFilter) ? nextFilter : 'all';
  workspaceLettersFilter = requested === 'men' && workspaceLettersFilter === 'men' ? 'all' : requested;
  sessionStorage.setItem('dream_workspace_letters_filter', workspaceLettersFilter);
  renderDialog(findGroup(workspaceSelectedId));
}

function cleanDialogText(value, fallbackName = '') {
  const blockedExact = new Set([
    'back to inbox',
    'delete',
    'previous message',
    'next message',
    'reply',
    'block him',
    'attached image:',
    'attached image',
    'open',
    'read letter',
    'my folders',
    'move to',
    'more',
    'messages',
    'flirts',
    'notification',
    'replies',
    'inbox',
    'send',
    'save draft',
    'cancel',
    'back to messages',
    'message history',
    "don't show again",
    'your flirt has been sent',
    'having trouble?',
    'switch to advanced editor',
    'attach photo',
    'attach video',
    'select image',
    'select video'
  ]);
  const fallbackLower = String(fallbackName || '').trim().toLowerCase();
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(line => {
      if (!line) return false;
      const normalized = line.toLowerCase().replace(/\s+/g, ' ');
      if (fallbackLower && normalized === fallbackLower) return false;
      if (fallbackLower && normalized === `${fallbackLower} (id:`) return false;
      if (fallbackLower && new RegExp(`^${fallbackLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\(id\\s*:\\s*\\d+\\)$`, 'i').test(normalized)) return false;
      if (blockedExact.has(normalized)) return false;
      if (/^(inbox|replies|messages|flirts|notification(?:\s+\d+\+?)?|my folders|move to|more)$/i.test(line)) return false;
      if (/^(back to inbox|delete|previous message|next message|reply|block him)$/i.test(line)) return false;
      if (/^these men are inviting you to chat!?$/i.test(line)) return false;
      if (/^enable sound$/i.test(line)) return false;
      if (/^copyright\b/i.test(line)) return false;
      if (/^help center\b/i.test(line)) return false;
      if (/^(privacy policy|terms of use|cookie preferences)$/i.test(line)) return false;
      if (/^sending photos containing nudity is prohibited/i.test(line)) return false;
      if (/^failure to comply/i.test(line)) return false;
      if (/^replies left today:\s*\d+\s*\/\s*\d+\s*\|\s*new messages left today:\s*\d+\s*\/\s*\d+$/i.test(line)) return false;
      if (/^[A-Za-z][A-Za-z' -]{1,40}\s+ID\s*:\s*\d{4,}$/i.test(line) && (!fallbackLower || !normalized.startsWith(fallbackLower))) return false;
      if (/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s+/i.test(line) && line.length < 45) return false;
      if (/^[A-Z][a-z]+ \d{1,2}, \d{4}$/.test(line)) return false;
      if (/^\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}$/.test(line)) return false;
      return true;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isDialogUiOnlyText(text, fallbackName = '') {
  const normalized = String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized) return true;
  const uiParts = [
    'having trouble?',
    'switch to advanced editor',
    'attach photo',
    'attach video',
    'select image',
    'select video',
    'save draft',
    'message history',
    'my folders',
    'move to',
    'back to messages'
  ];
  const hits = uiParts.filter(part => normalized.includes(part)).length;
  if (hits >= 3) return true;
  const withoutUi = uiParts.reduce((acc, part) => acc.replaceAll(part, ' '), normalized)
    .replace(/\b[a-z][a-z' -]{1,40}\s+id\s*:\s*\d{4,}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const fallbackLower = String(fallbackName || '').toLowerCase().trim();
  if (fallbackLower && withoutUi === fallbackLower) return true;
  return hits >= 2 && withoutUi.length < 80;
}

function looksIncomingText(text, fallbackName) {
  const name = String(fallbackName || '').trim();
  if (!name || !text) return false;
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escapedName}(\\s|\\(|:|,|$)`, 'i').test(text) ||
    new RegExp(`\\b${escapedName}\\s*\\(ID\\s*:`, 'i').test(text);
}

function conversationFingerprint(text, fallbackName = '') {
  const escapedName = String(fallbackName || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let value = String(text || '')
    .replace(/\r/g, '\n')
    .replace(/\b20\d{2}-\d{2}-\d{2}\s+\d{1,2}:\d{2}\b/g, ' ')
    .replace(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+20\d{2}\b/gi, ' ')
    .replace(/\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+[A-Za-z]+\s+\d{1,2},\s+20\d{2}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?/gi, ' ')
    .trim();
  if (escapedName) {
    value = value.replace(new RegExp(`^${escapedName}\\s*\\(ID\\s*:?\\s*\\d+\\)\\s*`, 'i'), '');
    value = value.replace(new RegExp(`^${escapedName}\\s*\\n+`, 'i'), '');
  }
  return value
    .replace(/^[A-Za-z][A-Za-z' -]{1,50}\s*\(ID\s*:?\s*\d{4,}\)\s*/i, '')
    .replace(/^[A-Za-z][A-Za-z' -]{1,50}\s*\n+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 900);
}

function renderConversation(letter, fallbackName, fallbackPhotoUrl = '') {
  const fallbackSnippet = usableWorkspaceSnippet(letter?.snippet);
  const directText = String(letter?.bodyText || letter?.text || fallbackSnippet || '').trim();
  const letterDirection = letter?.direction === 'outgoing' ? 'outgoing' : 'incoming';
  const myName = myProfileName();
  const fallbackIncoming = Array.isArray(letter?.conversation)
    ? letter.conversation.find(item => item?.direction !== 'outgoing' && String(item?.text || '').trim())
    : null;
  const rawConversation = directText ? [{
    direction: letterDirection,
    author: letterDirection === 'outgoing' ? myName : fallbackName,
    dateText: letter?.dateText || '',
    text: directText
  }] : (fallbackIncoming ? [{
    direction: 'incoming',
    author: fallbackName,
    dateText: fallbackIncoming.dateText || letter?.dateText || '',
    text: fallbackIncoming.text
  }] : []);

  const seen = new Set();
  const conversation = rawConversation
    .map(message => {
      const text = cleanDialogText(message.text, fallbackName);
      if (!text) return null;
      if (isDialogUiOnlyText(text, fallbackName)) return null;
      if (/^your flirt has been sent\b/i.test(text)) return null;
      if (text.toLowerCase() === String(fallbackName || '').trim().toLowerCase()) return null;
      const compact = conversationFingerprint(text, fallbackName);
      if (seen.has(compact)) return null;
      seen.add(compact);
      const forcedIncoming = message.direction !== 'outgoing' && looksIncomingText(text, fallbackName);
      const direction = message.direction === 'outgoing' ? 'outgoing' : 'incoming';
      return {
        ...message,
        text,
        direction,
        author: direction === 'outgoing' ? myName : (forcedIncoming ? fallbackName : (message.author || fallbackName))
      };
    })
    .filter(Boolean);
  const attachmentsHtml = renderAttachments(letter?.attachments);

  if (!conversation.length) {
    const fallbackDirection = letterDirection === 'outgoing' ? 'outgoing' : 'incoming';
    return attachmentsHtml
      ? `<div class="workspace-message-group ${fallbackDirection}">
          <div class="workspace-attachment-row">${attachmentsHtml}</div>
        </div>`
      : '';
  }

  return conversation.map((message, index) => {
    const direction = message.direction === 'outgoing' ? 'outgoing' : 'incoming';
    const author = message.author || (direction === 'outgoing' ? myName : fallbackName);
    const dateText = formatWorkspaceMessageDate(message.dateText || letter?.dateText || '');
    const translateKey = translationKey(letter?.key || '', index);
    const translationLoading = workspaceTranslationLoading.has(translateKey);
    const translationText = workspaceTranslationResults.get(translateKey) || '';
    const messageAttachments = index === conversation.length - 1 && attachmentsHtml
      ? `<div class="workspace-attachment-row">${attachmentsHtml}</div>`
      : '';
    return `
      <div class="workspace-message-group ${direction}">
        <div class="workspace-message-line">
          <article class="workspace-chat-message ${direction}">
            <div class="workspace-message-top">
              <div class="workspace-message-author">${escapeHtml(author)}</div>
              ${dateText ? `<strong>${escapeHtml(dateText)}</strong>` : ''}
              <button class="workspace-translate-message ${translationLoading ? 'loading' : ''}" type="button" data-message-index="${index}" title="Translate" aria-label="Translate message" ${translationLoading ? 'disabled aria-busy="true"' : ''}>TR</button>
            </div>
            <p>${escapeHtml(message.text || '')}</p>
            ${translationLoading ? '<div class="workspace-translation-result loading">Translating...</div>' : ''}
            ${translationText ? `<div class="workspace-translation-result">${escapeHtml(translationText)}</div>` : ''}
          </article>
        </div>
        ${messageAttachments}
      </div>
    `;
  }).join('');
}

function renderAttachments(attachments = []) {
  const cleanAttachments = (Array.isArray(attachments) ? attachments : [])
    .map(item => ({
      type: String(item?.type || '').toLowerCase(),
      url: String(item?.localUrl || item?.url || item?.src || '').trim()
    }))
    .filter(item => item.url)
    .slice(0, 12);

  if (!cleanAttachments.length) return '';

  const typedAttachments = cleanAttachments.map(item => {
    const isVideo = item.type === 'video' || /\.(mp4|webm|mov|m4v)(?:[?#]|$)/i.test(item.url);
    const isImage = !isVideo && (item.type === 'image' || /\.(jpe?g|png|gif|webp|bmp|avif)(?:[?#]|$)/i.test(item.url));
    return { ...item, kind: isVideo ? 'video' : (isImage ? 'photo' : 'file') };
  });
  const kinds = new Set(typedAttachments.map(item => item.kind));
  const onlyKind = kinds.size === 1 ? typedAttachments[0]?.kind : 'file';
  const label = onlyKind === 'video' ? 'video' : (onlyKind === 'photo' ? 'photo' : 'file');
  const pluralLabel = label === 'file' ? 'files' : `${label}s`;
  const itemLabel = cleanAttachments.length === 1 ? label : pluralLabel;
  const openText = `Open ${itemLabel}`;
  const hideText = `Hide ${itemLabel}`;
  return `
    <details class="workspace-attachments">
      <summary>
        <span class="workspace-attachments-open-label">${escapeHtml(hideText)}</span>
        <span class="workspace-attachments-closed-label">${escapeHtml(openText)}</span>
      </summary>
      <div class="workspace-attachment-previews">
        ${typedAttachments.map((item, index) => {
          const isVideo = item.kind === 'video';
          const label = item.kind === 'video' ? 'Video' : (item.kind === 'photo' ? 'Photo' : 'File');
          return isVideo
            ? `<figure class="workspace-attachment-preview video">
                <video src="${escapeAttr(item.url)}" controls preload="metadata"></video>
                <figcaption>${escapeHtml(label)}</figcaption>
              </figure>`
            : `<figure class="workspace-attachment-preview image">
                <img src="${escapeAttr(item.url)}" alt="${escapeAttr(label)}" loading="lazy" decoding="async">
                <figcaption>${escapeHtml(label)}</figcaption>
              </figure>`;
        }).join('')}
      </div>
    </details>
  `;
}

function renderDialog(group) {
  if (!group) {
    renderEmpty();
    return;
  }

  const name = group.name || `Man ${group.id}`;
  renderHeaderDialog(group);
  const selectedLetter = selectedLetterFromGroup(group);
  const isLoading = workspaceLoadingLetterKeys.has(String(selectedLetter?.key || ''));
  const hasReadableText = Boolean(letterText(selectedLetter));
  const isLoaded = Boolean(hasReadableText || (Array.isArray(selectedLetter?.conversation) && selectedLetter.conversation.length));
  const visibleLetters = [...group.letters]
    .filter(letter => letter?.listAnchor !== true)
    .sort((a, b) => parseDateValue(b?.dateText) - parseDateValue(a?.dateText));
  const headerSyncState = workspaceDialogSyncStates.get(String(group.id || '')) || '';
  const isManLettersMode = workspaceLettersFilter === 'men';
  const pageLoadingKey = `${group.id || group.key || ''}:${workspaceLetterPage}`;
  const isCurrentLetterPageLoading = workspaceLetterPageLoading.has(pageLoadingKey) || Boolean(headerSyncState);
  const rightLetters = isManLettersMode
    ? visibleLetters.filter(letter => letter.direction !== 'outgoing')
    : visibleLetters;
  const progressivePageLimit = workspaceLetterVisibleLimit(group.id || group.key || '');
  const knownEndPage = workspaceLetterKnownEnd(group.id || group.key || '');
  const maxDreamListPage = rightLetters.reduce((max, letter) =>
    Math.max(max, Math.max(1, Number(letter?.dreamListPage || 1) || 1)), 1);
  const actualDatePages = isManLettersMode
    ? Math.max(1, Math.ceil(rightLetters.length / WORKSPACE_LETTER_PAGE_SIZE))
    : maxDreamListPage;
  const totalLetterPages = isManLettersMode
    ? Math.max(1, Math.ceil(rightLetters.length / WORKSPACE_LETTER_PAGE_SIZE))
    : Math.min(
      knownEndPage || Number.MAX_SAFE_INTEGER,
      Math.max(progressivePageLimit, actualDatePages)
    );
  workspaceLetterPage = Math.min(totalLetterPages, Math.max(1, Number(workspaceLetterPage) || 1));
  const pageLetters = isManLettersMode
    ? rightLetters.slice(
      (workspaceLetterPage - 1) * WORKSPACE_LETTER_PAGE_SIZE,
      workspaceLetterPage * WORKSPACE_LETTER_PAGE_SIZE
    )
    : rightLetters.filter(letter => Math.max(1, Number(letter?.dreamListPage || 1) || 1) === workspaceLetterPage);
  const pagedLetters = isManLettersMode ? pageLetters.slice(0, WORKSPACE_LETTER_PAGE_SIZE) : pageLetters;
  const letterPager = renderWorkspaceLetterPager(isManLettersMode ? rightLetters.length : 0, workspaceLetterPage, {
    minPages: isManLettersMode ? 1 : WORKSPACE_MIN_LETTER_PAGES,
    totalPages: totalLetterPages
  });
  const letterCards = isCurrentLetterPageLoading
    ? '<div class="workspace-letter-loading-state"><span class="workspace-letter-spinner" aria-hidden="true"></span><span>Loading letters...</span></div>'
    : pagedLetters.length
      ? pagedLetters.map((letter, index) => {
    const active = String(letter.key) === String(workspaceSelectedLetterKey);
    const directionClass = letter.direction === 'outgoing' ? 'outgoing' : 'incoming';
    const status = letter.direction === 'outgoing'
      ? (letter.readByMan === true ? 'Read' : myProfileName())
      : (letter.unread === true ? 'Unread' : name);
    const incomingStatusBadges = letter.direction !== 'outgoing'
      ? [
        letter.unread === true ? '<span class="workspace-letter-status-badge unread">Unread</span>' : '',
        letter.unanswered === true ? '<span class="workspace-letter-status-badge unanswered">No reply</span>' : ''
      ].filter(Boolean).join('')
      : '';
    const outgoingStatusBadges = letter.direction === 'outgoing'
      ? [
        letter.readByMan === true ? '<span class="workspace-letter-status-badge read-by-man">Read</span>' : ''
      ].filter(Boolean).join('')
      : '';
    const loaded = Boolean(letter.bodyText || (Array.isArray(letter.conversation) && letter.conversation.length));
    const date = formatWorkspaceDate(letter.dateText) || `Letter ${index + 1}`;
    const preview = workspaceLetterTooltip(letter.snippet) || workspaceLetterTooltip(letter.bodyText);
    const hasAttachment = letter.attachmentsHint === true || (Array.isArray(letter.attachments) && letter.attachments.length > 0);
    return `
      <button class="workspace-letter-card ${directionClass} ${letter.readByMan === true ? 'read-by-man' : ''} ${active ? 'active' : ''} ${letter.unread ? 'unread' : ''} ${letter.unanswered ? 'unanswered' : ''} ${loaded ? 'loaded' : ''}" type="button" data-letter-key="${escapeAttr(letter.key)}" ${preview ? `data-preview="${escapeAttr(preview)}"` : ''}>
        <span class="workspace-letter-date">
          ${hasAttachment ? '<span class="workspace-letter-attachment" aria-label="Attachment"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.4 10.1 12 19.5a6 6 0 0 1-8.5-8.5l9.4-9.4a4 4 0 0 1 5.7 5.7l-9.5 9.4a2 2 0 0 1-2.8-2.8l8.8-8.8"/></svg></span>' : ''}
          <span>${escapeHtml(date)}</span>
        </span>
        <span class="workspace-letter-meta">
          <span class="workspace-letter-status">${incomingStatusBadges || outgoingStatusBadges || escapeHtml(status)}</span>
        </span>
      </button>
    `;
      }).join('')
      : '';
  const loadingText = isLoading
    ? '<div class="workspace-message-loading">Loading full letter text</div>'
    : '';
  const sourceText = selectedLetter?.readError && !hasReadableText
    ? `<div class="workspace-message-loading error">${escapeHtml(selectedLetter.readError)}</div>`
    : '';
  const chooseLetterText = !selectedLetter
    ? `
      <div class="workspace-choose-letter">
        <span class="workspace-empty-icon" aria-hidden="true">📩</span>
        <h1>Select the letter</h1>
        <p>IN THE RIGHT PANEL</p>
      </div>
    `
    : '';
  const emptyLetterText = selectedLetter && !isLoading && !sourceText && !isLoaded && !(Array.isArray(selectedLetter.attachments) && selectedLetter.attachments.length)
    ? '<div class="workspace-message-loading error">Could not load letter text</div>'
    : '';

  const isReadMode = workspaceListFilter === 'read';
  const hideLetterPanel = workspaceListFilter === 'noreply';
  dialog.innerHTML = `
    <div class="workspace-reader ${hideLetterPanel ? 'read-mode' : ''}">
      <section class="workspace-conversation">
        <div class="workspace-message-stack">
          ${chooseLetterText}
          ${loadingText}
          ${sourceText}
          ${emptyLetterText}
          ${selectedLetter ? renderConversation(selectedLetter, name, group.photoUrl || '') : ''}
        </div>
      </section>
      ${hideLetterPanel ? '' : renderWorkspaceSidePanel(letterCards)}
    </div>
  `;
  if (headerLetters) {
    if (hideLetterPanel) {
      headerLetters.classList.add('hidden');
      headerLetters.innerHTML = '';
    } else {
      headerLetters.classList.remove('hidden');
      headerLetters.innerHTML = `
        <div class="workspace-letter-tools">
          <button class="workspace-dialog-man-sync ${isManLettersMode ? 'active' : ''} ${headerSyncState ? 'syncing' : ''}" type="button" title="Update and show all letters from this man" ${headerSyncState ? 'disabled aria-busy="true"' : ''}>Man Letter</button>
          <button class="workspace-dialog-full-sync ${headerSyncState ? 'syncing' : ''}" type="button" title="Full Dialog" ${headerSyncState ? 'disabled aria-busy="true"' : ''}>Full Dialog</button>
        </div>
      `;
    }
  }
  restoreLetterStripScroll(group);
  const canReply = canReplyToLetter(selectedLetter);
  composer?.classList.toggle('hidden', isReadMode);
  reply.disabled = isReadMode || !canReply;
  photoBtn.disabled = isReadMode || !canReply;
  videoBtn.disabled = isReadMode || !canReply;
  if (replyTranslateBtn) replyTranslateBtn.disabled = isReadMode || !canReply || !reply.value.trim();
  sendBtn.disabled = isReadMode || !canReply;
  reply.placeholder = 'Enter your message';
  renderPendingReplyAttachments();
  resizeReplyBox();
}

async function loadSelectedLetterBody() {
  const group = findGroup(workspaceSelectedId);
  const letter = selectedLetterFromGroup(group);
  await loadWorkspaceLetterDetails(letter, group, { render: true });
}

async function loadWorkspaceLetterDetails(letter, group, options = {}) {
  const render = options.render !== false;
  const force = options.force === true;
  const key = String(letter?.key || '');
  const hasBody = Boolean(letter?.bodyText || (Array.isArray(letter?.conversation) && letter.conversation.length));
  const hasCheckedAttachments = letter?.attachmentsChecked === true || (Array.isArray(letter?.attachments) && letter.attachments.length);
  const hasUncachedAttachments = Array.isArray(letter?.attachments) && letter.attachments.some(item => {
    const url = String(item?.url || '').trim();
    const localUrl = String(item?.localUrl || '').trim();
    return url && !localUrl && !url.startsWith('/workspace-attachments/');
  });
  if (!letter || !key || (!force && hasBody && hasCheckedAttachments && !hasUncachedAttachments) || workspaceLoadingLetterKeys.has(key) || !letter.messageLink) return null;

  workspaceLoadingLetterKeys.add(key);
  if (render) renderDialog(group);
  try {
    setWorkspaceActionStatus('Loading full letter');
    const response = await apiFetch('/api/workspace/read-letter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceProfileId: activeProfileId,
        messageLink: letter.messageLink,
        id: letter.id || group?.id || '',
        name: letter.name || group?.name || '',
        direction: letter.direction === 'outgoing' ? 'outgoing' : 'incoming'
      })
    }, 70000);
    const responseLetter = response.letter || {};
    if (letter.transient === true) {
      const liveLetter = {
        ...letter,
        ...responseLetter,
        key,
        transient: true,
        messageLink: responseLetter.replyUrl || responseLetter.messageLink || letter.messageLink,
        attachments: responseLetter.attachments || letter.attachments || [],
        attachmentsChecked: true
      };
      updateLetterInMemory(liveLetter);
      return liveLetter;
    }
    const saved = await apiFetch('/api/workspace/letter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceProfileId: activeProfileId,
        key,
        letter: {
          ...responseLetter,
          messageLink: responseLetter.replyUrl || responseLetter.messageLink || letter.messageLink
        }
      })
    });
    workspaceLetters = saved.letters || workspaceLetters;
    if (saved.letter) {
      updateLetterInMemory({
        ...saved.letter,
        messageLink: responseLetter.replyUrl || saved.letter.messageLink || letter.messageLink,
        attachments: saved.letter.attachments?.length ? saved.letter.attachments : responseLetter.attachments || [],
        attachmentsChecked: true
      });
    }
    return saved.letter || null;
  } catch (error) {
    updateLetterInMemory({ key, readError: error.message || 'Could not load full letter text' });
    return null;
  } finally {
    workspaceLoadingLetterKeys.delete(key);
    setWorkspaceActionStatus('');
    if (render) {
      renderList();
      renderDialog(findGroup(workspaceSelectedId));
    }
  }
}

async function syncCurrentManAttachments(targetId, maxLetters = WORKSPACE_SYNC_ROWS_DEFAULT, options = {}) {
  const group = findGroup(targetId);
  if (!group?.letters?.length) return;
  const full = options.full === true;
  const limit = Math.min(WORKSPACE_FULL_SYNC_PAGES, Math.max(1, Number(maxLetters) || WORKSPACE_SYNC_ROWS_DEFAULT));
  const hasAttachmentHint = letter => {
    if (letter?.attachmentsHint === true) return true;
    if (Array.isArray(letter?.attachments) && letter.attachments.length > 0) return true;
    return /\b(?:attached|attachment|request photo|request video|video inside|photo inside|open photo|open video)\b/i
      .test(String(letter?.snippet || ''));
  };
  const hasUncachedAttachment = letter => Array.isArray(letter?.attachments) && letter.attachments.some(item => {
    const url = String(item?.url || '').trim();
    const localUrl = String(item?.localUrl || '').trim();
    return url && !localUrl && !url.startsWith('/workspace-attachments/');
  });
  let candidates = [...group.letters]
    .sort((a, b) => parseDateValue(b?.dateText) - parseDateValue(a?.dateText));
  if (!full && Number(options.page || 0) > 0) {
    const pageSize = Math.max(1, Number(options.pageSize || limit) || limit);
    const page = Math.max(1, Number(options.page || 1) || 1);
    candidates = candidates.slice((page - 1) * pageSize, page * pageSize);
  } else if (!full) candidates = candidates.slice(0, limit);
  candidates = candidates.filter(letter => letter?.messageLink);
  if (full) {
    candidates = candidates.filter(letter => letter.attachmentsChecked !== true || hasUncachedAttachment(letter));
  } else {
    candidates = candidates
      .filter(letter => letter.unread !== true)
      .filter(letter => hasAttachmentHint(letter) || hasUncachedAttachment(letter))
      .filter(letter => letter.attachmentsChecked !== true || hasUncachedAttachment(letter));
  }

  for (const letter of candidates) {
    await loadWorkspaceLetterDetails(letter, group, { render: false });
  }
  await reloadWorkspaceInbox();
}

function selectLetterGroup(id, letterKey = '') {
  const previousSelectedId = workspaceSelectedId;
  const previousSelectedLetterKey = workspaceSelectedLetterKey;
  saveMenListScroll();
  saveLetterStripScroll();
  workspaceSelectedId = String(id || '');
  workspaceSelectedLetterKey = letterKey
    ? String(letterKey)
    : (previousSelectedId === workspaceSelectedId ? previousSelectedLetterKey : '');
  if (previousSelectedId !== workspaceSelectedId) workspaceLetterPage = 1;
  if (previousSelectedId !== workspaceSelectedId && workspaceLettersFilter !== 'all') {
    workspaceLettersFilter = 'all';
    sessionStorage.setItem('dream_workspace_letters_filter', 'all');
  }
  if (previousSelectedId !== workspaceSelectedId || previousSelectedLetterKey !== workspaceSelectedLetterKey) {
    clearPendingReplyAttachments();
    workspaceMediaSelectedId = '';
  }
  rememberSelectedDialog();
  renderList();
  renderDialog(findGroup(workspaceSelectedId));
  if (workspaceListFilter === 'inbox' && letterKey) loadSelectedLetterBody();
  return previousSelectedId !== workspaceSelectedId || previousSelectedLetterKey !== workspaceSelectedLetterKey;
}

async function scanCurrentManAllLetterPages(button) {
  const selectedGroup = findGroup(workspaceSelectedId);
  if (!selectedGroup?.id) {
    alert('Select a dialogue first');
    return;
  }
  const target = { id: selectedGroup.id, name: selectedGroup.name };
  const syncId = String(target.id);
  if (workspaceDialogSyncStates.has(syncId)) return;
  const selectedLetterFingerprint = workspaceLetterRestoreFingerprint(selectedLetterFromGroup(selectedGroup));
  try {
    if (workspaceLettersFilter === 'men') {
      workspaceLettersFilter = 'all';
      workspaceLetterPage = 1;
      workspaceSelectedLetterKey = '';
      sessionStorage.setItem('dream_workspace_letters_filter', workspaceLettersFilter);
      rememberSelectedDialog();
      renderCurrentWorkspaceState();
      return;
    }
    workspaceLettersFilter = 'men';
    workspaceLetterPage = 1;
    workspaceSelectedLetterKey = '';
    sessionStorage.setItem('dream_workspace_letters_filter', workspaceLettersFilter);
    workspaceDialogSyncStates.set(syncId, 'man letters');
    if (button) button.title = 'Man Letter: scanning all incoming pages';
    setWorkspaceActionStatus('Man Letter: scanning incoming pages', button);
    renderCurrentWorkspaceState();
    await scanAndSaveInboxTargets([target], WORKSPACE_FULL_SYNC_PAGES, { mergeOnly: true, full: true, stopAtShortPage: true });
    await reloadWorkspaceInbox();
    restoreWorkspaceSelectedLetterFromFingerprint(findGroup(workspaceSelectedId), selectedLetterFingerprint);
    workspaceLetterPage = 1;
    setWorkspaceActionStatus('Man Letter updated', button);
  } catch (error) {
    alert(error.message || 'Could not scan man letters');
  } finally {
    workspaceDialogSyncStates.delete(syncId);
    if (button) button.title = 'Update and show all letters from this man';
    setWorkspaceActionStatus('');
    renderCurrentWorkspaceState();
  }
}

async function syncCurrentManLetterPage(pageNumber, button, options = {}) {
  const selectedGroup = findGroup(workspaceSelectedId);
  if (!selectedGroup?.id) {
    if (!options.silent) alert('Select a dialogue first');
    return;
  }
  const page = Math.max(1, Number(pageNumber) || 1);
  const skipAttachments = options.skipAttachments === true;
  const backgroundAttachments = options.backgroundAttachments === true;
  const target = { id: selectedGroup.id, name: selectedGroup.name };
  const syncId = String(target.id);
  const pageKey = `${syncId}:${page}`;
  if (workspaceLetterPageLoading.has(pageKey)) return;
  const selectedLetterFingerprint = workspaceLetterRestoreFingerprint(selectedLetterFromGroup(selectedGroup));
  workspaceLetterPage = page;
  try {
    workspaceLetterPageLoading.add(pageKey);
    workspaceDialogSyncStates.set(syncId, `page ${page}`);
    if (button) button.title = `Loading inbox page ${page} and sent page ${page}`;
    setWorkspaceActionStatus(`Letters page ${page}: scanning inbox`, button);
    renderCurrentWorkspaceState();
    if (page === 1) clearWorkspaceLetterKnownEnd(syncId);
    const inboxResult = await scanAndSaveInboxTargets([target], 1, { mergeOnly: true, page, replaceEmpty: true, persist: false, applyLive: false });
    workspaceDialogSyncStates.set(syncId, `page ${page}`);
    setWorkspaceActionStatus(`Letters page ${page}: scanning sent`, button);
    const sentResult = await scanAndSaveSentTargets([target], 1, { mergeOnly: true, page, replaceEmpty: true, persist: false, applyLive: false });
    replaceWorkspaceLivePageLetters(syncId, page, [
      ...(inboxResult?.scannedLetters || []),
      ...(sentResult?.scannedLetters || [])
    ], ['incoming', 'outgoing']);
    restoreWorkspaceSelectedLetterFromFingerprint(findGroup(workspaceSelectedId), selectedLetterFingerprint);
    const foundOnDreamPage = Number(inboxResult?.imported || 0) + Number(sentResult?.imported || 0);
    const dreamLastPage = Math.max(Number(inboxResult?.lastPage || 0) || 0, Number(sentResult?.lastPage || 0) || 0);
    revealWorkspaceDreamLetterPages(syncId, page, dreamLastPage > 1 ? dreamLastPage : 0);
    if (!foundOnDreamPage) setWorkspaceLetterKnownEnd(syncId, Math.max(1, page - 1));
    if (!skipAttachments) {
      workspaceDialogSyncStates.set(syncId, `page ${page}`);
      setWorkspaceActionStatus(`Letters page ${page}: checking attachments`, button);
      renderCurrentWorkspaceState();
      await syncCurrentManAttachments(syncId, WORKSPACE_LETTER_PAGE_SIZE, {
        page,
        pageSize: WORKSPACE_LETTER_PAGE_SIZE
      });
      await reloadWorkspaceInbox();
      restoreWorkspaceSelectedLetterFromFingerprint(findGroup(workspaceSelectedId), selectedLetterFingerprint);
    } else if (backgroundAttachments) {
      window.setTimeout(async () => {
        try {
          await syncCurrentManAttachments(syncId, WORKSPACE_LETTER_PAGE_SIZE, {
            page,
            pageSize: WORKSPACE_LETTER_PAGE_SIZE
          });
          await reloadWorkspaceInbox();
          if (String(workspaceSelectedId || '') === syncId) {
            restoreWorkspaceSelectedLetterFromFingerprint(findGroup(workspaceSelectedId), selectedLetterFingerprint);
            renderCurrentWorkspaceState();
          }
        } catch (error) {
          console.warn(`Could not background-check attachments for page ${page}`, error);
        }
      }, 250);
    }
    setWorkspaceActionStatus(`Letters page ${page} updated`, button);
  } catch (error) {
    if (options.silent) console.warn(`Could not load letters page ${page}`, error);
    else alert(error.message || `Could not load letters page ${page}`);
  } finally {
    workspaceLetterPageLoading.delete(pageKey);
    workspaceDialogSyncStates.delete(syncId);
    workspaceRowSyncIds.delete(syncId);
    if (button) button.title = `Load inbox page ${page} and sent page ${page}`;
    setWorkspaceActionStatus('');
    renderCurrentWorkspaceState();
  }
}

function autoSyncSelectedManFromList() {
  if (workspaceListFilter !== 'inbox') return;
  if (!workspaceSelectedId) return;
  const group = findGroup(workspaceSelectedId);
  const syncId = String(group?.id || workspaceSelectedId || '');
  if (syncId) {
    workspaceRowSyncIds.add(syncId);
    renderList();
  }
  Promise.resolve(syncCurrentManLetters(null, {
    silent: true,
    listOnly: true,
    rows: WORKSPACE_INBOX_SYNC_PAGES
  })).finally(() => {
    workspaceRowSyncIds.delete(syncId);
    renderList();
  });
}

async function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (activeProfileId) headers.set('X-Profile-ID', activeProfileId);
  const response = await fetch(url, { ...options, headers });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Request failed');
  return result;
}

async function openWorkspaceInbox(button = inboxFilterBtn, options = {}) {
  workspaceListFilter = 'inbox';
  persistWorkspaceListFilter();
  renderCurrentWorkspaceState();
  if (options.authRefresh === true) {
    const beforeLetters = [...workspaceLetters];
    workspaceInboxListLoading = true;
    workspaceListLoadingFilter = 'inbox';
    renderList();
    try {
      await scanAndSaveInbox(WORKSPACE_INBOX_AUTH_REFRESH_PAGES, { mergeOnly: true, limitRows: false, limitLetters: false });
      await reloadWorkspaceInbox();
      if (hasNewIncomingActivity(beforeLetters, workspaceLetters)) playInboxNewMessageSound();
      renderCurrentWorkspaceState();
    } catch (error) {
      console.warn('Could not refresh inbox after profile connection', error);
      await reloadWorkspaceInbox().catch(() => {});
      renderCurrentWorkspaceState();
    } finally {
      workspaceInboxListLoading = false;
      if (workspaceListLoadingFilter === 'inbox') workspaceListLoadingFilter = '';
      renderCurrentWorkspaceState();
    }
    return;
  }
  if (options.scan !== false) {
    await updateWorkspaceInboxRows(button);
  } else {
    await reloadWorkspaceInbox();
    renderCurrentWorkspaceState();
  }
}

async function scanWorkspaceInboxBackground() {
  if (!activeProfileId || !isWorkspaceLadyConnected()) return;
  if (workspaceInboxBackgroundScanning || workspaceInboxListLoading || workspaceListLoadingFilter) return;
  const beforeLetters = [...workspaceLetters];
  workspaceInboxBackgroundScanning = true;
  renderList();
  try {
    await scanAndSaveInbox(WORKSPACE_INBOX_BACKGROUND_PAGES, { mergeOnly: true, limitRows: false, limitLetters: false });
    await reloadWorkspaceInbox();
    if (hasNewIncomingActivity(beforeLetters, workspaceLetters)) playInboxNewMessageSound();
    renderCurrentWorkspaceState();
  } catch (error) {
    console.warn('Could not background scan inbox', error);
  } finally {
    workspaceInboxBackgroundScanning = false;
    renderCurrentWorkspaceState();
  }
}

function startWorkspaceInboxBackgroundScan() {
  if (workspaceInboxBackgroundTimer || !activeProfileId || !isWorkspaceLadyConnected()) return;
  workspaceInboxBackgroundTimer = window.setInterval(scanWorkspaceInboxBackground, WORKSPACE_INBOX_BACKGROUND_INTERVAL_MS);
}

async function loadWorkspace() {
  renderLoading();
  try {
    loadTranslatorSettings();
    if (workspaceAutoloadInbox) {
      workspaceListFilter = 'inbox';
      persistWorkspaceListFilter();
    } else {
      persistWorkspaceListFilter();
    }
    const session = await apiFetch('/api/auth/me');
    workspaceProfiles = session.profiles || [];
    if (!activeProfileId) {
      window.location.href = 'index.html';
      return;
    }

    renderProfileSummary();
    updateWorkspaceConnectionToggle();
    if (!isWorkspaceLadyConnected()) {
      renderDisconnectedWorkspace();
      return;
    }
    const result = await apiFetch('/api/workspace/inbox');
    workspaceLetters = result.letters || [];
    renderList();
    if (workspaceAutoloadInbox) {
      await openWorkspaceInbox(inboxFilterBtn, { authRefresh: true });
    }
    startWorkspaceInboxBackgroundScan();
    const group = findGroup(workspaceSelectedId);
    if (group) {
      renderDialog(findGroup(workspaceSelectedId));
      if (workspaceSelectedLetterKey) loadSelectedLetterBody();
    } else {
      clearSelectedDialog();
      renderEmpty();
    }
    setTimeout(() => {
      checkWorkspaceOnline();
    }, 900);
  } catch (error) {
    if (error.message.includes('Unauthorized') || error.message.includes('Access')) {
      window.location.href = 'index.html';
      return;
    }
    menList.innerHTML = `<div class="workspace-muted-state">${escapeHtml(error.message)}</div>`;
  }
}

function renderCurrentWorkspaceState() {
  if (!isWorkspaceLadyConnected()) {
    renderDisconnectedWorkspace();
    return;
  }
  if (!['inbox', 'read', 'noreply'].includes(workspaceListFilter)) workspaceListFilter = 'inbox';
  renderList();
  const group = findGroup(workspaceSelectedId);
  if (group) {
    renderDialog(group);
    if (workspaceSelectedLetterKey) loadSelectedLetterBody();
  } else {
    clearSelectedDialog();
    renderEmpty();
  }
}

function workspaceSyncTargets() {
  const targets = new Map();
  for (const letter of workspaceLetters) {
    const id = String(letter?.id || letter?.profileId || '').trim();
    if (!/^\d{4,}$/.test(id) || targets.has(id)) continue;
    targets.set(id, {
      id,
      name: String(letter?.name || '').trim(),
      profileUrl: String(letter?.profileLink || '').trim(),
      favorite: letter?.siteFavorite === true
    });
  }
  return [...targets.values()];
}

function workspaceKnownLetterKeysForId(id) {
  const targetId = String(id || '').trim();
  if (!targetId) return [];
  const keys = new Set();
  for (const letter of workspaceLetters) {
    if (String(letter?.id || letter?.profileId || '').trim() !== targetId) continue;
    if (letter?.key) keys.add(String(letter.key));
    const direction = letter?.direction === 'outgoing' ? 'sent' : 'inbox';
    const fallback = `${direction}:${targetId}:${letter?.dateText || letter?.messageLink || ''}`;
    if (fallback.replace(/:/g, '')) keys.add(fallback);
  }
  return [...keys];
}

async function scanAndSaveInbox(rows = workspaceSyncRows(), options = {}) {
  const full = options.full === true;
  const syncRows = full
    ? WORKSPACE_FULL_SYNC_PAGES
    : Math.min(WORKSPACE_FULL_SYNC_PAGES, Math.max(1, Number(rows) || WORKSPACE_SYNC_ROWS_DEFAULT));
  setWorkspaceActionStatus(`Scanning inbox: ${syncRows} page${syncRows === 1 ? '' : 's'}`);
  const response = await apiFetch('/api/workspace/scan-inbox', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourceProfileId: activeProfileId,
      maxPages: syncRows
    })
  });
  workspaceLetters = response.letters || workspaceLetters;
  setWorkspaceActionStatus(`Inbox updated: ${response.imported || 0} letters saved`);
  return { letters: workspaceLetters, scannedLetters: response.letters || [] };
}

async function reloadWorkspaceInbox() {
  const response = await apiFetch('/api/workspace/inbox');
  workspaceLetters = response.letters || workspaceLetters;
  return workspaceLetters;
}

function replaceWorkspaceLivePageLetters(targetId, page, incoming = [], directions = ['incoming', 'outgoing']) {
  const id = String(targetId || '').trim();
  const pageNumber = Math.max(1, Number(page || 1) || 1);
  const directionSet = new Set(directions.map(item => String(item || '').trim()).filter(Boolean));
  const listAnchor = directionSet.has('incoming')
    ? workspaceLetters
      .filter(letter =>
        String(letter?.id || '').trim() === id &&
        String(letter?.direction || 'incoming') !== 'outgoing'
      )
      .sort((a, b) => parseDateValue(b?.dateText) - parseDateValue(a?.dateText))[0]
    : null;
  const liveLetters = (Array.isArray(incoming) ? incoming : [])
    .map(letter => ({
      ...letter,
      transient: true,
      listAnchor: false,
      dreamListPage: Math.max(1, Number(letter?.dreamListPage || pageNumber) || pageNumber)
    }))
    .filter(letter => String(letter?.id || '').trim() === id);
  const hasLiveIncoming = liveLetters.some(letter => String(letter?.direction || 'incoming') !== 'outgoing');
  const liveKeys = new Set(liveLetters.map(letter => String(letter?.key || '')).filter(Boolean));
  const nextLetters = [
    ...workspaceLetters.filter(letter => {
      const letterId = String(letter?.id || '').trim();
      const direction = String(letter?.direction || 'incoming') === 'outgoing' ? 'outgoing' : 'incoming';
      const letterPage = Math.max(1, Number(letter?.dreamListPage || 1) || 1);
      const key = String(letter?.key || '');
      if (liveKeys.has(key)) return false;
      return !(letterId === id && directionSet.has(direction) && letterPage === pageNumber);
    }),
    ...liveLetters
  ];
  if (listAnchor && !hasLiveIncoming) {
    nextLetters.push({
      ...listAnchor,
      transient: true,
      listAnchor: true,
      key: `${String(listAnchor.key || id)}:list-anchor`,
      dreamListPage: 0
    });
  }
  workspaceLetters = nextLetters;
  return liveLetters.length;
}

async function scanAndSaveInboxTargets(targets, maxPages = WORKSPACE_FULL_SYNC_PAGES, options = {}) {
  const syncPages = Math.min(WORKSPACE_FULL_SYNC_PAGES, Math.max(1, Number(maxPages) || WORKSPACE_FULL_SYNC_PAGES));
  const exactPage = Math.max(0, Number(options.page || 0) || 0);
  setWorkspaceActionStatus(exactPage
    ? `Scanning dialog inbox: page ${exactPage}`
    : `Scanning dialog inbox: ${syncPages} page${syncPages === 1 ? '' : 's'}`);
  const response = await apiFetch('/api/workspace/scan-inbox', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourceProfileId: activeProfileId,
      maxPages: syncPages,
      page: exactPage || undefined,
      targets,
      stopAtShortPage: options.stopAtShortPage === true,
      replaceEmpty: options.replaceEmpty === true,
      persist: options.persist === false ? false : true
    })
  });
  if (options.persist === false && exactPage && targets?.length === 1 && options.applyLive !== false) {
    replaceWorkspaceLivePageLetters(targets[0].id, exactPage, response.letters || [], ['incoming']);
    setWorkspaceActionStatus(`Dialog inbox loaded live: ${response.imported || 0} letters`);
  } else {
    if (options.persist !== false) workspaceLetters = response.letters || workspaceLetters;
    setWorkspaceActionStatus(options.persist === false
      ? `Dialog inbox loaded live: ${response.imported || 0} letters`
      : `Dialog inbox saved: ${response.imported || 0} letters`);
  }
  return {
    letters: workspaceLetters,
    scannedLetters: response.letters || [],
    imported: Number(response.imported || 0) || 0,
    lastPage: Number(response.lastPage || 0) || 0
  };
}

async function scanAndSaveSentTargets(targets, rows = workspaceSyncRows(), options = {}) {
  const full = options.full === true;
  const syncRows = full
    ? WORKSPACE_FULL_SYNC_PAGES
    : Math.min(100, Math.max(1, Number(rows) || WORKSPACE_SYNC_ROWS_DEFAULT));
  const exactPage = Math.max(0, Number(options.page || 0) || 0);
  setWorkspaceActionStatus(exactPage
    ? `Scanning sent letters: page ${exactPage}`
    : `Scanning sent letters: ${syncRows} page${syncRows === 1 ? '' : 's'}`);
  const response = await apiFetch('/api/workspace/scan-sent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourceProfileId: activeProfileId,
      maxPages: syncRows,
      page: exactPage || undefined,
      targets,
      view: options.view || 'all',
      replaceEmpty: options.replaceEmpty === true,
      persist: options.persist === false ? false : true
    })
  });
  if (options.persist === false && exactPage && targets?.length === 1 && options.applyLive !== false) {
    replaceWorkspaceLivePageLetters(targets[0].id, exactPage, response.letters || [], ['outgoing']);
    setWorkspaceActionStatus(`Sent letters loaded live: ${response.imported || 0} letters`);
  } else {
    if (options.persist !== false) workspaceLetters = response.letters || workspaceLetters;
    setWorkspaceActionStatus(options.persist === false
      ? `Sent letters loaded live: ${response.imported || 0} letters`
      : `Sent letters saved: ${response.imported || 0} letters`);
  }
  return {
    letters: workspaceLetters,
    scannedLetters: response.letters || [],
    imported: Number(response.imported || 0) || 0,
    lastPage: Number(response.lastPage || 0) || 0
  };
}

async function scanAndSaveReadLetters() {
  const rows = workspaceSyncRows();
  setWorkspaceActionStatus(`Scanning read sent letters: ${rows} page${rows === 1 ? '' : 's'}`);
  const response = await apiFetch('/api/workspace/scan-sent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourceProfileId: activeProfileId,
      maxPages: rows,
      view: 'read'
    })
  });
  workspaceLetters = response.letters || workspaceLetters;
  setWorkspaceActionStatus(`Read sent letters saved: ${response.imported || 0} letters`);
  return { letters: workspaceLetters, scannedLetters: response.letters || [] };
}

function targetsFromLetters(letters = []) {
  const targets = new Map();
  for (const letter of letters) {
    const id = String(letter?.id || '').trim();
    if (!/^\d{4,}$/.test(id)) continue;
    if (!targets.has(id)) {
      targets.set(id, {
        id,
        name: String(letter?.name || '').trim()
      });
    }
  }
  return [...targets.values()];
}

async function readTargetsFromAllMen() {
  const targets = new Map();
  const addTarget = item => {
    const id = String(item?.id || '').trim();
    if (!/^\d{4,}$/.test(id) || targets.has(id)) return;
    targets.set(id, {
      id,
      name: String(item?.name || '').trim()
    });
  };

  targetsFromLetters(workspaceLetters).forEach(addTarget);

  try {
    const result = await apiFetch('/api/men');
    (Array.isArray(result.men) ? result.men : []).forEach(addTarget);
  } catch (error) {
    console.warn('Could not load all men for Read scan', error);
  }

  return [...targets.values()];
}

async function syncAllWorkspace(button = refreshBtn) {
  if (!activeProfileId) return;
  const oldText = button?.textContent || '';
  setProfileSyncRunning(true, 'Starting sync');
  if (button) {
    button.disabled = true;
    button.textContent = 'Updating';
  }
  if (rowsUpdateBtn && rowsUpdateBtn !== button) rowsUpdateBtn.disabled = true;
  if (syncRowsInput) syncRowsInput.disabled = true;
  try {
    await scanAndSaveInbox(WORKSPACE_FULL_SYNC_PAGES, { full: true });
    await reloadWorkspaceInbox();
    if (hasPendingIncomingLetters()) playInboxNewMessageSound();
    renderCurrentWorkspaceState();
  } catch (error) {
    renderCurrentWorkspaceState();
    alert(error.message || 'Could not sync workspace');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = oldText || 'Update';
    }
    if (rowsUpdateBtn && rowsUpdateBtn !== button) rowsUpdateBtn.disabled = false;
    if (syncRowsInput) syncRowsInput.disabled = false;
    setProfileSyncRunning(false);
  }
}

async function syncInbox() {
  await syncAllWorkspace(refreshBtn);
}

async function syncSentTargets(targets, button = sentBtn) {
  if (!activeProfileId) return;
  const rows = workspaceSyncRows();
  if (!targets.length) {
    alert('Run Sync first');
    return;
  }
  const oldText = button?.textContent || '';
  if (button) {
    button.disabled = true;
    button.textContent = 'Syncing...';
  }
  try {
    await scanAndSaveSentTargets(targets, rows);
    renderCurrentWorkspaceState();
  } catch (error) {
    renderCurrentWorkspaceState();
    alert(error.message || 'Could not sync my letters');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = oldText;
    }
  }
}

async function syncSentLetters() {
  await syncAllWorkspace(refreshBtn);
}

async function updateWorkspaceInboxRows(button = rowsUpdateBtn) {
  if (!activeProfileId) return;
  const rows = workspaceInboxSyncPages();
  const beforeLetters = [...workspaceLetters];
  workspaceInboxListLoading = true;
  workspaceListLoadingFilter = 'inbox';
  renderList();
  if (refreshBtn && refreshBtn !== button) refreshBtn.disabled = true;
  if (syncRowsInput) syncRowsInput.disabled = true;
  try {
    await scanAndSaveInbox(rows, { mergeOnly: true, limitLetters: false });
    await reloadWorkspaceInbox();
    if (hasNewIncomingActivity(beforeLetters, workspaceLetters)) playInboxNewMessageSound();
    renderCurrentWorkspaceState();
  } catch (error) {
    renderCurrentWorkspaceState();
    alert(error.message || 'Could not update inbox rows');
  } finally {
    workspaceInboxListLoading = false;
    if (workspaceListLoadingFilter === 'inbox') workspaceListLoadingFilter = '';
    if (refreshBtn && refreshBtn !== button) refreshBtn.disabled = false;
    if (syncRowsInput) syncRowsInput.disabled = false;
    renderCurrentWorkspaceState();
  }
}

async function checkWorkspaceOnline() {
  if (!activeProfileId) return false;
  if (workspaceOnlineRefreshInProgress || workspaceInboxListLoading || workspaceListLoadingFilter) return false;
  workspaceOnlineRefreshInProgress = true;
  try {
    await apiFetch('/api/workspace/online-men', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceProfileId: activeProfileId,
        url: 'https://www.dream-singles.com/members/connections/myFavorites?all=1&folder=-1'
      })
    }, 120000);
    await reloadWorkspaceInbox();
    renderCurrentWorkspaceState();
    return true;
  } catch (error) {
    console.warn('Could not auto-check online status', error);
    return false;
  } finally {
    workspaceOnlineRefreshInProgress = false;
  }
}

async function setWorkspaceOnlineFilter(nextOnlineOnly, button = topOnlineBtn) {
  workspaceOnlyOnline = nextOnlineOnly === true;
  sessionStorage.setItem('dream_workspace_top_online', workspaceOnlyOnline ? '1' : '0');
  renderCurrentWorkspaceState();
  if (!workspaceOnlyOnline) return;

  const oldText = button?.textContent || '';
  if (button) {
    button.disabled = true;
    button.textContent = 'Loading';
    button.setAttribute('aria-busy', 'true');
  }
  try {
    await checkWorkspaceOnline();
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = oldText || 'Online';
      button.setAttribute('aria-busy', 'false');
    }
    renderCurrentWorkspaceState();
  }
}

function updateFavoriteInMemory(id, siteFavorite) {
  const value = siteFavorite === true;
  workspaceLetters = workspaceLetters.map(letter => String(letter?.id || '') === String(id)
    ? {
        ...letter,
        siteFavorite: value,
        siteFavoriteUpdatedAt: new Date().toISOString()
      }
    : letter);
}

async function toggleWorkspaceFavorite(id) {
  const group = groupedLetters(true).find(item => String(item.id) === String(id));
  if (!group?.id) return;
  if (workspaceFavoriteLoadingIds.has(String(group.id))) return;
  const nextFavorite = group.siteFavorite !== true;
  workspaceFavoriteLoadingIds.add(String(group.id));
  renderCurrentWorkspaceState();
  try {
    await extensionCommand(nextFavorite ? 'ADD_DREAM_FAVORITE' : 'REMOVE_DREAM_FAVORITE', {
      profileId: activeProfileId,
      id: group.id,
      profileUrl: group.profileLink || `https://www.dream-singles.com/${group.id}.html`
    }, 90000);
    await apiFetch(`/api/men/${encodeURIComponent(group.id)}/site-favorite`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteFavorite: nextFavorite })
    });
    updateFavoriteInMemory(group.id, nextFavorite);
    await reloadWorkspaceInbox();
  } catch (error) {
    alert(error.message || 'Could not update Favorite');
  } finally {
    workspaceFavoriteLoadingIds.delete(String(group.id));
    renderCurrentWorkspaceState();
  }
}

async function checkCurrentManActivity(button) {
  const group = findGroup(workspaceSelectedId);
  if (!group?.id) return;
  const oldText = button?.textContent || '';
  if (button) {
    button.disabled = true;
    button.textContent = 'Checking...';
  }
  try {
    const result = await extensionCommand('CHECK_MAN_PRESENCE', {
      profileId: activeProfileId,
      id: group.id,
      profileUrl: group.profileLink || `https://www.dream-singles.com/${group.id}.html`
    }, 90000);
    const presence = result.presence || {};
    workspaceLetters = workspaceLetters.map(letter => String(letter?.id || '') === String(group.id)
      ? {
          ...letter,
          onlineNow: presence.onlineNow === true,
          lastActivityText: presence.onlineNow === true ? 'Online now' : String(presence.lastActivityText || '').trim(),
          onlineCheckedAt: new Date().toISOString()
        }
      : letter);
    await reloadWorkspaceInbox();
    renderCurrentWorkspaceState();
  } catch (error) {
    renderCurrentWorkspaceState();
    alert(error.message || 'Could not check activity');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = oldText || 'Check Activity';
    }
  }
}

async function syncCurrentManLetters(button, options = {}) {
  const startedAt = Date.now();
  const selectedGroup = findGroup(workspaceSelectedId);
  if (!selectedGroup?.id) {
    if (!options.silent) alert('Select a dialogue first');
    return;
  }
  const full = options.full === true;
  const listOnly = options.listOnly === true;
  const silent = options.silent === true;
  const target = {
    id: selectedGroup.id,
    name: selectedGroup.name
  };
  const selectedLetterFingerprint = workspaceLetterRestoreFingerprint(selectedLetterFromGroup(selectedGroup));
  const syncId = String(target.id);
  if (workspaceDialogSyncStates.has(syncId)) return;
  const setSyncState = label => {
    if (label) workspaceDialogSyncStates.set(syncId, label);
    else workspaceDialogSyncStates.delete(syncId);
    if (button) button.title = label ? `Full Dialog: ${label}` : 'Full Dialog';
    if (label) setWorkspaceActionStatus(`Full Dialog: ${label}`, button);
    renderCurrentWorkspaceState();
  };
  try {
    setSyncState('scanning inbox');
    const rows = full
      ? WORKSPACE_FULL_SYNC_PAGES
      : Math.min(WORKSPACE_FULL_SYNC_PAGES, Math.max(1, Number(options.rows || workspaceSyncRows()) || WORKSPACE_SYNC_ROWS_DEFAULT));
    await scanAndSaveInboxTargets([target], rows, { mergeOnly: true, full });
    await reloadWorkspaceInbox();
    setSyncState('scanning sent letters');
    await scanAndSaveSentTargets([target], rows, { mergeOnly: true, full });
    await reloadWorkspaceInbox();
    restoreWorkspaceSelectedLetterFromFingerprint(findGroup(workspaceSelectedId), selectedLetterFingerprint);
    if (!full && !listOnly) {
      setSyncState('checking attachments');
      await syncCurrentManAttachments(syncId, rows, { full });
    }
    setWorkspaceActionStatus('Full Dialog updated', button);
  } catch (error) {
    renderCurrentWorkspaceState();
    if (!silent) alert(error.message || 'Could not sync this dialog');
    else console.warn('Could not auto-sync this dialog', error);
  } finally {
    workspaceDialogSyncStates.delete(syncId);
    if (button) button.title = 'Full Dialog';
    const elapsed = Date.now() - startedAt;
    if (elapsed < 1000) await new Promise(resolve => setTimeout(resolve, 1000 - elapsed));
    workspaceRowSyncIds.delete(syncId);
    setWorkspaceActionStatus('');
    renderCurrentWorkspaceState();
  }
}

async function sendWorkspaceReply() {
  const group = findGroup(workspaceSelectedId);
  const letter = selectedLetterFromGroup(group);
  if (!canReplyToLetter(letter)) return;

  const text = reply.value.trim();
  if (!text) return;

  reply.disabled = true;
  sendBtn.disabled = true;
  sendBtn.classList.add('sending');
  sendBtn.setAttribute('aria-busy', 'true');
  setWorkspaceActionStatus('Sending reply', sendBtn);
  try {
    await apiFetch('/api/workspace/send-reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceProfileId: activeProfileId,
        id: group?.id || letter.id || '',
        name: group?.name || letter.name || '',
        messageLink: letter.messageLink,
        text,
        attachments: workspacePendingReplyAttachments
      })
    }, 300000);
    try {
      const answeredSaved = await apiFetch('/api/workspace/answered', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: [letter.key], ids: [letter.id] })
      });
      if (Array.isArray(answeredSaved.letters)) workspaceLetters = answeredSaved.letters;
      else updateLetterInMemory({ key: letter.key, unanswered: false });
    } catch {
      updateLetterInMemory({ key: letter.key, unanswered: false });
    }
    await new Promise(resolve => setTimeout(resolve, 350));
    reply.value = '';
    clearReplyTranslationState();
    resizeReplyBox();
    clearPendingReplyAttachments();
    try {
      await new Promise(resolve => setTimeout(resolve, 700));
      setWorkspaceActionStatus('Reply sent. Updating sent letters', sendBtn);
      await scanAndSaveSentTargets([{
        id: group?.id || letter.id || '',
        name: group?.name || letter.name || ''
      }], WORKSPACE_REPLY_SENT_SYNC_ROWS, { mergeOnly: true });
    } catch (syncError) {
      console.warn('Could not auto-sync sent reply', syncError);
    }
    playReplySentSound();
  } catch (error) {
    alert(error.message || 'Could not send reply');
  } finally {
    sendBtn.classList.remove('sending');
    sendBtn.removeAttribute('aria-busy');
    setWorkspaceActionStatus('');
    renderDialog(findGroup(workspaceSelectedId));
  }
}

menList.addEventListener('click', event => {
  const copyId = event.target.closest('.workspace-copy-id');
  if (copyId) {
    event.preventDefault();
    event.stopPropagation();
    copyWorkspaceManId(copyId);
    return;
  }
  const favorite = event.target.closest('.workspace-favorite-star');
  if (favorite) {
    event.preventDefault();
    event.stopPropagation();
    toggleWorkspaceFavorite(favorite.dataset.favoriteId);
    return;
  }
  const button = event.target.closest('.workspace-man');
  if (button) {
    selectLetterGroup(button.dataset.id, button.dataset.letterKey || '');
    autoSyncSelectedManFromList();
  }
});

dialog.addEventListener('click', event => {
  const translateButton = event.target.closest('.workspace-translate-message');
  if (!translateButton) return;
  event.preventDefault();
  event.stopPropagation();
  translateMessage(translateButton);
});

menList.addEventListener('keydown', event => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const copyId = event.target.closest('.workspace-copy-id');
  if (copyId) {
    event.preventDefault();
    event.stopPropagation();
    copyWorkspaceManId(copyId);
    return;
  }
  const favorite = event.target.closest('.workspace-favorite-star');
  if (favorite) {
    event.preventDefault();
    event.stopPropagation();
    toggleWorkspaceFavorite(favorite.dataset.favoriteId);
    return;
  }
  const item = event.target.closest('.workspace-man');
  if (!item) return;
  event.preventDefault();
  selectLetterGroup(item.dataset.id, item.dataset.letterKey || '');
  autoSyncSelectedManFromList();
});

document.addEventListener('click', event => {
  if (!event.target.closest('.workspace-sync-menu')) {
    document.querySelectorAll('.workspace-sync-menu[open]').forEach(menu => menu.removeAttribute('open'));
  }

  const removeAttachment = event.target.closest('[data-remove-attachment]');
  if (removeAttachment) {
    const index = Number(removeAttachment.dataset.removeAttachment);
    workspacePendingReplyAttachments = workspacePendingReplyAttachments.filter((_, itemIndex) => itemIndex !== index);
    renderPendingReplyAttachments();
    return;
  }

  const syncButton = event.target.closest('.workspace-dialog-sync');
  if (syncButton) {
    syncCurrentManLetters(syncButton);
    return;
  }
  const fullSyncButton = event.target.closest('.workspace-dialog-full-sync');
  if (fullSyncButton) {
    event.target.closest('.workspace-sync-menu')?.removeAttribute('open');
    if (workspaceLettersFilter !== 'all') {
      workspaceLettersFilter = 'all';
      sessionStorage.setItem('dream_workspace_letters_filter', 'all');
      renderDialog(findGroup(workspaceSelectedId));
    }
    syncCurrentManLetters(fullSyncButton, { full: true });
    return;
  }
  const manSyncButton = event.target.closest('.workspace-dialog-man-sync');
  if (manSyncButton) {
    scanCurrentManAllLetterPages(manSyncButton);
    return;
  }
  const activityButton = event.target.closest('.workspace-check-activity');
  if (activityButton) {
    checkCurrentManActivity(activityButton);
    return;
  }
  const exitButton = event.target.closest('.workspace-dialog-exit');
  if (exitButton) {
    clearSelectedDialog();
    renderList();
    renderEmpty();
    return;
  }

  const filterButton = event.target.closest('.workspace-letter-filter');
  if (filterButton) {
    setWorkspaceLettersFilter(filterButton.dataset.letterFilter);
    return;
  }
});

dialog.addEventListener('click', event => {
  const pageButton = event.target.closest('[data-letter-page]');
  if (pageButton) {
    const nextPage = Math.max(1, Number(pageButton.dataset.letterPage) || 1);
    workspaceLetterPage = nextPage;
    const group = findGroup(workspaceSelectedId);
    renderDialog(group);
    if (workspaceLettersFilter === 'men') return;
    syncCurrentManLetterPage(nextPage, pageButton, {
      silent: true,
      skipAttachments: true,
      backgroundAttachments: false
    });
    return;
  }
  const filterButton = event.target.closest('.workspace-letter-filter');
  if (filterButton) {
    setWorkspaceLettersFilter(filterButton.dataset.letterFilter);
    return;
  }
  const button = event.target.closest('.workspace-letter-card');
  if (button && workspaceSelectedId) {
    selectLetterGroup(workspaceSelectedId, button.dataset.letterKey);
  }
});

let workspaceTooltip;
let workspaceTooltipTimer = null;
let workspaceTooltipTarget = null;

function ensureWorkspaceTooltip() {
  if (workspaceTooltip) return workspaceTooltip;
  workspaceTooltip = document.createElement('div');
  workspaceTooltip.className = 'workspace-floating-tooltip';
  document.body.appendChild(workspaceTooltip);
  return workspaceTooltip;
}

function hideWorkspaceTooltip() {
  if (workspaceTooltipTimer) {
    clearTimeout(workspaceTooltipTimer);
    workspaceTooltipTimer = null;
  }
  workspaceTooltipTarget = null;
  if (workspaceTooltip) workspaceTooltip.classList.remove('visible');
}

function showWorkspaceTooltip(card) {
  const text = String(card?.dataset?.preview || '').trim();
  if (!text) return hideWorkspaceTooltip();
  const tooltip = ensureWorkspaceTooltip();
  tooltip.textContent = text;
  tooltip.classList.add('visible');
  const rect = card.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const gap = 12;
  let left = rect.left - tooltipRect.width - gap;
  if (left < 12) left = rect.right + gap;
  if (left + tooltipRect.width > window.innerWidth - 12) left = window.innerWidth - tooltipRect.width - 12;
  let top = rect.top + (rect.height - tooltipRect.height) / 2;
  top = Math.max(12, Math.min(top, window.innerHeight - tooltipRect.height - 12));
  tooltip.style.left = `${Math.round(left)}px`;
  tooltip.style.top = `${Math.round(top)}px`;
}

function scheduleWorkspaceTooltip(card) {
  if (!card) return hideWorkspaceTooltip();
  if (workspaceTooltipTarget === card) return;
  if (workspaceTooltipTimer) clearTimeout(workspaceTooltipTimer);
  workspaceTooltipTarget = card;
  workspaceTooltipTimer = setTimeout(() => {
    workspaceTooltipTimer = null;
    if (workspaceTooltipTarget === card && card.isConnected) {
      showWorkspaceTooltip(card);
    }
  }, 1000);
}

dialog.addEventListener('mouseover', event => {
  const card = event.target.closest('.workspace-letter-card[data-preview]');
  if (card && !card.contains(event.relatedTarget)) scheduleWorkspaceTooltip(card);
});

dialog.addEventListener('mouseout', event => {
  const card = event.target.closest('.workspace-letter-card[data-preview]');
  if (card && !card.contains(event.relatedTarget)) hideWorkspaceTooltip();
});

dialog.addEventListener('focusin', event => {
  const card = event.target.closest('.workspace-letter-card[data-preview]');
  if (card) showWorkspaceTooltip(card);
});

dialog.addEventListener('focusout', hideWorkspaceTooltip);
dialog.addEventListener('scroll', event => {
  if (event.target?.classList?.contains('workspace-letter-strip') ||
      event.target?.classList?.contains('workspace-right-letters') ||
      event.target?.classList?.contains('letters-only')) {
    saveLetterStripScroll();
  }
  hideWorkspaceTooltip();
}, true);
menList?.addEventListener('scroll', saveMenListScroll, { passive: true });
window.addEventListener('resize', hideWorkspaceTooltip);
window.addEventListener('beforeunload', () => {
  saveLetterStripScroll();
  saveMenListScroll();
});

searchInput.addEventListener('input', () => {
  workspaceListPage = 1;
  if (!isWorkspaceLadyConnected()) {
    renderDisconnectedWorkspace();
    return;
  }
  renderList();
  renderDialog(findGroup(workspaceSelectedId));
});

searchButton?.addEventListener('click', () => {
  workspaceListPage = 1;
  animateWorkspaceButton(searchButton, 'pressed', 520);
  searchInput?.focus();
  if (!isWorkspaceLadyConnected()) {
    renderDisconnectedWorkspace();
    return;
  }
  renderList();
  renderDialog(findGroup(workspaceSelectedId));
});

refreshBtn.addEventListener('click', syncInbox);
document.addEventListener('click', event => {
  const pageButton = event.target.closest?.('#workspaceListPager [data-workspace-page]');
  if (pageButton) {
    event.preventDefault();
    event.stopPropagation();
    if (pageButton.disabled) return;
    workspaceListPage = Number(pageButton.dataset.workspacePage || '1') || 1;
    renderList();
    if (menList) menList.scrollTop = 0;
    if (workspaceOnlyOnline && workspaceListFilter === 'inbox') {
      checkWorkspaceOnline().catch(error => console.warn('Could not refresh online page', error));
    }
    return;
  }
  const link = event.target.closest?.('a[href]');
  if (!link) return;
  const href = String(link.href || '');
  if (!/^https:\/\/([^/]+\.)?dream-singles\.com\//i.test(href)) return;
  event.preventDefault();
  event.stopPropagation();
  openWorkspaceDreamUrl(href).catch(error => alert(error.message || 'Could not open Dream window'));
}, true);
profileAvatar?.addEventListener('click', openActiveDreamProfile);
profileAvatar?.addEventListener('keydown', event => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  openActiveDreamProfile();
});
connectionToggleBtn?.addEventListener('click', async () => {
  updateWorkspaceConnectionToggle(isWorkspaceLadyConnected(), true);
  try {
    const response = await extensionCommand('TOGGLE_LADY_CONNECTION', {}, 120000);
    if (response.connected === true) {
      updateWorkspaceConnectionToggle(true);
      await loadWorkspace();
    } else {
      renderDisconnectedWorkspace();
    }
  } catch (error) {
    alert(error.message || 'Could not change connection');
    updateWorkspaceConnectionToggle();
  }
});
if (rowsUpdateBtn) rowsUpdateBtn.addEventListener('click', () => updateWorkspaceInboxRows(rowsUpdateBtn));
if (copyReadIdsBtn) copyReadIdsBtn.addEventListener('click', () => copyReadIds(copyReadIdsBtn));
translatorClose?.addEventListener('click', closeTranslatorSettings);
translatorModal?.addEventListener('click', event => {
  if (event.target === translatorModal) closeTranslatorSettings();
});
translatorSave?.addEventListener('click', () => saveTranslatorSettings());
translatorTest?.addEventListener('click', testTranslatorSettings);
if (onlyOnlineBtn) onlyOnlineBtn.addEventListener('click', () => {
  workspaceListPage = 1;
  setWorkspaceOnlineFilter(!workspaceOnlyOnline, onlyOnlineBtn);
});
if (topOnlineBtn) topOnlineBtn.addEventListener('click', () => {
  workspaceListPage = 1;
  setWorkspaceOnlineFilter(!workspaceOnlyOnline, topOnlineBtn);
});
[inboxFilterBtn, readFilterBtn, noReplyFilterBtn].forEach(button => button?.addEventListener('click', async () => {
  saveMenListScroll();
  saveLetterStripScroll();
  workspaceListPage = 1;
  workspaceListFilter = ['read', 'noreply'].includes(button.dataset.listFilter) ? button.dataset.listFilter : 'inbox';
  persistWorkspaceListFilter();
  renderCurrentWorkspaceState();

  if (workspaceListFilter === 'inbox') {
    if (hasRecentUnansweredInboxLetters()) playInboxNewMessageSound();
    await openWorkspaceInbox(button);
  }

  if (workspaceListFilter === 'read') {
    workspaceListLoadingFilter = 'read';
    renderList();
    try {
      await scanAndSaveReadLetters();
      renderCurrentWorkspaceState();
    } catch (error) {
      console.warn('Could not refresh read list', error);
    } finally {
      if (workspaceListLoadingFilter === 'read') workspaceListLoadingFilter = '';
      renderCurrentWorkspaceState();
    }
  }

  if (workspaceListFilter === 'noreply') {
    workspaceListLoadingFilter = 'noreply';
    renderList();
    window.setTimeout(() => {
      if (workspaceListLoadingFilter === 'noreply') {
        workspaceListLoadingFilter = '';
        renderCurrentWorkspaceState();
      }
    }, 450);
  }
}));
sentBtn?.addEventListener('click', syncSentLetters);
photoBtn.addEventListener('click', () => openMediaPicker('photo'));
videoBtn.addEventListener('click', () => openMediaPicker('video'));
reply.addEventListener('input', resizeReplyBox);
reply.addEventListener('paste', () => requestAnimationFrame(resizeReplyBox));
replyTranslateBtn?.addEventListener('click', translateReplyText);
sendBtn.addEventListener('click', sendWorkspaceReply);
mediaRefresh.addEventListener('click', event => syncWorkspaceGallery(workspaceMediaMode, { full: event.shiftKey }));
if (mediaRefreshInline) mediaRefreshInline.addEventListener('click', event => syncWorkspaceGallery(workspaceMediaMode, { full: event.shiftKey }));
mediaSelect.addEventListener('click', selectPickedMedia);
mediaClose.addEventListener('click', closeMediaPicker);
mediaModal.addEventListener('click', event => {
  const previewButton = event.target.closest('[data-media-preview-id]');
  if (previewButton) {
    event.preventDefault();
    event.stopPropagation();
    openMediaPreview(previewButton.dataset.mediaPreviewId);
    return;
  }
  if (event.target.closest('.workspace-media-lightbox-close') || event.target.classList?.contains('workspace-media-lightbox')) {
    closeMediaPreview();
    return;
  }
  if (event.target === mediaModal) closeMediaPicker();
  const sectionButton = event.target.closest('[data-media-section]');
  if (sectionButton) {
    workspaceMediaSection = sectionButton.dataset.mediaSection || defaultWorkspaceMediaSection(workspaceMediaMode);
    workspaceMediaPage = 1;
    workspaceMediaSelectedId = '';
    closeMediaPreview();
    renderMediaPicker();
    return;
  }
  const pageButton = event.target.closest('[data-media-page]');
  if (pageButton) {
    workspaceMediaPage = Number(pageButton.dataset.mediaPage || 1);
    renderMediaPicker();
    return;
  }
  const tile = event.target.closest('[data-media-id]');
  if (tile) {
    workspaceMediaSelectedId = tile.dataset.mediaId || '';
    mediaGrid.querySelectorAll('[data-media-id]').forEach(item => {
      item.classList.toggle('selected', item === tile);
    });
    mediaSelect.disabled = !workspaceMediaSelectedId;
  }
});

mediaModal.addEventListener('keydown', event => {
  const previewButton = event.target.closest('[data-media-preview-id]');
  if (previewButton && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    openMediaPreview(previewButton.dataset.mediaPreviewId);
    return;
  }
  if (event.key === 'Escape' && workspaceMediaPreviewId) {
    event.preventDefault();
    closeMediaPreview();
  }
});

installWorkspaceThemeToggle();
updateWorkspaceConnectionToggle();
window.addEventListener('storage', event => {
  if (event.key === `dream_team_lady_connected_${activeProfileId}`) updateWorkspaceConnectionToggle();
});
loadWorkspace();
