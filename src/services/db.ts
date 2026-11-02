import { ActivityRecord, OfflineRegion, DigitalRoute, ActiveSessionSnapshot } from '../types/cycling';

const DB_NAME = 'ridetrack_gps_db';
const DB_VERSION = 3;
const ACTIVE_SESSION_LOCAL_KEY = 'ridetrack_active_session_backup_v1';

let dbPromise: Promise<IDBDatabase> | null = null;

export function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Store for cached map tiles
      if (!db.objectStoreNames.contains('offline_tiles')) {
        db.createObjectStore('offline_tiles', { keyPath: 'key' });
      }

      // Store for metadata of downloaded regions
      if (!db.objectStoreNames.contains('offline_regions')) {
        db.createObjectStore('offline_regions', { keyPath: 'id' });
      }

      // Store for finished and confirmed activities
      if (!db.objectStoreNames.contains('activities')) {
        const activityStore = db.createObjectStore('activities', { keyPath: 'id' });
        activityStore.createIndex('startTime', 'startTime', { unique: false });
      }

      // Store for offline digital road bike routes
      if (!db.objectStoreNames.contains('offline_routes')) {
        db.createObjectStore('offline_routes', { keyPath: 'id' });
      }

      // Store for periodic in-progress GPS session recovery
      if (!db.objectStoreNames.contains('active_session')) {
        db.createObjectStore('active_session', { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });

  return dbPromise;
}

// Active Session Auto-Save & Crash/Reload Recovery
export function saveActiveSessionSyncFallback(snapshot: ActiveSessionSnapshot): void {
  try {
    // Keep up to the most recent 600 points in synchronous localStorage fallback for beforeunload/pagehide
    const compactSnapshot: ActiveSessionSnapshot =
      snapshot.points.length > 600
        ? {
            ...snapshot,
            points: snapshot.points.slice(snapshot.points.length - 600),
          }
        : snapshot;
    localStorage.setItem(ACTIVE_SESSION_LOCAL_KEY, JSON.stringify(compactSnapshot));
  } catch {
    // Ignore quota errors on synchronous backup
  }
}

export async function saveActiveSession(snapshot: ActiveSessionSnapshot): Promise<void> {
  saveActiveSessionSyncFallback(snapshot);
  try {
    const db = await getDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('active_session', 'readwrite');
      const store = tx.objectStore('active_session');
      const req = store.put(snapshot);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Fallback already written to localStorage
  }
}

