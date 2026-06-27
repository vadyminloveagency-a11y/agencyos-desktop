let allMen = [];
let activeNoteId = null;
let activeNoteSource = 'men';
let activeProfileId = localStorage.getItem('dream_crm_profile_id') || '';
let currentUser = null;
let availableProfiles = [];
let managedProfiles = [];
let managedUsers = [];
let agencyProfiles = [];
let agencyUsers = [];
let pendingAgencyProfileChoicePanel = '';
const profileConnectingIds = new Set();
const AGENCY_PANEL_KEY = 'agencyos_active_panel';
const AGENCY_ACCOUNT_TAB_KEY = 'agencyos_account_tab';
const REMEMBER_ACCESS_KEY = 'agencyos_remember_access';
const savedAgencyAccountTab = localStorage.getItem(AGENCY_ACCOUNT_TAB_KEY);
let agencyAccountTab = ['ladies', 'operators', 'salary', 'agency-admin'].includes(savedAgencyAccountTab) ? savedAgencyAccountTab : 'ladies';
const resolvingProfiles = new Set();
let onlineRefreshInProgress = false;
let onlineOnly = false;
let chatFavoriteMen = [];
const adminPanelRouteRequested = () => new URLSearchParams(window.location.search).get('adminPanel') === '1';
let currentView = adminPanelRouteRequested()
  ? 'adminPanel'
  : ['chat', 'workspace', 'stats', 'adminPanel', 'settings', 'mandarinHome'].includes(localStorage.getItem('dream_crm_view')) ? localStorage.getItem('dream_crm_view') : 'favorites';
let chatFavoriteRefreshInProgress = false;
let chatIgnoreRefreshInProgress = false;
let scanIsRunning = false;
let activeSyncMode = '';
let pendingSyncMode = '';
let syncDotsTimer = null;
let syncDotsCount = 0;
let ladyConnected = Boolean(activeProfileId) && localStorage.getItem(`dream_team_lady_connected_${activeProfileId}`) === '1';
let ladyDisconnectInProgress = false;
let profileChoiceConnecting = false;
const AGENCY_DESKTOP_CLIENT = Boolean(window.agencyElectron) || /Electron/i.test(navigator.userAgent || '');
document.body.classList.toggle('agency-desktop-app', AGENCY_DESKTOP_CLIENT);
document.body.classList.toggle('agency-web-client', !AGENCY_DESKTOP_CLIENT);
if (!ladyConnected && !['stats', 'adminPanel', 'settings'].includes(currentView)) {
  currentView = 'workspace';
  localStorage.setItem('dream_crm_view', 'workspace');
}
let autoOnlineRefreshProfileId = '';
let autoOnlineRefreshTimer = null;
let autoChatOnlineRefreshProfileId = '';
let autoChatIgnoreRefreshKey = '';
let mainVirtualRows = [];
let mainVirtualPrefix = [0];
let mainVirtualTotalHeight = 0;
let mainVirtualWindowKey = '';
let mainVirtualFrame = null;
let favoritesVirtualRows = [];
let favoritesVirtualPrefix = [0];
let favoritesVirtualTotalHeight = 0;
let favoritesVirtualWindowKey = '';
let favoritesVirtualFrame = null;
let chatVirtualRows = [];
let chatVirtualPrefix = [0];
let chatVirtualTotalHeight = 0;
let chatVirtualWindowKey = '';
let chatVirtualFrame = null;
let activeFloatingTypeShell = null;
let favoritesMainPage = 1;
let favoritesImportantPage = 1;
let chatFavoritesPage = 1;
const LIST_PAGE_SIZE = 20;
const GLOBAL_THEME_KEY = 'dream_global_theme';

try {
  window.history.replaceState({ agencyos: true }, '', window.location.href);
  window.history.pushState({ agencyosGuard: true }, '', window.location.href);
} catch {}

window.addEventListener('popstate', () => {
  try {
    window.history.pushState({ agencyosGuard: true }, '', window.location.href);
  } catch {}
  if (document.body.classList.contains('mandarin-home-active') && typeof activateAgencyPanel === 'function') {
    activateAgencyPanel('home', { persist: false });
  }
});

function getSavedGlobalTheme() {
  const legacyWorkspaceTheme = localStorage.getItem('dream_workspace_theme');
  const saved = localStorage.getItem(GLOBAL_THEME_KEY) || legacyWorkspaceTheme || 'light';
  if (!localStorage.getItem(GLOBAL_THEME_KEY)) localStorage.setItem(GLOBAL_THEME_KEY, saved);
  return saved === 'dark' ? 'dark' : 'light';
}

function applyGlobalTheme(theme) {
  const dark = theme === 'dark';
  document.body.classList.toggle('app-dark-theme', dark);
  document.body.classList.toggle('app-light-theme', !dark);
  const toggle = document.getElementById('globalThemeToggle');
  if (toggle) {
    toggle.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    toggle.setAttribute('title', dark ? 'Switch to light theme' : 'Switch to dark theme');
    const label = toggle.querySelector('.global-theme-label');
    if (label) label.textContent = dark ? 'Light' : 'Dark';
  }
}

function installGlobalThemeToggle() {
  applyGlobalTheme(getSavedGlobalTheme());
  const toggle = document.getElementById('globalThemeToggle');
  const switchTheme = () => {
    const next = document.body.classList.contains('app-dark-theme') ? 'light' : 'dark';
    localStorage.setItem(GLOBAL_THEME_KEY, next);
    applyGlobalTheme(next);
  };
  if (toggle) toggle.onclick = switchTheme;
  window.addEventListener('storage', event => {
    if (event.key === GLOBAL_THEME_KEY) applyGlobalTheme(event.newValue === 'dark' ? 'dark' : 'light');
  });
}

function installAgencyRuntimeStyles() {
  if (document.getElementById('agencyRuntimeStyles')) return;
  const style = document.createElement('style');
  style.id = 'agencyRuntimeStyles';
  style.textContent = `
    body.mandarin-home-active { margin:0!important; min-height:100vh!important; overflow:hidden!important; background:#151311!important; }
    body.agency-desktop-app.mandarin-home-active .agency-shell-nav-item[data-agency-view="account-manager"],
    body.agency-desktop-app.mandarin-home-active .agency-account-manager[data-agency-panel="account-manager"] { display:none!important; }
    body.web-admin-user.mandarin-home-active .agency-shell-nav-item[data-director-hidden="true"],
    body.web-admin-user.mandarin-home-active #sidebarProfileDock,
    body.web-admin-user.mandarin-home-active .agency-shell-working-lady { display:none!important; }
    body.mandarin-home-active .app-layout,
    body.mandarin-home-active:not(.agency-profile-choice-modal) .profile-choice-screen,
    body.mandarin-home-active .activation-screen,
    body.mandarin-home-active .admin-modal,
    body.mandarin-home-active .lady-connection-gate,
    body.mandarin-home-active:not(.agency-profile-connecting) .lady-connecting-screen { display:none!important; }
    body.mandarin-home-active #globalThemeToggle.global-theme-toggle { display:inline-flex!important; align-items:center!important; justify-content:center!important; gap:8px!important; min-width:96px!important; width:auto!important; height:44px!important; padding:0 15px!important; border-radius:999px!important; font-family:Montserrat,Arial,sans-serif!important; font-size:13px!important; font-weight:800!important; visibility:visible!important; opacity:1!important; position:fixed!important; right:22px!important; bottom:22px!important; z-index:2147483647!important; pointer-events:auto!important; }
    body.mandarin-home-active #globalThemeToggle.global-theme-toggle .global-theme-label { display:inline-block!important; color:currentColor!important; letter-spacing:0!important; }
    body.mandarin-home-active .mandarin-home-screen { display:grid!important; position:fixed!important; inset:0!important; z-index:1000!important; grid-template-columns:212px minmax(0,1fr)!important; background:#151311!important; color:#f5eee9!important; font-family:Montserrat,Arial,sans-serif!important; }
    body.mandarin-home-active.agency-shell-collapsed .mandarin-home-screen { grid-template-columns:68px minmax(0,1fr)!important; }
    body.mandarin-home-active .agency-shell-sidebar,
    body.mandarin-home-active:not(.app-dark-theme) .agency-shell-sidebar,
    body.mandarin-home-active.app-dark-theme .agency-shell-sidebar { min-height:100vh!important; background:#080807!important; color:#f5eee9!important; border-right:1px solid #24211f!important; }
    body.mandarin-home-active .agency-shell-main,
    body.mandarin-home-active .agency-account-manager { min-height:100vh!important; background:#151311!important; color:#f5eee9!important; }
    body.mandarin-home-active .agency-account-manager { padding:24px 28px!important; box-sizing:border-box!important; }
    body.mandarin-home-active .agency-shell-brand,
    body.mandarin-home-active:not(.app-dark-theme) .agency-shell-brand,
    body.mandarin-home-active.app-dark-theme .agency-shell-brand,
    body.mandarin-home-active .agency-shell-user,
    body.mandarin-home-active:not(.app-dark-theme) .agency-shell-user,
    body.mandarin-home-active.app-dark-theme .agency-shell-user { color:#fff!important; border-color:#24211f!important; }
    body.mandarin-home-active .agency-shell-nav-label,
    body.mandarin-home-active:not(.app-dark-theme) .agency-shell-nav-label,
    body.mandarin-home-active.app-dark-theme .agency-shell-nav-label,
    body.mandarin-home-active .agency-shell-user-copy span,
    body.mandarin-home-active:not(.app-dark-theme) .agency-shell-user-copy span,
    body.mandarin-home-active.app-dark-theme .agency-shell-user-copy span { color:#b9aaa0!important; opacity:1!important; }
    body.mandarin-home-active .agency-shell-nav-item,
    body.mandarin-home-active:not(.app-dark-theme) .agency-shell-nav-item,
    body.mandarin-home-active.app-dark-theme .agency-shell-nav-item { color:#d8cec6!important; opacity:1!important; }
    body.mandarin-home-active .agency-shell-nav-item:hover,
    body.mandarin-home-active:not(.app-dark-theme) .agency-shell-nav-item:hover,
    body.mandarin-home-active.app-dark-theme .agency-shell-nav-item:hover,
    body.mandarin-home-active .agency-shell-nav-item.active,
    body.mandarin-home-active:not(.app-dark-theme) .agency-shell-nav-item.active,
    body.mandarin-home-active.app-dark-theme .agency-shell-nav-item.active { background:#2b211d!important; color:#fff!important; }
    body.mandarin-home-active .agency-shell-nav-icon,
    body.mandarin-home-active:not(.app-dark-theme) .agency-shell-nav-icon,
    body.mandarin-home-active.app-dark-theme .agency-shell-nav-icon { width:17px!important; height:17px!important; color:#d1785f!important; font-size:0!important; }
    body.mandarin-home-active .agency-shell-nav-icon svg,
    body.mandarin-home-active:not(.app-dark-theme) .agency-shell-nav-icon svg,
    body.mandarin-home-active.app-dark-theme .agency-shell-nav-icon svg { width:17px!important; height:17px!important; display:block!important; stroke:currentColor!important; stroke-width:1.8!important; fill:none!important; }
    body.mandarin-home-active .agency-shell-nav-icon-inbox svg,
    body.mandarin-home-active .agency-shell-nav-icon-favorites svg { width:18px!important; height:18px!important; stroke-width:1.9!important; }
    body.mandarin-home-active .agency-inbox-panel { min-height:100vh!important; padding:0!important; box-sizing:border-box!important; background:#151311!important; overflow:hidden!important; }
    body.mandarin-home-active .agency-inbox-frame { width:100%!important; height:100%!important; display:block!important; border:0!important; border-radius:0!important; background:#1b1816!important; box-shadow:none!important; }
    body.mandarin-home-active .agency-favorites-panel { min-height:100vh!important; padding:18px 22px!important; box-sizing:border-box!important; background:#151311!important; color:#f5eee9!important; overflow:hidden!important; }
    body.mandarin-home-active .agency-favorites-panel,
    body.mandarin-home-active .agency-favorites-panel * { transition-property:none!important; }
    body.mandarin-home-active .agency-favorites-content { height:calc(100vh - 36px)!important; display:grid!important; grid-template-rows:48px minmax(0,1fr)!important; gap:14px!important; }
    body.mandarin-home-active .agency-favorites-panel.is-locked .agency-favorites-content { display:none!important; }
    body.mandarin-home-active .agency-favorites-toolbar { display:flex!important; align-items:center!important; justify-content:space-between!important; gap:14px!important; }
    body.mandarin-home-active .agency-favorites-search { width:min(430px,100%)!important; height:44px!important; }
    body.mandarin-home-active .agency-favorites-refresh { height:44px!important; min-width:116px!important; background:#1b1816!important; border-color:#3a312a!important; color:#f5eee9!important; }
    body.mandarin-home-active .agency-favorites-refresh:hover { border-color:#d1785f!important; background:#2b211d!important; }
    body.mandarin-home-active .agency-favorites-mount { min-height:0!important; overflow:hidden!important; }
    body.mandarin-home-active .agency-favorites-mount #favoritesView { width:100%!important; height:100%!important; min-height:0!important; display:flex!important; flex-direction:column!important; gap:12px!important; padding:0!important; margin:0!important; background:transparent!important; overflow:hidden!important; }
    body.mandarin-home-active .agency-favorites-mount #favoritesBlock { flex:0 0 auto!important; margin:0!important; }
    body.mandarin-home-active .agency-favorites-mount #favoritesView .table-card,
    body.mandarin-home-active .agency-favorites-mount #chatFavoritesView .chat-favorites-table-wrap { flex:1 1 0!important; height:auto!important; min-height:0!important; max-height:none!important; overflow-y:auto!important; overflow-x:hidden!important; overscroll-behavior:contain!important; margin:0!important; border-radius:12px!important; scrollbar-width:thin!important; scrollbar-color:#d1785f #f4ebe6!important; }
    body.mandarin-home-active.app-dark-theme .agency-favorites-mount #favoritesView .table-card,
    body.mandarin-home-active.app-dark-theme .agency-favorites-mount #chatFavoritesView .chat-favorites-table-wrap { scrollbar-color:#d1785f #1b1816!important; }
    body.mandarin-home-active .agency-favorites-mount #favoritesView .table-card::-webkit-scrollbar,
    body.mandarin-home-active .agency-favorites-mount #chatFavoritesView .chat-favorites-table-wrap::-webkit-scrollbar { width:7px!important; height:7px!important; }
    body.mandarin-home-active .agency-favorites-mount #favoritesView .table-card::-webkit-scrollbar-track,
    body.mandarin-home-active .agency-favorites-mount #chatFavoritesView .chat-favorites-table-wrap::-webkit-scrollbar-track { background:#f4ebe6!important; border-radius:999px!important; }
    body.mandarin-home-active.app-dark-theme .agency-favorites-mount #favoritesView .table-card::-webkit-scrollbar-track,
    body.mandarin-home-active.app-dark-theme .agency-favorites-mount #chatFavoritesView .chat-favorites-table-wrap::-webkit-scrollbar-track { background:#1b1816!important; }
    body.mandarin-home-active .agency-favorites-mount #favoritesView .table-card::-webkit-scrollbar-thumb,
    body.mandarin-home-active .agency-favorites-mount #chatFavoritesView .chat-favorites-table-wrap::-webkit-scrollbar-thumb { background:#d1785f!important; border-radius:999px!important; }
    body.mandarin-home-active .agency-favorites-mount #favoritesView .favorites-list { max-height:min(360px,38vh)!important; min-height:0!important; overflow-y:auto!important; overflow-x:hidden!important; scrollbar-width:thin!important; scrollbar-color:#d1785f #f4ebe6!important; }
    body.mandarin-home-active .agency-favorites-mount #favoritesView .table-card tbody tr.virtual-spacer,
    body.mandarin-home-active .agency-favorites-mount #favoritesView .table-card tbody tr.virtual-spacer td,
    body.mandarin-home-active .agency-favorites-mount #favoritesView .favorites-list tbody tr.virtual-spacer,
    body.mandarin-home-active .agency-favorites-mount #favoritesView .favorites-list tbody tr.virtual-spacer td { height:var(--spacer-height)!important; min-height:var(--spacer-height)!important; max-height:var(--spacer-height)!important; padding:0!important; border:0!important; background:transparent!important; pointer-events:none!important; }
    body.mandarin-home-active .agency-favorites-panel { height:100vh!important; min-height:0!important; overflow:hidden!important; }
    body.mandarin-home-active .agency-favorites-content { height:calc(100vh - 36px)!important; min-height:0!important; overflow:hidden!important; }
    body.mandarin-home-active .agency-favorites-mount:not(.hidden) { height:100%!important; min-height:0!important; overflow:hidden!important; }
    body.mandarin-home-active .agency-favorites-mount #favoritesView { height:100%!important; min-height:0!important; display:flex!important; flex-direction:column!important; overflow:hidden!important; }
    body.mandarin-home-active .agency-favorites-mount #favoritesView .table-card { flex:0 1 auto!important; height:calc(100vh - 132px)!important; max-height:calc(100vh - 132px)!important; min-height:220px!important; overflow-y:scroll!important; overflow-x:hidden!important; overscroll-behavior:contain!important; }
    body.mandarin-home-active .agency-favorites-mount #favoritesView .table-card table { margin:0!important; }
    body.mandarin-home-active .agency-inbox-no-access { min-height:calc(100vh - 32px)!important; display:grid!important; place-items:center!important; padding:24px!important; box-sizing:border-box!important; }
    body.mandarin-home-active .agency-inbox-no-access.hidden { display:none!important; }
    body.mandarin-home-active .agency-inbox-no-access > div:not(.agency-inbox-no-access-icon) { display:none!important; }
    body.mandarin-home-active .agency-inbox-no-access { align-content:center!important; justify-items:center!important; gap:12px!important; border:1px solid #3a312a!important; border-radius:12px!important; background:#1b1816!important; box-shadow:0 18px 42px rgba(0,0,0,.24)!important; text-align:center!important; }
    body.mandarin-home-active .agency-inbox-no-access-icon { width:52px!important; height:52px!important; display:grid!important; place-items:center!important; border-radius:14px!important; background:#2b211d!important; color:#d1785f!important; }
    body.mandarin-home-active .agency-inbox-no-access-icon svg { width:28px!important; height:28px!important; stroke:currentColor!important; }
    body.mandarin-home-active .agency-inbox-no-access strong { max-width:420px!important; color:#f5eee9!important; font-size:20px!important; font-weight:900!important; line-height:1.2!important; }
    body.mandarin-home-active .agency-inbox-no-access span { max-width:420px!important; color:#b9aaa0!important; font-size:13px!important; font-weight:600!important; line-height:1.45!important; }
    body.mandarin-home-active .agency-section-authorize-btn { height:40px!important; margin-top:4px!important; padding:0 18px!important; border:1px solid #d1785f!important; border-radius:8px!important; background:#d1785f!important; color:#fff!important; font-family:Montserrat,Arial,sans-serif!important; font-size:13px!important; font-weight:900!important; cursor:pointer!important; box-shadow:none!important; }
    body.mandarin-home-active .agency-section-authorize-btn:hover { background:#c76951!important; border-color:#c76951!important; }
    body.mandarin-home-active .agency-section-authorize-btn.hidden { display:none!important; }
    body.mandarin-home-active .agency-inbox-panel.is-locked .agency-inbox-frame { display:none!important; }
    body.mandarin-home-active .agency-dashboard-panel { min-height:100vh!important; padding:24px 28px!important; box-sizing:border-box!important; background:#151311!important; }
    body.mandarin-home-active.agency-dashboard-active,
    body.mandarin-home-active.agency-dashboard-active .mandarin-home-screen,
    body.mandarin-home-active.agency-dashboard-active .agency-shell-main,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-panel,
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-panel { background:#071d29!important; color:#9bdcff!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-panel { padding:8px 18px!important; overflow:hidden!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-toolbar { height:68px!important; display:grid!important; grid-template-columns:290px 170px minmax(0,1fr)!important; gap:10px!important; align-items:center!important; margin:0 0 6px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-search { height:52px!important; display:grid!important; grid-template-columns:34px minmax(0,1fr) 42px!important; align-items:center!important; gap:10px!important; padding:0 12px!important; border:0!important; border-radius:8px!important; background:#0d2a3b!important; color:#9bdcff!important; box-sizing:border-box!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-search span { color:#9bdcff!important; font-size:25px!important; line-height:1!important; transform:translateY(-1px)!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-search input { height:42px!important; border:0!important; outline:0!important; background:transparent!important; color:#c6efff!important; font-family:Montserrat,Arial,sans-serif!important; font-size:14px!important; font-weight:600!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-search input::placeholder { color:#86aec2!important; opacity:1!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-search b { width:38px!important; height:32px!important; display:grid!important; place-items:center!important; border-radius:7px!important; background:#174966!important; color:#bdeeff!important; font-size:13px!important; font-weight:800!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-year { width:100%!important; height:52px!important; padding:0 24px!important; border:0!important; border-radius:8px!important; background:#0d2a3b!important; color:#6fa9c7!important; font-family:Montserrat,Arial,sans-serif!important; font-size:20px!important; font-weight:800!important; outline:0!important; appearance:auto!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-months { height:52px!important; display:grid!important; grid-template-columns:repeat(12,minmax(54px,1fr))!important; gap:6px!important; padding:6px!important; border:0!important; border-radius:8px!important; background:#0d2a3b!important; box-sizing:border-box!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-month { height:40px!important; border:0!important; border-radius:8px!important; background:transparent!important; color:#6fa9c7!important; font-family:Montserrat,Arial,sans-serif!important; font-size:16px!important; font-weight:800!important; cursor:pointer!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-month.active,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-month:hover { background:#1b4b68!important; color:#bdeeff!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-status { min-height:0!important; height:0!important; overflow:hidden!important; color:#9bdcff!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-list { max-height:calc(100vh - 82px)!important; overflow:auto!important; border-radius:0!important; background:#0b2534!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table { width:100%!important; table-layout:fixed!important; border-collapse:separate!important; border-spacing:0!important; color:#9bdcff!important; font-family:Montserrat,Arial,sans-serif!important; font-size:13px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th { height:44px!important; padding:0 12px!important; border:0!important; border-right:2px solid #082131!important; border-bottom:2px solid #082131!important; background:#102f42!important; color:#9bdcff!important; text-align:center!important; font-size:12px!important; font-weight:800!important; text-transform:none!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table td { height:82px!important; padding:0 12px!important; border:0!important; border-right:2px solid #082131!important; border-bottom:2px solid #082131!important; background:#102f42!important; color:#9bdcff!important; text-align:center!important; font-size:14px!important; font-weight:600!important; vertical-align:middle!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table tbody tr:hover td { background:#153a50!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th:nth-child(1),
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table td:nth-child(1) { width:54px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th:nth-child(2),
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table td:nth-child(2) { width:210px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th:nth-child(5),
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table td:nth-child(5) { width:100px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-badge { min-width:150px!important; height:44px!important; display:inline-grid!important; place-items:center!important; border-radius:8px!important; background:#173f59!important; color:#9bdcff!important; font-size:14px!important; font-weight:900!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table b { display:inline-grid!important; place-items:center!important; min-width:90px!important; min-height:40px!important; padding:0 10px!important; border-radius:8px!important; background:#173f59!important; color:#9bdcff!important; font-size:15px!important; font-weight:900!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-empty { padding:30px!important; color:#7db6d0!important; text-align:center!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-calendar { width:calc(100vw - 320px)!important; max-width:1460px!important; height:calc(100vh - 118px)!important; margin:0 auto!important; padding:16px!important; border-radius:14px!important; background:#102f42!important; box-sizing:border-box!important; overflow:hidden!important; }
    body.mandarin-home-active.agency-shell-collapsed.agency-dashboard-active .agency-dashboard-calendar { width:calc(100vw - 170px)!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-calendar-head { height:44px!important; display:flex!important; align-items:center!important; gap:14px!important; margin:0 0 10px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-calendar-head strong { display:block!important; color:#c8efff!important; font-size:18px!important; font-weight:900!important; line-height:1.2!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-calendar-head span { display:block!important; color:#77b5cf!important; font-size:12px!important; font-weight:800!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-back { height:36px!important; padding:0 16px!important; border:0!important; border-radius:8px!important; background:#0b2534!important; color:#c8efff!important; font-family:Montserrat,Arial,sans-serif!important; font-weight:900!important; cursor:pointer!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-calendar-shell { display:grid!important; grid-template-columns:minmax(640px,0.95fr) minmax(440px,0.75fr)!important; gap:14px!important; height:calc(100% - 54px)!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-calendar-grid { display:grid!important; grid-template-columns:repeat(7,1fr)!important; gap:4px!important; height:calc(100% - 62px)!important; padding:8px!important; border-radius:12px!important; background:#0b2534!important; box-sizing:border-box!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-weekday { min-height:42px!important; display:grid!important; place-items:center!important; border-radius:5px!important; background:#13374b!important; color:#86cdea!important; font-size:16px!important; font-weight:900!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-calendar-empty,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-day { min-height:72px!important; border:0!important; border-radius:5px!important; background:#102f42!important; color:#7eabc0!important; font-family:Montserrat,Arial,sans-serif!important; font-weight:900!important; box-sizing:border-box!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-day { display:grid!important; align-content:center!important; gap:8px!important; padding:8px!important; text-align:left!important; cursor:pointer!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-day span { font-size:18px!important; line-height:1!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-day b { display:block!important; min-width:0!important; min-height:30px!important; padding:0 8px!important; border-radius:5px!important; background:#1b4054!important; color:#94d7ff!important; text-align:right!important; font-size:12px!important; line-height:30px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-day.selected,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-day:hover { background:#1b4b68!important; color:#bdf1ff!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-total { height:52px!important; display:flex!important; align-items:center!important; gap:18px!important; margin:10px 0 0!important; padding:0 12px!important; border-top:1px solid #1f4b62!important; color:#bdf1ff!important; font-size:18px!important; font-weight:900!important; box-sizing:border-box!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-total b { display:inline-grid!important; place-items:center!important; min-width:126px!important; height:36px!important; border-radius:8px!important; background:#173f59!important; color:#bdf1ff!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-day-list { height:100%!important; max-height:none!important; overflow:auto!important; padding:8px!important; border-left:2px solid #1f4b62!important; border-radius:12px!important; background:#0b2534!important; box-sizing:border-box!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-day-list-head { height:42px!important; display:flex!important; align-items:center!important; justify-content:space-between!important; padding:0 4px!important; color:#c8efff!important; font-weight:900!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-day-list-head span { color:#77b5cf!important; font-size:12px!important; font-weight:800!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-profile-row { min-height:48px!important; display:grid!important; grid-template-columns:42px 42px minmax(0,1fr) 112px!important; align-items:center!important; gap:8px!important; padding:0 10px!important; border-bottom:2px solid #082131!important; border-radius:6px!important; background:#102f42!important; color:#9bdcff!important; box-sizing:border-box!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-profile-photo { width:34px!important; height:34px!important; display:grid!important; place-items:center!important; border-radius:8px!important; overflow:hidden!important; background:#173f59!important; color:#bdf1ff!important; font-weight:900!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-profile-photo img { width:100%!important; height:100%!important; object-fit:cover!important; display:block!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-profile-row strong,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-profile-row small { display:block!important; overflow:hidden!important; text-overflow:ellipsis!important; white-space:nowrap!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-profile-row strong { color:#bdf1ff!important; font-size:13px!important; font-weight:900!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-profile-row small { color:#77b5cf!important; font-size:10px!important; font-weight:800!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-profile-row b { color:#86cdea!important; text-align:right!important; font-size:14px!important; font-weight:900!important; }
    body.mandarin-home-active.agency-dashboard-active,
    body.mandarin-home-active.agency-dashboard-active .mandarin-home-screen,
    body.mandarin-home-active.agency-dashboard-active .agency-shell-main,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-panel,
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-panel { background:#151311!important; color:#f5eee9!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-search,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-year,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-months,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-list,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-calendar-grid,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-day-list,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-back { background:#1b1816!important; border-color:#3a312a!important; color:#f5eee9!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-search span,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-search b,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-month.active,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-month:hover,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-badge,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table b,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-day b,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-total b,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-profile-photo { background:#2b211d!important; color:#f2d1c5!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-search input,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-calendar-head strong,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-total,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-day-list-head,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-profile-row strong { color:#f5eee9!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-search input::placeholder,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-year,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-month,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-status,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-calendar-head span,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-day-list-head span,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-profile-row small,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-empty { color:#b9aaa0!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-weekday { background:#1b1816!important; color:#f5eee9!important; border-color:#2d261f!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table td,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-day,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-calendar-empty,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-profile-row { background:#201c19!important; color:#f5eee9!important; border-color:#2d261f!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table tbody tr:hover td,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-day.selected,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-day:hover { background:#2b211d!important; color:#fff!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-month.active,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-month:hover,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-day.selected { box-shadow:inset 0 0 0 1px #d1785f!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-calendar { background:#151311!important; border:1px solid #3a312a!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-day-list,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-total { border-color:#3a312a!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-profile-row b { color:#f2d1c5!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-panel { padding:10px 16px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-toolbar { height:64px!important; grid-template-columns:minmax(290px,360px) 170px minmax(650px,1fr)!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-list { max-height:calc(100vh - 84px)!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table td { height:82px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-calendar { height:calc(100vh - 110px)!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-calendar-shell { grid-template-columns:minmax(620px,0.95fr) minmax(420px,0.8fr)!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-day { min-height:70px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-profile-row { min-height:48px!important; }
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme),
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .mandarin-home-screen,
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-shell-main,
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-panel { background:#f7f1ed!important; color:#241f1b!important; }
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-search,
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-year,
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-months,
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-list,
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-calendar-grid,
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-day-list,
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-back { background:#fffdfb!important; border-color:#eadbd4!important; color:#241f1b!important; }
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-search span,
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-search b,
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-month.active,
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-month:hover,
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-badge,
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-table b,
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-day b,
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-total b,
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-profile-photo { background:#f1e5df!important; color:#8b4a38!important; }
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-search input,
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-calendar-head strong,
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-total,
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-day-list-head,
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-profile-row strong { color:#241f1b!important; }
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-search input::placeholder,
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-year,
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-month,
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-status,
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-calendar-head span,
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-day-list-head span,
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-profile-row small,
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-empty { color:#7d6f68!important; }
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-table th,
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-weekday { background:#fffdfb!important; color:#241f1b!important; border-color:#eadbd4!important; }
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-table td,
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-day,
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-calendar-empty,
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-profile-row { background:#fffaf7!important; color:#241f1b!important; border-color:#eadbd4!important; }
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-table tbody tr:hover td,
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-day.selected,
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-day:hover { background:#f1e5df!important; color:#241f1b!important; }
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-month.active,
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-month:hover,
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-day.selected { box-shadow:inset 0 0 0 1px #d1785f!important; }
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-calendar { background:#fffdfb!important; border:1px solid #eadbd4!important; }
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-day-list,
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-total { border-color:#eadbd4!important; }
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-profile-row b { color:#8b4a38!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-toolbar,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-list,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-calendar { width:min(1588px,calc(100vw - 380px))!important; margin-left:auto!important; margin-right:auto!important; }
    body.mandarin-home-active.agency-shell-collapsed.agency-dashboard-active .agency-dashboard-toolbar,
    body.mandarin-home-active.agency-shell-collapsed.agency-dashboard-active .agency-dashboard-list,
    body.mandarin-home-active.agency-shell-collapsed.agency-dashboard-active .agency-dashboard-calendar { width:min(1588px,calc(100vw - 240px))!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-list { border-radius:12px!important; overflow:auto!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table { border-radius:12px!important; overflow:hidden!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th:first-child { border-top-left-radius:12px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th:last-child { border-top-right-radius:12px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table tbody tr:last-child td:first-child { border-bottom-left-radius:12px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table tbody tr:last-child td:last-child { border-bottom-right-radius:12px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-calendar { border-radius:14px!important; }
    body.mandarin-home-active.app-light-theme.agency-dashboard-active,
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .mandarin-home-screen,
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-shell-main,
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-panel { background:#f7f1ed!important; color:#241f1b!important; }
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-search,
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-year,
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-months,
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-list,
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-calendar-grid,
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-day-list,
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-back { background:#fffdfb!important; border-color:#eadbd4!important; color:#241f1b!important; }
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-table th,
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-weekday { background:#fffdfb!important; color:#241f1b!important; border-color:#eadbd4!important; }
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-table td,
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-day,
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-calendar-empty,
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-profile-row { background:#fffaf7!important; color:#241f1b!important; border-color:#eadbd4!important; }
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-search span,
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-search b,
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-month.active,
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-month:hover,
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-badge,
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-table b,
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-day b,
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-total b,
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-profile-photo { background:#f1e5df!important; color:#8b4a38!important; }
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-search input,
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-calendar-head strong,
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-total,
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-day-list-head,
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-profile-row strong { color:#241f1b!important; }
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-search input::placeholder,
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-year,
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-month,
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-status,
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-calendar-head span,
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-day-list-head span,
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-profile-row small,
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-empty { color:#7d6f68!important; }
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-table tbody tr:hover td,
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-day.selected,
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-day:hover { background:#f1e5df!important; color:#241f1b!important; }
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-calendar { background:#fffdfb!important; border-color:#eadbd4!important; }
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-day-list,
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-total { border-color:#eadbd4!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open::before { content:""!important; position:fixed!important; inset:0!important; z-index:1800!important; background:rgba(14,10,8,.52)!important; backdrop-filter:blur(4px)!important; pointer-events:auto!important; }
    body.mandarin-home-active.app-light-theme.agency-dashboard-calendar-open::before { background:rgba(36,31,27,.24)!important; backdrop-filter:blur(3px)!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-calendar { position:fixed!important; left:50%!important; top:50%!important; transform:translate(-50%,-50%)!important; z-index:1801!important; width:min(1280px,calc(100vw - 230px))!important; height:min(720px,calc(100vh - 120px))!important; min-height:0!important; max-height:none!important; margin:0!important; padding:8px!important; border-radius:14px!important; box-shadow:0 24px 80px rgba(0,0,0,.26)!important; }
    body.mandarin-home-active.agency-shell-collapsed.agency-dashboard-calendar-open .agency-dashboard-calendar { width:min(1280px,calc(100vw - 110px))!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-calendar-controls { height:58px!important; display:grid!important; grid-template-columns:118px minmax(0,1fr)!important; gap:8px!important; margin:0 0 8px!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-calendar-controls .agency-dashboard-year { height:58px!important; border-radius:9px!important; font-size:18px!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-calendar-controls .agency-dashboard-months { height:58px!important; grid-template-columns:repeat(12,minmax(48px,1fr))!important; padding:6px!important; border-radius:9px!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-calendar-controls .agency-dashboard-month { height:46px!important; font-size:14px!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-calendar-head { height:34px!important; margin:0 0 6px!important; padding-left:12px!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-calendar-shell { height:calc(100% - 106px)!important; grid-template-columns:minmax(540px,.92fr) minmax(390px,.72fr)!important; gap:10px!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-calendar-grid { height:calc(100% - 46px)!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open::before { background:rgba(14,10,8,.42)!important; backdrop-filter:blur(9px)!important; -webkit-backdrop-filter:blur(9px)!important; }
    body.mandarin-home-active.app-light-theme.agency-dashboard-calendar-open::before { background:rgba(36,31,27,.18)!important; backdrop-filter:blur(9px)!important; -webkit-backdrop-filter:blur(9px)!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-calendar-controls { display:none!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-calendar { width:min(1120px,calc(100vw - 310px))!important; height:min(610px,calc(100vh - 150px))!important; padding:12px!important; }
    body.mandarin-home-active.agency-shell-collapsed.agency-dashboard-calendar-open .agency-dashboard-calendar { width:min(1120px,calc(100vw - 170px))!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-calendar-head { height:44px!important; margin:0 0 4px!important; padding-left:8px!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-calendar-shell { height:calc(100% - 48px)!important; grid-template-columns:minmax(470px,.9fr) minmax(330px,.72fr)!important; gap:10px!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-calendar-grid { height:calc(100% - 42px)!important; padding:5px!important; gap:2px!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-weekday { min-height:30px!important; font-size:12px!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-day,
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-calendar-empty { min-height:46px!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-day { gap:4px!important; padding:6px!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-day span { font-size:12px!important; font-weight:800!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-day b { min-height:20px!important; line-height:20px!important; font-size:10px!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-total { height:38px!important; justify-content:center!important; margin-top:5px!important; padding:0!important; font-size:14px!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-total b { min-width:108px!important; height:30px!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-day-list { padding:6px!important; }
    body.mandarin-home-active.app-light-theme.agency-dashboard-calendar-open .agency-dashboard-calendar { background:#f7eee9!important; border-color:#dcc8bf!important; }
    body.mandarin-home-active.app-light-theme.agency-dashboard-calendar-open .agency-dashboard-calendar-grid,
    body.mandarin-home-active.app-light-theme.agency-dashboard-calendar-open .agency-dashboard-day-list { background:#fff8f4!important; border-color:#dcc8bf!important; }
    body.mandarin-home-active.app-light-theme.agency-dashboard-calendar-open .agency-dashboard-weekday { background:#f0e1da!important; border-color:#e1cec4!important; color:#241f1b!important; }
    body.mandarin-home-active.app-light-theme.agency-dashboard-calendar-open .agency-dashboard-day { background:#fff4ef!important; border-color:#ead7ce!important; color:#241f1b!important; }
    body.mandarin-home-active.app-light-theme.agency-dashboard-calendar-open .agency-dashboard-calendar-empty { background:#fbf1ec!important; border-color:#efe0d9!important; }
    body.mandarin-home-active.app-light-theme.agency-dashboard-calendar-open .agency-dashboard-day b { background:#e5d3ca!important; color:#7c3f30!important; }
    body.mandarin-home-active.app-light-theme.agency-dashboard-calendar-open .agency-dashboard-day.selected,
    body.mandarin-home-active.app-light-theme.agency-dashboard-calendar-open .agency-dashboard-day:hover { background:#eadbd4!important; border-color:#d1785f!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open::before { background:rgba(14,10,8,.36)!important; backdrop-filter:blur(5px)!important; -webkit-backdrop-filter:blur(5px)!important; }
    body.mandarin-home-active.app-light-theme.agency-dashboard-calendar-open::before { background:rgba(36,31,27,.18)!important; backdrop-filter:blur(5px)!important; -webkit-backdrop-filter:blur(5px)!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-calendar,
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-calendar * { filter:none!important; opacity:1!important; text-shadow:none!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open::before { z-index:2147482000!important; background:rgba(14,10,8,.30)!important; backdrop-filter:blur(4px)!important; -webkit-backdrop-filter:blur(4px)!important; }
    body.mandarin-home-active.app-light-theme.agency-dashboard-calendar-open::before { background:rgba(34,29,25,.16)!important; backdrop-filter:blur(4px)!important; -webkit-backdrop-filter:blur(4px)!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-calendar { z-index:2147483000!important; pointer-events:auto!important; }
    body.mandarin-home-active.app-light-theme.agency-dashboard-calendar-open .agency-dashboard-day { background:#fbf1ec!important; border-color:#e1cec4!important; color:#211b18!important; }
    body.mandarin-home-active.app-light-theme.agency-dashboard-calendar-open .agency-dashboard-calendar-empty { background:#f6ebe5!important; border-color:#ead8d0!important; }
    body.mandarin-home-active.app-light-theme.agency-dashboard-calendar-open .agency-dashboard-day.selected { background:#eadbd4!important; border-color:#c96f58!important; box-shadow:inset 0 0 0 1px rgba(201,111,88,.18)!important; }
    body.mandarin-home-active.app-light-theme.agency-dashboard-calendar-open .agency-dashboard-day:hover { background:#f0e2dc!important; border-color:#d7b5a9!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-day-list,
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-total { position:relative!important; z-index:1!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open::before { display:none!important; backdrop-filter:none!important; -webkit-backdrop-filter:none!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-shell-sidebar,
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-toolbar,
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-list { filter:blur(5px)!important; opacity:.58!important; pointer-events:none!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-panel { position:relative!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-panel::before { content:""!important; position:fixed!important; inset:0!important; z-index:1500!important; background:rgba(24,19,16,.22)!important; pointer-events:none!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-calendar,
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-calendar * { filter:none!important; opacity:1!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-calendar { z-index:1801!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-toolbar,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-list,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-calendar { width:min(1508px,calc(100vw - 430px))!important; }
    body.mandarin-home-active.agency-shell-collapsed.agency-dashboard-active .agency-dashboard-toolbar,
    body.mandarin-home-active.agency-shell-collapsed.agency-dashboard-active .agency-dashboard-list,
    body.mandarin-home-active.agency-shell-collapsed.agency-dashboard-active .agency-dashboard-calendar { width:min(1508px,calc(100vw - 290px))!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-toolbar { height:58px!important; grid-template-columns:270px 154px minmax(610px,1fr)!important; gap:8px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-search,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-year,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-months { height:46px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-search { grid-template-columns:30px minmax(0,1fr) 36px!important; padding:0 10px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-search span { font-size:20px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-search b { width:34px!important; height:28px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-year { padding:0 18px!important; font-size:18px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-months { padding:5px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-month { height:36px!important; font-size:14px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-list { max-height:calc(100vh - 76px)!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table { table-layout:fixed!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table td { padding:0 10px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table tbody tr:hover td { background:#241f1b!important; color:#f5eee9!important; }
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-table tbody tr:hover td { background:#fff3ef!important; color:#241f1b!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th:nth-child(1),
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table td:nth-child(1) { width:54px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th:nth-child(2),
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table td:nth-child(2) { width:220px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th:nth-child(3),
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table td:nth-child(3) { width:180px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th:nth-child(4),
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table td:nth-child(4) { width:190px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th:nth-child(5),
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table td:nth-child(5) { width:90px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th:nth-child(6),
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table td:nth-child(6),
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th:nth-child(7),
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table td:nth-child(7),
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th:nth-child(8),
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table td:nth-child(8) { width:128px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table td:nth-child(3),
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table td:nth-child(4) { overflow:hidden!important; text-overflow:ellipsis!important; white-space:nowrap!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-badge { width:auto!important; min-width:0!important; height:auto!important; padding:0!important; background:transparent!important; color:#f2d1c5!important; font-size:13px!important; font-weight:900!important; }
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-badge { background:transparent!important; color:#8b4a38!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table b { width:82px!important; min-width:82px!important; min-height:36px!important; padding:0!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-calendar { width:min(1508px,calc(100vw - 430px))!important; height:calc(100vh - 156px)!important; padding:14px!important; }
    body.mandarin-home-active.agency-shell-collapsed.agency-dashboard-active .agency-dashboard-calendar { width:min(1508px,calc(100vw - 290px))!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-calendar-head { height:38px!important; margin:0 0 8px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-calendar-shell { height:calc(100% - 46px)!important; grid-template-columns:minmax(520px,0.9fr) minmax(380px,0.78fr)!important; gap:12px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-calendar-grid { height:calc(100% - 54px)!important; gap:3px!important; padding:6px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-weekday { min-height:34px!important; font-size:13px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-day,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-calendar-empty { min-height:56px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-day span { font-size:14px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-day b { min-height:24px!important; line-height:24px!important; font-size:11px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-total { height:44px!important; margin-top:8px!important; font-size:15px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-total b { height:32px!important; min-width:112px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-day-list { border-left:1px solid #3a312a!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-calendar { width:min(1280px,calc(100vw - 430px))!important; height:calc(100vh - 188px)!important; min-height:610px!important; max-height:760px!important; padding:14px!important; margin-top:0!important; }
    body.mandarin-home-active.agency-shell-collapsed.agency-dashboard-active .agency-dashboard-calendar { width:min(1280px,calc(100vw - 290px))!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-calendar-shell { grid-template-columns:minmax(540px,0.94fr) minmax(360px,0.72fr)!important; gap:10px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-calendar-grid { height:calc(100% - 48px)!important; padding:6px!important; gap:3px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-day,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-calendar-empty { min-height:52px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-weekday { min-height:32px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-day-list { padding:6px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-profile-row { min-height:44px!important; grid-template-columns:36px 36px minmax(0,1fr) 96px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-profile-photo { width:30px!important; height:30px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-total { height:40px!important; margin-top:6px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-back { display:none!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-calendar-head { padding-left:10px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-day { border:1px solid #2d261f!important; background:#1c1815!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-calendar-empty { border:1px solid #221d1a!important; background:#171411!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-day.selected,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-day:hover { border-color:#5a3b31!important; background:#2b211d!important; box-shadow:none!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-day b { background:#3a2a24!important; color:#f2d1c5!important; }
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-day { border:1px solid #f0e4de!important; background:#fffaf7!important; color:#241f1b!important; }
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-calendar-empty { border:1px solid #f4ebe6!important; background:#fffdfb!important; }
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-day.selected,
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-day:hover { border-color:#e6cfc5!important; background:#f4e7e1!important; box-shadow:none!important; color:#241f1b!important; }
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-day b { background:#eadbd4!important; color:#8b4a38!important; font-weight:900!important; }
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-weekday { border:1px solid #f0e4de!important; background:#fff8f5!important; }
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-profile-row { border-bottom:1px solid #eadbd4!important; background:#fffaf7!important; }
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-day-list { border-left:1px solid #eadbd4!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-calendar { left:calc(50% + 48px)!important; width:min(1040px,calc(100vw - 320px))!important; height:min(570px,calc(100vh - 146px))!important; min-height:0!important; padding:10px!important; }
    body.mandarin-home-active.agency-shell-collapsed.agency-dashboard-calendar-open .agency-dashboard-calendar { left:calc(50% + 16px)!important; width:min(1040px,calc(100vw - 150px))!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-calendar-head { height:34px!important; margin:0 0 4px!important; padding-left:4px!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-calendar-shell { height:calc(100% - 38px)!important; grid-template-columns:520px minmax(380px,1fr)!important; gap:8px!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-calendar-grid { height:calc(100% - 40px)!important; padding:4px!important; gap:2px!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-weekday { min-height:26px!important; font-size:11px!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-day,
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-calendar-empty { min-height:42px!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-day { padding:5px!important; gap:3px!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-day span { font-size:12px!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-day b { min-height:18px!important; line-height:18px!important; font-size:10px!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-total { height:34px!important; margin-top:4px!important; font-size:13px!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-total b { height:26px!important; min-width:94px!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-day-list { padding:5px!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-profile-row { min-height:38px!important; grid-template-columns:30px 32px minmax(0,1fr) 82px!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-profile-photo { width:28px!important; height:28px!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-calendar { width:min(1120px,calc(100vw - 300px))!important; height:min(620px,calc(100vh - 132px))!important; padding:12px!important; }
    body.mandarin-home-active.agency-shell-collapsed.agency-dashboard-calendar-open .agency-dashboard-calendar { width:min(1120px,calc(100vw - 140px))!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-calendar-shell { grid-template-columns:560px minmax(410px,1fr)!important; gap:10px!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-calendar-grid { height:calc(100% - 42px)!important; padding:5px!important; gap:3px!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-weekday { min-height:28px!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-day,
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-calendar-empty { min-height:46px!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-total { height:36px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th:nth-child(2),
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table td:nth-child(2) { width:176px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th:nth-child(3),
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table td:nth-child(3) { width:170px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th:nth-child(4),
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table td:nth-child(4) { width:170px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th:nth-child(6),
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table td:nth-child(6),
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th:nth-child(7),
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table td:nth-child(7),
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th:nth-child(8),
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table td:nth-child(8) { width:118px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-toolbar { height:48px!important; grid-template-columns:154px minmax(760px,1fr)!important; gap:8px!important; margin:0 auto 10px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-year,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-months { height:42px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-year { font-size:17px!important; padding:0 16px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-months { grid-template-columns:repeat(12,minmax(62px,1fr))!important; padding:4px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-month { height:32px!important; font-size:13px!important; border-radius:8px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th { height:36px!important; padding:0 10px!important; font-size:11px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table td { height:52px!important; padding:0 10px!important; font-size:12px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-badge { font-size:12px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table b { width:74px!important; min-width:74px!important; min-height:28px!important; height:28px!important; line-height:28px!important; border-radius:7px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-list { max-height:calc(100vh - 70px)!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-list { border-radius:12px!important; overflow:hidden!important; background:transparent!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table { border-collapse:separate!important; border-spacing:0!important; border-radius:12px!important; overflow:hidden!important; background-clip:padding-box!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th:first-child { border-top-left-radius:12px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th:last-child { border-top-right-radius:12px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table tbody tr:last-child td:first-child { border-bottom-left-radius:12px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table tbody tr:last-child td:last-child { border-bottom-right-radius:12px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-list { padding:0!important; border:1px solid #2b2622!important; border-radius:13px!important; background:transparent!important; overflow:hidden!important; box-sizing:border-box!important; clip-path:inset(0 round 13px)!important; }
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-list,
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-list { border-color:#2b2622!important; background:transparent!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table { border:0!important; border-radius:12px!important; overflow:hidden!important; background:#201c19!important; clip-path:inset(0 round 12px)!important; }
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-table,
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-table { background:#fffaf7!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table thead th { background:#171411!important; color:#f5eee9!important; border-bottom:1px solid #2b2622!important; }
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-table thead th,
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-table thead th { background:#eee2dc!important; color:#241f1b!important; border-bottom:1px solid #2b2622!important; }
    body.mandarin-home-active .agency-native-year-hidden { display:none!important; }
    body.mandarin-home-active .agency-year-combo { position:relative!important; height:100%!important; min-width:0!important; z-index:20!important; }
    body.mandarin-home-active .agency-year-combo-trigger { width:100%!important; height:100%!important; display:flex!important; align-items:center!important; justify-content:space-between!important; gap:10px!important; padding:0 14px!important; border:1px solid #3a312a!important; border-radius:8px!important; background:#1b1816!important; color:#f5eee9!important; font:inherit!important; font-size:16px!important; font-weight:800!important; cursor:pointer!important; box-shadow:none!important; }
    body.mandarin-home-active .agency-year-combo-trigger i { font-style:normal!important; color:#a99990!important; font-size:16px!important; line-height:1!important; }
    body.mandarin-home-active .agency-year-combo-menu { position:absolute!important; left:0!important; right:0!important; top:calc(100% + 6px)!important; z-index:2147483100!important; padding:5px!important; border:1px solid #3a312a!important; border-radius:10px!important; background:#1b1816!important; box-shadow:0 18px 44px rgba(0,0,0,.32)!important; overflow:hidden!important; }
    body.mandarin-home-active .agency-year-combo-menu.hidden { display:none!important; }
    body.mandarin-home-active .agency-year-combo-option { width:100%!important; height:32px!important; display:flex!important; align-items:center!important; padding:0 12px!important; border:0!important; border-radius:7px!important; background:transparent!important; color:#d8cec6!important; font:inherit!important; font-size:14px!important; font-weight:700!important; text-align:left!important; cursor:pointer!important; }
    body.mandarin-home-active .agency-year-combo-option:hover,
    body.mandarin-home-active .agency-year-combo-option.active { background:#2b211d!important; color:#fff!important; }
    body.mandarin-home-active.app-light-theme .agency-year-combo-trigger,
    body.mandarin-home-active:not(.app-dark-theme) .agency-year-combo-trigger { background:#fffdfb!important; border-color:#eadbd4!important; color:#6f5f57!important; }
    body.mandarin-home-active.app-light-theme .agency-year-combo-menu,
    body.mandarin-home-active:not(.app-dark-theme) .agency-year-combo-menu { background:#fffdfb!important; border-color:#d9c9c0!important; box-shadow:0 16px 36px rgba(48,34,26,.14)!important; }
    body.mandarin-home-active.app-light-theme .agency-year-combo-option,
    body.mandarin-home-active:not(.app-dark-theme) .agency-year-combo-option { color:#6f5f57!important; }
    body.mandarin-home-active.app-light-theme .agency-year-combo-option:hover,
    body.mandarin-home-active.app-light-theme .agency-year-combo-option.active,
    body.mandarin-home-active:not(.app-dark-theme) .agency-year-combo-option:hover,
    body.mandarin-home-active:not(.app-dark-theme) .agency-year-combo-option.active { background:#f1e5df!important; color:#8b4a38!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-row-inactive td { background:#171411!important; color:#9a8d85!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-row-inactive td:nth-child(3),
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-row-inactive td:nth-child(4) { color:#b9aca4!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-row-inactive .agency-dashboard-name { color:#c0b3aa!important; text-decoration:line-through!important; text-decoration-color:#d94d43!important; text-decoration-thickness:1px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-row-inactive .agency-dashboard-badge { color:#9a8d85!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-inactive-mark { display:inline-flex!important; align-items:center!important; height:18px!important; margin-left:8px!important; padding:0 7px!important; border-radius:999px!important; background:rgba(217,77,67,.14)!important; color:#ff6f61!important; font-size:10px!important; font-weight:900!important; line-height:18px!important; vertical-align:middle!important; text-transform:uppercase!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-inactive-date { display:block!important; margin-top:2px!important; color:#8f8076!important; font-size:10px!important; font-weight:700!important; line-height:1.2!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-row-inactive b { background:#2b211d!important; color:#d8cec6!important; }
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-row-inactive td,
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-row-inactive td { background:#f1e5df!important; color:#8f8076!important; }
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-row-inactive td:nth-child(3),
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-row-inactive td:nth-child(4),
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-row-inactive td:nth-child(3),
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-row-inactive td:nth-child(4) { color:#5f514a!important; }
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-row-inactive .agency-dashboard-name,
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-row-inactive .agency-dashboard-name { color:#8f4a38!important; text-decoration:line-through!important; text-decoration-color:#d94d43!important; text-decoration-thickness:1px!important; }
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-row-inactive .agency-dashboard-badge,
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-row-inactive .agency-dashboard-badge { color:#8f8076!important; }
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-inactive-mark,
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-inactive-mark { background:rgba(217,77,67,.12)!important; color:#c53028!important; }
    body.mandarin-home-active.app-light-theme.agency-dashboard-active .agency-dashboard-row-inactive b,
    body.mandarin-home-active.agency-dashboard-active:not(.app-dark-theme) .agency-dashboard-row-inactive b { background:#e6d8d1!important; color:#8b4a38!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th:first-child { border-top-left-radius:12px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th:last-child { border-top-right-radius:12px!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-calendar-controls { display:grid!important; height:40px!important; grid-template-columns:132px minmax(0,1fr)!important; gap:8px!important; margin:0 0 6px!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-calendar-controls .agency-dashboard-year,
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-calendar-controls .agency-dashboard-months { height:40px!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-calendar-controls .agency-dashboard-year { font-size:16px!important; padding:0 14px!important; border-radius:8px!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-calendar-controls .agency-dashboard-months { grid-template-columns:repeat(12,minmax(42px,1fr))!important; padding:4px!important; border-radius:8px!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-calendar-controls .agency-dashboard-month { height:30px!important; font-size:12px!important; border-radius:7px!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-calendar-head { height:30px!important; margin:0 0 4px!important; padding-left:4px!important; }
    body.mandarin-home-active.agency-dashboard-calendar-open .agency-dashboard-calendar-shell { height:calc(100% - 80px)!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-panel {
      padding:30px 28px!important;
      background:#f7f1ed!important;
      color:#241f1b!important;
      overflow:hidden!important;
    }
    body.mandarin-home-active.app-dark-theme.agency-dashboard-active .agency-dashboard-panel {
      background:#151311!important;
      color:#f5eee9!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-toolbar,
    body.mandarin-home-active.agency-shell-collapsed.agency-dashboard-active .agency-dashboard-toolbar {
      width:min(1460px,calc(100vw - 320px))!important;
      height:auto!important;
      display:grid!important;
      grid-template-columns:172px 250px minmax(620px,1fr)!important;
      gap:10px!important;
      align-items:center!important;
      margin:0 auto 18px!important;
    }
    body.mandarin-home-active.agency-shell-collapsed.agency-dashboard-active .agency-dashboard-toolbar {
      width:min(1460px,calc(100vw - 180px))!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-actions {
      grid-column:auto!important;
      height:46px!important;
      min-height:46px!important;
      display:grid!important;
      grid-template-columns:1fr 1fr!important;
      gap:8px!important;
      align-items:center!important;
      justify-content:stretch!important;
      padding:0!important;
      margin:0!important;
      background:transparent!important;
      border:0!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-action-btn {
      width:100%!important;
      min-width:0!important;
      height:42px!important;
      padding:0 14px!important;
      border:1px solid #eadbd4!important;
      border-radius:8px!important;
      background:#fffdfb!important;
      color:#241f1b!important;
      font-size:12px!important;
      font-weight:900!important;
      line-height:1!important;
      box-shadow:none!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-action-btn.primary,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-action-btn:hover {
      border-color:#d1785f!important;
      background:#d1785f!important;
      color:#fff!important;
    }
    body.mandarin-home-active.app-dark-theme.agency-dashboard-active .agency-dashboard-action-btn {
      border-color:#3a312a!important;
      background:#1b1816!important;
      color:#f5eee9!important;
    }
    body.mandarin-home-active.app-dark-theme.agency-dashboard-active .agency-dashboard-action-btn.primary,
    body.mandarin-home-active.app-dark-theme.agency-dashboard-active .agency-dashboard-action-btn:hover {
      border-color:#d1785f!important;
      background:#d1785f!important;
      color:#fff!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-year,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-months {
      height:46px!important;
      background:#fffdfb!important;
      border:1px solid #eadbd4!important;
      color:#6f5f57!important;
    }
    body.mandarin-home-active.app-dark-theme.agency-dashboard-active .agency-dashboard-year,
    body.mandarin-home-active.app-dark-theme.agency-dashboard-active .agency-dashboard-months {
      background:#1b1816!important;
      border-color:#3a312a!important;
      color:#d8cec6!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-months {
      display:grid!important;
      grid-template-columns:repeat(12,minmax(48px,1fr))!important;
      gap:5px!important;
      padding:5px!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-month {
      height:34px!important;
      border-radius:8px!important;
      color:#7d6f68!important;
      font-size:13px!important;
      font-weight:900!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-month.active,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-month:hover {
      background:#f1e5df!important;
      color:#8b4a38!important;
      box-shadow:inset 0 0 0 1px #d1785f!important;
    }
    body.mandarin-home-active.app-dark-theme.agency-dashboard-active .agency-dashboard-month.active,
    body.mandarin-home-active.app-dark-theme.agency-dashboard-active .agency-dashboard-month:hover {
      background:#2b211d!important;
      color:#f2d1c5!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-status {
      width:min(1460px,calc(100vw - 320px))!important;
      min-height:18px!important;
      height:18px!important;
      margin:0 auto 4px!important;
      color:#8f8076!important;
      overflow:hidden!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-list,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonuses,
    body.mandarin-home-active.agency-shell-collapsed.agency-dashboard-active .agency-dashboard-list,
    body.mandarin-home-active.agency-shell-collapsed.agency-dashboard-active .agency-dashboard-bonuses {
      width:min(1460px,calc(100vw - 320px))!important;
      max-height:calc(100vh - 136px)!important;
      margin:0 auto!important;
      border:1px solid #2b2622!important;
      border-radius:13px!important;
      background:transparent!important;
      overflow:auto!important;
      scrollbar-width:thin!important;
      scrollbar-color:#d1785f #f4ebe6!important;
      clip-path:inset(0 round 13px)!important;
      box-sizing:border-box!important;
    }
    body.mandarin-home-active.app-dark-theme.agency-dashboard-active .agency-dashboard-list,
    body.mandarin-home-active.app-dark-theme.agency-dashboard-active .agency-dashboard-bonuses {
      scrollbar-color:#d1785f #1b1816!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-list::-webkit-scrollbar,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonuses::-webkit-scrollbar {
      width:7px!important;
      height:7px!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-list::-webkit-scrollbar-track,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonuses::-webkit-scrollbar-track {
      background:#f4ebe6!important;
      border-radius:999px!important;
    }
    body.mandarin-home-active.app-dark-theme.agency-dashboard-active .agency-dashboard-list::-webkit-scrollbar-track,
    body.mandarin-home-active.app-dark-theme.agency-dashboard-active .agency-dashboard-bonuses::-webkit-scrollbar-track {
      background:#1b1816!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-list::-webkit-scrollbar-thumb,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonuses::-webkit-scrollbar-thumb {
      min-height:46px!important;
      border:2px solid #f4ebe6!important;
      border-radius:999px!important;
      background:#d1785f!important;
    }
    body.mandarin-home-active.app-dark-theme.agency-dashboard-active .agency-dashboard-list::-webkit-scrollbar-thumb,
    body.mandarin-home-active.app-dark-theme.agency-dashboard-active .agency-dashboard-bonuses::-webkit-scrollbar-thumb {
      border-color:#1b1816!important;
      background:#d1785f!important;
    }
    body.mandarin-home-active.agency-shell-collapsed.agency-dashboard-active .agency-dashboard-list,
    body.mandarin-home-active.agency-shell-collapsed.agency-dashboard-active .agency-dashboard-bonuses {
      width:min(1460px,calc(100vw - 180px))!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonuses.hidden,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-list.hidden,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-calendar.hidden {
      display:none!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonus-filters {
      position:sticky!important;
      top:0!important;
      z-index:6!important;
      min-height:58px!important;
      display:grid!important;
      grid-template-columns:46px 168px 168px 250px 96px minmax(210px,1fr)!important;
      align-items:center!important;
      gap:10px!important;
      padding:8px 12px!important;
      border-bottom:1px solid #eadbd4!important;
      background:#fffdfb!important;
      box-sizing:border-box!important;
    }
    body.mandarin-home-active.app-dark-theme.agency-dashboard-active .agency-dashboard-bonus-filters {
      border-bottom-color:#2d261f!important;
      background:#171411!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-calendar-chip,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonus-apply {
      height:38px!important;
      border:1px solid #eadbd4!important;
      border-radius:8px!important;
      background:#fffaf7!important;
      color:#8b4a38!important;
      font:inherit!important;
      font-size:12px!important;
      font-weight:900!important;
      cursor:pointer!important;
      box-shadow:none!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-calendar-chip {
      width:42px!important;
      display:grid!important;
      place-items:center!important;
      padding:0!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-calendar-chip svg {
      width:19px!important;
      height:19px!important;
      fill:none!important;
      stroke:currentColor!important;
      stroke-width:1.9!important;
      stroke-linecap:round!important;
      stroke-linejoin:round!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonus-apply:hover,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-calendar-chip:hover {
      border-color:#d1785f!important;
      background:#d1785f!important;
      color:#fff!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonus-total {
      height:38px!important;
      min-width:340px!important;
      justify-self:end!important;
      display:flex!important;
      align-items:center!important;
      justify-content:space-between!important;
      gap:10px!important;
      padding:0 12px!important;
      border:1px solid #eadbd4!important;
      border-radius:8px!important;
      background:#fff7f2!important;
      color:#8f8076!important;
      box-sizing:border-box!important;
      font-size:11px!important;
      font-weight:900!important;
      text-transform:uppercase!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonus-total b {
      min-width:66px!important;
      padding:5px 10px!important;
      border-radius:7px!important;
      background:#eadbd4!important;
      color:#984a34!important;
      font-size:15px!important;
      line-height:1!important;
      text-align:center!important;
      text-transform:none!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonus-total b.loading {
      opacity:.55!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonus-loader {
      width:16px!important;
      height:16px!important;
      flex:0 0 16px!important;
      border:2px solid rgba(152,74,52,.22)!important;
      border-top-color:#d1785f!important;
      border-radius:999px!important;
      animation:agency-dashboard-bonus-spin .75s linear infinite!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonus-loader.hidden {
      display:none!important;
    }
    @keyframes agency-dashboard-bonus-spin {
      to { transform:rotate(360deg); }
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonus-filters label {
      min-width:0!important;
      display:grid!important;
      grid-template-columns:42px minmax(0,1fr)!important;
      align-items:center!important;
      gap:8px!important;
      color:#8f8076!important;
      font-size:11px!important;
      font-weight:900!important;
      text-transform:uppercase!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonus-filters input,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonus-filters select {
      width:100%!important;
      height:38px!important;
      padding:0 10px!important;
      border:1px solid #eadbd4!important;
      border-radius:8px!important;
      background:#fffaf7!important;
      color:#241f1b!important;
      font:inherit!important;
      font-size:12px!important;
      font-weight:800!important;
      box-sizing:border-box!important;
      outline:0!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonus-filters select {
      appearance:auto!important;
    }
    body.mandarin-home-active.app-dark-theme.agency-dashboard-active .agency-dashboard-calendar-chip,
    body.mandarin-home-active.app-dark-theme.agency-dashboard-active .agency-dashboard-bonus-apply,
    body.mandarin-home-active.app-dark-theme.agency-dashboard-active .agency-dashboard-bonus-filters input,
    body.mandarin-home-active.app-dark-theme.agency-dashboard-active .agency-dashboard-bonus-filters select {
      border-color:#3a312a!important;
      background:#1b1816!important;
      color:#f5eee9!important;
    }
    body.mandarin-home-active.app-dark-theme.agency-dashboard-active .agency-dashboard-bonus-total {
      border-color:#3a312a!important;
      background:#1b1816!important;
      color:#b9aaa0!important;
    }
    body.mandarin-home-active.app-dark-theme.agency-dashboard-active .agency-dashboard-bonus-total b {
      background:#2d261f!important;
      color:#f1a58c!important;
    }
    body.mandarin-home-active.app-dark-theme.agency-dashboard-active .agency-dashboard-bonus-filters label {
      color:#b9aaa0!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table td {
      height:56px!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th:nth-child(1),
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table td:nth-child(1) { width:54px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th:nth-child(5),
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table td:nth-child(5) { width:86px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th:nth-child(6),
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table td:nth-child(6),
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th:nth-child(7),
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table td:nth-child(7),
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th:nth-child(8),
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table td:nth-child(8),
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th:nth-child(9),
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table td:nth-child(9) { width:112px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-gifts-amount {
      background:#fff3d8!important;
      color:#9a5a18!important;
    }
    body.mandarin-home-active.app-dark-theme.agency-dashboard-active .agency-dashboard-gifts-amount {
      background:#302516!important;
      color:#f0bd76!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-gift-row td {
      background:#fff9ec!important;
    }
    body.mandarin-home-active.app-dark-theme.agency-dashboard-active .agency-dashboard-gift-row td {
      background:#211b13!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-gift-chip {
      display:inline-grid!important;
      place-items:center!important;
      height:18px!important;
      min-width:42px!important;
      margin-left:8px!important;
      padding:0 7px!important;
      border-radius:999px!important;
      background:#f4d8a6!important;
      color:#8b4f13!important;
      font-size:10px!important;
      font-weight:900!important;
      text-transform:uppercase!important;
      vertical-align:middle!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-total-row td {
      position:sticky!important;
      bottom:0!important;
      z-index:4!important;
      background:#f4e8e2!important;
      box-shadow:0 -1px 0 #2b2622!important;
      font-weight:900!important;
    }
    body.mandarin-home-active.app-dark-theme.agency-dashboard-active .agency-dashboard-total-row td {
      background:#1b1816!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonuses-table thead th {
      position:sticky!important;
      top:0!important;
      z-index:5!important;
      background:#eee2dc!important;
      box-shadow:0 1px 0 #2b2622!important;
    }
    body.mandarin-home-active.app-dark-theme.agency-dashboard-active .agency-dashboard-bonuses-table thead th {
      background:#171411!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonuses-table th:nth-child(1),
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonuses-table td:nth-child(1) { width:38px!important; padding-left:6px!important; padding-right:6px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonuses-table th:nth-child(2),
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonuses-table td:nth-child(2) { width:142px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonuses-table th:nth-child(3),
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonuses-table td:nth-child(3) { width:220px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonuses-table th:nth-child(4),
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonuses-table td:nth-child(4) { width:220px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonuses-table th:nth-child(5),
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonuses-table td:nth-child(5) { width:210px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonuses-table th:nth-child(6),
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonuses-table td:nth-child(6) { width:148px!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonuses-table th:nth-child(7),
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonuses-table td:nth-child(7) { width:96px!important; }
    body.mandarin-home-active .agency-shell-collapse { width:30px!important; height:30px!important; min-width:30px!important; display:grid!important; place-items:center!important; padding:0!important; border:1px solid #3a312a!important; border-radius:8px!important; background:#1b1816!important; color:#f5eee9!important; line-height:1!important; overflow:hidden!important; }
    body.mandarin-home-active.agency-shell-collapsed .agency-shell-collapse { margin:0!important; }
    body.mandarin-home-active .agency-shell-user { position:relative!important; cursor:pointer!important; overflow:visible!important; }
    body.mandarin-home-active .agency-shell-user:hover { background:#11100f!important; }
    body.mandarin-home-active .agency-shell-inline-logout { display:none!important; visibility:hidden!important; opacity:0!important; pointer-events:none!important; }
    body.mandarin-home-active.agency-shell-collapsed .agency-shell-user { justify-content:center!important; padding:12px 0!important; }
    body.mandarin-home-active .agency-shell-inline-logout svg { width:17px!important; height:17px!important; stroke:currentColor!important; stroke-width:1.8!important; stroke-linecap:round!important; stroke-linejoin:round!important; }
    body.mandarin-home-active .agency-shell-user-menu { position:absolute!important; left:12px!important; right:12px!important; bottom:64px!important; z-index:40!important; display:block!important; padding:6px!important; border:1px solid #3a312a!important; border-radius:10px!important; background:#1b1816!important; box-shadow:0 16px 38px rgba(0,0,0,.38)!important; overflow:hidden!important; }
    body.mandarin-home-active.agency-shell-collapsed .agency-shell-user-menu { left:8px!important; right:auto!important; width:126px!important; bottom:62px!important; }
    body.mandarin-home-active .agency-shell-user-menu.hidden { display:none!important; }
    body.mandarin-home-active .agency-shell-user-menu button { width:100%!important; height:34px!important; display:flex!important; align-items:center!important; justify-content:space-between!important; gap:10px!important; padding:0 10px!important; border:0!important; border-radius:7px!important; background:transparent!important; color:#f5eee9!important; font-family:Montserrat,Arial,sans-serif!important; font-size:12px!important; font-weight:800!important; text-align:left!important; cursor:pointer!important; }
    body.mandarin-home-active .agency-shell-user-menu button:hover { background:#2b211d!important; color:#fff!important; }
    body.mandarin-home-active .agency-shell-user-menu svg { width:17px!important; height:17px!important; stroke:currentColor!important; stroke-width:1.8!important; stroke-linecap:round!important; stroke-linejoin:round!important; }
    body.mandarin-home-active .agency-account-toolbar { min-height:44px!important; margin-bottom:16px!important; display:grid!important; grid-template-columns:minmax(320px,404px) auto minmax(0,1fr) max-content!important; align-items:center!important; gap:16px!important; }
    body.mandarin-home-active .agency-account-tabs { display:flex!important; align-items:center!important; gap:8px!important; margin-right:auto!important; }
    body.mandarin-home-active .agency-account-tab { height:42px!important; min-width:96px!important; padding:0 18px!important; border:1px solid #3a312a!important; border-radius:10px!important; background:#1b1816!important; color:#d8cec6!important; font:inherit!important; font-size:13px!important; font-weight:800!important; cursor:pointer!important; box-shadow:none!important; }
    body.mandarin-home-active .agency-account-tab:hover { border-color:#5a4a40!important; color:#fff!important; }
    body.mandarin-home-active .agency-account-tab.active { background:#2b211d!important; border-color:#d1785f!important; color:#fff!important; }
    body.mandarin-home-active .agency-account-search { width:100%!important; height:44px!important; display:grid!important; grid-template-columns:20px minmax(0,1fr) 32px!important; align-items:center!important; gap:10px!important; padding:0 12px!important; background:#1b1816!important; border:1px solid #3a312a!important; border-radius:8px!important; color:#f5eee9!important; box-shadow:none!important; box-sizing:border-box!important; }
    body.mandarin-home-active .agency-account-search::before { content:"⌕"!important; display:block!important; width:20px!important; height:20px!important; color:#d1785f!important; font-size:18px!important; line-height:18px!important; text-align:center!important; transform:translateY(-1px)!important; }
    body.mandarin-home-active .agency-account-search > span { display:none!important; }
    body.mandarin-home-active .agency-account-search input { height:34px!important; line-height:34px!important; color:#f5eee9!important; opacity:1!important; }
    body.mandarin-home-active .agency-account-search input::placeholder { color:#8f8076!important; opacity:1!important; }
    body.mandarin-home-active .agency-account-search b { width:32px!important; min-width:32px!important; height:28px!important; display:grid!important; place-items:center!important; justify-self:end!important; border-radius:8px!important; background:#2b211d!important; color:#f2d1c5!important; font-size:12px!important; font-weight:800!important; line-height:28px!important; }
    body.mandarin-home-active .agency-shell-collapse { background:#1b1816!important; border:1px solid #3a312a!important; color:#f5eee9!important; box-shadow:none!important; }
    body.mandarin-home-active .agency-add-profile-btn { width:auto!important; min-width:112px!important; max-width:160px!important; justify-self:end!important; height:44px!important; padding:0 18px!important; border-radius:8px!important; background:#1b1816!important; border:1px solid #3a312a!important; color:#d8cec6!important; box-shadow:none!important; white-space:nowrap!important; }
    body.mandarin-home-active .agency-add-profile-btn:hover { border-color:#d1785f!important; color:#fff!important; background:#2b211d!important; }
    body.mandarin-home-active .agency-account-table-wrap { width:min(1510px,calc(100vw - 300px))!important; min-height:0!important; max-height:calc(100vh - 214px)!important; margin:36px auto 0!important; padding:0!important; border:0!important; outline:0!important; outline-offset:0!important; box-shadow:none!important; background:transparent!important; overflow-x:auto!important; overflow-y:visible!important; border-radius:14px!important; box-sizing:border-box!important; }
    body.mandarin-home-active.agency-shell-collapsed .agency-account-table-wrap { width:min(1510px,calc(100vw - 160px))!important; }
    body.mandarin-home-active .agency-account-table { width:100%!important; table-layout:fixed!important; border-collapse:separate!important; border-spacing:0!important; border:1px solid #3a312a!important; border-radius:14px!important; overflow:hidden!important; outline:0!important; box-shadow:none!important; background:#201c19!important; color:#f5eee9!important; font-size:12px!important; font-weight:500!important; }
    body.mandarin-home-active .agency-account-table,
    body.mandarin-home-active .agency-account-table * { color:#f5eee9!important; opacity:1!important; text-shadow:none!important; box-shadow:none!important; }
    body.mandarin-home-active .agency-account-table th { height:40px!important; padding:0 12px!important; background:#1b1816!important; color:#f5eee9!important; border-top:0!important; border-bottom:1px solid #2d261f!important; border-left:0!important; border-right:1px solid #2d261f!important; border-radius:0!important; outline:0!important; font-weight:800!important; }
    body.mandarin-home-active .agency-account-table td { height:42px!important; padding:0 12px!important; background:#201c19!important; color:#f5eee9!important; border-top:1px solid #2d261f!important; border-left:0!important; border-right:1px solid #2d261f!important; border-bottom:0!important; border-radius:0!important; outline:0!important; vertical-align:middle!important; font-size:12px!important; font-weight:500!important; }
    body.mandarin-home-active .agency-account-table thead th:first-child,
    body.mandarin-home-active .agency-account-table thead th:last-child,
    body.mandarin-home-active .agency-account-table tbody tr:last-child td:first-child,
    body.mandarin-home-active .agency-account-table tbody tr:last-child td:last-child { border-radius:0!important; }
    body.mandarin-home-active .agency-account-table tbody tr:nth-child(even) td { background:#241f1b!important; }
    body.mandarin-home-active .agency-col-select,
    body.mandarin-home-active .agency-col-number { width:44px!important; min-width:44px!important; max-width:44px!important; padding:0!important; text-align:center!important; }
    body.mandarin-home-active .agency-account-table th:nth-child(3),
    body.mandarin-home-active .agency-account-table td:nth-child(3) { width:220px!important; text-align:left!important; font-weight:500!important; }
    body.mandarin-home-active .agency-account-table th:nth-child(4),
    body.mandarin-home-active .agency-account-table td:nth-child(4) { width:130px!important; }
    body.mandarin-home-active .agency-account-table th:nth-child(5),
    body.mandarin-home-active .agency-account-table td:nth-child(5) { width:150px!important; }
    body.mandarin-home-active .agency-account-table th:nth-child(6),
    body.mandarin-home-active .agency-account-table td:nth-child(6) { width:260px!important; }
    body.mandarin-home-active .agency-account-table th:nth-child(7),
    body.mandarin-home-active .agency-account-table td:nth-child(7) { width:142px!important; text-align:center!important; }
    body.mandarin-home-active .agency-account-table th:nth-child(8),
    body.mandarin-home-active .agency-account-table td:nth-child(8) { width:152px!important; text-align:center!important; }
    body.mandarin-home-active .agency-account-table.agency-operators-table th:nth-child(3),
    body.mandarin-home-active .agency-account-table.agency-operators-table td:nth-child(3) { width:260px!important; }
    body.mandarin-home-active .agency-account-table.agency-operators-table th:nth-child(4),
    body.mandarin-home-active .agency-account-table.agency-operators-table td:nth-child(4) { width:220px!important; }
    body.mandarin-home-active .agency-account-table.agency-operators-table th:nth-child(5),
    body.mandarin-home-active .agency-account-table.agency-operators-table td:nth-child(5) { width:170px!important; }
    body.mandarin-home-active .agency-account-table.agency-operators-table th:nth-child(6),
    body.mandarin-home-active .agency-account-table.agency-operators-table td:nth-child(6) { width:280px!important; }
    body.mandarin-home-active .agency-account-table.agency-operators-table th:nth-child(7),
    body.mandarin-home-active .agency-account-table.agency-operators-table td:nth-child(7) { width:150px!important; text-align:center!important; }
    body.mandarin-home-active .agency-account-table.agency-operators-table th:nth-child(8),
    body.mandarin-home-active .agency-account-table.agency-operators-table td:nth-child(8) { width:152px!important; text-align:center!important; }
    body.mandarin-home-active .agency-muted-cell { width:100%!important; height:30px!important; display:flex!important; align-items:center!important; padding:0 14px!important; border:1px solid #4a4038!important; border-radius:8px!important; background:#1b1816!important; color:#8f8076!important; font-family:Montserrat,Arial,sans-serif!important; font-size:12px!important; font-weight:500!important; line-height:30px!important; opacity:1!important; box-sizing:border-box!important; cursor:default!important; }
    body.mandarin-home-active .agency-row-inactive td { opacity:1!important; background:#1b1816!important; color:#8f8076!important; }
    body.mandarin-home-active .agency-user-inactive-mark { display:inline-flex!important; align-items:center!important; height:18px!important; margin-left:8px!important; padding:0 7px!important; border-radius:999px!important; background:#2b211d!important; color:#d1785f!important; font-size:10px!important; font-weight:900!important; line-height:18px!important; text-transform:uppercase!important; vertical-align:middle!important; }
    body.mandarin-home-active .agency-user-inactive-date { display:block!important; margin-top:2px!important; color:#8f8076!important; font-size:10px!important; font-weight:700!important; line-height:1.2!important; }
    body.mandarin-home-active .agency-row-inactive .agency-muted-cell,
    body.mandarin-home-active .agency-row-inactive .agency-combo-trigger { opacity:.72!important; }
    body.mandarin-home-active .agency-row-actions { display:flex!important; align-items:center!important; justify-content:center!important; gap:8px!important; }
    body.mandarin-home-active .agency-row-action { height:28px!important; padding:0 12px!important; border:1px solid #4a4038!important; border-radius:8px!important; background:#1b1816!important; color:#f5eee9!important; font:inherit!important; font-size:12px!important; font-weight:800!important; cursor:pointer!important; box-shadow:none!important; }
    body.mandarin-home-active .agency-row-action:hover { border-color:#d1785f!important; color:#fff!important; }
    body.mandarin-home-active .agency-row-action.delete { border-color:#7f3f33!important; color:#f4b3a3!important; }
    body.mandarin-home-active .agency-row-action.delete:hover { background:#3a1f1a!important; color:#fff!important; }
    body.mandarin-home-active .agency-account-table tbody td:nth-child(3),
    body.mandarin-home-active .agency-account-table tbody td:nth-child(4) { border-radius:0!important; }
    body.mandarin-home-active .agency-account-table tbody td:nth-child(3) { padding-left:12px!important; }
    body.mandarin-home-active .agency-account-table tbody td:nth-child(4) { padding-right:12px!important; }
    body.mandarin-home-active .agency-account-table tbody td strong,
    body.mandarin-home-active .agency-account-table tbody td .agency-profile-id { font-size:12px!important; font-weight:500!important; color:inherit!important; }
    body.mandarin-home-active .agency-account-table tbody td:nth-child(3) strong,
    body.mandarin-home-active .agency-account-table tbody td:nth-child(4) .agency-profile-id { display:block!important; line-height:28px!important; }
    body.mandarin-home-active .agency-col-select input { width:18px!important; height:18px!important; margin:0!important; }
    body.mandarin-home-active .agency-assignment-select { width:100%!important; height:30px!important; padding:0 32px 0 14px!important; border:1px solid #4a4038!important; border-radius:8px!important; background-color:#1b1816!important; background-image:linear-gradient(45deg,transparent 50%,currentColor 50%),linear-gradient(135deg,currentColor 50%,transparent 50%)!important; background-position:calc(100% - 16px) 13px,calc(100% - 11px) 13px!important; background-size:5px 5px,5px 5px!important; background-repeat:no-repeat!important; color:#f5eee9!important; opacity:1!important; box-shadow:none!important; outline:0!important; font-family:Montserrat,Arial,sans-serif!important; font-size:12px!important; font-weight:500!important; line-height:30px!important; text-align:left!important; text-shadow:none!important; appearance:none!important; -webkit-appearance:none!important; }
    body.mandarin-home-active .agency-assignment-select option { background:#fffdfb!important; color:#241f1b!important; font-family:Montserrat,Arial,sans-serif!important; font-size:12px!important; font-weight:500!important; }
    body.mandarin-home-active .agency-combo { position:relative!important; width:100%!important; height:30px!important; font-family:Montserrat,Arial,sans-serif!important; font-size:12px!important; font-weight:500!important; color:#f5eee9!important; }
    body.mandarin-home-active .agency-combo-trigger { width:100%!important; height:30px!important; display:flex!important; align-items:center!important; justify-content:space-between!important; gap:10px!important; padding:0 12px 0 14px!important; border:1px solid #4a4038!important; border-radius:8px!important; background:#1b1816!important; color:inherit!important; font:inherit!important; line-height:30px!important; cursor:pointer!important; box-shadow:none!important; }
    body.mandarin-home-active .agency-combo-trigger.locked { cursor:default!important; pointer-events:none!important; }
    body.mandarin-home-active .agency-combo-trigger::after { content:""!important; width:7px!important; height:7px!important; border-right:1.5px solid currentColor!important; border-bottom:1.5px solid currentColor!important; transform:rotate(45deg) translateY(-2px)!important; opacity:.85!important; flex:0 0 auto!important; }
    body.mandarin-home-active .agency-combo-trigger.locked::after { display:none!important; }
    body.mandarin-home-active .agency-combo.open .agency-combo-trigger::after { transform:rotate(225deg) translateY(-1px)!important; }
    body.mandarin-home-active .agency-combo-menu { display:none!important; position:fixed!important; left:var(--agency-combo-left,0px)!important; top:var(--agency-combo-top,0px)!important; width:var(--agency-combo-width,220px)!important; right:auto!important; z-index:2147483646!important; max-height:220px!important; padding:5px!important; border:1px solid #eadbd4!important; border-radius:10px!important; background:#fffdfb!important; box-shadow:0 14px 34px rgba(65,43,34,.18)!important; overflow:auto!important; box-sizing:border-box!important; }
    body.mandarin-home-active .agency-combo.open .agency-combo-menu { display:grid!important; gap:2px!important; }
    body.mandarin-home-active .agency-combo-option { min-height:28px!important; display:flex!important; align-items:center!important; padding:0 12px!important; border:0!important; border-radius:7px!important; background:transparent!important; color:#241f1b!important; font:inherit!important; text-align:left!important; cursor:pointer!important; }
    body.mandarin-home-active .agency-combo-option:hover,
    body.mandarin-home-active .agency-combo-option.active { background:#f1e5df!important; color:#241f1b!important; }
    body.mandarin-home-active.app-dark-theme .agency-combo-menu { border-color:#5a3f34!important; background:#211b18!important; box-shadow:0 18px 42px rgba(0,0,0,.52),0 0 0 1px rgba(209,120,95,.08)!important; }
    body.mandarin-home-active.app-dark-theme .agency-combo-option { color:#f8f1ed!important; background:transparent!important; }
    body.mandarin-home-active.app-dark-theme .agency-combo-option.active { background:#5a3027!important; color:#fff!important; }
    body.mandarin-home-active.app-dark-theme .agency-combo-option:hover { background:#3a2823!important; color:#fff!important; }
    body.mandarin-home-active:not(.app-dark-theme) { background:#f7f1ed!important; }
    body.mandarin-home-active:not(.app-dark-theme) .mandarin-home-screen,
    body.mandarin-home-active:not(.app-dark-theme) .agency-shell-main,
    body.mandarin-home-active:not(.app-dark-theme) .agency-account-manager,
    body.mandarin-home-active:not(.app-dark-theme) .agency-inbox-panel,
    body.mandarin-home-active:not(.app-dark-theme) .agency-favorites-panel,
    body.mandarin-home-active:not(.app-dark-theme) .agency-dashboard-panel { background:#f7f1ed!important; color:#241f1b!important; }
    body.mandarin-home-active:not(.app-dark-theme) .agency-inbox-frame { border-color:#eadbd4!important; background:#fffdfb!important; box-shadow:0 14px 34px rgba(48,34,26,.10)!important; }
    body.mandarin-home-active:not(.app-dark-theme) .agency-inbox-no-access { border-color:#eadbd4!important; background:#fffdfb!important; box-shadow:0 14px 34px rgba(48,34,26,.10)!important; }
    body.mandarin-home-active:not(.app-dark-theme) .agency-inbox-no-access-icon { background:#f1e5df!important; color:#d1785f!important; }
    body.mandarin-home-active:not(.app-dark-theme) .agency-inbox-no-access strong { color:#241f1b!important; }
    body.mandarin-home-active:not(.app-dark-theme) .agency-inbox-no-access span { color:#6f5f57!important; }
    body.mandarin-home-active:not(.app-dark-theme) .agency-section-authorize-btn { background:#fffdfb!important; border-color:#d1785f!important; color:#8b4a38!important; }
    body.mandarin-home-active:not(.app-dark-theme) .agency-section-authorize-btn:hover { background:#f1e5df!important; color:#241f1b!important; }
    body.mandarin-home-active:not(.app-dark-theme) .agency-favorites-refresh { background:#fffdfb!important; border-color:#eadbd4!important; color:#241f1b!important; }
    body.mandarin-home-active:not(.app-dark-theme) .agency-favorites-refresh:hover { background:#f1e5df!important; border-color:#d1785f!important; }
    body.mandarin-home-active:not(.app-dark-theme) .agency-account-search,
    body.mandarin-home-active:not(.app-dark-theme) .agency-shell-collapse,
    body.mandarin-home-active:not(.app-dark-theme) .agency-assignment-select,
    body.mandarin-home-active:not(.app-dark-theme) .agency-account-tab { background:#fffdfb!important; border-color:#eadbd4!important; color:#241f1b!important; }
    body.mandarin-home-active:not(.app-dark-theme) .agency-muted-cell { background:#fffdfb!important; border-color:#eadbd4!important; color:#241f1b!important; }
    body.mandarin-home-active:not(.app-dark-theme) .agency-account-search::before { color:#d1785f!important; }
    body.mandarin-home-active:not(.app-dark-theme) .agency-account-search b { background:#f1e5df!important; color:#8b4a38!important; }
    body.mandarin-home-active:not(.app-dark-theme) .agency-account-tab:hover { border-color:#d8b8aa!important; }
    body.mandarin-home-active:not(.app-dark-theme) .agency-account-tab.active { background:#f1e5df!important; border-color:#d1785f!important; color:#241f1b!important; }
    body.mandarin-home-active:not(.app-dark-theme) .agency-row-action { background:#fffdfb!important; border-color:#eadbd4!important; color:#241f1b!important; }
    body.mandarin-home-active:not(.app-dark-theme) .agency-add-profile-btn { background:#fffdfb!important; border-color:#eadbd4!important; color:#241f1b!important; }
    body.mandarin-home-active:not(.app-dark-theme) .agency-add-profile-btn:hover { border-color:#d1785f!important; color:#241f1b!important; background:#f1e5df!important; }
    body.mandarin-home-active:not(.app-dark-theme) .agency-row-action:hover { border-color:#d1785f!important; }
    body.mandarin-home-active:not(.app-dark-theme) .agency-row-action.delete { border-color:#e1a18f!important; color:#9a3f2c!important; }
    body.mandarin-home-active:not(.app-dark-theme) .agency-account-search input,
    body.mandarin-home-active:not(.app-dark-theme) .agency-account-table,
    body.mandarin-home-active:not(.app-dark-theme) .agency-account-table * { color:#241f1b!important; }
    body.mandarin-home-active:not(.app-dark-theme) .agency-account-table th { background:#fffdfb!important; border-color:#eadbd4!important; color:#241f1b!important; }
    body.mandarin-home-active:not(.app-dark-theme) .agency-account-table td { background:#fffaf7!important; border-color:#eadbd4!important; color:#241f1b!important; }
    body.mandarin-home-active:not(.app-dark-theme) .agency-account-table tbody tr:nth-child(even) td { background:#f7eee9!important; }
    body.mandarin-home-active:not(.app-dark-theme) .agency-account-table { border-color:#d9c9c0!important; border-radius:14px!important; box-shadow:0 10px 28px rgba(48,34,26,.06)!important; }
    body.mandarin-home-active:not(.app-dark-theme) .agency-account-table-wrap { background:transparent!important; border:0!important; outline:0!important; box-shadow:none!important; }
    body.mandarin-home-active .agency-shell-sidebar,
    body.mandarin-home-active:not(.app-dark-theme) .agency-shell-sidebar,
    body.mandarin-home-active.app-dark-theme .agency-shell-sidebar { background:#080807!important; color:#f5eee9!important; border-right-color:#24211f!important; }
    body.mandarin-home-active .agency-shell-brand,
    body.mandarin-home-active:not(.app-dark-theme) .agency-shell-brand,
    body.mandarin-home-active.app-dark-theme .agency-shell-brand,
    body.mandarin-home-active .agency-shell-user,
    body.mandarin-home-active:not(.app-dark-theme) .agency-shell-user,
    body.mandarin-home-active.app-dark-theme .agency-shell-user { color:#fff!important; border-color:#24211f!important; }
    body.mandarin-home-active .agency-shell-nav-label,
    body.mandarin-home-active:not(.app-dark-theme) .agency-shell-nav-label,
    body.mandarin-home-active.app-dark-theme .agency-shell-nav-label,
    body.mandarin-home-active .agency-shell-user-copy span,
    body.mandarin-home-active:not(.app-dark-theme) .agency-shell-user-copy span,
    body.mandarin-home-active.app-dark-theme .agency-shell-user-copy span { color:#b9aaa0!important; }
    body.mandarin-home-active .agency-shell-nav-item,
    body.mandarin-home-active:not(.app-dark-theme) .agency-shell-nav-item,
    body.mandarin-home-active.app-dark-theme .agency-shell-nav-item { color:#d8cec6!important; }
    body.mandarin-home-active .agency-shell-nav-item:hover,
    body.mandarin-home-active:not(.app-dark-theme) .agency-shell-nav-item:hover,
    body.mandarin-home-active.app-dark-theme .agency-shell-nav-item:hover,
    body.mandarin-home-active .agency-shell-nav-item.active,
    body.mandarin-home-active:not(.app-dark-theme) .agency-shell-nav-item.active,
    body.mandarin-home-active.app-dark-theme .agency-shell-nav-item.active { background:#2b211d!important; color:#fff!important; }
    body.mandarin-home-active:not(.app-dark-theme) .agency-assignment-select { background-color:#fffdfb!important; background-image:linear-gradient(45deg,transparent 50%,currentColor 50%),linear-gradient(135deg,currentColor 50%,transparent 50%)!important; background-position:calc(100% - 16px) 13px,calc(100% - 11px) 13px!important; background-size:5px 5px,5px 5px!important; background-repeat:no-repeat!important; color:#241f1b!important; }
    body.mandarin-home-active:not(.app-dark-theme) .agency-combo { color:#241f1b!important; }
    body.mandarin-home-active:not(.app-dark-theme) .agency-combo-trigger { background:#fffdfb!important; border-color:#eadbd4!important; }
    body.mandarin-home-active:not(.app-dark-theme) .agency-row-inactive td { background:#f1e5df!important; color:#8f8076!important; }
    body.mandarin-home-active:not(.app-dark-theme) .agency-user-inactive-mark { background:#e2d3cc!important; color:#8b4a38!important; }
  `;
  document.head.appendChild(style);
  installAgencyDashboardCompactStyles();
}

function installMainPageZoom() {
  if (window.agencyZoomBridgeSync) {
    window.agencyZoomBridgeSync();
    return;
  }
  document.documentElement.style.setProperty('--main-page-zoom', '1');
  window.applyAgencyPanelZoomForPanel = () => 1;
  window.applyBrowserZoomCompensation = () => 1;
}

function installVisibleDreamBrowserTestButton() {
  document.getElementById('visibleDreamBrowserTestBtn')?.remove();
  document.getElementById('dreamAppWindowBtn')?.remove();
}

function avatarFallbackFromImage(img) {
  const avatar = img?.closest?.('.avatar');
  if (!avatar || avatar.dataset.fallbackApplied === '1') return;
  const name = img.getAttribute('alt') || avatar.closest('tr')?.querySelector('.person-name')?.textContent || '?';
  avatar.dataset.fallbackApplied = '1';
  avatar.classList.add('avatar-fallback');
  avatar.textContent = String(name || '?').trim().slice(0, 1).toUpperCase() || '?';
}

function installBrokenAvatarFallbacks() {
  document.addEventListener('error', event => {
    const img = event.target;
    if (img instanceof HTMLImageElement && img.closest('.avatar')) avatarFallbackFromImage(img);
  }, true);
  const repair = root => {
    root.querySelectorAll?.('.avatar img').forEach(img => {
      if (img.complete && img.naturalWidth === 0) avatarFallbackFromImage(img);
    });
  };
  repair(document);
  new MutationObserver(records => {
    records.forEach(record => {
      record.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) repair(node);
      });
    });
  }).observe(document.body, { childList: true, subtree: true });
}

async function openDreamUrl(url) {
  const targetUrl = String(url || 'https://www.dream-singles.com/members/messaging/inbox').trim();
  if (!activeProfileId) {
    showProfileChoice();
    return { ok: false, error: 'Choose a profile first' };
  }
  if (window.agencyElectron?.openDreamUrl) {
    const result = await window.agencyElectron.openDreamUrl(activeProfileId, targetUrl);
    if (!result?.ok) throw new Error(result?.error || 'Could not open Dream window');
    return result;
  }
  window.open(targetUrl, '_blank', 'noopener,noreferrer');
  return { ok: true };
}

document.addEventListener('click', event => {
  const link = event.target.closest?.('a[href]');
  if (!link) return;
  const href = String(link.href || '');
  if (!/^https:\/\/([^/]+\.)?dream-singles\.com\//i.test(href)) return;
  event.preventDefault();
  event.stopPropagation();
  openDreamUrl(href).catch(error => alert(error.message || 'Could not open Dream window'));
}, true);

installMainPageZoom();
installGlobalThemeToggle();
installVisibleDreamBrowserTestButton();
installBrokenAvatarFallbacks();

const settingsParticlesDuration = 14000;
document.documentElement.style.setProperty(
  '--settings-particles-delay',
  `${-1 * (Date.now() % settingsParticlesDuration)}ms`
);

if (new URLSearchParams(window.location.search).has('disconnected')) {
  window.history.replaceState(null, '', window.location.pathname);
}

function settingsRouteRequested() {
  return new URLSearchParams(window.location.search).get('settings') === '1';
}

function setSettingsRoute(open) {
  const url = new URL(window.location.href);
  if (open) url.searchParams.set('settings', '1');
  else url.searchParams.delete('settings');
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

const tbody = document.getElementById('tbody');
const mainTableCard = document.querySelector('#favoritesView .table-card');
const menCount = document.getElementById('menCount');
const searchInput = document.getElementById('searchInput');
const onlineFilterBtn = document.getElementById('onlineFilterBtn');
const refreshBtn = document.getElementById('refreshBtn');

const favoritesList = document.getElementById('favoritesList');
const favoritesCount = document.getElementById('favoritesCount');
const agencyFavoritesMount = document.getElementById('agencyFavoritesMount');
const agencyChatFavoritesMount = document.getElementById('agencyChatFavoritesMount');
const agencyFavoritesTabs = document.getElementById('agencyFavoritesTabs');
const agencyFavoritesNoAccess = document.getElementById('agencyFavoritesNoAccess');
const agencyFavoritesContent = document.getElementById('agencyFavoritesContent');
const agencyFavoritesSearch = document.getElementById('agencyFavoritesSearch');
const agencyFavoritesRefreshBtn = document.getElementById('agencyFavoritesRefreshBtn');
const agencyFavoritesActions = document.getElementById('agencyFavoritesActions');
const agencyTopOnlineBtn = document.getElementById('agencyTopOnlineBtn');
const agencyFavoritesUpdateTodayBtn = document.getElementById('agencyFavoritesUpdateTodayBtn');
const agencyFavoritesScanAllBtn = document.getElementById('agencyFavoritesScanAllBtn');
const agencyChatFavoritesActions = document.getElementById('agencyChatFavoritesActions');
const agencyChatTopOnlineBtn = document.getElementById('agencyChatTopOnlineBtn');
const agencyChatManIdInput = document.getElementById('agencyChatManIdInput');
const agencyChatAddManBtn = document.getElementById('agencyChatAddManBtn');
const agencyInboxAuthorizeBtn = document.getElementById('agencyInboxAuthorizeBtn');
const agencyFavoritesAuthorizeBtn = document.getElementById('agencyFavoritesAuthorizeBtn');
let agencyProfilePowerToggle = document.getElementById('agencyProfilePowerToggle');
const AGENCY_FAVORITES_TAB_KEY = 'agencyos_favorites_tab';
let agencyFavoritesTab = localStorage.getItem(AGENCY_FAVORITES_TAB_KEY) === 'chat' ? 'chat' : 'favorites';
const AGENCY_DASHBOARD_MODE_KEY = 'agencyos_dashboard_mode';
let agencyTopOnlineActive = false;
let agencyTopOnlineTimer = null;
let agencyChatTopOnlineActive = false;
let agencyChatTopOnlineTimer = null;

const noteModal = document.getElementById('noteModal');
const noteModalName = document.getElementById('noteModalName');
const noteModalText = document.getElementById('noteModalText');
const noteModalClose = document.getElementById('noteModalClose');
const noteModalCancel = document.getElementById('noteModalCancel');
const noteModalSave = document.getElementById('noteModalSave');
const accessScreen = document.getElementById('accessScreen');
const accessTitle = document.getElementById('accessTitle');
const accessHint = document.getElementById('accessHint');
const usernameInput = document.getElementById('usernameInput');
const passwordInput = document.getElementById('passwordInput');
const accessBtn = document.getElementById('accessBtn');
const accessStatus = document.getElementById('accessStatus');
const rememberAccessRow = document.getElementById('rememberAccessRow');
const rememberAccessInput = document.getElementById('rememberAccessInput');
const mandarinHomeScreen = document.getElementById('mandarinHomeScreen');
const agencyShellUserName = document.getElementById('agencyShellUserName');
const agencyShellUserRole = document.getElementById('agencyShellUserRole');
const agencyShellAvatar = document.getElementById('agencyShellAvatar');
const agencyShellCollapse = document.getElementById('agencyShellCollapse');
const agencyShellUserMenuTrigger = document.getElementById('agencyShellUserMenuTrigger');
const agencyShellUserMenu = document.getElementById('agencyShellUserMenu');
const agencyShellLogoutBtn = document.getElementById('agencyShellLogoutBtn');
const agencyShellInlineLogoutBtn = document.getElementById('agencyShellInlineLogoutBtn');
const agencyShellWorkingLady = document.getElementById('agencyShellWorkingLady');
const agencyShellWorkingLadyAvatar = document.getElementById('agencyShellWorkingLadyAvatar');
const agencyShellWorkingLadyPhoto = document.getElementById('agencyShellWorkingLadyPhoto');
const agencyShellWorkingLadyInitial = document.getElementById('agencyShellWorkingLadyInitial');
const agencyShellWorkingLadyName = document.getElementById('agencyShellWorkingLadyName');
const agencyShellWorkingLadyId = document.getElementById('agencyShellWorkingLadyId');
const agencyGoogleDriveBtn = document.getElementById('agencyGoogleDriveBtn');
const agencyDriveModal = document.getElementById('agencyDriveModal');
const agencyDriveCloseBtn = document.getElementById('agencyDriveCloseBtn');
const agencyDriveList = document.getElementById('agencyDriveList');
const agencyBackBtn = document.getElementById('agencyBackBtn');
const agencyRefreshBtn = document.getElementById('agencyRefreshBtn');
const agencyAppUpdateBtn = document.getElementById('agencyAppUpdateBtn');
const agencyClearCacheBtn = document.getElementById('agencyClearCacheBtn');
const agencySettingsBtn = document.getElementById('agencySettingsBtn');
const agencySettingsModal = document.getElementById('agencySettingsModal');
const agencySettingsCloseBtn = document.getElementById('agencySettingsCloseBtn');
const agencySettingsContent = document.getElementById('agencySettingsContent');
const agencyZoomOutBtn = document.getElementById('agencyZoomOutBtn');
const agencyZoomInBtn = document.getElementById('agencyZoomInBtn');
const agencyAccountSearch = document.getElementById('agencyAccountSearch');
const agencyAccountCount = document.getElementById('agencyAccountCount');
const agencyAccountStatus = document.getElementById('agencyAccountStatus');
const agencyAccountRows = document.getElementById('agencyAccountRows');
const agencyAccountTableWrap = document.querySelector('.agency-account-table-wrap');
const agencyAddProfileBtn = document.getElementById('agencyAddProfileBtn');
const agencySalarySettingsBtn = document.getElementById('agencySalarySettingsBtn');
const agencyTranslatorSettingsBtn = document.getElementById('agencyTranslatorSettingsBtn');
const agencyAdminSettingsBtn = document.getElementById('agencyAdminSettingsBtn');
const agencySalaryPanel = document.getElementById('agencySalaryPanel');
const agencySalaryModal = document.getElementById('agencySalaryModal');
const agencySalaryBackdrop = document.getElementById('agencySalaryBackdrop');
const agencySalaryCloseBtn = document.getElementById('agencySalaryCloseBtn');
const agencySalaryAddRowBtn = document.getElementById('agencySalaryAddRowBtn');
const agencySalarySaveBtn = document.getElementById('agencySalarySaveBtn');
const agencySalaryRows = document.getElementById('agencySalaryRows');
const agencySalaryFeePercentInput = document.getElementById('agencySalaryFeePercentInput');
const agencySalaryStatus = document.getElementById('agencySalaryStatus');
const agencyTranslatorPanel = document.getElementById('agencyTranslatorPanel');
const agencyTranslatorProvider = document.getElementById('agencyTranslatorProvider');
const agencyTranslatorReadTarget = document.getElementById('agencyTranslatorReadTarget');
const agencyTranslatorReplyTarget = document.getElementById('agencyTranslatorReplyTarget');
const agencyTranslatorApiKey = document.getElementById('agencyTranslatorApiKey');
const agencyTranslatorSaveBtn = document.getElementById('agencyTranslatorSaveBtn');
const agencyTranslatorTestBtn = document.getElementById('agencyTranslatorTestBtn');
const agencyTranslatorTestInput = document.getElementById('agencyTranslatorTestInput');
const agencyTranslatorTestOutput = document.getElementById('agencyTranslatorTestOutput');
const agencyTranslatorStatus = document.getElementById('agencyTranslatorStatus');
const agencyAdminPanel = document.getElementById('agencyAdminPanel');
const agencyAdminUrl = document.getElementById('agencyAdminUrl');
const agencyAdminLogin = document.getElementById('agencyAdminLogin');
const agencyAdminPassword = document.getElementById('agencyAdminPassword');
const agencyAdminSaveBtn = document.getElementById('agencyAdminSaveBtn');
const agencyAdminTestBtn = document.getElementById('agencyAdminTestBtn');
const agencyAdminStatus = document.getElementById('agencyAdminStatus');
let agencyAdminFormEditing = false;
const agencyDashboardSearch = document.getElementById('agencyDashboardSearch');
const agencyDashboardCount = document.getElementById('agencyDashboardCount');
const agencyDashboardYear = document.getElementById('agencyDashboardYear');
const agencyDashboardMonths = document.getElementById('agencyDashboardMonths');
const agencyDashboardStartBalanceBtn = document.getElementById('agencyDashboardStartBalanceBtn');
const agencyDashboardBonusesBtn = document.getElementById('agencyDashboardBonusesBtn');
const agencyDashboardStatus = document.getElementById('agencyDashboardStatus');
const agencyDashboardList = document.getElementById('agencyDashboardList');
const agencyDashboardRows = document.getElementById('agencyDashboardRows');
const agencyDashboardSummary = document.getElementById('agencyDashboardSummary');
const agencyDashboardSummaryIncome = document.getElementById('agencyDashboardSummaryIncome');
const agencyDashboardSummaryGifts = document.getElementById('agencyDashboardSummaryGifts');
const agencyDashboardSummarySalary = document.getElementById('agencyDashboardSummarySalary');
const agencyDashboardBonuses = document.getElementById('agencyDashboardBonuses');
const agencyDashboardBonusesRows = document.getElementById('agencyDashboardBonusesRows');
const agencyDashboardBonusCalendarBtn = document.getElementById('agencyDashboardBonusCalendarBtn');
const agencyDashboardBonusFrom = document.getElementById('agencyDashboardBonusFrom');
const agencyDashboardBonusTo = document.getElementById('agencyDashboardBonusTo');
const agencyDashboardBonusProfile = document.getElementById('agencyDashboardBonusProfile');
const agencyDashboardBonusApplyBtn = document.getElementById('agencyDashboardBonusApplyBtn');
const agencyDashboardBonusTotal = document.getElementById('agencyDashboardBonusTotal');
const agencyDashboardBonusGifts = document.getElementById('agencyDashboardBonusGifts');
const agencyDashboardBonusLoader = document.getElementById('agencyDashboardBonusLoader');
const agencyDashboardCalendar = document.getElementById('agencyDashboardCalendar');
const agencyDashboardBackBtn = document.getElementById('agencyDashboardBackBtn');
const agencyDashboardCalendarYear = document.getElementById('agencyDashboardCalendarYear');
const agencyDashboardCalendarMonths = document.getElementById('agencyDashboardCalendarMonths');
const agencyDashboardCalendarName = document.getElementById('agencyDashboardCalendarName');
const agencyDashboardCalendarLogin = document.getElementById('agencyDashboardCalendarLogin');
const agencyDashboardCalendarGrid = document.getElementById('agencyDashboardCalendarGrid');
const agencyDashboardDayTotal = document.getElementById('agencyDashboardDayTotal');
const agencyDashboardDayTitle = document.getElementById('agencyDashboardDayTitle');
const agencyDashboardDayCount = document.getElementById('agencyDashboardDayCount');
const agencyDashboardProfiles = document.getElementById('agencyDashboardProfiles');
const profileSelect = document.getElementById('profileSelect');
const activeProfileAvatar = document.getElementById('activeProfileAvatar');
const activeProfileAvatarWrap = document.getElementById('activeProfileAvatarWrap');
const activeProfileName = document.getElementById('activeProfileName');
const activeProfileIdLabel = document.getElementById('activeProfileIdLabel');
const profileSwitcher = document.getElementById('profileSwitcher');
const profileSwitcherBtn = document.getElementById('profileSwitcherBtn');
const profileMenu = document.getElementById('profileMenu');
const adminBtn = document.getElementById('adminBtn');
const logoutBtn = document.getElementById('logoutBtn');
const openLadyBtn = document.getElementById('openLadyBtn');
const ladyConnectionGate = document.getElementById('ladyConnectionGate');
const workspaceEmbedFrame = document.getElementById('workspaceEmbedFrame');
const agencyInboxFrame = document.getElementById('agencyInboxFrame');
const agencyInboxNoAccess = document.getElementById('agencyInboxNoAccess');
const profileChoiceScreen = document.getElementById('profileChoiceScreen');
const profileChoiceList = document.getElementById('profileChoiceList');
const profileChoiceLogout = document.getElementById('profileChoiceLogout');
const profileChoiceSettings = document.getElementById('profileChoiceSettings');
const profileChoiceAdminPanel = document.getElementById('profileChoiceAdminPanel');
const ladyConnectingScreen = document.getElementById('ladyConnectingScreen');
const ladyConnectingPhoto = document.getElementById('ladyConnectingPhoto');
const ladyConnectingName = document.getElementById('ladyConnectingName');
const adminModal = document.getElementById('adminModal');
const adminClose = document.getElementById('adminClose');
const adminSignOutBtn = document.getElementById('adminSignOutBtn');
const openAddProfileModalBtn = document.getElementById('openAddProfileModalBtn');
const addProfileModal = document.getElementById('addProfileModal');

function reloadWorkspaceEmbed(reason = 'refresh') {
  [workspaceEmbedFrame, agencyInboxFrame].forEach(frame => {
    if (!frame) return;
    const currentSrc = frame.getAttribute('src') || 'workspace.html?embedded=1';
    const url = new URL(currentSrc, window.location.href);
    url.searchParams.set('embedded', '1');
    url.searchParams.set('autoloadInbox', reason === 'connect' ? '1' : '0');
    url.searchParams.set('v', `20260625-agency-inbox-${reason}-${Date.now()}`);
    frame.src = `${url.pathname.split('/').pop()}?${url.searchParams.toString()}`;
  });
}

function refreshWorkspaceEmbedInPlace(reason = 'refresh') {
  let sent = false;
  [workspaceEmbedFrame, agencyInboxFrame].forEach(frame => {
    if (!frame?.contentWindow) return;
    frame.contentWindow.postMessage({
      source: 'agencyos',
      type: 'AGENCY_WORKSPACE_REFRESH',
      reason
    }, '*');
    sent = true;
  });
  if (!sent) reloadWorkspaceEmbed(reason);
}
const cancelAddProfileBtn = document.getElementById('cancelAddProfileBtn');
const newProfileId = document.getElementById('newProfileId');
const newProfileName = document.getElementById('newProfileName');
const addProfileBtn = document.getElementById('addProfileBtn');
const profilesAdminList = document.getElementById('profilesAdminList');
const profileSendingModal = document.getElementById('profileSendingModal');
const profileSendingId = document.getElementById('profileSendingId');
const profileSendingName = document.getElementById('profileSendingName');
const profileSendingLogin = document.getElementById('profileSendingLogin');
const profileSendingPassword = document.getElementById('profileSendingPassword');
const profileGoogleDriveUrl = document.getElementById('profileGoogleDriveUrl');
const profileSendingStatus = document.getElementById('profileSendingStatus');
const closeProfileSendingBtn = document.getElementById('closeProfileSendingBtn');
const cancelProfileSendingBtn = document.getElementById('cancelProfileSendingBtn');
const syncProfileDreamBtn = document.getElementById('syncProfileDreamBtn');
const saveProfileSendingBtn = document.getElementById('saveProfileSendingBtn');
const directorAssignmentsSection = document.getElementById('directorAssignmentsSection');
const directorProfileChoices = document.getElementById('directorProfileChoices');
const saveDirectorProfilesBtn = document.getElementById('saveDirectorProfilesBtn');
const openAddUserModalBtn = document.getElementById('openAddUserModalBtn');
const teamMembersSection = document.querySelector('.team-members-section');
const operatorTranslatorSection = document.getElementById('operatorTranslatorSection');
const operatorTranslatorProvider = document.getElementById('operatorTranslatorProvider');
const operatorTranslatorReadTarget = document.getElementById('operatorTranslatorReadTarget');
const operatorTranslatorReplyTarget = document.getElementById('operatorTranslatorReplyTarget');
const operatorTranslatorApiKey = document.getElementById('operatorTranslatorApiKey');
const operatorTranslatorSaveBtn = document.getElementById('operatorTranslatorSaveBtn');
const operatorTranslatorStatus = document.getElementById('operatorTranslatorStatus');
const translatorLangOptions = document.querySelectorAll('.translator-lang-option');
const agencyAccessSection = document.getElementById('agencyAccessSection');
const agencyAccessUrl = document.getElementById('agencyAccessUrl');
const agencyAccessLogin = document.getElementById('agencyAccessLogin');
const agencyAccessPassword = document.getElementById('agencyAccessPassword');
const agencyAccessSaveBtn = document.getElementById('agencyAccessSaveBtn');
const agencyAccessTestBtn = document.getElementById('agencyAccessTestBtn');
const agencyAccessStatus = document.getElementById('agencyAccessStatus');
const salaryRatesSection = document.getElementById('salaryRatesSection');
const salaryRatesList = document.getElementById('salaryRatesList');
const salaryRateAddBtn = document.getElementById('salaryRateAddBtn');
const salaryRateSaveBtn = document.getElementById('salaryRateSaveBtn');
const salaryFeePercentInput = document.getElementById('salaryFeePercentInput');
const salaryRatesStatus = document.getElementById('salaryRatesStatus');
const addUserModal = document.getElementById('addUserModal');
const cancelAddUserBtn = document.getElementById('cancelAddUserBtn');
const newOperatorName = document.getElementById('newOperatorName');
const newOperatorLogin = document.getElementById('newOperatorLogin');
const newUserRole = document.getElementById('newUserRole');
const newUserRoleToggle = document.getElementById('newUserRoleToggle');
const newOperatorPassword = document.getElementById('newOperatorPassword');
const operatorProfileChoices = document.getElementById('operatorProfileChoices');
const addOperatorBtn = document.getElementById('addOperatorBtn');
const operatorsList = document.getElementById('operatorsList');
const userSettingsModal = document.getElementById('userSettingsModal');
const userSettingsId = document.getElementById('userSettingsId');
const editUserRole = document.getElementById('editUserRole');
const editUserRoleToggle = document.getElementById('editUserRoleToggle');
const editOperatorManagerBlock = document.getElementById('editOperatorManagerBlock');
const editOperatorManager = document.getElementById('editOperatorManager');
const editOperatorName = document.getElementById('editOperatorName');
const editOperatorLogin = document.getElementById('editOperatorLogin');
const editOperatorPassword = document.getElementById('editOperatorPassword');
const editOperatorAgencyBlock = document.getElementById('editOperatorAgencyBlock');
const editOperatorAgencyUrl = document.getElementById('editOperatorAgencyUrl');
const editOperatorAgencyLogin = document.getElementById('editOperatorAgencyLogin');
const editOperatorAgencyPassword = document.getElementById('editOperatorAgencyPassword');
const editOperatorAgencyStatus = document.getElementById('editOperatorAgencyStatus');
const editOperatorAgencyTestBtn = document.getElementById('editOperatorAgencyTestBtn');
const saveUserLoginBtn = document.getElementById('saveUserLoginBtn');
const saveResetPasswordBtn = document.getElementById('saveResetPasswordBtn');
const cancelUserSettingsBtn = document.getElementById('cancelUserSettingsBtn');
const closeUserSettingsBtn = document.getElementById('closeUserSettingsBtn');
const saveUserSettingsBtn = document.getElementById('saveUserSettingsBtn');
const deleteUserSettingsBtn = document.getElementById('deleteUserSettingsBtn');
const deleteUserConfirmModal = document.getElementById('deleteUserConfirmModal');
const cancelDeleteUserBtn = document.getElementById('cancelDeleteUserBtn');
const confirmDeleteUserBtn = document.getElementById('confirmDeleteUserBtn');
const deleteProfileConfirmModal = document.getElementById('deleteProfileConfirmModal');
const cancelDeleteProfileBtn = document.getElementById('cancelDeleteProfileBtn');
const confirmDeleteProfileBtn = document.getElementById('confirmDeleteProfileBtn');
const saveUserConfirmModal = document.getElementById('saveUserConfirmModal');
const cancelSaveUserConfirmBtn = document.getElementById('cancelSaveUserConfirmBtn');
const confirmSaveUserBtn = document.getElementById('confirmSaveUserBtn');
const syncConfirmModal = document.getElementById('syncConfirmModal');
const syncConfirmTitle = document.getElementById('syncConfirmTitle');
const syncConfirmText = document.getElementById('syncConfirmText');
const cancelSyncConfirmBtn = document.getElementById('cancelSyncConfirmBtn');
const confirmSyncBtn = document.getElementById('confirmSyncBtn');
const adminStatus = document.getElementById('adminStatus');
const extensionDot = document.getElementById('extensionDot');
const extensionStatus = document.getElementById('extensionStatus');
const extensionProgress = document.getElementById('extensionProgress');
const pageLimit = document.getElementById('pageLimit');
if (pageLimit) pageLimit.value = '10';
const dailySyncBtn = document.getElementById('dailySyncBtn');

function installNoAutofillInput(input) {
  if (!input) return;
  const unlock = () => {
    input.readOnly = false;
    input.setAttribute('autocomplete', 'off');
  };
  input.addEventListener('focus', unlock);
  input.addEventListener('pointerdown', unlock);
  input.addEventListener('keydown', unlock);
  setTimeout(() => {
    if (!input.matches(':focus')) input.value = '';
  }, 250);
}

installNoAutofillInput(operatorTranslatorApiKey);
installNoAutofillInput(agencyAccessPassword);
installNoAutofillInput(agencyAdminPassword);
installNoAutofillInput(editOperatorAgencyPassword);

function setTranslatorReadTarget(target, lang) {
  const normalized = lang === 'UK' ? 'UK' : 'RU';
  const input = operatorTranslatorReadTarget;
  if (input) input.value = normalized;
  translatorLangOptions.forEach(button => {
    if (button.dataset.translatorTarget !== target) return;
    button.classList.toggle('active', button.dataset.lang === normalized);
    button.setAttribute('aria-pressed', button.dataset.lang === normalized ? 'true' : 'false');
  });
}
const checkOnlineBtn = document.getElementById('checkOnlineBtn');
const fullSyncBtn = document.getElementById('fullSyncBtn');
const stopSyncBtn = document.getElementById('stopSyncBtn');
const sidebarCollapseBtn = document.getElementById('sidebarCollapseBtn');
const sidebarUserAvatar = document.getElementById('sidebarUserAvatar');
const sidebarUserName = document.getElementById('sidebarUserName');
const sidebarUserRole = document.getElementById('sidebarUserRole');
const favoritesNavBtn = document.getElementById('favoritesNavBtn');
const chatFavoritesNavBtn = document.getElementById('chatFavoritesNavBtn');
const workspaceNavLink = document.getElementById('workspaceNavLink');
const googleDriveNavBtn = document.getElementById('googleDriveNavBtn');
const myStatsNavBtn = document.getElementById('myStatsNavBtn');
const adminPanelNavBtn = document.getElementById('adminPanelNavBtn');
const statsModeTabs = document.getElementById('statsModeTabs');
const statsProfileBalanceBtn = document.getElementById('statsProfileBalanceBtn');
const statsMyBalanceBtn = document.getElementById('statsMyBalanceBtn');
const favoritesView = document.getElementById('favoritesView');
const chatFavoritesView = document.getElementById('chatFavoritesView');
const workspaceView = document.getElementById('workspaceView');
const myStatsView = document.getElementById('myStatsView');
const adminPanelView = document.getElementById('adminPanelView');
const adminPanelRefreshBtn = document.getElementById('adminPanelRefreshBtn');
const adminPanelCloseBtn = document.getElementById('adminPanelCloseBtn');
const adminPanelMonthInput = document.getElementById('adminPanelMonthInput');
const adminPanelMonthText = document.getElementById('adminPanelMonthText');
const adminPanelAdminSwitch = document.getElementById('adminPanelAdminSwitch');
const adminPanelTodayLabel = document.getElementById('adminPanelTodayLabel');
const adminPanelTotal = document.getElementById('adminPanelTotal');
const adminPanelOperatorsCount = document.getElementById('adminPanelOperatorsCount');
const adminPanelRowsCount = document.getElementById('adminPanelRowsCount');
const adminPanelStatus = document.getElementById('adminPanelStatus');
const adminPanelOperators = document.getElementById('adminPanelOperators');
let adminPanelLastResult = null;
let adminPanelSelectedDay = '';
let adminPanelSelectedMonth = localStorage.getItem('dream_crm_admin_month') || todayDateInputValue().slice(0, 7);
let adminPanelCellColors = {};
let adminPanelCellComments = {};
let adminPanelColorTarget = null;
let adminPanelColorPalette = null;
let adminPanelCommentEditor = null;
let adminPanelCommentTooltip = null;
let adminPanelCommentTarget = null;
let adminPanelMonthMenu = null;
let ownerSelectedAdminPanelId = localStorage.getItem('dream_crm_owner_admin_panel_id') || '';
let mentorSelectedAdminPanelId = localStorage.getItem('dream_crm_mentor_admin_panel_id') || '';

function syncAdminPanelViewportWidth() {
  if (!document.body.classList.contains('admin-panel-view-active')) return;
  const inner = Math.max(1, Number(window.innerWidth || 0));
  const outer = Math.max(0, Number(window.outerWidth || 0));
  const width = outer > inner * 1.2 ? outer : inner;
  document.documentElement.style.setProperty('--admin-panel-full-width', `${Math.round(width)}px`);
}
const myStatsFrom = document.getElementById('myStatsFrom');
const myStatsTo = document.getElementById('myStatsTo');
const myStatsLoadBtn = document.getElementById('myStatsLoadBtn');
const myStatsSummary = document.getElementById('myStatsSummary');
const myStatsBody = document.getElementById('myStatsBody');
const myStatsTransactionsCard = document.getElementById('myStatsTransactionsCard');
const fixedBalanceCard = document.getElementById('fixedBalanceCard');
const fixedBalanceRefreshBtn = document.getElementById('fixedBalanceRefreshBtn');
const fixedBalanceTotal = document.getElementById('fixedBalanceTotal');
const fixedBalanceBaseLabel = document.getElementById('fixedBalanceBaseLabel');
const fixedBalanceBase = document.getElementById('fixedBalanceBase');
const fixedBalancePercent = document.getElementById('fixedBalancePercent');
const fixedBalanceSalary = document.getElementById('fixedBalanceSalary');
const fixedBalanceCount = document.getElementById('fixedBalanceCount');
const fixedBalanceProfiles = document.getElementById('fixedBalanceProfiles');
const fixedBalanceOperators = document.getElementById('fixedBalanceOperators');
const fixedBalanceHistory = document.getElementById('fixedBalanceHistory');
const fixedBalanceRows = document.getElementById('fixedBalanceRows');
const salaryCalendarPrevBtn = document.getElementById('salaryCalendarPrevBtn');
const salaryCalendarNextBtn = document.getElementById('salaryCalendarNextBtn');
const salaryCalendarTitle = document.getElementById('salaryCalendarTitle');
const salaryCalendarGrid = document.getElementById('salaryCalendarGrid');
const salaryDayTitle = document.getElementById('salaryDayTitle');
const salaryDayTotal = document.getElementById('salaryDayTotal');
const salaryDayProfiles = document.getElementById('salaryDayProfiles');
const chatFavoritesBody = document.getElementById('chatFavoritesBody');
const chatFavoritesStatus = document.getElementById('chatFavoritesStatus');
const chatManIdInput = document.getElementById('chatManIdInput');
const chatAddManBtn = document.getElementById('chatAddManBtn');

let pendingDeleteProfileId = '';
let statsBalanceMode = localStorage.getItem('dream_crm_stats_balance_mode') === 'fixed' ? 'fixed' : 'profile';
let fixedBalanceProfileItems = [];
let fixedBalanceDailyItems = [];
let salaryCalendarMonth = '';
let selectedSalaryDate = '';
let agencyDashboardMonth = Number(dreamDateInputValue().slice(5, 7));
let agencyDashboardRowsData = [];
let agencyDashboardBonusesData = [];
let agencyDashboardBonusesTotal = 0;
let agencyDashboardBonusesGiftsTotal = 0;
let agencyDashboardMode = localStorage.getItem(AGENCY_DASHBOARD_MODE_KEY) === 'bonuses' ? 'bonuses' : 'total';
let agencyDashboardBonusDateInitialized = false;
let agencyDashboardCalendarData = null;
let agencyDashboardSelectedDate = '';
let agencyDashboardBalanceRefreshInFlight = false;
let agencyDashboardAutoBalanceTimer = null;
let myStatsRequestSeq = 0;

const profileModal = document.getElementById('profileModal');
const profileModalTitle = document.getElementById('profileModalTitle');
const profileUpdatedAt = document.getElementById('profileUpdatedAt');
const profileModalClose = document.getElementById('profileModalClose');
const profileLoading = document.getElementById('profileLoading');
const profileError = document.getElementById('profileError');
const profileContent = document.getElementById('profileContent');

const extensionRequests = new Map();

const STATUSES = ['-', 'SERIOUS', 'SEXTER', 'OTHER'];

const ICON_INBOX = `
  <svg viewBox="0 0 24 24">
    <rect x="3" y="5" width="18" height="14" rx="2"></rect>
    <path d="M4 7l8 6 8-6"></path>
  </svg>
`;

const ICON_PROFILE = `
  <svg viewBox="0 0 24 24">
    <circle cx="12" cy="8" r="4"></circle>
    <path d="M5 20c1.5-4 12.5-4 14 0"></path>
  </svg>
`;

const ICON_DELETE = `
  <svg class="delete-x-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 7l10 10M17 7L7 17"></path>
  </svg>
`;

function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('X-Profile-ID', activeProfileId);
  return fetch(url, { ...options, headers }).catch(error => {
    throw new Error(error?.message === 'Failed to fetch'
      ? 'CRM server is not responding. Restart the local server and try again.'
      : (error?.message || 'Network request failed'));
  });
}

function extensionCommand(command, payload = {}, timeout = 30000) {
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

    window.postMessage({ type: 'DREAM_CRM_COMMAND', requestId, command, payload }, '*');
  });
}

async function serverProfileRequest(action, options = {}) {
  if (!activeProfileId) throw new Error('No profile selected');
  return serverProfileRequestFor(activeProfileId, action, options);
}

async function serverProfileRequestFor(profileId, action, options = {}) {
  const id = String(profileId || '');
  if (!id) throw new Error('No profile selected');
  const headers = new Headers({ 'Content-Type': 'application/json', ...(options.headers || {}) });
  headers.set('X-Profile-ID', id);
  const response = await fetch(`/api/profiles/${encodeURIComponent(id)}/${action}`, {
    method: options.method || 'POST',
    headers,
    body: options.body === undefined ? '{}' : JSON.stringify(options.body)
  }).catch(error => {
    throw new Error(error?.message === 'Failed to fetch'
      ? 'CRM server is not responding. Restart the local server and try again.'
      : (error?.message || 'Network request failed'));
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) throw new Error(result.error || 'Server Dream Singles request failed');
  return result;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function translateExtensionMessage(message = '') {
  return String(message)
    .replace('Р“РѕС‚РѕРІРѕ Рє СЃР±РѕСЂСѓ', 'Ready to scan')
    .replace('РџСЂРѕРІРµСЂРєР° РіРѕС‚РѕРІРЅРѕСЃС‚Рё...', 'Checking Readiness...')
    .replace('РЎР±РѕСЂ РѕСЃС‚Р°РЅРѕРІР»РµРЅ', 'Scan stopped')
    .replace('РћС‚РєСЂС‹РІР°СЋ Inbox...', 'Opening Inbox...')
    .replace('РўСЂРµР±СѓРµС‚СЃСЏ РІРѕР№С‚Рё РІ Dream Singles', 'Dream Singles Login Is Required')
    .replace('РџСЂРѕС„РёР»СЊ РѕР±РЅРѕРІР»С‘РЅ', 'Profile Updated')
    .replace(/РћР±РЅРѕРІР»СЏСЋ РїСЂРѕС„РёР»СЊ/g, 'Updating Profile')
    .replace(/РЎР±РѕСЂ: СЃС‚СЂР°РЅРёС†Р°/g, 'Scanning Page')
    .replace(/Р“РѕС‚РѕРІРѕ:/g, 'Done:')
    .replace(/РјСѓР¶С‡РёРЅ/g, 'men')
    .replace(/СЃС‚СЂР°РЅРёС†/g, 'pages');
}

function showExtensionStatus(status = {}) {
  const wasConnected = ladyConnected;
  const silentOnlineCheck = String(status.phase || '').startsWith('online-');
  const scanProgressVisible = !silentOnlineCheck && ['running', 'done', 'stopped', 'error'].includes(String(status.phase || ''));
  extensionStatus.textContent = silentOnlineCheck
    ? 'Ready To Scan'
    : (translateExtensionMessage(status.message) || 'Extension Is Not Connected');
  extensionProgress.textContent = scanProgressVisible
    ? `P: ${Number(status.pages || 0)} - Men: ${Number(status.men || 0)}`
    : '';
  extensionDot.className = 'extension-dot';
  if (status.phase === 'running' || status.phase === 'profile') extensionDot.classList.add('running');
  else if (status.ready) extensionDot.classList.add('ready');

  const scanRunning = status.phase === 'running';
  scanIsRunning = scanRunning;
  if (scanRunning && activeSyncMode) startSyncDots(activeSyncMode);
  if (!scanRunning && ['done', 'stopped', 'error'].includes(String(status.phase || ''))) stopSyncDots();
  if (!scanRunning && !['profile', 'online-check'].includes(String(status.phase || ''))) activeSyncMode = '';
  const busy = scanRunning || status.phase === 'online-check';
  dailySyncBtn.disabled = busy;
  if (checkOnlineBtn) checkOnlineBtn.disabled = busy || onlineRefreshInProgress;
  fullSyncBtn.disabled = status.phase === 'online-check';
  const progressText = scanProgressVisible
    ? `Status: ${extensionProgress.textContent || translateExtensionMessage(status.message) || 'Working'}`
    : (translateExtensionMessage(status.message) || 'Ready to scan');
  const updateHint = scanRunning && activeSyncMode === 'daily'
    ? progressText
    : 'Update: scans Inbox and refreshes recent unanswered letters.';
  const fullHint = scanRunning && activeSyncMode === 'full'
    ? progressText
    : (scanRunning ? 'Full Scan is running. Click to stop it.' : 'Full Scan: scans all favorite men and loads their letter status.');
  if (!syncDotsTimer) paintSyncButtons('');
  delete dailySyncBtn.dataset.tooltip;
  delete fullSyncBtn.dataset.tooltip;
  dailySyncBtn.setAttribute('title', updateHint);
  fullSyncBtn.setAttribute('title', fullHint);
  dailySyncBtn.setAttribute('aria-label', updateHint);
  fullSyncBtn.setAttribute('aria-label', fullHint);
  agencyFavoritesUpdateTodayBtn?.setAttribute('title', activeSyncMode === 'daily'
    ? updateHint
    : 'Update Today: scan 3 inbox pages and refresh recent men');
  agencyFavoritesScanAllBtn?.setAttribute('title', activeSyncMode === 'full'
    ? fullHint
    : 'Scan All: scan inbox pages according to the page limit');
  fullSyncBtn.classList.toggle('scan-stop-mode', scanRunning);
  if (stopSyncBtn) {
    stopSyncBtn.disabled = true;
    stopSyncBtn.classList.add('hidden-control');
  }
  if (!ladyDisconnectInProgress) {
    if (Boolean(activeProfileId) && status.ready === true) {
      ladyConnected = true;
    } else if (!status.checking) {
      ladyConnected = false;
    }
  }
  if (!status.checking && activeProfileId) {
    if (!ladyDisconnectInProgress && ladyConnected) localStorage.setItem(`dream_team_lady_connected_${activeProfileId}`, '1');
    else if (!ladyDisconnectInProgress) localStorage.removeItem(`dream_team_lady_connected_${activeProfileId}`);
    document.body.classList.remove('lady-session-checking');
    ladyConnectingScreen?.classList.add('hidden');
  }
  updateLadyConnectionButton();
  syncAgencyNavLocks();
  if (!wasConnected && ladyConnected && currentUser && activeProfileId) {
    loadMen(false).then(() => {
      if (currentView === 'chat') loadChatFavorites(false);
    });
  }
}

function paintSyncButtons(mode = '') {
  const dots = mode ? '.'.repeat(syncDotsCount || 1) : '';
  if (dailySyncBtn) dailySyncBtn.textContent = mode === 'daily' ? `Update${dots}` : 'Update';
  if (fullSyncBtn) fullSyncBtn.textContent = mode === 'full' ? `Full Scan${dots}` : 'Full Scan';
  if (agencyFavoritesUpdateTodayBtn) agencyFavoritesUpdateTodayBtn.textContent = mode === 'daily' ? `Update Today${dots}` : 'Update Today';
  if (agencyFavoritesScanAllBtn) agencyFavoritesScanAllBtn.textContent = mode === 'full' ? `Scan All${dots}` : 'Scan All';
  dailySyncBtn?.classList.toggle('sync-working', mode === 'daily');
  fullSyncBtn?.classList.toggle('sync-working', mode === 'full');
  agencyFavoritesUpdateTodayBtn?.classList.toggle('sync-working', mode === 'daily');
  agencyFavoritesScanAllBtn?.classList.toggle('sync-working', mode === 'full');
}

function startSyncDots(mode) {
  pendingSyncMode = mode === 'full' ? 'full' : mode === 'daily' ? 'daily' : '';
  if (!pendingSyncMode) {
    stopSyncDots();
    return;
  }
  if (syncDotsTimer) window.clearInterval(syncDotsTimer);
  syncDotsCount = 1;
  paintSyncButtons(pendingSyncMode);
  syncDotsTimer = window.setInterval(() => {
    syncDotsCount = (syncDotsCount % 3) + 1;
    paintSyncButtons(pendingSyncMode);
  }, 350);
}

function stopSyncDots() {
  if (syncDotsTimer) window.clearInterval(syncDotsTimer);
  syncDotsTimer = null;
  syncDotsCount = 0;
  pendingSyncMode = '';
  paintSyncButtons('');
}

function showPendingSyncButton(mode = '') {
  if (mode === 'daily' || mode === 'full') startSyncDots(mode);
  else stopSyncDots();
}

function updateLadyConnectionButton() {
  if (!openLadyBtn) return;
  openLadyBtn.textContent = ladyConnected ? 'Disconnect' : 'Connect My Lady';
  openLadyBtn.classList.toggle('connected', ladyConnected);
  logoutBtn?.classList.toggle('profile-online', ladyConnected);
  logoutBtn?.setAttribute('title', ladyConnected ? 'Logout profile' : 'Profile is offline');
  logoutBtn?.setAttribute('aria-label', ladyConnected ? 'Logout profile' : 'Profile is offline');
  syncAgencyProfilePowerToggle();
  renderSidebarProfileDock();
  document.body.classList.toggle('lady-disconnected', !ladyConnected);
  ladyConnectionGate?.classList.add('hidden');
  if (!ladyConnected) {
    currentView = 'workspace';
    localStorage.setItem('dream_crm_view', 'workspace');
    allMen = [];
    chatFavoriteMen = [];
    clearMainVirtualState();
    clearFavoritesVirtualState();
    clearChatVirtualState();
    if (tbody) tbody.innerHTML = '';
    if (chatFavoritesBody) chatFavoritesBody.innerHTML = '';
    updateCounter();
  }
}

function connectedProfileIds() {
  return availableProfiles
    .filter(profile => localStorage.getItem(`dream_team_lady_connected_${profile.id}`) === '1')
    .map(profile => String(profile.id));
}

function ensureSidebarProfileDock() {
  let dock = document.getElementById('sidebarProfileDock');
  if (!dock) {
    dock = document.createElement('div');
    dock.id = 'sidebarProfileDock';
    dock.className = 'sidebar-profile-dock';
  }
  const shellSidebar = mandarinHomeScreen?.querySelector('.agency-shell-sidebar');
  const legacyLogoutButton = document.getElementById('logoutBtn');
  const host = shellSidebar || legacyLogoutButton?.parentElement || null;
  if (host && dock.parentElement !== host) {
    const beforeNode = shellSidebar
      ? document.getElementById('agencyShellUserMenuTrigger')
      : legacyLogoutButton;
    host.insertBefore(dock, beforeNode && beforeNode.parentElement === host ? beforeNode : null);
  }
  return dock;
}

function renderSidebarProfileDock() {
  const dock = ensureSidebarProfileDock();
  if (!dock) return;
  if (isWebsiteAdminSession()) {
    dock.innerHTML = '';
    dock.classList.add('hidden');
    return;
  }
  if (!currentUser || !availableProfiles.length) {
    dock.innerHTML = '';
    dock.classList.add('hidden');
    return;
  }
  dock.classList.remove('hidden');
  dock.innerHTML = `
    <div class="sidebar-profile-dock-head">
      <span>Authorization</span>
      <button type="button" data-profile-connect-all>All online</button>
    </div>
    <div class="sidebar-profile-dock-list">
      ${availableProfiles.map(profile => {
        const connected = localStorage.getItem(`dream_team_lady_connected_${profile.id}`) === '1';
        const connecting = profileConnectingIds.has(String(profile.id));
        const active = String(profile.id) === String(activeProfileId);
        const name = profile.name && profile.name !== `Profile ${profile.id}` ? profile.name : profile.id;
        const initial = String(name || profile.id || '?').slice(0, 1).toUpperCase();
        const statusText = connecting ? 'Logging in' : connected ? 'Online' : 'Click to login';
        return `
          <div class="sidebar-profile-dock-item ${active ? 'active' : ''} ${connected ? 'online' : ''} ${connecting ? 'connecting' : ''} ${active && connected ? 'active-online' : ''}" data-profile-id="${escapeAttr(profile.id)}" title="${escapeAttr(name)} - ${escapeAttr(profile.id)}">
            <span class="sidebar-profile-dock-avatar ${profile.photoUrl ? '' : 'no-photo'}">${profile.photoUrl ? `<img src="${escapeAttr(profile.photoUrl)}" alt="">` : escapeHtml(initial)}</span>
            <span class="sidebar-profile-dock-copy"><strong>${escapeHtml(name)}</strong><small>${escapeHtml(statusText)}${connecting ? '<i class="login-dots"><b></b><b></b><b></b></i>' : ''}</small></span>
            <button class="sidebar-profile-power ${connected ? 'logout' : 'login'}" type="button" data-profile-power-id="${escapeAttr(profile.id)}" ${connecting ? 'disabled' : ''}>${connecting ? '...' : connected ? 'Off' : 'On'}</button>
          </div>`;
      }).join('')}
    </div>
  `;
  syncAgencyNavLocks();
}

function isProfileWorkView(view) {
  return ['inbox', 'favorites', 'letterbot', 'sender'].includes(String(view || ''));
}

function isActiveProfileOnline() {
  return Boolean(activeProfileId) && (
    ladyConnected ||
    localStorage.getItem(`dream_team_lady_connected_${activeProfileId}`) === '1'
  );
}

function syncAgencyNavLocks() {
  const profileReady = isActiveProfileOnline();
  mandarinHomeScreen?.querySelectorAll('.agency-shell-nav-item[data-agency-view]').forEach(item => {
    const hiddenForWebsiteAdmin = isWebsiteAdminSession() && isProfileWorkView(item.dataset.agencyView);
    const locked = hiddenForWebsiteAdmin || (isProfileWorkView(item.dataset.agencyView) && !profileReady);
    item.classList.toggle('is-profile-hidden', locked);
    item.classList.toggle('is-profile-locked', locked);
    item.disabled = locked;
    if (locked) {
      item.setAttribute('aria-disabled', 'true');
      item.setAttribute('title', 'First connect a profile below');
    } else {
      item.removeAttribute('aria-disabled');
      item.removeAttribute('title');
    }
  });
  const currentPanel = normalizeAgencyPanel(localStorage.getItem(AGENCY_PANEL_KEY) || 'home');
  if (!profileReady && isProfileWorkView(currentPanel)) {
    activateAgencyPanel('home', { persist: false });
  }
}

async function connectProfileById(profileId, options = {}) {
  const id = String(profileId || '');
  const profile = availableProfiles.find(item => String(item.id) === id);
  if (!profile) throw new Error('Profile is not assigned to you');
  if (profileConnectingIds.has(id)) return null;
  profileConnectingIds.add(id);
  renderSidebarProfileDock();
  try {
    const result = await serverProfileRequestFor(id, 'server-connect', {
      body: { syncInbox: options.syncInbox !== false, maxPages: options.maxPages || 3 }
    });
    if (window.agencyElectron?.prepareDreamProfile) {
      window.agencyElectron.prepareDreamProfile(id).catch(error => {
        console.warn('Could not prepare Electron Dream profile:', error);
      });
    }
    localStorage.setItem(`dream_team_lady_connected_${id}`, '1');
    return result;
  } finally {
    profileConnectingIds.delete(id);
    renderSidebarProfileDock();
  }
}

async function switchWorkingProfile(profileId, options = {}) {
  const id = String(profileId || '');
  const profile = availableProfiles.find(item => String(item.id) === id);
  if (!profile) return;
  activeProfileId = id;
  localStorage.setItem('dream_crm_profile_id', id);
  if (profileSelect) profileSelect.value = id;
  ladyConnected = localStorage.getItem(`dream_team_lady_connected_${id}`) === '1';
  renderProfileSwitcher(profile);
  updateLadyConnectionButton();
  renderSidebarProfileDock();
  reloadWorkspaceEmbed(options.reason || 'switch-profile');
  allMen = [];
  chatFavoriteMen = [];
  clearMainVirtualState();
  clearFavoritesVirtualState();
  clearChatVirtualState();
  if (tbody) tbody.innerHTML = '';
  if (chatFavoritesBody) chatFavoritesBody.innerHTML = '';
  updateCounter();
  if (ladyConnected) {
    if (currentView === 'chat') await loadChatFavorites().catch(() => {});
    else await loadMen(false).catch(() => {});
    if (document.body.classList.contains('mandarin-home-active')) {
      if ((localStorage.getItem(AGENCY_PANEL_KEY) || '') === 'favorites') activateAgencyPanel('favorites', { reloadFavorites: true, persist: false });
      if ((localStorage.getItem(AGENCY_PANEL_KEY) || '') === 'inbox') activateAgencyPanel('inbox', { reloadInbox: true, persist: false });
    }
  }
}

async function connectAllProfiles() {
  const previousProfileId = activeProfileId;
  const errors = [];
  for (const profile of availableProfiles) {
    try {
      await connectProfileById(profile.id, { syncInbox: false, maxPages: 1 });
    } catch (error) {
      errors.push(`${profile.name || profile.id}: ${error.message || error}`);
    }
  }
  renderSidebarProfileDock();
  if (previousProfileId && availableProfiles.some(profile => profile.id === previousProfileId)) {
    await switchWorkingProfile(previousProfileId, { reason: 'connect-all' });
  } else if (availableProfiles[0]) {
    await switchWorkingProfile(availableProfiles[0].id, { reason: 'connect-all' });
  }
  if (errors.length) alert(`Some profiles were not connected:\n${errors.join('\n')}`);
}

async function disconnectProfileById(profileId, reason = 'sidebar-profile-power') {
  const id = String(profileId || '');
  if (!id) return;
  profileConnectingIds.add(id);
  renderSidebarProfileDock();
  try {
    if (window.agencyElectron?.logoutDreamProfile) {
      await window.agencyElectron.logoutDreamProfile(id).catch(error => {
        console.warn('Could not logout Electron Dream profile:', error);
      });
    }
    await serverProfileRequestFor(id, 'server-disconnect', { body: {} }).catch(error => {
      const message = String(error?.message || '');
      if (!/logout was not confirmed/i.test(message)) throw error;
    });
    localStorage.removeItem(`dream_team_lady_connected_${id}`);
    if (String(activeProfileId) === id) {
      ladyConnected = false;
      clearDisconnectedLady(id, reason);
      if (document.body.classList.contains('mandarin-home-active')) {
        syncAgencyInboxAccess();
        syncAgencyFavoritesAccess();
        activateAgencyPanel('home', { persist: false });
      }
    }
  } finally {
    profileConnectingIds.delete(id);
    renderSidebarProfileDock();
    updateLadyConnectionButton();
  }
}

function syncAgencyProfilePowerToggle() {
  agencyProfilePowerToggle = ensureAgencyProfilePowerToggle();
  syncAgencyShellWorkingLady();
  if (!agencyProfilePowerToggle) return;
  const storedConnected = Boolean(activeProfileId) && localStorage.getItem(`dream_team_lady_connected_${activeProfileId}`) === '1';
  if (storedConnected && !ladyConnected) ladyConnected = true;
  const visible = Boolean(currentUser && activeProfileId && (ladyConnected || storedConnected) && document.body.classList.contains('mandarin-home-active'));
  agencyProfilePowerToggle.classList.toggle('hidden', !visible);
  agencyProfilePowerToggle.classList.toggle('is-online', visible);
  agencyProfilePowerToggle.disabled = ladyDisconnectInProgress;
  agencyProfilePowerToggle.setAttribute('title', visible ? 'Disconnect profile' : 'Profile is offline');
  agencyProfilePowerToggle.setAttribute('aria-label', visible ? 'Disconnect profile' : 'Profile is offline');
  const label = agencyProfilePowerToggle.querySelector('.agency-profile-power-label');
  if (label) label.textContent = visible ? 'Online' : 'Offline';
  syncAgencyNavLocks();
}

function getAgencyWorkingLadyProfile() {
  const profileId = String(activeProfileId || '');
  if (!profileId) return null;
  return availableProfiles.find(profile => String(profile.id || '') === profileId)
    || agencyProfiles.find(profile => String(profile.id || '') === profileId)
    || null;
}

function syncAgencyShellWorkingLady() {
  if (!agencyShellWorkingLady) return;
  agencyShellWorkingLady.classList.add('hidden');
  return;
  const storedConnected = Boolean(activeProfileId) && localStorage.getItem(`dream_team_lady_connected_${activeProfileId}`) === '1';
  const visible = Boolean(currentUser && activeProfileId && (ladyConnected || storedConnected) && document.body.classList.contains('mandarin-home-active'));
  agencyShellWorkingLady.classList.toggle('hidden', !visible);
  if (!visible) return;

  const profile = getAgencyWorkingLadyProfile();
  const profileName = profile?.name && profile.name !== `Profile ${profile.id}`
    ? profile.name
    : 'Lady';
  const profileId = profile?.id || activeProfileId || '';
  const photoUrl = String(profile?.photoUrl || '').trim();

  if (agencyShellWorkingLadyName) agencyShellWorkingLadyName.textContent = profileName;
  if (agencyShellWorkingLadyId) agencyShellWorkingLadyId.textContent = profileId ? `ID ${profileId}` : 'ID';
  if (agencyShellWorkingLadyInitial) agencyShellWorkingLadyInitial.textContent = (profileName || 'L').slice(0, 1).toUpperCase();
  if (agencyShellWorkingLadyPhoto) {
    agencyShellWorkingLadyPhoto.src = photoUrl;
    agencyShellWorkingLadyPhoto.alt = profileName;
  }
  agencyShellWorkingLadyAvatar?.classList.toggle('no-photo', !photoUrl);
}

function ensureAgencyProfilePowerToggle() {
  let button = document.getElementById('agencyProfilePowerToggle');
  if (button) button.remove();
  return null;
  button = document.createElement('button');
  button.id = 'agencyProfilePowerToggle';
  button.className = 'agency-profile-power-toggle hidden';
  button.type = 'button';
  button.title = 'Disconnect profile';
  button.setAttribute('aria-label', 'Disconnect profile');
  button.innerHTML = `
    <span class="agency-profile-power-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2v10"></path>
        <path d="M18.4 6.6a8 8 0 1 1-12.8 0"></path>
      </svg>
    </span>
    <span class="agency-profile-power-label">Online</span>
  `;
  document.body.appendChild(button);
  return button;
}

async function disconnectCurrentLady(reason = 'off') {
  const disconnectedProfileId = activeProfileId;
  if (!disconnectedProfileId && !ladyConnected) {
    showProfileChoice();
    return true;
  }

  ladyDisconnectInProgress = true;
  try {
    if (disconnectedProfileId && window.agencyElectron?.logoutDreamProfile) {
      await window.agencyElectron.logoutDreamProfile(disconnectedProfileId).catch(error => {
        console.warn('Could not logout Electron Dream profile:', error);
      });
    }
    if (disconnectedProfileId) {
      await serverProfileRequest('server-disconnect', { body: {} });
    }
  } catch (error) {
    const message = String(error?.message || '');
    if (!/logout was not confirmed/i.test(message)) {
      throw error;
    }
  } finally {
    ladyDisconnectInProgress = false;
  }

  try {
    clearDisconnectedLady(disconnectedProfileId, reason);
    if (document.body.classList.contains('mandarin-home-active')) {
      syncAgencyInboxAccess();
      syncAgencyFavoritesAccess();
      activateAgencyPanel('home', { persist: false });
    } else {
      await switchView('workspace');
      showProfileChoice();
    }
  } finally {
    updateLadyConnectionButton();
  }
  return true;
}

function clearDisconnectedLady(disconnectedProfileId, reason = 'off') {
  if (disconnectedProfileId) {
    localStorage.removeItem(`dream_team_lady_connected_${disconnectedProfileId}`);
  }
  ladyConnected = false;
  activeProfileId = '';
  currentView = 'workspace';
  localStorage.removeItem('dream_crm_profile_id');
  localStorage.setItem('dream_crm_view', 'workspace');
  if (profileSelect) profileSelect.value = '';
  allMen = [];
  chatFavoriteMen = [];
  clearMainVirtualState();
  clearFavoritesVirtualState();
  clearChatVirtualState();
  if (tbody) tbody.innerHTML = '';
  if (chatFavoritesBody) chatFavoritesBody.innerHTML = '';
  updateCounter();
  renderProfileSwitcher();
  reloadWorkspaceEmbed(reason);
}

async function toggleLadyConnection() {
  if (!activeProfileId) {
    showProfileChoice();
    return { ok: false, connected: false, error: 'No profile selected' };
  }
  openLadyBtn.disabled = true;
  openLadyBtn.textContent = ladyConnected ? 'Disconnecting...' : 'Connecting...';
  try {
    if (ladyConnected) {
      await disconnectCurrentLady('off');
      return { ok: true, connected: false };
    }
    const connected = await connectSelectedLady();
    return { ok: connected === true, connected: ladyConnected };
  } finally {
    openLadyBtn.disabled = false;
    updateLadyConnectionButton();
  }
}

window.addEventListener('message', event => {
  const workspaceCommandFrame = [workspaceEmbedFrame, agencyInboxFrame].find(frame => frame?.contentWindow === event.source);
  if (event.data?.source === 'dream-workspace' && event.data?.type === 'OPEN_AGENCY_HOME' && workspaceCommandFrame) {
    activateAgencyPanel('home', { persist: false });
    return;
  }
  if (event.data?.type === 'DREAM_CRM_WORKSPACE_COMMAND' && workspaceCommandFrame) {
    const { requestId, command, payload, timeout } = event.data;
    if (command === 'TOGGLE_LADY_CONNECTION') {
      toggleLadyConnection()
        .then(response => {
          workspaceCommandFrame.contentWindow?.postMessage({
            type: 'DREAM_CRM_WORKSPACE_RESPONSE',
            requestId,
            response
          }, '*');
        })
        .catch(error => {
          workspaceCommandFrame.contentWindow?.postMessage({
            type: 'DREAM_CRM_WORKSPACE_RESPONSE',
            requestId,
            response: { ok: false, connected: ladyConnected, error: error.message || 'Connection error' }
          }, '*');
        });
      return;
    }
    if (command === 'READ_WORKSPACE_LETTER') {
      apiFetch('/api/workspace/read-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(payload || {}), sourceProfileId: activeProfileId })
      })
        .then(response => response.json())
        .then(response => {
          workspaceCommandFrame.contentWindow?.postMessage({
            type: 'DREAM_CRM_WORKSPACE_RESPONSE',
            requestId,
            response
          }, '*');
        })
        .catch(error => {
          workspaceCommandFrame.contentWindow?.postMessage({
            type: 'DREAM_CRM_WORKSPACE_RESPONSE',
            requestId,
            response: { ok: false, error: error.message || 'Server letter read error' }
          }, '*');
        });
      return;
    }
    if (command === 'SEND_WORKSPACE_REPLY') {
      apiFetch('/api/workspace/send-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(payload || {}), sourceProfileId: activeProfileId })
      })
        .then(response => response.json())
        .then(response => {
          workspaceCommandFrame.contentWindow?.postMessage({
            type: 'DREAM_CRM_WORKSPACE_RESPONSE',
            requestId,
            response
          }, '*');
        })
        .catch(error => {
          workspaceCommandFrame.contentWindow?.postMessage({
            type: 'DREAM_CRM_WORKSPACE_RESPONSE',
            requestId,
            response: { ok: false, error: error.message || 'Server reply send error' }
          }, '*');
        });
      return;
    }
    if (command === 'OPEN_DREAM_URL') {
      openDreamUrl(payload?.url)
        .then(response => {
          workspaceCommandFrame.contentWindow?.postMessage({
            type: 'DREAM_CRM_WORKSPACE_RESPONSE',
            requestId,
            response
          }, '*');
        })
        .catch(error => {
          workspaceCommandFrame.contentWindow?.postMessage({
            type: 'DREAM_CRM_WORKSPACE_RESPONSE',
            requestId,
            response: { ok: false, error: error.message || 'Could not open Dream window' }
          }, '*');
        });
      return;
    }
    extensionCommand(command, payload || {}, Number(timeout) || 45000)
      .then(response => {
        workspaceCommandFrame.contentWindow?.postMessage({
          type: 'DREAM_CRM_WORKSPACE_RESPONSE',
          requestId,
          response
        }, '*');
      })
      .catch(error => {
        workspaceCommandFrame.contentWindow?.postMessage({
          type: 'DREAM_CRM_WORKSPACE_RESPONSE',
          requestId,
          response: { ok: false, error: error.message || 'Extension error' }
        }, '*');
      });
    return;
  }

  if (event.source !== window) return;

  if (event.data?.type === 'DREAM_CRM_RESPONSE') {
    const callback = extensionRequests.get(event.data.requestId);
    if (callback) {
      extensionRequests.delete(event.data.requestId);
      callback(event.data.response);
    }
  }

  if (event.data?.type === 'DREAM_CRM_STATUS') {
    showExtensionStatus(event.data.status);
    [workspaceEmbedFrame, agencyInboxFrame].forEach(frame => {
      frame?.contentWindow?.postMessage({
        type: 'DREAM_CRM_STATUS',
        status: event.data.status
      }, '*');
    });
    if (event.data.status?.phase === 'done' && activeProfileId) {
      loadMen(false);
      if (currentView === 'chat') loadChatFavorites();
    }
  }
  if (event.data?.type === 'DREAM_CRM_BRIDGE_READY') {
    if (!activeProfileId) {
      showExtensionStatus({ ready: false, message: 'No profile connected' });
      return;
    }
    serverProfileRequest('server-status', { method: 'GET', body: undefined })
      .then(response => showExtensionStatus({
        phase: response.status?.connected ? 'server-connected' : 'server-idle',
        ready: response.status?.connected === true,
        message: response.status?.connected ? 'Server connected' : 'Server is not connected'
      }))
      .catch(() => showExtensionStatus({ ready: false, message: 'Server is not connected' }));
  }
});

function normalizeLoadOptions(options = {}) {
  return typeof options === 'object' && options !== null ? options : {};
}

function scheduleAutoOnlineRefresh() {
  if (!activeProfileId || !ladyConnected || !allMen.length) return;
  if (autoOnlineRefreshProfileId === String(activeProfileId)) return;
  autoOnlineRefreshProfileId = String(activeProfileId);
  if (autoOnlineRefreshTimer) clearTimeout(autoOnlineRefreshTimer);
  autoOnlineRefreshTimer = setTimeout(() => {
    autoOnlineRefreshTimer = null;
    checkOnlineSnapshot({ silent: true, skipReloadAuto: true });
  }, 900);
}

async function loadMen(options = {}) {
  const loadOptions = normalizeLoadOptions(options);
  if (!ladyConnected) {
    allMen = [];
    clearMainVirtualState();
    clearFavoritesVirtualState();
    if (tbody) tbody.innerHTML = '';
    updateCounter();
    updateAgencyFavoritesCount();
    return;
  }
  try {
    const res = await apiFetch('/api/men');
    if (!res.ok) throw new Error('Access denied');
    const data = await res.json();

    allMen = (data.men || []).map(man => ({
      ...man,
      onlineNow: man.onlineNow === true || /^Online\s+now$/i.test(String(man.lastActivityText || '').trim())
    }));
    updateCounter();
    updateAgencyFavoritesCount();
    render();
    if (!loadOptions.skipAutoOnline) scheduleAutoOnlineRefresh();
  } catch (error) {
    console.error('Men load error:', error);
    allMen = [];
    updateCounter();
    updateAgencyFavoritesCount();
    render();
  }
}

function getFavorites() {
  return allMen.filter(m => m.favorite === true).map(m => String(m.id));
}

function isFavorite(id) {
  return getFavorites().includes(String(id));
}

function sortAgencyTopOnline(men) {
  if (!agencyTopOnlineActive) return men;
  return [...men].sort((a, b) => {
    const aOnline = a.onlineNow === true || /^Online\s+now$/i.test(String(a.lastActivityText || '').trim());
    const bOnline = b.onlineNow === true || /^Online\s+now$/i.test(String(b.lastActivityText || '').trim());
    if (aOnline !== bOnline) return aOnline ? -1 : 1;
    return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
  });
}

function presenceHtml(man) {
  const open = state => `<button class="presence presence-check-btn ${state}" data-id="${escapeAttr(man.id)}" type="button" title="Update last activity"><span></span>`;
  if (man.onlineNow || /^Online\s+now$/i.test(String(man.lastActivityText || '').trim())) {
    return `${open('online')}Online now</button>`;
  }
  if (man.lastActivityText) {
    return `${open('offline')}${escapeHtml(man.lastActivityText.replace(/^Online\s*/i, ''))}</button>`;
  }
  if (man.lastSeenOnlineAt) {
    const minutes = Math.max(1, Math.floor((Date.now() - new Date(man.lastSeenOnlineAt).getTime()) / 60000));
    const text = minutes < 60 ? `${minutes}m ago`
      : minutes < 1440 ? `${Math.floor(minutes / 60)}h ago`
        : `${Math.floor(minutes / 1440)}d ago`;
    return `${open('offline')}Last seen ${text}</button>`;
  }
  return `${open('unknown')}Check activity</button>`;
}

async function checkSingleManPresence(id, button) {
  if (!id || onlineRefreshInProgress) return;
  const man = allMen.find(item => String(item.id) === String(id));
  if (!man) return;

  onlineRefreshInProgress = true;
  button.disabled = true;
  button.classList.add('checking');
  try {
    const response = await extensionCommand('CHECK_MAN_PRESENCE', {
      profileId: activeProfileId,
      id: man.id,
      profileUrl: man.profileLink
    }, 45000);
    if (response.presence) {
      man.onlineNow = response.presence.onlineNow === true;
      man.lastActivityText = response.presence.lastActivityText || '';
      render();
    }
    await loadMen();
  } catch (error) {
    console.warn(`Last activity check failed for ${id}:`, error);
  } finally {
    onlineRefreshInProgress = false;
  }
}

async function addToDreamFavorites(id, button) {
  id = String(id);
  const man = allMen.find(m => String(m.id) === id);
  if (!man) return;
  const nextFavorite = man.siteFavorite !== true;
  button.disabled = true;
  button.classList.add('saving');

  try {
    const payload = {
      id: man.id,
      profileUrl: man.profileLink || `https://www.dream-singles.com/${man.id}.html`
    };
    const current = await extensionCommand('CHECK_DREAM_FAVORITE', payload, 30000);
    if (current.siteFavorite !== nextFavorite) {
      await extensionCommand(nextFavorite ? 'ADD_DREAM_FAVORITE' : 'REMOVE_DREAM_FAVORITE', payload, 30000);
    }
    const verified = await extensionCommand('CHECK_DREAM_FAVORITE', payload, 30000);
    if (verified.siteFavorite !== nextFavorite) {
      throw new Error(nextFavorite
        ? 'Dream Singles did not add this man to Favorites'
        : 'Dream Singles did not remove this man from Favorites');
    }

    const res = await apiFetch(`/api/men/${encodeURIComponent(id)}/site-favorite`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteFavorite: nextFavorite })
    });

    if (!res.ok) throw new Error('Favorite save error');
    man.siteFavorite = nextFavorite;
    render();
  } catch (error) {
    button.disabled = false;
    button.classList.remove('saving');
    alert(error.message || 'Could not update Dream Singles Favorites');
    console.error(error);
  }
}

async function addChatToDreamFavorites(id, button) {
  id = String(id);
  const man = chatFavoriteMen.find(item => String(item.id) === id);
  if (!man) return;
  const nextFavorite = man.favorite !== true;
  button.disabled = true;
  button.classList.add('saving');

  try {
    const payload = {
      id: man.id,
      profileUrl: man.profileLink || `https://www.dream-singles.com/${man.id}.html`
    };
    const current = await extensionCommand('CHECK_DREAM_FAVORITE', payload, 30000);
    if (current.siteFavorite !== nextFavorite) {
      await extensionCommand(nextFavorite ? 'ADD_DREAM_FAVORITE' : 'REMOVE_DREAM_FAVORITE', payload, 30000);
    }
    const verified = await extensionCommand('CHECK_DREAM_FAVORITE', payload, 30000);
    if (verified.siteFavorite !== nextFavorite) {
      throw new Error(nextFavorite
        ? 'Dream Singles did not add this man to Favorites'
        : 'Dream Singles did not remove this man from Favorites');
    }

    const response = await apiFetch(`/api/other-men/${encodeURIComponent(id)}/favorite`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ favorite: nextFavorite })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Favorite save error');
    man.favorite = nextFavorite;
    man.favoriteUpdatedAt = result.man?.favoriteUpdatedAt || new Date().toISOString();
    man.chatOrderAt = result.man?.chatOrderAt || (nextFavorite ? man.favoriteUpdatedAt : '');
    renderChatFavorites();
  } catch (error) {
    button.disabled = false;
    button.classList.remove('saving');
    alert(error.message || 'Could not update Dream Singles Favorites');
    console.error(error);
  }
}

async function addToDreamIgnore(id, button) {
  id = String(id);
  const man = allMen.find(item => String(item.id) === id);
  if (!man) return;
  const nextIgnored = man.siteIgnored !== true;
  button.disabled = true;
  button.classList.add('saving');
  try {
    await extensionCommand(nextIgnored ? 'ADD_DREAM_IGNORE' : 'REMOVE_DREAM_IGNORE', { id: man.id }, 30000);
    const response = await apiFetch(`/api/men/${encodeURIComponent(id)}/site-ignored`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteIgnored: nextIgnored })
    });
    if (!response.ok) throw new Error('Ignore status could not be saved');
    man.siteIgnored = nextIgnored;
    render();
  } catch (error) {
    button.disabled = false;
    button.classList.remove('saving');
    alert(error.message || 'Could not update Dream Singles Ignore list');
  }
}

async function addChatToDreamIgnore(id, button) {
  id = String(id);
  const man = chatFavoriteMen.find(item => String(item.id) === id);
  if (!man) return;
  const nextIgnored = man.siteIgnored !== true;
  button.disabled = true;
  button.classList.add('saving');
  try {
    await extensionCommand(nextIgnored ? 'ADD_DREAM_IGNORE' : 'REMOVE_DREAM_IGNORE', { id: man.id }, 30000);
    const response = await apiFetch(`/api/other-men/${encodeURIComponent(id)}/site-ignored`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteIgnored: nextIgnored })
    });
    if (!response.ok) throw new Error('Ignore status could not be saved');
    man.siteIgnored = nextIgnored;
    renderChatFavorites();
  } catch (error) {
    button.disabled = false;
    button.classList.remove('saving');
    alert(error.message || 'Could not update Dream Singles Ignore list');
  }
}

function getVisibleMen() {
  const q = searchInput ? searchInput.value.trim().toLowerCase() : '';
  const favorites = getFavorites();

  let men = allMen.filter(m => !favorites.includes(String(m.id)) && m.pinned !== true);

  if (onlineOnly) {
    men = men.filter(m => m.onlineNow === true);
  }

  if (q) {
    men = men.filter(m =>
      String(m.name || '').toLowerCase().includes(q) ||
      String(m.id || '').toLowerCase().includes(q)
    );
  }

  return sortAgencyTopOnline(men);
}

function getVisibleFavorites() {
  const q = searchInput ? searchInput.value.trim().toLowerCase() : '';
  const favorites = getFavorites();

  let men = allMen.filter(m => favorites.includes(String(m.id)) && m.pinned !== true);

  if (onlineOnly) {
    men = men.filter(m => m.onlineNow === true);
  }

  if (q) {
    men = men.filter(m =>
      String(m.name || '').toLowerCase().includes(q) ||
      String(m.id || '').toLowerCase().includes(q)
    );
  }

  return sortAgencyTopOnline(men);
}

function updateCounter() {
  if (menCount) menCount.textContent = currentView === 'chat' ? chatFavoriteMen.length : allMen.length;
}

function renderLegacy() {
  renderFavorites();

  const men = getVisibleMen();

  if (!tbody) return;

  tbody.innerHTML = men.map(m => {
    const currentStatus = m.status || '-';
    const name = m.name || '';
    const firstLetter = name ? name[0].toUpperCase() : '?';
    const favorite = isFavorite(m.id);

    return `
      <tr class="${favorite ? 'favorite-row' : ''}">
        <td>
          <button
            class="favorite-btn ${favorite ? 'active' : ''}"
            data-id="${escapeAttr(m.id)}"
            title="${favorite ? 'Remove from favorites' : 'Add to favorites'}"
            type="button"
          >${favorite ? '★' : '☆'}</button>
        </td>

        <td>
          <div class="profile-cell">
            <span class="avatar">${m.photoUrl
              ? `<img src="${escapeAttr(m.photoUrl)}" alt="${escapeAttr(name)}" loading="lazy" decoding="async">`
              : escapeHtml(firstLetter)}</span>
            <div>
              <div class="person-name">${escapeHtml(name)}</div>
              <div class="person-age">${escapeHtml(m.age || '')}</div>${presenceHtml(m)}
            </div>
          </div>
        </td>

        <td>
          <button class="id-badge copy-id-btn" data-id="${escapeAttr(m.id)}" type="button" title="Copy client ID">${escapeHtml(m.id || '')}</button>
        </td>

        <td>
          <span class="letters-badge">${escapeHtml(m.lettersCount || 0)}</span>
        </td>

        <td>
          <div class="note-wrapper">
            <textarea 
              class="note" 
              data-id="${escapeAttr(m.id)}" 
              placeholder="Add a note..."
            >${escapeHtml(m.note || '')}</textarea>

            <button
              class="note-view-btn"
              data-id="${escapeAttr(m.id)}"
              title="Open note"
              type="button"
            >рџ‘Ђ</button>
          </div>
        </td>

        <td>
          ${renderTypeSelect(currentStatus, m.id)}
        </td>

        <td class="contact-date-cell">
          <div class="date-box">
            <div class="date-row">
              <span class="date-label">First</span>
              <span class="date-value">${escapeHtml(m.firstLetterDate || '')}</span>
            </div>
            <div class="date-row">
              <span class="date-label">Last</span>
              <span class="date-value">${escapeHtml(m.lastLetterDate || '')}</span>
            </div>
          </div>
        </td>

        <td>
          <div class="actions">
            ${m.inboxLink ? `<a class="action-link" href="${escapeAttr(m.inboxLink)}" target="_blank" title="Inbox">${ICON_INBOX}</a>` : ''}
            ${m.profileLink ? `<a class="action-link" href="${escapeAttr(m.profileLink)}" target="_blank" title="Profile">${ICON_PROFILE}</a>` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  bindEvents();
}

function renderFavorites() {
  const favoriteMen = getVisibleFavorites();

  if (favoritesCount) favoritesCount.textContent = favoriteMen.length;
  if (!favoritesList) return;

  if (!favoriteMen.length) {
    clearFavoritesVirtualState();
    favoritesList.innerHTML = `<div class="favorites-empty">No Favorite Men</div>`;
    renderListPager(favoritesList, 'importantMenPager', 0, 1, 'men');
    return;
  }

  favoritesImportantPage = clampPage(favoritesImportantPage, favoriteMen.length);
  const pagedFavorites = pageItems(favoriteMen, favoritesImportantPage).items;

  favoritesList.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>&#9733;</th>
          <th>NAME / PROFILE</th>
          <th>CLIENT ID</th>
          <th>LETTERS</th>
        <th class="pin-column-heading"></th>
          <th>NOTES</th>
          <th>TYPE</th>
          <th>CONTACT DATE</th>
          <th>ACTIONS</th>
        </tr>
      </thead>
      <tbody id="favoritesVirtualBody"></tbody>
    </table>
  `;

  renderListPager(favoritesList, 'importantMenPager', favoriteMen.length, favoritesImportantPage, 'men');

  favoritesVirtualRows = pagedFavorites.map(man => ({
    height: MAIN_ROW_HEIGHT,
    html: () => renderFavoriteRow(man)
  }));
  favoritesVirtualPrefix = buildVirtualPrefix(favoritesVirtualRows);
  favoritesVirtualTotalHeight = favoritesVirtualPrefix[favoritesVirtualPrefix.length - 1] || 0;
  favoritesVirtualWindowKey = '';
  renderVirtualFavoritesRows(true);
}

function manProfileUrl(man) {
  return man?.profileLink || (man?.id ? `https://www.dream-singles.com/${man.id}.html` : '');
}

function manAvatarHtml(man, name, firstLetter) {
  const avatarContent = man?.photoUrl
    ? `<img src="${escapeAttr(man.photoUrl)}" alt="${escapeAttr(name)}" loading="lazy" decoding="async">`
    : escapeHtml(firstLetter);
  const profileUrl = manProfileUrl(man);
  if (!profileUrl) return `<span class="avatar">${avatarContent}</span>`;
  return `<a class="avatar profile-avatar-link" href="${escapeAttr(profileUrl)}" target="_blank" rel="noopener" title="Open profile">${avatarContent}</a>`;
}

function renderFavoriteRow(m) {
  const currentStatus = m.status || '-';
  const name = m.name || '';
  const firstLetter = name ? name[0].toUpperCase() : '?';

  return `
    <tr class="favorite-row">
      <td>
        <button class="favorite-btn active" data-id="${escapeAttr(m.id)}"
          title="Remove from favorites" type="button">★</button>
      </td>
      <td>
        <div class="profile-cell">
          ${manAvatarHtml(m, name, firstLetter)}
          <div>
            <div class="person-name">${escapeHtml(name)}</div>
            <div class="person-age">${escapeHtml(m.age || '')}</div>${presenceHtml(m)}
          </div>
        </div>
      </td>
      <td><button class="id-badge copy-id-btn" data-id="${escapeAttr(m.id)}" type="button" title="Copy client ID">${escapeHtml(m.id || '')}</button></td>
      <td><span class="letters-badge">${escapeHtml(m.lettersCount || 0)}</span></td>
      <td class="pin-column-cell">
        <button class="pin-btn ${m.pinned === true ? 'active' : ''}" data-id="${escapeAttr(m.id)}" type="button"
          title="${m.pinned === true ? 'Unpin from top' : 'Pin to top'}">&#128204;</button>
      </td>
      <td>
        <div class="note-wrapper">
          <textarea class="note" data-id="${escapeAttr(m.id)}"
            placeholder="Add a note...">${escapeHtml(m.note || '')}</textarea>
          <button class="note-view-btn" data-id="${escapeAttr(m.id)}"
            title="Open note" type="button">рџ‘Ђ</button>
        </div>
      </td>
      <td>
        ${renderTypeSelect(currentStatus, m.id)}
      </td>
      <td class="contact-date-cell">
        <div class="date-box">
          <div class="date-row"><span class="date-label">First</span>
            <span class="date-value">${escapeHtml(m.firstLetterDate || '')}</span></div>
          <div class="date-row"><span class="date-label">Last</span>
            <span class="date-value">${escapeHtml(m.lastLetterDate || '')}</span></div>
        </div>
      </td>
      <td>
        <div class="actions"></div>
      </td>
    </tr>
  `;
}

function compactDate(value) {
  const match = String(value || '').match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return value || '-';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${match[1]} ${months[Number(match[2]) - 1]} ${match[3].slice(-2)}`;
}

function typeLabel(value) {
  return value === '-' ? 'Lead' : value;
}

function renderTypeSelect(currentStatus, id, source = 'men') {
  const sourceClass = source === 'chat' ? ' chat-type-shell' : '';
  return `
    <span class="type-select-shell${sourceClass} ${statusClass(currentStatus)}" data-id="${escapeAttr(id)}" data-source="${escapeAttr(source)}" data-value="${escapeAttr(currentStatus)}" role="button" tabindex="0" aria-label="Type">
      <span class="type-select-label">${escapeHtml(typeLabel(currentStatus))}</span>
      <span class="type-select-menu" role="listbox">
        ${STATUSES.map(status => `
          <button class="type-select-option ${currentStatus === status ? 'active' : ''}" data-value="${escapeAttr(status)}" type="button" role="option" aria-selected="${currentStatus === status ? 'true' : 'false'}">
            ${typeLabel(status)}
          </button>
        `).join('')}
      </span>
    </span>
  `;
}

function renderManRow(m, favorite) {
  const currentStatus = m.status || '-';
  const name = m.name || '';
  const firstLetter = name ? name[0].toUpperCase() : '?';

  return `
    <tr class="${favorite ? 'favorite-row' : ''}">
      <td>
        <button class="favorite-btn site-favorite-btn ${m.siteFavorite === true ? 'active' : ''}" data-id="${escapeAttr(m.id)}"
          title="${m.siteFavorite === true ? 'Remove from Dream Singles Favorites' : 'Add to Dream Singles Favorites'}" type="button">${m.siteFavorite === true ? '★' : '☆'}</button>
      </td>
      <td>
        <div class="profile-cell">
          ${manAvatarHtml(m, name, firstLetter)}
          <div>
            <div class="person-name">${escapeHtml(name)}</div>
            <div class="person-age">${escapeHtml(m.age || '')}</div>${presenceHtml(m)}
          </div>
        </div>
      </td>
      <td><div class="client-id-cell">
        <button class="id-badge copy-id-btn" data-id="${escapeAttr(m.id)}" type="button" title="Copy client ID">${escapeHtml(m.id || '')}</button>
      </div></td>
      <td><span class="letters-badge">${escapeHtml(m.lettersCount || 0)}</span></td>
      <td class="pin-column-cell">
        <button class="pin-btn ${m.pinned === true ? 'active' : ''}" data-id="${escapeAttr(m.id)}" type="button"
          title="${m.pinned === true ? 'Unpin from top' : 'Pin to top'}">&#128204;</button>
      </td>
      <td>
        <div class="note-wrapper">
          <input class="note" data-id="${escapeAttr(m.id)}" type="text"
            value="${escapeAttr(m.note || '')}" placeholder="Add a note...">
          <span class="note-save-state" data-note-state="${escapeAttr(m.id)}"></span>
          <button class="note-view-btn" data-id="${escapeAttr(m.id)}"
            title="Expand note" type="button">&#9974;</button>
        </div>
      </td>
      <td>
        ${renderTypeSelect(currentStatus, m.id)}
      </td>
      <td class="contact-date-cell">
        <div class="date-box">
          <div class="date-row"><span class="date-label">First</span>
            <span class="date-value">${escapeHtml(compactDate(m.firstLetterDate))}</span></div>
          <div class="date-row"><span class="date-label">Last</span>
            <span class="date-value">${escapeHtml(compactDate(m.lastLetterDate))}</span></div>
        </div>
      </td>
      <td>
        <div class="actions">
          <button class="ignore-site-btn ${m.siteIgnored === true ? 'active' : ''}" data-id="${escapeAttr(m.id)}" type="button"
            title="${m.siteIgnored === true ? 'Remove from Dream Singles Ignore list' : 'Add to Dream Singles Ignore list'}"><span>${m.siteIgnored === true ? '&#10003;' : ''}</span></button>
          ${currentUser?.role === 'operator' ? '' : `<button class="action-link man-delete-btn" data-id="${escapeAttr(m.id)}" type="button" title="Delete man">${ICON_DELETE}</button>`}
        </div>
      </td>
    </tr>
  `;
}

const MAIN_ROW_HEIGHT = 52;
const CHAT_ROW_HEIGHT = 58;
const MAIN_DIVIDER_HEIGHT = 42;
const MAIN_VIRTUAL_ENABLED = true;
const MAIN_VIRTUAL_THRESHOLD = 12;
const MAIN_VIRTUAL_OVERSCAN = 160;

function buildVirtualPrefix(rows) {
  const prefix = [0];
  for (const row of rows) prefix.push(prefix[prefix.length - 1] + row.height);
  return prefix;
}

function findVirtualIndex(prefix, value) {
  let low = 0;
  let high = prefix.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (prefix[mid + 1] < value) low = mid + 1;
    else high = mid;
  }
  return low;
}

function clearMainVirtualState() {
  mainVirtualRows = [];
  mainVirtualPrefix = [0];
  mainVirtualTotalHeight = 0;
  mainVirtualWindowKey = '';
}

function clearFavoritesVirtualState() {
  favoritesVirtualRows = [];
  favoritesVirtualPrefix = [0];
  favoritesVirtualTotalHeight = 0;
  favoritesVirtualWindowKey = '';
}

function clearChatVirtualState() {
  chatVirtualRows = [];
  chatVirtualPrefix = [0];
  chatVirtualTotalHeight = 0;
  chatVirtualWindowKey = '';
}

function virtualRowHtml(row) {
  return typeof row.html === 'function' ? row.html() : row.html;
}

function clampPage(page, totalItems, pageSize = LIST_PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(Math.max(0, totalItems) / pageSize));
  return Math.min(totalPages, Math.max(1, Number(page) || 1));
}

function pageItems(items, page, pageSize = LIST_PAGE_SIZE) {
  const currentPage = clampPage(page, items.length, pageSize);
  const start = (currentPage - 1) * pageSize;
  return {
    page: currentPage,
    totalPages: Math.max(1, Math.ceil(items.length / pageSize)),
    items: items.slice(start, start + pageSize)
  };
}

function renderListPager(anchor, pagerId, totalItems, page, label = 'men') {
  if (!anchor?.parentElement) return;
  let pager = document.getElementById(pagerId);
  if (!pager) {
    pager = document.createElement('div');
    pager.id = pagerId;
    pager.className = 'list-pagination';
  }
  if (pager.parentElement !== anchor.parentElement || pager.nextSibling !== anchor) {
    anchor.parentElement.insertBefore(pager, anchor);
  }
  const totalPages = Math.max(1, Math.ceil(totalItems / LIST_PAGE_SIZE));
  if (totalPages <= 1) {
    pager.innerHTML = '';
    pager.classList.add('hidden');
    return;
  }
  const currentPage = clampPage(page, totalItems);
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, currentPage + 2);
  const pageButtons = [];
  if (start > 1) {
    pageButtons.push(`<button type="button" data-list-page="1">1</button>`);
    if (start > 2) pageButtons.push('<span>...</span>');
  }
  for (let i = start; i <= end; i += 1) {
    pageButtons.push(`<button class="${i === currentPage ? 'active' : ''}" type="button" data-list-page="${i}">${i}</button>`);
  }
  if (end < totalPages) {
    if (end < totalPages - 1) pageButtons.push('<span>...</span>');
    pageButtons.push(`<button type="button" data-list-page="${totalPages}">${totalPages}</button>`);
  }
  const from = ((currentPage - 1) * LIST_PAGE_SIZE) + 1;
  const to = Math.min(totalItems, currentPage * LIST_PAGE_SIZE);
  pager.classList.remove('hidden');
  pager.dataset.pagerId = pagerId;
  pager.innerHTML = `
    <small>${from}-${to} / ${totalItems} ${escapeHtml(label)}</small>
    <button type="button" data-list-page="${currentPage - 1}" ${currentPage <= 1 ? 'disabled' : ''}>‹</button>
    ${pageButtons.join('')}
    <button type="button" data-list-page="${currentPage + 1}" ${currentPage >= totalPages ? 'disabled' : ''}>›</button>
  `;
}

function lockFavoritesScrollContainer() {
  const tableCard = document.querySelector('#agencyFavoritesMount:not(.hidden) #favoritesView .table-card, #favoritesView.view-active .table-card, #favoritesView .table-card');
  if (!tableCard) return;

  const panel = document.querySelector('.agency-favorites-panel');
  const content = document.getElementById('agencyFavoritesContent');
  const mount = document.getElementById('agencyFavoritesMount');
  [panel, content, mount, favoritesView].forEach(element => {
    if (!element) return;
    element.style.minHeight = '0';
    element.style.overflow = 'hidden';
  });

  const rect = tableCard.getBoundingClientRect();
  const bottomGap = 18;
  const availableHeight = Math.max(260, Math.floor(window.innerHeight - rect.top - bottomGap));
  tableCard.style.height = `${availableHeight}px`;
  tableCard.style.maxHeight = `${availableHeight}px`;
  tableCard.style.minHeight = '220px';
  tableCard.style.overflowY = 'scroll';
  tableCard.style.overflowX = 'hidden';
  tableCard.style.overscrollBehavior = 'contain';
  tableCard.style.contain = 'layout paint';
}

function scheduleVirtualMainRender() {
  if (!mainVirtualRows.length || mainVirtualFrame) return;
  mainVirtualFrame = requestAnimationFrame(() => {
    mainVirtualFrame = null;
    renderVirtualMainRows();
  });
}

function scheduleVirtualFavoritesRender() {
  if (!favoritesVirtualRows.length || favoritesVirtualFrame) return;
  favoritesVirtualFrame = requestAnimationFrame(() => {
    favoritesVirtualFrame = null;
    renderVirtualFavoritesRows();
  });
}

function scheduleVirtualChatRender() {
  if (!chatVirtualRows.length || chatVirtualFrame) return;
  chatVirtualFrame = requestAnimationFrame(() => {
    chatVirtualFrame = null;
    renderVirtualChatRows();
  });
}

function renderVirtualMainRows(force = false) {
  if (!tbody || !mainTableCard || !mainVirtualRows.length) return;

  lockFavoritesScrollContainer();
  const viewportHeight = mainTableCard.clientHeight || 700;
  const startY = Math.max(0, mainTableCard.scrollTop - MAIN_VIRTUAL_OVERSCAN);
  const endY = Math.min(mainVirtualTotalHeight, mainTableCard.scrollTop + viewportHeight + MAIN_VIRTUAL_OVERSCAN);
  const startIndex = Math.max(0, findVirtualIndex(mainVirtualPrefix, startY) - 2);
  const endIndex = Math.min(mainVirtualRows.length, findVirtualIndex(mainVirtualPrefix, endY) + 3);
  const key = `${startIndex}:${endIndex}:${mainVirtualRows.length}:${mainVirtualTotalHeight}`;
  if (!force && key === mainVirtualWindowKey) return;
  mainVirtualWindowKey = key;

  const topPad = mainVirtualPrefix[startIndex] || 0;
  const bottomPad = Math.max(0, mainVirtualTotalHeight - mainVirtualPrefix[endIndex]);
  const visibleRows = mainVirtualRows.slice(startIndex, endIndex).map(virtualRowHtml).join('');
  const topSpacer = topPad > 0
    ? `<tr class="virtual-spacer" style="--spacer-height:${topPad}px"><td colspan="9"></td></tr>`
    : '';
  const bottomSpacer = bottomPad > 0
    ? `<tr class="virtual-spacer" style="--spacer-height:${bottomPad}px"><td colspan="9"></td></tr>`
    : '';

  tbody.innerHTML = topSpacer + visibleRows + bottomSpacer;
  lockFavoritesScrollContainer();
  bindEvents();
}

function renderVirtualFavoritesRows(force = false) {
  const favoritesBody = document.getElementById('favoritesVirtualBody');
  if (!favoritesBody || !favoritesList || !favoritesVirtualRows.length) return;

  const viewportHeight = favoritesList.clientHeight || 420;
  const startY = Math.max(0, favoritesList.scrollTop - MAIN_VIRTUAL_OVERSCAN);
  const endY = Math.min(favoritesVirtualTotalHeight, favoritesList.scrollTop + viewportHeight + MAIN_VIRTUAL_OVERSCAN);
  const startIndex = Math.max(0, findVirtualIndex(favoritesVirtualPrefix, startY) - 2);
  const endIndex = Math.min(favoritesVirtualRows.length, findVirtualIndex(favoritesVirtualPrefix, endY) + 3);
  const key = `${startIndex}:${endIndex}:${favoritesVirtualRows.length}:${favoritesVirtualTotalHeight}`;
  if (!force && key === favoritesVirtualWindowKey) return;
  favoritesVirtualWindowKey = key;

  const topPad = favoritesVirtualPrefix[startIndex] || 0;
  const bottomPad = Math.max(0, favoritesVirtualTotalHeight - favoritesVirtualPrefix[endIndex]);
  const visibleRows = favoritesVirtualRows.slice(startIndex, endIndex).map(virtualRowHtml).join('');
  const topSpacer = topPad > 0
    ? `<tr class="virtual-spacer" style="--spacer-height:${topPad}px"><td colspan="9"></td></tr>`
    : '';
  const bottomSpacer = bottomPad > 0
    ? `<tr class="virtual-spacer" style="--spacer-height:${bottomPad}px"><td colspan="9"></td></tr>`
    : '';

  favoritesBody.innerHTML = topSpacer + visibleRows + bottomSpacer;
  bindEvents();
}

function renderVirtualChatRows(force = false) {
  const chatScroll = document.querySelector('#chatFavoritesView .chat-favorites-table-wrap');
  if (!chatFavoritesBody || !chatScroll || !chatVirtualRows.length) return;

  const viewportHeight = chatScroll.clientHeight || 520;
  const startY = Math.max(0, chatScroll.scrollTop - MAIN_VIRTUAL_OVERSCAN);
  const endY = Math.min(chatVirtualTotalHeight, chatScroll.scrollTop + viewportHeight + MAIN_VIRTUAL_OVERSCAN);
  const startIndex = Math.max(0, findVirtualIndex(chatVirtualPrefix, startY) - 2);
  const endIndex = Math.min(chatVirtualRows.length, findVirtualIndex(chatVirtualPrefix, endY) + 3);
  const key = `${startIndex}:${endIndex}:${chatVirtualRows.length}:${chatVirtualTotalHeight}`;
  if (!force && key === chatVirtualWindowKey) return;
  chatVirtualWindowKey = key;

  const topPad = chatVirtualPrefix[startIndex] || 0;
  const bottomPad = Math.max(0, chatVirtualTotalHeight - chatVirtualPrefix[endIndex]);
  const visibleRows = chatVirtualRows.slice(startIndex, endIndex).map(virtualRowHtml).join('');
  const topSpacer = topPad > 0
    ? `<tr class="virtual-spacer" style="--spacer-height:${topPad}px"><td colspan="7"></td></tr>`
    : '';
  const bottomSpacer = bottomPad > 0
    ? `<tr class="virtual-spacer" style="--spacer-height:${bottomPad}px"><td colspan="7"></td></tr>`
    : '';

  chatFavoritesBody.innerHTML = topSpacer + visibleRows + bottomSpacer;
  bindChatFavoriteEvents();
}

function getVisiblePinned() {
  const q = searchInput ? searchInput.value.trim().toLowerCase() : '';
  let men = allMen.filter(m => m.pinned === true);

  if (onlineOnly) {
    men = men.filter(m => m.onlineNow === true);
  }

  if (q) {
    men = men.filter(m =>
      String(m.name || '').toLowerCase().includes(q) ||
      String(m.id || '').toLowerCase().includes(q)
    );
  }

  return sortAgencyTopOnline(men);
}

function render() {
  const pinnedMen = getVisiblePinned();
  const favoriteMen = getVisibleFavorites();
  const regularMen = getVisibleMen();
  const hasSearch = Boolean(searchInput?.value.trim());
  document.body.classList.toggle('search-active', hasSearch);
  document.body.classList.toggle('compact-results', hasSearch || onlineOnly);
  if (favoritesCount) favoritesCount.textContent = favoriteMen.length;
  if (!tbody) return;

  const rows = [];
  if (pinnedMen.length) {
    rows.push({
      height: MAIN_DIVIDER_HEIGHT,
      html: `<tr class="section-divider pinned-divider"><td colspan="9"><div class="section-divider-content"><div><span>PINNED MEN</span><b>${pinnedMen.length}</b></div><button id="copyPinnedMenBtn" class="copy-important-men copy-pinned-men" type="button">Copy IDs</button></div></td></tr>`
    });
    pinnedMen.forEach(man => rows.push({
      height: MAIN_ROW_HEIGHT,
      html: () => renderManRow(man, isFavorite(man.id))
    }));
  }
  if (favoriteMen.length) {
    rows.push({
      height: MAIN_DIVIDER_HEIGHT,
      html: `<tr class="section-divider"><td colspan="9"><div class="section-divider-content"><div><span>&#9733; Important Men</span><b>${favoriteMen.length}</b></div><button id="copyImportantMenBtn" class="copy-important-men" type="button">Copy IDs</button></div></td></tr>`
    });
    favoriteMen.forEach(man => rows.push({
      height: MAIN_ROW_HEIGHT,
      html: () => renderManRow(man, true)
    }));
  }
  if (regularMen.length) {
    rows.push({
      height: MAIN_DIVIDER_HEIGHT,
      html: `<tr class="section-divider regular-divider"><td colspan="9"><div class="section-divider-content"><div><span>ALL MEN</span><b>${regularMen.length}</b></div><button id="copyAllMenBtn" class="copy-important-men copy-all-men" type="button">Copy Full ID</button></div></td></tr>`
    });
    regularMen.forEach(man => rows.push({
      height: MAIN_ROW_HEIGHT,
      html: () => renderManRow(man, false)
    }));
  }

  favoritesMainPage = clampPage(favoritesMainPage, rows.length);
  const pagedRows = pageItems(rows, favoritesMainPage).items;
  renderListPager(mainTableCard, 'favoritesMainPager', rows.length, favoritesMainPage, 'rows');

  if (MAIN_VIRTUAL_ENABLED && pagedRows.length > MAIN_VIRTUAL_THRESHOLD && mainTableCard) {
    mainVirtualRows = pagedRows;
    mainVirtualPrefix = buildVirtualPrefix(rows);
    mainVirtualPrefix = buildVirtualPrefix(pagedRows);
    mainVirtualTotalHeight = mainVirtualPrefix[mainVirtualPrefix.length - 1] || 0;
    mainVirtualWindowKey = '';
    renderVirtualMainRows(true);
    lockFavoritesScrollContainer();
    return;
  }

  clearMainVirtualState();
  clearFavoritesVirtualState();
  tbody.innerHTML = pagedRows.map(virtualRowHtml).join('') ||
    '<tr class="empty-row"><td colspan="9">No Men Found</td></tr>';
  lockFavoritesScrollContainer();
  bindEvents();
}

async function copyImportantMen() {
  const importantIds = allMen
    .filter(man => man.favorite === true)
    .map(man => String(man.id || '').trim())
    .filter(Boolean);
  if (!importantIds.length) return;

  const button = document.getElementById('copyImportantMenBtn');
  const label = button?.textContent || 'Copy IDs';
  try {
    await navigator.clipboard.writeText(importantIds.join('\n'));
    if (button) button.textContent = `Copied ${importantIds.length}`;
  } catch {
    if (button) button.textContent = 'Copy failed';
  }
  setTimeout(() => {
    if (button?.isConnected) button.textContent = label;
  }, 1200);
}

async function copyPinnedMen() {
  const pinnedIds = allMen
    .filter(man => man.pinned === true)
    .map(man => String(man.id || '').trim())
    .filter(Boolean);
  if (!pinnedIds.length) return;

  const button = document.getElementById('copyPinnedMenBtn');
  const label = button?.textContent || 'Copy IDs';
  try {
    await navigator.clipboard.writeText(pinnedIds.join('\n'));
    if (button) button.textContent = `Copied ${pinnedIds.length}`;
  } catch {
    if (button) button.textContent = 'Copy failed';
  }
  setTimeout(() => {
    if (button) button.textContent = label;
  }, 1200);
}

async function copyAllMen(eventOrButton) {
  const ids = allMen
    .map(man => String(man.id || '').trim())
    .filter(Boolean);
  if (!ids.length) return;

  const button = eventOrButton?.currentTarget || eventOrButton || document.getElementById('copyAllMenBtn');
  const label = button?.textContent || 'Copy Full ID';
  try {
    await navigator.clipboard.writeText([...new Set(ids)].join('\n'));
    if (button) button.textContent = `Copied ${new Set(ids).size}`;
  } catch {
    if (button) button.textContent = 'Copy failed';
  }
  setTimeout(() => {
    if (button?.isConnected) button.textContent = label;
  }, 1200);
}

async function loadChatFavorites(checkDetails = true) {
  if (!ladyConnected) {
    chatFavoriteMen = [];
    clearChatVirtualState();
    if (chatFavoritesBody) chatFavoritesBody.innerHTML = '';
    updateCounter();
    return;
  }
  if (!activeProfileId) {
    chatFavoriteMen = [];
    clearChatVirtualState();
    renderChatFavorites();
    return;
  }
  try {
    const response = await apiFetch('/api/other-men');
    const raw = await response.text();
    let result = {};
    try {
      result = raw ? JSON.parse(raw) : {};
    } catch {
      throw new Error('Server returned a non-JSON response. Refresh the page and try again.');
    }
    if (!response.ok) throw new Error(result.error || 'Could not load Chat Favorite');
    chatFavoriteMen = result.men || [];
    renderChatFavorites();
    if (checkDetails && chatFavoriteMen.length) refreshChatIgnoreStatuses();
    if (checkDetails && chatFavoriteMen.length && !chatFavoriteRefreshInProgress) {
      const key = `${activeProfileId}:${chatFavoriteMen.map(man => man.id).join(',')}`;
      if (autoChatOnlineRefreshProfileId !== key) {
        autoChatOnlineRefreshProfileId = key;
        refreshChatFavoriteDetails();
      }
    }
  } catch (error) {
    chatFavoritesStatus.textContent = error.message;
  }
}

async function refreshChatIgnoreStatuses() {
  if (chatIgnoreRefreshInProgress || !chatFavoriteMen.length) return;
  const ids = [...new Set(chatFavoriteMen.map(man => String(man.id || '')).filter(Boolean))];
  if (!ids.length) return;
  const key = `${activeProfileId}:${ids.join(',')}`;
  if (autoChatIgnoreRefreshKey === key) return;
  autoChatIgnoreRefreshKey = key;
  chatIgnoreRefreshInProgress = true;
  try {
    const response = await extensionCommand('CHECK_DREAM_IGNORE_LIST', { ids }, 60000);
    const ignoredIds = new Set((response.ignoredIds || []).map(String));
    await Promise.all(ids.map(id => apiFetch(`/api/other-men/${encodeURIComponent(id)}/site-ignored`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteIgnored: ignoredIds.has(id) })
    })));
    chatFavoriteMen = chatFavoriteMen.map(man => ({
      ...man,
      siteIgnored: ignoredIds.has(String(man.id))
    }));
    renderChatFavorites();
  } catch (error) {
    autoChatIgnoreRefreshKey = '';
    console.warn('Chat Favorite ignore-list refresh failed:', error);
  } finally {
    chatIgnoreRefreshInProgress = false;
  }
}

async function refreshChatFavoriteDetails(storageKey) {
  chatFavoriteRefreshInProgress = true;
  try {
    const response = await extensionCommand('CHECK_CHAT_FAVORITES_ONLINE', {
      men: chatFavoriteMen.map(man => ({
        id: man.id,
        profileUrl: man.profileLink || `https://www.dream-singles.com/${man.id}.html`
      }))
    }, 180000);

    for (const status of response.statuses || []) {
      const save = await apiFetch(`/api/other-men/${encodeURIComponent(status.id)}/presence`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          onlineNow: status.onlineNow === true,
          lastActivityText: status.lastActivityText || ''
        })
      });
      if (!save.ok) console.warn(`Could not save Chat Favorite presence for ${status.id}`);
    }
    await loadChatFavorites(false);
  } catch (error) {
    if (storageKey) localStorage.removeItem(storageKey);
    console.warn('Chat Favorite refresh failed:', error);
  } finally {
    chatFavoriteRefreshInProgress = false;
  }
}

function chatPresenceHtml(man) {
  if (man.onlineNow || /^Online\s+now$/i.test(String(man.lastActivityText || '').trim())) {
    return '<div class="presence online"><span></span>Online now</div>';
  }
  if (man.lastActivityText) {
    return `<div class="presence offline"><span></span>${escapeHtml(man.lastActivityText.replace(/^Online\s*/i, ''))}</div>`;
  }
  return '<div class="presence unknown">Last activity unavailable</div>';
}

function renderChatFavorites() {
  if (!chatFavoritesBody) return;
  updateCounter();
  updateAgencyFavoritesCount();
  const query = searchInput?.value.trim().toLowerCase() || '';
  const men = chatFavoriteMen
    .filter(man => !query || String(man.name || '').toLowerCase().includes(query) || String(man.id).includes(query))
    .sort((a, b) => {
      if (agencyChatTopOnlineActive) {
        const aOnline = a.onlineNow === true || /^Online\s+now$/i.test(String(a.lastActivityText || '').trim());
        const bOnline = b.onlineNow === true || /^Online\s+now$/i.test(String(b.lastActivityText || '').trim());
        if (aOnline !== bOnline) return aOnline ? -1 : 1;
      }
      return Date.parse(b.chatOrderAt || 0) - Date.parse(a.chatOrderAt || 0) ||
        Date.parse(b.favoriteUpdatedAt || 0) - Date.parse(a.favoriteUpdatedAt || 0) ||
        Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0);
    });

  if (!men.length) {
    clearChatVirtualState();
    chatFavoritesBody.innerHTML = '<tr class="empty-row"><td colspan="7">No Men Saved From Chats Yet</td></tr>';
    renderListPager(document.querySelector('#chatFavoritesView .chat-favorites-table-wrap'), 'chatFavoritesPager', 0, 1, 'men');
    bindChatFavoriteEvents();
    return;
  }

  chatFavoritesPage = clampPage(chatFavoritesPage, men.length);
  const pagedMen = pageItems(men, chatFavoritesPage).items;
  renderListPager(document.querySelector('#chatFavoritesView .chat-favorites-table-wrap'), 'chatFavoritesPager', men.length, chatFavoritesPage, 'men');

  const rows = pagedMen.map(man => ({
    height: CHAT_ROW_HEIGHT,
    html: () => renderChatFavoriteRow(man)
  }));

  if (MAIN_VIRTUAL_ENABLED && rows.length > MAIN_VIRTUAL_THRESHOLD) {
    chatVirtualRows = rows;
    chatVirtualPrefix = buildVirtualPrefix(rows);
    chatVirtualTotalHeight = chatVirtualPrefix[chatVirtualPrefix.length - 1] || 0;
    chatVirtualWindowKey = '';
    renderVirtualChatRows(true);
    return;
  }

  clearChatVirtualState();
  chatFavoritesBody.innerHTML = rows.map(virtualRowHtml).join('');
  bindChatFavoriteEvents();
  return;

  chatFavoritesBody.innerHTML = men.map(man => {
    const status = man.status || '-';
    const name = man.name || `Man ${man.id}`;
    return `<tr class="${man.favorite ? 'favorite-row' : ''}">
      <td><button class="chat-star-btn favorite-btn ${man.favorite ? 'active' : ''}" data-id="${escapeAttr(man.id)}" title="${man.favorite ? 'Remove from Dream Singles Favorites' : 'Add to Dream Singles Favorites'}" type="button">${man.favorite ? '★' : '☆'}</button></td>
      <td><div class="profile-cell">
        <span class="avatar">${man.photoUrl
          ? `<img src="${escapeAttr(man.photoUrl)}" alt="${escapeAttr(name)}" loading="lazy" decoding="async">`
          : escapeHtml(name.slice(0, 1).toUpperCase())}</span>
        <div><div class="person-name">${escapeHtml(name)}</div></div>
      </div></td>
      <td><div class="chat-client-id-cell">
        <a class="chat-client-profile-action" href="${escapeAttr(man.profileLink || `https://www.dream-singles.com/${man.id}.html`)}" target="_blank" rel="noopener" title="Open profile">${ICON_PROFILE}</a>
        <button class="id-badge chat-id-badge chat-copy-id" data-id="${escapeAttr(man.id)}" type="button">${escapeHtml(man.id)}</button>
      </div></td>
      <td>${chatPresenceHtml(man)}</td>
      <td>
        <div class="note-wrapper chat-note-wrapper">
          <input class="note chat-note" data-id="${escapeAttr(man.id)}" type="text" value="${escapeAttr(man.note || '')}" placeholder="Add a note...">
          <button class="note-view-btn chat-note-view-btn" data-id="${escapeAttr(man.id)}" title="Expand note" type="button">&#9974;</button>
        </div>
      </td>
      <td>${renderTypeSelect(status, man.id, 'chat')}</td>
      <td><div class="chat-row-actions">
        <button class="chat-ignore-action ignore-site-btn ${man.siteIgnored === true ? 'active' : ''}" data-id="${escapeAttr(man.id)}" type="button"
          title="${man.siteIgnored === true ? 'Remove from Dream Singles Ignore list' : 'Add to Dream Singles Ignore list'}"><span>${man.siteIgnored === true ? '&#10003;' : ''}</span></button>
        <button class="chat-delete-action" data-id="${escapeAttr(man.id)}" type="button" title="Delete man">${ICON_DELETE}</button>
      </div></td>
    </tr>`;
  }).join('') || '<tr class="empty-row"><td colspan="7">No Men Saved From Chats Yet</td></tr>';
  bindChatFavoriteEvents();
}

function renderChatFavoriteRow(man) {
  const status = man.status || '-';
  const name = man.name || `Man ${man.id}`;
  const favoriteSymbol = man.favorite ? '&#9733;' : '&#9734;';
  const firstLetter = name.slice(0, 1).toUpperCase() || '?';
  return `<tr class="${man.favorite ? 'favorite-row' : ''}">
    <td><button class="chat-star-btn favorite-btn ${man.favorite ? 'active' : ''}" data-id="${escapeAttr(man.id)}" title="${man.favorite ? 'Remove from Dream Singles Favorites' : 'Add to Dream Singles Favorites'}" type="button">${favoriteSymbol}</button></td>
    <td><div class="profile-cell">
      ${manAvatarHtml(man, name, firstLetter)}
      <div><div class="person-name">${escapeHtml(name)}</div></div>
    </div></td>
    <td><div class="chat-client-id-cell">
      <button class="id-badge chat-id-badge chat-copy-id" data-id="${escapeAttr(man.id)}" type="button">${escapeHtml(man.id)}</button>
    </div></td>
    <td>${chatPresenceHtml(man)}</td>
    <td>
      <div class="note-wrapper chat-note-wrapper">
        <input class="note chat-note" data-id="${escapeAttr(man.id)}" type="text" value="${escapeAttr(man.note || '')}" placeholder="Add a note...">
        <button class="note-view-btn chat-note-view-btn" data-id="${escapeAttr(man.id)}" title="Expand note" type="button">&#9974;</button>
      </div>
    </td>
    <td>${renderTypeSelect(status, man.id, 'chat')}</td>
    <td><div class="chat-row-actions">
      <button class="chat-ignore-action ignore-site-btn ${man.siteIgnored === true ? 'active' : ''}" data-id="${escapeAttr(man.id)}" type="button"
        title="${man.siteIgnored === true ? 'Remove from Dream Singles Ignore list' : 'Add to Dream Singles Ignore list'}"><span>${man.siteIgnored === true ? '&#10003;' : ''}</span></button>
      <button class="chat-delete-action" data-id="${escapeAttr(man.id)}" type="button" title="Delete man">${ICON_DELETE}</button>
    </div></td>
  </tr>`;
}

function bindChatFavoriteEvents() {
  document.querySelectorAll('.chat-star-btn').forEach(button => button.addEventListener('click', async () => {
    addChatToDreamFavorites(button.dataset.id, button);
  }));

  document.querySelectorAll('.chat-ignore-action').forEach(button => button.addEventListener('click', async () => {
    addChatToDreamIgnore(button.dataset.id, button);
  }));

  document.querySelectorAll('.chat-copy-id').forEach(button => button.addEventListener('click', async () => {
    const original = button.textContent;
    try { await navigator.clipboard.writeText(button.dataset.id); button.textContent = 'Copied'; }
    catch { button.textContent = 'Copy failed'; }
    setTimeout(() => { button.textContent = original; }, 900);
  }));

  document.querySelectorAll('.chat-note').forEach(field => field.addEventListener('change', async () => {
    await saveChatNote(field.dataset.id, field.value);
  }));

  document.querySelectorAll('.chat-note-view-btn').forEach(button => button.addEventListener('click', () => {
    openNoteModal(button.dataset.id, 'chat');
  }));

  document.querySelectorAll('#chatFavoritesView .type-select-shell').forEach(shell => {
    shell.addEventListener('click', event => {
      event.stopPropagation();
      openFloatingTypeMenu(shell);
    });

    shell.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        shell.click();
      }
      if (event.key === 'Escape') shell.classList.remove('open');
    });
  });

  document.querySelectorAll('#chatFavoritesView .type-select-option').forEach(option => {
    option.addEventListener('click', async event => {
      event.stopPropagation();
      const shell = option.closest('.type-select-shell');
      if (!shell) return;
      await saveTypeStatus(shell, option.dataset.value);
    });
  });

  document.removeEventListener('click', closeOpenTypeMenus);
  document.addEventListener('click', closeOpenTypeMenus);

  document.querySelectorAll('.chat-type-select').forEach(select => {
    paintStatus(select);
    select.addEventListener('change', async () => {
      const status = select.value === '-' ? '' : select.value;
      const response = await apiFetch(`/api/other-men/${encodeURIComponent(select.dataset.id)}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status })
      });
      if (!response.ok) return alert('Could not save the type');
      const man = chatFavoriteMen.find(item => String(item.id) === select.dataset.id);
      if (man) man.status = status;
      paintStatus(select);
    });
  });

  document.querySelectorAll('.chat-profile-btn').forEach(button =>
    button.addEventListener('click', () => openChatProfileModal(button.dataset.id)));

  document.querySelectorAll('.chat-check-online').forEach(button => button.addEventListener('click', async () => {
    const man = chatFavoriteMen.find(item => String(item.id) === button.dataset.id);
    if (!man) return;
    button.disabled = true;
    button.textContent = 'Checking...';
    try {
      const resolved = await extensionCommand('RESOLVE_OTHER_MAN', {
        id: man.id,
        profileLink: man.profileLink,
        includePhoto: !man.photoUrl
      }, 30000);
      const response = await apiFetch('/api/other-men', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ man: resolved.man })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not update status');
      Object.assign(man, result.man);
      renderChatFavorites();
    } catch (error) {
      button.disabled = false;
      button.textContent = 'Try again';
      chatFavoritesStatus.textContent = error.message;
    }
  }));

  document.querySelectorAll('.chat-delete-action').forEach(button => button.addEventListener('click', async () => {
    const man = chatFavoriteMen.find(item => String(item.id) === button.dataset.id);
    if (!man || !confirm(`Delete ${man.name || `man ${man.id}`} from Chat Favorite?`)) return;
    const response = await apiFetch(`/api/other-men/${encodeURIComponent(man.id)}`, { method: 'DELETE' });
    if (!response.ok) return alert('Could not delete the man');
    chatFavoriteMen = chatFavoriteMen.filter(item => String(item.id) !== String(man.id));
    renderChatFavorites();
  }));
}

async function addChatFavorite(sourceInput = chatManIdInput, sourceButton = chatAddManBtn) {
  const input = sourceInput || chatManIdInput;
  const button = sourceButton || chatAddManBtn;
  const id = input?.value?.trim() || '';
  if (!/^\d{4,}$/.test(id)) {
    chatFavoritesStatus.textContent = 'Enter a valid man ID.';
    return;
  }
  if (button) button.disabled = true;
  chatFavoritesStatus.textContent = 'Loading profile from Dream Singles...';
  try {
    const resolved = await extensionCommand('RESOLVE_OTHER_MAN', { id }, 45000);
    if (!resolved?.ok || !resolved?.man) {
      throw new Error(resolved?.error || `Could not load profile ${id} from Dream Singles`);
    }
    const man = resolved.man;
    const response = await apiFetch('/api/other-men', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ man })
    });
    const raw = await response.text();
    let result = {};
    try {
      result = raw ? JSON.parse(raw) : {};
    } catch {
      throw new Error('Server returned a non-JSON response. Refresh the page and try again.');
    }
    if (!response.ok) throw new Error(result.error || 'Could not add man');
    if (input) input.value = '';
    chatFavoritesStatus.textContent = `${result.man.name} added.`;
    chatFavoriteMen = [result.man, ...chatFavoriteMen.filter(item => String(item.id) !== String(result.man.id))];
    renderChatFavorites();
  } catch (error) {
    chatFavoritesStatus.textContent = error.message;
  } finally {
    if (button) button.disabled = false;
  }
}

function renderChatProfile(man) {
  const name = man.name || `Man ${man.id}`;
  profileModalTitle.textContent = `${name}, ID: ${man.id}`;
  profileUpdatedAt.textContent = man.lastActivityText ? `Last activity: ${man.lastActivityText}` : '';
  profileContent.innerHTML = `<div class="chat-profile-summary">
    ${man.photoUrl ? `<img src="${escapeAttr(man.photoUrl)}" alt="${escapeAttr(name)}">` : `<div class="profile-photo-placeholder">${escapeHtml(name[0] || '?')}</div>`}
    <div class="chat-profile-details">
      <div><small>Client ID</small><strong>${escapeHtml(man.id)}</strong></div>
      <div><small>Last activity</small><strong>${escapeHtml(man.lastActivityText || 'Unavailable')}</strong></div>
      <div><small>Type</small><strong>${escapeHtml(man.status || 'Lead')}</strong></div>
      <div class="chat-profile-note"><small>Note</small><p>${escapeHtml(man.note || 'No note')}</p></div>
    </div>
  </div>`;
}

async function openChatProfileModal(id) {
  let man = chatFavoriteMen.find(item => String(item.id) === String(id));
  if (!man) return;
  profileModal.classList.remove('hidden');
  profileError.classList.add('hidden');
  profileLoading.classList.remove('hidden');
  renderChatProfile(man);
  try {
    const resolved = await extensionCommand('RESOLVE_OTHER_MAN', { id: man.id, profileLink: man.profileLink }, 30000);
    const response = await apiFetch('/api/other-men', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ man: resolved.man })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not refresh profile');
    Object.assign(man, result.man);
    renderChatProfile(man);
    renderChatFavorites();
  } catch (error) {
    profileError.textContent = `${error.message}. Showing saved data.`;
    profileError.classList.remove('hidden');
  } finally {
    profileLoading.classList.add('hidden');
  }
}

function todayDateInputValue() {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function dreamDateInputValue() {
  const date = new Date();
  if (date.getHours() < 10) date.setDate(date.getDate() - 1);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function monthStartDateInputValue() {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), 1);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function setupMyStatsDefaults() {
  if (myStatsFrom && !myStatsFrom.value) myStatsFrom.value = monthStartDateInputValue();
  if (myStatsTo && !myStatsTo.value) myStatsTo.value = todayDateInputValue();
  const visible = ['admin', 'operator'].includes(currentUser?.role);
  myStatsNavBtn?.classList.toggle('hidden', !visible);
  syncRoleNavigation();
}

function hasAdminPanelAccess() {
  return ['admin', 'director', 'mentor'].includes(currentUser?.role);
}

function isAgencyDesktopApp() {
  return AGENCY_DESKTOP_CLIENT;
}

function isAgencyWebsite() {
  return !isAgencyDesktopApp();
}

function isDesktopAdminSession() {
  return isAgencyDesktopApp() && currentUser?.role === 'admin';
}

function isWebsiteAdminSession() {
  return isAgencyWebsite() && currentUser?.role === 'admin';
}

function syncRoleNavigation() {
  const adminPanelAllowed = hasAdminPanelAccess();
  const ownerMode = currentUser?.role === 'director';
  const mentorMode = currentUser?.role === 'mentor';
  document.body.classList.toggle('operator-user', currentUser?.role === 'operator');
  document.body.classList.toggle('owner-user', ownerMode);
  document.body.classList.toggle('mentor-user', mentorMode);
  document.body.classList.toggle('desktop-admin-user', isDesktopAdminSession());
  document.body.classList.toggle('web-admin-user', isWebsiteAdminSession());
  adminPanelNavBtn?.classList.toggle('hidden', !adminPanelAllowed);
  profileChoiceAdminPanel?.classList.toggle('hidden', !adminPanelAllowed);
  myStatsNavBtn?.classList.toggle('hidden', ownerMode || !['admin', 'operator'].includes(currentUser?.role));
  workspaceNavLink?.classList.toggle('hidden', ownerMode || mentorMode);
  favoritesNavBtn?.classList.toggle('hidden', ownerMode || mentorMode);
  chatFavoritesNavBtn?.classList.toggle('hidden', ownerMode || mentorMode);
  googleDriveNavBtn?.classList.toggle('hidden', ownerMode || mentorMode);
  if (!adminPanelAllowed && localStorage.getItem('dream_crm_view') === 'adminPanel') {
    localStorage.setItem('dream_crm_view', ownerMode ? 'settings' : 'stats');
  }
  if (!adminPanelAllowed && currentView === 'adminPanel') {
    currentView = ownerMode ? 'settings' : 'stats';
    syncAdminPanelRoute(false);
  }
}

function userRegistrationDateInputValue() {
  return salaryPeriodDateKey(currentUser?.createdAt) || monthStartDateInputValue();
}

function salaryMonthRange(monthValue = '') {
  const monthKey = String(monthValue || salaryCalendarMonth || todayDateInputValue().slice(0, 7)).slice(0, 7);
  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month) {
    return { from: userRegistrationDateInputValue(), to: todayDateInputValue(), month: todayDateInputValue().slice(0, 7) };
  }
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEndDate = new Date(year, month, 0);
  const monthEnd = `${monthEndDate.getFullYear()}-${String(monthEndDate.getMonth() + 1).padStart(2, '0')}-${String(monthEndDate.getDate()).padStart(2, '0')}`;
  const today = todayDateInputValue();
  const registered = userRegistrationDateInputValue();
  const from = registered > monthStart ? registered : monthStart;
  const to = monthEnd > today ? today : monthEnd;
  return { from, to, month: monthKey };
}

function money(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '$0';
  const rounded = Math.round(number * 100) / 100;
  return `$${String(rounded).replace(/\.0$/, '')}`;
}

function percentText(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '0%';
  return `${String(Math.round(number * 10) / 10).replace('.', ',')}%`;
}

function monthText(value) {
  const [year, month] = String(value || '').split('-');
  if (!year || !month) return value || '';
  return `${month}.${year}`;
}

function adminPanelMonthTitle(value) {
  const [year, month] = String(value || '').split('-').map(Number);
  if (!year || !month) return value || '';
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric'
  });
}

function adminPanelMonthValueFromOffset(baseValue, offset) {
  const [year, month] = String(baseValue || todayDateInputValue().slice(0, 7)).split('-').map(Number);
  const date = new Date(year || new Date().getFullYear(), (month || 1) - 1 + Number(offset || 0), 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function closeAdminPanelMonthMenu() {
  adminPanelMonthMenu?.remove();
  adminPanelMonthMenu = null;
}

function selectAdminPanelMonth(value) {
  const nextMonth = String(value || todayDateInputValue().slice(0, 7)).slice(0, 7);
  closeAdminPanelMonthMenu();
  if (!nextMonth || nextMonth === adminPanelSelectedMonth) return;
  adminPanelSelectedMonth = nextMonth;
  localStorage.setItem('dream_crm_admin_month', adminPanelSelectedMonth);
  if (adminPanelMonthInput) adminPanelMonthInput.value = adminPanelSelectedMonth;
  if (adminPanelMonthText) adminPanelMonthText.textContent = adminPanelMonthTitle(adminPanelSelectedMonth);
  adminPanelSelectedDay = '';
  loadAdminPanelBalances();
}

function openAdminPanelMonthMenu() {
  const control = adminPanelMonthInput?.closest('.admin-panel-month-control');
  if (!control) return;
  if (adminPanelMonthMenu) {
    closeAdminPanelMonthMenu();
    return;
  }
  const baseMonth = String(adminPanelSelectedMonth || adminPanelMonthInput?.value || todayDateInputValue().slice(0, 7)).slice(0, 7);
  const menu = document.createElement('div');
  menu.className = 'admin-panel-month-menu';
  for (let offset = -6; offset <= 6; offset += 1) {
    const value = adminPanelMonthValueFromOffset(baseMonth, offset);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = value === baseMonth ? 'active' : '';
    button.dataset.month = value;
    button.textContent = adminPanelMonthTitle(value);
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      selectAdminPanelMonth(value);
    });
    menu.appendChild(button);
  }
  control.appendChild(menu);
  adminPanelMonthMenu = menu;
}

function renderOwnerAdminPanelSwitch(admins = [], selectedAdminId = '') {
  if (!adminPanelAdminSwitch) return;
  const items = Array.isArray(admins) ? admins : [];
  const visible = currentUser?.role === 'director' && items.length > 0;
  adminPanelAdminSwitch.classList.toggle('hidden', !visible);
  if (!visible) {
    adminPanelAdminSwitch.innerHTML = '';
    return;
  }
  const selected = String(selectedAdminId || ownerSelectedAdminPanelId || '');
  adminPanelAdminSwitch.innerHTML = [
    `<button class="admin-panel-admin-switch-btn ${selected ? '' : 'active'}" type="button" data-admin-id="">All</button>`,
    ...items.map(admin => {
      const id = String(admin.id || '');
      const name = admin.name || admin.username || id;
      return `<button class="admin-panel-admin-switch-btn ${selected === id ? 'active' : ''}" type="button" data-admin-id="${escapeAttr(id)}">${escapeHtml(name)}</button>`;
    })
  ].join('');
}

function syncAdminPanelRoute(active) {
  const url = new URL(window.location.href);
  if (active) url.searchParams.set('adminPanel', '1');
  else url.searchParams.delete('adminPanel');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

function renderAdminPanel(result = {}) {
  adminPanelLastResult = result;
  adminPanelCellColors = result.cellColors && typeof result.cellColors === 'object' ? { ...result.cellColors } : {};
  adminPanelCellComments = result.cellComments && typeof result.cellComments === 'object' ? { ...result.cellComments } : {};
  const readOnly = ['director', 'mentor'].includes(currentUser?.role) || result.readOnly === true;
  if (currentUser?.role === 'director') {
    ownerSelectedAdminPanelId = String(result.selectedAdminId || ownerSelectedAdminPanelId || '');
    if (ownerSelectedAdminPanelId) localStorage.setItem('dream_crm_owner_admin_panel_id', ownerSelectedAdminPanelId);
    else localStorage.removeItem('dream_crm_owner_admin_panel_id');
    renderOwnerAdminPanelSwitch(result.adminPanelAdmins || [], ownerSelectedAdminPanelId);
  } else {
    renderOwnerAdminPanelSwitch([], '');
  }
  const operators = Array.isArray(result.operators) ? [...result.operators] : [];
  const table = result.table || {};
  const dayKeys = Array.isArray(table.dayKeys) ? table.dayKeys : [];
  const tableRows = Array.isArray(table.rows) ? table.rows : [];
  const selfOperatorId = String(result.selfOperatorId || currentUser?.id || '');
  const giftsDaily = Object.fromEntries(dayKeys.map(day => [day, Number(table.giftsDaily?.[day] || 0)]));
  const giftsTotal = Math.round(Number(table.giftsTotal || 0) * 100) / 100;
  const selectedMonth = String(table.month || adminPanelSelectedMonth || todayDateInputValue().slice(0, 7)).slice(0, 7);
  adminPanelSelectedMonth = selectedMonth;
  localStorage.setItem('dream_crm_admin_month', selectedMonth);
  const fallbackDay = result.date || dayKeys.at(-1) || todayDateInputValue();
  const selectedDay = dayKeys.includes(adminPanelSelectedDay) ? adminPanelSelectedDay : fallbackDay;
  adminPanelSelectedDay = selectedDay;

  if (adminPanelMonthInput && adminPanelMonthInput.value !== selectedMonth) {
    adminPanelMonthInput.value = selectedMonth;
  }
  if (adminPanelMonthText) adminPanelMonthText.textContent = adminPanelMonthTitle(selectedMonth);
  if (adminPanelTodayLabel) {
    adminPanelTodayLabel.textContent = monthLabelFromValue(selectedMonth);
  }
  const adminStart = salaryPeriodDateKey(currentUser?.adminStartedAt || currentUser?.createdAt || '');
  const monthEndForVisibility = `${selectedMonth}-${String(new Date(Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5, 7)), 0).getDate()).padStart(2, '0')}`;
  const currentAdminVisible = currentUser?.role === 'admin' && hasAdminPanelAccess() && (!adminStart || adminStart <= monthEndForVisibility);
  if (currentAdminVisible && currentUser?.id && !operators.some(operator => String(operator.operatorId || '') === String(currentUser.id))) {
    operators.unshift({
      operatorId: currentUser.id,
      operatorName: currentUser.name || currentUser.username || currentUser.id,
      username: currentUser.username || '',
      operatorActive: currentUser.active !== false,
      operatorCreatedAt: currentUser.createdAt || '',
      total: 0,
      count: 0,
      profileCount: 0,
      profiles: [],
      error: ''
    });
  }
  if (adminPanelStatus) {
    const failed = operators.filter(item => item.error);
    adminPanelStatus.textContent = failed.length
      ? `Есть ошибки обновления: ${failed.map(item => item.operatorName).join(', ')}.`
      : `Updated: ${new Date(result.generatedAt || Date.now()).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}.`;
  }
  if (!adminPanelOperators) return;

  const grouped = new Map();
  for (const operator of operators) {
    const operatorId = String(operator.operatorId || '');
    if (!operatorId || grouped.has(operatorId)) continue;
    grouped.set(operatorId, {
      operatorId,
      operatorName: operator.operatorName || operator.username || operatorId,
      active: operator.operatorActive !== false,
      deletedAt: operator.operatorDeletedAt || '',
      createdAt: operator.operatorCreatedAt || '',
      totalMonth: 0,
      profiles: [],
      daily: Object.fromEntries(dayKeys.map(day => [day, 0]))
    });
  }
  const knownProfileMap = new Map();
  for (const profile of availableProfiles || []) {
    if (profile?.id) knownProfileMap.set(String(profile.id), profile);
  }
  for (const operator of operators) {
    for (const profile of operator.profiles || []) {
      if (profile?.profileId) knownProfileMap.set(String(profile.profileId), {
        id: String(profile.profileId),
        name: profile.profileName || profile.profileId,
        photoUrl: profile.photoUrl || ''
      });
    }
  }
  const ensureGroupProfile = (group, profileId, source = {}) => {
    const id = String(profileId || '');
    if (!group || !id || group.profiles.some(profile => String(profile.profileId || '') === id)) return;
    const known = knownProfileMap.get(id) || {};
    group.profiles.push({
      profileId: id,
      profileName: source.profileName || known.name || id,
      photoUrl: source.photoUrl || known.photoUrl || '',
      active: source.active !== false,
      assignmentPeriods: Array.isArray(source.assignmentPeriods) ? source.assignmentPeriods : [],
      totalMonth: Number(source.totalMonth || 0),
      daily: source.daily || Object.fromEntries(dayKeys.map(day => [day, 0]))
    });
  };
  for (const operator of operators) {
    const group = grouped.get(String(operator.operatorId || ''));
    for (const profile of operator.profiles || []) {
      ensureGroupProfile(group, profile.profileId, {
        profileName: profile.profileName,
        photoUrl: profile.photoUrl,
        active: profile.active,
        assignmentPeriods: profile.assignmentPeriods
      });
    }
  }
  const selfGroup = grouped.get(String(currentUser?.id || ''));
  if (selfGroup && currentUser?.role === 'admin' && hasAdminPanelAccess()) {
    for (const profileId of currentUser.profileIds || []) ensureGroupProfile(selfGroup, profileId);
  }
  for (const row of tableRows) {
    const operatorId = String(row.operatorId || '');
    if (!grouped.has(operatorId)) {
      grouped.set(operatorId, {
        operatorId,
        operatorName: row.operatorName || row.username || operatorId,
        active: row.operatorActive !== false,
        deletedAt: row.operatorDeletedAt || '',
        createdAt: row.operatorCreatedAt || '',
        totalMonth: 0,
        profiles: [],
        daily: Object.fromEntries(dayKeys.map(day => [day, 0]))
      });
    }
    const group = grouped.get(operatorId);
    const profileDaily = Object.fromEntries(dayKeys.map(day => [day, Number(row.daily?.[day] || 0)]));
    for (const day of dayKeys) group.daily[day] = Number(group.daily[day] || 0) + Number(profileDaily[day] || 0);
    group.totalMonth += Number(row.total || 0);
    const existingProfile = group.profiles.find(profile => String(profile.profileId || '') === String(row.profileId || ''));
    if (existingProfile) {
      Object.assign(existingProfile, {
        profileName: row.profileName || row.profileId || existingProfile.profileName,
        photoUrl: row.photoUrl || existingProfile.photoUrl || '',
        active: row.active !== false,
        assignmentPeriods: Array.isArray(row.assignmentPeriods) ? row.assignmentPeriods : existingProfile.assignmentPeriods,
        totalMonth: Number(row.total || 0),
        daily: profileDaily
      });
      continue;
    }
    group.profiles.push({
      profileId: row.profileId || '',
      profileName: row.profileName || row.profileId || '',
      photoUrl: row.photoUrl || '',
      active: row.active !== false,
      assignmentPeriods: Array.isArray(row.assignmentPeriods) ? row.assignmentPeriods : [],
      totalMonth: Number(row.total || 0),
      daily: profileDaily
    });
  }
  const profileSortDate = profile => {
    const periods = Array.isArray(profile.assignmentPeriods) ? profile.assignmentPeriods : [];
    const dates = periods.map(period => {
      const value = profile.active !== false ? period?.from : period?.to;
      return String(value || '').slice(0, 10);
    }).filter(Boolean).sort();
    return profile.active !== false ? (dates[0] || '') : (dates.at(-1) || '');
  };
  const sortProfilesForAdminPanel = (a, b) => {
    const aActive = a.active !== false;
    const bActive = b.active !== false;
    if (aActive !== bActive) return aActive ? -1 : 1;
    const aDate = profileSortDate(a);
    const bDate = profileSortDate(b);
    if (aActive) return aDate.localeCompare(bDate) || String(a.profileName || '').localeCompare(String(b.profileName || ''));
    return bDate.localeCompare(aDate) || String(a.profileName || '').localeCompare(String(b.profileName || ''));
  };
  const operatorGroups = [...grouped.values()]
    .map(group => ({
      ...group,
      totalMonth: Math.round(Number(group.totalMonth || 0) * 100) / 100,
      activeProfileCount: group.profiles.filter(profile => profile.active !== false).length,
      profiles: group.profiles.sort(sortProfilesForAdminPanel)
    }))
    .sort((a, b) =>
      Number(b.operatorId === selfOperatorId) - Number(a.operatorId === selfOperatorId) ||
      Number(a.active === false) - Number(b.active === false) ||
      Number(b.totalMonth || 0) - Number(a.totalMonth || 0) ||
      String(a.operatorName || '').localeCompare(String(b.operatorName || ''))
    );
  const activeOperatorGroups = operatorGroups.filter(group => group.active !== false);
  const deletedOperatorGroups = operatorGroups.filter(group => group.active === false);

  const operatorTotalsByDay = Object.fromEntries(dayKeys.map(day => [day, Math.round(operatorGroups.reduce((sum, row) => sum + Number(row.daily?.[day] || 0), 0) * 100) / 100]));
  const totalsByDay = Object.fromEntries(dayKeys.map(day => [day, Math.round((Number(operatorTotalsByDay[day] || 0) + Number(giftsDaily[day] || 0)) * 100) / 100]));
  const operatorMonthTotal = Math.round(dayKeys.reduce((sum, day) => sum + Number(operatorTotalsByDay[day] || 0), 0) * 100) / 100;
  const monthTotal = Math.round((operatorMonthTotal + giftsTotal) * 100) / 100;
  const profileCount = operatorGroups.reduce((sum, group) => sum + Number(group.activeProfileCount || 0), 0);
  const resultDate = String(result.date || '').slice(0, 10);
  const todayKey = /^\d{4}-\d{2}-\d{2}$/.test(resultDate) ? resultDate : todayDateInputValue();
  if (adminPanelTotal) adminPanelTotal.textContent = money(monthTotal);
  if (adminPanelOperatorsCount) adminPanelOperatorsCount.textContent = String(operatorGroups.length);
  if (adminPanelRowsCount) adminPanelRowsCount.textContent = String(profileCount);

  if (!dayKeys.length && !operatorGroups.length) {
    adminPanelOperators.innerHTML = '<div class="admin-panel-empty admin-panel-empty-large">No data for this month</div>';
    return;
  }

  const amountText = value => {
    const number = Number(value || 0);
    return Number.isFinite(number) ? number.toFixed(2) : '0.00';
  };
  const valueForKey = key => String(adminPanelCellColors[key] || '').trim();
  const commentForKey = key => String(adminPanelCellComments[key] || '').trim();
  const commentAttrs = key => {
    const comment = commentForKey(key);
    return comment
      ? ` data-comment="${escapeAttr(comment)}" aria-label="${escapeAttr(comment)}"`
      : '';
  };
  const commentCorner = comment => comment ? '<span class="admin-comment-corner" aria-hidden="true"></span>' : '';
  const colorForKey = key => {
    const value = valueForKey(key);
    return /^#[0-9a-f]{6}$/i.test(value) ? value : '';
  };
  const markerForKey = key => valueForKey(key) === ADMIN_PANEL_TRAINING_MARKER ? ADMIN_PANEL_TRAINING_MARKER : '';
  const colorStyle = color => color ? `background:${escapeAttr(color)} !important;` : '';
  const columnColorKey = day => `col|${day}`;
  const cellColorKey = (rowKey, day) => `${rowKey}|${day}`;
  const rowColor = (rowKey, day, fallback = '#ffffff') => colorForKey(cellColorKey(rowKey, day)) || colorForKey(columnColorKey(day)) || fallback;
  const dayInAssignmentPeriods = (day, periods) => {
    if (!Array.isArray(periods) || !periods.length) return true;
    return periods.some(period => {
      const from = String(period?.from || '').slice(0, 10);
      const to = String(period?.to || '').slice(0, 10);
      return from && to && day >= from && day <= to;
    });
  };
  const heatClass = value => {
    const number = Number(value || 0);
    if (number >= 100) return 'heat-strong';
    if (number >= 40) return 'heat-mid';
    if (number > 0) return 'heat-low';
    return '';
  };
  const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weekdayHeaders = dayKeys.map(day => {
    const [year, month, date] = String(day).split('-').map(Number);
    const weekdayIndex = new Date(year, month - 1, date).getDay();
    const weekday = weekdayNames[weekdayIndex] || '';
    const weekendClass = weekdayIndex === 0 || weekdayIndex === 6 ? ' is-weekend' : '';
    const colorKey = columnColorKey(day);
    const hasComment = commentForKey(colorKey) ? ' has-admin-comment' : '';
    const bg = colorForKey(colorKey) || (weekendClass ? '#eefbff' : '#ffffff');
    const comment = commentForKey(colorKey);
    return `<th class="admin-matrix-weekday admin-matrix-color-target${weekendClass}${hasComment}" data-color-key="${escapeAttr(colorKey)}" data-color-scope="column" data-color-day="${escapeAttr(day)}"${commentAttrs(colorKey)} style="background:${bg} !important;color:#263343 !important;font-size:12px !important;font-weight:600 !important;line-height:1 !important;padding:0 !important">${weekday}${commentCorner(comment)}</th>`;
  }).join('');
  const dayHeaders = dayKeys.map(day => {
    const [year, month, date] = String(day).split('-').map(Number);
    const weekdayIndex = new Date(year, month - 1, date).getDay();
    const weekendClass = weekdayIndex === 0 || weekdayIndex === 6 ? ' is-weekend' : '';
    const colorKey = columnColorKey(day);
    const hasComment = commentForKey(colorKey) ? ' has-admin-comment' : '';
    const bg = colorForKey(colorKey) || (weekendClass ? '#eefbff' : '#ffffff');
    const comment = commentForKey(colorKey);
    return `<th class="admin-matrix-day admin-matrix-color-target${weekendClass}${hasComment}" data-color-key="${escapeAttr(colorKey)}" data-color-scope="column" data-color-day="${escapeAttr(day)}"${commentAttrs(colorKey)} style="background:${bg} !important;color:#263343 !important;font-size:12px !important;font-weight:600 !important;line-height:1 !important;padding:0 !important">${Number(day.slice(-2))}${commentCorner(comment)}</th>`;
  }).join('');
  const dayCells = (daily, rowKey, background = '#ffffff', options = {}) => dayKeys.map(day => {
    const value = Number(daily?.[day] || 0);
    const colorKey = cellColorKey(rowKey, day);
    const marker = markerForKey(colorKey) || markerForKey(columnColorKey(day));
    const isInactiveDay = options.assignmentPeriods ? !dayInAssignmentPeriods(day, options.assignmentPeriods) : false;
    const bg = marker
      ? '#ffffff'
      : (isInactiveDay ? '#f3f4f6' : rowColor(rowKey, day, options.profileRow ? '#ffffff' : background));
    const isFutureDay = day > todayKey;
    const baseText = isInactiveDay || isFutureDay ? '' : amountText(value);
    const text = marker ? ADMIN_PANEL_TRAINING_MARKER : (baseText || '&nbsp;');
    const commentText = commentForKey(colorKey) || commentForKey(columnColorKey(day));
    const hasComment = commentText ? ' has-admin-comment' : '';
    const commentData = commentText ? ` data-comment="${escapeAttr(commentText)}" aria-label="${escapeAttr(commentText)}"` : '';
    const canMark = !readOnly && baseText && options.allowMarks ? ' data-mark-allowed="1"' : '';
    const canComment = !readOnly && options.allowComments ? ' data-comment-allowed="1"' : '';
    return `<td class="admin-matrix-day-cell admin-matrix-color-target${hasComment} ${isInactiveDay ? 'is-inactive-assignment-day' : (isFutureDay ? 'is-future-day' : heatClass(value))}" data-color-key="${escapeAttr(colorKey)}" data-color-scope="cell" data-color-day="${escapeAttr(day)}" data-base-text="${escapeAttr(baseText)}"${canMark}${canComment}${commentData} style="background:${bg} !important;color:#263343 !important;font-size:12px !important;font-weight:600 !important;line-height:1 !important;padding:0 !important;text-align:center !important;vertical-align:middle !important">${text}${commentCorner(commentText)}</td>`;
  }).join('');
  const leftCellStyle = 'color:#263343 !important;font-size:12px !important;font-weight:700 !important;line-height:1 !important;letter-spacing:0 !important';
  const leftHeadStyle = `background:#ffffff !important;${leftCellStyle}`;
  const totalRowBg = '#eaf4f2';
  const daysWidth = Math.max(dayKeys.length * 58, 58);
  const leftProfileRows = group => group.profiles.map((profile, index) => {
    const inactive = profile.active === false;
    const profileBg = inactive ? '#f3f4f6' : '#ffffff';
    const groupClass = `${index === 0 ? 'is-profile-group-first' : ''} ${index === group.profiles.length - 1 ? 'is-profile-group-last' : ''}`.trim();
    const nameCommentKey = `profile-name:${group.operatorId}:${profile.profileId}`;
    const nameComment = commentForKey(nameCommentKey);
    const nameCommentClass = nameComment ? ' has-admin-comment' : '';
    const nameCommentData = nameComment ? ` data-comment="${escapeAttr(nameComment)}" aria-label="${escapeAttr(nameComment)}"` : '';
    return `
    <tr class="admin-matrix-profile-row ${inactive ? 'is-inactive-profile' : ''} ${groupClass} hidden" data-parent-operator="${escapeAttr(group.operatorId)}">
      <td class="admin-matrix-name admin-matrix-color-target${nameCommentClass}" data-color-key="${escapeAttr(nameCommentKey)}" data-color-scope="comment"${nameCommentData} style="background:${profileBg} !important;${leftCellStyle}">
        <span class="admin-matrix-profile-name" style="${leftCellStyle}">${escapeHtml(profile.profileName || profile.profileId || '')}</span>
        <small style="${leftCellStyle}">ID ${escapeHtml(profile.profileId || '')}</small>
        ${commentCorner(nameComment)}
      </td>
      <td class="admin-matrix-count" style="background:${profileBg} !important;${leftCellStyle}"></td>
      <td class="admin-matrix-total" style="background:${profileBg} !important;${leftCellStyle}">${amountText(profile.totalMonth || 0)}</td>
    </tr>
  `;
  }).join('');
  const dayProfileRows = group => group.profiles.map((profile, index) => {
    const groupClass = `${index === 0 ? 'is-profile-group-first' : ''} ${index === group.profiles.length - 1 ? 'is-profile-group-last' : ''}`.trim();
    return `
    <tr class="admin-matrix-profile-row ${profile.active === false ? 'is-inactive-profile' : ''} ${groupClass} hidden" data-parent-operator="${escapeAttr(group.operatorId)}">
      ${dayCells(profile.daily, `profile:${group.operatorId}:${profile.profileId}`, '#ffffff', { assignmentPeriods: profile.assignmentPeriods, profileRow: true })}
    </tr>
  `;
  }).join('');
  const operatorAssignmentPeriods = group => {
    const from = String(group.createdAt || '').slice(0, 10);
    const to = group.active === false && group.deletedAt ? String(group.deletedAt).slice(0, 10) : dayKeys.at(-1);
    return from && to ? [{ from, to }] : [];
  };
  const leftOperatorRows = groupList => groupList.map((group, index) => `
    <tr class="admin-matrix-operator-row ${group.active === false ? 'is-deleted-operator' : ''} ${group.active === false && index === 0 ? 'is-first-deleted-operator' : ''}" data-operator-id="${escapeAttr(group.operatorId)}">
      <td class="admin-matrix-name admin-matrix-color-target${commentForKey(`operator-name:${group.operatorId}`) ? ' has-admin-comment' : ''}" data-color-key="${escapeAttr(`operator-name:${group.operatorId}`)}" data-color-scope="comment"${readOnly ? '' : ' data-comment-allowed="1"'}${commentForKey(`operator-name:${group.operatorId}`) ? ` data-comment="${escapeAttr(commentForKey(`operator-name:${group.operatorId}`))}" aria-label="${escapeAttr(commentForKey(`operator-name:${group.operatorId}`))}"` : ''} style="background:${group.active === false ? '#f8fafc' : '#ffffff'} !important;${leftCellStyle}">
        <button class="admin-matrix-toggle" type="button" aria-expanded="false" style="${leftCellStyle}">▸</button>
        <strong style="${leftCellStyle};${group.active === false ? 'color:#dc2626 !important;text-decoration-line:line-through !important;text-decoration-thickness:.75px !important;text-decoration-color:rgba(220,38,38,.9) !important' : ''}">${escapeHtml(group.operatorName || '')}</strong>
        ${commentCorner(commentForKey(`operator-name:${group.operatorId}`))}
      </td>
      <td class="admin-matrix-count" style="background:${group.active === false ? '#f8fafc' : '#ffffff'} !important;${leftCellStyle}">${escapeHtml(String(group.activeProfileCount || 0))}</td>
      <td class="admin-matrix-total" style="background:${group.active === false ? '#f8fafc' : '#ffffff'} !important;${leftCellStyle}">${amountText(group.totalMonth || 0)}</td>
    </tr>
    ${leftProfileRows(group)}
  `).join('');
  const dayOperatorRows = groupList => groupList.map((group, index) => `
    <tr class="admin-matrix-operator-row ${group.active === false ? 'is-deleted-operator' : ''} ${group.active === false && index === 0 ? 'is-first-deleted-operator' : ''}" data-operator-id="${escapeAttr(group.operatorId)}">
      ${dayCells(group.daily, `operator:${group.operatorId}`, group.active === false ? '#f8fafc' : '#ffffff', { assignmentPeriods: operatorAssignmentPeriods(group), allowMarks: true, allowComments: true })}
    </tr>
    ${dayProfileRows(group)}
  `).join('');
  const blankRowsCount = Math.max(28, 36 - operatorGroups.length - profileCount);
  const blankLeftRows = Array.from({ length: blankRowsCount }, () => `
    <tr class="admin-matrix-blank-row">
      <td class="admin-matrix-name" style="background:#ffffff !important;${leftCellStyle}">&nbsp;</td>
      <td class="admin-matrix-count" style="background:#ffffff !important;${leftCellStyle}">&nbsp;</td>
      <td class="admin-matrix-total" style="background:#ffffff !important;${leftCellStyle}">&nbsp;</td>
    </tr>
  `).join('');
  const blankDayCells = rowIndex => dayKeys.map(day => {
    const rowKey = `blank:${rowIndex}`;
    const colorKey = cellColorKey(rowKey, day);
    const bg = rowColor(rowKey, day, '#ffffff');
    const commentText = commentForKey(colorKey) || commentForKey(columnColorKey(day));
    const hasComment = commentText ? ' has-admin-comment' : '';
    const commentData = commentText ? ` data-comment="${escapeAttr(commentText)}" aria-label="${escapeAttr(commentText)}"` : '';
    return `
    <td class="admin-matrix-day-cell admin-matrix-blank-cell admin-matrix-color-target${hasComment}" data-color-key="${escapeAttr(colorKey)}" data-color-scope="cell" data-color-day="${escapeAttr(day)}" data-base-text=""${commentData} style="background:${bg} !important;color:#263343 !important;font-size:12px !important;font-weight:600 !important;line-height:1 !important;padding:0 !important;text-align:center !important;vertical-align:middle !important">&nbsp;${commentCorner(commentText)}</td>`;
  }).join('');
  const blankDayRows = Array.from({ length: blankRowsCount }, (_, index) => `
    <tr class="admin-matrix-blank-row">${blankDayCells(index)}</tr>
  `).join('');
  const giftsRowBg = '#fff3bf';
  const giftsLeftRow = `
    <tr class="admin-matrix-gifts-row">
      <td class="admin-matrix-name" style="background:${giftsRowBg} !important;${leftCellStyle}">&nbsp;</td>
      <td class="admin-matrix-count" style="background:${giftsRowBg} !important;${leftCellStyle}">Gifts</td>
      <td class="admin-matrix-total" style="background:${giftsRowBg} !important;${leftCellStyle}">${amountText(giftsTotal)}</td>
    </tr>
  `;
  const giftsDayRow = `
    <tr class="admin-matrix-gifts-row">
      ${dayKeys.map(day => {
        const value = Number(giftsDaily[day] || 0);
        return `<td class="admin-matrix-day-cell" style="background:${giftsRowBg} !important;color:#263343 !important;font-size:12px !important;font-weight:700 !important;line-height:1 !important;padding:0 !important;text-align:center !important;vertical-align:middle !important">${value ? amountText(value) : '&nbsp;'}</td>`;
      }).join('')}
    </tr>
  `;

  adminPanelOperators.innerHTML = `
    <div class="admin-matrix-wrap">
      <div class="admin-matrix-split">
        <table class="admin-matrix-table admin-matrix-left-table" style="width:354px;min-width:354px">
          <colgroup>
            <col class="admin-matrix-col-name">
            <col class="admin-matrix-col-count">
            <col class="admin-matrix-col-total">
          </colgroup>
          <thead>
            <tr>
              <th class="admin-matrix-name-head" rowspan="2" style="${leftHeadStyle}">Name</th>
              <th class="admin-matrix-count-head" rowspan="2" style="${leftHeadStyle}">Ladies</th>
              <th class="admin-matrix-total-head" rowspan="2" style="${leftHeadStyle}">All $</th>
            </tr>
            <tr class="admin-matrix-left-header-spacer" aria-hidden="true"></tr>
          </thead>
          <tbody>
            ${leftOperatorRows(activeOperatorGroups)}
            ${leftOperatorRows(deletedOperatorGroups)}
            ${giftsLeftRow}
            <tr class="admin-matrix-total-row">
              <td class="admin-matrix-name" style="background:${totalRowBg} !important;${leftCellStyle}"></td>
              <td class="admin-matrix-count" style="background:${totalRowBg} !important;${leftCellStyle}">Total</td>
              <td class="admin-matrix-total" style="background:${totalRowBg} !important;${leftCellStyle}">${amountText(monthTotal)}</td>
            </tr>
            ${blankLeftRows}
          </tbody>
        </table>
        <div class="admin-matrix-days-pane">
          <div class="admin-matrix-days-head-scroll">
            <table class="admin-matrix-table admin-matrix-days-table admin-matrix-days-head-table" style="width:${daysWidth}px;min-width:${daysWidth}px">
              <colgroup>
                ${dayKeys.map(() => '<col class="admin-matrix-col-day">').join('')}
              </colgroup>
              <thead>
                <tr>${weekdayHeaders}</tr>
                <tr>${dayHeaders}</tr>
              </thead>
            </table>
          </div>
          <div class="admin-matrix-scroll-rail">
            <div class="admin-matrix-scroll-thumb"></div>
          </div>
          <div class="admin-matrix-days-body-scroll">
            <table class="admin-matrix-table admin-matrix-days-table admin-matrix-days-body-table" style="width:${daysWidth}px;min-width:${daysWidth}px">
              <colgroup>
                ${dayKeys.map(() => '<col class="admin-matrix-col-day">').join('')}
              </colgroup>
              <tbody>
                ${dayOperatorRows(activeOperatorGroups)}
                ${dayOperatorRows(deletedOperatorGroups)}
                ${giftsDayRow}
                <tr class="admin-matrix-total-row">
                  ${dayCells(totalsByDay, 'total', totalRowBg, { noMarks: true })}
                </tr>
                ${blankDayRows}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div class="admin-matrix-days-top-scroll">
        <div style="width:${daysWidth}px;min-width:${daysWidth}px;height:1px"></div>
      </div>
    </div>
  `;
  restoreAdminPanelCommentMarkers();
  const headScroll = adminPanelOperators.querySelector('.admin-matrix-days-head-scroll');
  const topScroll = adminPanelOperators.querySelector('.admin-matrix-days-top-scroll');
  const bodyScroll = adminPanelOperators.querySelector('.admin-matrix-days-body-scroll');
  const scrollRail = adminPanelOperators.querySelector('.admin-matrix-scroll-rail');
  const scrollThumb = adminPanelOperators.querySelector('.admin-matrix-scroll-thumb');
  const daysPane = adminPanelOperators.querySelector('.admin-matrix-days-pane');
  let syncingMatrixScroll = false;
  const getMatrixScrollMetrics = () => {
    const visible = Math.max(1, scrollRail?.clientWidth || daysPane?.clientWidth || bodyScroll?.clientWidth || 1);
    const total = Math.max(visible, daysWidth);
    const maxScrollLeft = Math.max(0, total - visible);
    const currentScrollLeft = Math.min(
      maxScrollLeft,
      Math.max(0, headScroll?.scrollLeft || 0, bodyScroll?.scrollLeft || 0, topScroll?.scrollLeft || 0)
    );
    return { visible, total, maxScrollLeft, currentScrollLeft };
  };
  const setMatrixScrollLeft = scrollLeft => {
    const { maxScrollLeft } = getMatrixScrollMetrics();
    const nextScrollLeft = Math.min(maxScrollLeft, Math.max(0, scrollLeft));
    if (headScroll) headScroll.scrollLeft = nextScrollLeft;
    if (topScroll) topScroll.scrollLeft = nextScrollLeft;
    if (bodyScroll) bodyScroll.scrollLeft = nextScrollLeft;
  };
  const updateMatrixThumb = () => {
    if (!scrollRail || !scrollThumb || !bodyScroll || !daysPane) return;
    const { maxScrollLeft, currentScrollLeft } = getMatrixScrollMetrics();
    const railWidth = Math.max(1, scrollRail.clientWidth || 1);
    const thumbWidth = maxScrollLeft ? Math.min(railWidth, 320) : railWidth;
    const maxThumbLeft = Math.max(0, railWidth - thumbWidth);
    const thumbLeft = maxThumbLeft && maxScrollLeft ? Math.round((currentScrollLeft / maxScrollLeft) * maxThumbLeft) : 0;
    scrollThumb.style.width = `${thumbWidth}px`;
    scrollThumb.style.transform = `translateX(${thumbLeft}px)`;
  };
  const syncMatrixScroll = source => {
    if (syncingMatrixScroll) return;
    syncingMatrixScroll = true;
    const scrollLeft = source.scrollLeft;
    setMatrixScrollLeft(scrollLeft);
    requestAnimationFrame(() => {
      updateMatrixThumb();
      syncingMatrixScroll = false;
    });
  };
  topScroll?.addEventListener('scroll', () => syncMatrixScroll(topScroll), { passive: true });
  bodyScroll?.addEventListener('scroll', () => syncMatrixScroll(bodyScroll), { passive: true });
  headScroll?.addEventListener('scroll', () => syncMatrixScroll(headScroll), { passive: true });
  daysPane?.addEventListener('wheel', event => {
    if (!topScroll) return;
    const horizontalDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : 0;
    const shiftDelta = event.shiftKey ? event.deltaY : 0;
    const delta = horizontalDelta || shiftDelta;
    if (!delta) return;
    event.preventDefault();
    setMatrixScrollLeft((topScroll.scrollLeft || 0) + delta);
    syncMatrixScroll(topScroll);
  }, { passive: false });
  scrollRail?.addEventListener('pointerdown', event => {
    if (!scrollRail || !bodyScroll || !daysPane) return;
    event.preventDefault();
    const railRect = scrollRail.getBoundingClientRect();
    const thumbRect = scrollThumb?.getBoundingClientRect();
    const dragOffset = event.target === scrollThumb && thumbRect ? event.clientX - thumbRect.left : (thumbRect?.width || 28) / 2;
    const moveTo = clientX => {
      const { maxScrollLeft } = getMatrixScrollMetrics();
      const thumbWidth = maxScrollLeft ? Math.min(railRect.width, 320) : railRect.width;
      const maxThumbLeft = Math.max(1, railRect.width - thumbWidth);
      const nextLeft = Math.min(maxThumbLeft, Math.max(0, clientX - railRect.left - dragOffset));
      const nextScrollLeft = Math.round((nextLeft / maxThumbLeft) * maxScrollLeft);
      setMatrixScrollLeft(nextScrollLeft);
      if (scrollThumb) {
        scrollThumb.style.width = `${thumbWidth}px`;
        scrollThumb.style.transform = `translateX(${nextLeft}px)`;
      }
      syncMatrixScroll(bodyScroll);
    };
    const onPointerMove = moveEvent => moveTo(moveEvent.clientX);
    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
    moveTo(event.clientX);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once: true });
  });
  window.addEventListener('resize', updateMatrixThumb, { passive: true });
  requestAnimationFrame(updateMatrixThumb);
}

async function loadAdminPanelBalances({ refresh = false } = {}) {
  if (!hasAdminPanelAccess()) return;
  if (currentUser?.role === 'mentor' && !mentorSelectedAdminPanelId) {
    showMentorAdminPanelChoice().catch(error => {
      if (adminPanelStatus) adminPanelStatus.textContent = error.message || 'Could not load administrators';
    });
    return;
  }
  const month = String(adminPanelMonthInput?.value || adminPanelSelectedMonth || todayDateInputValue().slice(0, 7)).slice(0, 7);
  adminPanelSelectedMonth = month;
  localStorage.setItem('dream_crm_admin_month', month);
  const todayKey = todayDateInputValue();
  const date = todayKey.startsWith(`${month}-`) ? todayKey : `${month}-01`;
  adminPanelView?.classList.add('loading');
  if (adminPanelRefreshBtn) adminPanelRefreshBtn.disabled = true;
  if (adminPanelStatus) adminPanelStatus.textContent = refresh ? 'Refreshing balances...' : 'Loading balances...';
  try {
    const adminId = currentUser?.role === 'mentor'
      ? mentorSelectedAdminPanelId
      : currentUser?.role === 'director' ? ownerSelectedAdminPanelId : '';
    const query = new URLSearchParams({ date });
    if (adminId) query.set('adminId', adminId);
    const response = await fetch(refresh ? '/api/admin/operator-balances/today/refresh' : `/api/admin/operator-balances/today?${query.toString()}`, {
      method: refresh ? 'POST' : 'GET',
      headers: refresh ? { 'Content-Type': 'application/json' } : undefined,
      body: refresh ? JSON.stringify({ date, adminId }) : undefined
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not load admin panel');
    renderAdminPanel(result);
  } catch (error) {
    if (adminPanelStatus) adminPanelStatus.textContent = error.message || 'Could not load admin panel';
    if (adminPanelOperators) adminPanelOperators.innerHTML = '';
  } finally {
    adminPanelView?.classList.remove('loading');
    if (adminPanelRefreshBtn) adminPanelRefreshBtn.disabled = false;
  }
}

function setStatsBalanceMode(mode) {
  statsBalanceMode = mode === 'fixed' ? 'fixed' : 'profile';
  localStorage.setItem('dream_crm_stats_balance_mode', statsBalanceMode);
  myStatsView?.classList.toggle('fixed-balance-mode', statsBalanceMode === 'fixed');
  myStatsView?.classList.toggle('profile-balance-mode', statsBalanceMode !== 'fixed');
  statsProfileBalanceBtn?.classList.toggle('active', statsBalanceMode !== 'fixed');
  statsMyBalanceBtn?.classList.toggle('active', statsBalanceMode === 'fixed');
  statsProfileBalanceBtn?.setAttribute('aria-selected', statsBalanceMode !== 'fixed' ? 'true' : 'false');
  statsMyBalanceBtn?.setAttribute('aria-selected', statsBalanceMode === 'fixed' ? 'true' : 'false');
  if (statsBalanceMode === 'fixed') loadFixedBalance();
}

function renderMyStatsDashboard(rows = []) {
  const totalEl = document.getElementById('myStatsTotal');
  const totalWithEl = document.getElementById('myStatsTotalWith');
  const totalMetaEl = document.getElementById('myStatsTotalMeta');
  const giftsEl = document.getElementById('myStatsGifts');
  const giftsTotalEl = document.getElementById('myStatsGiftsTotal');
  const giftsMetaEl = document.getElementById('myStatsGiftsMeta');
  const penaltiesEl = document.getElementById('myStatsPenalties');
  const penaltiesTotalEl = document.getElementById('myStatsPenaltiesTotal');
  const penaltiesMetaEl = document.getElementById('myStatsPenaltiesMeta');
  const methodsTotalEl = document.getElementById('myStatsMethodsTotal');
  const donutEl = document.getElementById('myStatsDonut');
  const legendEl = document.getElementById('myStatsMethodsLegend');
  const giftRows = rows.filter(row => /gift/i.test(row.type || ''));
  const penaltyRows = rows.filter(row => Number(row.amount || 0) < 0 || /penalt|fine/i.test(row.type || ''));
  const positiveRows = rows.filter(row => Number(row.amount || 0) > 0);
  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const isThisWeek = row => {
    const date = new Date(row.date || row.dateText || row.createdAt || 0);
    return Number.isFinite(date.getTime()) && date >= weekStart;
  };
  const total = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const gifts = giftRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const penalties = Math.abs(penaltyRows.reduce((sum, row) => sum + Number(row.amount || 0), 0));
  const paidTotal = positiveRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const giftWeek = giftRows.filter(isThisWeek).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const penaltyWeek = Math.abs(penaltyRows.filter(isThisWeek).reduce((sum, row) => sum + Number(row.amount || 0), 0));

  if (totalEl) totalEl.textContent = money(total);
  if (totalWithEl) totalWithEl.textContent = money(total);
  if (totalMetaEl) totalMetaEl.textContent = money(total - gifts);
  if (giftsEl) giftsEl.textContent = money(gifts);
  if (giftsTotalEl) giftsTotalEl.textContent = money(gifts);
  if (giftsMetaEl) giftsMetaEl.textContent = money(giftWeek);
  if (penaltiesEl) penaltiesEl.textContent = money(penalties);
  if (penaltiesTotalEl) penaltiesTotalEl.textContent = money(penalties);
  if (penaltiesMetaEl) penaltiesMetaEl.textContent = money(penaltyWeek);
  if (methodsTotalEl) methodsTotalEl.textContent = money(paidTotal);

  const methodColors = {
    letter: '#4f83f1',
    letters: '#4f83f1',
    emailread: '#4f83f1',
    emailsend: '#f59e0b',
    textchat: '#8b5cf6',
    textchatsatellite: '#ec4899',
    chat: '#8b5cf6',
    privatealbum: '#ef476f',
    album: '#ef476f',
    photoalbum: '#ef476f',
    videoclip: '#20b486',
    videoletter: '#8b5cf6',
    videoletterread: '#8b5cf6',
    videochat: '#ef4444',
    videochatsatellite: '#10b981',
    videowatch: '#06b6d4',
    videowatchsatellite: '#f97316',
    identityvideo: '#6366f1'
  };
  const fallbackColors = ['#4f83f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#06b6d4', '#f97316', '#6366f1'];
  const colorForMethod = (type) => {
    const key = String(type || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (methodColors[key]) return methodColors[key];
    const hash = [...key].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return fallbackColors[hash % fallbackColors.length];
  };
  const grouped = new Map();
  positiveRows.forEach(row => {
    const type = String(row.type || 'Other').trim() || 'Other';
    grouped.set(type, (grouped.get(type) || 0) + Number(row.amount || 0));
  });
  const methods = [...grouped.entries()]
    .map(([type, amount]) => ({ type, amount, percent: paidTotal ? amount / paidTotal * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8);
  const methodsBodyEl = donutEl ? donutEl.closest('.my-stats-methods-body') : null;
  const hasMethodData = paidTotal > 0 && methods.length > 0;
  if (methodsBodyEl) methodsBodyEl.classList.toggle('is-empty', !hasMethodData);

  if (donutEl) {
    const ringRadius = 42;
    const ringStroke = 18;
    const gap = methods.length > 1 ? 4 : 0;
    const available = Math.max(0, 360 - gap * methods.length);
    const anglePoint = (angle, radius = ringRadius) => {
      const rad = (angle - 90) * Math.PI / 180;
      return {
        x: 60 + radius * Math.cos(rad),
        y: 60 + radius * Math.sin(rad)
      };
    };
    const arcPath = (start, end) => {
      const from = anglePoint(start);
      const to = anglePoint(end);
      const largeArc = end - start > 180 ? 1 : 0;
      return `M ${from.x.toFixed(2)} ${from.y.toFixed(2)} A ${ringRadius} ${ringRadius} 0 ${largeArc} 1 ${to.x.toFixed(2)} ${to.y.toFixed(2)}`;
    };
    let cursor = -38;
    const segments = methods.map((item) => {
      const start = cursor;
      const end = start + (paidTotal ? item.amount / paidTotal * available : 0);
      cursor = end + gap;
      return { color: colorForMethod(item.type), end, start };
    });
    const existingSvg = donutEl.querySelector('.my-stats-donut-svg');
    if (existingSvg) existingSvg.remove();
    if (hasMethodData) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'my-stats-donut-svg');
      svg.setAttribute('viewBox', '0 0 120 120');
      svg.setAttribute('aria-hidden', 'true');
      if (segments.length === 1) {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', '60');
        circle.setAttribute('cy', '60');
        circle.setAttribute('r', String(ringRadius));
        circle.setAttribute('fill', 'none');
        circle.setAttribute('stroke', segments[0].color);
        circle.setAttribute('stroke-width', String(ringStroke));
        svg.appendChild(circle);
      } else {
        segments.forEach(segment => {
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', arcPath(segment.start, segment.end));
          path.setAttribute('fill', 'none');
          path.setAttribute('stroke', segment.color);
          path.setAttribute('stroke-width', String(ringStroke));
          path.setAttribute('stroke-linecap', 'butt');
          svg.appendChild(path);
        });
      }
      donutEl.prepend(svg);
    }
    donutEl.style.setProperty('background', 'transparent', 'important');
  }
  if (legendEl) {
    legendEl.innerHTML = hasMethodData ? methods.map((item, index) => `
      <div class="my-stats-method-row">
        <span class="my-stats-method-dot" style="--method-color:${colorForMethod(item.type)}"></span>
        <span title="${escapeAttr(item.type)}">${escapeHtml(item.type)}</span>
        <strong>${item.percent.toFixed(1)}%</strong>
      </div>
    `).join('') : `
      <div class="my-stats-method-empty-state">
        <span class="my-stats-empty-chart" aria-hidden="true"></span>
        <span>No data available</span>
      </div>
    `;
  }
}

function renderMyStats(result = {}) {
  const rows = result.rows || [];
  renderMyStatsDashboard(rows);
  if (myStatsSummary) {
    myStatsSummary.textContent = rows.length
      ? `${rows.length} rows. Total: $${Number(result.total || 0).toFixed(2)}`
      : 'No bonuses found for this period.';
  }
  if (myStatsBody) {
    myStatsBody.innerHTML = rows.map(row => `
      <div class="my-stats-row" role="row">
        <div role="cell"><strong class="my-stats-amount">${escapeHtml(row.amountText || money(row.amount))}</strong></div>
        <div role="cell" title="${escapeAttr(row.type || '')}">${escapeHtml(row.type || '')}</div>
        <div role="cell" title="${escapeAttr(row.manId || row.byWhom || '')}">${escapeHtml(row.manId || row.byWhom || '')}</div>
        <div role="cell" title="${escapeAttr(row.ladyId || row.to || '')}">${escapeHtml(row.ladyId || row.to || '')}</div>
        <div role="cell" title="${escapeAttr(row.date || '')}">${escapeHtml(row.date || '')}</div>
      </div>
    `).join('') || '<div class="my-stats-row my-stats-empty">No data</div>';
  }
}

function renderFixedBalanceList(container, items = [], options = {}) {
  if (!container) return;
  const labelKey = options.labelKey || 'name';
  const fallback = options.fallback || 'No saved rows';
  if (options.kind === 'profile') {
    const sortedItems = [...items].sort((a, b) => {
      const activeDelta = Number(b.active !== false) - Number(a.active !== false);
      if (activeDelta) return activeDelta;
      return String(a.profileName || a.profileId || '').localeCompare(String(b.profileName || b.profileId || ''));
    });
    container.innerHTML = sortedItems.length ? sortedItems.map(item => {
      const label = item.profileName || item.profileId || 'Profile';
      const from = formatSalaryPeriodValue(item.periodFrom);
      const to = item.active === false ? formatSalaryPeriodValue(item.periodTo) : formatSalaryPeriodValue(item.periodTo || todayDateInputValue());
      const fallbackInitial = escapeHtml(String(label || '?').slice(0, 1).toUpperCase());
      const photo = String(item.photoUrl || '').trim();
      return `
        <button class="fixed-balance-profile-row ${item.active === false ? 'is-inactive' : 'is-active'}" type="button" data-profile-id="${escapeAttr(item.profileId || '')}">
          <span class="fixed-balance-profile-avatar">
            ${photo ? `<img src="${escapeAttr(photo)}" alt="">` : `<i>${fallbackInitial}</i>`}
          </span>
          <div class="fixed-balance-profile-main">
            <strong title="${escapeAttr(label)}">${escapeHtml(label)}</strong>
            <small>ID ${escapeHtml(item.profileId || '')}</small>
          </div>
          <span class="fixed-balance-profile-period">${escapeHtml(from)} - ${escapeHtml(to)}</span>
          <b>${money(item.total)}</b>
        </button>
      `;
    }).join('') : `<div class="fixed-balance-empty">${escapeHtml(fallback)}</div>`;
    return;
  }
  container.innerHTML = items.length ? items.map(item => {
    const label = item[labelKey] || item.profileName || item.operatorName || item.profileId || item.operatorId || 'Unknown';
    const sub = item.profileId || item.operatorId || '';
    return `
      <div class="fixed-balance-list-row">
        <span title="${escapeAttr(label)}">${escapeHtml(label)}</span>
        <small>${sub ? escapeHtml(sub) : `${Number(item.count || 0)} rows`}</small>
        <strong>${money(item.total)}</strong>
      </div>
    `;
  }).join('') : `<div class="fixed-balance-empty">${escapeHtml(fallback)}</div>`;
}

function formatSalaryPeriodValue(value) {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  if (raw.includes('T')) {
    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) {
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${day}.${month}.${year} ${hours}:${minutes}`;
    }
  }
  const dateOnly = raw.slice(0, 10);
  const match = dateOnly.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : dateOnly;
}

function salaryPeriodDateKey(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.includes('T')) {
    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) {
      return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')
      ].join('-');
    }
  }
  return raw.slice(0, 10);
}

function formatLedgerPeriod(item = {}) {
  const from = item.from ? String(item.from).slice(0, 10) : '-';
  const to = item.to ? String(item.to).slice(0, 10) : 'Now';
  return `${from} - ${to}`;
}

function monthLabelFromValue(value) {
  const [year, month] = String(value || '').split('-').map(Number);
  if (!year || !month) return '';
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function setSalaryCalendarMonthFromDate(dateValue) {
  const source = String(dateValue || todayDateInputValue()).slice(0, 10);
  salaryCalendarMonth = source.slice(0, 7);
}

function salaryDayData(dateValue) {
  return fixedBalanceDailyItems.find(item => item.date === dateValue) || { date: dateValue, total: 0, count: 0, profiles: [] };
}

function renderSalaryDayPanel(dateValue) {
  selectedSalaryDate = dateValue;
  const day = salaryDayData(dateValue);
  if (salaryDayProfiles) {
    const dayProfileMap = new Map((day.profiles || []).map(profile => [String(profile.profileId || ''), profile]));
    const assignedProfiles = fixedBalanceProfileItems
      .filter(profile => {
        const from = salaryPeriodDateKey(profile.periodFrom);
        const to = salaryPeriodDateKey(profile.periodTo);
        return from && to && dateValue >= from && dateValue <= to;
      })
      .map(profile => ({
        ...profile,
        total: Number(dayProfileMap.get(String(profile.profileId || ''))?.total || 0)
      }));
    if (salaryDayTitle) salaryDayTitle.textContent = `Used by ${currentUser?.name || currentUser?.username || 'User'}`;
    if (salaryDayTotal) salaryDayTotal.textContent = `${assignedProfiles.length} Profiles`;
    salaryDayProfiles.innerHTML = assignedProfiles.length ? assignedProfiles.map((profile, index) => {
      const label = profile.profileName || profile.profileId || 'Profile';
      const photo = String(profile.photoUrl || '').trim();
      const fallbackInitial = escapeHtml(String(label || '?').slice(0, 1).toUpperCase());
      return `
        <div class="salary-day-profile-row ${profile.active === false ? 'is-inactive' : 'is-active'}">
          <span class="salary-day-profile-index">${index + 1}</span>
          <span class="fixed-balance-profile-avatar">
            ${photo ? `<img src="${escapeAttr(photo)}" alt="">` : `<i>${fallbackInitial}</i>`}
          </span>
          <div>
            <strong>${escapeHtml(label)}</strong>
            <small>ID ${escapeHtml(profile.profileId || '')}</small>
          </div>
          <b>${money(profile.total)}</b>
        </div>
      `;
    }).join('') : '<div class="fixed-balance-empty">No assigned profiles for this day</div>';
    salaryDayProfiles.insertAdjacentHTML('afterbegin', `
      <div class="salary-day-meta">
        <span>${escapeHtml(formatSalaryPeriodValue(dateValue))}</span>
        <b>${money(day.total || 0)}</b>
      </div>
    `);
  }
  salaryCalendarGrid?.querySelectorAll('.salary-calendar-day').forEach(button => {
    button.classList.toggle('selected', button.dataset.date === dateValue);
  });
}

function renderSalaryCalendar() {
  if (!salaryCalendarGrid) return;
  const datesWithData = fixedBalanceDailyItems.map(item => item.date).filter(Boolean).sort();
  const datesWithProfiles = fixedBalanceProfileItems
    .flatMap(profile => [salaryPeriodDateKey(profile.periodFrom), salaryPeriodDateKey(profile.periodTo)])
    .filter(Boolean)
    .sort();
  if (!salaryCalendarMonth) setSalaryCalendarMonthFromDate(datesWithData.at(-1) || datesWithProfiles.at(-1) || myStatsTo?.value || todayDateInputValue());
  const [year, month] = salaryCalendarMonth.split('-').map(Number);
  if (!year || !month) return;
  if (salaryCalendarTitle) salaryCalendarTitle.textContent = monthLabelFromValue(salaryCalendarMonth);
  const first = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const leading = (first.getDay() + 6) % 7;
  const cells = [];
  ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach(label => {
    cells.push(`<div class="salary-calendar-weekday">${label}</div>`);
  });
  for (let i = 0; i < leading; i += 1) cells.push('<div class="salary-calendar-empty-cell"></div>');
  for (let day = 1; day <= daysInMonth; day += 1) {
    const iso = `${salaryCalendarMonth}-${String(day).padStart(2, '0')}`;
    const data = salaryDayData(iso);
    cells.push(`
      <button class="salary-calendar-day ${data.total ? 'has-balance' : ''} ${selectedSalaryDate === iso ? 'selected' : ''}" type="button" data-date="${iso}">
        <span>${day}</span>
        <b>${data.total ? money(data.total) : ''}</b>
      </button>
    `);
  }
  const trailing = Math.max(0, 42 - (leading + daysInMonth));
  for (let i = 0; i < trailing; i += 1) cells.push('<div class="salary-calendar-empty-cell"></div>');
  salaryCalendarGrid.innerHTML = cells.join('');
  const selectedInMonth = selectedSalaryDate && selectedSalaryDate.startsWith(salaryCalendarMonth);
  const today = todayDateInputValue();
  const profileDatesInMonth = datesWithProfiles.filter(date => date.startsWith(salaryCalendarMonth));
  const todayHasAssignedProfile = today.startsWith(salaryCalendarMonth) && fixedBalanceProfileItems.some(profile => {
    const from = salaryPeriodDateKey(profile.periodFrom);
    const to = salaryPeriodDateKey(profile.periodTo);
    return from && to && today >= from && today <= to;
  });
  const defaultDate = selectedInMonth
    ? selectedSalaryDate
    : (
      datesWithData.filter(date => date.startsWith(salaryCalendarMonth)).at(-1) ||
      (todayHasAssignedProfile ? today : '') ||
      profileDatesInMonth.at(-1) ||
      `${salaryCalendarMonth}-01`
    );
  renderSalaryDayPanel(defaultDate);
}

function renderFixedBalance(result = {}) {
  const rows = Array.isArray(result.rows) ? result.rows : [];
  const profileTotals = Array.isArray(result.totalsByProfile) ? result.totalsByProfile : [];
  fixedBalanceDailyItems = Array.isArray(result.dailyProfiles) ? result.dailyProfiles : [];
  fixedBalanceProfileItems = profileTotals;
  if (fixedBalanceTotal) fixedBalanceTotal.textContent = money(result.total || 0);
  if (fixedBalanceBaseLabel) fixedBalanceBaseLabel.textContent = `Balance - ${percentText(result.siteFeePercent || 0)}`;
  if (fixedBalanceBase) fixedBalanceBase.textContent = money(result.salaryBase || result.total || 0);
  if (fixedBalancePercent) fixedBalancePercent.textContent = percentText(result.salaryPercent || 0);
  if (fixedBalanceSalary) fixedBalanceSalary.textContent = money(result.salaryTotal || 0);
  if (fixedBalanceCount) fixedBalanceCount.textContent = String(result.count || rows.length || 0);
  const salarySubtitle = fixedBalanceCard?.querySelector('.fixed-balance-head p');
  if (salarySubtitle) salarySubtitle.textContent = `Salary period: ${formatSalaryPeriodValue(result.from || userRegistrationDateInputValue())} - ${formatSalaryPeriodValue(result.to || todayDateInputValue())}.`;
  renderFixedBalanceList(fixedBalanceProfiles, profileTotals, { kind: 'profile', labelKey: 'profileName', fallback: 'No profiles yet' });
  renderSalaryCalendar();
  if (fixedBalanceOperators) fixedBalanceOperators.innerHTML = '';
  if (fixedBalanceHistory) fixedBalanceHistory.innerHTML = '';
  if (fixedBalanceRows) fixedBalanceRows.innerHTML = '';
}

async function loadFixedBalance(options = {}) {
  setupMyStatsDefaults();
  if (!fixedBalanceCard || !['director', 'admin', 'operator'].includes(currentUser?.role)) return;
  fixedBalanceCard.classList.add('loading');
  if (fixedBalanceRefreshBtn) fixedBalanceRefreshBtn.disabled = true;
  try {
    if (options.month) {
      salaryCalendarMonth = String(options.month).slice(0, 7);
      selectedSalaryDate = '';
    } else if (!salaryCalendarMonth) {
      salaryCalendarMonth = todayDateInputValue().slice(0, 7);
    }
    const range = salaryMonthRange(salaryCalendarMonth);
    const params = new URLSearchParams({
      from: range.from,
      to: range.to
    });
    const response = await fetch(`/api/agency/ledger?${params.toString()}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not load fixed balance');
    renderFixedBalance(result);
  } catch (error) {
    if (fixedBalanceRows) fixedBalanceRows.innerHTML = `<div class="fixed-balance-empty fixed-balance-empty-large">${escapeHtml(error.message || 'Could not load fixed balance')}</div>`;
  } finally {
    fixedBalanceCard.classList.remove('loading');
    if (fixedBalanceRefreshBtn) fixedBalanceRefreshBtn.disabled = false;
  }
}

async function loadMyStats() {
  setupMyStatsDefaults();
  if (!['director', 'admin', 'operator'].includes(currentUser?.role)) {
    if (myStatsSummary) myStatsSummary.textContent = 'Access is required.';
    return;
  }
  const requestSeq = ++myStatsRequestSeq;
  if (myStatsLoadBtn) {
    myStatsLoadBtn.setAttribute('aria-busy', 'true');
  }
  myStatsTransactionsCard?.classList.add('loading');
  if (myStatsSummary) myStatsSummary.textContent = 'Loading Agency bonuses on server...';
  try {
    const params = new URLSearchParams({
      from: myStatsFrom?.value || monthStartDateInputValue(),
      to: myStatsTo?.value || todayDateInputValue()
    });
    if (activeProfileId) params.set('profileId', activeProfileId);
    const response = await fetch(`/api/agency/bonuses?${params.toString()}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not load stats');
    if (requestSeq !== myStatsRequestSeq) return;
    renderMyStats(result);
    if (statsBalanceMode === 'fixed') loadFixedBalance();
  } catch (error) {
    if (requestSeq !== myStatsRequestSeq) return;
    if (myStatsSummary) myStatsSummary.textContent = error.message;
    if (myStatsBody) myStatsBody.innerHTML = '';
  } finally {
    if (requestSeq === myStatsRequestSeq) {
      myStatsTransactionsCard?.classList.remove('loading');
      if (myStatsLoadBtn) {
        myStatsLoadBtn.disabled = false;
        myStatsLoadBtn.removeAttribute('aria-busy');
      }
    }
  }
}

async function switchView(view) {
  document.body.classList.remove('profile-choice-auth');
  syncRoleNavigation();
  const ownerMode = currentUser?.role === 'director';
  const requestedView = ['chat', 'workspace', 'stats', 'adminPanel', 'settings'].includes(view) ? view : 'favorites';
  const allowedView = ownerMode
    ? (requestedView === 'adminPanel' ? 'adminPanel' : 'settings')
    : (requestedView === 'adminPanel' && !hasAdminPanelAccess() ? 'stats' : requestedView);
  currentView = ownerMode ? allowedView : (ladyConnected || ['stats', 'adminPanel'].includes(allowedView) ? allowedView : 'workspace');
  localStorage.setItem('dream_crm_view', currentView);
  syncAdminPanelRoute(currentView === 'adminPanel');
  const chatActive = currentView === 'chat';
  const workspaceActive = currentView === 'workspace';
  const favoritesActive = currentView === 'favorites';
  const statsActive = currentView === 'stats';
  const adminPanelActive = currentView === 'adminPanel';
  document.body.classList.toggle('chat-view-active', chatActive);
  document.body.classList.toggle('workspace-view-active', workspaceActive);
  document.body.classList.toggle('stats-view-active', statsActive);
  document.body.classList.toggle('admin-panel-view-active', adminPanelActive);
  if (adminPanelActive) syncAdminPanelViewportWidth();
  favoritesView.classList.toggle('hidden', !favoritesActive);
  chatFavoritesView.classList.toggle('hidden', !chatActive);
  workspaceView?.classList.toggle('hidden', !workspaceActive);
  myStatsView?.classList.toggle('hidden', !statsActive);
  adminPanelView?.classList.toggle('hidden', !adminPanelActive);
  favoritesView.classList.toggle('view-active', favoritesActive);
  favoritesView.classList.toggle('view-hidden', !favoritesActive);
  chatFavoritesView.classList.toggle('view-active', chatActive);
  chatFavoritesView.classList.toggle('view-hidden', !chatActive);
  workspaceView?.classList.toggle('view-active', workspaceActive);
  workspaceView?.classList.toggle('view-hidden', !workspaceActive);
  myStatsView?.classList.toggle('view-active', statsActive);
  myStatsView?.classList.toggle('view-hidden', !statsActive);
  adminPanelView?.classList.toggle('view-active', adminPanelActive);
  adminPanelView?.classList.toggle('view-hidden', !adminPanelActive);
  favoritesView.style.display = favoritesActive ? 'flex' : 'none';
  chatFavoritesView.style.display = chatActive ? 'flex' : 'none';
  if (workspaceView) workspaceView.style.display = workspaceActive ? 'flex' : 'none';
  if (myStatsView) myStatsView.style.display = statsActive ? 'flex' : 'none';
  if (adminPanelView) adminPanelView.style.display = adminPanelActive ? 'flex' : 'none';
  favoritesNavBtn.classList.toggle('active', favoritesActive);
  chatFavoritesNavBtn.classList.toggle('active', chatActive);
  workspaceNavLink?.classList.toggle('active', currentView === 'workspace');
  myStatsNavBtn?.classList.toggle('active', statsActive);
  adminPanelNavBtn?.classList.toggle('active', adminPanelActive);
  statsModeTabs?.classList.toggle('hidden', !statsActive || !['director', 'admin', 'operator'].includes(currentUser?.role));
  updateCounter();
  if (statsActive) {
    setupMyStatsDefaults();
    setStatsBalanceMode(statsBalanceMode);
  }
  if (adminPanelActive) {
    setupMyStatsDefaults();
    await loadAdminPanelBalances();
  }
  if (chatActive && ladyConnected) await loadChatFavorites();
  else if (favoritesActive) render();
}

async function togglePinned(id, button) {
  id = String(id);
  const man = allMen.find(item => String(item.id) === id);
  if (!man) return;

  const pinned = man.pinned !== true;
  button.disabled = true;
  try {
    const response = await apiFetch(`/api/men/${encodeURIComponent(id)}/pinned`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned })
    });
    if (!response.ok) throw new Error('Pin save error');
    man.pinned = pinned;
    render();
  } catch (error) {
    button.disabled = false;
    alert(error.message || 'Could not save pin');
  }
}

function bindEvents() {
  document.getElementById('copyImportantMenBtn')?.addEventListener('click', copyImportantMen);
  document.getElementById('copyPinnedMenBtn')?.addEventListener('click', copyPinnedMen);
  document.getElementById('copyAllMenBtn')?.addEventListener('click', copyAllMen);

  document.querySelectorAll('.profile-open-btn').forEach(btn => {
    btn.addEventListener('click', () => openProfileModal(btn.dataset.id));
  });

  document.querySelectorAll('.presence-check-btn').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      checkSingleManPresence(button.dataset.id, button);
    });
  });

  document.querySelectorAll('.pin-btn').forEach(btn => {
    btn.addEventListener('click', () => togglePinned(btn.dataset.id, btn));
  });

  document.querySelectorAll('.site-favorite-btn').forEach(btn => {
    btn.addEventListener('click', () => addToDreamFavorites(btn.dataset.id, btn));
  });

  document.querySelectorAll('.ignore-site-btn').forEach(btn => {
    btn.addEventListener('click', () => addToDreamIgnore(btn.dataset.id, btn));
  });

  document.querySelectorAll('.man-delete-btn').forEach(button => button.addEventListener('click', async () => {
    const man = allMen.find(item => String(item.id) === button.dataset.id);
    if (!man || !confirm(`Delete ${man.name || `man ${man.id}`} from Favorites?`)) return;
    const response = await apiFetch(`/api/men/${encodeURIComponent(man.id)}`, { method: 'DELETE' });
    if (!response.ok) return alert('Could not delete the man');
    allMen = allMen.filter(item => String(item.id) !== String(man.id));
    updateCounter();
    render();
  }));

  document.querySelectorAll('.copy-id-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const original = btn.textContent;
      try {
        await navigator.clipboard.writeText(btn.dataset.id);
        btn.textContent = 'Copied';
      } catch {
        btn.textContent = 'Copy failed';
      }
      setTimeout(() => { btn.textContent = original; }, 900);
    });
  });

  document.querySelectorAll('.type-select-shell').forEach(shell => {
    shell.addEventListener('click', event => {
      event.stopPropagation();
      document.querySelectorAll('.type-select-shell.open').forEach(openShell => {
        if (openShell !== shell) openShell.classList.remove('open');
      });
      shell.classList.toggle('open');
    });

    shell.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        shell.click();
      }
      if (event.key === 'Escape') shell.classList.remove('open');
    });
  });

  document.querySelectorAll('.type-select-option').forEach(option => {
    option.addEventListener('click', async event => {
      event.stopPropagation();
      const shell = option.closest('.type-select-shell');
      if (!shell) return;
      await saveTypeStatus(shell, option.dataset.value);
    });
  });

  document.removeEventListener('click', closeOpenTypeMenus);
  document.addEventListener('click', closeOpenTypeMenus);

  document.querySelectorAll('.type-select:not(.chat-type-select)').forEach(el => {
    paintStatus(el);

    el.addEventListener('change', async () => {
      const id = el.dataset.id;
      const status = el.value === '-' ? '' : el.value;

      const res = await apiFetch(`/api/men/${encodeURIComponent(id)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });

      if (!res.ok) {
        alert('Status save error');
        return;
      }

      const man = allMen.find(x => String(x.id) === String(id));
      if (man) man.status = status;

      paintStatus(el);
      render();
    });
  });

  document.querySelectorAll('.note:not(.chat-note)').forEach(el => {
    el.scrollTop = 0;
    el.scrollLeft = 0;

    el.addEventListener('focus', () => {
      el.scrollTop = 0;
      el.scrollLeft = 0;
      if (el.selectionStart === el.value.length) el.setSelectionRange(0, 0);
    });

    el.addEventListener('input', () => {
      const state = document.querySelector(`[data-note-state="${cssEscape(el.dataset.id)}"]`);
      if (state) state.textContent = 'Unsaved';
    });

    el.addEventListener('change', async () => {
      await saveNote(el.dataset.id, el.value);
    });
  });

  document.querySelectorAll('.note-view-btn:not(.chat-note-view-btn)').forEach(btn => {
    btn.addEventListener('click', () => {
      openNoteModal(btn.dataset.id);
    });
  });
}

function openNoteModal(id, source = 'men') {
  if (!noteModal) return;
  const list = source === 'chat' ? chatFavoriteMen : allMen;
  const man = list.find(x => String(x.id) === String(id));
  const rowNote = document.querySelector(`.note[data-id="${cssEscape(id)}"], .chat-note[data-id="${cssEscape(id)}"]`);
  const row = rowNote?.closest('tr');
  const rowName = row?.querySelector('.person-name')?.textContent?.trim() || '';

  activeNoteId = id;
  activeNoteSource = source;
  noteModalName.textContent = `${man?.name || rowName || 'No name'} - ID ${man?.id || id || ''}`;
  noteModalText.value = man?.note ?? rowNote?.value ?? '';
  noteModal.classList.remove('hidden');

  setTimeout(() => noteModalText.focus(), 50);
}

function closeNoteModal() {
  activeNoteId = null;
  activeNoteSource = 'men';
  noteModal.classList.add('hidden');
  noteModalText.value = '';
  noteModalName.textContent = '';
}

function closeOpenTypeMenus() {
  document.querySelectorAll('.type-select-shell.open').forEach(shell => shell.classList.remove('open'));
  document.querySelector('.floating-type-menu')?.remove();
  activeFloatingTypeShell = null;
}

function openFloatingTypeMenu(shell) {
  const existing = document.querySelector('.floating-type-menu');
  if (existing && activeFloatingTypeShell === shell) {
    closeOpenTypeMenus();
    return;
  }
  closeOpenTypeMenus();
  activeFloatingTypeShell = shell;
  shell.classList.add('open');

  const rect = shell.getBoundingClientRect();
  const menu = document.createElement('div');
  menu.className = 'floating-type-menu';
  menu.style.left = `${Math.round(rect.left + rect.width / 2 - 41)}px`;
  menu.style.top = `${Math.round(rect.bottom + 4)}px`;
  menu.addEventListener('click', event => event.stopPropagation());

  STATUSES.forEach(status => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `type-select-option ${shell.dataset.value === status ? 'active' : ''}`;
    button.dataset.value = status;
    button.textContent = typeLabel(status);
    button.addEventListener('click', async event => {
      event.stopPropagation();
      await saveTypeStatus(shell, status);
      closeOpenTypeMenus();
    });
    menu.appendChild(button);
  });

  document.body.appendChild(menu);
}

async function saveTypeStatus(shell, value) {
  const id = shell.dataset.id;
  const status = value === '-' ? '' : value;
  const source = shell.dataset.source === 'chat' ? 'chat' : 'men';
  const endpoint = source === 'chat'
    ? `/api/other-men/${encodeURIComponent(id)}/status`
    : `/api/men/${encodeURIComponent(id)}/status`;

  const res = await apiFetch(endpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  });

  if (!res.ok) {
    alert('Status save error');
    return;
  }

  const man = source === 'chat'
    ? chatFavoriteMen.find(x => String(x.id) === String(id))
    : allMen.find(x => String(x.id) === String(id));
  if (man) man.status = status;

  shell.dataset.value = value;
  shell.className = `type-select-shell ${statusClass(value)}`;
  const label = shell.querySelector('.type-select-label');
  if (label) label.textContent = typeLabel(value);
  shell.querySelectorAll('.type-select-option').forEach(option => {
    const active = option.dataset.value === value;
    option.classList.toggle('active', active);
    option.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  shell.classList.remove('open');
  if (source === 'chat') renderChatFavorites();
  else render();
}

async function saveActiveNote() {
  if (!activeNoteId) return;

  const text = noteModalText.value;
  if (activeNoteSource === 'chat') await saveChatNote(activeNoteId, text);
  else await saveNote(activeNoteId, text);

  const tableNote = document.querySelector(`.note[data-id="${cssEscape(activeNoteId)}"]`);
  if (tableNote) tableNote.value = text;

  closeNoteModal();
}

async function saveChatNote(id, note) {
  const response = await apiFetch(`/api/other-men/${encodeURIComponent(id)}/note`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note })
  });
  if (!response.ok) {
    alert('Could not save the note');
    return;
  }
  const man = chatFavoriteMen.find(item => String(item.id) === String(id));
  if (man) man.note = note;
}

async function saveNote(id, note) {
  const state = document.querySelector(`[data-note-state="${cssEscape(id)}"]`);
  if (state) state.textContent = 'Saving...';

  const res = await apiFetch(`/api/men/${encodeURIComponent(id)}/note`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note })
  });

  if (!res.ok) {
    if (state) state.textContent = 'Error';
    alert('Could not save the note');
    return;
  }

  const man = allMen.find(x => String(x.id) === String(id));
  if (man) man.note = note;
  const noteField = document.querySelector(`.note[data-id="${cssEscape(id)}"]`);
  if (noteField) {
    noteField.scrollTop = 0;
    noteField.scrollLeft = 0;
    noteField.setSelectionRange(0, 0);
  }
  if (state) {
    state.textContent = 'Saved';
    setTimeout(() => {
      if (state.isConnected) state.textContent = '';
    }, 1400);
  }
}

function statusClass(value) {
  if (value === 'SERIOUS') return 'type-serious';
  if (value === 'SEXTER') return 'type-sexter';
  if (value === 'OTHER') return 'type-other';
  return 'type-empty';
}

function paintStatus(select) {
  const chatClass = select.classList.contains('chat-type-select') ? ' chat-type-select' : '';
  select.className = `type-select${chatClass} ${statusClass(select.value)}`;
  const shell = select.closest('.type-select-shell');
  if (shell) {
    shell.className = `type-select-shell ${statusClass(select.value)}`;
    const label = shell.querySelector('.type-select-label');
    if (label) label.textContent = typeLabel(select.value);
  }
}

function openSyncConfirm(mode) {
  if (!syncConfirmModal || !confirmSyncBtn || !cancelSyncConfirmBtn) {
    return Promise.resolve(window.confirm(`Do you really want to start ${mode === 'full' ? 'full scan' : 'update'}?`));
  }
  const isFull = mode === 'full';
  if (syncConfirmTitle) syncConfirmTitle.textContent = isFull ? 'Start full scan?' : 'Start update?';
  if (syncConfirmText) {
    syncConfirmText.textContent = isFull
      ? 'Are you sure you want to start full scan?'
      : 'Are you sure you want to start update?';
  }
  syncConfirmModal.classList.remove('hidden');

  return new Promise(resolve => {
    const close = value => {
      syncConfirmModal.classList.add('hidden');
      confirmSyncBtn.removeEventListener('click', onYes);
      cancelSyncConfirmBtn.removeEventListener('click', onNo);
      syncConfirmModal.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };
    const onYes = () => close(true);
    const onNo = () => close(false);
    const onBackdrop = event => {
      if (event.target.classList.contains('confirm-mini-backdrop')) close(false);
    };
    const onKey = event => {
      if (event.key === 'Escape') close(false);
      if (event.key === 'Enter') close(true);
    };
    confirmSyncBtn.addEventListener('click', onYes);
    cancelSyncConfirmBtn.addEventListener('click', onNo);
    syncConfirmModal.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey);
    setTimeout(() => confirmSyncBtn.focus(), 50);
  });
}

async function startSync(mode) {
  try {
    activeSyncMode = mode === 'full' ? 'full' : 'daily';
    showPendingSyncButton(activeSyncMode);
    const activeButton = activeSyncMode === 'full' ? agencyFavoritesScanAllBtn : agencyFavoritesUpdateTodayBtn;
    activeButton?.setAttribute('title', activeSyncMode === 'full'
      ? 'Scan All: waiting for confirmation'
      : 'Update Today: waiting for confirmation');

    if (!await openSyncConfirm(mode)) {
      activeSyncMode = '';
      showPendingSyncButton('');
      showExtensionStatus({ ready: true, message: 'Server sync cancelled' });
      return;
    }

    activeButton?.setAttribute('title', activeSyncMode === 'full'
      ? 'Scan All: opening Dream inbox and scanning pages'
      : 'Update Today: opening Dream inbox and scanning 3 pages');
    showExtensionStatus({ phase: 'server-sync', ready: true, message: 'Server is reading Dream Singles inbox...' });
    const result = await serverProfileRequest('server-sync-inbox', {
      body: {
        maxPages: mode === 'full'
          ? Number(pageLimit?.value || 10)
          : Math.min(3, Number(pageLimit?.value || 3) || 3)
      }
    });
    activeButton?.setAttribute('title', 'Loading saved men list into AgencyOS');
    await loadMen(false);
    if (currentView === 'chat') await loadChatFavorites();
    showExtensionStatus({
      phase: 'server-done',
      ready: true,
      message: result.imported
        ? `Server sync done: ${result.imported} inbox letters`
        : 'Server sync done'
    });
  } catch (error) {
    showExtensionStatus({ phase: 'server-error', ready: false, message: error.message });
  } finally {
    activeSyncMode = '';
    showPendingSyncButton('');
  }
}

async function stopSync() {
  try {
    const response = await extensionCommand('STOP_EXPORT');
    activeSyncMode = '';
    showPendingSyncButton('');
    showExtensionStatus(response.status);
  } catch (error) {
    activeSyncMode = '';
    showPendingSyncButton('');
    showExtensionStatus({ ready: false, message: error.message });
  }
}

async function checkOnlineAll(storageKey = '') {
  if (!activeProfileId || !allMen.length || onlineRefreshInProgress) return;
  onlineRefreshInProgress = true;
  try {
    await extensionCommand('CHECK_ONLINE_ALL', {
      profileId: activeProfileId,
      men: allMen.map(man => ({
        id: man.id,
        profileUrl: man.profileLink,
        favorite: man.favorite === true
      }))
    }, 180000);
    await loadMen(false);
  } catch (error) {
    if (storageKey) localStorage.removeItem(storageKey);
    console.warn('Silent online refresh failed:', error);
  } finally {
    onlineRefreshInProgress = false;
  }
}

async function checkOnlineSnapshot(options = {}) {
  const checkOptions = normalizeLoadOptions(options);
  if (!activeProfileId || !allMen.length || onlineRefreshInProgress) return;
  onlineRefreshInProgress = true;
  const originalLabel = checkOnlineBtn?.textContent || 'Update Online';
  let dotsTimer = null;
  if (checkOnlineBtn && !checkOptions.silent) {
    checkOnlineBtn.disabled = true;
    let dots = 0;
    const drawProgress = () => {
      dots = (dots % 3) + 1;
      checkOnlineBtn.textContent = `Update Online${'.'.repeat(dots)}`;
    };
    drawProgress();
    dotsTimer = setInterval(drawProgress, 350);
  }
  try {
    const response = await extensionCommand('CHECK_ONLINE_SNAPSHOT', {
      profileId: activeProfileId,
      men: allMen.map(man => ({ id: man.id })),
      allowCreateTab: false,
      url: 'https://www.dream-singles.com/members/connections/myFavorites?all=1&folder=-1'
    }, 60000);

    const statusById = new Map((response.statuses || []).map(status => [String(status.id), status]));
    allMen = allMen.map(man => {
      const status = statusById.get(String(man.id));
      if (!status) return man;
      return {
        ...man,
        onlineNow: status.onlineNow === true,
        lastActivityText: status.lastActivityText || (man.lastActivityText === 'Online now' ? '' : man.lastActivityText)
      };
    });
    render();
    await loadMen({ skipAutoOnline: true });
  } catch (error) {
    console.warn('Online snapshot failed:', error);
  } finally {
    onlineRefreshInProgress = false;
    if (dotsTimer) clearInterval(dotsTimer);
    if (checkOnlineBtn && !checkOptions.silent) {
      checkOnlineBtn.disabled = false;
      checkOnlineBtn.textContent = originalLabel;
    }
  }
}

function renderProfile(man) {
  const details = man.profileDetails || {};
  const fields = [
    ['Age', details.age || man.age],
    ['Birth Date', details.birthDate],
    ['Zodiac', details.zodiac],
    ['Height', details.height],
    ['Occupation', details.occupation],
    ['Weight', details.weight],
    ['Education', details.education],
    ['Hair', details.hair],
    ['Religion', details.religion],
    ['Eyes', details.eyes],
    ['Relationship Status', details.relationshipStatus]
  ];
  const overview = [
    ['City', details.city],
    ['Country', details.country],
    ['Number of Kids', details.numberOfKids],
    ['Smoker', details.smoker]
  ];
  const name = man.name || 'No name';

  profileModalTitle.textContent = `${name}, ID: ${man.id}`;
  profileUpdatedAt.textContent = man.profileUpdatedAt
    ? `Updated: ${new Date(man.profileUpdatedAt).toLocaleString('en-US')}`
    : 'Profile data has not been loaded yet';

  profileContent.innerHTML = `
    <div class="profile-hero">
      ${man.photoUrl
        ? `<img src="${escapeAttr(man.photoUrl)}" alt="${escapeAttr(name)}">`
        : `<div class="profile-photo-placeholder">${escapeHtml(name[0] || '?')}</div>`}
      <div class="profile-grid">
        ${fields.map(([label, value]) => `
          <div class="profile-field">
            <div class="profile-field-label">${escapeHtml(label)}</div>
            <div class="profile-field-value">${escapeHtml(value || '-')}</div>
          </div>
        `).join('')}
      </div>
    </div>
    <div class="profile-overview">
      ${overview.map(([label, value]) => `
        <div class="profile-field">
          <div class="profile-field-label">${escapeHtml(label)}</div>
          <div class="profile-field-value">${escapeHtml(value || '-')}</div>
        </div>
      `).join('')}
    </div>
    <div class="profile-about">
      <h3>About Me</h3>
      <div class="profile-about-text">${escapeHtml(details.aboutMe || '-')}</div>
    </div>
  `;
}

async function openProfileModal(id) {
  const man = allMen.find(item => String(item.id) === String(id));
  if (!man) return;

  profileModal.classList.remove('hidden');
  profileError.classList.add('hidden');
  profileLoading.classList.remove('hidden');
  renderProfile(man);

  try {
    const response = await extensionCommand('FETCH_PROFILE', {
      manId: man.id,
      profileId: activeProfileId,
      profileUrl: man.profileLink
    }, 45000);
    Object.assign(man, response.man || {});
    renderProfile(man);
  } catch (error) {
    profileError.textContent = `Could not update profile: ${error.message}. Showing the last saved data.`;
    profileError.classList.remove('hidden');
  } finally {
    profileLoading.classList.add('hidden');
  }
}

function closeProfileModal() {
  profileModal.classList.add('hidden');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
  }[ch]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

function cssEscape(value) {
  if (window.CSS && CSS.escape) return CSS.escape(String(value));
  return String(value).replace(/"/g, '\\"');
}

const ADMIN_PANEL_PALETTE_ACTIONS = [
  { label: 'выходной', color: '#4285f4', className: 'is-day-off' },
  { label: 'пропуск', color: '#f28b82', className: 'is-absence' },
  { label: 'отпуск', color: '#f29900', className: 'is-vacation' }
];
const ADMIN_PANEL_TRAINING_MARKER = 'обуч';

function ensureAdminPanelColorPalette() {
  if (adminPanelColorPalette) return adminPanelColorPalette;
  const palette = document.createElement('div');
  palette.className = 'admin-color-palette hidden';
  palette.innerHTML = `
    <div class="admin-color-palette-title">Mark cell</div>
    <div class="admin-color-action-list">
      ${ADMIN_PANEL_PALETTE_ACTIONS.map(action => `
        <button class="admin-color-action ${escapeAttr(action.className)}" type="button" data-color="${escapeAttr(action.color)}">
          <span style="background:${escapeAttr(action.color)}"></span>${escapeHtml(action.label)}
        </button>
      `).join('')}
    </div>
    <button class="admin-training-marker" type="button" data-color="${escapeAttr(ADMIN_PANEL_TRAINING_MARKER)}">обуч</button>
    <button class="admin-comment-button" type="button" data-comment-action="open">Добавить комментарий</button>
    <button class="admin-color-clear" type="button" data-color="">Отменить действие</button>
  `;
  document.body.appendChild(palette);
  palette.addEventListener('click', event => {
    const commentButton = event.target.closest?.('[data-comment-action="open"]');
    if (commentButton) {
      event.preventDefault();
      openAdminPanelCommentEditor(adminPanelColorTarget);
      return;
    }
    const button = event.target.closest?.('[data-color]');
    if (!button) return;
    saveAdminPanelCellColor(button.dataset.color || '').catch(error => {
      if (adminPanelStatus) adminPanelStatus.textContent = error.message || 'Could not save color';
    });
  });
  adminPanelColorPalette = palette;
  return palette;
}

function closeAdminPanelColorPalette() {
  adminPanelColorTarget = null;
  adminPanelColorPalette?.classList.add('hidden');
}

function openAdminPanelColorPalette(target) {
  if (!target?.dataset?.colorKey) return;
  adminPanelColorTarget = {
    key: target.dataset.colorKey,
    scope: target.dataset.colorScope || 'cell',
    day: target.dataset.colorDay || '',
    element: target
  };
  const palette = ensureAdminPanelColorPalette();
  const markAllowed = target.dataset.markAllowed === '1';
  palette.classList.toggle('marks-disabled', !markAllowed);
  palette.querySelectorAll('[data-color]').forEach(button => {
    button.disabled = !markAllowed;
  });
  const rect = target.getBoundingClientRect();
  palette.classList.remove('hidden');
  const paletteRect = palette.getBoundingClientRect();
  const left = Math.min(window.innerWidth - paletteRect.width - 12, Math.max(12, rect.left));
  const top = Math.min(window.innerHeight - paletteRect.height - 12, Math.max(12, rect.bottom + 8));
  palette.style.left = `${left}px`;
  palette.style.top = `${top}px`;
}

function ensureAdminPanelCommentEditor() {
  if (adminPanelCommentEditor) return adminPanelCommentEditor;
  const editor = document.createElement('div');
  editor.className = 'admin-comment-editor hidden';
  editor.innerHTML = `
    <div class="admin-comment-editor-title">Comment</div>
    <textarea class="admin-comment-editor-text" placeholder="Add comment..."></textarea>
    <div class="admin-comment-editor-actions">
      <button class="admin-comment-delete" type="button">Delete</button>
      <span></span>
      <button class="admin-comment-cancel" type="button">Cancel</button>
      <button class="admin-comment-save" type="button">Save</button>
    </div>
  `;
  document.body.appendChild(editor);
  editor.querySelector('.admin-comment-cancel')?.addEventListener('click', closeAdminPanelCommentEditor);
  editor.querySelector('.admin-comment-delete')?.addEventListener('click', () => saveAdminPanelCellComment('').catch(error => {
    if (adminPanelStatus) adminPanelStatus.textContent = error.message || 'Could not save comment';
  }));
  editor.querySelector('.admin-comment-save')?.addEventListener('click', () => {
    const text = editor.querySelector('.admin-comment-editor-text')?.value || '';
    saveAdminPanelCellComment(text).catch(error => {
      if (adminPanelStatus) adminPanelStatus.textContent = error.message || 'Could not save comment';
    });
  });
  adminPanelCommentEditor = editor;
  return editor;
}

function closeAdminPanelCommentEditor() {
  adminPanelCommentTarget = null;
  adminPanelCommentEditor?.classList.add('hidden');
}

function openAdminPanelCommentEditor(targetInfo) {
  if (!targetInfo?.key) return;
  adminPanelCommentTarget = { ...targetInfo };
  const editor = ensureAdminPanelCommentEditor();
  const textarea = editor.querySelector('.admin-comment-editor-text');
  if (textarea) textarea.value = adminPanelCellComments[targetInfo.key] || '';
  const rect = targetInfo.element?.getBoundingClientRect?.() || adminPanelColorPalette?.getBoundingClientRect?.() || { left: 12, bottom: 12 };
  editor.classList.remove('hidden');
  const editorRect = editor.getBoundingClientRect();
  const left = Math.min(window.innerWidth - editorRect.width - 12, Math.max(12, rect.left));
  const top = Math.min(window.innerHeight - editorRect.height - 12, Math.max(12, rect.bottom + 8));
  editor.style.left = `${left}px`;
  editor.style.top = `${top}px`;
  closeAdminPanelColorPalette();
  textarea?.focus();
}

function applyAdminPanelCommentLocally(targetInfo, comment) {
  if (!targetInfo?.key) return;
  const value = String(comment || '').trim();
  if (value) adminPanelCellComments[targetInfo.key] = value;
  else delete adminPanelCellComments[targetInfo.key];
  const selector = targetInfo.scope === 'column'
    ? `[data-color-day="${cssEscape(targetInfo.day)}"]`
    : `[data-color-key="${cssEscape(targetInfo.key)}"]`;
  adminPanelOperators?.querySelectorAll(selector).forEach(element => {
    const key = element.dataset.colorKey || '';
    const elementComment = adminPanelCellComments[key] || '';
    if (elementComment) {
      element.dataset.comment = elementComment;
      element.setAttribute('aria-label', elementComment);
      element.classList.add('has-admin-comment');
      element.style.setProperty('position', 'relative', 'important');
      element.style.setProperty('overflow', 'visible', 'important');
      if (!element.querySelector(':scope > .admin-comment-corner')) {
        const corner = document.createElement('span');
        corner.className = 'admin-comment-corner';
        corner.setAttribute('aria-hidden', 'true');
        element.appendChild(corner);
      }
    } else {
      delete element.dataset.comment;
      element.removeAttribute('aria-label');
      element.classList.remove('has-admin-comment');
      element.querySelector(':scope > .admin-comment-corner')?.remove();
    }
  });
}

function restoreAdminPanelCommentMarkers() {
  if (!adminPanelOperators) return;
  adminPanelOperators.querySelectorAll('.admin-matrix-color-target').forEach(element => {
    const key = element.dataset.colorKey || '';
    const columnKey = element.dataset.colorDay ? `col|${element.dataset.colorDay}` : '';
    const comment = String(adminPanelCellComments[key] || adminPanelCellComments[columnKey] || '').trim();
    if (comment) {
      element.dataset.comment = comment;
      element.setAttribute('aria-label', comment);
      element.classList.add('has-admin-comment');
      element.style.setProperty('position', 'relative', 'important');
      element.style.setProperty('overflow', 'visible', 'important');
      if (!element.querySelector(':scope > .admin-comment-corner')) {
        const corner = document.createElement('span');
        corner.className = 'admin-comment-corner';
        corner.setAttribute('aria-hidden', 'true');
        element.appendChild(corner);
      }
    } else {
      delete element.dataset.comment;
      element.removeAttribute('aria-label');
      element.classList.remove('has-admin-comment');
      element.querySelector(':scope > .admin-comment-corner')?.remove();
    }
  });
}

async function saveAdminPanelCellComment(comment) {
  if (['director', 'mentor'].includes(currentUser?.role)) return;
  if (!adminPanelCommentTarget?.key) return;
  const targetInfo = { ...adminPanelCommentTarget };
  const value = String(comment || '').trim();
  applyAdminPanelCommentLocally(targetInfo, value);
  closeAdminPanelCommentEditor();
  const response = await fetch('/api/admin/operator-balances/cell-comment', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ month: adminPanelSelectedMonth, key: targetInfo.key, comment: value })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not save comment');
  adminPanelCellComments = result.cellComments && typeof result.cellComments === 'object' ? { ...result.cellComments } : adminPanelCellComments;
}

function ensureAdminPanelCommentTooltip() {
  if (adminPanelCommentTooltip) return adminPanelCommentTooltip;
  const tooltip = document.createElement('div');
  tooltip.className = 'admin-comment-tooltip hidden';
  document.body.appendChild(tooltip);
  adminPanelCommentTooltip = tooltip;
  return tooltip;
}

function hideAdminPanelCommentTooltip() {
  adminPanelCommentTooltip?.classList.add('hidden');
}

function showAdminPanelCommentTooltip(element, event) {
  const comment = String(element?.dataset?.comment || '').trim();
  if (!comment) return hideAdminPanelCommentTooltip();
  const tooltip = ensureAdminPanelCommentTooltip();
  tooltip.textContent = comment;
  tooltip.classList.remove('hidden');
  const tooltipRect = tooltip.getBoundingClientRect();
  const anchorRect = element.getBoundingClientRect();
  const preferredLeft = (event?.clientX || anchorRect.right) + 14;
  const preferredTop = (event?.clientY || anchorRect.top) + 14;
  const left = Math.min(window.innerWidth - tooltipRect.width - 12, Math.max(12, preferredLeft));
  const top = Math.min(window.innerHeight - tooltipRect.height - 12, Math.max(12, preferredTop));
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function applyAdminPanelColorLocally(targetInfo, color) {
  if (!targetInfo?.key) return;
  if (color) adminPanelCellColors[targetInfo.key] = color;
  else delete adminPanelCellColors[targetInfo.key];
  const restoreCellText = element => {
    if (!element.classList.contains('admin-matrix-day-cell')) return;
    const baseText = element.dataset.baseText || '';
    element.textContent = baseText || '\u00a0';
  };
  const selector = targetInfo.scope === 'column'
    ? `[data-color-day="${cssEscape(targetInfo.day)}"]`
    : `[data-color-key="${cssEscape(targetInfo.key)}"]`;
  adminPanelOperators?.querySelectorAll(selector).forEach(element => {
    if (color === ADMIN_PANEL_TRAINING_MARKER) {
      element.style.setProperty('background', '#ffffff', 'important');
      if (element.classList.contains('admin-matrix-day-cell')) element.textContent = ADMIN_PANEL_TRAINING_MARKER;
    } else {
      if (color) element.style.setProperty('background', color, 'important');
      else element.style.removeProperty('background');
      restoreCellText(element);
    }
  });
  if (targetInfo.scope === 'column') {
    adminPanelOperators?.querySelectorAll(`.admin-matrix-days-body-table [data-color-day="${cssEscape(targetInfo.day)}"]`).forEach(element => {
      const ownValue = adminPanelCellColors[element.dataset.colorKey || ''];
      if ((ownValue || color) === ADMIN_PANEL_TRAINING_MARKER) {
        element.style.setProperty('background', '#ffffff', 'important');
        element.textContent = ADMIN_PANEL_TRAINING_MARKER;
      } else {
        element.style.setProperty('background', ownValue || color || '#ffffff', 'important');
        restoreCellText(element);
      }
    });
  }
}

async function saveAdminPanelCellColor(color) {
  if (['director', 'mentor'].includes(currentUser?.role)) return;
  if (!adminPanelColorTarget?.key) return;
  if (adminPanelColorTarget.element?.dataset?.markAllowed !== '1') {
    if (adminPanelStatus) adminPanelStatus.textContent = 'Marks can be used only on balance cells.';
    closeAdminPanelColorPalette();
    return;
  }
  color = String(color || '').trim().toLowerCase();
  color = color === '#ffffff' ? '' : color;
  const targetInfo = { ...adminPanelColorTarget };
  applyAdminPanelColorLocally(targetInfo, color);
  closeAdminPanelColorPalette();
  const response = await fetch('/api/admin/operator-balances/cell-color', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ month: adminPanelSelectedMonth, key: targetInfo.key, color })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not save color');
  adminPanelCellColors = result.cellColors && typeof result.cellColors === 'object' ? { ...result.cellColors } : adminPanelCellColors;
}

async function saveAdminOperatorSource(operatorId, source, button) {
  if (['director', 'mentor'].includes(currentUser?.role)) return;
  if (!operatorId) return;
  const oldText = button?.textContent || 'Save';
  if (button) {
    button.disabled = true;
    button.textContent = '...';
  }
  try {
    const response = await fetch('/api/admin/operator-balances/source', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operatorId, source })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not save source');
    if (button) button.textContent = 'OK';
    setTimeout(() => {
      if (button) button.textContent = oldText;
    }, 900);
  } catch (error) {
    if (adminPanelStatus) adminPanelStatus.textContent = error.message || 'Could not save source';
    if (button) button.textContent = oldText;
  } finally {
    if (button) button.disabled = false;
  }
}

function adminPanelTargetFromElement(element) {
  if (!element?.dataset?.colorKey) return null;
  return {
    key: element.dataset.colorKey,
    scope: element.dataset.colorScope || 'cell',
    day: element.dataset.colorDay || '',
    element
  };
}


function handleNoteViewButtonEvent(event) {
  const noteButton = event.target.closest?.('.note-view-btn');
  if (!noteButton || !noteButton.isConnected) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  openNoteModal(noteButton.dataset.id, noteButton.classList.contains('chat-note-view-btn') ? 'chat' : 'men');
}

document.addEventListener('pointerdown', handleNoteViewButtonEvent, true);
document.addEventListener('click', handleNoteViewButtonEvent, true);
if (noteModalClose) noteModalClose.addEventListener('click', closeNoteModal);
if (noteModalCancel) noteModalCancel.addEventListener('click', closeNoteModal);
if (noteModalSave) noteModalSave.addEventListener('click', saveActiveNote);

if (noteModal) {
  noteModal.addEventListener('click', e => {
    if (e.target.classList.contains('note-modal-backdrop')) closeNoteModal();
  });
}

document.addEventListener('keydown', e => {
  if (!noteModal || noteModal.classList.contains('hidden')) return;

  if (e.key === 'Escape') closeNoteModal();
  if (e.key === 'Enter' && e.ctrlKey) saveActiveNote();
});

if (refreshBtn) {
  refreshBtn.addEventListener('click', () => currentView === 'chat' ? loadChatFavorites() : loadMen());
}

if (searchInput) {
  searchInput.addEventListener('input', () => {
    favoritesMainPage = 1;
    favoritesImportantPage = 1;
    chatFavoritesPage = 1;
    if (agencyFavoritesSearch && agencyFavoritesSearch.value !== searchInput.value) agencyFavoritesSearch.value = searchInput.value;
    currentView === 'chat' ? renderChatFavorites() : render();
    updateAgencyFavoritesCount();
  });
}

let scrollPaintTimer = null;
document.addEventListener('scroll', () => {
  document.body.classList.add('is-scrolling');
  clearTimeout(scrollPaintTimer);
  scrollPaintTimer = setTimeout(() => {
    document.body.classList.remove('is-scrolling');
  }, 140);
}, { passive: true, capture: true });

if (mainTableCard) {
  mainTableCard.addEventListener('scroll', () => {
    if (mainVirtualRows.length) scheduleVirtualMainRender();
  }, { passive: true });
}

if (favoritesList) {
  favoritesList.addEventListener('scroll', () => {
    if (favoritesVirtualRows.length) scheduleVirtualFavoritesRender();
  }, { passive: true });
}

const chatFavoritesScroll = document.querySelector('#chatFavoritesView .chat-favorites-table-wrap');
if (chatFavoritesScroll) {
  chatFavoritesScroll.addEventListener('scroll', () => {
    if (chatVirtualRows.length) scheduleVirtualChatRender();
  }, { passive: true });
}

window.addEventListener('resize', () => {
  syncAdminPanelViewportWidth();
  mainVirtualWindowKey = '';
  favoritesVirtualWindowKey = '';
  chatVirtualWindowKey = '';
  lockFavoritesScrollContainer();
  scheduleVirtualMainRender();
  scheduleVirtualFavoritesRender();
  scheduleVirtualChatRender();
}, { passive: true });

favoritesNavBtn?.addEventListener('click', () => switchView('favorites'));
chatFavoritesNavBtn?.addEventListener('click', () => switchView('chat'));
workspaceNavLink?.addEventListener('click', () => switchView('workspace'));
myStatsNavBtn?.addEventListener('click', () => switchView('stats'));
adminPanelNavBtn?.addEventListener('click', () => switchView('adminPanel'));
agencyFavoritesSearch?.addEventListener('input', () => {
  favoritesMainPage = 1;
  favoritesImportantPage = 1;
  chatFavoritesPage = 1;
  if (searchInput) searchInput.value = agencyFavoritesSearch.value;
  if (agencyFavoritesTab === 'chat') renderChatFavorites();
  else render();
  updateAgencyFavoritesCount();
});
agencyFavoritesRefreshBtn?.addEventListener('click', async () => {
  agencyFavoritesRefreshBtn.disabled = true;
  agencyFavoritesRefreshBtn.textContent = 'Loading...';
  try {
    if (agencyFavoritesTab === 'chat') await loadChatFavorites();
    else await loadMen(false);
    updateAgencyFavoritesCount();
  } finally {
    agencyFavoritesRefreshBtn.disabled = false;
    agencyFavoritesRefreshBtn.textContent = 'Refresh';
  }
});
agencyFavoritesTabs?.addEventListener('click', event => {
  const button = event.target.closest?.('[data-agency-favorites-tab]');
  if (!button) return;
  agencyFavoritesTab = button.dataset.agencyFavoritesTab === 'chat' ? 'chat' : 'favorites';
  localStorage.setItem(AGENCY_FAVORITES_TAB_KEY, agencyFavoritesTab);
  mountAgencyFavoritesView();
  if (agencyFavoritesTab === 'chat') {
    if (!allMen.length) loadMen({ skipAutoOnline: true }).finally(updateAgencyFavoritesCount);
    loadChatFavorites().catch(error => {
      const status = document.getElementById('chatFavoritesStatus');
      if (status) status.textContent = error.message || 'Could not load chat favorites';
    }).finally(mountAgencyFavoritesView);
  } else if (!allMen.length) {
    loadMen(false).finally(updateAgencyFavoritesCount);
  }
});
agencyInboxAuthorizeBtn?.addEventListener('click', () => {
  pendingAgencyProfileChoicePanel = 'inbox';
  showProfileChoice();
});
agencyFavoritesAuthorizeBtn?.addEventListener('click', () => {
  pendingAgencyProfileChoicePanel = 'favorites';
  showProfileChoice();
});
document.addEventListener('click', async event => {
  const pageButton = event.target.closest?.('.list-pagination [data-list-page]');
  if (pageButton) {
    event.preventDefault();
    const pager = pageButton.closest('.list-pagination');
    const nextPage = Number(pageButton.dataset.listPage || '1');
    if (!pager || pageButton.disabled || !Number.isFinite(nextPage)) return;
    if (pager.id === 'favoritesMainPager') {
      favoritesMainPage = nextPage;
      render();
    } else if (pager.id === 'importantMenPager') {
      favoritesImportantPage = nextPage;
      renderFavorites();
    } else if (pager.id === 'chatFavoritesPager') {
      chatFavoritesPage = nextPage;
      renderChatFavorites();
    }
    return;
  }
  const connectAllButton = event.target.closest?.('[data-profile-connect-all]');
  if (connectAllButton) {
    event.preventDefault();
    event.stopPropagation();
    connectAllButton.disabled = true;
    connectAllButton.textContent = '...';
    try {
      await connectAllProfiles();
    } finally {
      connectAllButton.disabled = false;
      renderSidebarProfileDock();
    }
    return;
  }
  const profilePowerButton = event.target.closest?.('[data-profile-power-id]');
  if (profilePowerButton) {
    event.preventDefault();
    event.stopPropagation();
    const id = profilePowerButton.dataset.profilePowerId || '';
    if (!id || profilePowerButton.disabled) return;
    profilePowerButton.disabled = true;
    try {
      if (localStorage.getItem(`dream_team_lady_connected_${id}`) === '1') {
        await disconnectProfileById(id);
      } else {
        await connectProfileById(id);
        await switchWorkingProfile(id, { reason: 'sidebar-profile-power' });
      }
    } catch (error) {
      alert(error.message || 'Could not change profile status');
    } finally {
      renderSidebarProfileDock();
    }
    return;
  }
  const dockProfileButton = event.target.closest?.('.sidebar-profile-dock-item[data-profile-id]');
  if (dockProfileButton) {
    event.preventDefault();
    event.stopPropagation();
    const id = dockProfileButton.dataset.profileId || '';
    try {
      await switchWorkingProfile(id, { reason: 'sidebar-profile' });
    } catch (error) {
      alert(error.message || 'Could not switch profile');
    } finally {
      renderSidebarProfileDock();
    }
    return;
  }
  const powerButton = event.target.closest?.('#agencyProfilePowerToggle');
  if (!powerButton) return;
  return;
  if (!ladyConnected || ladyDisconnectInProgress) return;
  powerButton.disabled = true;
  powerButton.classList.add('is-working');
  const label = powerButton.querySelector('.agency-profile-power-label');
  if (label) label.textContent = 'Leaving';
  try {
    await disconnectCurrentLady('agency-profile-power');
  } catch (error) {
    alert(error.message || 'Could not disconnect profile');
  } finally {
    powerButton.classList.remove('is-working');
    syncAgencyProfilePowerToggle();
  }
});
mandarinHomeScreen?.addEventListener('click', event => {
  const authorizeButton = event.target.closest?.('.agency-section-authorize-btn');
  if (!authorizeButton) return;
  if (authorizeButton.id === 'agencyInboxAuthorizeBtn') pendingAgencyProfileChoicePanel = 'inbox';
  else if (authorizeButton.id === 'agencyFavoritesAuthorizeBtn') pendingAgencyProfileChoicePanel = 'favorites';
  else return;
  event.preventDefault();
  event.stopPropagation();
  showProfileChoice();
});
adminPanelRefreshBtn?.addEventListener('click', () => loadAdminPanelBalances({ refresh: true }));
adminPanelAdminSwitch?.addEventListener('click', event => {
  const button = event.target.closest?.('.admin-panel-admin-switch-btn');
  if (!button) return;
  ownerSelectedAdminPanelId = String(button.dataset.adminId || '');
  if (ownerSelectedAdminPanelId) localStorage.setItem('dream_crm_owner_admin_panel_id', ownerSelectedAdminPanelId);
  else localStorage.removeItem('dream_crm_owner_admin_panel_id');
  adminPanelSelectedDay = '';
  renderOwnerAdminPanelSwitch(adminPanelLastResult?.adminPanelAdmins || [], ownerSelectedAdminPanelId);
  loadAdminPanelBalances().catch(error => {
    if (adminPanelStatus) adminPanelStatus.textContent = error.message || 'Could not load admin panel';
  });
});
adminPanelMonthInput?.closest('.admin-panel-month-control')?.addEventListener('click', event => {
  event.preventDefault();
  event.stopPropagation();
  openAdminPanelMonthMenu();
});
adminPanelMonthInput?.addEventListener('change', () => {
  selectAdminPanelMonth(adminPanelMonthInput.value);
});
document.addEventListener('click', event => {
  if (!adminPanelMonthMenu) return;
  const control = adminPanelMonthInput?.closest('.admin-panel-month-control');
  if (control?.contains(event.target)) return;
  closeAdminPanelMonthMenu();
});
adminPanelCloseBtn?.addEventListener('click', () => {
  closeAdminPanelWindow().catch(error => {
    if (adminPanelStatus) adminPanelStatus.textContent = error.message || 'Could not close admin panel';
  });
});
function setAdminPanelMatrixFocus(operatorId = '') {
  if (!adminPanelOperators) return;
  const focusId = String(operatorId || '');
  adminPanelOperators
    .querySelectorAll('[data-admin-focus-bg], [data-admin-focus-color], [data-admin-focus-border-top], [data-admin-focus-border-bottom], [data-admin-focus-border-left], [data-admin-focus-border-right]')
    .forEach(cell => {
      if (cell.dataset.adminFocusBg !== undefined) {
        cell.style.setProperty('background', cell.dataset.adminFocusBg, cell.dataset.adminFocusBgPriority || '');
        delete cell.dataset.adminFocusBg;
        delete cell.dataset.adminFocusBgPriority;
      }
      if (cell.dataset.adminFocusColor !== undefined) {
        cell.style.setProperty('color', cell.dataset.adminFocusColor, cell.dataset.adminFocusColorPriority || '');
        delete cell.dataset.adminFocusColor;
        delete cell.dataset.adminFocusColorPriority;
      }
      if (cell.dataset.adminFocusBorderTop !== undefined) {
        cell.style.setProperty('border-top', cell.dataset.adminFocusBorderTop, cell.dataset.adminFocusBorderTopPriority || '');
        delete cell.dataset.adminFocusBorderTop;
        delete cell.dataset.adminFocusBorderTopPriority;
      }
      if (cell.dataset.adminFocusBorderBottom !== undefined) {
        cell.style.setProperty('border-bottom', cell.dataset.adminFocusBorderBottom, cell.dataset.adminFocusBorderBottomPriority || '');
        delete cell.dataset.adminFocusBorderBottom;
        delete cell.dataset.adminFocusBorderBottomPriority;
      }
      if (cell.dataset.adminFocusBorderLeft !== undefined) {
        cell.style.setProperty('border-left', cell.dataset.adminFocusBorderLeft, cell.dataset.adminFocusBorderLeftPriority || '');
        delete cell.dataset.adminFocusBorderLeft;
        delete cell.dataset.adminFocusBorderLeftPriority;
      }
      if (cell.dataset.adminFocusBorderRight !== undefined) {
        cell.style.setProperty('border-right', cell.dataset.adminFocusBorderRight, cell.dataset.adminFocusBorderRightPriority || '');
        delete cell.dataset.adminFocusBorderRight;
        delete cell.dataset.adminFocusBorderRightPriority;
      }
    });
  const saveAndSet = (cell, property, dataKey, value) => {
    if (!cell || cell.dataset[dataKey] !== undefined) return;
    cell.dataset[dataKey] = cell.style.getPropertyValue(property) || '';
    cell.dataset[`${dataKey}Priority`] = cell.style.getPropertyPriority(property) || '';
    cell.style.setProperty(property, value, 'important');
  };
  adminPanelOperators.classList.toggle('has-operator-focus', Boolean(focusId));
  adminPanelOperators
    .querySelectorAll('.admin-matrix-operator-row, .admin-matrix-profile-row, .admin-matrix-total-row')
    .forEach(row => {
      const rowOperatorId = row.dataset?.operatorId || row.dataset?.parentOperator || '';
      const isFocusedProfile = focusId && row.classList.contains('admin-matrix-profile-row') && row.dataset?.parentOperator === focusId;
      const isFocusedOperator = focusId && row.classList.contains('admin-matrix-operator-row') && row.dataset?.operatorId === focusId;
      const isDimmedOther = focusId && rowOperatorId && rowOperatorId !== focusId;
      row.classList.toggle('is-focus-profile', Boolean(isFocusedProfile));
      row.classList.toggle('is-focus-operator', Boolean(isFocusedOperator));
      row.classList.toggle('is-focus-dimmed', Boolean(isDimmedOther || (focusId && row.classList.contains('admin-matrix-total-row'))));
      if (isFocusedOperator) {
        row.querySelectorAll('td').forEach(cell => {
          saveAndSet(cell, 'background', 'adminFocusBg', '#e7f5ee');
          saveAndSet(cell, 'border-top', 'adminFocusBorderTop', '2px solid #4f8f72');
          saveAndSet(cell, 'border-bottom', 'adminFocusBorderBottom', '2px solid #4f8f72');
          saveAndSet(cell, 'color', 'adminFocusColor', '#263343');
        });
        const firstCell = row.querySelector('td:first-child');
        const lastCell = row.querySelector('td:last-child');
        saveAndSet(firstCell, 'border-left', 'adminFocusBorderLeft', '2px solid #4f8f72');
        saveAndSet(lastCell, 'border-right', 'adminFocusBorderRight', '2px solid #4f8f72');
      }
    });
}
adminPanelOperators?.addEventListener('click', event => {
  const profileRow = event.target.closest?.('.admin-matrix-profile-row');
  if (profileRow) {
    return;
  }
  const row = event.target.closest?.('.admin-matrix-operator-row');
  if (!row?.dataset?.operatorId) return;
  const operatorId = row.dataset.operatorId;
  const opening = !row.classList.contains('is-open');
  adminPanelOperators
    .querySelectorAll('.admin-matrix-operator-row.is-open')
    .forEach(operatorRow => operatorRow.classList.remove('is-open'));
  adminPanelOperators
    .querySelectorAll('.admin-matrix-toggle')
    .forEach(toggleButton => {
      toggleButton.setAttribute('aria-expanded', 'false');
      toggleButton.textContent = '▸';
    });
  adminPanelOperators
    .querySelectorAll('.admin-matrix-profile-row')
    .forEach(profileRow => profileRow.classList.add('hidden'));
  adminPanelOperators
    .querySelectorAll(`.admin-matrix-operator-row[data-operator-id="${cssEscape(operatorId)}"]`)
    .forEach(operatorRow => operatorRow.classList.toggle('is-open', opening));
  const toggle = adminPanelOperators.querySelector(`.admin-matrix-left-table .admin-matrix-operator-row[data-operator-id="${cssEscape(operatorId)}"] .admin-matrix-toggle`);
  toggle?.setAttribute('aria-expanded', opening ? 'true' : 'false');
  if (toggle) toggle.textContent = opening ? '▾' : '▸';
  toggle?.blur?.();
  adminPanelOperators
    .querySelectorAll(`.admin-matrix-profile-row[data-parent-operator="${cssEscape(operatorId)}"]`)
    .forEach(profileRow => profileRow.classList.toggle('hidden', !opening));
  adminPanelOperators
    .querySelectorAll('.admin-matrix-gifts-row')
    .forEach(giftsRow => giftsRow.classList.toggle('hidden', opening));
  setAdminPanelMatrixFocus(opening ? operatorId : '');
});
adminPanelOperators?.addEventListener('contextmenu', event => {
  if (['director', 'mentor'].includes(currentUser?.role)) return;
  const colorTarget = event.target.closest?.('.admin-matrix-color-target');
  if (!colorTarget?.dataset?.colorKey) return;
  event.preventDefault();
  event.stopPropagation();
  if (
    adminPanelColorPalette &&
    !adminPanelColorPalette.classList.contains('hidden') &&
    adminPanelColorTarget?.key === colorTarget.dataset.colorKey
  ) {
    closeAdminPanelColorPalette();
    return;
  }
  openAdminPanelColorPalette(colorTarget);
});
adminPanelOperators?.addEventListener('mouseover', event => {
  const corner = event.target.closest?.('.admin-comment-corner');
  if (!corner || !adminPanelOperators.contains(corner)) return;
  const commentTarget = corner.closest('.admin-matrix-color-target.has-admin-comment');
  if (!commentTarget) return;
  showAdminPanelCommentTooltip(commentTarget, event);
});
adminPanelOperators?.addEventListener('mousemove', event => {
  const corner = event.target.closest?.('.admin-comment-corner');
  if (!corner || !adminPanelOperators.contains(corner)) return;
  const commentTarget = corner.closest('.admin-matrix-color-target.has-admin-comment');
  if (!commentTarget) return;
  showAdminPanelCommentTooltip(commentTarget, event);
});
adminPanelOperators?.addEventListener('mouseout', event => {
  const corner = event.target.closest?.('.admin-comment-corner');
  if (!corner || corner.contains(event.relatedTarget)) return;
  hideAdminPanelCommentTooltip();
});
document.addEventListener('click', event => {
  const insidePalette = event.target.closest?.('.admin-color-palette');
  const insideEditor = event.target.closest?.('.admin-comment-editor');
  const insideTarget = event.target.closest?.('.admin-matrix-color-target');
  if (adminPanelColorPalette && !adminPanelColorPalette.classList.contains('hidden') && !insidePalette) {
    closeAdminPanelColorPalette();
  }
  if (adminPanelCommentEditor && !adminPanelCommentEditor.classList.contains('hidden') && !insideEditor && !insidePalette && !insideTarget) {
    closeAdminPanelCommentEditor();
  }
});
document.addEventListener('contextmenu', event => {
  const insidePalette = event.target.closest?.('.admin-color-palette');
  const insideTarget = event.target.closest?.('.admin-matrix-color-target');
  if (insidePalette || insideTarget) return;
  closeAdminPanelColorPalette();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    closeAdminPanelColorPalette();
    closeAdminPanelCommentEditor();
    hideAdminPanelCommentTooltip();
  }
});
myStatsLoadBtn?.addEventListener('click', loadMyStats);
myStatsFrom?.addEventListener('change', () => myStatsLoadBtn?.removeAttribute('aria-busy'));
myStatsTo?.addEventListener('change', () => myStatsLoadBtn?.removeAttribute('aria-busy'));
fixedBalanceRefreshBtn?.addEventListener('click', loadFixedBalance);
statsProfileBalanceBtn?.addEventListener('click', () => setStatsBalanceMode('profile'));
statsMyBalanceBtn?.addEventListener('click', () => setStatsBalanceMode('fixed'));
salaryCalendarGrid?.addEventListener('click', event => {
  const button = event.target.closest?.('.salary-calendar-day');
  if (!button?.dataset?.date) return;
  renderSalaryDayPanel(button.dataset.date);
});
salaryCalendarPrevBtn?.addEventListener('click', () => {
  const [year, month] = String(salaryCalendarMonth || todayDateInputValue().slice(0, 7)).split('-').map(Number);
  const date = new Date(year, month - 2, 1);
  salaryCalendarMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  loadFixedBalance({ month: salaryCalendarMonth });
});
salaryCalendarNextBtn?.addEventListener('click', () => {
  const [year, month] = String(salaryCalendarMonth || todayDateInputValue().slice(0, 7)).split('-').map(Number);
  const date = new Date(year, month, 1);
  salaryCalendarMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  loadFixedBalance({ month: salaryCalendarMonth });
});
googleDriveNavBtn?.addEventListener('click', () => {
  const profile = availableProfiles.find(item => item.id === activeProfileId);
  const url = String(profile?.googleDriveUrl || '').trim();
  if (!url) {
    alert('Google Drive link is not configured for this profile.');
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
});

function closeAgencyDriveModal() {
  agencyDriveModal?.classList.add('hidden');
}

function renderAgencyDriveList() {
  if (!agencyDriveList) return;
  const profiles = (availableProfiles || []).slice().sort((a, b) =>
    String(a.name || a.id || '').localeCompare(String(b.name || b.id || ''))
  );
  agencyDriveList.innerHTML = profiles.length
    ? profiles.map(profile => {
        const url = String(profile.googleDriveUrl || '').trim();
        const initial = String(profile.name || profile.id || '?').slice(0, 1).toUpperCase();
        return `
          <div class="agency-drive-row">
            <span class="agency-drive-avatar ${profile.photoUrl ? '' : 'no-photo'}">
              ${profile.photoUrl ? `<img src="${escapeAttr(profile.photoUrl)}" alt="">` : escapeHtml(initial)}
            </span>
            <span class="agency-drive-copy">
              <strong>${escapeHtml(profile.name || `Profile ${profile.id}`)}</strong>
              <small>ID ${escapeHtml(profile.id || '')}</small>
            </span>
            <button class="agency-drive-open-btn" type="button" data-drive-url="${escapeAttr(url)}" ${url ? '' : 'disabled'}>
              Open Disk
            </button>
          </div>
        `;
      }).join('')
    : '<div class="agency-drive-empty">No profiles assigned.</div>';
}

function openAgencyDriveModal() {
  renderAgencyDriveList();
  agencyDriveModal?.classList.remove('hidden');
}

agencyGoogleDriveBtn?.addEventListener('click', openAgencyDriveModal);
agencyDriveCloseBtn?.addEventListener('click', closeAgencyDriveModal);
agencyDriveModal?.addEventListener('click', event => {
  if (event.target.classList.contains('add-profile-backdrop')) {
    closeAgencyDriveModal();
    return;
  }
  const button = event.target.closest?.('.agency-drive-open-btn[data-drive-url]');
  if (!button) return;
  const url = String(button.dataset.driveUrl || '').trim();
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
});
agencyDriveModal?.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeAgencyDriveModal();
});

function closeAgencySettingsModal() {
  agencySettingsModal?.classList.add('hidden');
  agencyTranslatorPanel?.classList.add('hidden');
}

async function openAgencySettingsModal() {
  if (agencySettingsContent && agencyTranslatorPanel && agencyTranslatorPanel.parentElement !== agencySettingsContent) {
    agencySettingsContent.appendChild(agencyTranslatorPanel);
  }
  agencySettingsModal?.classList.remove('hidden');
  agencyTranslatorPanel?.classList.remove('hidden');
  agencyTranslatorPanel?.classList.add('is-toolbar-settings');
  await loadAgencyTranslatorSettings();
}

agencySettingsBtn?.addEventListener('click', openAgencySettingsModal);
window.openAgencySettingsModal = openAgencySettingsModal;
document.addEventListener('click', event => {
  const button = event.target.closest?.('#agencySettingsBtn');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  openAgencySettingsModal();
}, true);
agencySettingsCloseBtn?.addEventListener('click', closeAgencySettingsModal);
agencySettingsModal?.addEventListener('click', event => {
  if (event.target.classList.contains('add-profile-backdrop')) closeAgencySettingsModal();
});
agencySettingsModal?.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeAgencySettingsModal();
});

chatAddManBtn?.addEventListener('click', addChatFavorite);
chatManIdInput?.addEventListener('keydown', event => {
  if (event.key === 'Enter') addChatFavorite();
});
agencyChatAddManBtn?.addEventListener('click', () => addChatFavorite(agencyChatManIdInput, agencyChatAddManBtn));
agencyChatManIdInput?.addEventListener('keydown', event => {
  if (event.key === 'Enter') addChatFavorite(agencyChatManIdInput, agencyChatAddManBtn);
});

async function runAgencyNavigation(action) {
  const command = String(action || '');
  if (command === 'back') {
    activateAgencyPanel('home', { persist: false });
    return;
  }
  if (command === 'refresh') {
    if (agencyRefreshBtn) {
      agencyRefreshBtn.disabled = true;
      agencyRefreshBtn.classList.add('is-reloading');
    }
    requestAnimationFrame(() => {
      setTimeout(() => window.location.reload(), 120);
    });
    return;
  }
  if (window.agencyElectron?.navigate) {
    await window.agencyElectron.navigate(command);
    return;
  }
  const currentZoom = Number(document.documentElement.style.getPropertyValue('--main-page-zoom') || '1') || 1;
  const nextZoom = Math.min(1.5, Math.max(0.75, currentZoom + (command === 'zoom-in' ? 0.1 : -0.1)));
  document.documentElement.style.setProperty('--main-page-zoom', String(Math.round(nextZoom * 100) / 100));
}

agencyBackBtn?.addEventListener('click', () => runAgencyNavigation('back'));
agencyRefreshBtn?.addEventListener('click', () => runAgencyNavigation('refresh'));
agencyClearCacheBtn?.addEventListener('click', async () => {
  if (!activeProfileId) {
    alert('Select a profile first.');
    return;
  }
  const confirmed = confirm('Clear local letter cache on this computer?\n\nThis will remove saved Workspace letters, media list, and downloaded attachments for the selected profile. Dream messages will not be deleted.');
  if (!confirmed) return;
  agencyClearCacheBtn.disabled = true;
  agencyClearCacheBtn.classList.add('is-clearing');
  try {
    const result = await apiFetch('/api/workspace/clear-cache', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceProfileId: activeProfileId })
    });
    const bytes = Number(result?.cleared?.attachmentBytes || 0);
    const mb = bytes ? Math.round((bytes / 1024 / 1024) * 10) / 10 : 0;
    alert(`Cache cleared.\n\nLetters: ${result?.cleared?.letters || 0}\nMedia items: ${result?.cleared?.media || 0}\nAttachments: ${mb} MB`);
    [workspaceEmbedFrame, agencyInboxFrame].forEach(frame => {
      if (!frame) return;
      const url = new URL(frame.getAttribute('src') || 'workspace.html?embedded=1', window.location.href);
      url.searchParams.set('v', String(Date.now()));
      frame.setAttribute('src', `${url.pathname.replace(/^\//, '')}${url.search}`);
    });
  } catch (error) {
    alert(error.message || 'Could not clear cache.');
  } finally {
    agencyClearCacheBtn.disabled = false;
    agencyClearCacheBtn.classList.remove('is-clearing');
  }
});
agencyAppUpdateBtn?.addEventListener('click', async () => {
  if (!window.agencyElectron?.checkForUpdates) {
    alert('Updates are available in the desktop app only.');
    return;
  }
  const oldText = agencyAppUpdateBtn.textContent;
  agencyAppUpdateBtn.disabled = true;
  agencyAppUpdateBtn.classList.add('is-checking');
  agencyAppUpdateBtn.textContent = 'Checking...';
  try {
    const result = await window.agencyElectron.checkForUpdates();
    if (!result?.ok) {
      alert(result?.error || 'Could not check for updates.');
      return;
    }
    if (!result.configured) {
      alert(result.message || 'Update channel is not configured yet.');
      return;
    }
    if (!result.hasUpdate) {
      alert(result.message || 'No updates available.');
      return;
    }
    const shouldDownload = confirm(`${result.message || `Update available: v${result.latestVersion}.`}\n\nCurrent version: v${result.currentVersion}\n\nDownload now?`);
    if (shouldDownload && result.downloadUrl) {
      await window.agencyElectron.openExternalUrl(result.downloadUrl);
    }
  } catch (error) {
    alert(error?.message || 'Could not check for updates.');
  } finally {
    agencyAppUpdateBtn.disabled = false;
    agencyAppUpdateBtn.classList.remove('is-checking');
    agencyAppUpdateBtn.textContent = oldText || 'App Update';
  }
});
agencyZoomOutBtn?.addEventListener('click', () => runAgencyNavigation('zoom-out'));
agencyZoomInBtn?.addEventListener('click', () => runAgencyNavigation('zoom-in'));

if (onlineFilterBtn) {
  onlineFilterBtn.addEventListener('click', () => {
    onlineOnly = !onlineOnly;
    onlineFilterBtn.classList.toggle('active', onlineOnly);
    onlineFilterBtn.setAttribute('aria-pressed', String(onlineOnly));
    if (currentView === 'chat') renderChatFavorites();
    else render();
  });
}

if (dailySyncBtn) dailySyncBtn.addEventListener('click', () => startSync('daily'));
agencyFavoritesUpdateTodayBtn?.addEventListener('click', () => startSync('daily'));
if (checkOnlineBtn) checkOnlineBtn.addEventListener('click', checkOnlineSnapshot);
if (fullSyncBtn) fullSyncBtn.addEventListener('click', () => {
  if (scanIsRunning) stopSync();
  else startSync('full');
});
agencyTopOnlineBtn?.addEventListener('click', toggleAgencyTopOnline);
agencyChatTopOnlineBtn?.addEventListener('click', toggleAgencyChatTopOnline);
agencyFavoritesScanAllBtn?.addEventListener('click', () => {
  if (scanIsRunning) stopSync();
  else startSync('full');
});
if (stopSyncBtn) stopSyncBtn.addEventListener('click', stopSync);
if (sidebarCollapseBtn) {
  const collapsed = localStorage.getItem('dream_crm_sidebar_collapsed') === '1';
  document.body.classList.toggle('sidebar-collapsed', collapsed);
  

  sidebarCollapseBtn.addEventListener('click', () => {
    const next = !document.body.classList.contains('sidebar-collapsed');
    document.body.classList.toggle('sidebar-collapsed', next);
    
    localStorage.setItem('dream_crm_sidebar_collapsed', next ? '1' : '0');
  });
}
if (profileModalClose) profileModalClose.addEventListener('click', closeProfileModal);
if (profileModal) {
  profileModal.addEventListener('click', event => {
    if (event.target.classList.contains('profile-modal-backdrop')) closeProfileModal();
  });
}

showExtensionStatus(ladyConnected
  ? { ready: true, checking: true, message: 'Checking connection...' }
  : { ready: false, message: 'Extension is not connected' });

let setupMode = false;

function normalizeAgencyPanel(view) {
  const panel = ['home', 'account-manager', 'dashboard', 'inbox', 'favorites', 'letterbot', 'sender'].includes(view) ? view : 'account-manager';
  if (isAgencyDesktopApp() && panel === 'account-manager') {
    return 'dashboard';
  }
  if ((currentUser?.role === 'director' || isWebsiteAdminSession()) && ['inbox', 'favorites', 'letterbot', 'sender'].includes(panel)) {
    return 'dashboard';
  }
  return panel;
}

function syncAgencyAccountTabs() {
  mandarinHomeScreen?.querySelectorAll('.agency-account-tab').forEach(item => {
    const tab = item.dataset.agencyAccountTab || 'ladies';
    const visible = tab === 'ladies' ||
      (tab === 'operators' && currentUser?.role !== 'operator' && !isDesktopAdminSession()) ||
      (tab === 'salary' && currentUser?.role === 'director') ||
      (tab === 'agency-admin' && currentUser?.role === 'director');
    item.classList.toggle('hidden', !visible);
    const active = item.dataset.agencyAccountTab === agencyAccountTab;
    item.classList.toggle('active', active);
    item.setAttribute('aria-selected', active ? 'true' : 'false');
  });
}

function resetAgencyDashboardDateToToday() {
  const today = dreamDateInputValue();
  const currentYear = today.slice(0, 4);
  agencyDashboardMonth = Number(today.slice(5, 7));
  if (agencyDashboardYear) agencyDashboardYear.value = currentYear;
  if (agencyDashboardCalendarYear) agencyDashboardCalendarYear.value = currentYear;
  setAgencyDashboardMonth(agencyDashboardMonth);
  syncAgencyYearCombos();
}

function syncAgencyInboxAccess() {
  const roleAllowed = ['admin', 'operator'].includes(currentUser?.role);
  const allowed = roleAllowed && ladyConnected;
  const panel = agencyInboxFrame?.closest('[data-agency-panel="inbox"]');
  if (agencyInboxNoAccess) {
    const title = agencyInboxNoAccess.querySelector('strong');
    const text = agencyInboxNoAccess.querySelector('span');
    if (title) title.textContent = roleAllowed
      ? 'Inbox will be available after profile authorization.'
      : 'You do not have access to this section.';
    if (text) text.textContent = roleAllowed
      ? 'Authorize a profile to continue working with Inbox.'
      : 'Inbox is available only for administrators and operators.';
  }
  panel?.classList.toggle('is-locked', !allowed);
  agencyInboxNoAccess?.classList.toggle('hidden', allowed);
  agencyInboxFrame?.classList.toggle('hidden', !allowed);
  agencyInboxAuthorizeBtn?.classList.toggle('hidden', !roleAllowed || ladyConnected);
  return allowed;
}

function syncAgencyFavoritesAccess() {
  const roleAllowed = ['admin', 'operator'].includes(currentUser?.role);
  const allowed = roleAllowed && ladyConnected;
  const panel = agencyFavoritesContent?.closest('[data-agency-panel="favorites"]');
  if (agencyFavoritesNoAccess) {
    const title = agencyFavoritesNoAccess.querySelector('strong');
    const text = agencyFavoritesNoAccess.querySelector('span');
    if (title) title.textContent = roleAllowed
      ? 'Favorites will be available after profile authorization.'
      : 'You do not have access to this section.';
    if (text) text.textContent = roleAllowed
      ? 'Authorize a profile to continue working with Favorites.'
      : 'Favorites are available only for administrators and operators.';
  }
  panel?.classList.toggle('is-locked', !allowed);
  agencyFavoritesNoAccess?.classList.toggle('hidden', allowed);
  agencyFavoritesContent?.classList.toggle('hidden', !allowed);
  agencyFavoritesAuthorizeBtn?.classList.toggle('hidden', !roleAllowed || ladyConnected);
  return allowed;
}

function updateAgencyFavoritesCount() {
  // The visible count near Favorites was removed from the AgencyOS toolbar.
}

function syncAgencyTopOnlineButton() {
  agencyTopOnlineBtn?.classList.toggle('active', agencyTopOnlineActive);
  agencyTopOnlineBtn?.setAttribute('aria-pressed', agencyTopOnlineActive ? 'true' : 'false');
  agencyTopOnlineBtn?.setAttribute('title', agencyTopOnlineActive ? 'Top Online is running' : 'Top Online');
  agencyChatTopOnlineBtn?.classList.toggle('active', agencyChatTopOnlineActive);
  agencyChatTopOnlineBtn?.setAttribute('aria-pressed', agencyChatTopOnlineActive ? 'true' : 'false');
  agencyChatTopOnlineBtn?.setAttribute('title', agencyChatTopOnlineActive ? 'Top Online is running' : 'Top Online');
}

function stopAgencyTopOnline() {
  agencyTopOnlineActive = false;
  if (agencyTopOnlineTimer) {
    clearInterval(agencyTopOnlineTimer);
    agencyTopOnlineTimer = null;
  }
  syncAgencyTopOnlineButton();
  render();
}

async function runAgencyTopOnlineScan() {
  if (!agencyTopOnlineActive || !ladyConnected) return;
  if (!allMen.length) await loadMen({ skipAutoOnline: true });
  await checkOnlineSnapshot({ silent: true, skipReloadAuto: true });
  render();
}

async function toggleAgencyTopOnline() {
  if (agencyTopOnlineActive) {
    stopAgencyTopOnline();
    return;
  }
  agencyTopOnlineActive = true;
  syncAgencyTopOnlineButton();
  await runAgencyTopOnlineScan();
  if (agencyTopOnlineTimer) clearInterval(agencyTopOnlineTimer);
  agencyTopOnlineTimer = setInterval(runAgencyTopOnlineScan, 45000);
}

function stopAgencyChatTopOnline() {
  agencyChatTopOnlineActive = false;
  if (agencyChatTopOnlineTimer) {
    clearInterval(agencyChatTopOnlineTimer);
    agencyChatTopOnlineTimer = null;
  }
  syncAgencyTopOnlineButton();
  renderChatFavorites();
}

async function runAgencyChatTopOnlineScan() {
  if (!agencyChatTopOnlineActive || !ladyConnected || chatFavoriteRefreshInProgress) return;
  if (!chatFavoriteMen.length) await loadChatFavorites(false);
  if (!chatFavoriteMen.length) {
    renderChatFavorites();
    return;
  }
  await refreshChatFavoriteDetails();
  renderChatFavorites();
}

async function toggleAgencyChatTopOnline() {
  if (agencyChatTopOnlineActive) {
    stopAgencyChatTopOnline();
    return;
  }
  agencyChatTopOnlineActive = true;
  syncAgencyTopOnlineButton();
  await runAgencyChatTopOnlineScan();
  if (agencyChatTopOnlineTimer) clearInterval(agencyChatTopOnlineTimer);
  agencyChatTopOnlineTimer = setInterval(runAgencyChatTopOnlineScan, 45000);
}

function syncAgencyFavoritesTabs() {
  agencyFavoritesTabs?.querySelectorAll('[data-agency-favorites-tab]').forEach(button => {
    const active = button.dataset.agencyFavoritesTab === agencyFavoritesTab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  agencyFavoritesMount?.classList.toggle('hidden', agencyFavoritesTab !== 'favorites');
  agencyChatFavoritesMount?.classList.toggle('hidden', agencyFavoritesTab !== 'chat');
  agencyFavoritesSearch?.closest('.agency-favorites-search')?.classList.toggle('is-chat-mode', agencyFavoritesTab === 'chat');
  agencyFavoritesActions?.classList.toggle('hidden', agencyFavoritesTab !== 'favorites');
  agencyChatFavoritesActions?.classList.toggle('hidden', agencyFavoritesTab !== 'chat');
  syncAgencyTopOnlineButton();
  updateAgencyFavoritesCount();
}

function mountAgencyFavoritesView() {
  if (!favoritesView || !agencyFavoritesMount) return;
  if (favoritesView.parentElement !== agencyFavoritesMount) {
    agencyFavoritesMount.appendChild(favoritesView);
  }
  if (chatFavoritesView && agencyChatFavoritesMount && chatFavoritesView.parentElement !== agencyChatFavoritesMount) {
    agencyChatFavoritesMount.appendChild(chatFavoritesView);
  }
  syncAgencyFavoritesTabs();
  if (agencyFavoritesSearch && searchInput) agencyFavoritesSearch.value = searchInput.value || '';
  favoritesView.classList.toggle('hidden', agencyFavoritesTab !== 'favorites');
  favoritesView.classList.toggle('view-hidden', agencyFavoritesTab !== 'favorites');
  favoritesView.classList.toggle('view-active', agencyFavoritesTab === 'favorites');
  favoritesView.style.display = agencyFavoritesTab === 'favorites' ? 'flex' : 'none';
  if (chatFavoritesView) {
    chatFavoritesView.classList.toggle('hidden', agencyFavoritesTab !== 'chat');
    chatFavoritesView.classList.toggle('view-hidden', agencyFavoritesTab !== 'chat');
    chatFavoritesView.classList.toggle('view-active', agencyFavoritesTab === 'chat');
    chatFavoritesView.style.display = agencyFavoritesTab === 'chat' ? 'flex' : 'none';
  }
  if (agencyFavoritesTab === 'chat') renderChatFavorites();
  else render();
  lockFavoritesScrollContainer();
  updateAgencyFavoritesCount();
}

function activateAgencyPanel(view, options = {}) {
  const panelView = normalizeAgencyPanel(view);
  const persist = options.persist !== false;
  document.body.classList.add('auth-ready', 'mandarin-home-active');
  mandarinHomeScreen?.classList.remove('hidden');
  mandarinHomeScreen?.setAttribute('aria-hidden', 'false');
  document.querySelector('.app-layout')?.classList.add('hidden');
  if (workspaceView) {
    workspaceView.classList.add('hidden');
    workspaceView.style.display = 'none';
  }
  syncAgencyProfilePowerToggle();
  ['account-manager', 'dashboard', 'inbox', 'favorites', 'letterbot', 'sender'].forEach(name => {
    document.body.classList.toggle('agency-panel-' + name, panelView === name);
  });
  document.body.classList.toggle('agency-dashboard-active', panelView === 'dashboard');
  mandarinHomeScreen?.querySelectorAll('.agency-shell-nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.agencyView === panelView);
  });
  mandarinHomeScreen?.querySelectorAll('[data-agency-panel]').forEach(panel => {
    panel.classList.toggle('hidden', panel.dataset.agencyPanel !== panelView);
  });
  if (persist) localStorage.setItem(AGENCY_PANEL_KEY, panelView);
  window.applyAgencyPanelZoomForPanel?.(panelView);
  if (panelView === 'dashboard') {
    setupAgencyDashboardControls();
    if (options.resetDate !== false) resetAgencyDashboardDateToToday();
    setAgencyDashboardMode(localStorage.getItem(AGENCY_DASHBOARD_MODE_KEY) === 'bonuses' ? 'bonuses' : 'total', { persist: false });
  } else if (panelView === 'inbox') {
    stopAgencyDashboardAutoBalance();
    closeAgencyDashboardCalendar();
    if (syncAgencyInboxAccess() && options.reloadInbox) reloadWorkspaceEmbed('agency-inbox');
  } else if (panelView === 'favorites') {
    stopAgencyDashboardAutoBalance();
    closeAgencyDashboardCalendar();
    if (syncAgencyFavoritesAccess()) {
      mountAgencyFavoritesView();
      if (agencyFavoritesTab === 'chat') {
        if (!allMen.length) loadMen({ skipAutoOnline: true }).finally(updateAgencyFavoritesCount);
        if (!chatFavoriteMen.length || options.reloadFavorites) loadChatFavorites().finally(() => {
          mountAgencyFavoritesView();
          updateAgencyFavoritesCount();
        });
      } else if (!allMen.length || options.reloadFavorites) {
        loadMen(false).finally(updateAgencyFavoritesCount);
      }
    }
  } else {
    stopAgencyDashboardAutoBalance();
    closeAgencyDashboardCalendar();
  }
}

function readRememberedAccess() {
  try {
    return JSON.parse(localStorage.getItem(REMEMBER_ACCESS_KEY) || 'null') || null;
  } catch {
    return null;
  }
}

function syncRememberedAccess(needsSetup = false) {
  const saved = readRememberedAccess();
  rememberAccessRow?.classList.toggle('hidden', needsSetup);
  if (rememberAccessInput) rememberAccessInput.checked = !needsSetup && Boolean(saved?.remember);
  if (!needsSetup && saved?.remember) {
    if (usernameInput) usernameInput.value = saved.username || '';
    if (passwordInput) passwordInput.value = saved.password || '';
  } else {
    if (usernameInput) usernameInput.value = '';
    if (passwordInput) passwordInput.value = '';
  }
}

function saveRememberedAccessAfterLogin(username, password) {
  if (!rememberAccessInput?.checked || setupMode) {
    localStorage.removeItem(REMEMBER_ACCESS_KEY);
    return;
  }
  localStorage.setItem(REMEMBER_ACCESS_KEY, JSON.stringify({
    remember: true,
    username: String(username || ''),
    password: String(password || '')
  }));
}

function showLogin(needsSetup = false) {
  setupMode = needsSetup;
  document.body.classList.remove('auth-pending', 'auth-ready', 'profile-choice-auth', 'agency-profile-choice-modal', 'mandarin-home-active');
  document.body.classList.add('auth-login');
  mandarinHomeScreen?.classList.add('hidden');
  profileChoiceScreen?.classList.add('hidden');
  adminModal?.classList.add('hidden');
  accessTitle.textContent = needsSetup ? 'Create your administrator account' : 'AgencyOS';
  accessHint.textContent = needsSetup
    ? 'AgencyOS'
    : 'Sign in to your personal account';
  if (usernameInput) usernameInput.placeholder = needsSetup ? 'Create your login' : 'Write your login';
  if (passwordInput) passwordInput.placeholder = needsSetup ? 'Create your password' : 'Write your password';
  accessBtn.textContent = needsSetup ? 'Create Account' : 'Log In';
  accessStatus.textContent = '';
  syncRememberedAccess(needsSetup);
  accessScreen.classList.remove('hidden');
  setTimeout(() => (usernameInput?.value ? passwordInput : usernameInput)?.focus(), 50);
}

function showMandarinHome(options = {}) {
  const resetPanel = options.resetPanel !== false;
  installAgencyRuntimeStyles();
  if (!localStorage.getItem(GLOBAL_THEME_KEY)) {
    localStorage.setItem(GLOBAL_THEME_KEY, 'dark');
    applyGlobalTheme('dark');
  }
  document.body.classList.remove(
    'auth-pending',
    'auth-login',
    'profile-choice-auth',
    'workspace-view-active',
    'stats-view-active',
    'admin-panel-view-active',
    'settings-view-active'
  );
  document.body.classList.add('auth-ready', 'mandarin-home-active');
  document.body.classList.toggle('agency-shell-collapsed', localStorage.getItem('agency_shell_collapsed') === '1');
  syncAgencyProfilePowerToggle();
  if (agencyShellCollapse) agencyShellCollapse.textContent = document.body.classList.contains('agency-shell-collapsed') ? '›' : '‹';
  accessScreen?.classList.add('hidden');
  profileChoiceScreen?.classList.add('hidden');
  adminModal?.classList.add('hidden');
  addProfileModal?.classList.add('hidden');
  addUserModal?.classList.add('hidden');
  userSettingsModal?.classList.add('hidden');
  ladyConnectingScreen?.classList.add('hidden');
  adminPanelView?.classList.add('hidden');
  favoritesView?.classList.add('hidden');
  chatFavoritesView?.classList.add('hidden');
  workspaceView?.classList.add('hidden');
  myStatsView?.classList.add('hidden');
  const displayName = currentUser?.name || currentUser?.username || 'Account';
  if (agencyShellUserName) agencyShellUserName.textContent = displayName;
  if (agencyShellAvatar) agencyShellAvatar.textContent = displayName.slice(0, 1).toUpperCase();
  if (agencyShellUserRole) {
    agencyShellUserRole.textContent = currentUser?.role === 'director'
      ? 'Owner'
      : currentUser?.role === 'admin' ? 'Administrator'
        : currentUser?.role === 'mentor' ? 'Mentor'
          : 'Operator';
  }
  agencySalarySettingsBtn?.classList.toggle('hidden', currentUser?.role !== 'director');
  mandarinHomeScreen?.classList.remove('hidden');
  currentView = 'mandarinHome';
  localStorage.setItem('dream_crm_view', 'mandarinHome');
  renderSidebarProfileDock();
  syncAgencyNavLocks();
  syncAdminPanelRoute(false);
  setSettingsRoute(false);
  if (['salary', 'agency-admin'].includes(agencyAccountTab) && currentUser?.role !== 'director') {
    agencyAccountTab = 'ladies';
    localStorage.setItem(AGENCY_ACCOUNT_TAB_KEY, agencyAccountTab);
  }
  if (agencyAccountTab === 'translator') {
    agencyAccountTab = 'ladies';
    localStorage.setItem(AGENCY_ACCOUNT_TAB_KEY, agencyAccountTab);
  }
  syncAgencyAccountTabs();
  syncAgencyInboxAccess();
  syncAgencyFavoritesAccess();
  if (resetPanel) {
    localStorage.setItem(AGENCY_PANEL_KEY, 'home');
    activateAgencyPanel('home', { persist: false });
  } else {
    const restoredPanel = normalizeAgencyPanel(localStorage.getItem(AGENCY_PANEL_KEY) || 'home');
    activateAgencyPanel(restoredPanel, { persist: false });
  }
  if (isAgencyWebsite()) {
    loadAgencyAccountManager().catch(error => {
      if (agencyAccountStatus) agencyAccountStatus.textContent = error.message || 'Could not load profiles';
    });
  }
}

function agencyUserName(userId) {
  if (String(currentUser?.id || '') === String(userId || '')) return currentUser?.name || currentUser?.username || currentUser?.id || '';
  const user = agencyUsers.find(item => String(item.id || '') === String(userId || ''));
  return user ? (user.name || user.username || user.id) : '';
}

function agencyAdmins() {
  return agencyUsers.filter(user => user.role === 'admin' && user.active !== false);
}

function agencyAllAdmins() {
  return agencyUsers.filter(user => user.role === 'admin');
}

function agencyOperators() {
  return agencyUsers.filter(user => user.role === 'operator' && user.active !== false);
}

function agencyAllOperators() {
  return agencyUsers.filter(user => user.role === 'operator');
}

function agencyAllTeamUsers() {
  const roleRank = { admin: 0, operator: 1 };
  return agencyUsers
    .filter(user => ['admin', 'operator'].includes(user.role) && user.active !== false)
    .sort((a, b) =>
      (roleRank[a.role] ?? 9) - (roleRank[b.role] ?? 9) ||
      String(a.name || a.username || '').localeCompare(String(b.name || b.username || ''))
    );
}

function renderAgencyCombo({ field, value = '', options = [] }) {
  const selected = options.find(option => String(option.value) === String(value)) || options[0] || { value: '', label: '' };
  return `
    <div class="agency-combo" data-agency-combo data-combo-field="${escapeAttr(field)}" data-value="${escapeAttr(selected.value)}">
      <button class="agency-combo-trigger" type="button" data-agency-combo-trigger>
        <span>${escapeHtml(selected.label)}</span>
      </button>
      <div class="agency-combo-menu" role="listbox">
        ${options.map(option => `
          <button class="agency-combo-option ${String(option.value) === String(selected.value) ? 'active' : ''}" type="button" data-agency-combo-option data-value="${escapeAttr(option.value)}">
            ${escapeHtml(option.label)}
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

function renderAgencyLockedCombo(label) {
  return `
    <div class="agency-combo locked">
      <div class="agency-combo-trigger locked">
        <span>${escapeHtml(label)}</span>
      </div>
    </div>
  `;
}

function renderAgencyMaterialButton(profile) {
  const url = String(profile?.googleDriveUrl || '').trim();
  if (!url) {
    return '<button class="agency-material-btn is-empty" type="button" disabled>No link</button>';
  }
  return `
    <button class="agency-material-btn" type="button" data-agency-material-url="${escapeAttr(url)}" title="Open material">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7.5 12.8 4.8 18.2a1.2 1.2 0 0 0 1.08 1.74h12.24a1.2 1.2 0 0 0 1.08-1.74l-2.7-5.4" />
        <path d="M8.6 12.1 12 4.1l3.4 8" />
        <path d="M9.4 12.1h5.2" />
      </svg>
      <span>Open</span>
    </button>
  `;
}

function positionAgencyComboMenu(combo) {
  const trigger = combo?.querySelector('[data-agency-combo-trigger]');
  const menu = combo?.querySelector('.agency-combo-menu');
  if (!trigger || !menu) return;
  const rect = trigger.getBoundingClientRect();
  menu.style.setProperty('--agency-combo-left', `${Math.round(rect.left)}px`);
  menu.style.setProperty('--agency-combo-width', `${Math.round(rect.width)}px`);
  menu.style.setProperty('--agency-combo-top', `${Math.round(rect.bottom + 6)}px`);
  requestAnimationFrame(() => {
    const menuHeight = menu.getBoundingClientRect().height || 0;
    const bottomTop = rect.bottom + 6;
    const top = bottomTop + menuHeight > window.innerHeight - 12
      ? Math.max(12, rect.top - menuHeight - 6)
      : bottomTop;
    menu.style.setProperty('--agency-combo-top', `${Math.round(top)}px`);
  });
}

function renderAgencyRoleSelect(user) {
  return renderAgencyLockedCombo(user.role === 'admin' ? 'Administrator' : 'Operator');
}

function renderAgencyAdministratorSelect(user) {
  if (currentUser?.role === 'admin') {
    const label = String(user.managerId || '') === String(currentUser.id || '')
      ? (currentUser.name || currentUser.username || 'Administrator')
      : 'No administrator';
    return renderAgencyLockedCombo(label);
  }
  const admins = agencyAdmins();
  const selectedManagerId = admins.some(admin => String(admin.id || '') === String(user.managerId || ''))
    ? String(user.managerId || '')
    : '';
  return renderAgencyCombo({
    field: 'operator-admin',
    value: selectedManagerId,
    options: [
      { value: '', label: 'No administrator' },
      ...admins.map(admin => ({ value: admin.id, label: admin.name || admin.username || admin.id }))
    ]
  });
}

function formatAgencyDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}

function renderAgencyUserRows(rows, emptyText) {
  const query = String(agencyAccountSearch?.value || '').trim().toLowerCase();
  const filtered = rows.filter(user => {
    const haystack = `${user.name || ''} ${user.username || ''} ${agencyUserName(user.managerId)} ${user.active === false ? 'inactive deleted' : 'active'}`.toLowerCase();
    return !query || haystack.includes(query);
  });
  if (agencyAccountCount) agencyAccountCount.textContent = String(filtered.length);
  agencyAccountRows.innerHTML = filtered.map((user, index) => `
    <tr data-user-id="${escapeAttr(user.id)}" class="${user.active === false ? 'agency-row-inactive' : ''}">
      <td class="agency-col-select"><input type="checkbox" aria-label="Select ${escapeAttr(user.name || user.username || user.id)}"></td>
      <td class="agency-col-number">${index + 1}</td>
      <td>
        <strong>${escapeHtml(user.name || user.username || user.id)}</strong>
        ${user.active === false ? '<span class="agency-user-inactive-mark">Inactive</span>' : ''}
      </td>
      <td>
        <span class="agency-profile-id">${escapeHtml(user.username || '-')}</span>
        ${user.active === false && user.deletedAt ? `<small class="agency-user-inactive-date">${escapeHtml(formatAgencyDate(user.deletedAt))}</small>` : ''}
      </td>
      <td>${renderAgencyRoleSelect(user)}</td>
      <td>${user.role === 'operator' ? renderAgencyAdministratorSelect(user) : '<span class="agency-muted-cell">Director</span>'}</td>
      <td>${escapeHtml(formatAgencyDate(user.createdAt))}</td>
      <td>
        <div class="agency-row-actions">
          <button class="agency-row-action edit" type="button" data-agency-user-action="edit">Edit</button>
          <button class="agency-row-action delete" type="button" data-agency-user-action="delete">Delete</button>
        </div>
      </td>
    </tr>
  `).join('') || `<tr><td colspan="8" class="agency-account-empty">${escapeHtml(emptyText)}</td></tr>`;
}

function renderAgencyAccountManager() {
  if (!agencyAccountRows) return;
  if ((currentUser?.role === 'operator' || isDesktopAdminSession()) && ['operators', 'salary', 'agency-admin'].includes(agencyAccountTab)) {
    agencyAccountTab = 'ladies';
    localStorage.setItem(AGENCY_ACCOUNT_TAB_KEY, agencyAccountTab);
    syncAgencyAccountTabs();
  }
  if (['salary', 'agency-admin'].includes(agencyAccountTab) && currentUser?.role !== 'director') {
    agencyAccountTab = 'ladies';
    localStorage.setItem(AGENCY_ACCOUNT_TAB_KEY, agencyAccountTab);
    syncAgencyAccountTabs();
  }
  const query = String(agencyAccountSearch?.value || '').trim().toLowerCase();
  const salaryTab = agencyAccountTab === 'salary';
  const translatorTab = agencyAccountTab === 'translator';
  const agencyAdminTab = agencyAccountTab === 'agency-admin';
  const userTab = agencyAccountTab === 'operators';
  const accountSection = agencyAccountRows.closest('.agency-account-manager');
  accountSection?.classList.toggle('is-salary-mode', salaryTab);
  accountSection?.classList.toggle('is-translator-mode', translatorTab);
  accountSection?.classList.toggle('is-agency-admin-mode', agencyAdminTab && currentUser?.role === 'director');
  agencyAccountTableWrap?.classList.toggle('hidden', salaryTab || translatorTab || agencyAdminTab);
  agencySalaryPanel?.classList.toggle('hidden', !salaryTab);
  agencyTranslatorPanel?.classList.toggle('hidden', !translatorTab);
  agencyAdminPanel?.classList.toggle('hidden', !agencyAdminTab || currentUser?.role !== 'director');
  if (agencyAddProfileBtn) {
    agencyAddProfileBtn.classList.toggle('hidden', salaryTab || translatorTab || agencyAdminTab || currentUser?.role === 'operator' || isDesktopAdminSession());
    agencyAddProfileBtn.textContent = userTab ? '+ Add User' : '+ Add Profile';
  }
  agencySalarySettingsBtn?.classList.toggle('hidden', currentUser?.role !== 'director');
  agencyAdminSettingsBtn?.classList.toggle('hidden', currentUser?.role !== 'director');
  agencyTranslatorSettingsBtn?.classList.toggle('hidden', !['admin', 'operator'].includes(currentUser?.role));
  if (translatorTab && !['admin', 'operator'].includes(currentUser?.role)) {
    agencyAccountTab = 'ladies';
    localStorage.setItem(AGENCY_ACCOUNT_TAB_KEY, agencyAccountTab);
    syncAgencyAccountTabs();
    renderAgencyAccountManager();
    return;
  }
  if (salaryTab) {
    if (agencyAccountCount) agencyAccountCount.textContent = '-';
    if (agencyAccountStatus) agencyAccountStatus.textContent = '';
    loadSalaryRates();
    return;
  }
  if (agencyAdminTab) {
    if (currentUser?.role !== 'director') {
      agencyAccountTab = 'ladies';
      localStorage.setItem(AGENCY_ACCOUNT_TAB_KEY, agencyAccountTab);
      syncAgencyAccountTabs();
      renderAgencyAccountManager();
      return;
    }
    if (agencyAccountCount) agencyAccountCount.textContent = '-';
    if (agencyAccountStatus) agencyAccountStatus.textContent = '';
    loadAgencyAccessSettings();
    return;
  }
  if (translatorTab) {
    if (agencyAccountCount) agencyAccountCount.textContent = '-';
    if (agencyAccountStatus) agencyAccountStatus.textContent = '';
    loadAgencyTranslatorSettings();
    return;
  }
  const table = agencyAccountRows.closest('table');
  table?.classList.toggle('agency-operators-table', userTab);
  const headerRow = agencyAccountRows.closest('table')?.querySelector('thead tr');
  if (headerRow) {
    headerRow.innerHTML = userTab
      ? `
        <th class="agency-col-select"><span aria-hidden="true"></span></th>
        <th class="agency-col-number">№</th>
        <th>Name</th>
        <th>Login</th>
        <th>Role</th>
        <th>Administrator</th>
        <th>Creation Date</th>
        <th>Actions</th>
      `
      : `
        <th class="agency-col-select"><span aria-hidden="true"></span></th>
        <th class="agency-col-number">№</th>
        <th>Name</th>
        <th>Profile ID</th>
        <th class="agency-col-material">Material</th>
        <th>Used by</th>
        <th>Administrator</th>
        <th>Creation Date</th>
        <th>Actions</th>
      `;
  }
  if (agencyAccountTab === 'operators') {
    renderAgencyUserRows(agencyAllTeamUsers(), 'No users yet.');
    return;
  }
  const adminSelfMode = currentUser?.role === 'admin';
  const desktopAdminMode = isDesktopAdminSession();
  const operatorSelfMode = currentUser?.role === 'operator';
  const canManageProfiles = ['director', 'admin'].includes(currentUser?.role) && !desktopAdminMode;
  const admins = agencyAdmins();
  const operators = agencyOperators();
  const rows = agencyProfiles.filter(profile => {
    const haystack = `${profile.name || ''} ${profile.id || ''} ${agencyUserName(profile.assignedUserId)} ${agencyUserName(profile.ownerAdminId)}`.toLowerCase();
    return !query || haystack.includes(query);
  });
  if (agencyAccountCount) agencyAccountCount.textContent = String(rows.length);
  agencyAccountRows.innerHTML = rows.map((profile, index) => `
    <tr data-profile-id="${escapeAttr(profile.id)}">
      <td class="agency-col-select">
        ${operatorSelfMode || desktopAdminMode ? '<span aria-hidden="true"></span>' : `<input type="checkbox" aria-label="Select ${escapeAttr(profile.name || profile.id)}">`}
      </td>
      <td class="agency-col-number">${index + 1}</td>
      <td><strong>${escapeHtml(profile.name || `Profile ${profile.id}`)}</strong></td>
      <td><span class="agency-profile-id">${escapeHtml(profile.id)}</span></td>
      <td class="agency-col-material">${renderAgencyMaterialButton(profile)}</td>
      <td>
        ${operatorSelfMode
          ? renderAgencyLockedCombo(currentUser?.name || currentUser?.username || 'Me')
          : desktopAdminMode
          ? renderAgencyLockedCombo(agencyUserName(profile.assignedUserId) || 'None')
          : adminSelfMode
          ? renderAgencyCombo({
              field: 'profile-operator',
              value: profile.assignedUserId || '',
              options: [
                { value: '', label: 'None' },
                { value: currentUser.id, label: 'Me' },
                ...operators.map(user => ({ value: user.id, label: user.name || user.username || user.id }))
              ]
            })
          : renderAgencyCombo({
              field: 'profile-operator',
              value: profile.assignedUserId || '',
              options: [
                { value: '', label: 'None' },
                ...admins.map(user => ({ value: user.id, label: user.name || user.username || user.id })),
                ...operators.map(user => ({ value: user.id, label: user.name || user.username || user.id }))
              ]
            })} 
      </td>
      <td>
        ${operatorSelfMode
          ? renderAgencyLockedCombo(agencyUserName(profile.ownerAdminId || currentUser?.managerId) || 'Administrator')
          : desktopAdminMode
          ? renderAgencyLockedCombo(currentUser?.name || currentUser?.username || 'Administrator')
          : adminSelfMode
          ? renderAgencyLockedCombo(currentUser?.name || currentUser?.username || 'Administrator')
          : renderAgencyCombo({
              field: 'profile-admin',
              value: profile.ownerAdminId || '',
              options: [
                { value: '', label: 'No administrator' },
                ...admins.map(user => ({ value: user.id, label: user.name || user.username || user.id }))
              ]
            })}
      </td>
      <td>${escapeHtml(formatAgencyDate(profile.createdAt))}</td>
      <td>
        ${canManageProfiles
          ? `<div class="agency-row-actions">
              <button class="agency-row-action edit" type="button" data-agency-profile-action="edit">Edit</button>
              <button class="agency-row-action delete" type="button" data-agency-profile-action="delete">Delete</button>
            </div>`
          : '<span class="agency-muted-cell">Locked</span>'}
      </td>
    </tr>
  `).join('') || '<tr><td colspan="9" class="agency-account-empty">No profiles yet.</td></tr>';
}

const AGENCY_DASHBOARD_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function syncAgencyYearCombos() {
  [agencyDashboardYear, agencyDashboardCalendarYear].forEach(select => {
    if (select?._agencyYearSync) select._agencyYearSync();
  });
}

function enhanceAgencyYearSelect(select) {
  if (!select || select.dataset.agencyYearEnhanced === '1') return;
  select.dataset.agencyYearEnhanced = '1';
  select.classList.add('agency-native-year-hidden');
  const combo = document.createElement('div');
  combo.className = 'agency-year-combo';
  combo.innerHTML = `
    <button class="agency-year-combo-trigger" type="button" aria-haspopup="listbox" aria-expanded="false">
      <span></span>
      <i aria-hidden="true">⌄</i>
    </button>
    <div class="agency-year-combo-menu hidden" role="listbox"></div>
  `;
  select.insertAdjacentElement('afterend', combo);
  const trigger = combo.querySelector('.agency-year-combo-trigger');
  const label = trigger?.querySelector('span');
  const menu = combo.querySelector('.agency-year-combo-menu');
  const render = () => {
    if (!menu || !label) return;
    label.textContent = select.value || '';
    menu.innerHTML = Array.from(select.options).map(option => `
      <button class="agency-year-combo-option ${option.value === select.value ? 'active' : ''}" type="button" role="option" aria-selected="${option.value === select.value ? 'true' : 'false'}" data-value="${escapeAttr(option.value)}">${escapeHtml(option.textContent || option.value)}</button>
    `).join('');
  };
  select._agencyYearSync = render;
  render();
  trigger?.addEventListener('click', event => {
    event.stopPropagation();
    const open = menu?.classList.contains('hidden');
    document.querySelectorAll('.agency-year-combo-menu').forEach(item => item.classList.add('hidden'));
    document.querySelectorAll('.agency-year-combo-trigger').forEach(item => item.setAttribute('aria-expanded', 'false'));
    menu?.classList.toggle('hidden', !open);
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  menu?.addEventListener('click', event => {
    const option = event.target.closest('.agency-year-combo-option');
    if (!option) return;
    event.stopPropagation();
    select.value = option.dataset.value || select.value;
    render();
    menu.classList.add('hidden');
    trigger?.setAttribute('aria-expanded', 'false');
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function setupAgencyDashboardControls() {
  const fillYearSelect = select => {
    if (!select || select.options.length) return;
    const currentYear = Number(dreamDateInputValue().slice(0, 4));
    for (let year = currentYear + 1; year >= currentYear - 5; year -= 1) {
      const option = document.createElement('option');
      option.value = String(year);
      option.textContent = String(year);
      select.appendChild(option);
    }
    select.value = String(currentYear);
  };
  const fillMonths = container => {
    if (!container || container.children.length) return;
    container.innerHTML = AGENCY_DASHBOARD_MONTHS.map((label, index) => `
      <button class="agency-dashboard-month ${index + 1 === agencyDashboardMonth ? 'active' : ''}" type="button" data-month="${index + 1}" role="tab" aria-selected="${index + 1 === agencyDashboardMonth ? 'true' : 'false'}">${label}</button>
    `).join('');
  };
  fillYearSelect(agencyDashboardYear);
  fillYearSelect(agencyDashboardCalendarYear);
  if (agencyDashboardCalendarYear && agencyDashboardYear && (!agencyDashboardCalendar || agencyDashboardCalendar.classList.contains('hidden'))) {
    agencyDashboardCalendarYear.value = agencyDashboardYear.value;
  }
  enhanceAgencyYearSelect(agencyDashboardYear);
  enhanceAgencyYearSelect(agencyDashboardCalendarYear);
  syncAgencyYearCombos();
  fillMonths(agencyDashboardMonths);
  fillMonths(agencyDashboardCalendarMonths);
}

function setAgencyDashboardMonth(month) {
  agencyDashboardMonth = Math.min(12, Math.max(1, Number(month) || agencyDashboardMonth || 1));
  agencyDashboardMonths?.querySelectorAll('.agency-dashboard-month').forEach(button => {
    const active = Number(button.dataset.month || 0) === agencyDashboardMonth;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  agencyDashboardCalendarMonths?.querySelectorAll('.agency-dashboard-month').forEach(button => {
    const active = Number(button.dataset.month || 0) === agencyDashboardMonth;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  });
}

function agencyDashboardYearValue() {
  if (agencyDashboardCalendar && !agencyDashboardCalendar.classList.contains('hidden') && agencyDashboardCalendarYear?.value) {
    return Number(agencyDashboardCalendarYear.value);
  }
  return Number(agencyDashboardYear?.value || dreamDateInputValue().slice(0, 4));
}

function agencyDashboardProfileDayData(dateValue) {
  const day = (agencyDashboardCalendarData?.dailyProfiles || []).find(item => item.date === dateValue);
  return day || { date: dateValue, total: 0, profiles: [] };
}

function agencyDashboardMonthRange() {
  const year = agencyDashboardYearValue();
  const month = Number(agencyDashboardMonth || 1);
  const last = new Date(year, month, 0).getDate();
  return {
    from: `${year}-${String(month).padStart(2, '0')}-01`,
    to: `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`
  };
}

function isAgencyDashboardTotalVisible() {
  return document.body.classList.contains('agency-dashboard-active') && agencyDashboardMode === 'total';
}

function stopAgencyDashboardAutoBalance() {
  if (agencyDashboardAutoBalanceTimer) clearTimeout(agencyDashboardAutoBalanceTimer);
  agencyDashboardAutoBalanceTimer = null;
}

function scheduleAgencyDashboardAutoBalance(delay = 2500) {
  stopAgencyDashboardAutoBalance();
  if (!isAgencyDashboardTotalVisible()) return;
  agencyDashboardAutoBalanceTimer = setTimeout(() => {
    agencyDashboardAutoBalanceTimer = null;
    if (isAgencyDashboardTotalVisible()) startAgencyDashboardBalanceRefresh({ auto: true });
  }, delay);
}

function setupAgencyDashboardBonusDates() {
  if (agencyDashboardBonusDateInitialized) return;
  const today = todayDateInputValue();
  if (agencyDashboardBonusFrom && !agencyDashboardBonusFrom.value) agencyDashboardBonusFrom.value = today;
  if (agencyDashboardBonusTo && !agencyDashboardBonusTo.value) agencyDashboardBonusTo.value = today;
  agencyDashboardBonusDateInitialized = true;
}

function setupAgencyDashboardBonusProfiles(rows = []) {
  if (!agencyDashboardBonusProfile) return;
  const current = String(agencyDashboardBonusProfile.value || '');
  const byId = new Map();
  const dashboardProfiles = isAgencyDesktopApp() && ['admin', 'operator'].includes(currentUser?.role)
    ? availableProfiles
    : (agencyProfiles?.length ? agencyProfiles : availableProfiles);
  for (const profile of dashboardProfiles || []) {
    const id = String(profile.id || '').trim();
    if (id) byId.set(id, profile.name || id);
  }
  for (const row of rows || []) {
    const id = String(row.profileId || '').trim();
    if (!id || byId.has(id)) continue;
    if (isAgencyDesktopApp() && ['admin', 'operator'].includes(currentUser?.role)) continue;
    byId.set(id, row.profileName || id);
  }
  const options = ['<option value="">All profiles</option>']
    .concat([...byId.entries()]
      .sort((a, b) => String(a[1]).localeCompare(String(b[1])))
      .map(([id, name]) => `<option value="${escapeAttr(id)}">${escapeHtml(name)}${name === id ? '' : ` (${escapeHtml(id)})`}</option>`));
  agencyDashboardBonusProfile.innerHTML = options.join('');
  if (current && byId.has(current)) agencyDashboardBonusProfile.value = current;
}

function agencyDashboardBonusRange() {
  setupAgencyDashboardBonusDates();
  let from = String(agencyDashboardBonusFrom?.value || todayDateInputValue()).slice(0, 10);
  let to = String(agencyDashboardBonusTo?.value || from).slice(0, 10);
  if (from && to && from > to) [from, to] = [to, from];
  return { from, to };
}

function setAgencyDashboardBonusLoading(loading) {
  agencyDashboardBonusLoader?.classList.toggle('hidden', !loading);
  agencyDashboardBonusTotal?.classList.toggle('loading', loading);
  if (agencyDashboardBonusApplyBtn) agencyDashboardBonusApplyBtn.disabled = loading;
}

function setAgencyDashboardMode(mode, options = {}) {
  agencyDashboardMode = mode === 'bonuses' ? 'bonuses' : 'total';
  if (options.persist !== false) localStorage.setItem(AGENCY_DASHBOARD_MODE_KEY, agencyDashboardMode);
  const isBonuses = agencyDashboardMode === 'bonuses';
  if (isBonuses) setupAgencyDashboardBonusDates();
  if (isBonuses) setupAgencyDashboardBonusProfiles(agencyDashboardBonusesData);
  agencyDashboardStartBalanceBtn?.classList.toggle('primary', !isBonuses);
  agencyDashboardBonusesBtn?.classList.toggle('primary', isBonuses);
  agencyDashboardList?.classList.toggle('hidden', isBonuses);
  agencyDashboardSummary?.classList.toggle('hidden', isBonuses || !agencyDashboardRowsData.length);
  agencyDashboardBonuses?.classList.toggle('hidden', !isBonuses);
  agencyDashboardCalendar?.classList.add('hidden');
  document.body.classList.remove('agency-dashboard-calendar-open');
  if (isBonuses) stopAgencyDashboardAutoBalance();
  if (options.silent) return;
  if (isBonuses) loadAgencyDashboardBonuses();
  else loadAgencyDashboardOperators();
}

function renderAgencyDashboardRows() {
  if (!agencyDashboardRows) return;
  const query = String(agencyDashboardSearch?.value || '').trim().toLowerCase();
  const roleLabel = role => role === 'admin' ? 'ADMINISTRATOR' : role === 'director' ? 'OWNER' : 'OPERATOR';
  const scopedRows = isAgencyDesktopApp() && ['admin', 'operator'].includes(currentUser?.role)
    ? agencyDashboardRowsData.filter(row =>
        String(row.operatorId || '') === String(currentUser?.id || '') ||
        String(row.login || '').toLowerCase() === String(currentUser?.username || '').toLowerCase()
      )
    : agencyDashboardRowsData;
  const rows = scopedRows.filter(row => {
    const haystack = `${row.name || ''} ${row.login || ''} ${row.role || ''}`.toLowerCase();
    return !query || haystack.includes(query);
  });
  if (agencyDashboardCount) agencyDashboardCount.textContent = String(rows.length);
  const totalIncome = rows.reduce((sum, row) => sum + Number(row.income || 0), 0);
  const totalGifts = rows.reduce((sum, row) => sum + Number(row.gifts || 0), 0);
  const totalSalary = rows.reduce((sum, row) => sum + Number(row.salary || 0), 0);
  const bodyRows = rows.map((row, index) => `
    <tr data-operator-id="${escapeAttr(row.operatorId || '')}" class="${row.active === false ? 'agency-dashboard-row-inactive' : ''}">
      <td>${index + 1}</td>
      <td>
        <span class="agency-dashboard-badge">${escapeHtml(roleLabel(row.role || 'operator'))}</span>
        ${row.active === false ? '<span class="agency-dashboard-inactive-mark">Inactive</span>' : ''}
      </td>
      <td><span class="agency-dashboard-name">${escapeHtml(row.name || row.operatorId || '')}</span></td>
      <td>
        ${escapeHtml(row.login || '-')}
        ${row.active === false && row.deletedAt ? `<small class="agency-dashboard-inactive-date">${escapeHtml(formatAgencyDate(row.deletedAt))}</small>` : ''}
      </td>
      <td>${escapeHtml(String(row.profileCount || 0))}</td>
      <td><b>${money(row.income || 0)}</b></td>
      <td><b class="agency-dashboard-gifts-amount">${money(row.gifts || 0)}</b></td>
      <td><b>${percentText(row.percent || 0)}</b></td>
      <td><b>${money(row.salary || 0)}</b></td>
    </tr>
  `).join('');
  if (agencyDashboardSummaryIncome) agencyDashboardSummaryIncome.textContent = money(totalIncome);
  if (agencyDashboardSummaryGifts) agencyDashboardSummaryGifts.textContent = money(totalGifts);
  if (agencyDashboardSummarySalary) agencyDashboardSummarySalary.textContent = money(totalSalary);
  agencyDashboardSummary?.classList.toggle('hidden', !rows.length);
  agencyDashboardRows.innerHTML = rows.length
    ? bodyRows
    : '<tr><td colspan="9" class="agency-dashboard-empty">No operators for this period</td></tr>';
}

function renderAgencyDashboardBonuses() {
  if (!agencyDashboardBonusesRows) return;
  const query = String(agencyDashboardSearch?.value || '').trim().toLowerCase();
  const scopedRows = isAgencyDesktopApp() && ['admin', 'operator'].includes(currentUser?.role)
    ? agencyDashboardBonusesData.filter(row =>
        String(row.operatorId || '') === String(currentUser?.id || '') ||
        String(row.operatorLogin || '').toLowerCase() === String(currentUser?.username || '').toLowerCase()
      )
    : agencyDashboardBonusesData;
  const rows = scopedRows.filter(row => {
    const haystack = `${row.type || ''} ${row.by || ''} ${row.to || ''} ${row.profileName || ''} ${row.profileId || ''} ${row.operatorName || ''} ${row.operatorLogin || ''}`.toLowerCase();
    return !query || haystack.includes(query);
  });
  const visibleTotal = rows.reduce((sum, row) => sum + (row.gift ? 0 : Number(row.amount || 0)), 0);
  const visibleGifts = rows.reduce((sum, row) => sum + (row.gift ? Number(row.amount || 0) : 0), 0);
  if (agencyDashboardBonusTotal) agencyDashboardBonusTotal.textContent = money(visibleTotal);
  if (agencyDashboardBonusGifts) agencyDashboardBonusGifts.textContent = money(visibleGifts);
  if (agencyDashboardCount) agencyDashboardCount.textContent = String(rows.length);
  agencyDashboardBonusesRows.innerHTML = rows.map((row, index) => `
    <tr class="${row.gift ? 'agency-dashboard-gift-row' : ''}">
      <td>${index + 1}</td>
      <td>${escapeHtml(row.type || '-')}${row.gift ? '<span class="agency-dashboard-gift-chip">Gift</span>' : ''}</td>
      <td>${escapeHtml(row.by || '-')}</td>
      <td>
        <span class="agency-dashboard-name">${escapeHtml(row.profileName || row.profileId || '-')}</span>
        ${row.profileId ? `<small class="agency-dashboard-inactive-date">${escapeHtml(row.profileId)}</small>` : ''}
      </td>
      <td>
        <span class="agency-dashboard-name">${escapeHtml(row.operatorName || row.operatorLogin || '-')}</span>
        ${row.operatorLogin ? `<small class="agency-dashboard-inactive-date">${escapeHtml(row.operatorLogin)}</small>` : ''}
      </td>
      <td>${escapeHtml(row.date || '-')}</td>
      <td><b>${money(row.amount || 0)}</b></td>
    </tr>
  `).join('') || '<tr><td colspan="7" class="agency-dashboard-empty">No bonuses for this period</td></tr>';
}

async function loadAgencyDashboardOperators(options = {}) {
  if (!agencyDashboardRows) return;
  agencyDashboardMode = 'total';
  setupAgencyDashboardControls();
  document.body.classList.remove('agency-dashboard-calendar-open');
  agencyDashboardList?.classList.remove('hidden');
  agencyDashboardBonuses?.classList.add('hidden');
  agencyDashboardCalendar?.classList.add('hidden');
  agencyDashboardStartBalanceBtn?.classList.add('primary');
  agencyDashboardBonusesBtn?.classList.remove('primary');
  if (agencyDashboardStatus) agencyDashboardStatus.textContent = 'Loading dashboard...';
  try {
    const params = new URLSearchParams({
      year: String(agencyDashboardYearValue()),
      month: String(agencyDashboardMonth)
    });
    const response = await fetch(`/api/agencyos/dashboard/operators?${params.toString()}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not load dashboard');
    agencyDashboardRowsData = Array.isArray(result.rows) ? result.rows : [];
    renderAgencyDashboardRows();
    if (agencyDashboardStatus) agencyDashboardStatus.textContent = '';
  } catch (error) {
    agencyDashboardRowsData = [];
    renderAgencyDashboardRows();
    if (agencyDashboardStatus) agencyDashboardStatus.textContent = error.message || 'Could not load dashboard';
  } finally {
    if (!options.skipAutoBalance) scheduleAgencyDashboardAutoBalance();
  }
}

async function loadAgencyDashboardBonuses() {
  if (!agencyDashboardBonusesRows) return;
  agencyDashboardMode = 'bonuses';
  setupAgencyDashboardControls();
  setupAgencyDashboardBonusDates();
  document.body.classList.remove('agency-dashboard-calendar-open');
  agencyDashboardList?.classList.add('hidden');
  agencyDashboardCalendar?.classList.add('hidden');
  agencyDashboardBonuses?.classList.remove('hidden');
  agencyDashboardStartBalanceBtn?.classList.remove('primary');
  agencyDashboardBonusesBtn?.classList.add('primary');
  agencyDashboardBonusesData = [];
  agencyDashboardBonusesTotal = 0;
  agencyDashboardBonusesGiftsTotal = 0;
  setupAgencyDashboardBonusProfiles();
  renderAgencyDashboardBonuses();
  setAgencyDashboardBonusLoading(true);
  if (agencyDashboardStatus) agencyDashboardStatus.textContent = '';
  try {
    const range = agencyDashboardBonusRange();
    const profileId = String(agencyDashboardBonusProfile?.value || '').trim();
    const params = new URLSearchParams({
      year: String(agencyDashboardYearValue()),
      month: String(agencyDashboardMonth),
      from: range.from,
      to: range.to
    });
    if (profileId) params.set('profileId', profileId);
    const response = await fetch(`/api/agencyos/dashboard/bonuses?${params.toString()}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not load bonuses');
    agencyDashboardBonusesData = Array.isArray(result.rows) ? result.rows : [];
    agencyDashboardBonusesTotal = Number(result.total || 0);
    agencyDashboardBonusesGiftsTotal = Number(result.giftsTotal || 0);
    setupAgencyDashboardBonusProfiles(result.profiles || agencyDashboardBonusesData);
    renderAgencyDashboardBonuses();
    if (agencyDashboardStatus) {
      const profileName = profileId
        ? (agencyDashboardBonusProfile?.selectedOptions?.[0]?.textContent || profileId)
        : '';
      const periodText = range.from === range.to
        ? `Bonuses for ${formatSalaryPeriodValue(range.from)}.`
        : `Bonuses from ${formatSalaryPeriodValue(range.from)} to ${formatSalaryPeriodValue(range.to)}.`;
      agencyDashboardStatus.textContent = profileName ? `${periodText} ${profileName}.` : periodText;
    }
  } catch (error) {
    agencyDashboardBonusesData = [];
    agencyDashboardBonusesTotal = 0;
    agencyDashboardBonusesGiftsTotal = 0;
    renderAgencyDashboardBonuses();
    if (agencyDashboardStatus) agencyDashboardStatus.textContent = error.message || 'Could not load bonuses';
  } finally {
    setAgencyDashboardBonusLoading(false);
  }
}

async function startAgencyDashboardBalanceRefresh(options = {}) {
  const trigger = agencyDashboardStartBalanceBtn;
  if (!trigger) return;
  if (agencyDashboardBalanceRefreshInFlight) return;
  agencyDashboardBalanceRefreshInFlight = true;
  stopAgencyDashboardAutoBalance();
  const isAuto = options.auto === true;
  const isManual = !isAuto;
  const oldText = trigger.textContent || 'Total Balance';
  if (isManual) trigger.disabled = true;
  if (agencyDashboardBonusesBtn) agencyDashboardBonusesBtn.disabled = true;
  if (isManual) trigger.textContent = 'Loading...';
  const targetDate = dreamDateInputValue();
  if (agencyDashboardStatus) {
    agencyDashboardStatus.textContent = isAuto
      ? 'Syncing actual balance...'
      : `Refreshing balance for ${formatSalaryPeriodValue(targetDate)}...`;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 65000);
  try {
    const response = await fetch('/api/agencyos/dashboard/operators/month-actual/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        year: agencyDashboardYearValue(),
        month: agencyDashboardMonth,
        date: targetDate,
        auto: isAuto,
        force: isManual,
        limit: isAuto ? 5 : 6,
        staleMinutes: 15
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not refresh operator balances');
    await loadAgencyDashboardOperators({ skipAutoBalance: true });
    if (agencyDashboardCalendarData?.operator?.operatorId) {
      await openAgencyDashboardOperator(agencyDashboardCalendarData.operator.operatorId);
    }
    if (agencyDashboardStatus) {
      const refreshedDays = Array.isArray(result.refreshed) ? result.refreshed : [];
      const skippedDays = Array.isArray(result.skipped) ? result.skipped : [];
      const refreshed = refreshedDays.length;
      const remaining = Number(result.remainingMissing || 0);
      agencyDashboardStatus.textContent = refreshed
        ? `Balance synced: ${refreshed} day(s) loaded${remaining ? `, ${remaining} missing left` : ''}.`
        : `Balance already actual for ${formatSalaryPeriodValue(skippedDays[0] || targetDate)}.`;
    }
    const remaining = Number(result.remainingMissing || 0);
    if (isAuto && remaining > 0 && isAgencyDashboardTotalVisible()) {
      scheduleAgencyDashboardAutoBalance(2500);
    } else if (isAgencyDashboardTotalVisible()) {
      scheduleAgencyDashboardAutoBalance(15 * 60 * 1000);
    }
  } catch (error) {
    if (agencyDashboardStatus) {
      agencyDashboardStatus.textContent = error?.name === 'AbortError'
        ? 'Dream did not answer in time. Try again later.'
        : (error.message || 'Could not refresh balances');
    }
    if (isAgencyDashboardTotalVisible()) scheduleAgencyDashboardAutoBalance(60 * 1000);
  } finally {
    clearTimeout(timeout);
    if (isManual) trigger.disabled = false;
    if (agencyDashboardBonusesBtn) agencyDashboardBonusesBtn.disabled = false;
    if (isManual) trigger.textContent = oldText;
    agencyDashboardBalanceRefreshInFlight = false;
  }
}

function renderAgencyDashboardDay(dateValue) {
  agencyDashboardSelectedDate = dateValue;
  const day = agencyDashboardProfileDayData(dateValue);
  const dayProfileMap = new Map((day.profiles || []).map(profile => [String(profile.profileId || ''), profile]));
  const profiles = (agencyDashboardCalendarData?.totalsByProfile || [])
    .filter(profile => {
      const from = salaryPeriodDateKey(profile.periodFrom);
      const to = salaryPeriodDateKey(profile.periodTo);
      return from && to && dateValue >= from && dateValue <= to;
    })
    .map(profile => ({ ...profile, total: Number(dayProfileMap.get(String(profile.profileId || ''))?.total || 0) }))
    .sort((a, b) => Number(b.total || 0) - Number(a.total || 0) || String(a.profileName || '').localeCompare(String(b.profileName || '')));
  if (agencyDashboardDayTotal) agencyDashboardDayTotal.textContent = money(day.total || 0);
  if (agencyDashboardDayTitle) agencyDashboardDayTitle.textContent = formatSalaryPeriodValue(dateValue);
  if (agencyDashboardDayCount) agencyDashboardDayCount.textContent = `${profiles.length} profiles`;
  if (agencyDashboardProfiles) {
    agencyDashboardProfiles.innerHTML = profiles.map((profile, index) => {
      const label = profile.profileName || profile.profileId || 'Profile';
      const photo = String(profile.photoUrl || '').trim();
      return `
        <div class="agency-dashboard-profile-row">
          <span>${index + 1}</span>
          <span class="agency-dashboard-profile-photo">${photo ? `<img src="${escapeAttr(photo)}" alt="">` : `<i>${escapeHtml(String(label).slice(0, 1).toUpperCase())}</i>`}</span>
          <div><strong>${escapeHtml(label)}</strong><small>${escapeHtml(profile.profileId || '')}</small></div>
          <b>${money(profile.total || 0)}</b>
        </div>
      `;
    }).join('') || '<div class="agency-dashboard-empty">No profiles for this day</div>';
  }
  agencyDashboardCalendarGrid?.querySelectorAll('.agency-dashboard-day').forEach(button => {
    button.classList.toggle('selected', button.dataset.date === dateValue);
  });
}

function renderAgencyDashboardCalendar() {
  if (!agencyDashboardCalendarGrid || !agencyDashboardCalendarData) return;
  const year = Number(agencyDashboardCalendarData.year || agencyDashboardYearValue());
  const month = agencyDashboardMonth;
  const first = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const leading = (first.getDay() + 6) % 7;
  const cells = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(label => `<div class="agency-dashboard-weekday">${label}</div>`);
  for (let i = 0; i < leading; i += 1) cells.push('<div class="agency-dashboard-calendar-empty"></div>');
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateValue = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const data = agencyDashboardProfileDayData(dateValue);
    cells.push(`
      <button class="agency-dashboard-day ${data.total ? 'has-balance' : ''} ${agencyDashboardSelectedDate === dateValue ? 'selected' : ''}" type="button" data-date="${dateValue}">
        <span>${day}</span>
        <b>${data.total ? money(data.total) : ''}</b>
      </button>
    `);
  }
  agencyDashboardCalendarGrid.innerHTML = cells.join('');
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
  const today = dreamDateInputValue();
  const defaultDate = agencyDashboardSelectedDate?.startsWith(monthPrefix)
    ? agencyDashboardSelectedDate
    : (today.startsWith(monthPrefix) ? today : `${monthPrefix}-01`);
  renderAgencyDashboardDay(defaultDate);
}

async function openAgencyDashboardOperator(operatorId) {
  if (!operatorId) return;
  if (agencyDashboardStatus) agencyDashboardStatus.textContent = 'Loading calendar...';
  try {
    const params = new URLSearchParams({ year: String(agencyDashboardYearValue()) });
    const response = await fetch(`/api/agencyos/dashboard/operators/${encodeURIComponent(operatorId)}/calendar?${params.toString()}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not load operator calendar');
    agencyDashboardCalendarData = result;
    agencyDashboardSelectedDate = '';
    if (agencyDashboardCalendarName) agencyDashboardCalendarName.textContent = `${result.operator?.name || 'Operator'}${result.operator?.active === false ? ' · Inactive' : ''}`;
    if (agencyDashboardCalendarLogin) agencyDashboardCalendarLogin.textContent = result.operator?.login || '';
    if (agencyDashboardCalendarYear) agencyDashboardCalendarYear.value = String(result.year || agencyDashboardYearValue());
    if (agencyDashboardYear && agencyDashboardCalendarYear) agencyDashboardYear.value = agencyDashboardCalendarYear.value;
    syncAgencyYearCombos();
    agencyDashboardList?.classList.remove('hidden');
    agencyDashboardCalendar?.classList.remove('hidden');
    document.body.classList.add('agency-dashboard-calendar-open');
    renderAgencyDashboardCalendar();
    if (agencyDashboardStatus) agencyDashboardStatus.textContent = '';
  } catch (error) {
    if (agencyDashboardStatus) agencyDashboardStatus.textContent = error.message || 'Could not load operator calendar';
  }
}

function closeAgencyDashboardCalendar() {
  agencyDashboardCalendar?.classList.add('hidden');
  document.body.classList.remove('agency-dashboard-calendar-open');
  agencyDashboardList?.classList.remove('hidden');
}

async function loadAgencyAccountManager() {
  if (!agencyAccountRows) return;
  if (agencyAccountStatus) agencyAccountStatus.textContent = 'Loading...';
  const response = await fetch('/api/admin/users');
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not load profiles');
  agencyProfiles = result.profiles || [];
  managedProfiles = result.profiles || managedProfiles;
  agencyUsers = result.users || [];
  managedUsers = (result.users || []).filter(user => user.role !== 'director');
  renderAgencyAccountManager();
  if (agencyAccountStatus) agencyAccountStatus.textContent = '';
}

async function saveAgencyProfileAssignment(row) {
  const profileId = row?.dataset?.profileId || '';
  if (!profileId) return;
  const usedByValue = row.querySelector('[data-combo-field="profile-operator"]')?.dataset?.value || '';
  const adminSelfMode = currentUser?.role === 'admin';
  const operatorId = usedByValue;
  const adminId = adminSelfMode
    ? currentUser.id
    : (row.querySelector('[data-combo-field="profile-admin"]')?.dataset?.value || '');
  if (agencyAccountStatus) agencyAccountStatus.textContent = 'Saving...';
  const response = await fetch(`/api/agencyos/profiles/${encodeURIComponent(profileId)}/assignment`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operatorId, adminId })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not save assignment');
  agencyProfiles = result.profiles || agencyProfiles;
  agencyUsers = result.users || agencyUsers;
  await refreshSessionQuietly();
  await loadAgencyAccountManager();
  if (agencyAccountStatus) agencyAccountStatus.textContent = '';
}

function applySession(result, forceProfileChoice = false, options = {}) {
  currentUser = result.user;
  document.body.classList.remove('auth-pending', 'auth-login', 'profile-choice-auth');
  document.body.classList.add('auth-ready');
  syncRoleNavigation();
  sidebarUserName.textContent = currentUser.name || currentUser.username;
  sidebarUserAvatar.textContent = (currentUser.name || currentUser.username).slice(0, 1).toUpperCase();
  sidebarUserRole.textContent = currentUser.role === 'director'
    ? 'Owner'
    : currentUser.role === 'admin' ? 'Administrator'
      : currentUser.role === 'mentor' ? 'Mentor'
        : 'Operator';
  availableProfiles = result.profiles || [];
  if (!agencyProfiles.length || isAgencyDesktopApp()) agencyProfiles = availableProfiles;
  profilesAdminList.innerHTML = currentUser.role === 'director'
    ? '<div class="admin-empty">Loading profiles...</div>'
    : availableProfiles.map(profile => `
      <div class="profile-admin-card" data-profile-id="${escapeHtml(profile.id)}">
        <span class="profile-admin-photo ${profile.photoUrl ? '' : 'no-photo'}">
          <img src="${escapeHtml(profile.photoUrl || '')}" alt="">
        </span>
        <span class="profile-admin-copy"><strong>${escapeHtml(profile.name)}</strong><small>ID ${escapeHtml(profile.id)}</small></span>
        <button class="profile-delete-button" type="button">Delete</button>
      </div>`).join('') || '<div class="admin-empty">No profiles yet.</div>';
  profileSelect.innerHTML = availableProfiles.length
    ? availableProfiles.map(profile => `<option value="${escapeHtml(profile.id)}">${escapeHtml(profile.name)} - ${escapeHtml(profile.id)}</option>`).join('')
    : '<option value="">No assigned profiles</option>';
  if (!availableProfiles.some(profile => profile.id === activeProfileId)) {
    activeProfileId = '';
    ladyConnected = false;
  }
  profileSelect.value = activeProfileId;
  const activeProfile = availableProfiles.find(profile => profile.id === activeProfileId);
  renderProfileSwitcher(activeProfile);
  renderSidebarProfileDock();
  localStorage.setItem('dream_crm_profile_id', activeProfileId);
  adminBtn.classList.toggle('hidden', currentUser.role === 'mentor');
  setupMyStatsDefaults();
  accessScreen.classList.add('hidden');
  showMandarinHome({ resetPanel: options.resetPanel !== false });
  return;
  if (currentUser.role === 'director') {
    activeProfileId = '';
    ladyConnected = false;
    localStorage.removeItem('dream_crm_profile_id');
    updateLadyConnectionButton();
    if (!forceProfileChoice && (settingsRouteRequested() || currentView === 'settings' || localStorage.getItem('dream_crm_view') === 'settings')) {
      profileChoiceScreen?.classList.add('hidden');
      currentView = 'settings';
      localStorage.setItem('dream_crm_view', 'settings');
      openAdmin({ restore: true }).catch(error => { adminStatus.textContent = error.message; });
      return;
    }
    profileChoiceScreen?.classList.add('hidden');
    openAdminPanelFromProfileChoice().catch(error => {
      if (adminPanelStatus) adminPanelStatus.textContent = error.message || 'Could not open admin panel';
    });
    return;
  }
  if (currentUser.role === 'mentor') {
    activeProfileId = '';
    ladyConnected = false;
    availableProfiles = [];
    localStorage.removeItem('dream_crm_profile_id');
    updateLadyConnectionButton();
    if (!forceProfileChoice && currentView === 'adminPanel' && mentorSelectedAdminPanelId) {
      profileChoiceScreen.classList.add('hidden');
      switchView('adminPanel').catch(error => {
        if (adminPanelStatus) adminPanelStatus.textContent = error.message || 'Could not open admin panel';
      });
    } else {
      showProfileChoice();
    }
    return;
  }
  const restoreAdminPanelWithoutProfile = !forceProfileChoice
    && !activeProfileId
    && currentView === 'adminPanel'
    && hasAdminPanelAccess();
  if (restoreAdminPanelWithoutProfile) {
    profileChoiceScreen.classList.add('hidden');
  } else if (forceProfileChoice || !activeProfileId) {
    showProfileChoice();
  } else {
    profileChoiceScreen.classList.add('hidden');
  }
  if (hasAdminPanelAccess() && activeProfile &&
      (!activeProfile.photoUrl || activeProfile.name === `Profile ${activeProfile.id}`)) {
    hydrateProfile(activeProfile);
  }
  updateLadyConnectionButton();
  if (settingsRouteRequested()) {
    if (currentUser.role === 'operator') openOperatorSettings({ restore: true });
    else openAdmin({ restore: true }).catch(error => { adminStatus.textContent = error.message; });
  }
}

function showProfileChoice() {
  const agencyModal = Boolean(pendingAgencyProfileChoicePanel);
  if (agencyModal) {
    document.body.classList.remove(
      'auth-pending',
      'auth-login',
      'profile-choice-auth',
      'workspace-view-active',
      'stats-view-active',
      'admin-panel-view-active',
      'settings-view-active'
    );
    document.body.classList.add('auth-ready', 'mandarin-home-active', 'agency-profile-choice-modal');
    accessScreen?.classList.add('hidden');
    adminModal?.classList.add('hidden');
    ladyConnectingScreen?.classList.add('hidden');
    mandarinHomeScreen?.classList.remove('hidden');
    const title = profileChoiceScreen?.querySelector('h2');
    const hint = profileChoiceScreen?.querySelector('p');
    if (title) title.textContent = 'Choose a profile';
    if (hint) hint.textContent = 'Select a profile to start working.';
    profileChoiceList.innerHTML = availableProfiles.map(profile => `
    <button class="profile-choice-card-button" type="button" data-profile-id="${escapeHtml(profile.id)}">
      <span class="profile-choice-photo ${profile.photoUrl ? '' : 'no-photo'}"><img src="${escapeHtml(profile.photoUrl || '')}" alt=""></span>
      <span><strong>${escapeHtml(profile.name)}</strong><small>ID ${escapeHtml(profile.id)}</small></span>
      <span class="profile-choice-arrow">&rsaquo;</span>
    </button>`).join('') || '<div class="profile-choice-empty">No profiles are available for this account.</div>';
    profileChoiceSettings?.classList.add('hidden');
    profileChoiceAdminPanel?.classList.add('hidden');
    profileChoiceScreen?.classList.remove('hidden');
    return;
  }
  document.body.classList.remove('agency-profile-choice-modal');
  document.body.classList.remove(
    'auth-pending',
    'auth-login',
    'auth-ready',
    'mandarin-home-active',
    'agency-dashboard-active',
    'workspace-view-active',
    'stats-view-active',
    'admin-panel-view-active',
    'settings-view-active'
  );
  document.body.classList.add('profile-choice-auth');
  accessScreen?.classList.add('hidden');
  mandarinHomeScreen?.classList.add('hidden');
  adminModal?.classList.add('hidden');
  ladyConnectingScreen?.classList.add('hidden');
  const title = profileChoiceScreen?.querySelector('h2');
  const hint = profileChoiceScreen?.querySelector('p');
  if (title) title.textContent = currentUser?.role === 'director'
    ? 'Choose access'
    : currentUser?.role === 'mentor' ? 'Choose access' : 'Choose a profile';
  if (hint) hint.textContent = currentUser?.role === 'director'
    ? 'Open settings or view administrator panels.'
    : currentUser?.role === 'mentor'
      ? 'Open the administrator panel you want to review.'
      : 'Select the lady you want to work with in this browser.';
  profileChoiceList.innerHTML = currentUser?.role === 'director'
    ? '<div class="profile-choice-empty">Choose Settings or Admin Panel.</div>'
    : currentUser?.role === 'mentor'
      ? '<div class="profile-choice-empty">Press Admin Panel to choose an administrator.</div>'
      : availableProfiles.map(profile => `
    <button class="profile-choice-card-button" type="button" data-profile-id="${escapeHtml(profile.id)}">
      <span class="profile-choice-photo ${profile.photoUrl ? '' : 'no-photo'}"><img src="${escapeHtml(profile.photoUrl || '')}" alt=""></span>
      <span><strong>${escapeHtml(profile.name)}</strong><small>ID ${escapeHtml(profile.id)}</small></span>
      <span class="profile-choice-arrow">&rsaquo;</span>
    </button>`).join('') || '<div class="profile-choice-empty">No profiles have been assigned to this account. Contact your administrator.</div>';
  profileChoiceSettings?.classList.toggle('hidden', currentUser?.role === 'mentor');
  syncRoleNavigation();
  profileChoiceScreen.classList.remove('hidden');
}

function cancelAgencyProfileChoice() {
  if (!document.body.classList.contains('agency-profile-choice-modal') || profileChoiceConnecting) return;
  pendingAgencyProfileChoicePanel = '';
  document.body.classList.remove('agency-profile-choice-modal');
  profileChoiceScreen?.classList.add('hidden');
  profileChoiceList?.classList.remove('is-connecting');
  profileChoiceList?.querySelectorAll('.profile-choice-card-button').forEach(button => {
    button.disabled = false;
    button.classList.remove('is-connecting');
  });
}

async function showMentorAdminPanelChoice() {
  if (currentUser?.role !== 'mentor') return;
  document.body.classList.remove(
    'auth-pending',
    'auth-login',
    'auth-ready',
    'workspace-view-active',
    'stats-view-active',
    'admin-panel-view-active',
    'settings-view-active'
  );
  document.body.classList.add('profile-choice-auth');
  accessScreen?.classList.add('hidden');
  adminModal?.classList.add('hidden');
  ladyConnectingScreen?.classList.add('hidden');
  adminPanelView?.classList.add('hidden');
  if (adminPanelView) adminPanelView.style.display = 'none';
  const title = profileChoiceScreen?.querySelector('h2');
  const hint = profileChoiceScreen?.querySelector('p');
  if (title) title.textContent = 'Choose admin panel';
  if (hint) hint.textContent = 'Select which administrator table you want to view.';
  profileChoiceList.innerHTML = '<div class="profile-choice-empty">Loading administrators...</div>';
  profileChoiceSettings?.classList.add('hidden');
  profileChoiceAdminPanel?.classList.add('hidden');
  profileChoiceScreen?.classList.remove('hidden');
  const response = await fetch('/api/mentor/admin-panels');
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not load administrators');
  const admins = Array.isArray(result.admins) ? result.admins : [];
  profileChoiceList.innerHTML = admins.length
    ? admins.map(admin => `
      <button class="profile-choice-card-button" type="button" data-admin-panel-id="${escapeAttr(admin.id)}">
        <span class="profile-choice-photo no-photo">${escapeHtml((admin.name || admin.username || 'A').slice(0, 1).toUpperCase())}</span>
        <span><strong>${escapeHtml(admin.name || admin.username || 'Administrator')}</strong><small>${escapeHtml(admin.username || '')}</small></span>
        <span class="profile-choice-arrow">&rsaquo;</span>
      </button>
    `).join('')
    : '<div class="profile-choice-empty">No administrators available.</div>';
}

async function openAdminPanelFromProfileChoice() {
  if (!hasAdminPanelAccess()) return;
  if (currentUser?.role === 'mentor' && !mentorSelectedAdminPanelId) {
    await showMentorAdminPanelChoice();
    return;
  }
  currentView = 'adminPanel';
  localStorage.setItem('dream_crm_view', 'adminPanel');
  profileChoiceScreen?.classList.add('hidden');
  document.body.classList.remove('auth-pending', 'auth-login', 'profile-choice-auth');
  document.body.classList.add('auth-ready');
  updateLadyConnectionButton();
  await switchView('adminPanel');
}

async function closeAdminPanelWindow() {
  if (!currentUser) return;
  if (currentUser.role === 'mentor') {
    mentorSelectedAdminPanelId = '';
    localStorage.removeItem('dream_crm_mentor_admin_panel_id');
    adminPanelView?.classList.add('hidden');
    if (adminPanelView) adminPanelView.style.display = 'none';
    document.body.classList.remove('admin-panel-view-active');
    currentView = 'workspace';
    localStorage.setItem('dream_crm_view', 'workspace');
    syncAdminPanelRoute(false);
    await showMentorAdminPanelChoice();
    return;
  }
  if (!activeProfileId || !ladyConnected) {
    adminPanelView?.classList.add('hidden');
    if (adminPanelView) adminPanelView.style.display = 'none';
    document.body.classList.remove('admin-panel-view-active');
    currentView = 'workspace';
    localStorage.setItem('dream_crm_view', 'workspace');
    syncAdminPanelRoute(false);
    showProfileChoice();
    return;
  }
  await switchView('workspace');
}

async function selectWorkingProfile(profileId) {
  if (profileChoiceConnecting) return;
  const profile = availableProfiles.find(item => item.id === String(profileId));
  if (!profile) return;
  profileChoiceConnecting = true;
  profileChoiceList?.classList.add('is-connecting');
  profileChoiceList?.querySelectorAll('.profile-choice-card-button').forEach(button => {
    const isSelected = button.dataset.profileId === profile.id;
    button.disabled = true;
    button.classList.toggle('is-connecting', isSelected);
  });
  activeProfileId = profile.id;
  profileSelect.value = activeProfileId;
  localStorage.setItem('dream_crm_profile_id', activeProfileId);
  if (!pendingAgencyProfileChoicePanel) {
    currentView = 'workspace';
    localStorage.setItem('dream_crm_view', 'workspace');
  }
  document.body.classList.remove('profile-choice-auth', 'agency-profile-choice-modal');
  profileChoiceScreen.classList.add('hidden');
  renderProfileSwitcher(profile);
  try {
    await connectSelectedLady();
  } finally {
    profileChoiceConnecting = false;
    profileChoiceList?.classList.remove('is-connecting');
  }
}

async function connectSelectedLady() {
  const profile = availableProfiles.find(item => item.id === activeProfileId);
  if (!profile) return showProfileChoice();
  const agencyConnect = Boolean(pendingAgencyProfileChoicePanel);
  document.body.classList.toggle('agency-profile-connecting', agencyConnect);
  const photo = ladyConnectingPhoto?.querySelector('img');
  if (photo) photo.src = profile.photoUrl || '';
  ladyConnectingPhoto?.classList.toggle('no-photo', !profile.photoUrl);
  const title = ladyConnectingScreen?.querySelector('h2');
  if (title) title.textContent = agencyConnect ? 'Connecting' : 'Connecting my lady...';
  if (ladyConnectingName) ladyConnectingName.textContent = agencyConnect
    ? `${profile.name} · ID ${profile.id}`
    : `${profile.name} - ID ${profile.id}`;
  ladyConnectingScreen?.classList.remove('hidden');
  openLadyBtn.disabled = true;
  openLadyBtn.textContent = 'Connecting...';
  try {
    const result = await serverProfileRequest('server-connect', {
      body: { syncInbox: true, maxPages: 3 }
    });
    if (window.agencyElectron?.prepareDreamProfile) {
      window.agencyElectron.prepareDreamProfile(activeProfileId).catch(error => {
        console.warn('Could not prepare Electron Dream profile:', error);
      });
    }
    ladyConnected = true;
    localStorage.setItem(`dream_team_lady_connected_${activeProfileId}`, '1');
    showExtensionStatus({
      phase: 'server-connected',
      ready: true,
      message: result.imported
        ? `Server connected. Inbox updated: ${result.imported}`
        : 'Server connected'
    });
    updateLadyConnectionButton();
    const agencyReturnPanel = pendingAgencyProfileChoicePanel;
    pendingAgencyProfileChoicePanel = '';
    if (agencyReturnPanel) {
      showMandarinHome();
      activateAgencyPanel(agencyReturnPanel, {
        reloadInbox: agencyReturnPanel === 'inbox',
        reloadFavorites: agencyReturnPanel === 'favorites'
      });
      return true;
    }
    currentView = 'workspace';
    localStorage.setItem('dream_crm_view', 'workspace');
    reloadWorkspaceEmbed('connect');
    await loadMen(false);
    await switchView('workspace');
    return true;
  } catch (error) {
    const failedProfileId = activeProfileId;
    ladyConnected = false;
    localStorage.removeItem(`dream_team_lady_connected_${failedProfileId}`);
    activeProfileId = '';
    localStorage.removeItem('dream_crm_profile_id');
    if (profileSelect) profileSelect.value = '';
    renderProfileSwitcher(null);
    updateLadyConnectionButton();
    showProfileChoice();
    alert(error.message);
    return false;
  } finally {
    ladyConnectingScreen?.classList.add('hidden');
    document.body.classList.remove('agency-profile-connecting');
    openLadyBtn.disabled = false;
    updateLadyConnectionButton();
  }
}

function renderProfileSwitcher(activeProfile = availableProfiles.find(profile => profile.id === activeProfileId)) {
  const activeName = activeProfile?.name === `Profile ${activeProfile?.id}`
    ? 'Loading profile name...'
    : activeProfile?.name;
  activeProfileName.textContent = activeName || 'No assigned profiles';
  activeProfileIdLabel.textContent = activeProfile?.id ? `ID ${activeProfile.id}` : '';
  activeProfileAvatar.src = activeProfile?.photoUrl || '';
  activeProfileAvatarWrap.classList.toggle('no-photo', !activeProfile?.photoUrl);
  profileMenu.innerHTML = availableProfiles.map(profile => `
    <button class="profile-menu-item ${profile.id === activeProfileId ? 'active' : ''}" type="button" data-profile-id="${escapeHtml(profile.id)}">
      <span class="profile-menu-avatar ${profile.photoUrl ? '' : 'no-photo'}"><img src="${escapeHtml(profile.photoUrl || '')}" alt=""></span>
      <span><strong>${escapeHtml(profile.name === `Profile ${profile.id}` ? 'Loading profile name...' : profile.name)}</strong><small>ID ${escapeHtml(profile.id)}</small></span>
      ${profile.id === activeProfileId ? '<span class="profile-menu-check">&#10003;</span>' : ''}
    </button>`).join('');
  syncAgencyShellWorkingLady();
}

async function hydrateProfile(profile) {
  if (!profile || resolvingProfiles.has(profile.id)) return;
  resolvingProfiles.add(profile.id);
  try {
    const resolved = await extensionCommand('RESOLVE_PROFILE_NAME', { profileId: profile.id }, 20000);
    const response = await fetch('/api/admin/profiles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: profile.id,
        name: resolved.name,
        photoData: resolved.photoData || '',
        photoUrl: resolved.photoUrl || ''
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not update profile');
    Object.assign(profile, result.profile);
    profileSelect.options[profileSelect.selectedIndex].textContent = `${profile.name} - ${profile.id}`;
    renderProfileSwitcher(profile);
  } catch (error) {
    console.warn('Profile details could not be loaded:', error.message);
  } finally {
    resolvingProfiles.delete(profile.id);
  }
}

function renderAdminProfileChecklist(profiles, options = {}) {
  const {
    checkedIds = [],
    inputClass = '',
    emptyText = 'Add a profile first.',
    searchPlaceholder = 'Search profile by ID...'
  } = options;
  const checked = new Set(checkedIds.map(String));
  if (!profiles.length) return `<div class="profile-checklist-empty">${escapeHtml(emptyText)}</div>`;

  return `
    <div class="profile-checklist">
      <div class="profile-checklist-search-wrap">
        <span>рџ”Ќ</span>
        <input class="profile-checklist-search" type="text" inputmode="search" placeholder="${escapeAttr(searchPlaceholder)}">
      </div>
      <div class="profile-checklist-items">
        ${profiles.map(profile => {
          const id = String(profile.id || '');
          const search = `${profile.name || ''} ${id}`.toLowerCase();
          return `
            <label class="profile-check-item" data-profile-search="${escapeAttr(search)}">
              <input class="${escapeAttr(inputClass)}" type="checkbox" value="${escapeAttr(id)}" ${checked.has(id) ? 'checked' : ''}>
              <span class="profile-check-avatar ${profile.photoUrl ? '' : 'no-photo'}"><img src="${escapeAttr(profile.photoUrl || '')}" alt=""></span>
              <span class="profile-check-copy">
                <strong>${escapeHtml(profile.name || `Profile ${id}`)}</strong>
                <small>ID ${escapeHtml(id)}</small>
              </span>
            </label>
          `;
        }).join('')}
      </div>
      <div class="profile-checklist-empty hidden">No profiles found.</div>
    </div>
  `;
}

async function enterCrm() {
  accessStatus.textContent = setupMode ? 'Creating administrator...' : 'Signing in...';
  const loginUsername = usernameInput.value.trim();
  const loginPassword = passwordInput.value;
  try {
    const response = await fetch(setupMode ? '/api/auth/setup' : '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: loginUsername, password: loginPassword })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not sign in');
    saveRememberedAccessAfterLogin(loginUsername, loginPassword);
    if (!rememberAccessInput?.checked || setupMode) passwordInput.value = '';
    applySession(result, !(activeProfileId && ladyConnected), { resetPanel: true });
  } catch (error) {
    accessStatus.textContent = error.message;
  }
}

async function logout() {
  logoutBtn.disabled = true;
  logoutBtn.classList.add('is-working');
  try {
    await disconnectCurrentLady('logout');
  } catch (error) {
    alert(error.message || 'Could not log out profile');
  } finally {
    logoutBtn.disabled = false;
    logoutBtn.classList.remove('is-working');
    updateLadyConnectionButton();
  }
}

async function signOutCrmAccount() {
  if (profileChoiceLogout) profileChoiceLogout.disabled = true;
  try {
    if (activeProfileId) await serverProfileRequest('server-disconnect', { body: {} }).catch(() => {});
    await fetch('/api/auth/logout', { method: 'POST' });
    currentUser = null;
    availableProfiles = [];
    managedProfiles = [];
    managedUsers = [];
    activeProfileId = '';
    ladyConnected = false;
    allMen = [];
    chatFavoriteMen = [];
    localStorage.removeItem('dream_crm_profile_id');
    localStorage.removeItem('dream_crm_view');
    profileChoiceScreen?.classList.add('hidden');
    clearMainVirtualState();
    clearFavoritesVirtualState();
    clearChatVirtualState();
    if (tbody) tbody.innerHTML = '';
    if (chatFavoritesBody) chatFavoritesBody.innerHTML = '';
    showLogin(false);
  } finally {
    if (profileChoiceLogout) profileChoiceLogout.disabled = false;
  }
}

function returnDirectorToAccessChoice() {
  if (currentUser?.role !== 'director') {
    signOutCrmAccount();
    return;
  }
  signOutCrmAccount();
}

async function loadAdmin() {
  adminStatus.textContent = 'Loading...';
  adminModal?.classList.remove('operator-settings-mode');
  openAddProfileModalBtn?.classList.remove('hidden');
  if (openAddProfileModalBtn) openAddProfileModalBtn.hidden = false;
  teamMembersSection?.classList.remove('hidden');
  const ownerMode = currentUser?.role === 'director';
  adminClose?.classList.toggle('hidden', ownerMode);
  adminSignOutBtn?.classList.toggle('hidden', !ownerMode);
  if (adminClose) adminClose.textContent = ownerMode ? '' : "← Back to user's panel";
  operatorTranslatorSection?.classList.toggle('hidden', ownerMode);
  agencyAccessSection?.classList.toggle('hidden', !ownerMode);
  salaryRatesSection?.classList.add('hidden');
  if (!ownerMode) {
    renderOperatorTranslatorSettings();
  }
  if (profilesAdminList && !profilesAdminList.children.length) {
    profilesAdminList.innerHTML = '<div class="admin-empty">Loading profiles...</div>';
  }
  if (operatorsList && !operatorsList.children.length) {
    operatorsList.innerHTML = '<div class="admin-empty">Loading team members...</div>';
  }
  const response = await fetch('/api/admin/users');
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not load administration');
  managedProfiles = result.profiles || [];
  const teamMembers = (result.users || []).filter(user => user.role !== 'director' && user.active !== false);
  managedUsers = teamMembers;
  const administrators = teamMembers.filter(user => user.role === 'admin');
  const assignableUsers = currentUser.role === 'director'
    ? administrators.filter(user => user.active !== false)
    : [
        currentUser,
        ...teamMembers.filter(user => user.role === 'operator')
      ].filter(user => user && user.active !== false);
  const operatorDisplayName = user => {
    const name = user?.name || user?.username || '';
    return name;
  };
  const assignedOperatorForProfile = profile => {
    const selectedId = currentUser.role === 'director'
      ? profile.ownerAdminId
      : profile.assignedUserId;
    return assignableUsers.find(user => String(user.id || '') === String(selectedId || '')) || null;
  };
  const profileAssignmentMenu = profile => {
    const assigned = assignedOperatorForProfile(profile);
    const activeLabel = assigned ? operatorDisplayName(assigned) : (currentUser.role === 'director' ? 'No administrator' : 'No operator');
    return `
      <button class="profile-assignment-button" type="button" aria-expanded="false">
        <span>${escapeHtml(activeLabel)}</span>
        <span class="profile-assignment-chevron">⌄</span>
      </button>
      <div class="profile-assignment-menu hidden">
        <button class="profile-assignment-option ${assigned ? '' : 'active'}" type="button" data-operator-id="" data-operator-name="${currentUser.role === 'director' ? 'No administrator' : 'No operator'}">${currentUser.role === 'director' ? 'No administrator' : 'No operator'}</button>
        ${assignableUsers.map(user => `
          <button class="profile-assignment-option ${assigned?.id === user.id ? 'active' : ''}" type="button" data-operator-id="${escapeHtml(user.id)}" data-operator-name="${escapeAttr(operatorDisplayName(user))}">
            ${escapeHtml(operatorDisplayName(user))}
          </button>
        `).join('')}
      </div>`;
  };
  const operatorProfiles = user => currentUser.role === 'director' && user.role === 'admin'
    ? managedProfiles.filter(profile => String(profile.ownerAdminId || '') === String(user.id || ''))
    : managedProfiles.filter(profile => (user.profileIds || []).includes(profile.id));
  profilesAdminList.innerHTML = managedProfiles.map(profile => `
    <div class="profile-admin-card" data-profile-id="${escapeHtml(profile.id)}" data-profile-name="${escapeAttr(profile.name || profile.id)}">
      <div class="profile-admin-person">
        <span class="profile-admin-photo ${profile.photoUrl ? '' : 'no-photo'}"><img src="${escapeHtml(profile.photoUrl || '')}" alt=""></span>
        <span class="profile-admin-copy"><strong>${escapeHtml(profile.name)}</strong><small>ID ${escapeHtml(profile.id)}</small></span>
      </div>
      <div class="profile-admin-actions">
        <label class="profile-assignment-field" title="Assigned operator">
          <span>${currentUser.role === 'director' ? 'Administrator' : 'Operator'}</span>
          ${profileAssignmentMenu(profile)}
        </label>
        <button class="profile-sending-button" type="button">Settings</button>
        ${currentUser.role === 'director' ? '<button class="profile-delete-button" type="button">Remove</button>' : ''}
      </div>
    </div>`).join('') || '<div class="admin-empty">No profiles yet.</div>';
  profilesAdminList.querySelectorAll('.profile-admin-copy small').forEach(element => {
    element.textContent = element.textContent.match(/ID\s+\d+/i)?.[0] || element.textContent;
  });
  directorAssignmentsSection.classList.add('hidden');
  if (directorProfileChoices) directorProfileChoices.innerHTML = '';
  const adminRoleOption = newUserRole?.querySelector('option[value="admin"]');
  if (adminRoleOption) adminRoleOption.hidden = currentUser.role !== 'director';
  newUserRoleToggle?.querySelector('[data-role="admin"]')?.classList.toggle('hidden', currentUser.role !== 'director');
  newUserRoleToggle?.querySelector('[data-role="operator"]')?.classList.toggle('hidden', currentUser.role === 'director');
  newUserRole.value = currentUser.role === 'director' ? 'admin' : 'operator';
  setRoleToggle(newUserRoleToggle, newUserRole.value);
  operatorProfileChoices.innerHTML = renderAdminProfileChecklist(managedProfiles, {
    searchPlaceholder: 'Search profile by ID or name...'
  });
  operatorsList.innerHTML = teamMembers.map(user => {
    const profiles = operatorProfiles(user);
    const profileTitle = profiles.map(profile => `${profile.name} - ${profile.id}`).join('\n') || 'No active profiles';
    const displayName = user.name || user.username;
    return `
      <div class="operator-row operator-row-compact" data-user-id="${escapeHtml(user.id)}">
        <div class="operator-main">
          <span class="operator-avatar" aria-hidden="true">${escapeHtml(displayName.slice(0, 1).toUpperCase())}</span>
          <strong title="${escapeAttr(profileTitle)}">${escapeHtml(displayName)}</strong>
        </div>
        <button class="operator-settings-button" type="button">Settings</button>
      </div>
    `;
  }).join('') || '<div class="admin-empty">No team members yet.</div>';
  if (ownerMode) {
    await loadAgencyAccessSettings();
    await loadSalaryRates();
  }
  adminStatus.textContent = '';
}

async function openAdmin(options = {}) {
  if (!options.restore) setSettingsRoute(true);
  currentView = 'settings';
  localStorage.setItem('dream_crm_view', 'settings');
  document.body.classList.remove('profile-choice-auth');
  document.body.classList.add('auth-ready');
  profileChoiceScreen?.classList.add('hidden');
  adminModal.classList.remove('hidden');
  try { await loadAdmin(); } catch (error) { adminStatus.textContent = error.message; }
}

const DEFAULT_SALARY_RATE_ROWS = [
  { min: 0, max: 1499, percent: 40 },
  { min: 1500, max: 1999, percent: 45 },
  { min: 2000, max: 2999, percent: 47.5 },
  { min: 3000, max: '', percent: 50 }
];

function salaryRateRowHtml(item = {}) {
  return `
    <div class="salary-rate-row">
      <label><span>From $</span><input class="salary-rate-min" type="number" min="0" step="1" value="${escapeAttr(item.min ?? 0)}"></label>
      <label><span>To $</span><input class="salary-rate-max" type="number" min="0" step="1" placeholder="No limit" value="${escapeAttr(item.max ?? '')}"></label>
      <label><span>Percent</span><input class="salary-rate-percent" type="number" min="0" step="0.1" value="${escapeAttr(item.percent ?? 0)}"></label>
    </div>
  `;
}

function renderSalaryRateRows(list, rates = []) {
  if (!list) return;
  list.innerHTML = (rates.length ? rates : DEFAULT_SALARY_RATE_ROWS).map(salaryRateRowHtml).join('');
}

function appendSalaryRateRow(list) {
  list?.insertAdjacentHTML('beforeend', salaryRateRowHtml({ min: 0, max: '', percent: 0 }));
}

function renderSalaryRates(rates = [], feePercent = 5) {
  const visible = currentUser?.role === 'director';
  salaryRatesSection?.classList.toggle('hidden', !visible);
  agencySalarySettingsBtn?.classList.toggle('hidden', !visible);
  if (!visible) return;
  if (salaryFeePercentInput) salaryFeePercentInput.value = String(feePercent ?? 5);
  if (agencySalaryFeePercentInput) agencySalaryFeePercentInput.value = String(feePercent ?? 5);
  renderSalaryRateRows(salaryRatesList, rates);
  renderSalaryRateRows(agencySalaryRows, rates);
}

function readSalaryRatesFromForm(list = salaryRatesList) {
  const readNumber = element => Number(String(element?.value || '0').replace(',', '.'));
  return [...(list?.querySelectorAll('.salary-rate-row') || [])].map(row => ({
    min: readNumber(row.querySelector('.salary-rate-min')),
    max: row.querySelector('.salary-rate-max')?.value === '' ? null : readNumber(row.querySelector('.salary-rate-max')),
    percent: readNumber(row.querySelector('.salary-rate-percent'))
  }));
}

function readSalaryFeePercentFromForm(input = salaryFeePercentInput) {
  const value = Number(String(input?.value || '0').replace(',', '.'));
  return Number.isFinite(value) ? value : 0;
}

async function loadSalaryRates() {
  if (currentUser?.role !== 'director') {
    salaryRatesSection?.classList.add('hidden');
    agencySalarySettingsBtn?.classList.add('hidden');
    return;
  }
  agencySalarySettingsBtn?.classList.remove('hidden');
  try {
    const response = await fetch('/api/admin/salary-rates');
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not load salary grid');
    renderSalaryRates(result.rates || [], result.feePercent ?? 5);
    if (salaryRatesStatus) salaryRatesStatus.textContent = 'Set balance ranges and percent.';
    if (agencySalaryStatus) agencySalaryStatus.textContent = 'Set balance ranges and percent.';
  } catch (error) {
    salaryRatesSection?.classList.remove('hidden');
    if (salaryRatesStatus) salaryRatesStatus.textContent = error.message || 'Could not load salary grid';
    if (agencySalaryStatus) agencySalaryStatus.textContent = error.message || 'Could not load salary grid';
  }
}

async function persistSalaryRates({ saveButton, list, feeInput, statusElement }) {
  if (!saveButton || currentUser?.role !== 'director') return;
  const previousText = saveButton.textContent;
  saveButton.disabled = true;
  saveButton.textContent = 'Saving...';
  try {
    const response = await fetch('/api/admin/salary-rates', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rates: readSalaryRatesFromForm(list), feePercent: readSalaryFeePercentFromForm(feeInput) })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not save salary grid');
    renderSalaryRates(result.rates || [], result.feePercent ?? readSalaryFeePercentFromForm(feeInput));
    if (salaryRatesStatus) salaryRatesStatus.textContent = 'Salary grid saved.';
    if (agencySalaryStatus) agencySalaryStatus.textContent = 'Salary grid saved.';
    if (statusElement) statusElement.textContent = 'Salary grid saved.';
    if (statsBalanceMode === 'fixed') loadFixedBalance();
  } catch (error) {
    if (statusElement) statusElement.textContent = error.message;
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = previousText || 'Save';
  }
}

async function saveSalaryRates() {
  await persistSalaryRates({
    saveButton: salaryRateSaveBtn,
    list: salaryRatesList,
    feeInput: salaryFeePercentInput,
    statusElement: salaryRatesStatus
  });
}

async function saveAgencySalaryRates() {
  await persistSalaryRates({
    saveButton: agencySalarySaveBtn,
    list: agencySalaryRows,
    feeInput: agencySalaryFeePercentInput,
    statusElement: agencySalaryStatus
  });
}

function setAgencySalaryModalOpen(open) {
  agencySalaryModal?.classList.toggle('hidden', !open);
  agencySalarySettingsBtn?.classList.toggle('is-open', !!open);
}

async function openAgencySalaryModal() {
  if (currentUser?.role !== 'director') return;
  agencyAccountTab = 'salary';
  localStorage.setItem(AGENCY_ACCOUNT_TAB_KEY, agencyAccountTab);
  syncAgencyAccountTabs();
  renderAgencyAccountManager();
  if (agencySalaryStatus) agencySalaryStatus.textContent = 'Loading salary grid...';
  await loadSalaryRates();
}

function renderOperatorTranslatorSettings(settings = currentUser?.translator || {}) {
  if (operatorTranslatorProvider) operatorTranslatorProvider.value = settings.provider || 'deepl';
  setTranslatorReadTarget('operator', settings.targetLang);
  if (operatorTranslatorReplyTarget) operatorTranslatorReplyTarget.value = 'EN';
  if (operatorTranslatorApiKey) operatorTranslatorApiKey.value = '';
  if (operatorTranslatorStatus) {
    operatorTranslatorStatus.textContent = settings.hasApiKey ? 'API key saved' : 'No API key saved';
  }
}

function renderAgencyTranslatorSettings(settings = currentUser?.translator || {}) {
  if (agencyTranslatorProvider) agencyTranslatorProvider.value = settings.provider || 'deepl';
  if (agencyTranslatorReadTarget) agencyTranslatorReadTarget.value = settings.targetLang || 'RU';
  if (agencyTranslatorReplyTarget) agencyTranslatorReplyTarget.value = 'EN';
  if (agencyTranslatorApiKey) {
    agencyTranslatorApiKey.value = '';
    agencyTranslatorApiKey.placeholder = settings.hasApiKey ? 'API key saved. Leave blank to keep it.' : 'Paste API key';
  }
  if (agencyTranslatorStatus) {
    agencyTranslatorStatus.textContent = settings.hasApiKey
      ? 'API key saved. You can test the translator.'
      : 'Add an API key to enable translation.';
  }
}

async function loadAgencyTranslatorSettings() {
  if (!agencyTranslatorPanel || !currentUser) return;
  try {
    const response = await fetch('/api/translator/settings');
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not load translator settings');
    currentUser = { ...currentUser, translator: result.settings };
    renderAgencyTranslatorSettings(result.settings);
  } catch (error) {
    if (agencyTranslatorStatus) agencyTranslatorStatus.textContent = error.message || 'Could not load translator settings';
  }
}

async function saveAgencyTranslatorSettings() {
  if (!agencyTranslatorSaveBtn) return;
  agencyTranslatorSaveBtn.disabled = true;
  agencyTranslatorSaveBtn.textContent = 'Saving...';
  if (agencyTranslatorStatus) agencyTranslatorStatus.textContent = 'Saving translator settings...';
  try {
    const response = await fetch('/api/translator/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: agencyTranslatorProvider?.value || 'deepl',
        targetLang: agencyTranslatorReadTarget?.value || 'RU',
        replyTargetLang: 'EN',
        apiKey: agencyTranslatorApiKey?.value || ''
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not save translator settings');
    currentUser = { ...currentUser, translator: result.settings };
    renderAgencyTranslatorSettings(result.settings);
    if (agencyTranslatorStatus) agencyTranslatorStatus.textContent = 'Translator settings saved.';
    reloadWorkspaceEmbed('translator');
  } catch (error) {
    if (agencyTranslatorStatus) agencyTranslatorStatus.textContent = error.message || 'Could not save translator settings';
  } finally {
    agencyTranslatorSaveBtn.disabled = false;
    agencyTranslatorSaveBtn.textContent = 'Save';
  }
}

async function testAgencyTranslator() {
  const text = String(agencyTranslatorTestInput?.value || '').trim();
  if (!text) {
    if (agencyTranslatorStatus) agencyTranslatorStatus.textContent = 'Enter text to test translation.';
    return;
  }
  if (!currentUser?.translator?.hasApiKey && !String(agencyTranslatorApiKey?.value || '').trim()) {
    await saveAgencyTranslatorSettings();
  }
  if (agencyTranslatorTestBtn) {
    agencyTranslatorTestBtn.disabled = true;
    agencyTranslatorTestBtn.textContent = 'Testing...';
  }
  if (agencyTranslatorStatus) agencyTranslatorStatus.textContent = 'Testing translator...';
  try {
    const response = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        provider: agencyTranslatorProvider?.value || 'deepl',
        targetLang: agencyTranslatorReadTarget?.value || 'RU'
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not translate text');
    if (agencyTranslatorTestOutput) agencyTranslatorTestOutput.value = result.translatedText || '';
    if (agencyTranslatorStatus) agencyTranslatorStatus.textContent = result.cached ? 'Translator works. Cached result shown.' : 'Translator works.';
  } catch (error) {
    if (agencyTranslatorStatus) agencyTranslatorStatus.textContent = error.message || 'Could not test translator';
  } finally {
    if (agencyTranslatorTestBtn) {
      agencyTranslatorTestBtn.disabled = false;
      agencyTranslatorTestBtn.textContent = 'Test Translator';
    }
  }
}

function renderAgencyAccessSettings(settings = currentUser?.agency || {}) {
  const visible = currentUser?.role === 'director';
  agencyAccessSection?.classList.toggle('hidden', !visible);
  if (!visible) return;
  if (agencyAccessUrl) agencyAccessUrl.value = settings.baseUrl || 'https://agency.dream-singles.com';
  if (agencyAdminUrl) agencyAdminUrl.value = settings.baseUrl || 'https://agency.dream-singles.com';
  if (agencyAccessLogin) agencyAccessLogin.value = settings.username || '';
  if (agencyAdminLogin) agencyAdminLogin.value = settings.username || '';
  if (agencyAccessPassword) {
    agencyAccessPassword.value = '';
    agencyAccessPassword.placeholder = settings.hasPassword
      ? 'Password saved. Leave blank to keep it.'
      : 'Agency password';
  }
  if (agencyAdminPassword) {
    agencyAdminPassword.value = '';
    agencyAdminPassword.placeholder = settings.hasPassword
      ? 'Password saved. Leave blank to keep it.'
      : 'Agency admin password';
  }
  if (agencyAccessStatus) {
    agencyAccessStatus.textContent = settings.hasPassword
      ? 'Global Agency access saved. It will be used for all team leads and operators.'
      : 'Set one Agency access for all team leads and operators.';
  }
  if (agencyAdminStatus) {
    agencyAdminStatus.textContent = settings.hasPassword
      ? 'Agency admin access saved. Operator balances will use this login.'
      : 'Set Agency admin login and password for operator balance refresh.';
  }
}

async function loadAgencyAccessSettings() {
  if (!agencyAccessSection || currentUser?.role !== 'director') return;
  try {
    const response = await fetch('/api/agency/settings');
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not load Agency access');
    currentUser = { ...currentUser, agency: result.settings };
    renderAgencyAccessSettings(result.settings);
  } catch (error) {
    agencyAccessSection?.classList.remove('hidden');
    agencyAdminPanel?.classList.remove('hidden');
    if (agencyAccessStatus) agencyAccessStatus.textContent = error.message || 'Could not load Agency access';
    if (agencyAdminStatus) agencyAdminStatus.textContent = error.message || 'Could not load Agency admin access';
  }
}

function openOperatorSettings(options = {}) {
  if (!options.restore) setSettingsRoute(true);
  document.body.classList.remove('profile-choice-auth');
  document.body.classList.add('auth-ready');
  adminStatus.textContent = '';
  adminModal?.classList.add('operator-settings-mode');
  openAddProfileModalBtn?.classList.add('hidden');
  if (openAddProfileModalBtn) openAddProfileModalBtn.hidden = true;
  directorAssignmentsSection?.classList.add('hidden');
  teamMembersSection?.classList.add('hidden');
  salaryRatesSection?.classList.add('hidden');
  agencyAccessSection?.classList.add('hidden');
  operatorTranslatorSection?.classList.remove('hidden');
  profilesAdminList.innerHTML = availableProfiles.map(profile => `
    <div class="profile-admin-card" data-profile-id="${escapeHtml(profile.id)}">
      <div class="profile-admin-person">
        <span class="profile-admin-photo ${profile.photoUrl ? '' : 'no-photo'}"><img src="${escapeHtml(profile.photoUrl || '')}" alt=""></span>
        <span class="profile-admin-copy"><strong>${escapeHtml(profile.name)}</strong><small>ID ${escapeHtml(profile.id)}</small></span>
      </div>
    </div>`).join('') || '<div class="admin-empty">No active profiles assigned.</div>';
  renderOperatorTranslatorSettings();
  renderAgencyAccessSettings();
  adminModal.classList.remove('hidden');
}

async function saveOperatorTranslatorSettings() {
  operatorTranslatorSaveBtn.disabled = true;
  operatorTranslatorSaveBtn.textContent = 'Saving...';
  try {
    const response = await fetch('/api/translator/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: operatorTranslatorProvider?.value || 'deepl',
        targetLang: operatorTranslatorReadTarget?.value || 'RU',
        replyTargetLang: 'EN',
        apiKey: operatorTranslatorApiKey?.value || ''
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not save translator settings');
    currentUser = { ...currentUser, translator: result.settings };
    renderOperatorTranslatorSettings(result.settings);
    if (operatorTranslatorStatus) operatorTranslatorStatus.textContent = 'Translator saved.';
    reloadWorkspaceEmbed('translator');
  } catch (error) {
    if (operatorTranslatorStatus) operatorTranslatorStatus.textContent = error.message;
  } finally {
    operatorTranslatorSaveBtn.disabled = false;
    operatorTranslatorSaveBtn.textContent = 'Save';
  }
}

function agencyAccessFormValues(source = 'legacy') {
  const usePanel = source === 'panel';
  return {
    baseUrl: (usePanel ? agencyAdminUrl : agencyAccessUrl)?.value || '',
    username: (usePanel ? agencyAdminLogin : agencyAccessLogin)?.value || '',
    password: (usePanel ? agencyAdminPassword : agencyAccessPassword)?.value || ''
  };
}

async function saveAgencyAccessSettings(source = 'legacy') {
  const button = source === 'panel' ? agencyAdminSaveBtn : agencyAccessSaveBtn;
  const status = source === 'panel' ? agencyAdminStatus : agencyAccessStatus;
  if (!button) return;
  button.disabled = true;
  button.textContent = 'Saving...';
  try {
    const response = await fetch('/api/agency/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(agencyAccessFormValues(source))
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not save Agency access');
    currentUser = { ...currentUser, agency: result.settings };
    if (source === 'panel') agencyAdminFormEditing = false;
    renderAgencyAccessSettings(result.settings);
    if (status) status.textContent = source === 'panel'
      ? 'Agency admin access saved. Operator balances will use this login.'
      : 'Agency access saved.';
  } catch (error) {
    if (status) status.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = 'Save';
  }
}

async function testAgencyAccessSettings(source = 'legacy') {
  const button = source === 'panel' ? agencyAdminTestBtn : agencyAccessTestBtn;
  const status = source === 'panel' ? agencyAdminStatus : agencyAccessStatus;
  if (!button) return;
  const values = agencyAccessFormValues(source);
  if (!String(values.username || '').trim() || !String(values.password || '').trim()) {
    if (status) status.textContent = 'Enter Agency admin login and password before testing.';
    return;
  }
  button.disabled = true;
  button.textContent = 'Testing...';
  if (status) status.textContent = 'Testing Agency access on server...';
  try {
    const response = await fetch('/api/agency/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Agency test failed');
    if (source === 'panel') agencyAdminFormEditing = false;
    if (status) status.textContent = 'Agency access works. Bonuses page opened on server.';
  } catch (error) {
    if (status) status.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = 'Test';
  }
}

function closeAdmin() {
  if (currentUser?.role === 'director') {
    adminModal.classList.remove('hidden');
    adminModal?.classList.remove('operator-settings-mode');
    setSettingsRoute(true);
    switchView('settings');
    return;
  }
  adminModal.classList.add('hidden');
  adminModal?.classList.remove('operator-settings-mode');
  setSettingsRoute(false);
}

function closeProfileAssignmentMenus() {
  profilesAdminList?.querySelectorAll('.profile-assignment-menu').forEach(menu => {
    menu.classList.add('hidden');
    menu.closest('.profile-assignment-field')?.querySelector('.profile-assignment-button')?.setAttribute('aria-expanded', 'false');
  });
}

function openAddProfileModal() {
  adminStatus.textContent = '';
  newProfileId.value = '';
  newProfileName.value = '';
  addProfileModal?.classList.remove('hidden');
  setTimeout(() => newProfileId?.focus(), 50);
}

function closeAddProfileModal() {
  addProfileModal?.classList.add('hidden');
  newProfileId.value = '';
  newProfileName.value = '';
}

function openProfileSending(profileId) {
  const profile = managedProfiles.find(item => item.id === profileId) || agencyProfiles.find(item => item.id === profileId);
  if (!profile) return;
  profileSendingId.value = profile.id;
  if (profileSendingName) profileSendingName.value = profile.name || '';
  profileSendingLogin.value = '';
  profileSendingPassword.value = '';
  if (profileGoogleDriveUrl) profileGoogleDriveUrl.value = profile.googleDriveUrl || '';
  if (profileSendingStatus) profileSendingStatus.textContent = '';
  profileSendingModal?.classList.remove('hidden');
  setTimeout(() => profileSendingLogin?.focus(), 50);
}

function mergeProfileSettings(profile) {
  if (!profile?.id) return;
  const patch = item => String(item.id) === String(profile.id)
    ? { ...item, ...profile }
    : item;
  managedProfiles = managedProfiles.map(patch);
  availableProfiles = availableProfiles.map(patch);
  renderProfileSwitcher();
}

function closeProfileSendingModal() {
  profileSendingModal?.classList.add('hidden');
  profileSendingId.value = '';
  if (profileSendingName) profileSendingName.value = '';
  profileSendingLogin.value = '';
  profileSendingPassword.value = '';
  if (profileGoogleDriveUrl) profileGoogleDriveUrl.value = '';
  if (profileSendingStatus) profileSendingStatus.textContent = '';
}

function openAddUserModal(options = {}) {
  adminStatus.textContent = '';
  newOperatorName.value = '';
  newOperatorLogin.value = '';
  newOperatorPassword.value = '';
  const role = options.role || (currentUser?.role === 'director' ? 'admin' : 'operator');
  if (newUserRole) newUserRole.value = role;
  newUserRoleToggle?.querySelectorAll('.role-toggle-button').forEach(button => {
    const allowedForDirector = options.role === 'operator'
      ? ['operator', 'admin'].includes(button.dataset.role)
      : button.dataset.role === 'admin';
    const allowedForAdmin = button.dataset.role === 'operator';
    button.classList.toggle('active', button.dataset.role === role);
    button.classList.toggle('hidden', currentUser?.role === 'director' ? !allowedForDirector : !allowedForAdmin);
  });
  addUserModal?.classList.remove('hidden');
  setTimeout(() => newOperatorName?.focus(), 50);
}

function closeAddUserModal() {
  addUserModal?.classList.add('hidden');
  newOperatorName.value = '';
  newOperatorLogin.value = '';
  newOperatorPassword.value = '';
}

function setRoleToggle(toggle, value) {
  toggle?.querySelectorAll('.role-toggle-button').forEach(button => {
    button.classList.toggle('active', button.dataset.role === value);
  });
}

function renderEditOperatorManagerOptions(user = {}) {
  if (!editOperatorManagerBlock || !editOperatorManager) return;
  const show = currentUser?.role === 'director' && editUserRole?.value === 'operator' && String(user.id || '') !== String(currentUser?.id || '');
  editOperatorManagerBlock.classList.toggle('hidden', !show);
  if (!show) return;
  const currentLabel = currentUser?.name || currentUser?.username || 'Director';
  const admins = managedUsers
    .filter(item => item.role === 'admin')
    .sort((a, b) => String(a.name || a.username || '').localeCompare(String(b.name || b.username || '')));
  editOperatorManager.innerHTML = [
    `<option value="${escapeAttr(currentUser.id)}">${escapeHtml(currentLabel)} (Director)</option>`,
    ...admins.map(admin => `<option value="${escapeAttr(admin.id)}">${escapeHtml(admin.name || admin.username || admin.id)}</option>`)
  ].join('');
  editOperatorManager.value = user.managerId && (user.managerId === currentUser.id || admins.some(admin => admin.id === user.managerId))
    ? user.managerId
    : currentUser.id;
}

function closeUserSettingsModal() {
  userSettingsModal?.classList.add('hidden');
  editOperatorPassword.value = '';
  if (editOperatorAgencyPassword) editOperatorAgencyPassword.value = '';
}

function confirmSaveUserSettings() {
  if (!saveUserConfirmModal || !confirmSaveUserBtn || !cancelSaveUserConfirmBtn) {
    return Promise.resolve(window.confirm('Are you sure you want to save these changes?'));
  }
  saveUserConfirmModal.classList.remove('hidden');
  return new Promise(resolve => {
    const close = value => {
      saveUserConfirmModal.classList.add('hidden');
      confirmSaveUserBtn.removeEventListener('click', onYes);
      cancelSaveUserConfirmBtn.removeEventListener('click', onNo);
      saveUserConfirmModal.removeEventListener('click', onBackdrop);
      resolve(value);
    };
    const onYes = () => close(true);
    const onNo = () => close(false);
    const onBackdrop = event => {
      if (event.target.classList.contains('confirm-mini-backdrop')) close(false);
    };
    confirmSaveUserBtn.addEventListener('click', onYes);
    cancelSaveUserConfirmBtn.addEventListener('click', onNo);
    saveUserConfirmModal.addEventListener('click', onBackdrop);
    setTimeout(() => confirmSaveUserBtn.focus(), 50);
  });
}

function openUserSettings(userId) {
  const user = managedUsers.find(item => item.id === userId) ||
    (String(currentUser?.id || '') === String(userId || '') ? currentUser : null);
  if (!user) return;
  const selfSettings = String(user.id) === String(currentUser?.id || '');
  userSettingsId.value = user.id;
  editOperatorName.value = user.name || user.username;
  editOperatorLogin.value = user.username || '';
  editOperatorPassword.value = '';
  editOperatorAgencyBlock?.classList.add('hidden');
  if (editOperatorAgencyUrl) editOperatorAgencyUrl.value = '';
  if (editOperatorAgencyLogin) editOperatorAgencyLogin.value = '';
  if (editOperatorAgencyPassword) {
    editOperatorAgencyPassword.value = '';
    editOperatorAgencyPassword.placeholder = 'Agency password';
  }
  if (editOperatorAgencyStatus) {
    editOperatorAgencyStatus.textContent = '';
  }
  editUserRole.value = ['admin', 'operator'].includes(user.role) ? user.role : 'operator';
  setRoleToggle(editUserRoleToggle, editUserRole.value);
  editUserRoleToggle?.querySelector('[data-role="admin"]')?.classList.toggle('hidden', currentUser.role !== 'director');
  editUserRoleToggle?.querySelector('[data-role="operator"]')?.classList.toggle('hidden', currentUser.role !== 'director' && user.role !== 'operator');
  editUserRoleToggle?.querySelectorAll('button').forEach(button => { button.disabled = selfSettings; });
  renderEditOperatorManagerOptions(user);
  userSettingsModal?.classList.remove('hidden');
}

async function saveUserSettings() {
  const userId = userSettingsId.value;
  const selfSettings = String(userId) === String(currentUser?.id || '');
  const body = {
    name: editOperatorName.value.trim(),
    username: editOperatorLogin.value.trim(),
    role: currentUser?.role === 'director' ? editUserRole.value : editUserRole.value
  };
  if (!selfSettings && currentUser?.role === 'director' && editUserRole.value === 'operator' && editOperatorManager && !editOperatorManagerBlock?.classList.contains('hidden')) {
    body.managerId = editOperatorManager.value || currentUser.id;
  }
  if (editOperatorPassword.value) body.password = editOperatorPassword.value;
  if (!selfSettings && editOperatorAgencyBlock && !editOperatorAgencyBlock.classList.contains('hidden')) {
    body.agency = {
      baseUrl: editOperatorAgencyUrl?.value || '',
      username: editOperatorAgencyLogin?.value || '',
      password: editOperatorAgencyPassword?.value || ''
    };
  }
  const response = await fetch(selfSettings
    ? '/api/auth/me'
    : `/api/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not save user');
  if (selfSettings && result.user) currentUser = result.user;
  closeUserSettingsModal();
  if (selfSettings) {
    await refreshSession();
  } else {
    await loadAdmin();
    if (document.body.classList.contains('mandarin-home-active')) await loadAgencyAccountManager();
    if (currentView === 'adminPanel') await loadAdminPanelBalances();
  }
}

async function saveAgencyOperatorAdministrator(row) {
  const userId = row?.dataset?.userId || '';
  const managerId = row?.querySelector('[data-combo-field="operator-admin"]')?.dataset?.value || '';
  const user = agencyUsers.find(item => String(item.id || '') === String(userId));
  if (!userId || !user) return;
  const nextManagerId = currentUser?.role === 'admin'
    ? currentUser.id
    : managerId;
  const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: user.name || user.username || '',
      username: user.username || '',
      role: 'operator',
      managerId: nextManagerId || ''
    })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not save administrator');
  await loadAgencyAccountManager();
}

async function saveAgencyUserRole(row) {
  const userId = row?.dataset?.userId || '';
  const role = row?.querySelector('[data-combo-field="user-role"]')?.dataset?.value || 'operator';
  const user = agencyUsers.find(item => String(item.id || '') === String(userId));
  if (!userId || !user || !['admin', 'operator'].includes(role)) return;
  const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: user.name || user.username || '',
      username: user.username || '',
      role,
      managerId: role === 'operator' ? (user.managerId || (currentUser?.role === 'admin' ? currentUser.id : '')) : undefined
    })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not save role');
  await loadAgencyAccountManager();
}

async function resetUserPassword() {
  const userId = userSettingsId.value;
  const password = editOperatorPassword.value;
  if (String(password).length < 6) throw new Error('Password must be at least 6 characters');
  const selfSettings = String(userId) === String(currentUser?.id || '');
  const response = await fetch(selfSettings ? '/api/auth/me' : `/api/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not reset password');
  editOperatorPassword.value = '';
  adminStatus.textContent = 'Password saved.';
  if (selfSettings) await refreshSession();
  else await loadAdmin();
}

async function saveUserLogin() {
  const userId = userSettingsId.value;
  const username = editOperatorLogin.value.trim();
  if (username.length < 3) throw new Error('Use at least 3 characters for login');
  const selfSettings = String(userId) === String(currentUser?.id || '');
  const response = await fetch(selfSettings ? '/api/auth/me' : `/api/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not save login');
  adminStatus.textContent = 'Login saved.';
  if (selfSettings) await refreshSession();
  else {
    await loadAdmin();
    if (document.body.classList.contains('mandarin-home-active')) await loadAgencyAccountManager();
  }
}

async function testOperatorAgencyAccess() {
  const userId = userSettingsId.value;
  const button = editOperatorAgencyTestBtn || document.getElementById('editOperatorAgencyTestBtn');
  if (!userId) {
    if (editOperatorAgencyStatus) editOperatorAgencyStatus.textContent = 'User is not selected.';
    return;
  }
  if (button) {
    button.disabled = true;
    button.textContent = 'Testing...';
  }
  if (editOperatorAgencyStatus) editOperatorAgencyStatus.textContent = 'Testing Agency access on server...';
  try {
    const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/agency/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseUrl: editOperatorAgencyUrl?.value || '',
        username: editOperatorAgencyLogin?.value || '',
        password: editOperatorAgencyPassword?.value || ''
      })
    });
    const raw = await response.text();
    let result = {};
    try {
      result = raw ? JSON.parse(raw) : {};
    } catch {
      throw new Error('Server returned a non-JSON response. Restart the CRM server and try again.');
    }
    if (!response.ok) throw new Error(result.error || 'Could not verify Agency access');
    if (editOperatorAgencyStatus) editOperatorAgencyStatus.textContent = 'Agency access works. Bonuses page opened on server.';
  } catch (error) {
    if (editOperatorAgencyStatus) editOperatorAgencyStatus.textContent = error.message;
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'Test';
    }
  }
}

async function deleteUserSettings() {
  const userId = userSettingsId.value;
  if (!userId) return;
  const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, { method: 'DELETE' });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not delete account');
  closeUserSettingsModal();
  await loadAdmin();
}

function openDeleteUserConfirm() {
  deleteUserConfirmModal?.classList.remove('hidden');
}

function closeDeleteUserConfirm() {
  deleteUserConfirmModal?.classList.add('hidden');
}

function openDeleteProfileConfirm(profileId) {
  pendingDeleteProfileId = profileId || '';
  deleteProfileConfirmModal?.classList.remove('hidden');
}

function closeDeleteProfileConfirm() {
  pendingDeleteProfileId = '';
  deleteProfileConfirmModal?.classList.add('hidden');
}

async function deletePendingProfile() {
  const profileId = pendingDeleteProfileId;
  if (!profileId) return;
  const response = await fetch(`/api/admin/profiles/${encodeURIComponent(profileId)}`, { method: 'DELETE' });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not delete profile');
  closeDeleteProfileConfirm();
  await refreshAgencyLiveData({ reloadPanel: false });
  await loadAdmin();
  if (document.body.classList.contains('mandarin-home-active')) await loadAgencyAccountManager();
  await loadMen();
}

async function addProfile() {
  const login = newProfileId.value.trim();
  const password = newProfileName.value;
  if (!login || !password) throw new Error('Enter Dream Singles login and password');
  let profileId = '';
  let profileName = '';
  let photoData = '';
  let photoUrl = '';

  adminStatus.textContent = 'Checking Dream Singles access...';
  try {
    const resolveResponse = await fetch('/api/admin/profiles/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login, password })
    });
    const resolved = await resolveResponse.json();
    if (!resolveResponse.ok) throw new Error(resolved?.error || 'Dream Singles access could not be checked');
    if (!resolved?.ok) throw new Error(resolved?.error || 'Dream Singles access could not be checked');
    profileId = String(resolved.profileId || '').trim();
    profileName = String(resolved.name || '').trim();
    photoData = resolved.photoData || '';
    photoUrl = resolved.photoUrl || '';
  } catch (error) {
    throw new Error(`Could not check Dream Singles access: ${error.message}`);
  }

  if (!profileId) profileId = login.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
  if (!profileName) profileName = profileId;

  const response = await fetch('/api/admin/profiles', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: profileId, name: profileName, photoData, photoUrl, login, password })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  newProfileId.value = '';
  newProfileName.value = '';
  await refreshAgencyLiveData({ reloadPanel: false });
  if (document.body.classList.contains('mandarin-home-active')) await loadAgencyAccountManager();
  else await loadAdmin();
  closeAddProfileModal();
  adminStatus.textContent = 'Profile added.';
}

async function addOperator() {
  const profileIds = [...operatorProfileChoices.querySelectorAll('input:checked')].map(input => input.value);
  const response = await fetch('/api/admin/users', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: newOperatorName.value.trim(),
      username: newOperatorLogin.value.trim(),
      password: newOperatorPassword.value,
      profileIds,
      role: newUserRole.value
    })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  newOperatorName.value = '';
  newOperatorLogin.value = '';
  newOperatorPassword.value = '';
  closeAddUserModal();
  await loadAdmin();
  if (document.body.classList.contains('mandarin-home-active')) await loadAgencyAccountManager();
}

async function refreshSession() {
  const response = await fetch('/api/auth/me');
  if (!response.ok) return false;
  const result = await response.json();
  applySession(result, false, { resetPanel: false });
  return true;
}

async function refreshSessionQuietly() {
  const response = await fetch('/api/auth/me');
  if (!response.ok) return false;
  const result = await response.json();
  currentUser = result.user;
  availableProfiles = result.profiles || [];
  if (!agencyProfiles.length || isAgencyDesktopApp()) agencyProfiles = availableProfiles;
  const activeStillAvailable = activeProfileId && availableProfiles.some(profile => String(profile.id || '') === String(activeProfileId));
  if (!activeStillAvailable) {
    activeProfileId = '';
    ladyConnected = false;
    localStorage.removeItem('dream_crm_profile_id');
  } else {
    localStorage.setItem('dream_crm_profile_id', activeProfileId);
  }
  if (profileSelect) {
    profileSelect.innerHTML = availableProfiles.length
      ? availableProfiles.map(profile => `<option value="${escapeHtml(profile.id)}">${escapeHtml(profile.name)} - ${escapeHtml(profile.id)}</option>`).join('')
      : '<option value="">No assigned profiles</option>';
    profileSelect.value = activeProfileId;
  }
  const activeProfile = availableProfiles.find(profile => String(profile.id || '') === String(activeProfileId));
  renderProfileSwitcher(activeProfile);
  renderSidebarProfileDock();
  syncRoleNavigation();
  syncAgencyProfilePowerToggle();
  syncAgencyNavLocks();
  syncAgencyAccountTabs();
  syncAgencyInboxAccess();
  syncAgencyFavoritesAccess();
  if (agencyShellUserName) agencyShellUserName.textContent = currentUser?.name || currentUser?.username || 'Account';
  if (agencyShellAvatar) agencyShellAvatar.textContent = (currentUser?.name || currentUser?.username || 'A').slice(0, 1).toUpperCase();
  if (agencyShellUserRole) {
    agencyShellUserRole.textContent = currentUser?.role === 'director'
      ? 'Owner'
      : currentUser?.role === 'admin' ? 'Administrator'
        : currentUser?.role === 'mentor' ? 'Mentor'
          : 'Operator';
  }
  return true;
}

let agencyLiveRefreshInProgress = false;

function agencyUiIsBusy() {
  const modalOpen = element => Boolean(element && !element.classList.contains('hidden'));
  const activeElement = document.activeElement;
  return Boolean(
    document.querySelector('[data-agency-combo].open') ||
    agencyAdminFormEditing ||
    (agencyAdminPanel?.contains(activeElement) && !agencyAdminPanel.classList.contains('hidden')) ||
    (agencyAccessSection?.contains(activeElement) && !agencyAccessSection.classList.contains('hidden')) ||
    agencyAdminSaveBtn?.disabled ||
    agencyAdminTestBtn?.disabled ||
    agencyAccessSaveBtn?.disabled ||
    agencyAccessTestBtn?.disabled ||
    modalOpen(addProfileModal) ||
    modalOpen(profileSendingModal) ||
    modalOpen(userSettingsModal) ||
    modalOpen(deleteProfileConfirmModal) ||
    modalOpen(deleteUserConfirmModal)
  );
}

async function refreshAgencyLiveData(options = {}) {
  if (!currentUser || agencyLiveRefreshInProgress) return false;
  agencyLiveRefreshInProgress = true;
  try {
    const ok = await refreshSessionQuietly();
    if (!ok) return false;
    const panel = normalizeAgencyPanel(localStorage.getItem(AGENCY_PANEL_KEY) || 'home');
    if (options.reloadPanel && panel === 'account-manager' && !agencyUiIsBusy()) {
      await loadAgencyAccountManager();
    }
    return true;
  } catch (error) {
    console.warn('Could not refresh live AgencyOS data', error);
    return false;
  } finally {
    agencyLiveRefreshInProgress = false;
  }
}

window.setInterval(() => {
  if (!document.body.classList.contains('mandarin-home-active')) return;
  if (agencyUiIsBusy()) return;
  refreshAgencyLiveData({ reloadPanel: true });
}, 8000);

if (accessBtn) accessBtn.addEventListener('click', enterCrm);
[usernameInput, passwordInput].forEach(input => input?.addEventListener('keydown', event => {
  if (event.key === 'Enter') enterCrm();
}));
profileSelect?.addEventListener('change', async () => {
  const nextId = profileSelect.value;
  try {
    if (nextId && localStorage.getItem(`dream_team_lady_connected_${nextId}`) !== '1') {
      await connectProfileById(nextId);
    }
    await switchWorkingProfile(nextId, { reason: 'profile-select' });
  } catch (error) {
    alert(error.message || 'Could not switch profile');
    if (profileSelect) profileSelect.value = activeProfileId;
  }
});
profileChoiceList?.addEventListener('click', event => {
  const adminPanelChoice = event.target.closest('.profile-choice-card-button[data-admin-panel-id]');
  if (adminPanelChoice) {
    mentorSelectedAdminPanelId = adminPanelChoice.dataset.adminPanelId || '';
    if (mentorSelectedAdminPanelId) {
      localStorage.setItem('dream_crm_mentor_admin_panel_id', mentorSelectedAdminPanelId);
      openAdminPanelFromProfileChoice().catch(error => {
        if (adminPanelStatus) adminPanelStatus.textContent = error.message || 'Could not open admin panel';
      });
    }
    return;
  }
  const choice = event.target.closest('.profile-choice-card-button[data-profile-id]');
  if (choice) selectWorkingProfile(choice.dataset.profileId);
});
profileChoiceScreen?.addEventListener('click', event => {
  if (event.target === profileChoiceScreen) cancelAgencyProfileChoice();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') cancelAgencyProfileChoice();
});
profileChoiceLogout?.addEventListener('click', signOutCrmAccount);
profileChoiceSettings?.addEventListener('click', () => {
  if (currentUser?.role === 'operator') openOperatorSettings();
  else openAdmin();
});
profileChoiceAdminPanel?.addEventListener('click', () => {
  openAdminPanelFromProfileChoice().catch(error => {
    if (adminPanelStatus) adminPanelStatus.textContent = error.message || 'Could not open admin panel';
  });
});
mandarinHomeScreen?.addEventListener('click', event => {
  const accountTab = event.target.closest('.agency-account-tab');
  if (accountTab) {
    const nextTab = accountTab.dataset.agencyAccountTab || 'ladies';
    if (accountTab.classList.contains('hidden') ||
      (currentUser?.role === 'operator' && ['operators', 'salary', 'agency-admin'].includes(nextTab)) ||
      (['salary', 'agency-admin'].includes(nextTab) && currentUser?.role !== 'director')) {
      return;
    }
    agencyAccountTab = ['ladies', 'operators', 'salary', 'agency-admin'].includes(nextTab) ? nextTab : 'ladies';
    localStorage.setItem(AGENCY_ACCOUNT_TAB_KEY, agencyAccountTab);
    syncAgencyAccountTabs();
    renderAgencyAccountManager();
    return;
  }
  const navItem = event.target.closest('.agency-shell-nav-item');
  if (!navItem) return;
  const view = navItem.dataset.agencyView || 'account-manager';
  if (isProfileWorkView(view) && !isActiveProfileOnline()) {
    event.preventDefault();
    event.stopPropagation();
    renderSidebarProfileDock();
    activateAgencyPanel('home', { persist: false });
    return;
  }
  activateAgencyPanel(view);
});
agencyDashboardSearch?.addEventListener('input', () => {
  if (agencyDashboardMode === 'bonuses') renderAgencyDashboardBonuses();
  else renderAgencyDashboardRows();
});
agencyDashboardYear?.addEventListener('change', () => {
  if (agencyDashboardCalendar && !agencyDashboardCalendar.classList.contains('hidden') && agencyDashboardCalendarData?.operator?.operatorId) {
    if (agencyDashboardCalendarYear) agencyDashboardCalendarYear.value = agencyDashboardYear.value;
    syncAgencyYearCombos();
    openAgencyDashboardOperator(agencyDashboardCalendarData.operator.operatorId);
    return;
  }
  syncAgencyYearCombos();
  if (agencyDashboardMode === 'bonuses') loadAgencyDashboardBonuses();
  else loadAgencyDashboardOperators();
});
agencyDashboardCalendarYear?.addEventListener('change', () => {
  if (agencyDashboardYear) agencyDashboardYear.value = agencyDashboardCalendarYear.value;
  syncAgencyYearCombos();
  if (agencyDashboardCalendarData?.operator?.operatorId) openAgencyDashboardOperator(agencyDashboardCalendarData.operator.operatorId);
});
agencyDashboardMonths?.addEventListener('click', event => {
  const button = event.target.closest('.agency-dashboard-month');
  if (!button) return;
  setAgencyDashboardMonth(button.dataset.month);
  if (agencyDashboardCalendar && !agencyDashboardCalendar.classList.contains('hidden')) renderAgencyDashboardCalendar();
  else if (agencyDashboardMode === 'bonuses') {
    if (agencyDashboardYear) agencyDashboardYear.value = String(agencyDashboardYearValue());
    syncAgencyYearCombos();
  }
  else loadAgencyDashboardOperators();
});
agencyDashboardCalendarMonths?.addEventListener('click', event => {
  const button = event.target.closest('.agency-dashboard-month');
  if (!button) return;
  setAgencyDashboardMonth(button.dataset.month);
  renderAgencyDashboardCalendar();
});
agencyDashboardRows?.addEventListener('click', event => {
  const row = event.target.closest('tr[data-operator-id]');
  if (row) openAgencyDashboardOperator(row.dataset.operatorId);
});
agencyDashboardCalendar?.addEventListener('click', event => {
  event.stopPropagation();
});
agencyDashboardCalendarGrid?.addEventListener('click', event => {
  const button = event.target.closest('.agency-dashboard-day');
  if (!button?.dataset.date) return;
  event.stopPropagation();
  renderAgencyDashboardDay(button.dataset.date);
});
agencyDashboardBackBtn?.addEventListener('click', () => {
  closeAgencyDashboardCalendar();
});
agencyDashboardStartBalanceBtn?.addEventListener('click', async () => {
  setAgencyDashboardMode('total', { silent: true });
  await startAgencyDashboardBalanceRefresh();
});
agencyDashboardBonusesBtn?.addEventListener('click', () => setAgencyDashboardMode('bonuses'));
agencyDashboardBonusCalendarBtn?.addEventListener('click', () => {
  const target = agencyDashboardBonusFrom || agencyDashboardBonusTo;
  if (typeof target?.showPicker === 'function') target.showPicker();
  else target?.focus();
});
agencyDashboardBonusApplyBtn?.addEventListener('click', loadAgencyDashboardBonuses);
document.addEventListener('click', () => {
  document.querySelectorAll('.agency-year-combo-menu').forEach(item => item.classList.add('hidden'));
  document.querySelectorAll('.agency-year-combo-trigger').forEach(item => item.setAttribute('aria-expanded', 'false'));
});
document.addEventListener('click', event => {
  if (!document.body.classList.contains('agency-dashboard-active')) return;
  if (!agencyDashboardCalendar || agencyDashboardCalendar.classList.contains('hidden')) return;
  const insideCalendar = event.target.closest?.('#agencyDashboardCalendar');
  const insideOperatorRow = event.target.closest?.('#agencyDashboardRows tr[data-operator-id]');
  const insideToolbar = event.target.closest?.('.agency-dashboard-toolbar');
  if (insideCalendar || insideOperatorRow || insideToolbar) return;
  closeAgencyDashboardCalendar();
});
agencyShellCollapse?.addEventListener('click', () => {
  const collapsed = !document.body.classList.contains('agency-shell-collapsed');
  document.body.classList.toggle('agency-shell-collapsed', collapsed);
  localStorage.setItem('agency_shell_collapsed', collapsed ? '1' : '0');
  agencyShellCollapse.textContent = collapsed ? '›' : '‹';
});
agencyShellUserMenuTrigger?.addEventListener('click', event => {
  if (event.target.closest('#agencyShellLogoutBtn')) return;
  agencyShellUserMenu?.classList.toggle('hidden');
});
agencyShellLogoutBtn?.addEventListener('click', event => {
  event.stopPropagation();
  agencyShellUserMenu?.classList.add('hidden');
  signOutCrmAccount();
});
agencyShellInlineLogoutBtn?.addEventListener('click', event => {
  event.stopPropagation();
  agencyShellUserMenu?.classList.add('hidden');
  signOutCrmAccount();
});
document.addEventListener('click', event => {
  if (event.target.closest('#agencyShellUserMenuTrigger')) return;
  agencyShellUserMenu?.classList.add('hidden');
});
agencyAccountSearch?.addEventListener('input', renderAgencyAccountManager);
agencyAddProfileBtn?.addEventListener('click', () => {
  if (currentUser?.role === 'operator') return;
  if (agencyAccountTab === 'operators') openAddUserModal({ role: 'operator' });
  else openAddProfileModal();
});
agencyAccountRows?.addEventListener('click', event => {
  const comboOption = event.target.closest('[data-agency-combo-option]');
  if (comboOption) {
    const combo = comboOption.closest('[data-agency-combo]');
    const row = comboOption.closest('tr');
    const value = comboOption.dataset.value || '';
    const label = comboOption.textContent.trim();
    if (!combo || !row) return;
    combo.dataset.value = value;
    combo.querySelector('[data-agency-combo-trigger] span').textContent = label;
    combo.querySelectorAll('[data-agency-combo-option]').forEach(option => {
      option.classList.toggle('active', option === comboOption);
    });
    combo.classList.remove('open');
    const field = combo.dataset.comboField || '';
    if (field === 'user-role') {
      saveAgencyUserRole(row).catch(error => {
        if (agencyAccountStatus) agencyAccountStatus.textContent = error.message || 'Could not save role';
      });
    } else if (field === 'operator-admin') {
      saveAgencyOperatorAdministrator(row).catch(error => {
        if (agencyAccountStatus) agencyAccountStatus.textContent = error.message || 'Could not save administrator';
      });
    } else if (field === 'profile-operator' || field === 'profile-admin') {
      saveAgencyProfileAssignment(row).catch(async error => {
        if (agencyAccountStatus) agencyAccountStatus.textContent = error.message || 'Could not save assignment';
        await loadAgencyAccountManager().catch(() => {});
      });
    }
    return;
  }
  const comboTrigger = event.target.closest('[data-agency-combo-trigger]');
  if (comboTrigger) {
    const combo = comboTrigger.closest('[data-agency-combo]');
    agencyAccountRows.querySelectorAll('[data-agency-combo].open').forEach(item => {
      if (item !== combo) item.classList.remove('open');
    });
    combo?.classList.toggle('open');
    if (combo?.classList.contains('open')) positionAgencyComboMenu(combo);
    return;
  }
  const action = event.target.closest('[data-agency-profile-action]');
  const userAction = event.target.closest('[data-agency-user-action]');
  const materialAction = event.target.closest('[data-agency-material-url]');
  if (materialAction) {
    event.preventDefault();
    event.stopPropagation();
    const url = String(materialAction.dataset.agencyMaterialUrl || '').trim();
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  if (!action && !userAction) return;
  if (userAction) {
    const row = userAction.closest('tr[data-user-id]');
    const userId = row?.dataset?.userId || '';
    if (!userId) return;
    if (userAction.dataset.agencyUserAction === 'edit') openUserSettings(userId);
    if (userAction.dataset.agencyUserAction === 'delete') {
      userSettingsId.value = userId;
      openDeleteUserConfirm();
    }
    return;
  }
  const row = action.closest('tr[data-profile-id]');
  const profileId = row?.dataset?.profileId || '';
  if (!profileId) return;
  if (!['director', 'admin'].includes(currentUser?.role)) return;
  if (action.dataset.agencyProfileAction === 'edit') openProfileSending(profileId);
  if (action.dataset.agencyProfileAction === 'delete') openDeleteProfileConfirm(profileId);
});
document.addEventListener('click', event => {
  if (event.target.closest('[data-agency-combo]')) return;
  agencyAccountRows?.querySelectorAll('[data-agency-combo].open').forEach(combo => combo.classList.remove('open'));
});
agencyAccountRows?.addEventListener('change', event => {
  const roleSelect = event.target.closest('[data-user-field="role"]');
  if (roleSelect) {
    const row = roleSelect.closest('tr[data-user-id]');
    saveAgencyUserRole(row).catch(error => {
      if (agencyAccountStatus) agencyAccountStatus.textContent = error.message || 'Could not save role';
    });
    return;
  }
  const operatorAdminSelect = event.target.closest('[data-operator-field="admin"]');
  if (operatorAdminSelect) {
    const row = operatorAdminSelect.closest('tr[data-user-id]');
    saveAgencyOperatorAdministrator(row).catch(error => {
      if (agencyAccountStatus) agencyAccountStatus.textContent = error.message || 'Could not save administrator';
    });
    return;
  }
  const select = event.target.closest('.agency-assignment-select');
  if (!select) return;
  const row = select.closest('tr[data-profile-id]');
  saveAgencyProfileAssignment(row).catch(error => {
    if (agencyAccountStatus) agencyAccountStatus.textContent = error.message || 'Could not save assignment';
  });
});
openLadyBtn?.addEventListener('click', async () => {
  try { await toggleLadyConnection(); }
  catch (error) { alert(error.message); }
});
logoutBtn?.addEventListener('click', logout);
adminBtn?.addEventListener('click', () => {
  if (currentUser?.role === 'operator') openOperatorSettings();
  else openAdmin();
});
adminClose?.addEventListener('click', closeAdmin);
adminSignOutBtn?.addEventListener('click', returnDirectorToAccessChoice);
adminModal?.addEventListener('click', event => {
  if (event.target.classList.contains('admin-backdrop')) closeAdmin();
});
operatorTranslatorSaveBtn?.addEventListener('click', saveOperatorTranslatorSettings);
agencyAccessSaveBtn?.addEventListener('click', () => saveAgencyAccessSettings('legacy'));
agencyAccessTestBtn?.addEventListener('click', () => testAgencyAccessSettings('legacy'));
agencyAdminSaveBtn?.addEventListener('click', () => saveAgencyAccessSettings('panel'));
agencyAdminTestBtn?.addEventListener('click', () => testAgencyAccessSettings('panel'));
[agencyAdminUrl, agencyAdminLogin, agencyAdminPassword].forEach(input => {
  input?.addEventListener('input', () => {
    agencyAdminFormEditing = true;
    if (agencyAdminStatus) agencyAdminStatus.textContent = 'Unsaved Agency admin credentials.';
  });
});
document.addEventListener('click', event => {
  const button = event.target.closest?.('#editOperatorAgencyTestBtn');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  testOperatorAgencyAccess();
});
translatorLangOptions.forEach(button => {
  button.addEventListener('click', () => setTranslatorReadTarget(button.dataset.translatorTarget, button.dataset.lang));
});
openAddProfileModalBtn?.addEventListener('click', () => {
  if (currentUser?.role === 'operator') return;
  openAddProfileModal();
});
cancelAddProfileBtn?.addEventListener('click', closeAddProfileModal);
addProfileModal?.addEventListener('click', event => {
  if (event.target.classList.contains('add-profile-backdrop')) closeAddProfileModal();
});
addProfileModal?.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeAddProfileModal();
  if (event.key === 'Enter') addProfileBtn?.click();
});
closeProfileSendingBtn?.addEventListener('click', closeProfileSendingModal);
cancelProfileSendingBtn?.addEventListener('click', closeProfileSendingModal);
profileSendingModal?.addEventListener('click', event => {
  if (event.target.classList.contains('add-profile-backdrop')) closeProfileSendingModal();
});
profileSendingModal?.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeProfileSendingModal();
  if (event.key === 'Enter') saveProfileSendingBtn?.click();
});
openAddUserModalBtn?.addEventListener('click', openAddUserModal);
cancelAddUserBtn?.addEventListener('click', closeAddUserModal);
newUserRoleToggle?.addEventListener('click', event => {
  const button = event.target.closest('.role-toggle-button');
  if (!button || button.classList.contains('hidden')) return;
  newUserRole.value = button.dataset.role;
  setRoleToggle(newUserRoleToggle, newUserRole.value);
});
editUserRoleToggle?.addEventListener('click', event => {
  const button = event.target.closest('.role-toggle-button');
  if (!button || button.classList.contains('hidden')) return;
  editUserRole.value = button.dataset.role;
  setRoleToggle(editUserRoleToggle, editUserRole.value);
  const user = managedUsers.find(item => item.id === userSettingsId.value) || {};
  renderEditOperatorManagerOptions(user);
});
addUserModal?.addEventListener('click', event => {
  if (event.target.classList.contains('add-profile-backdrop')) closeAddUserModal();
});
addUserModal?.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeAddUserModal();
  if (event.key === 'Enter') addOperatorBtn?.click();
});
adminModal?.addEventListener('input', event => {
  if (!event.target.classList.contains('profile-checklist-search')) return;
  const checklist = event.target.closest('.profile-checklist');
  if (!checklist) return;
  const query = event.target.value.trim().toLowerCase();
  let visible = 0;
  checklist.querySelectorAll('.profile-check-item').forEach(item => {
    const matched = !query || String(item.dataset.profileSearch || '').includes(query);
    item.classList.toggle('hidden', !matched);
    if (matched) visible++;
  });
  checklist.querySelector('.profile-checklist-empty')?.classList.toggle('hidden', visible > 0);
});
addProfileBtn?.addEventListener('click', async () => {
  addProfileBtn.disabled = true;
  addProfileBtn.textContent = 'Checking...';
  try {
    await addProfile();
  } catch (error) {
    adminStatus.textContent = error.message;
  } finally {
    addProfileBtn.disabled = false;
    addProfileBtn.textContent = 'Check Profile';
  }
});
saveProfileSendingBtn?.addEventListener('click', async () => {
  const profileId = profileSendingId.value;
  const profileName = profileSendingName?.value.trim() || '';
  const login = profileSendingLogin.value.trim();
  const password = profileSendingPassword.value;
  const googleDriveUrl = profileGoogleDriveUrl?.value.trim() || '';
  if (!profileId) {
    adminStatus.textContent = 'Profile is not selected.';
    return;
  }
  if ((login || password) && (!login || !password)) {
    adminStatus.textContent = 'Enter both login and password, or leave both empty.';
    return;
  }
  saveProfileSendingBtn.disabled = true;
  saveProfileSendingBtn.textContent = 'Saving...';
  try {
    const hasDreamCredentials = Boolean(login || password);
    const response = await fetch(hasDreamCredentials
      ? `/api/admin/profiles/${encodeURIComponent(profileId)}/credentials`
      : `/api/admin/profiles/${encodeURIComponent(profileId)}/google-drive`, {
      method: hasDreamCredentials ? 'PUT' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(hasDreamCredentials ? { name: profileName, login, password, googleDriveUrl } : { name: profileName, googleDriveUrl })
    });
    const raw = await response.text();
    let result = {};
    try {
      result = raw ? JSON.parse(raw) : {};
    } catch {
      throw new Error('Server returned a non-JSON response. Refresh the page and try again.');
    }
    if (!response.ok) throw new Error(result.error || 'Could not save profile settings');
    if (result.profile) mergeProfileSettings(result.profile);
    if (profileSendingStatus) profileSendingStatus.textContent = 'Saved.';
    adminStatus.textContent = 'Profile settings saved.';
    closeProfileSendingModal();
    await refreshAgencyLiveData({ reloadPanel: false });
    await loadAdmin();
    if (document.body.classList.contains('mandarin-home-active')) await loadAgencyAccountManager();
  } catch (error) {
    if (profileSendingStatus) profileSendingStatus.textContent = error.message;
    adminStatus.textContent = error.message;
  } finally {
    saveProfileSendingBtn.disabled = false;
    saveProfileSendingBtn.textContent = 'Save';
  }
});
syncProfileDreamBtn?.addEventListener('click', async () => {
  const profileId = profileSendingId.value;
  if (!profileId) return;
  syncProfileDreamBtn.disabled = true;
  syncProfileDreamBtn.textContent = 'Loading...';
  if (profileSendingStatus) profileSendingStatus.textContent = 'Loading data from Dream Singles...';
  try {
    const response = await fetch(`/api/admin/profiles/${encodeURIComponent(profileId)}/sync-dream`, { method: 'POST' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not load data from Dream');
    if (result.profile) {
      mergeProfileSettings(result.profile);
      if (profileSendingName) profileSendingName.value = result.profile.name || '';
    }
    if (profileSendingStatus) profileSendingStatus.textContent = 'Loaded from Dream.';
    await loadAdmin();
  } catch (error) {
    if (profileSendingStatus) profileSendingStatus.textContent = error.message;
  } finally {
    syncProfileDreamBtn.disabled = false;
    syncProfileDreamBtn.textContent = 'Load from Dream';
  }
});
cancelUserSettingsBtn?.addEventListener('click', closeUserSettingsModal);
closeUserSettingsBtn?.addEventListener('click', closeUserSettingsModal);
userSettingsModal?.addEventListener('click', event => {
  if (event.target.classList.contains('add-profile-backdrop')) closeUserSettingsModal();
});
userSettingsModal?.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeUserSettingsModal();
});
saveUserSettingsBtn?.addEventListener('click', async () => {
  const confirmed = await confirmSaveUserSettings();
  if (!confirmed) return;
  saveUserSettingsBtn.disabled = true;
  saveUserSettingsBtn.textContent = 'Saving...';
  try {
    await saveUserSettings();
  } catch (error) {
    adminStatus.textContent = error.message;
  } finally {
    saveUserSettingsBtn.disabled = false;
    saveUserSettingsBtn.textContent = 'Save';
  }
});
saveUserLoginBtn?.addEventListener('click', async () => {
  saveUserLoginBtn.disabled = true;
  saveUserLoginBtn.textContent = 'Saving...';
  try {
    await saveUserLogin();
  } catch (error) {
    adminStatus.textContent = error.message;
  } finally {
    saveUserLoginBtn.disabled = false;
    saveUserLoginBtn.textContent = 'Save';
  }
});
cancelDeleteUserBtn?.addEventListener('click', closeDeleteUserConfirm);
deleteUserConfirmModal?.addEventListener('click', event => {
  if (event.target.classList.contains('confirm-mini-backdrop')) closeDeleteUserConfirm();
});
confirmDeleteUserBtn?.addEventListener('click', async () => {
  confirmDeleteUserBtn.disabled = true;
  confirmDeleteUserBtn.textContent = 'Deleting...';
  try {
    await deleteUserSettings();
    closeDeleteUserConfirm();
    if (document.body.classList.contains('mandarin-home-active')) await loadAgencyAccountManager();
  } catch (error) {
    adminStatus.textContent = error.message;
  } finally {
    confirmDeleteUserBtn.disabled = false;
    confirmDeleteUserBtn.textContent = 'YES';
  }
});
cancelDeleteProfileBtn?.addEventListener('click', closeDeleteProfileConfirm);
deleteProfileConfirmModal?.addEventListener('click', event => {
  if (event.target.classList.contains('confirm-mini-backdrop')) closeDeleteProfileConfirm();
});
confirmDeleteProfileBtn?.addEventListener('click', async () => {
  confirmDeleteProfileBtn.disabled = true;
  confirmDeleteProfileBtn.textContent = 'Deleting...';
  try {
    await deletePendingProfile();
  } catch (error) {
    adminStatus.textContent = error.message;
    alert(error.message || 'Could not delete profile');
  } finally {
    confirmDeleteProfileBtn.disabled = false;
    confirmDeleteProfileBtn.textContent = 'YES';
  }
});
saveResetPasswordBtn?.addEventListener('click', async () => {
  saveResetPasswordBtn.disabled = true;
  saveResetPasswordBtn.textContent = 'Saving...';
  try {
    await resetUserPassword();
  } catch (error) {
    adminStatus.textContent = error.message;
  } finally {
    saveResetPasswordBtn.disabled = false;
    saveResetPasswordBtn.textContent = 'Save';
  }
});
addOperatorBtn?.addEventListener('click', async () => {
  addOperatorBtn.disabled = true;
  addOperatorBtn.textContent = 'Creating...';
  try {
    await addOperator();
  } catch (error) {
    adminStatus.textContent = error.message;
  } finally {
    addOperatorBtn.disabled = false;
    addOperatorBtn.textContent = 'Create User';
  }
});
salaryRateAddBtn?.addEventListener('click', () => {
  appendSalaryRateRow(salaryRatesList);
});
salaryRateSaveBtn?.addEventListener('click', saveSalaryRates);
agencySalaryCloseBtn?.addEventListener('click', () => setAgencySalaryModalOpen(false));
agencySalaryBackdrop?.addEventListener('click', () => setAgencySalaryModalOpen(false));
agencySalaryModal?.addEventListener('keydown', event => {
  if (event.key === 'Escape') setAgencySalaryModalOpen(false);
});
agencySalaryAddRowBtn?.addEventListener('click', () => appendSalaryRateRow(agencySalaryRows));
agencySalarySaveBtn?.addEventListener('click', saveAgencySalaryRates);
agencyTranslatorSaveBtn?.addEventListener('click', saveAgencyTranslatorSettings);
agencyTranslatorTestBtn?.addEventListener('click', testAgencyTranslator);
profilesAdminList?.addEventListener('click', async event => {
  const assignmentButton = event.target.closest('.profile-assignment-button');
  if (assignmentButton) {
    event.stopPropagation();
    const field = assignmentButton.closest('.profile-assignment-field');
    const menu = field?.querySelector('.profile-assignment-menu');
    profilesAdminList.querySelectorAll('.profile-assignment-menu').forEach(item => {
      if (item !== menu) item.classList.add('hidden');
    });
    menu?.classList.toggle('hidden');
    assignmentButton.setAttribute('aria-expanded', String(!menu?.classList.contains('hidden')));
    return;
  }

  const option = event.target.closest('.profile-assignment-option');
  if (!option) return;
  event.stopPropagation();
  const card = option.closest('.profile-admin-card');
  if (!card) return;
  if (option.classList.contains('active')) {
    closeProfileAssignmentMenus();
    return;
  }
  const profileName = card.dataset.profileName || card.querySelector('.profile-admin-copy strong')?.textContent?.trim() || card.dataset.profileId || 'анкету';
  const operatorId = option.dataset.operatorId || '';
  const operatorName = option.dataset.operatorName || option.textContent.trim() || '';
  const roleName = currentUser?.role === 'director' ? 'администратора' : 'оператора';
  const message = operatorId
    ? `Вы действительно хотите назначить анкету ${profileName} на ${roleName} ${operatorName}?`
    : `Вы действительно хотите снять анкету ${profileName} с текущего ${roleName}?`;
  if (!window.confirm(message)) {
    closeProfileAssignmentMenus();
    return;
  }
  adminStatus.textContent = 'Saving profile assignment...';
  try {
    const response = await fetch(`/api/admin/profiles/${encodeURIComponent(card.dataset.profileId)}/assignment`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operatorId })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not save assignment');
    adminStatus.textContent = 'Profile assignment saved.';
    await loadAdmin();
  } catch (error) {
    adminStatus.textContent = error.message;
    await loadAdmin();
  }
});
document.addEventListener('click', event => {
  if (event.target.closest('.profile-assignment-field')) return;
  closeProfileAssignmentMenus();
});
profilesAdminList?.addEventListener('change', async event => {
  if (!event.target.classList.contains('profile-photo-input')) return;
  const file = event.target.files?.[0];
  const card = event.target.closest('.profile-admin-card');
  if (!file || !card) return;
  if (file.size > 2 * 1024 * 1024) {
    adminStatus.textContent = 'Image must be smaller than 2 MB.';
    event.target.value = '';
    return;
  }
  adminStatus.textContent = 'Uploading photo...';
  try {
    const photoData = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Could not read image'));
      reader.readAsDataURL(file);
    });
    const response = await fetch(`/api/admin/profiles/${encodeURIComponent(card.dataset.profileId)}/photo`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photoData })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Upload failed');
    const profile = availableProfiles.find(item => item.id === card.dataset.profileId);
    if (profile) Object.assign(profile, result.profile);
    renderProfileSwitcher();
    await loadAdmin();
    adminStatus.textContent = 'Photo saved.';
  } catch (error) {
    adminStatus.textContent = error.message;
  }
});
profilesAdminList?.addEventListener('click', async event => {
  const card = event.target.closest('.profile-admin-card');
  if (event.target.closest('.profile-sending-button')) {
    if (!card) return;
    openProfileSending(card.dataset.profileId);
    return;
  }
  if (!event.target.closest('.profile-delete-button')) return;
  if (!card) return;
  openDeleteProfileConfirm(card.dataset.profileId);
});
saveDirectorProfilesBtn?.addEventListener('click', async () => {
  const profileIds = [...directorProfileChoices.querySelectorAll('input:checked')].map(input => input.value);
  const response = await fetch('/api/admin/me/profiles', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profileIds })
  });
  const result = await response.json();
  if (!response.ok) return void (adminStatus.textContent = result.error || 'Could not save profiles');
  if (!(result.profiles || []).some(profile => profile.id === activeProfileId)) localStorage.removeItem('dream_crm_profile_id');
  closeAdmin();
  applySession(result, true);
  adminStatus.textContent = 'Your working profiles were updated.';
});
operatorsList?.addEventListener('click', async event => {
  const row = event.target.closest('.operator-row');
  if (!row) return;
  if (event.target.classList.contains('operator-settings-button')) openUserSettings(row.dataset.userId);
});

(async function boot() {
  if (await refreshSession()) {
    if (document.body.classList.contains('mandarin-home-active')) return;
    if (activeProfileId && ladyConnected) {
      await loadMen();
    }
    await switchView(currentView);
    return;
  }
  const status = await fetch('/api/auth/status').then(response => response.json()).catch(() => ({ needsSetup: false }));
  showLogin(status.needsSetup);
})();

function installAgencyDashboardCompactStyles() {
  document.getElementById('agencyDashboardCompactStyles')?.remove();
  const style = document.createElement('style');
  style.id = 'agencyDashboardCompactStyles';
  style.dataset.agencyDashboardCompact = 'true';
  style.textContent = `
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-panel {
      padding:10px 24px!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-toolbar,
    body.mandarin-home-active.agency-shell-collapsed.agency-dashboard-active .agency-dashboard-toolbar {
      height:32px!important;
      min-height:32px!important;
      width:min(1220px,calc(100vw - 330px))!important;
      grid-template-columns:max-content max-content minmax(560px,1fr)!important;
      gap:6px!important;
      margin:0 auto 16px!important;
      max-width:1220px!important;
    }
    body.mandarin-home-active.agency-shell-collapsed.agency-dashboard-active .agency-dashboard-toolbar {
      width:min(1220px,calc(100vw - 210px))!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-year {
      width:82px!important;
      height:28px!important;
      min-height:28px!important;
      padding:0 9px!important;
      border-radius:5px!important;
      font-size:11px!important;
      font-weight:600!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-actions {
      height:28px!important;
      min-height:28px!important;
      display:flex!important;
      gap:6px!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-action-btn {
      width:auto!important;
      min-width:74px!important;
      height:28px!important;
      min-height:28px!important;
      padding:0 9px!important;
      border-radius:5px!important;
      font-size:9.5px!important;
      font-weight:650!important;
      white-space:nowrap!important;
      overflow:hidden!important;
      text-overflow:ellipsis!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-months {
      height:30px!important;
      min-height:30px!important;
      padding:3px!important;
      gap:2px!important;
      border-radius:5px!important;
      grid-template-columns:repeat(12,minmax(36px,1fr))!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-month {
      height:22px!important;
      min-height:22px!important;
      border-radius:4px!important;
      font-size:10.5px!important;
      font-weight:650!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-list,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonuses {
      max-height:calc(100vh - 96px)!important;
      width:min(1050px,calc(100vw - 330px))!important;
      max-width:1050px!important;
      margin:0 auto!important;
      border:1px solid #eadbd4!important;
      border-radius:10px!important;
      background:#fffaf7!important;
      box-shadow:0 1px 0 rgba(255,255,255,.75) inset!important;
      overflow:visible!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-list {
      overflow:hidden!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonuses {
      overflow:hidden!important;
      background:#fffaf7!important;
    }
    body.mandarin-home-active.agency-shell-collapsed.agency-dashboard-active .agency-dashboard-list,
    body.mandarin-home-active.agency-shell-collapsed.agency-dashboard-active .agency-dashboard-bonuses {
      width:min(1050px,calc(100vw - 210px))!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table {
      width:100%!important;
      min-width:0!important;
      table-layout:fixed!important;
      border:0!important;
      border-radius:0!important;
      clip-path:none!important;
      overflow:visible!important;
      font-size:11px!important;
      background:#fffaf7!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th {
      height:30px!important;
      padding:0 8px!important;
      background:#f1e5df!important;
      border-right:1px solid #eadbd4!important;
      border-bottom:1px solid #e3d3cc!important;
      border-top:0!important;
      border-right-width:1px!important;
      border-bottom-width:1px!important;
      color:#241f1b!important;
      font-size:10.5px!important;
      font-weight:750!important;
      vertical-align:middle!important;
      line-height:1.1!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table td {
      height:42px!important;
      padding:0 8px!important;
      background:#fffaf7!important;
      border-right:1px solid #eadbd4!important;
      border-bottom:1px solid #eadbd4!important;
      border-top:0!important;
      border-right-width:1px!important;
      border-bottom-width:1px!important;
      color:#241f1b!important;
      font-size:11px!important;
      font-weight:550!important;
      white-space:nowrap!important;
      overflow:hidden!important;
      text-overflow:ellipsis!important;
      vertical-align:middle!important;
      line-height:1.1!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th:last-child,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table td:last-child {
      border-right:0!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table thead th {
      border-top:0!important;
      box-shadow:none!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table thead tr,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table tbody tr {
      box-shadow:none!important;
      border:0!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table tbody tr:last-child td {
      border-bottom:0!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th:first-child,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th:last-child,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table tbody tr:last-child td:first-child,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table tbody tr:last-child td:last-child {
      border-radius:0!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th:nth-child(1),
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table td:nth-child(1) { width:5%!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th:nth-child(2),
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table td:nth-child(2) { width:17%!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th:nth-child(3),
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table td:nth-child(3) { width:16%!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th:nth-child(4),
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table td:nth-child(4) { width:16%!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th:nth-child(5),
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table td:nth-child(5) { width:6%!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th:nth-child(6),
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table td:nth-child(6) { width:10%!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th:nth-child(7),
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table td:nth-child(7) { width:9%!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th:nth-child(8),
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table td:nth-child(8) { width:9%!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th:nth-child(9),
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table td:nth-child(9) { width:12%!important; }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-badge {
      min-width:0!important;
      height:auto!important;
      min-height:0!important;
      padding:0!important;
      border-radius:0!important;
      background:transparent!important;
      font-size:10px!important;
      font-weight:650!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table b {
      min-width:58px!important;
      min-height:22px!important;
      height:22px!important;
      display:inline-flex!important;
      align-items:center!important;
      justify-content:center!important;
      padding:0 8px!important;
      border-radius:5px!important;
      font-size:11px!important;
      font-weight:650!important;
      line-height:1!important;
      vertical-align:middle!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-summary {
      width:min(1050px,calc(100vw - 330px))!important;
      max-width:1050px!important;
      min-height:34px!important;
      display:flex!important;
      align-items:center!important;
      justify-content:flex-end!important;
      gap:8px!important;
      margin:8px auto 0!important;
      padding:6px 10px!important;
      border:1px solid #eadbd4!important;
      border-radius:8px!important;
      background:#fffaf7!important;
      box-shadow:0 1px 0 rgba(255,255,255,.75) inset!important;
      box-sizing:border-box!important;
      color:#6f5f57!important;
      font-size:10px!important;
      font-weight:650!important;
    }
    body.mandarin-home-active.agency-shell-collapsed.agency-dashboard-active .agency-dashboard-summary {
      width:min(1050px,calc(100vw - 210px))!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-summary.hidden {
      display:none!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-summary b {
      min-width:64px!important;
      height:22px!important;
      display:inline-flex!important;
      align-items:center!important;
      justify-content:center!important;
      padding:0 8px!important;
      border-radius:5px!important;
      background:#eadbd4!important;
      color:#984a34!important;
      font-size:11px!important;
      font-weight:700!important;
      line-height:1!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonus-filters {
      min-height:48px!important;
      padding:9px 10px!important;
      gap:8px!important;
      grid-template-columns:32px 142px 142px 190px 72px minmax(230px,1fr)!important;
      border:0!important;
      border-bottom:1px solid #eadbd4!important;
      border-radius:0!important;
      background:#fffaf7!important;
      box-shadow:0 1px 0 rgba(255,255,255,.75) inset!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-calendar-chip,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonus-filters input,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonus-filters select,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonus-apply {
      height:28px!important;
      min-height:28px!important;
      border-radius:5px!important;
      font-size:10px!important;
      font-weight:550!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonus-filters label {
      gap:5px!important;
      font-size:9px!important;
      font-weight:550!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonus-total {
      height:28px!important;
      min-height:28px!important;
      padding:0 8px!important;
      border-radius:5px!important;
      gap:6px!important;
      justify-self:end!important;
      min-width:300px!important;
      border-color:#eadbd4!important;
      background:#fff7f2!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonus-total span {
      font-size:9px!important;
      font-weight:550!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonus-total strong {
      min-width:40px!important;
      height:20px!important;
      min-height:20px!important;
      padding:0 6px!important;
      border-radius:4px!important;
      font-size:10px!important;
      font-weight:650!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-empty {
      padding:14px!important;
      font-size:11px!important;
      font-weight:550!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-list,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonuses {
      border:1px solid #e7d7cf!important;
      border-radius:9px!important;
      background:#fffaf7!important;
      box-shadow:none!important;
      clip-path:none!important;
      overflow:hidden!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table {
      width:100%!important;
      border:0!important;
      border-collapse:separate!important;
      border-spacing:0!important;
      border-radius:0!important;
      clip-path:none!important;
      overflow:visible!important;
      background:#fffaf7!important;
      box-shadow:none!important;
      outline:0!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table thead,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table tbody,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table tr {
      border:0!important;
      box-shadow:none!important;
      outline:0!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table td {
      border-top:0!important;
      border-left:0!important;
      border-right:1px solid #eadbd4!important;
      border-bottom:1px solid #eadbd4!important;
      box-shadow:none!important;
      outline:0!important;
      vertical-align:middle!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th {
      height:29px!important;
      background:#f0e4de!important;
      border-bottom-color:#ddcbc2!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table td {
      height:40px!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th:last-child,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table td:last-child {
      border-right:0!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table tbody tr:last-child td {
      border-bottom:0!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th:first-child,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table th:last-child,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table td:first-child,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table td:last-child {
      border-radius:0!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-table b,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-summary b,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonus-total b,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonus-total strong {
      min-width:48px!important;
      height:19px!important;
      min-height:19px!important;
      padding:0 7px!important;
      border-radius:5px!important;
      display:inline-flex!important;
      align-items:center!important;
      justify-content:center!important;
      background:#eadbd4!important;
      color:#984a34!important;
      font-size:10px!important;
      font-weight:700!important;
      line-height:1!important;
      box-sizing:border-box!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-summary {
      min-height:31px!important;
      padding:5px 9px!important;
      border:1px solid #e7d7cf!important;
      border-radius:7px!important;
      gap:7px!important;
      font-size:10px!important;
      box-shadow:none!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonus-filters {
      min-height:46px!important;
      padding:8px 10px!important;
      grid-template-columns:36px 154px 154px 190px 70px minmax(238px,1fr)!important;
      gap:8px!important;
      border-bottom:1px solid #eadbd4!important;
      background:#fffaf7!important;
      box-shadow:none!important;
      overflow:hidden!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-calendar-chip {
      width:28px!important;
      height:28px!important;
      min-width:28px!important;
      min-height:28px!important;
      justify-self:start!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-calendar-chip svg {
      width:15px!important;
      height:15px!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonus-filters label {
      grid-template-columns:32px minmax(0,1fr)!important;
      gap:6px!important;
      font-size:9px!important;
      min-width:0!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonus-filters input,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonus-filters select,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonus-apply {
      height:28px!important;
      min-height:28px!important;
      border-radius:5px!important;
      font-size:10px!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonus-total {
      min-width:260px!important;
      height:28px!important;
      min-height:28px!important;
      padding:0 7px!important;
      gap:5px!important;
      border:1px solid #eadbd4!important;
      border-radius:6px!important;
      background:#fff7f2!important;
      box-shadow:none!important;
      justify-self:end!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonus-total span {
      font-size:9px!important;
      font-weight:650!important;
      white-space:nowrap!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-toolbar,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-status,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-list,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonuses,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-summary {
      width:min(1260px,calc(100vw - 360px))!important;
      max-width:1260px!important;
      margin-left:auto!important;
      margin-right:auto!important;
      box-sizing:border-box!important;
    }
    body.mandarin-home-active.agency-shell-collapsed.agency-dashboard-active .agency-dashboard-toolbar,
    body.mandarin-home-active.agency-shell-collapsed.agency-dashboard-active .agency-dashboard-status,
    body.mandarin-home-active.agency-shell-collapsed.agency-dashboard-active .agency-dashboard-list,
    body.mandarin-home-active.agency-shell-collapsed.agency-dashboard-active .agency-dashboard-bonuses,
    body.mandarin-home-active.agency-shell-collapsed.agency-dashboard-active .agency-dashboard-summary {
      width:min(1260px,calc(100vw - 240px))!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-toolbar,
    body.mandarin-home-active.agency-shell-collapsed.agency-dashboard-active .agency-dashboard-toolbar {
      grid-template-columns:max-content max-content minmax(0,1fr)!important;
      margin-top:10px!important;
      margin-bottom:8px!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-status {
      min-height:18px!important;
      height:18px!important;
      margin-top:0!important;
      margin-bottom:8px!important;
      padding:0 2px!important;
      color:#8f8076!important;
      font-size:11px!important;
      font-weight:500!important;
      line-height:18px!important;
      text-align:left!important;
      overflow:hidden!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-status:empty {
      display:none!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-bonuses,
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-list {
      margin-top:0!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-year {
      width:84px!important;
      height:30px!important;
      min-height:30px!important;
      padding:0 24px 0 13px!important;
      border-radius:7px!important;
      line-height:30px!important;
      text-align:left!important;
      appearance:none!important;
      -webkit-appearance:none!important;
      background-image:linear-gradient(45deg,transparent 50%,#9b8b82 50%),linear-gradient(135deg,#9b8b82 50%,transparent 50%)!important;
      background-position:calc(100% - 17px) 13px,calc(100% - 12px) 13px!important;
      background-size:5px 5px,5px 5px!important;
      background-repeat:no-repeat!important;
    }
    body.mandarin-home-active.agency-dashboard-active .agency-dashboard-year::-ms-expand {
      display:none!important;
    }
    body.mandarin-home-active.app-dark-theme.agency-dashboard-active .agency-dashboard-list,
    body.mandarin-home-active.app-dark-theme.agency-dashboard-active .agency-dashboard-bonuses,
    body.mandarin-home-active.app-dark-theme.agency-dashboard-active .agency-dashboard-summary {
      border-color:#3a312a!important;
      background:#171411!important;
      color:#f5eee9!important;
    }
    body.mandarin-home-active.app-dark-theme.agency-dashboard-active .agency-dashboard-table {
      background:#171411!important;
      color:#f5eee9!important;
    }
    body.mandarin-home-active.app-dark-theme.agency-dashboard-active .agency-dashboard-table th {
      background:#201c19!important;
      color:#f5eee9!important;
      border-right-color:#332922!important;
      border-bottom-color:#3a312a!important;
    }
    body.mandarin-home-active.app-dark-theme.agency-dashboard-active .agency-dashboard-table td {
      background:#171411!important;
      color:#f5eee9!important;
      border-right-color:#332922!important;
      border-bottom-color:#332922!important;
    }
    body.mandarin-home-active.app-dark-theme.agency-dashboard-active .agency-dashboard-badge {
      color:#f2d1c5!important;
    }
    body.mandarin-home-active.app-dark-theme.agency-dashboard-active .agency-dashboard-table b,
    body.mandarin-home-active.app-dark-theme.agency-dashboard-active .agency-dashboard-summary b,
    body.mandarin-home-active.app-dark-theme.agency-dashboard-active .agency-dashboard-bonus-total b,
    body.mandarin-home-active.app-dark-theme.agency-dashboard-active .agency-dashboard-bonus-total strong {
      background:#2d261f!important;
      color:#f1a58c!important;
    }
    body.mandarin-home-active.app-dark-theme.agency-dashboard-active .agency-dashboard-summary,
    body.mandarin-home-active.app-dark-theme.agency-dashboard-active .agency-dashboard-bonus-total {
      background:#171411!important;
      border-color:#3a312a!important;
      color:#b9aaa0!important;
    }
    body.mandarin-home-active.app-dark-theme.agency-dashboard-active .agency-dashboard-bonus-filters {
      background:#171411!important;
      border-bottom-color:#3a312a!important;
      color:#f5eee9!important;
    }
    body.mandarin-home-active.app-dark-theme.agency-dashboard-active .agency-dashboard-calendar-chip,
    body.mandarin-home-active.app-dark-theme.agency-dashboard-active .agency-dashboard-bonus-filters input,
    body.mandarin-home-active.app-dark-theme.agency-dashboard-active .agency-dashboard-bonus-filters select,
    body.mandarin-home-active.app-dark-theme.agency-dashboard-active .agency-dashboard-bonus-apply {
      border-color:#3a312a!important;
      background:#1b1816!important;
      color:#f5eee9!important;
    }
  `;
  document.head.appendChild(style);
}

installAgencyDashboardCompactStyles();
setTimeout(installAgencyDashboardCompactStyles, 0);
setTimeout(installAgencyDashboardCompactStyles, 500);


