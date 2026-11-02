import React, { useState } from 'react';
import {
  ActivityRecord,
  ActivityStats,
  GPSPoint,
  KilometerSplit,
  GPSQualityAssessment,
  UnitSystem,
  SportType,
  TrackingInterruption,
} from '../types/cycling';
import { CyclingMap } from './CyclingMap';
import { ActivityCharts } from './ActivityCharts';
import {
  formatDistance,
  formatDuration,
  formatSpeed,
  formatElevation,
  formatPaceFromSecPerKm,
  getDistanceUnitLabel,
  getSpeedUnitLabel,
  getPaceUnitLabel,
} from '../utils/units';
import { exportActivityToGPX } from '../services/gpxExporter';
import { ShareRideModal } from './ShareRideModal';
import { StravaSyncButton } from './StravaSyncButton';
import { StravaConnectModal } from './StravaConnectModal';
import { StravaService } from '../services/stravaService';
import {
  CheckCircle2,
  Download,
  Trash2,
  Edit2,
  Mountain,
  Gauge,
  Clock,
  Compass,
  ShieldCheck,
  X,
  Calendar,
  Share2,
  Cloud,
  Bike,
  Footprints,
  Zap,
  AlertTriangle,
} from 'lucide-react';
import { User } from '../services/firebase';

interface ActivitySummaryModalProps {
  sportType: SportType;
  startedAt?: number | null;
  stats: ActivityStats;
  points: GPSPoint[];
  splits: KilometerSplit[];
  interruptions?: TrackingInterruption[];
  gpsQuality: GPSQualityAssessment;
  unit: UnitSystem;
  onSave: (record: ActivityRecord) => Promise<void>;
  onDiscard: () => void;
  onClose: (didSave: boolean) => void;
  onViewInCalendar?: (activityDate: Date) => void;
  user?: User | null;
  onOpenAuthModal?: () => void;
}

