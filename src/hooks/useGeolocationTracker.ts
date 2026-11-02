import { useState, useEffect, useRef, useCallback } from 'react';
import {
  GPSPoint,
  TrackingState,
  GPSStatus,
  ActivityStats,
  KilometerSplit,
  GPSQualityAssessment,
  SportType,
  AccuracyFilterLevel,
  TrackingInterruption,
  ActiveSessionSnapshot,
  UnitSystem,
} from '../types/cycling';
import {
  GPSTrackerFilter,
  RawGeolocationData,
  assessGPSQuality,
  calculateAccurateElevation,
  getMaxAccuracyMeters,
} from '../services/gpsFilter';
import {
  saveActiveSession,
  saveActiveSessionSyncFallback,
  getActiveSession,
  clearActiveSession,
} from '../services/db';

const INITIAL_STATS: ActivityStats = {
  distanceKm: 0,
  totalDurationSeconds: 0,
  movingTimeSeconds: 0,
  stoppedTimeSeconds: 0,
  currentSpeedKmH: 0,
  hasSpeedData: false,
  avgSpeedKmH: 0,
  overallAvgSpeedKmH: 0,
  maxSpeedKmH: 0,
  currentPaceSecPerKm: null,
  avgPaceSecPerKm: null,
  bestPaceSecPerKm: null,
  currentElevationM: null,
  startElevationM: null,
  endElevationM: null,
  elevationGainM: 0,
  elevationLossM: 0,
  hasElevationData: false,
  gpsAccuracyM: null,
  gpsStatus: 'searching',
  recordedPointsCount: 0,
};

export interface UseGeolocationTrackerOptions {
  unit: UnitSystem;
  onRecoverUnit?: (unit: UnitSystem) => void;
}

