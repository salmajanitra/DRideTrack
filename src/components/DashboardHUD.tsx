import React, { useState } from 'react';
import {
  ActivityStats,
  TrackingState,
  GPSStatus,
  UnitSystem,
  DigitalRoute,
  SportType,
  AccuracyFilterLevel,
  KilometerSplit,
} from '../types/cycling';
import {
  formatSpeed,
  formatDistance,
  formatDuration,
  formatElevation,
  formatPaceFromSecPerKm,
  getSpeedUnitLabel,
  getDistanceUnitLabel,
  getPaceUnitLabel,
} from '../utils/units';
import {
  Play,
  Pause,
  Square,
  BookmarkCheck,
  Trash2,
  Mountain,
  Gauge,
  Clock,
  Compass,
  TrendingUp,
  Activity,
  Sun,
  Sliders,
  Bike,
  Footprints,
  AlertTriangle,
  Wifi,
  WifiOff,
  X,
  Zap,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';
import { DigitalMotoSpeedometer } from './DigitalMotoSpeedometer';

interface DashboardHUDProps {
  sportType: SportType;
  onChangeSportType: (sport: SportType) => void;
  accuracyFilter: AccuracyFilterLevel;
  onChangeAccuracyFilter: (level: AccuracyFilterLevel) => void;
  stats: ActivityStats;
  splits: KilometerSplit[];
  trackingState: TrackingState;
  gpsStatus: GPSStatus;
  gpsAccuracyM: number | null;
  isOnline: boolean;
  unit: UnitSystem;
  onChangeUnit: (unit: UnitSystem) => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onFinish: () => void;
  onSave: () => void;
  onDiscard: () => void;
  isScreenAwake?: boolean;
  onToggleScreenAwake?: () => void;
  onOpenDisplaySettings?: () => void;
  isAutoPaused?: boolean;
  isAutoPauseEnabled: boolean;
  onToggleAutoPause: () => void;
  activeInterruptionWarning?: string | null;
  onDismissInterruptionWarning?: () => void;
  recoveredSessionBanner?: string | null;
  onDismissRecoveredBanner?: () => void;
  activeTargetRoute?: DigitalRoute | null;
  onViewRouteInMap?: () => void;
}

export const DashboardHUD: React.FC<DashboardHUDProps> = ({
  sportType,
  onChangeSportType,
  accuracyFilter,
  onChangeAccuracyFilter,
  stats,
  splits,
  trackingState,
  gpsStatus,
  gpsAccuracyM,
  isOnline,
  unit,
  onChangeUnit,
  onStart,
  onPause,
  onResume,
  onFinish,
  onSave,
  onDiscard,
  isScreenAwake = true,
  onToggleScreenAwake,
  onOpenDisplaySettings,
  isAutoPaused = false,
  isAutoPauseEnabled,
  onToggleAutoPause,
  activeInterruptionWarning,
  onDismissInterruptionWarning,
  recoveredSessionBanner,
  onDismissRecoveredBanner,
  activeTargetRoute,
  onViewRouteInMap,
}) => {
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [runningHeroMode, setRunningHeroMode] = useState<'pace' | 'speedometer'>('pace');

  const isRunning = sportType === 'running';
  const hasRecordedPoints = stats.recordedPointsCount > 0;
  const hasLiveOrRecordedSpeed = Boolean(stats.hasSpeedData || hasRecordedPoints);
  const hasElevation = Boolean(stats.hasElevationData);

  // Human-readable GPS signal label
  const getGpsStatusDisplay = () => {
    switch (gpsStatus) {
      case 'locked':
        return { label: 'GPS Akurat', dot: 'bg-emerald-500', text: 'text-emerald-700' };
      case 'weak':
        return { label: 'Sinyal Lemah', dot: 'bg-amber-500', text: 'text-amber-700' };
      case 'searching':
        return { label: 'Mencari GPS', dot: 'bg-cyan-500 animate-pulse', text: 'text-cyan-700' };
      case 'lost':
        return { label: 'Sinyal Terputus', dot: 'bg-rose-500 animate-pulse', text: 'text-rose-700' };
      case 'denied':
        return { label: 'Izin Lokasi Ditolak', dot: 'bg-rose-600', text: 'text-rose-700' };
      case 'unavailable':
        return { label: 'GPS Tidak Tersedia', dot: 'bg-slate-400', text: 'text-slate-600' };
    }
  };

  const getRecordingStateLabel = () => {
    if (trackingState === 'recording') {
      return isAutoPaused
        ? { label: 'Auto-Pause (Berhenti)', dot: 'bg-amber-500 animate-pulse', text: 'text-amber-700' }
        : { label: 'Merekam Aktif', dot: 'bg-emerald-500 animate-ping', text: 'text-emerald-700' };
    }
    if (trackingState === 'paused') {
      return { label: 'Dijeda (Paused)', dot: 'bg-amber-500', text: 'text-amber-700' };
    }
    if (trackingState === 'finished') {
      return { label: 'Selesai (Belum Disimpan)', dot: 'bg-cyan-600', text: 'text-cyan-700' };
    }
    return { label: 'Siap (Standby)', dot: 'bg-slate-400', text: 'text-slate-600' };
  };

  const gpsInfo = getGpsStatusDisplay();
  const recInfo = getRecordingStateLabel();

  // Fastest split index for Running split list
  const fastestSplitKm =
    splits.length > 0
      ? splits.reduce((best, cur) => (cur.avgSpeedKmH > best.avgSpeedKmH ? cur : best), splits[0]).kmIndex
      : null;

  return (
    <div className="flex flex-col gap-3">
      {/* Recovered Unfinished Session Banner (after accidental page reload) */}
      {recoveredSessionBanner && (
        <div className="p-3.5 bg-cyan-50 border border-cyan-200 rounded-2xl text-xs text-cyan-950 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <RotateCcw className="w-4 h-4 text-cyan-700 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block text-cyan-950">Pemulihan Sesi Otomatis</span>
              <span className="text-cyan-900">{recoveredSessionBanner}</span>
            </div>
          </div>
          {onDismissRecoveredBanner && (
            <button
              type="button"
              onClick={onDismissRecoveredBanner}
              className="p-1 text-cyan-700 hover:text-cyan-950 rounded-lg cursor-pointer"
              aria-label="Tutup pemberitahuan"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Tracking Interruption / Weak GPS / OS Background Warning */}
      {activeInterruptionWarning && (
        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-950 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block text-amber-950">Peringatan Pelacakan GPS</span>
              <span className="text-amber-900">{activeInterruptionWarning}</span>
            </div>
          </div>
          {onDismissInterruptionWarning && (
            <button
              type="button"
              onClick={onDismissInterruptionWarning}
              className="p-1 text-amber-700 hover:text-amber-950 rounded-lg cursor-pointer"
              aria-label="Tutup peringatan"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Active Target Route Guidance Bar */}
      {activeTargetRoute && (
        <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-2xl text-xs text-white">
          <div className="flex items-center gap-2.5 min-w-0">
            <Bike className="w-4 h-4 text-cyan-400 shrink-0" />
            <div className="min-w-0">
              <div className="font-bold text-cyan-300 text-xs truncate">
                Target Rute: {activeTargetRoute.title} · {activeTargetRoute.climbCategory || 'Datar'}
              </div>
              <div className="text-[11px] text-slate-300 font-mono-numbers mt-0.5">
                {activeTargetRoute.distanceKm} km · +{activeTargetRoute.elevationGainM}m · Maks{' '}
                {activeTargetRoute.maxGradientPercent}%
              </div>
            </div>
          </div>
          {onViewRouteInMap && (
            <button
              type="button"
              onClick={onViewRouteInMap}
              className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold shrink-0 transition-colors cursor-pointer"
            >
              Lihat Peta
            </button>
          )}
        </div>
      )}

      {/* PRE-ACTIVITY CONFIGURATION PANEL (Shown before activity starts) */}
      {trackingState === 'idle' && (
        <div className="bg-white border border-slate-200/90 rounded-3xl p-4 sm:p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-extrabold text-slate-900">Persiapan & Pengaturan Aktivitas</h2>
              <p className="text-xs text-slate-500">
                Pilih jenis olahraga, satuan pengukuran, dan filter sinyal GPS sebelum menekan Start
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* 1. Sport Mode Selector: Cycling vs Running */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                Jenis Olahraga
              </label>
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-2xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => onChangeSportType('cycling')}
                  className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    sportType === 'cycling'
                      ? 'bg-white text-cyan-700 shadow-xs border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Bike className="w-4 h-4" />
                  <span>Cycling</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeSportType('running')}
                  className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    sportType === 'running'
                      ? 'bg-white text-emerald-700 shadow-xs border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Footprints className="w-4 h-4" />
                  <span>Running</span>
                </button>
              </div>
            </div>

            {/* 2. Unit System Selector */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                Satuan Pengukuran
              </label>
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-2xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => onChangeUnit('metric')}
                  className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    unit === 'metric'
                      ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Metrik (km, km/h)
                </button>
                <button
                  type="button"
                  onClick={() => onChangeUnit('imperial')}
                  className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    unit === 'imperial'
                      ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Imperial (mi, mph)
                </button>
              </div>
            </div>
          </div>

          {/* 3. Tracking Settings: GPS Accuracy Filter, Auto-Pause, Screen Wake Lock */}
          <div className="pt-2 border-t border-slate-100 grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-6">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                Filter Akurasi Sinyal GPS
              </label>
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs">
                {(
                  [
                    { id: 'strict', label: 'Ketat (≤25m)' },
                    { id: 'balanced', label: 'Seimbang (≤45m)' },
                    { id: 'relaxed', label: 'Longgar (≤75m)' },
                  ] as { id: AccuracyFilterLevel; label: string }[]
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChangeAccuracyFilter(opt.id)}
                    className={`min-h-[38px] px-2 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                      accuracyFilter === opt.id
                        ? 'bg-white text-slate-900 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="md:col-span-6 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onToggleAutoPause}
                className={`min-h-[40px] flex-1 px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                  isAutoPauseEnabled
                    ? 'bg-amber-50 text-amber-900 border-amber-300'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Pause className="w-3.5 h-3.5" />
                <span>Auto-Pause: {isAutoPauseEnabled ? 'Aktif' : 'Mati'}</span>
              </button>

              {onToggleScreenAwake && (
                <button
                  type="button"
                  onClick={onToggleScreenAwake}
                  className={`min-h-[40px] flex-1 px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    isScreenAwake
                      ? 'bg-cyan-50 text-cyan-900 border-cyan-300'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Sun className="w-3.5 h-3.5" />
                  <span>Layar Nyala: {isScreenAwake ? 'Aktif' : 'Mati'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MAIN TELEMETRY CONSOLE CARD */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-4 sm:p-5 md:p-6 shadow-xs">
        {/* Top Status Line: Sport Mode · Recording Status · Connection · GPS Accuracy */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-100 text-xs">
          <div className="flex flex-wrap items-center gap-2 text-slate-600">
            <span className="font-extrabold text-slate-900 inline-flex items-center gap-1.5">
              {isRunning ? (
                <Footprints className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Bike className="w-3.5 h-3.5 text-cyan-600" />
              )}
              {isRunning ? 'Running' : 'Cycling'}
            </span>
            <span aria-hidden="true">·</span>
            <span className={`inline-flex items-center gap-1.5 font-bold ${recInfo.text}`}>
              <span className={`w-2 h-2 rounded-full ${recInfo.dot}`} />
              {recInfo.label}
            </span>
            <span aria-hidden="true" className="hidden sm:inline">
              ·
            </span>
            <span className="text-slate-500 font-mono-numbers hidden sm:inline">
              {stats.recordedPointsCount} titik
            </span>
          </div>

          {/* Connection & GPS Accuracy Status */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className={`inline-flex items-center gap-1 font-semibold ${
                isOnline ? 'text-emerald-700' : 'text-amber-700'
              }`}
            >
              {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              <span>{isOnline ? 'Online' : 'Offline'}</span>
            </span>
            <span aria-hidden="true" className="text-slate-300">
              ·
            </span>
            <span className={`inline-flex items-center gap-1.5 font-semibold ${gpsInfo.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${gpsInfo.dot}`} />
              <span>{gpsInfo.label}</span>
              <span className="font-mono-numbers text-slate-700">
                {gpsAccuracyM !== null ? `(±${gpsAccuracyM}m)` : '(--)'}
              </span>
            </span>
          </div>
        </div>

        {/* ===================================================================== */}
        {/* HERO FOCAL METRIC: DIGITAL MOTORCYCLE SPEEDOMETER / RUNNING PACE      */}
        {/* ===================================================================== */}
        {isRunning ? (
          <div className="space-y-3">
            {/* Compact Display Switcher for Running Mode (Pace Priority vs Digital Moto Speedometer) */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Instrumen Utama Lari
              </span>
              <div className="inline-flex p-0.5 bg-slate-100 rounded-xl border border-slate-200 text-xs">
                <button
                  type="button"
                  onClick={() => setRunningHeroMode('pace')}
                  className={`min-h-[34px] px-3 py-1 rounded-lg font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                    runningHeroMode === 'pace'
                      ? 'bg-white text-emerald-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Footprints className="w-3.5 h-3.5" />
                  <span>Pace Lari</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRunningHeroMode('speedometer')}
                  className={`min-h-[34px] px-3 py-1 rounded-lg font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                    runningHeroMode === 'speedometer'
                      ? 'bg-slate-900 text-cyan-300 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Gauge className="w-3.5 h-3.5" />
                  <span>Speedometer Digital</span>
                </button>
              </div>
            </div>

            {runningHeroMode === 'speedometer' ? (
              <DigitalMotoSpeedometer
                stats={stats}
                unit={unit}
                sportType={sportType}
                trackingState={trackingState}
                gpsStatus={gpsStatus}
                gpsAccuracyM={gpsAccuracyM}
                isOnline={isOnline}
                isAutoPaused={isAutoPaused}
              />
            ) : (
              /* RUNNING MODE DEFAULT HERO: CURRENT PACE */
              <div className="flex flex-col items-center justify-center py-3 sm:py-4">
                <div className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500 flex items-center gap-1.5 mb-1">
                  <Footprints className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Current Pace Lari</span>
                  {isAutoPaused && <span className="text-amber-600 font-bold">· Auto-Pause</span>}
                </div>

                <div className="flex items-baseline justify-center gap-2 leading-none">
                  <span className="text-7xl sm:text-8xl md:text-9xl font-black font-mono-numbers tracking-tighter text-slate-950 select-none">
                    {formatPaceFromSecPerKm(stats.currentPaceSecPerKm, unit)}
                  </span>
                  <span className="text-lg sm:text-2xl font-extrabold text-emerald-600 font-mono-numbers pb-2">
                    {getPaceUnitLabel(unit)}
                  </span>
                </div>

                <div className="mt-2 text-xs text-slate-500 font-mono-numbers flex flex-wrap items-center justify-center gap-2">
                  <span>
                    Kecepatan saat ini:{' '}
                    <strong className="text-slate-800">
                      {formatSpeed(stats.currentSpeedKmH, unit, hasLiveOrRecordedSpeed)} {getSpeedUnitLabel(unit)}
                    </strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Kec. Rata-rata:{' '}
                    <strong className="text-slate-800">
                      {formatSpeed(stats.avgSpeedKmH, unit, hasRecordedPoints)} {getSpeedUnitLabel(unit)}
                    </strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Maks:{' '}
                    <strong className="text-slate-800">
                      {formatSpeed(stats.maxSpeedKmH, unit, hasRecordedPoints)} {getSpeedUnitLabel(unit)}
                    </strong>
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* CYCLING MODE HERO: ENLARGED DIGITAL MOTORCYCLE SPEEDOMETER CLUSTER */
          <DigitalMotoSpeedometer
            stats={stats}
            unit={unit}
            sportType={sportType}
            trackingState={trackingState}
            gpsStatus={gpsStatus}
            gpsAccuracyM={gpsAccuracyM}
            isOnline={isOnline}
            isAutoPaused={isAutoPaused}
          />
        )}

        {/* PRIMARY 4-METRIC GRID (Tailored to Sport Mode) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mt-3 pt-3 border-t border-slate-100">
          {/* 1. Distance */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 flex flex-col justify-between">
            <div className="text-[10px] uppercase font-bold tracking-wider text-slate-500 flex items-center justify-between">
              <span>Jarak Tempuh</span>
              <Compass className="w-3.5 h-3.5 text-cyan-600" />
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-2xl sm:text-3xl font-black font-mono-numbers text-slate-900">
                {formatDistance(stats.distanceKm, unit)}
              </span>
              <span className="text-xs font-bold text-cyan-700">{getDistanceUnitLabel(unit)}</span>
            </div>
          </div>

          {/* 2. Elapsed Time */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 flex flex-col justify-between">
            <div className="text-[10px] uppercase font-bold tracking-wider text-slate-500 flex items-center justify-between">
              <span>Elapsed Time</span>
              <Clock className="w-3.5 h-3.5 text-cyan-600" />
            </div>
            <div className="mt-1">
              <span className="text-2xl sm:text-3xl font-black font-mono-numbers text-slate-900">
                {formatDuration(stats.totalDurationSeconds)}
              </span>
            </div>
          </div>

          {isRunning ? (
            <>
              {/* 3. Running: Average Pace */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 flex flex-col justify-between">
                <div className="text-[10px] uppercase font-bold tracking-wider text-slate-500 flex items-center justify-between">
                  <span>Average Pace</span>
                  <Activity className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-2xl sm:text-3xl font-black font-mono-numbers text-slate-900">
                    {formatPaceFromSecPerKm(stats.avgPaceSecPerKm, unit)}
                  </span>
                  <span className="text-[11px] font-bold text-emerald-700">{getPaceUnitLabel(unit)}</span>
                </div>
              </div>

              {/* 4. Running: Best Pace (valid interval) */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 flex flex-col justify-between">
                <div className="text-[10px] uppercase font-bold tracking-wider text-slate-500 flex items-center justify-between">
                  <span>Best Pace</span>
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-2xl sm:text-3xl font-black font-mono-numbers text-amber-600">
                    {formatPaceFromSecPerKm(stats.bestPaceSecPerKm, unit)}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-500">{getPaceUnitLabel(unit)}</span>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* 3. Cycling: Average Speed */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 flex flex-col justify-between">
                <div className="text-[10px] uppercase font-bold tracking-wider text-slate-500 flex items-center justify-between">
                  <span>Average Speed</span>
                  <Activity className="w-3.5 h-3.5 text-cyan-600" />
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-2xl sm:text-3xl font-black font-mono-numbers text-slate-900">
                    {formatSpeed(stats.avgSpeedKmH, unit, hasRecordedPoints)}
                  </span>
                  <span className="text-xs font-bold text-cyan-700">{getSpeedUnitLabel(unit)}</span>
                </div>
              </div>

              {/* 4. Cycling: Maximum Speed */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 flex flex-col justify-between">
                <div className="text-[10px] uppercase font-bold tracking-wider text-slate-500 flex items-center justify-between">
                  <span>Max Speed</span>
                  <TrendingUp className="w-3.5 h-3.5 text-amber-600" />
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-2xl sm:text-3xl font-black font-mono-numbers text-amber-600">
                    {formatSpeed(stats.maxSpeedKmH, unit, hasRecordedPoints)}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">{getSpeedUnitLabel(unit)}</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* COMPACT SECONDARY TELEMETRY ROW: Moving Time, Stopped Time, Elevation, Total Elevation Gain, Best Pace / Speed */}
        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 mt-2.5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            {/* Moving Time */}
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Moving Time
              </span>
              <span className="text-sm sm:text-base font-black font-mono-numbers text-emerald-700 mt-0.5 block">
                {formatDuration(stats.movingTimeSeconds)}
              </span>
            </div>

            {/* Stopped Time */}
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Stopped Time
              </span>
              <span className="text-sm sm:text-base font-black font-mono-numbers text-rose-600 mt-0.5 block">
                {formatDuration(stats.stoppedTimeSeconds)}
              </span>
            </div>

            {/* Elevation */}
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                <Mountain className="w-3 h-3 text-cyan-600" />
                <span>Elevasi Saat Ini</span>
              </span>
              <span className="text-sm sm:text-base font-black font-mono-numbers text-slate-800 mt-0.5 block">
                {formatElevation(stats.currentElevationM, unit, hasElevation)}
              </span>
            </div>

            {/* Total Elevation Gain */}
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-emerald-600" />
                <span>Total Elev. Gain</span>
              </span>
              <div className="flex items-center gap-2 font-mono-numbers font-black text-sm sm:text-base mt-0.5">
                <span className="text-emerald-700">
                  {hasElevation ? `+${formatElevation(stats.elevationGainM, unit, true)}` : '--'}
                </span>
                {hasElevation && stats.elevationLossM > 0 && (
                  <span className="text-xs text-rose-600">
                    -{formatElevation(stats.elevationLossM, unit, true)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Extra Pace summary on Cycling mode so Best Pace is always accessible */}
          {!isRunning && (
            <div className="mt-2.5 pt-2 border-t border-slate-200/70 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 font-mono-numbers">
              <span>
                Pace saat ini:{' '}
                <strong className="text-slate-800">
                  {formatPaceFromSecPerKm(stats.currentPaceSecPerKm, unit)} {getPaceUnitLabel(unit)}
                </strong>
              </span>
              <span>
                Avg Pace:{' '}
                <strong className="text-slate-800">
                  {formatPaceFromSecPerKm(stats.avgPaceSecPerKm, unit)}
                </strong>
              </span>
              <span>
                Best Pace (Interval Valid):{' '}
                <strong className="text-amber-700">
                  {formatPaceFromSecPerKm(stats.bestPaceSecPerKm, unit)}
                </strong>
              </span>
            </div>
          )}
        </div>

        {/* RUNNING MODE PRIORITY: LIVE SPLIT PER KILOMETER TABLE */}
        {isRunning && (
          <div className="mt-3 border border-slate-200/80 rounded-2xl p-3.5 bg-slate-50/60">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                Split per Kilometer ({splits.length})
              </span>
              <span className="text-[11px] text-slate-500 font-mono-numbers">
                KM berjalan: {(stats.distanceKm % 1).toFixed(2)} / 1.00 km
              </span>
            </div>

            {splits.length === 0 ? (
              <p className="text-xs text-slate-500 py-2">
                Split per kilometer akan tercatat otomatis setiap Anda menyelesaikan jarak 1.00 km.
              </p>
            ) : (
              <div className="divide-y divide-slate-200/70 max-h-52 overflow-y-auto text-xs font-mono-numbers">
                {splits.map((sp) => {
                  const isFastest = sp.kmIndex === fastestSplitKm;
                  const paceSec =
                    sp.paceSecondsPerKm ??
                    (sp.avgSpeedKmH > 0 ? Math.round(3600 / sp.avgSpeedKmH) : null);
                  return (
                    <div key={sp.kmIndex} className="py-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">KM {sp.kmIndex}</span>
                        {isFastest && (
                          <span className="text-[10px] font-sans font-bold text-amber-700">
                            · Tercepat
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-right">
                        <span className="text-slate-600">{formatDuration(sp.durationSeconds)}</span>
                        <span className="font-black text-emerald-700">
                          {formatPaceFromSecPerKm(paceSec, unit)} /{unit === 'imperial' ? 'mi' : 'km'}
                        </span>
                        {sp.hasElevation && sp.elevationGainM > 0 && (
                          <span className="text-slate-500 hidden sm:inline">+{sp.elevationGainM}m</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ACTIVITY CONTROLS: START, PAUSE, RESUME, FINISH, DISCARD */}
        <div className="mt-4 pt-3.5 border-t border-slate-100 flex flex-col gap-3">
          {/* Inline Discard Confirmation Bar (Zero window.confirm) */}
          {confirmDiscard && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-rose-950">
              <span className="font-semibold">
                Buang sesi ini? Data aktivitas yang belum disimpan akan dihapus permanen.
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setConfirmDiscard(false)}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmDiscard(false);
                    onDiscard();
                  }}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold cursor-pointer"
                >
                  Ya, Buang Aktivitas
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            {/* Secondary Controls: Discard & Display Settings */}
            <div className="flex items-center gap-2 flex-wrap">
              {trackingState !== 'idle' && !confirmDiscard && (
                <button
                  type="button"
                  onClick={() => setConfirmDiscard(true)}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors border border-slate-200 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Discard</span>
                </button>
              )}

              {onOpenDisplaySettings && (
                <button
                  type="button"
                  onClick={onOpenDisplaySettings}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors border bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200 cursor-pointer"
                >
                  <Sliders className="w-3.5 h-3.5 text-slate-600" />
                  <span>Pengaturan Layar</span>
                </button>
              )}
            </div>

            {/* Primary Action Controls */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              {trackingState === 'idle' && (
                <button
                  type="button"
                  onClick={onStart}
                  className={`w-full sm:w-auto min-h-[52px] px-8 rounded-2xl text-white font-black text-sm flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.99] cursor-pointer ${
                    isRunning
                      ? 'bg-emerald-600 hover:bg-emerald-500'
                      : 'bg-cyan-600 hover:bg-cyan-500'
                  }`}
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>START {isRunning ? 'RUNNING' : 'CYCLING'}</span>
                </button>
              )}

              {trackingState === 'recording' && (
                <div className="grid grid-cols-2 gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={onPause}
                    className="min-h-[52px] px-6 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.99] cursor-pointer"
                  >
                    <Pause className="w-4 h-4 fill-current" />
                    <span>PAUSE</span>
                  </button>
                  <button
                    type="button"
                    onClick={onFinish}
                    className="min-h-[52px] px-6 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-black text-sm flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.99] cursor-pointer"
                  >
                    <Square className="w-4 h-4 fill-current" />
                    <span>FINISH</span>
                  </button>
                </div>
              )}

              {trackingState === 'paused' && (
                <div className="grid grid-cols-2 gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={onResume}
                    className="min-h-[52px] px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.99] cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>RESUME</span>
                  </button>
                  <button
                    type="button"
                    onClick={onFinish}
                    className="min-h-[52px] px-6 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-black text-sm flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.99] cursor-pointer"
                  >
                    <Square className="w-4 h-4 fill-current" />
                    <span>FINISH</span>
                  </button>
                </div>
              )}

              {trackingState === 'finished' && (
                <button
                  type="button"
                  onClick={onSave}
                  className="w-full sm:w-auto min-h-[52px] px-7 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.99] cursor-pointer"
                >
                  <BookmarkCheck className="w-5 h-5" />
                  <span>KONFIRMASI & SIMPAN</span>
                </button>
              )}
            </div>
          </div>

          {/* Honest Browser Background Limitation Notice */}
          {trackingState !== 'idle' && (
            <div className="text-[11px] text-slate-500 flex items-start gap-1.5 pt-1">
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-600 shrink-0 mt-0.5" />
              <span>
                Titik GPS disimpan berkala untuk pemulihan jika halaman termuat ulang. Jaga browser tetap aktif dan layar menyala—menutup browser atau penghentian proses oleh OS dapat memutus perekaman GPS.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
