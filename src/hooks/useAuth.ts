import { useState, useEffect, useCallback, useRef } from 'react';
import {
  auth,
  signInWithGoogle,
  switchGoogleAccount,
  logOut,
  synchronizeUserData,
  subscribeToCloudActivities,
  getReadableSyncError,
  onAuthStateChanged,
  User,
  SyncResult,
} from '../services/firebase';

const LAST_SYNC_KEY = 'drt_last_cloud_sync';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(() => {
    try {
      const saved = localStorage.getItem(LAST_SYNC_KEY);
      return saved ? Number(saved) : null;
    } catch {
      return null;
    }
  });

  const userRef = useRef<User | null>(null);
  userRef.current = user;

  const persistLastSyncTime = useCallback((timestamp: number) => {
    setLastSyncTime(timestamp);
    try {
      localStorage.setItem(LAST_SYNC_KEY, String(timestamp));
    } catch {
      // ignore
    }
  }, []);

  // Bidirectional sync between local IndexedDB and Gmail Cloud Firestore
  const syncNow = useCallback(
    async (targetUser?: User | null): Promise<SyncResult | null> => {
      const activeUser = targetUser !== undefined ? targetUser : userRef.current;
      if (!activeUser) return null;

      setIsSyncing(true);
      setSyncError(null);
      try {
        const res = await synchronizeUserData(activeUser);
        setLastSyncResult(res);
        persistLastSyncTime(res.lastSyncTime);
        return res;
      } catch (err) {
        const readable = getReadableSyncError(err);
        setSyncError(readable);
        console.warn('Cloud sync error:', readable);
        return null;
      } finally {
        setIsSyncing(false);
      }
    },
    [persistLastSyncTime]
  );

  // Listen to Firebase Auth state once on mount
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      userRef.current = currentUser;
      setUser(currentUser);
      setAuthReady(true);

      if (currentUser) {
        await syncNow(currentUser);
      }
    });

    return () => unsubscribe();
  }, [syncNow]);

  // Attach real-time cross-device listener only after auth is ready & user is authenticated
  useEffect(() => {
    if (!authReady || !user) return;

    const unsubscribeSnapshot = subscribeToCloudActivities(
      user,
      () => {
        persistLastSyncTime(Date.now());
      },
      (errMessage) => {
        setSyncError(errMessage);
      }
    );

    return () => {
      unsubscribeSnapshot();
    };
  }, [authReady, user, persistLastSyncTime]);

  // Auto-sync pending local activities as soon as internet reconnects
  useEffect(() => {
    const handleOnline = () => {
      if (userRef.current) {
        syncNow(userRef.current);
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [syncNow]);

  const handleGoogleLogin = useCallback(async (): Promise<User> => {
    setSyncError(null);
    const u = await signInWithGoogle();
    userRef.current = u;
    setUser(u);
    await syncNow(u);
    return u;
  }, [syncNow]);

  const handleSwitchAccount = useCallback(async (): Promise<User> => {
    setSyncError(null);
    const u = await switchGoogleAccount();
    userRef.current = u;
    setUser(u);
    await syncNow(u);
    return u;
  }, [syncNow]);

  const handleLogOut = useCallback(async (): Promise<void> => {
    await logOut();
    userRef.current = null;
    setUser(null);
    setLastSyncResult(null);
    setSyncError(null);
  }, []);

  const clearSyncError = useCallback(() => {
    setSyncError(null);
  }, []);

  return {
    user,
    loading: !authReady,
    isSyncing,
    syncError,
    clearSyncError,
    lastSyncTime,
    lastSyncResult,
    syncNow,
    loginWithGoogle: handleGoogleLogin,
    switchGoogleAccount: handleSwitchAccount,
    logOut: handleLogOut,
  };
}