export function useGeolocationTracker({ unit, onRecoverUnit }: UseGeolocationTrackerOptions) {
  const [sportType, setSportTypeState] = useState<SportType>(() => {
    try {
      const saved = localStorage.getItem('drt_sport_type');
      return saved === 'running' ? 'running' : 'cycling';
    } catch {
      return 'cycling';
    }
  });

  const [accuracyFilter, setAccuracyFilterState] = useState<AccuracyFilterLevel>(() => {
    try {
      const saved = localStorage.getItem('drt_accuracy_filter');
      if (saved === 'strict' || saved === 'balanced' || saved === 'relaxed') return saved;
      return 'balanced';
    } catch {
      return 'balanced';
    }
  });

  const [isAutoPauseEnabled, setIsAutoPauseEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('drt_smart_autopause');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const [trackingState, setTrackingState] = useState<TrackingState>('idle');
  const [gpsStatus, setGpsStatus] = useState<GPSStatus>('searching');
  const [gpsAccuracyM, setGpsAccuracyM] = useState<number | null>(null);
  const [points, setPoints] = useState<GPSPoint[]>([]);
  const [splits, setSplits] = useState<KilometerSplit[]>([]);
  const [interruptions, setInterruptions] = useState<TrackingInterruption[]>([]);
  const [activeInterruptionWarning, setActiveInterruptionWarning] = useState<string | null>(null);
  const [recoveredSessionBanner, setRecoveredSessionBanner] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAutoPaused, setIsAutoPaused] = useState<boolean>(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);

  const [currentLocation, setCurrentLocation] = useState<{
    lat: number;
    lng: number;
    altitude: number | null;
    speed: number | null;
    heading: number | null;
    accuracy: number;
    timestamp: number;
  } | null>(null);

  const [stats, setStats] = useState<ActivityStats>(INITIAL_STATS);

  // Refs for synchronous access inside watchPosition & timers
  const filterRef = useRef<GPSTrackerFilter>(new GPSTrackerFilter());
  const sessionIdRef = useRef<string>('sess_' + Date.now().toString(36));
  const startedAtRef = useRef<number>(Date.now());
  const unroundedDistanceKmRef = useRef<number>(0);
  const watchIdRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const lastAutoSaveAtRef = useRef<number>(0);

  const sportTypeRef = useRef<SportType>(sportType);
  sportTypeRef.current = sportType;

  const accuracyFilterRef = useRef<AccuracyFilterLevel>(accuracyFilter);
  accuracyFilterRef.current = accuracyFilter;

  const unitRef = useRef<UnitSystem>(unit);
  unitRef.current = unit;

  const trackingStateRef = useRef<TrackingState>(trackingState);
  trackingStateRef.current = trackingState;

  const isAutoPausedRef = useRef<boolean>(isAutoPaused);
  isAutoPausedRef.current = isAutoPaused;

  const isAutoPauseEnabledRef = useRef<boolean>(isAutoPauseEnabled);
  isAutoPauseEnabledRef.current = isAutoPauseEnabled;

  const pointsRef = useRef<GPSPoint[]>(points);
  pointsRef.current = points;

  const splitsRef = useRef<KilometerSplit[]>(splits);
  splitsRef.current = splits;

  const interruptionsRef = useRef<TrackingInterruption[]>(interruptions);
  interruptionsRef.current = interruptions;

  const statsRef = useRef<ActivityStats>(stats);
  statsRef.current = stats;

  const stationaryStartRef = useRef<number | null>(null);
  const lastValidGpsWallTimeRef = useRef<number>(0);
  const lastRawGpsWallTimeRef = useRef<number>(0);
  const lastTickWallClockRef = useRef<number>(Date.now());
  const hiddenSinceRef = useRef<number | null>(null);
  const lostSignalActiveSinceRef = useRef<number | null>(null);

  // Split tracking cursor
  const currentSplitStartKmRef = useRef<number>(0);
  const currentSplitStartTimeRef = useRef<number>(Date.now());
  const currentSplitStartMovingSecRef = useRef<number>(0);
  const currentSplitStartElevGainRef = useRef<number>(0);
  const currentSplitStartElevLossRef = useRef<number>(0);

  // Keep filter configuration synced
  useEffect(() => {
    filterRef.current.configure(sportType, accuracyFilter);
  }, [sportType, accuracyFilter]);

  const setSportType = useCallback((nextSport: SportType) => {
    if (trackingStateRef.current !== 'idle') return;
    setSportTypeState(nextSport);
    filterRef.current.configure(nextSport, accuracyFilterRef.current);
    try {
      localStorage.setItem('drt_sport_type', nextSport);
    } catch {
      // ignore
    }
  }, []);

  const setAccuracyFilter = useCallback((nextLevel: AccuracyFilterLevel) => {
    setAccuracyFilterState(nextLevel);
    filterRef.current.configure(sportTypeRef.current, nextLevel);
    try {
      localStorage.setItem('drt_accuracy_filter', nextLevel);
    } catch {
      // ignore
    }
  }, []);

  const toggleAutoPause = useCallback((enabled?: boolean) => {
    setIsAutoPauseEnabled((prev) => {
      const next = enabled !== undefined ? enabled : !prev;
      try {
        localStorage.setItem('drt_smart_autopause', String(next));
      } catch {
        // ignore
      }
      if (!next && isAutoPausedRef.current) {
        setIsAutoPaused(false);
      }
      return next;
    });
  }, []);

  // Build snapshot of active session for crash/reload recovery
  const buildSessionSnapshot = useCallback(
    (overrideState?: 'recording' | 'paused' | 'finished', overrideStats?: ActivityStats, overridePoints?: GPSPoint[]): ActiveSessionSnapshot | null => {
      const st = overrideState ?? (trackingStateRef.current === 'idle' ? null : trackingStateRef.current);
      if (!st) return null;

      return {
        id: 'current_active_session',
        sessionId: sessionIdRef.current,
        sportType: sportTypeRef.current,
        unit: unitRef.current,
        trackingState: st,
        startedAt: startedAtRef.current,
        lastSavedAt: Date.now(),
        stats: overrideStats ?? statsRef.current,
        points: overridePoints ?? pointsRef.current,
        splits: splitsRef.current,
        interruptions: interruptionsRef.current,
        settings: {
          autoPause: isAutoPauseEnabledRef.current,
          accuracyFilter: accuracyFilterRef.current,
        },
        splitCursor: {
          startKm: currentSplitStartKmRef.current,
          startTime: currentSplitStartTimeRef.current,
          startMovingSec: currentSplitStartMovingSecRef.current,
          startElevGain: currentSplitStartElevGainRef.current,
          startElevLoss: currentSplitStartElevLossRef.current,
        },
        filterSnapshot: filterRef.current.getSnapshotState(),
      };
    },
    []
  );

  // Restore unfinished session on mount if page was accidentally reloaded
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await getActiveSession();
      if (cancelled || !saved) return;

      // Only restore if session actually has recorded progress or elapsed time
      if (saved.points.length === 0 && saved.stats.totalDurationSeconds < 2) {
        await clearActiveSession();
        return;
      }

      sessionIdRef.current = saved.sessionId;
      startedAtRef.current = saved.startedAt;
      setStartedAt(saved.startedAt);
      setSportTypeState(saved.sportType);
      sportTypeRef.current = saved.sportType;
      setAccuracyFilterState(saved.settings.accuracyFilter);
      accuracyFilterRef.current = saved.settings.accuracyFilter;
      setIsAutoPauseEnabled(saved.settings.autoPause);
      isAutoPauseEnabledRef.current = saved.settings.autoPause;

      if (onRecoverUnit && saved.unit) {
        onRecoverUnit(saved.unit);
      }

      const lastPt = saved.points.length > 0 ? saved.points[saved.points.length - 1] : null;
      filterRef.current.hydrate({
        sportType: saved.sportType,
        accuracyLevel: saved.settings.accuracyFilter,
        lastPoint: lastPt,
        smoothedAltitude: saved.filterSnapshot.smoothedAltitude,
        elevationGain: saved.filterSnapshot.elevationGain,
        elevationLoss: saved.filterSnapshot.elevationLoss,
        hasElevationData: saved.filterSnapshot.hasElevationData,
        totalCumulativeDistanceKm: saved.filterSnapshot.totalCumulativeDistanceKm,
        bestPaceSecPerKm: saved.filterSnapshot.bestPaceSecPerKm,
      });

      unroundedDistanceKmRef.current = saved.filterSnapshot.totalCumulativeDistanceKm;
      currentSplitStartKmRef.current = saved.splitCursor.startKm;
      currentSplitStartTimeRef.current = saved.splitCursor.startTime;
      currentSplitStartMovingSecRef.current = saved.splitCursor.startMovingSec;
      currentSplitStartElevGainRef.current = saved.splitCursor.startElevGain;
      currentSplitStartElevLossRef.current = saved.splitCursor.startElevLoss;

      const reloadInterruption: TrackingInterruption = {
        id: 'int_' + Date.now().toString(36),
        startTime: saved.lastSavedAt,
        endTime: Date.now(),
        durationSeconds: Math.max(1, Math.round((Date.now() - saved.lastSavedAt) / 1000)),
        reason: 'page_reloaded',
        message: 'Halaman dimuat ulang. Sesi dipulihkan dari penyimpanan berkala perangkat.',
      };

      const nextInterruptions = [...(saved.interruptions || []), reloadInterruption];
      setInterruptions(nextInterruptions);
      interruptionsRef.current = nextInterruptions;

      setPoints(saved.points);
      pointsRef.current = saved.points;
      setSplits(saved.splits || []);
      splitsRef.current = saved.splits || [];

      const restoredState: TrackingState = saved.trackingState === 'finished' ? 'finished' : 'paused';
      setTrackingState(restoredState);
      trackingStateRef.current = restoredState;
      setIsAutoPaused(false);

      const restoredStats: ActivityStats = {
        ...saved.stats,
        currentSpeedKmH: 0,
        currentPaceSecPerKm: null,
      };
      setStats(restoredStats);
      statsRef.current = restoredStats;

      if (lastPt) {
        setCurrentLocation({
          lat: lastPt.lat,
          lng: lastPt.lng,
          altitude: lastPt.altitude,
          speed: 0,
          heading: lastPt.heading,
          accuracy: lastPt.accuracy,
          timestamp: lastPt.timestamp,
        });
      }

      setRecoveredSessionBanner(
        restoredState === 'finished'
          ? 'Sesi yang belum dikonfirmasi penyimpanannya berhasil dipulihkan. Silakan tinjau & simpan atau buang aktivitas.'
          : `Sesi ${saved.sportType === 'running' ? 'Lari' : 'Bersepeda'} (${saved.points.length} titik GPS) berhasil dipulihkan dalam status Jeda setelah halaman dimuat ulang.`
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [onRecoverUnit]);

  // Helper to record an interruption incident
  const appendInterruption = useCallback(
    (reason: TrackingInterruption['reason'], startTime: number, endTime: number, message: string) => {
      const durationSeconds = Math.max(1, Math.round((endTime - startTime) / 1000));
      const item: TrackingInterruption = {
        id: 'int_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 5),
        startTime,
        endTime,
        durationSeconds,
        reason,
        message,
      };
      setInterruptions((prev) => {
        const next = [...prev, item];
        interruptionsRef.current = next;
        return next;
      });
      setActiveInterruptionWarning(message);
    },
    []
  );

  // Process incoming browser Geolocation coordinates
  const handlePosition = useCallback(
    (raw: RawGeolocationData) => {
      const wallNow = Date.now();
      lastRawGpsWallTimeRef.current = wallNow;

      const roundedAcc = !isNaN(raw.accuracy) && raw.accuracy > 0 ? Math.round(raw.accuracy) : null;
      if (roundedAcc !== null) {
        setGpsAccuracyM(roundedAcc);
      }

      const maxAcceptableAcc = getMaxAccuracyMeters(accuracyFilterRef.current);
      const nextGpsStatus: GPSStatus =
        roundedAcc === null
          ? 'weak'
          : roundedAcc <= 20
          ? 'locked'
          : roundedAcc <= maxAcceptableAcc
          ? 'weak'
          : 'weak';

      setGpsStatus(nextGpsStatus);

      // If GPS lock was previously lost during recording and now recovered within acceptable accuracy
      if (
        lostSignalActiveSinceRef.current !== null &&
        roundedAcc !== null &&
        roundedAcc <= maxAcceptableAcc
      ) {
        const lostSince = lostSignalActiveSinceRef.current;
        lostSignalActiveSinceRef.current = null;
        if (trackingStateRef.current === 'recording' && wallNow - lostSince >= 15000) {
          filterRef.current.markDiscontinuity();
          appendInterruption(
            'gps_signal_lost',
            lostSince,
            wallNow,
            `Sinyal GPS sempat terputus selama ${Math.round((wallNow - lostSince) / 1000)} detik lalu tersambung kembali.`
          );
        } else {
          setActiveInterruptionWarning(null);
        }
      }

      // CASE A: Active Recording — run full physics filter, distance & split calculation
      if (trackingStateRef.current === 'recording') {
        const filterResult = filterRef.current.processPoint(raw);

        if (!filterResult.isValid || !filterResult.point) {
          // Weak signal or spike rejected: update accuracy/status honestly without corrupting route or distance
          setStats((prev) => ({
            ...prev,
            gpsAccuracyM: roundedAcc ?? prev.gpsAccuracyM,
            gpsStatus: filterResult.isWeakSignal ? 'weak' : nextGpsStatus,
          }));
          if (filterResult.isWeakSignal && roundedAcc !== null) {
            setActiveInterruptionWarning(
              `Akurasi GPS saat ini lemah (±${roundedAcc}m). Titik tidak akurat diabaikan agar jarak tidak melenceng.`
            );
          }
          return;
        }

        const pt = filterResult.point;
        lastValidGpsWallTimeRef.current = wallNow;

        setCurrentLocation({
          lat: pt.lat,
          lng: pt.lng,
          altitude: pt.altitude,
          speed: pt.speed,
          heading: pt.heading,
          accuracy: pt.accuracy,
          timestamp: pt.timestamp,
        });

        // Smart Auto-Pause detection
        const stopSpeedThreshold = sportTypeRef.current === 'running' ? 1.0 : 1.2;
        const resumeSpeedThreshold = sportTypeRef.current === 'running' ? 1.6 : 2.0;

        if (isAutoPauseEnabledRef.current) {
          if (pt.speed < stopSpeedThreshold) {
            if (stationaryStartRef.current === null) {
              stationaryStartRef.current = wallNow;
            } else if (wallNow - stationaryStartRef.current >= 5000 && !isAutoPausedRef.current) {
              setIsAutoPaused(true);
            }
          } else if (pt.speed >= resumeSpeedThreshold) {
            stationaryStartRef.current = null;
            if (isAutoPausedRef.current) {
              setIsAutoPaused(false);
            }
          }
        }

        const elevStats = filterRef.current.getElevationStats();
        const prevStats = statsRef.current;
        const newDistance = pt.cumulativeDistance;
        unroundedDistanceKmRef.current = newDistance;
        const newMaxSpeed = Math.max(prevStats.maxSpeedKmH, pt.speed);

        const currentMovingSec = Math.max(1, prevStats.movingTimeSeconds);
        const currentTotalSec = Math.max(1, prevStats.totalDurationSeconds);
        const speedCeiling = sportTypeRef.current === 'running' ? 38 : 108;

        let calculatedAvgSpeed = prevStats.avgSpeedKmH;
        if (prevStats.movingTimeSeconds >= 2 && newDistance >= 0.005) {
          calculatedAvgSpeed = Math.min(
            speedCeiling,
            Math.max(0, Math.round((newDistance / (currentMovingSec / 3600)) * 10) / 10)
          );
        } else if (pt.speed > 0) {
          calculatedAvgSpeed = pt.speed;
        }

        let calculatedOverallAvgSpeed = 0;
        if (prevStats.totalDurationSeconds >= 2 && newDistance >= 0.005) {
          calculatedOverallAvgSpeed = Math.min(
            speedCeiling,
            Math.max(0, Math.round((newDistance / (currentTotalSec / 3600)) * 10) / 10)
          );
        }

        // Real-time Pace calculations (sec/km) — null when stationary or insufficient distance
        const currentPaceSecPerKm = pt.speed >= 1.2 ? Math.round(3600 / pt.speed) : null;
        const avgPaceSecPerKm =
          prevStats.movingTimeSeconds >= 3 && newDistance >= 0.01
            ? Math.round(prevStats.movingTimeSeconds / newDistance)
            : null;
        const bestPaceSecPerKm = filterRef.current.getBestPaceSecPerKm();

        const nextPoints = [...pointsRef.current, pt];
        pointsRef.current = nextPoints;
        setPoints(nextPoints);

        const nextStats: ActivityStats = {
          ...prevStats,
          distanceKm: Math.round(newDistance * 1000) / 1000,
          currentSpeedKmH: pt.speed,
          hasSpeedData: true,
          maxSpeedKmH: Math.round(newMaxSpeed * 10) / 10,
          avgSpeedKmH: calculatedAvgSpeed,
          overallAvgSpeedKmH: calculatedOverallAvgSpeed,
          currentPaceSecPerKm,
          avgPaceSecPerKm,
          bestPaceSecPerKm,
          currentElevationM: elevStats.hasData ? pt.altitude : null,
          startElevationM: elevStats.hasData ? (prevStats.startElevationM ?? pt.altitude) : null,
          endElevationM: elevStats.hasData ? pt.altitude : null,
          elevationGainM: elevStats.hasData ? elevStats.gain : 0,
          elevationLossM: elevStats.hasData ? elevStats.loss : 0,
          hasElevationData: elevStats.hasData,
          gpsAccuracyM: pt.accuracy,
          gpsStatus: pt.accuracy <= 20 ? 'locked' : 'weak',
          recordedPointsCount: nextPoints.length,
        };

        statsRef.current = nextStats;
        setStats(nextStats);

        // Kilometer split milestone tracking
        const currentWholeKm = Math.floor(newDistance);
        const lastSplitWholeKm = Math.floor(currentSplitStartKmRef.current);

        if (currentWholeKm > lastSplitWholeKm && currentWholeKm > 0) {
          const splitDistance = Math.max(0.05, newDistance - currentSplitStartKmRef.current);
          const splitWallDuration = Math.max(1, Math.round((pt.timestamp - currentSplitStartTimeRef.current) / 1000));
          const splitMovingDuration =
            prevStats.movingTimeSeconds > currentSplitStartMovingSecRef.current
              ? prevStats.movingTimeSeconds - currentSplitStartMovingSecRef.current
              : splitWallDuration;
          const effectiveSplitSec = Math.max(1, splitMovingDuration);
          const splitAvgSpeed = splitDistance / (effectiveSplitSec / 3600);
          const splitPaceSecPerKm = Math.round(effectiveSplitSec / splitDistance);

          const splitElevGain = elevStats.hasData
            ? Math.max(0, elevStats.gain - currentSplitStartElevGainRef.current)
            : 0;
          const splitElevLoss = elevStats.hasData
            ? Math.max(0, elevStats.loss - currentSplitStartElevLossRef.current)
            : 0;

          const newSplit: KilometerSplit = {
            kmIndex: currentWholeKm,
            distanceKm: Math.round(splitDistance * 100) / 100,
            durationSeconds: effectiveSplitSec,
            avgSpeedKmH: Math.round(splitAvgSpeed * 10) / 10,
            paceSecondsPerKm: splitPaceSecPerKm,
            elevationGainM: Math.round(splitElevGain),
            elevationLossM: Math.round(splitElevLoss),
            hasElevation: elevStats.hasData,
            startTime: currentSplitStartTimeRef.current,
            endTime: pt.timestamp,
          };

          const updatedSplits = [...splitsRef.current, newSplit];
          splitsRef.current = updatedSplits;
          setSplits(updatedSplits);

          currentSplitStartKmRef.current = newDistance;
          currentSplitStartTimeRef.current = pt.timestamp;
          currentSplitStartMovingSecRef.current = prevStats.movingTimeSeconds;
          currentSplitStartElevGainRef.current = elevStats.gain;
          currentSplitStartElevLossRef.current = elevStats.loss;
        }

        // Throttled periodic persistence to IndexedDB + localStorage every 3.5s
        if (wallNow - lastAutoSaveAtRef.current >= 3500) {
          lastAutoSaveAtRef.current = wallNow;
          const snap = buildSessionSnapshot('recording', nextStats, nextPoints);
          if (snap) {
            void saveActiveSession(snap);
          }
        }
      } else {
        // CASE B: Idle, Paused, or Finished — preview sensor ONLY without mutating route or distance!
        const preview = filterRef.current.previewSensorPoint(raw);
        if (preview.isValid && preview.lat !== undefined && preview.lng !== undefined) {
          lastValidGpsWallTimeRef.current = wallNow;
          setCurrentLocation({
            lat: preview.lat,
            lng: preview.lng,
            altitude: preview.altitude,
            speed: preview.speedKmH,
            heading: preview.heading,
            accuracy: preview.accuracy,
            timestamp: preview.timestamp,
          });

          if (trackingStateRef.current === 'idle') {
            setStats((prev) => ({
              ...prev,
              currentSpeedKmH: preview.speedKmH ?? 0,
              hasSpeedData: preview.speedKmH !== null,
              currentPaceSecPerKm:
                preview.speedKmH !== null && preview.speedKmH >= 1.2
                  ? Math.round(3600 / preview.speedKmH)
                  : null,
              currentElevationM: preview.altitude,
              hasElevationData: preview.altitude !== null,
              gpsAccuracyM: preview.accuracy,
              gpsStatus: preview.accuracy <= 20 ? 'locked' : 'weak',
            }));
          } else {
            // Paused or Finished: keep speed at 0 while updating GPS accuracy & live location pin
            setStats((prev) => ({
              ...prev,
              gpsAccuracyM: preview.accuracy,
              gpsStatus: preview.accuracy <= 20 ? 'locked' : 'weak',
            }));
          }
        }
      }
    },
    [appendInterruption, buildSessionSnapshot]
  );

  // Setup browser Geolocation API watchPosition
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setGpsStatus('unavailable');
      setErrorMessage('Browser perangkat ini tidak mendukung Geolocation API.');
      return;
    }

    setGpsStatus('searching');

    const options: PositionOptions = {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 12000,
    };

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setErrorMessage(null);
        handlePosition({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          altitude: pos.coords.altitude,
          accuracy: pos.coords.accuracy,
          speed: pos.coords.speed,
          heading: pos.coords.heading,
          timestamp: pos.timestamp || Date.now(),
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGpsStatus('denied');
          setErrorMessage('Izin lokasi ditolak. Aktifkan izin lokasi di browser agar GPS dapat merekam rute.');
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setGpsStatus('unavailable');
          setErrorMessage('Sinyal satelit GPS belum tersedia. Pastikan layanan lokasi perangkat menyala.');
        } else if (err.code === err.TIMEOUT) {
          setGpsStatus('lost');
          if (trackingStateRef.current === 'recording') {
            if (lostSignalActiveSinceRef.current === null) {
              lostSignalActiveSinceRef.current = Date.now();
            }
            setActiveInterruptionWarning(
              'Pencarian sinyal GPS melebihi batas waktu (timeout). Perekaman menunggu sinyal GPS valid berikutnya.'
            );
          }
        }
      },
      options
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [handlePosition]);

  // Visibility & page unload listeners: auto-save synchronously and detect OS background suspension
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenSinceRef.current = Date.now();
        const snap = buildSessionSnapshot();
        if (snap) {
          saveActiveSessionSyncFallback(snap);
          void saveActiveSession(snap);
        }
      } else if (document.visibilityState === 'visible') {
        const hiddenAt = hiddenSinceRef.current;
        hiddenSinceRef.current = null;
        if (hiddenAt && trackingStateRef.current === 'recording') {
          const now = Date.now();
          const hiddenSec = Math.round((now - hiddenAt) / 1000);
          const secSinceLastValidGps = Math.round((now - lastValidGpsWallTimeRef.current) / 1000);

          if (hiddenSec >= 8 && secSinceLastValidGps >= 8) {
            filterRef.current.markDiscontinuity();
            appendInterruption(
              'background_suspended',
              hiddenAt,
              now,
              `Aplikasi berada di latar belakang selama ${hiddenSec} detik dan pembaruan GPS terhenti oleh sistem operasi. Titik koordinat disambung ulang secara aman.`
            );
          }
        }
      }
    };

    const handlePageHide = () => {
      const snap = buildSessionSnapshot();
      if (snap) {
        saveActiveSessionSyncFallback(snap);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handlePageHide);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handlePageHide);
    };
  }, [appendInterruption, buildSessionSnapshot]);

  // 1-second activity clock, stationary speed decay, GPS signal-loss watchdog, and periodic auto-save
  useEffect(() => {
    lastTickWallClockRef.current = Date.now();

    timerIntervalRef.current = window.setInterval(() => {
      const now = Date.now();
      const wallDeltaSec = Math.max(1, Math.round((now - lastTickWallClockRef.current) / 1000));
      lastTickWallClockRef.current = now;

      // Detect OS JS timer freeze jump (> 8s between 1s ticks) during active recording
      if (trackingStateRef.current === 'recording' && wallDeltaSec >= 8) {
        filterRef.current.markDiscontinuity();
        appendInterruption(
          'background_suspended',
          now - wallDeltaSec * 1000,
          now,
          `Proses browser sempat dihentikan sementara oleh sistem selama ${wallDeltaSec} detik. Jaga layar tetap aktif selama perekaman.`
        );
      }

      const timeSinceValidGps = lastValidGpsWallTimeRef.current > 0 ? now - lastValidGpsWallTimeRef.current : Infinity;

      // Smoothly decay instantaneous speed/pace to 0/-- when no GPS update arrives for > 3.5s
      if (timeSinceValidGps > 3500 && trackingStateRef.current !== 'paused' && trackingStateRef.current !== 'finished') {
        setStats((prev) => {
          if (prev.currentSpeedKmH > 0 || prev.currentPaceSecPerKm !== null) {
            const decayed =
              prev.currentSpeedKmH > 1.2 ? Math.max(0, Math.round(prev.currentSpeedKmH * 0.45 * 10) / 10) : 0;
            return {
              ...prev,
              currentSpeedKmH: decayed,
              currentPaceSecPerKm: decayed >= 1.2 ? Math.round(3600 / decayed) : null,
            };
          }
          return prev;
        });

        if (
          trackingStateRef.current === 'recording' &&
          isAutoPauseEnabledRef.current &&
          stationaryStartRef.current &&
          now - stationaryStartRef.current >= 5000 &&
          !isAutoPausedRef.current
        ) {
          setIsAutoPaused(true);
        }
      }

      // Detect foreground GPS signal loss (> 15 seconds without valid fix during recording)
      if (trackingStateRef.current === 'recording' && timeSinceValidGps > 15000) {
        if (lostSignalActiveSinceRef.current === null) {
          lostSignalActiveSinceRef.current = lastValidGpsWallTimeRef.current || now - 15000;
        }
        setGpsStatus('lost');
        setActiveInterruptionWarning(
          'Sinyal GPS lemah atau terputus (>15 detik). Pastikan perangkat mendapat pandangan langit terbuka.'
        );
      }

      // Advance Elapsed, Moving, and Stopped clocks during Recording
      if (trackingStateRef.current === 'recording') {
        setStats((prev) => {
          const movingThreshold = sportTypeRef.current === 'running' ? 1.2 : 1.5;
          const isCurrentlyMoving = !isAutoPausedRef.current && prev.currentSpeedKmH >= movingThreshold && wallDeltaSec < 8;

          const newTotalSec = prev.totalDurationSeconds + wallDeltaSec;
          const newMovingSec = prev.movingTimeSeconds + (isCurrentlyMoving ? wallDeltaSec : 0);
          const newStoppedSec = Math.max(0, newTotalSec - newMovingSec);

          const exactDistance = unroundedDistanceKmRef.current;
          const speedCeiling = sportTypeRef.current === 'running' ? 38 : 108;

          let calculatedAvg = prev.avgSpeedKmH;
          if (newMovingSec >= 2 && exactDistance >= 0.005) {
            calculatedAvg = Math.min(
              speedCeiling,
              Math.max(0, Math.round((exactDistance / (newMovingSec / 3600)) * 10) / 10)
            );
          }

          let calculatedOverall = prev.overallAvgSpeedKmH ?? 0;
          if (newTotalSec >= 2 && exactDistance >= 0.005) {
            calculatedOverall = Math.min(
              speedCeiling,
              Math.max(0, Math.round((exactDistance / (newTotalSec / 3600)) * 10) / 10)
            );
          }

          const avgPaceSecPerKm =
            newMovingSec >= 3 && exactDistance >= 0.01 ? Math.round(newMovingSec / exactDistance) : null;

          const updated: ActivityStats = {
            ...prev,
            totalDurationSeconds: newTotalSec,
            movingTimeSeconds: newMovingSec,
            stoppedTimeSeconds: newStoppedSec,
            avgSpeedKmH: calculatedAvg,
            overallAvgSpeedKmH: calculatedOverall,
            avgPaceSecPerKm,
            bestPaceSecPerKm: filterRef.current.getBestPaceSecPerKm(),
          };
          statsRef.current = updated;
          return updated;
        });

        // Periodic auto-save every 5 seconds even when stationary
        if (now - lastAutoSaveAtRef.current >= 5000) {
          lastAutoSaveAtRef.current = now;
          const snap = buildSessionSnapshot('recording');
          if (snap) {
            void saveActiveSession(snap);
          }
        }
      }
    }, 1000);

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [appendInterruption, buildSessionSnapshot]);

  // Manual Current Location Refresh
  const requestImmediateLocation = useCallback(() => {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setErrorMessage(null);
        handlePosition({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          altitude: pos.coords.altitude,
          accuracy: pos.coords.accuracy,
          speed: pos.coords.speed,
          heading: pos.coords.heading,
          timestamp: pos.timestamp || Date.now(),
        });
      },
      () => {
        // Handled by main watchPosition
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
  }, [handlePosition]);

  // Controls: START, PAUSE, RESUME, FINISH, DISCARD, COMPLETE SAVE
  const startTracking = useCallback(() => {
    const now = Date.now();
    sessionIdRef.current = 'sess_' + now.toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    startedAtRef.current = now;
    setStartedAt(now);

    unroundedDistanceKmRef.current = 0;
    filterRef.current.reset();
    filterRef.current.configure(sportTypeRef.current, accuracyFilterRef.current);

    setPoints([]);
    pointsRef.current = [];
    setSplits([]);
    splitsRef.current = [];
    setInterruptions([]);
    interruptionsRef.current = [];
    setActiveInterruptionWarning(null);
    setRecoveredSessionBanner(null);
    setIsAutoPaused(false);

    stationaryStartRef.current = null;
    lostSignalActiveSinceRef.current = null;
    lastTickWallClockRef.current = now;
    currentSplitStartKmRef.current = 0;
    currentSplitStartTimeRef.current = now;
    currentSplitStartMovingSecRef.current = 0;
    currentSplitStartElevGainRef.current = 0;
    currentSplitStartElevLossRef.current = 0;

    // Seed initial start point ONLY if we have a genuine, recent, accurate GPS fix from the browser
    const maxAcc = getMaxAccuracyMeters(accuracyFilterRef.current);
    let initialPoints: GPSPoint[] = [];
    const hasFreshFix =
      currentLocation !== null &&
      now - currentLocation.timestamp <= 15000 &&
      currentLocation.accuracy <= maxAcc;

    if (hasFreshFix && currentLocation) {
      const seedRes = filterRef.current.processPoint({
        latitude: currentLocation.lat,
        longitude: currentLocation.lng,
        altitude: currentLocation.altitude,
        accuracy: currentLocation.accuracy,
        speed: currentLocation.speed !== null ? currentLocation.speed / 3.6 : null,
        heading: currentLocation.heading,
        timestamp: now - 1,
      });
      if (seedRes.isValid && seedRes.point) {
        initialPoints = [seedRes.point];
        lastValidGpsWallTimeRef.current = now;
      }
    }

    pointsRef.current = initialPoints;
    setPoints(initialPoints);

    const hasElev =
      currentLocation?.altitude !== null && currentLocation?.altitude !== undefined && hasFreshFix;
    const initSpeed = hasFreshFix && currentLocation?.speed !== null && currentLocation?.speed !== undefined ? currentLocation.speed : 0;

    const freshStats: ActivityStats = {
      distanceKm: 0,
      totalDurationSeconds: 0,
      movingTimeSeconds: 0,
      stoppedTimeSeconds: 0,
      currentSpeedKmH: initSpeed,
      hasSpeedData: hasFreshFix,
      avgSpeedKmH: 0,
      overallAvgSpeedKmH: 0,
      maxSpeedKmH: initSpeed,
      currentPaceSecPerKm: hasFreshFix && initSpeed >= 1.2 ? Math.round(3600 / initSpeed) : null,
      avgPaceSecPerKm: null,
      bestPaceSecPerKm: null,
      currentElevationM: hasElev ? currentLocation!.altitude : null,
      startElevationM: hasElev ? currentLocation!.altitude : null,
      endElevationM: null,
      elevationGainM: 0,
      elevationLossM: 0,
      hasElevationData: hasElev,
      gpsAccuracyM: gpsAccuracyM,
      gpsStatus: gpsStatus,
      recordedPointsCount: initialPoints.length,
    };

    statsRef.current = freshStats;
    setStats(freshStats);
    setTrackingState('recording');
    trackingStateRef.current = 'recording';

    const snap = buildSessionSnapshot('recording', freshStats, initialPoints);
    if (snap) {
      void saveActiveSession(snap);
    }
  }, [buildSessionSnapshot, currentLocation, gpsAccuracyM, gpsStatus]);

  const pauseTracking = useCallback(() => {
    setTrackingState('paused');
    trackingStateRef.current = 'paused';
    setIsAutoPaused(false);
    setRecoveredSessionBanner(null);

    setStats((prev) => {
      const next = {
        ...prev,
        currentSpeedKmH: 0,
        currentPaceSecPerKm: null,
      };
      statsRef.current = next;
      const snap = buildSessionSnapshot('paused', next);
      if (snap) {
        void saveActiveSession(snap);
      }
      return next;
    });
  }, [buildSessionSnapshot]);

  const resumeTracking = useCallback(() => {
    // Prevent straight-line distance jump across paused movement
    filterRef.current.markDiscontinuity();
    stationaryStartRef.current = null;
    lostSignalActiveSinceRef.current = null;
    lastTickWallClockRef.current = Date.now();
    lastValidGpsWallTimeRef.current = Date.now();
    setRecoveredSessionBanner(null);
    setActiveInterruptionWarning(null);
    setIsAutoPaused(false);
    setTrackingState('recording');
    trackingStateRef.current = 'recording';
    requestImmediateLocation();
  }, [requestImmediateLocation]);

  const finishTracking = useCallback(() => {
    setTrackingState('finished');
    trackingStateRef.current = 'finished';
    setIsAutoPaused(false);
    setRecoveredSessionBanner(null);

    const currentRecordedPoints = pointsRef.current;
    const accurateElev = calculateAccurateElevation(currentRecordedPoints);

    let finalPoints = currentRecordedPoints;
    if (accurateElev.hasData && accurateElev.smoothedPoints.length > 0) {
      finalPoints = accurateElev.smoothedPoints;
      pointsRef.current = finalPoints;
      setPoints(finalPoints);
    }

    const exactDist = unroundedDistanceKmRef.current || statsRef.current.distanceKm;
    const speedCeiling = sportTypeRef.current === 'running' ? 38 : 108;

    setStats((prev) => {
      const movingHours = prev.movingTimeSeconds > 0 ? prev.movingTimeSeconds / 3600 : 0;
      const finalAvg =
        movingHours > 0 && exactDist > 0
          ? Math.min(speedCeiling, Math.round((exactDist / movingHours) * 10) / 10)
          : 0;
      const totalHours = prev.totalDurationSeconds > 0 ? prev.totalDurationSeconds / 3600 : 0;
      const finalOverall =
        totalHours > 0 && exactDist > 0
          ? Math.min(speedCeiling, Math.round((exactDist / totalHours) * 10) / 10)
          : 0;

      const finalAvgPace =
        prev.movingTimeSeconds >= 3 && exactDist >= 0.01
          ? Math.round(prev.movingTimeSeconds / exactDist)
          : null;

      const hasElev = Boolean(prev.hasElevationData || accurateElev.hasData);
      const finalGain = hasElev
        ? accurateElev.gain > 0 || prev.elevationGainM === 0
          ? accurateElev.gain
          : prev.elevationGainM
        : 0;
      const finalLoss = hasElev
        ? accurateElev.loss > 0 || prev.elevationLossM === 0
          ? accurateElev.loss
          : prev.elevationLossM
        : 0;

      const updated: ActivityStats = {
        ...prev,
        distanceKm: Math.round(exactDist * 1000) / 1000,
        currentSpeedKmH: 0,
        currentPaceSecPerKm: null,
        avgSpeedKmH: finalAvg,
        overallAvgSpeedKmH: finalOverall,
        avgPaceSecPerKm: finalAvgPace,
        bestPaceSecPerKm: filterRef.current.getBestPaceSecPerKm() ?? prev.bestPaceSecPerKm ?? null,
        elevationGainM: finalGain,
        elevationLossM: finalLoss,
        hasElevationData: hasElev,
        endElevationM: hasElev ? (accurateElev.current ?? prev.currentElevationM) : null,
      };
      statsRef.current = updated;

      const snap = buildSessionSnapshot('finished', updated, finalPoints);
      if (snap) {
        void saveActiveSession(snap);
      }

      return updated;
    });
  }, [buildSessionSnapshot]);

  // Discard unconfirmed/active session and wipe auto-saved draft
  const discardTracking = useCallback(() => {
    void clearActiveSession();
    setTrackingState('idle');
    trackingStateRef.current = 'idle';
    setPoints([]);
    pointsRef.current = [];
    setSplits([]);
    splitsRef.current = [];
    setInterruptions([]);
    interruptionsRef.current = [];
    setActiveInterruptionWarning(null);
    setRecoveredSessionBanner(null);
    setIsAutoPaused(false);
    setStartedAt(null);
    stationaryStartRef.current = null;
    lostSignalActiveSinceRef.current = null;
    unroundedDistanceKmRef.current = 0;
    filterRef.current.reset();
    filterRef.current.configure(sportTypeRef.current, accuracyFilterRef.current);
    currentSplitStartKmRef.current = 0;
    currentSplitStartMovingSecRef.current = 0;
    currentSplitStartElevGainRef.current = 0;
    currentSplitStartElevLossRef.current = 0;

    const hasLiveSpeed = currentLocation?.speed !== null && currentLocation?.speed !== undefined;
    const hasLiveElev = currentLocation?.altitude !== null && currentLocation?.altitude !== undefined;

    const idleStats: ActivityStats = {
      ...INITIAL_STATS,
      currentSpeedKmH: hasLiveSpeed ? currentLocation!.speed! : 0,
      hasSpeedData: hasLiveSpeed,
      currentElevationM: hasLiveElev ? currentLocation!.altitude : null,
      hasElevationData: hasLiveElev,
      gpsAccuracyM: gpsAccuracyM,
      gpsStatus: gpsStatus,
    };
    statsRef.current = idleStats;
    setStats(idleStats);
  }, [currentLocation, gpsAccuracyM, gpsStatus]);

  // Called ONLY after user explicitly confirms Save in ActivitySummaryModal
  const completeSaveAndReset = useCallback(() => {
    discardTracking();
  }, [discardTracking]);

  const dismissInterruptionWarning = useCallback(() => {
    setActiveInterruptionWarning(null);
  }, []);

  const dismissRecoveredBanner = useCallback(() => {
    setRecoveredSessionBanner(null);
  }, []);

  const getQualityAssessment = useCallback((): GPSQualityAssessment => {
    const extraSignalIncidents = interruptionsRef.current.filter(
      (i) => i.reason === 'gps_signal_lost' || i.reason === 'background_suspended'
    ).length;
    return assessGPSQuality(pointsRef.current, statsRef.current.totalDurationSeconds, extraSignalIncidents);
  }, []);

  return {
    sportType,
    setSportType,
    accuracyFilter,
    setAccuracyFilter,
    trackingState,
    startedAt,
    gpsStatus,
    gpsAccuracyM,
    stats,
    points,
    splits,
    interruptions,
    activeInterruptionWarning,
    dismissInterruptionWarning,
    recoveredSessionBanner,
    dismissRecoveredBanner,
    currentLocation,
    errorMessage,
    startTracking,
    pauseTracking,
    resumeTracking,
    finishTracking,
    discardTracking,
    completeSaveAndReset,
    requestImmediateLocation,
    getQualityAssessment,
    isAutoPaused,
    isAutoPauseEnabled,
    toggleAutoPause,
  };
}