export const ActivitySummaryModal: React.FC<ActivitySummaryModalProps> = ({
  sportType,
  startedAt,
  stats,
  points,
  splits,
  interruptions = [],
  gpsQuality,
  unit,
  onSave,
  onDiscard,
  onClose,
  onViewInCalendar,
  user = null,
  onOpenAuthModal,
}) => {
  const isRunning = sportType === 'running';

  const [title, setTitle] = useState<string>(() => {
    const hour = new Date().getHours();
    const timeOfDay =
      hour < 11 ? 'Pagi' : hour < 15 ? 'Siang' : hour < 18 ? 'Sore' : 'Malam';
    return isRunning ? `Lari ${timeOfDay}` : `Bersepeda ${timeOfDay}`;
  });

  const [notes, setNotes] = useState<string>('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showStravaModal, setShowStravaModal] = useState(false);
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);

  const startTime = startedAt ?? (points.length > 0 ? points[0].timestamp : Date.now());
  const rawEndTime = points.length > 0 ? points[points.length - 1].timestamp : Date.now();
  const endTime = Math.max(startTime, rawEndTime);
  const hasRecordedPoints = points.length > 0;
  const hasElevation = Boolean(stats.hasElevationData);

  const defaultFallbackTitle = isRunning ? 'Aktivitas Lari' : 'Aktivitas Bersepeda';

  const currentRecord: ActivityRecord = {
    id: 'temp_share_' + startTime,
    sportType,
    title: title.trim() || defaultFallbackTitle,
    notes: notes.trim(),
    startTime,
    endTime,
    stats,
    points,
    splits,
    gpsQuality,
    interruptions,
    clientUpdatedAt: endTime,
  };

  const handleSave = async () => {
    setIsSaving(true);
    const now = Date.now();
    const record: ActivityRecord = {
      id: 'act_' + now.toString(36) + '_' + Math.random().toString(36).substring(2, 6),
      sportType,
      title: title.trim() || defaultFallbackTitle,
      notes: notes.trim(),
      startTime,
      endTime: Math.max(startTime, endTime),
      stats,
      points,
      splits,
      gpsQuality,
      interruptions,
      clientUpdatedAt: now,
    };

    try {
      await onSave(record);
      setHasSaved(true);

      if (StravaService.isConnected() && StravaService.isAutoSyncEnabled()) {
        try {
          await StravaService.uploadActivity(record);
        } catch (stravaErr) {
          console.warn('Strava auto-sync notice:', stravaErr);
        }
      }
    } catch {
      // ignore
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportGPX = () => {
    exportActivityToGPX(currentRecord);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-4xl max-h-[92vh] overflow-y-auto shadow-2xl flex flex-col my-auto text-slate-900">
        {/* Modal Top Bar */}
        <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center text-white ${
                isRunning ? 'bg-emerald-600' : 'bg-cyan-600'
              }`}
            >
              {isRunning ? <Footprints className="w-4.5 h-4.5" /> : <Bike className="w-4.5 h-4.5" />}
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 leading-tight">
                Konfirmasi Ringkasan {isRunning ? 'Running' : 'Cycling'}
              </h2>
              <div className="text-xs text-slate-500">
                {new Date(startTime).toLocaleDateString('id-ID', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}{' '}
                · {new Date(startTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                {!hasSaved && ' · Belum tersimpan'}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onClose(hasSaved)}
            className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 flex items-center justify-center transition-colors cursor-pointer"
            title="Tutup jendela"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-6">
          {/* Editable Title & Notes */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Nama Aktivitas
              </label>
              <button
                type="button"
                onClick={() => setIsEditingTitle(!isEditingTitle)}
                className="text-xs text-cyan-700 hover:underline font-bold flex items-center gap-1 cursor-pointer"
              >
                <Edit2 className="w-3 h-3" />
                <span>{isEditingTitle ? 'Selesai Edit' : 'Ubah Nama'}</span>
              </button>
            </div>

            {isEditingTitle ? (
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={isRunning ? 'Contoh: Lari Pagi 5K' : 'Contoh: Bersepeda Pagi Loop'}
                className="w-full bg-white border border-cyan-500 rounded-xl px-3 py-2 text-base font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                autoFocus
              />
            ) : (
              <h3 className="text-xl font-bold text-slate-900">{title}</h3>
            )}

            <div className="mt-3">
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Tambahkan catatan (rute, kondisi cuaca, sepatu/sepeda)..."
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-cyan-600"
              />
            </div>
          </div>

          {/* Primary 4-Metric Highlights */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Total Distance */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
              <div className="text-[10px] uppercase font-bold text-slate-500 flex items-center justify-between">
                <span>Total Jarak</span>
                <Compass className="w-3.5 h-3.5 text-cyan-600" />
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-black font-mono-numbers text-slate-900">
                  {formatDistance(stats.distanceKm, unit)}
                </span>
                <span className="text-xs font-bold text-cyan-700">{getDistanceUnitLabel(unit)}</span>
              </div>
            </div>

            {/* Elapsed Duration */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
              <div className="text-[10px] uppercase font-bold text-slate-500 flex items-center justify-between">
                <span>Elapsed Time</span>
                <Clock className="w-3.5 h-3.5 text-cyan-600" />
              </div>
              <div className="mt-2">
                <span className="text-2xl font-black font-mono-numbers text-slate-900">
                  {formatDuration(stats.totalDurationSeconds)}
                </span>
              </div>
              <div className="text-[10px] text-slate-500 mt-1 font-mono-numbers font-medium">
                Moving: {formatDuration(stats.movingTimeSeconds)}
              </div>
            </div>

            {isRunning ? (
              /* Running: Average Pace */
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                <div className="text-[10px] uppercase font-bold text-slate-500 flex items-center justify-between">
                  <span>Average Pace</span>
                  <Footprints className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-black font-mono-numbers text-slate-900">
                    {formatPaceFromSecPerKm(stats.avgPaceSecPerKm, unit)}
                  </span>
                  <span className="text-xs font-bold text-emerald-700">{getPaceUnitLabel(unit)}</span>
                </div>
                <div className="text-[10px] text-amber-700 mt-1 font-mono-numbers font-semibold flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  <span>Best: {formatPaceFromSecPerKm(stats.bestPaceSecPerKm, unit)}</span>
                </div>
              </div>
            ) : (
              /* Cycling: Average Speed */
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                <div className="text-[10px] uppercase font-bold text-slate-500 flex items-center justify-between">
                  <span>Average Speed</span>
                  <Gauge className="w-3.5 h-3.5 text-cyan-600" />
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-black font-mono-numbers text-slate-900">
                    {formatSpeed(stats.avgSpeedKmH, unit, hasRecordedPoints)}
                  </span>
                  <span className="text-xs font-bold text-cyan-700">{getSpeedUnitLabel(unit)}</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-1 font-mono-numbers">
                  Maks: {formatSpeed(stats.maxSpeedKmH, unit, hasRecordedPoints)} {getSpeedUnitLabel(unit)}
                </div>
              </div>
            )}

            {/* Elevation Gain */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
              <div className="text-[10px] uppercase font-bold text-slate-500 flex items-center justify-between">
                <span>Total Elev. Gain</span>
                <Mountain className="w-3.5 h-3.5 text-emerald-600" />
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-black font-mono-numbers text-emerald-600">
                  {hasElevation ? `+${formatElevation(stats.elevationGainM, unit, true)}` : '--'}
                </span>
              </div>
              <div className="text-[10px] text-slate-500 mt-1 font-mono-numbers">
                {hasElevation
                  ? `Turun: -${formatElevation(stats.elevationLossM, unit, true)}`
                  : 'Sensor elevasi tidak tersedia'}
              </div>
            </div>
          </div>

          {/* Secondary Complete Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs">
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-medium">Moving Time</span>
              <span className="font-mono-numbers font-bold text-emerald-700 text-sm">
                {formatDuration(stats.movingTimeSeconds)}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-medium">Stopped Time</span>
              <span className="font-mono-numbers font-bold text-rose-600 text-sm">
                {formatDuration(stats.stoppedTimeSeconds)}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-medium">
                {isRunning ? 'Avg / Max Speed' : 'Avg / Best Pace'}
              </span>
              <span className="font-mono-numbers font-bold text-slate-800 text-sm">
                {isRunning
                  ? `${formatSpeed(stats.avgSpeedKmH, unit, hasRecordedPoints)} / ${formatSpeed(stats.maxSpeedKmH, unit, hasRecordedPoints)} ${getSpeedUnitLabel(unit)}`
                  : `${formatPaceFromSecPerKm(stats.avgPaceSecPerKm, unit)} / ${formatPaceFromSecPerKm(stats.bestPaceSecPerKm, unit)}`}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-medium">Elevasi Awal / Akhir</span>
              <span className="font-mono-numbers font-bold text-slate-800 text-sm">
                {formatElevation(stats.startElevationM, unit, hasElevation)} /{' '}
                {formatElevation(stats.endElevationM, unit, hasElevation)}
              </span>
            </div>
          </div>

          {/* Complete Route Map */}
          <div>
            <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Compass className="w-4 h-4 text-cyan-600" />
              <span>Peta Lengkap Rute & Penanda Jarak</span>
            </div>
            <CyclingMap
              currentLocation={points.length > 0 ? points[points.length - 1] : null}
              points={points}
              splits={splits}
              stats={stats}
              sportType={sportType}
              unit={unit}
              trackingState="finished"
              isTracking={false}
              highlightedPointIndex={hoveredPointIndex}
              heightClass="h-72 sm:h-80"
            />
          </div>

          {/* Charts & Splits */}
          <ActivityCharts
            points={points}
            splits={splits}
            stats={stats}
            sportType={sportType}
            unit={unit}
            onHoverPoint={setHoveredPointIndex}
          />

          {/* GPS Data Quality & Interruptions Card */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-cyan-600" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Kualitas & Kejujuran Data GPS
                </h4>
              </div>
              <span className="text-xs font-bold text-slate-700">
                Rating: {gpsQuality.qualityRating}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                <span className="text-slate-500 text-[10px] block">Titik GPS Valid</span>
                <span className="text-base font-black font-mono-numbers text-slate-900">
                  {gpsQuality.totalPoints} titik
                </span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                <span className="text-slate-500 text-[10px] block">Rata-Rata Akurasi</span>
                <span className="text-base font-black font-mono-numbers text-cyan-700">
                  {gpsQuality.avgAccuracyM !== null ? `±${gpsQuality.avgAccuracyM} m` : '--'}
                </span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                <span className="text-slate-500 text-[10px] block">Kelengkapan Sesi</span>
                <span className="text-base font-black font-mono-numbers text-emerald-600">
                  {gpsQuality.totalPoints > 0 ? `${gpsQuality.completenessPercent}%` : '--'}
                </span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                <span className="text-slate-500 text-[10px] block">Insiden Jeda Sinyal</span>
                <span className="text-base font-black font-mono-numbers text-slate-700">
                  {gpsQuality.lostSignalIncidents} kali
                </span>
              </div>
            </div>

            {interruptions.length > 0 && (
              <div className="pt-2 border-t border-slate-200 text-xs text-amber-900 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  <span>Catatan Gangguan Tracking ({interruptions.length}):</span>
                </div>
                <ul className="space-y-0.5 text-[11px] text-slate-600">
                  {interruptions.slice(-3).map((intr) => (
                    <li key={intr.id}>· {intr.message}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Cloud Sync Status Notice */}
        <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Cloud className="w-4 h-4 text-cyan-600 shrink-0" />
            {user ? (
              <span className="text-slate-600">
                {hasSaved
                  ? 'Aktivitas tersimpan & disinkronkan ke akun Gmail: '
                  : 'Saat disimpan, aktivitas otomatis disinkronkan ke akun Gmail: '}
                <strong className="text-slate-900">{user.email}</strong>
              </span>
            ) : (
              <span className="text-slate-500">
                Masuk dengan akun Google (Gmail) bila ingin menyinkronkan aktivitas ini ke perangkat lain.
              </span>
            )}
          </div>
          {!user && onOpenAuthModal && (
            <button
              type="button"
              onClick={onOpenAuthModal}
              className="font-bold text-cyan-700 hover:text-cyan-800 underline cursor-pointer shrink-0 ml-2"
            >
              Masuk Gmail
            </button>
          )}
        </div>

        {/* Modal Action Buttons Footer */}
        <div className="sticky bottom-0 bg-white/95 backdrop-blur-md px-5 py-4 border-t border-slate-100 flex flex-col gap-3">
          {confirmDiscard && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between gap-2 text-xs text-rose-950">
              <span className="font-semibold">
                Yakin ingin membuang aktivitas ini tanpa menyimpan ke riwayat?
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setConfirmDiscard(false)}
                  className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={onDiscard}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold cursor-pointer"
                >
                  Ya, Buang
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            {!hasSaved ? (
              <button
                type="button"
                onClick={() => setConfirmDiscard(true)}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-600 text-xs font-bold flex items-center gap-1.5 transition-colors border border-slate-200 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Discard / Buang</span>
              </button>
            ) : (
              <div className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>Aktivitas resmi tercatat di Riwayat</span>
              </div>
            )}

            <div className="flex items-center gap-2 ml-auto flex-wrap">
              <button
                type="button"
                onClick={() => setShowShareModal(true)}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-cyan-50 hover:bg-cyan-100 text-cyan-800 text-xs font-bold flex items-center gap-1.5 transition-colors border border-cyan-200 cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5 text-cyan-600" />
                <span>{isRunning ? 'Share Aktivitas' : 'Share My Ride'}</span>
              </button>

              <StravaSyncButton
                activity={currentRecord}
                onOpenStravaModal={() => setShowStravaModal(true)}
              />

              <button
                type="button"
                onClick={handleExportGPX}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors border border-slate-200 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-slate-600" />
                <span>Unduh .GPX</span>
              </button>

              {hasSaved && onViewInCalendar && (
                <button
                  type="button"
                  onClick={() => {
                    onViewInCalendar(new Date(startTime));
                  }}
                  className="min-h-[44px] px-5 rounded-xl font-bold text-xs bg-cyan-600 hover:bg-cyan-500 text-white flex items-center gap-2 transition-all cursor-pointer"
                >
                  <Calendar className="w-4 h-4" />
                  <span>Lihat di Riwayat</span>
                </button>
              )}

              <button
                type="button"
                onClick={hasSaved ? () => onClose(true) : handleSave}
                disabled={isSaving}
                className="min-h-[44px] px-6 rounded-xl font-bold text-sm flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-all cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {hasSaved
                    ? 'Selesai & Mulai Baru'
                    : isSaving
                    ? 'Menyimpan...'
                    : 'KONFIRMASI & SIMPAN'}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Share Snapshot Modal */}
      <ShareRideModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        activity={currentRecord}
        unit={unit}
      />

      {/* Strava Connect & GPX Modal */}
      <StravaConnectModal
        isOpen={showStravaModal}
        onClose={() => setShowStravaModal(false)}
      />
    </div>
  );
};
