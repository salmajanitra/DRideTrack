import { useState, useEffect, useCallback, useRef } from 'react';

const STORAGE_KEY = 'drt_keep_screen_awake';

export interface ScreenWakeLockState {
  isEnabled: boolean;
  isActive: boolean;
  isSupported: boolean;
  statusMessage: string;
  setKeepAwake: (enabled: boolean) => void;
  toggleKeepAwake: () => void;
  requestWakeLock: () => Promise<boolean>;
  releaseWakeLock: () => Promise<void>;
}

export function useScreenWakeLock(): ScreenWakeLockState {
  const [isEnabled, setIsEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved !== null ? saved === 'true' : true; // Default to ON for cycling computer
    } catch {
      return true;
    }
  });

  const [isActive, setIsActive] = useState<boolean>(false);
  const [isSupported, setIsSupported] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');

  // Native WakeLockSentinel reference
  const wakeLockRef = useRef<any>(null);

  // Check Wake Lock API support on mount
  useEffect(() => {
    const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
    setIsSupported(supported);
    if (!supported) {
      setStatusMessage('Screen Wake Lock API tidak didukung pada browser ini.');
    }
  }, []);

  const requestWakeLock = useCallback(async (): Promise<boolean> => {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
      setIsActive(false);
      return false;
    }

    try {
      // If already active and not released, return true
      if (wakeLockRef.current && !wakeLockRef.current.released) {
        setIsActive(true);
        return true;
      }

      const lock = await (navigator as any).wakeLock.request('screen');
      wakeLockRef.current = lock;
      setIsActive(true);
      setStatusMessage('Layar terkunci aktif (tidak akan meredup/tidur).');

      lock.addEventListener('release', () => {
        wakeLockRef.current = null;
        setIsActive(false);
      });

      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setIsActive(false);
      setStatusMessage('Kunci layar tidak dapat diaktifkan: ' + msg);
      return false;
    }
  }, []);

  const releaseWakeLock = useCallback(async (): Promise<void> => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
      } catch {
        // ignore
      }
      wakeLockRef.current = null;
    }
    setIsActive(false);
    setStatusMessage('Layar mengikuti pengaturan standar sistem.');
  }, []);

  const setKeepAwake = useCallback(
    (enabled: boolean) => {
      setIsEnabled(enabled);
      try {
        localStorage.setItem(STORAGE_KEY, enabled.toString());
      } catch {
        // ignore storage errors
      }

      if (enabled) {
        requestWakeLock();
      } else {
        releaseWakeLock();
      }
    },
    [requestWakeLock, releaseWakeLock]
  );

  const toggleKeepAwake = useCallback(() => {
    setKeepAwake(!isEnabled);
  }, [isEnabled, setKeepAwake]);

  // Synchronize wake lock on enabled change, visibilitychange, and focus
  useEffect(() => {
    if (isEnabled) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && isEnabled) {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
      releaseWakeLock();
    };
  }, [isEnabled, requestWakeLock, releaseWakeLock]);

  return {
    isEnabled,
    isActive,
    isSupported,
    statusMessage,
    setKeepAwake,
    toggleKeepAwake,
    requestWakeLock,
    releaseWakeLock,
  };
}
