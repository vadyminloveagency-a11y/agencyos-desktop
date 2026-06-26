import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = path.join(rootDir, 'data.json');
const outDir = path.join(rootDir, 'runtime-data');

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value ?? {}, null, 2)}\n`);
}

function removeDir(filePath) {
  if (fs.existsSync(filePath)) fs.rmSync(filePath, { recursive: true, force: true });
}

function objectWithout(source, keys) {
  const blocked = new Set(keys);
  return Object.fromEntries(Object.entries(source || {}).filter(([key]) => !blocked.has(key)));
}

function normalizeMonth(value) {
  const direct = String(value || '').match(/\d{4}-\d{2}/)?.[0];
  if (direct) return direct;
  const time = Date.parse(value || '');
  if (!Number.isFinite(time)) return 'unknown';
  return new Date(time).toISOString().slice(0, 7);
}

function normalizeBusinessDate(value, fallback = '') {
  const direct = String(value || '').match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (direct) return direct;
  const time = Date.parse(value || fallback || '');
  if (!Number.isFinite(time)) return '';
  return new Date(time).toISOString().slice(0, 10);
}

function toArrayMap(value) {
  if (Array.isArray(value)) return Object.fromEntries(value.map((item, index) => [String(item?.id || index), item]));
  return value && typeof value === 'object' ? value : {};
}

function splitProfileData(db, profileId, profile) {
  const profileDir = path.join(outDir, 'profiles', profileId);
  const assignmentHistory = Array.isArray(db.assignmentHistory?.[profileId]) ? db.assignmentHistory[profileId] : [];
  const men = toArrayMap(profile.men);
  const otherMen = toArrayMap(profile.otherMen);
  const allMen = { ...otherMen, ...men };
  const inbox = Array.isArray(profile.workspaceInbox) ? profile.workspaceInbox : [];
  const media = Array.isArray(profile.workspaceMediaGallery) ? profile.workspaceMediaGallery : [];

  const notes = {};
  const dashboard = {};
  for (const [manId, man] of Object.entries(allMen)) {
    const note = String(man?.note || '').trim();
    const status = String(man?.status || '').trim();
    if (note || status) {
      notes[manId] = {
        manId,
        note,
        status,
        updatedAt: man?.noteUpdatedAt || man?.updatedAt || ''
      };
    }
    dashboard[manId] = {
      manId,
      favorite: man?.favorite === true,
      siteFavorite: man?.siteFavorite === true,
      pinned: man?.pinned === true,
      ignored: man?.ignored === true || man?.siteIgnored === true,
      onlineNow: man?.onlineNow === true,
      lastActivityText: man?.lastActivityText || '',
      onlineCheckedAt: man?.onlineCheckedAt || ''
    };
  }

  const dialogs = {};
  const sent = [];
  for (const letter of inbox) {
    const manId = String(letter?.id || letter?.manId || '').trim();
    if (!manId) continue;
    const conversation = Array.isArray(letter?.conversation) ? letter.conversation : [];
    if (conversation.length) {
      dialogs[manId] ||= { manId, letters: [] };
      dialogs[manId].letters.push(...conversation);
      for (const item of conversation) {
        const direction = String(item?.direction || '').toLowerCase();
        if (['outgoing', 'sent', 'lady'].includes(direction)) {
          sent.push({ manId, ...item });
        }
      }
    }
  }

  writeJson(path.join(profileDir, 'profile.json'), objectWithout(profile, [
    'credentials',
    'men',
    'otherMen',
    'workspaceInbox',
    'workspaceMediaGallery'
  ]));
  writeJson(path.join(profileDir, 'credentials.json'), {
    profileId,
    encrypted: true,
    credentials: profile.credentials || {},
    googleDrive: profile.googleDrive || {}
  });
  writeJson(path.join(profileDir, 'assignments.json'), {
    profileId,
    activeOwnerAdminId: profile.ownerAdminId || '',
    history: assignmentHistory
  });
  writeJson(path.join(profileDir, 'men.json'), { men, otherMen });
  writeJson(path.join(profileDir, 'notes.json'), notes);
  writeJson(path.join(profileDir, 'inbox.json'), inbox);
  writeJson(path.join(profileDir, 'sent.json'), sent);
  writeJson(path.join(profileDir, 'dialogs.json'), dialogs);
  writeJson(path.join(profileDir, 'media.json'), media);
  writeJson(path.join(profileDir, 'dashboard.json'), dashboard);
  writeJson(path.join(profileDir, 'sync-state.json'), {
    profileId,
    inboxCount: inbox.length,
    mediaCount: media.length,
    exportedAt: new Date().toISOString(),
    lastInboxSavedAt: inbox.map(item => item?.savedAt).filter(Boolean).sort().at(-1) || '',
    lastMediaRefreshAt: media.map(item => item?.savedAt || item?.updatedAt || item?.fetchedAt).filter(Boolean).sort().at(-1) || ''
  });
}

function splitAdminPanelData(db) {
  for (const dirName of ['ledger', 'snapshots', 'cell-colors', 'cell-comments']) {
    fs.mkdirSync(path.join(outDir, 'admin-panel', dirName), { recursive: true });
  }

  const ledgerByMonth = {};
  for (const [id, row] of Object.entries(db.agencyBonusLedger || {})) {
    const businessDate = normalizeBusinessDate(row.businessDate || row.date, row.fetchedAt);
    const month = normalizeMonth(businessDate || row.date || row.fetchedAt);
    ledgerByMonth[month] ||= {};
    ledgerByMonth[month][id] = {
      ...row,
      id: row.id || id,
      businessDate,
      profileId: String(row.profileId || ''),
      operatorId: String(row.assignedOperatorId || row.operatorId || ''),
      operatorName: row.assignedOperatorName || row.operatorName || '',
      source: row.source || 'agency-bonuses'
    };
  }

  for (const [month, rows] of Object.entries(ledgerByMonth)) {
    writeJson(path.join(outDir, 'admin-panel', 'ledger', `${month}.json`), rows);
  }
  writeJson(path.join(outDir, 'admin-panel', 'ledger', 'index.json'), {
    months: Object.keys(ledgerByMonth).sort(),
    rowCount: Object.values(ledgerByMonth).reduce((sum, rows) => sum + Object.keys(rows).length, 0)
  });
  writeJson(path.join(outDir, 'admin-panel', 'snapshots', 'index.json'), {
    note: 'Snapshots are cache files. Ledger is the source of truth.',
    months: []
  });
  for (const [month, colors] of Object.entries(db.adminPanelCellColors || {})) {
    writeJson(path.join(outDir, 'admin-panel', 'cell-colors', `${month}.json`), colors);
  }
  for (const [month, comments] of Object.entries(db.adminPanelCellComments || {})) {
    writeJson(path.join(outDir, 'admin-panel', 'cell-comments', `${month}.json`), comments);
  }
  writeJson(path.join(outDir, 'admin-panel', 'settings.json'), {
    salaryRates: db.salaryRates || [],
    salaryFeePercent: db.salaryFeePercent,
    exportedAt: new Date().toISOString()
  });
  writeJson(path.join(outDir, 'admin-panel', 'refresh-state.json'), {
    exportedAt: new Date().toISOString(),
    ledgerMonths: Object.keys(ledgerByMonth).sort()
  });
}

function exportRuntimeData() {
  const db = readJson(dataPath);
  if (!db || typeof db !== 'object') {
    throw new Error(`Cannot read ${dataPath}`);
  }

  removeDir(outDir);
  fs.mkdirSync(outDir, { recursive: true });

  writeJson(path.join(outDir, 'manifest.json'), {
    source: 'data.json',
    exportedAt: new Date().toISOString(),
    mode: 'mirror-only',
    note: 'CRM still reads data.json. These files are a separated data mirror.'
  });

  writeJson(path.join(outDir, 'auth', 'users.json'), db.users || {});
  writeJson(path.join(outDir, 'auth', 'sessions.json'), db.sessions || {});
  writeJson(path.join(outDir, 'settings', 'translator.json'), db.translator || {});
  writeJson(path.join(outDir, 'settings', 'translation-cache.json'), db.translationCache || {});

  const profiles = db.profiles || {};
  writeJson(path.join(outDir, 'profiles', 'index.json'), Object.fromEntries(
    Object.entries(profiles).map(([id, profile]) => [id, {
      id,
      name: profile?.name || `Profile ${id}`,
      active: profile?.active !== false,
      photoUrl: profile?.photoUrl || '',
      ownerAdminId: profile?.ownerAdminId || ''
    }])
  ));

  for (const [profileId, profile] of Object.entries(profiles)) {
    splitProfileData(db, String(profileId), profile || {});
  }

  splitAdminPanelData(db);
}

exportRuntimeData();
console.log(`Exported separated data mirror to ${outDir}`);
