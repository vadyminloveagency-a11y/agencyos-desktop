(function () {
  document.documentElement.dataset.agencyZoomBridgeLoaded = '2';

  const globalZoomKey = 'agencyos_global_zoom_v1';
  const oldPanelZoomKey = 'agencyos_panel_zoom_v2';
  const minZoom = 0.6;
  const maxZoom = 1.8;
  const step = 0.05;

  function clamp(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 1;
    return Math.max(minZoom, Math.min(maxZoom, n));
  }

  function activePanel() {
    const visible = Array.from(document.querySelectorAll('[data-agency-panel]')).find(item => !item.classList.contains('hidden'));
    return visible?.dataset?.agencyPanel || '';
  }

  function migrateOldPanelZoom() {
    try {
      if (localStorage.getItem(globalZoomKey)) return;
      const parsed = JSON.parse(localStorage.getItem(oldPanelZoomKey) || '{}');
      if (!parsed || typeof parsed !== 'object') return;
      const panel = activePanel();
      const preferred = parsed[panel] || parsed.inbox || parsed.favorites || parsed['account-manager'];
      if (preferred) localStorage.setItem(globalZoomKey, String(clamp(preferred)));
    } catch (_) {}
  }

  function readZoom() {
    migrateOldPanelZoom();
    try {
      return clamp(localStorage.getItem(globalZoomKey) || 1);
    } catch (_) {
      return 1;
    }
  }

  function writeZoom(zoom) {
    const safeZoom = clamp(zoom);
    try {
      localStorage.setItem(globalZoomKey, String(safeZoom));
      localStorage.removeItem(oldPanelZoomKey);
    } catch (_) {}
    return safeZoom;
  }

  function installIframeWheel(frame) {
    try {
      const doc = frame.contentDocument;
      if (!doc || doc.documentElement.dataset.agencyIframeWheelBridge === '2') return;
      doc.documentElement.dataset.agencyIframeWheelBridge = '2';
      doc.addEventListener('wheel', event => {
        if (!event.ctrlKey) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        changeZoom(event.deltaY < 0 ? 1 : -1);
      }, { capture: true, passive: false });
    } catch (_) {}
  }

  function setWorkspaceZoom(zoom) {
    document.querySelectorAll('#agencyInboxFrame, #workspaceEmbedFrame, iframe[src*="workspace.html"]').forEach(frame => {
      const apply = () => {
        try {
          const doc = frame.contentDocument;
          if (!doc) return;
          doc.documentElement.style.setProperty('--workspace-local-zoom', '1');
          if (doc.body) doc.body.classList.remove('workspace-local-zoom-active');
          installIframeWheel(frame);
        } catch (_) {}
      };
      apply();
      if (frame.dataset.agencyZoomBridgeFallback === '3') return;
      frame.dataset.agencyZoomBridgeFallback = '3';
      frame.addEventListener('load', () => setWorkspaceZoom(1), { passive: true });
    });
  }

  function applyZoom(zoom, persist) {
    const safeZoom = persist ? writeZoom(zoom) : clamp(zoom);
    document.documentElement.style.setProperty('--main-page-zoom', String(safeZoom));
    setWorkspaceZoom(safeZoom);
    try { window.lockFavoritesScrollContainer?.(); } catch (_) {}
    return safeZoom;
  }

  function changeZoom(direction) {
    const next = Math.round((readZoom() + direction * step) * 100) / 100;
    applyZoom(next, true);
  }

  function syncZoom() {
    applyZoom(readZoom(), false);
  }

  document.documentElement.dataset.agencyZoomBridgeWheel = 'installing';
  document.addEventListener('wheel', event => {
    if (!event.ctrlKey || !document.body.classList.contains('mandarin-home-active')) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    changeZoom(event.deltaY < 0 ? 1 : -1);
  }, { capture: true, passive: false });

  document.addEventListener('keydown', event => {
    if (!event.ctrlKey || event.altKey || !document.body.classList.contains('mandarin-home-active')) return;
    const key = event.key;
    const code = event.code;
    const plus = key === '+' || key === '=' || code === 'Equal' || code === 'NumpadAdd';
    const minus = key === '-' || code === 'Minus' || code === 'NumpadSubtract';
    const reset = key === '0' || code === 'Digit0' || code === 'Numpad0';
    if (!plus && !minus && !reset) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    if (reset) applyZoom(1, true);
    else changeZoom(plus ? 1 : -1);
  }, { capture: true });

  document.addEventListener('click', event => {
    if (!event.target.closest('.agency-shell-nav-item')) return;
    setTimeout(syncZoom, 0);
    setTimeout(syncZoom, 120);
  }, true);

  window.agencyZoomBridgeSync = syncZoom;
  window.agencyZoomBridgeSet = value => applyZoom(value, true);
  window.applyAgencyPanelZoomForPanel = syncZoom;
  window.applyBrowserZoomCompensation = syncZoom;
  globalThis.agencyZoomBridgeSync = syncZoom;

  document.documentElement.dataset.agencyZoomBridgeWheel = 'installed';
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncZoom, { once: true });
  else syncZoom();
  window.addEventListener('load', syncZoom, { once: true });
  window.addEventListener('resize', syncZoom, { passive: true });
  window.visualViewport?.addEventListener('resize', syncZoom, { passive: true });
  document.documentElement.dataset.agencyZoomBridgeDone = '2';
})();