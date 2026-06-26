const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('agencyElectron', {
  isElectron: true,
  prepareDreamProfile: async profileId => {
    const id = String(profileId || '');
    if (!id) throw new Error('Choose a profile first');
    const response = await fetch(`/api/profiles/${encodeURIComponent(id)}/launch`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) {
      throw new Error(result.error || 'Could not prepare Dream profile');
    }
    return ipcRenderer.invoke('agency:prepare-dream-profile', {
      profileId: id,
      token: result.token,
      baseUrl: window.location.origin
    });
  },
  logoutDreamProfile: async profileId => {
    const id = String(profileId || '');
    if (!id) return { ok: true };
    return ipcRenderer.invoke('agency:logout-dream-profile', { profileId: id });
  },
  openDreamUrl: async (profileId, url = 'https://www.dream-singles.com/members/messaging/inbox') => {
    const id = String(profileId || '');
    if (!id) throw new Error('Choose a profile first');
    const firstTry = await ipcRenderer.invoke('agency:open-dream-window', {
      profileId: id,
      url,
      baseUrl: window.location.origin
    });
    if (firstTry?.ok) return firstTry;
    if (!firstTry?.needsLaunch) return firstTry;

    const response = await fetch(`/api/profiles/${encodeURIComponent(id)}/launch`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) {
      throw new Error(result.error || 'Could not prepare Dream window');
    }
    return ipcRenderer.invoke('agency:open-dream-window', {
      profileId: id,
      url,
      token: result.token,
      baseUrl: window.location.origin
    });
  },
  openDreamWindow: async profileId => {
    return ipcRenderer.invoke('agency:open-dream-window', {
      profileId: String(profileId || ''),
      url: 'https://www.dream-singles.com/members/messaging/inbox',
      baseUrl: window.location.origin
    });
  },
  navigate: async action => ipcRenderer.invoke('agency:navigate', String(action || '')),
  checkForUpdates: async () => ipcRenderer.invoke('agency:check-for-updates'),
  installUpdate: async () => ipcRenderer.invoke('agency:install-update'),
  openExternalUrl: async url => ipcRenderer.invoke('agency:open-external-url', String(url || ''))
});