export async function getActiveSession(): Promise<ActiveSessionSnapshot | null> {
  let idbSnapshot: ActiveSessionSnapshot | null = null;
  try {
    const db = await getDB();
    idbSnapshot = await new Promise<ActiveSessionSnapshot | null>((resolve) => {
      try {
        const tx = db.transaction('active_session', 'readonly');
        const store = tx.objectStore('active_session');
        const req = store.get('current_active_session');
        req.onsuccess = () => resolve((req.result as ActiveSessionSnapshot) || null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  } catch {
    idbSnapshot = null;
  }

  let localSnapshot: ActiveSessionSnapshot | null = null;
  try {
    const raw = localStorage.getItem(ACTIVE_SESSION_LOCAL_KEY);
    if (raw) {
      localSnapshot = JSON.parse(raw) as ActiveSessionSnapshot;
    }
  } catch {
    localSnapshot = null;
  }

  if (idbSnapshot && localSnapshot) {
    // Prefer whichever has newer lastSavedAt AND full points array
    if (localSnapshot.lastSavedAt > idbSnapshot.lastSavedAt && localSnapshot.points.length >= idbSnapshot.points.length) {
      return localSnapshot;
    }
    return idbSnapshot;
  }
  return idbSnapshot || localSnapshot;
}

export async function clearActiveSession(): Promise<void> {
  try {
    localStorage.removeItem(ACTIVE_SESSION_LOCAL_KEY);
  } catch {
    // ignore
  }
  try {
    const db = await getDB();
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction('active_session', 'readwrite');
        const store = tx.objectStore('active_session');
        const req = store.delete('current_active_session');
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  } catch {
    // ignore
  }
}

// Tile caching
export async function saveTile(key: string, blob: Blob, mimeType: string = 'image/png'): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline_tiles', 'readwrite');
    const store = tx.objectStore('offline_tiles');
    const req = store.put({ key, blob, mimeType, savedAt: Date.now() });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getTile(key: string): Promise<Blob | null> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline_tiles', 'readonly');
    const store = tx.objectStore('offline_tiles');
    const req = store.get(key);
    req.onsuccess = () => {
      if (req.result && req.result.blob) {
        resolve(req.result.blob);
      } else {
        resolve(null);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteTilesByPrefix(prefix: string): Promise<number> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline_tiles', 'readwrite');
    const store = tx.objectStore('offline_tiles');
    let deletedCount = 0;
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        if (typeof cursor.key === 'string' && cursor.key.startsWith(prefix)) {
          cursor.delete();
          deletedCount++;
        }
        cursor.continue();
      } else {
        resolve(deletedCount);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

export async function countTiles(): Promise<number> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline_tiles', 'readonly');
    const store = tx.objectStore('offline_tiles');
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Offline Regions
export async function saveOfflineRegion(region: OfflineRegion): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline_regions', 'readwrite');
    const store = tx.objectStore('offline_regions');
    const req = store.put(region);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getOfflineRegions(): Promise<OfflineRegion[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline_regions', 'readonly');
    const store = tx.objectStore('offline_regions');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteOfflineRegion(id: string): Promise<void> {
  const db = await getDB();
  await deleteTilesByPrefix(`reg_${id}_`);
  return new Promise((resolve, reject) => {
    const tx = db.transaction('offline_regions', 'readwrite');
    const store = tx.objectStore('offline_regions');
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// Activities (Confirmed & Saved Only)
export async function saveActivity(activity: ActivityRecord): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('activities', 'readwrite');
    const store = tx.objectStore('activities');
    const req = store.put(activity);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getActivities(): Promise<ActivityRecord[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('activities', 'readonly');
    const store = tx.objectStore('activities');
    const req = store.getAll();
    req.onsuccess = () => {
      const records = req.result || [];
      records.sort((a, b) => b.startTime - a.startTime);
      resolve(records);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getActivity(id: string): Promise<ActivityRecord | null> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('activities', 'readonly');
    const store = tx.objectStore('activities');
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteActivity(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('activities', 'readwrite');
    const store = tx.objectStore('activities');
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// Storage Quota
export async function getStorageQuota(): Promise<{ usedBytes: number; quotaBytes: number; percentage: number }> {
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      const used = estimate.usage || 0;
      const quota = estimate.quota || 1024 * 1024 * 500;
      return {
        usedBytes: used,
        quotaBytes: quota,
        percentage: Math.min(100, Math.round((used / quota) * 100)),
      };
    } catch {
      // ignore
    }
  }
  return { usedBytes: 0, quotaBytes: 500 * 1024 * 1024, percentage: 0 };
}

// Digital Road Bike Routes (Offline Storage)
export async function saveOfflineRoute(route: DigitalRoute): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction('offline_routes', 'readwrite');
      const store = tx.objectStore('offline_routes');
      const req = store.put(route);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    } catch (err) {
      try {
        localStorage.setItem(`offline_route_${route.id}`, JSON.stringify(route));
        resolve();
      } catch (localErr) {
        reject(err || localErr);
      }
    }
  });
}

export async function getOfflineRoutes(): Promise<DigitalRoute[]> {
  const db = await getDB();
  return new Promise((resolve) => {
    try {
      const tx = db.transaction('offline_routes', 'readonly');
      const store = tx.objectStore('offline_routes');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => {
        const routes: DigitalRoute[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('offline_route_')) {
            try {
              routes.push(JSON.parse(localStorage.getItem(key)!));
            } catch {
              // ignore
            }
          }
        }
        resolve(routes);
      };
    } catch {
      const routes: DigitalRoute[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('offline_route_')) {
          try {
            routes.push(JSON.parse(localStorage.getItem(key)!));
          } catch {
            // ignore
          }
        }
      }
      resolve(routes);
    }
  });
}

export async function getOfflineRoute(id: string): Promise<DigitalRoute | null> {
  const db = await getDB();
  return new Promise((resolve) => {
    try {
      const tx = db.transaction('offline_routes', 'readonly');
      const store = tx.objectStore('offline_routes');
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => {
        const item = localStorage.getItem(`offline_route_${id}`);
        resolve(item ? JSON.parse(item) : null);
      };
    } catch {
      const item = localStorage.getItem(`offline_route_${id}`);
      resolve(item ? JSON.parse(item) : null);
    }
  });
}

export async function deleteOfflineRoute(id: string): Promise<void> {
  const db = await getDB();
  await deleteTilesByPrefix(`route_${id}_`);
  try {
    localStorage.removeItem(`offline_route_${id}`);
  } catch {
    // ignore
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction('offline_routes', 'readwrite');
      const store = tx.objectStore('offline_routes');
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}
