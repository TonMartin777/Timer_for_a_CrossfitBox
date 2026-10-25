import { useEffect, useRef, useState, useCallback } from 'react';

export interface WakeLockState {
  isSupported: boolean;
  isLocked: boolean;
}

/**
 * Custom hook to manage the Screen Wake Lock API so the phone display stays awake
 * while the timer view is mounted or running.
 */
export function useWakeLock(shouldKeepAwake: boolean = true): WakeLockState {
  const isSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const requestWakeLock = useCallback(async () => {
    if (!isSupported || !shouldKeepAwake) return;
    if (document.visibilityState !== 'visible') return;
    if (wakeLockRef.current && !wakeLockRef.current.released) return;

    try {
      const sentinel = await navigator.wakeLock.request('screen');
      wakeLockRef.current = sentinel;
      setIsLocked(true);

      sentinel.addEventListener('release', () => {
        setIsLocked(false);
      });
    } catch (err: unknown) {
      // Browser may reject if battery saver is active or page has not been interacted with yet
      console.warn('Screen Wake Lock request was declined:', err);
      setIsLocked(false);
    }
  }, [isSupported, shouldKeepAwake]);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
      } catch (err: unknown) {
        console.warn('Error releasing Screen Wake Lock:', err);
      } finally {
        wakeLockRef.current = null;
        setIsLocked(false);
      }
    }
  }, []);

  useEffect(() => {
    if (shouldKeepAwake) {
      void requestWakeLock();
    } else {
      void releaseWakeLock();
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && shouldKeepAwake) {
        void requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      void releaseWakeLock();
    };
  }, [shouldKeepAwake, requestWakeLock, releaseWakeLock]);

  return { isSupported, isLocked };
}

