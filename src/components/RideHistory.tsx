import React, { useState, useEffect } from 'react';
import { ActivityRecord, UnitSystem } from '../types/cycling';
import { getActivities, deleteActivity } from '../services/db';
import { exportActivityToGPX } from '../services/gpxExporter';
import { CyclingMap } from './CyclingMap';
import { ActivityCharts } from './ActivityCharts';
import { ActivityCalendarRecap } from './ActivityCalendarRecap';
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
import {
  History,
  Download,
  Trash2,
  Calendar,
  Clock,
  Compass,
  ChevronRight,
  ArrowLeft,
  List,
  Share2,
  Cloud,
  RefreshCw,
  Bike,
  Footprints,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { ShareRideModal } from './ShareRideModal';
import { StravaSyncButton } from './StravaSyncButton';
import { StravaConnectModal } from './StravaConnectModal';
import {
  User,
  SyncResult,
  deleteCloudActivity,
  ACTIVITIES_UPDATED_EVENT,
} from '../services/firebase';

interface RideHistoryProps {
  unit: UnitSystem;
  onSelectActivity?: (record: ActivityRecord) => void;
  onActivitiesChanged?: () => void;
  focusDate?: Date;
  user?: User | null;
  onOpenAuthModal?: () => void;
  onSyncNow?: () => Promise<SyncResult | null>;
  isSyncing?: boolean;
  syncError?: string | null;
  lastSyncTime?: number | null;
}

export const RideHistory: React.FC<RideHistoryProps> = ({
  unit,
  onActivitiesChanged,
  focusDate,
  user = null,
  onOpenAuthModal,
  onSyncNow,
  isSyncing = false,
  syncError = null,
  lastSyncTime = null,
}) => {
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [selectedActivity, setSelectedActivity] = useState<ActivityRecord | null>(null);
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [subTab, setSubTab] = useState<'calendar' | 'list'>('list');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [shareTargetActivity, setShareTargetActivity] = useState<ActivityRecord | null>(null);
  const [showStravaModal, setShowStravaModal] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const loadActivities = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const records = await getActivities();
      setActivities(records);
    } catch {
      // ignore
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    loadActivities(false);
    const handleRemoteUpdate = () => {
      loadActivities(true);
    };
    window.addEventListener(ACTIVITIES_UPDATED_EVENT, handleRemoteUpdate);
    return () => {
      window.removeEventListener(ACTIVITIES_UPDATED_EVENT, handleRemoteUpdate);
    };
  }, []);

  useEffect(() => {
    if (lastSyncTime) {
      loadActivities(true);
    }
  }, [lastSyncTime, user?.uid]);

  useEffect(() => {
    if (focusDate) {
      setSubTab('calendar');
    }
  }, [focusDate]);

  const confirmDelete = async (id: string) => {
    await deleteActivity(id);
    if (user) {
      try {
        await deleteCloudActivity(id, user);
      } catch {
        // ignore
      }
    }
    if (selectedActivity?.id === id) {
      setSelectedActivity(null);
    }
    setPendingDeleteId(null);
    await loadActivities();
    onActivitiesChanged?.();
  };

  const handleExportGPX = (record: ActivityRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    exportActivityToGPX(record);
  };

  if (selectedActivity) {
    const isRunning = selectedActivity.sportType === 'running';
    const hasElev = Boolean(
      selectedActivity.stats.hasElevationData ??
        (selectedActivity.stats.currentElevationM !== null ||
          selectedActivity.stats.elevationGainM > 0)
    );

    return (
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 md:p-6 shadow-xs text-slate-900 max-w-4xl mx-auto space-y-6">
        {/* Back navigation & header */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-100">
          <button
            type="button"
            onClick={() => setSelectedActivity(null)}
            className="flex items-center gap-2 text-xs font-bold text-cyan-700 hover:text-cyan-800 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Kembali ke Riwayat</span>
          </button>

          <div className="flex items-center gap-2 flex-wrap">
            <StravaSyncButton
              activity={selectedActivity}
              onOpenStravaModal={() => setShowStravaModal(true)}
            />
            <button
              type="button"
              onClick={() => setShareTargetActivity(selectedActivity)}
              className="px-3.5 py-1.5 rounded-xl bg-cyan-50 hover:bg-cyan-100 text-cyan-800 text-xs font-bold flex items-center gap-1.5 transition-colors border border-cyan-200 cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5 text-cyan-600" />
              <span>{isRunning ? 'Share Aktivitas' : 'Share My Ride'}</span>
            </button>
            <button
              type="button"
              onClick={(e) => handleExportGPX(selectedActivity, e)}
              className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors border border-slate-200 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Ekspor GPX</span>
            </button>
            <button
              type="button"
              onClick={() => setPendingDeleteId(selectedActivity.id)}
              className="p-2 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 text-xs transition-colors border border-slate-200 cursor-pointer"
              title="Hapus aktivitas"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Inline Delete Confirmation */}
        {pendingDeleteId === selectedActivity.id && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between gap-2 text-xs text-rose-950">
            <span className="font-semibold">Hapus aktivitas tersimpan ini secara permanen?</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPendingDeleteId(null)}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 font-bold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => confirmDelete(selectedActivity.id)}
                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold cursor-pointer"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        )}

        {/* Activity Details Header */}
        <div>
          <div className="text-xs font-bold text-slate-500 flex items-center gap-1.5 mb-1">
            {isRunning ? (
              <Footprints className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <Bike className="w-3.5 h-3.5 text-cyan-600" />
            )}
            <span>{isRunning ? 'Running' : 'Cycling'}</span>
          </div>
          <h2 className="text-2xl font-black text-slate-900">{selectedActivity.title}</h2>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>
              {new Date(selectedActivity.startTime).toLocaleDateString('id-ID', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </span>
            <span aria-hidden="true">·</span>
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>{new Date(selectedActivity.startTime).toLocaleTimeString('id-ID')}</span>
          </div>
          {selectedActivity.notes && (
            <p className="mt-2 text-xs text-slate-600 italic bg-slate-50 p-3 rounded-xl border border-slate-200">
              {selectedActivity.notes}
            </p>
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-slate-500 text-[10px] uppercase font-bold block">Jarak</span>
            <span className="text-2xl font-black font-mono-numbers text-slate-900">
              {formatDistance(selectedActivity.stats.distanceKm, unit)}
            </span>
            <span className="text-xs text-cyan-700 ml-1 font-bold">{getDistanceUnitLabel(unit)}</span>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-slate-500 text-[10px] uppercase font-bold block">Durasi</span>
            <span className="text-2xl font-black font-mono-numbers text-slate-900">
              {formatDuration(selectedActivity.stats.totalDurationSeconds)}
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5 font-mono-numbers">
              Moving: {formatDuration(selectedActivity.stats.movingTimeSeconds)}
            </span>
          </div>

          {isRunning ? (
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-slate-500 text-[10px] uppercase font-bold block">Average Pace</span>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black font-mono-numbers text-emerald-700">
                  {formatPaceFromSecPerKm(selectedActivity.stats.avgPaceSecPerKm, unit)}
                </span>
                <span className="text-xs text-slate-500 font-bold">{getPaceUnitLabel(unit)}</span>
              </div>
              <span className="text-[10px] text-amber-700 block mt-0.5 font-mono-numbers">
                Best: {formatPaceFromSecPerKm(selectedActivity.stats.bestPaceSecPerKm, unit)}
              </span>
            </div>
          ) : (
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-slate-500 text-[10px] uppercase font-bold block">Average Speed</span>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black font-mono-numbers text-cyan-700">
                  {formatSpeed(selectedActivity.stats.avgSpeedKmH, unit, selectedActivity.points.length > 0)}
                </span>
                <span className="text-xs text-slate-500 font-bold">{getSpeedUnitLabel(unit)}</span>
              </div>
              <span className="text-[10px] text-slate-500 block mt-0.5 font-mono-numbers">
                Maks: {formatSpeed(selectedActivity.stats.maxSpeedKmH, unit, selectedActivity.points.length > 0)}{' '}
                {getSpeedUnitLabel(unit)}
              </span>
            </div>
          )}

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-slate-500 text-[10px] uppercase font-bold block">Elevasi Naik</span>
            <span className="text-2xl font-black font-mono-numbers text-emerald-600">
              {hasElev ? `+${formatElevation(selectedActivity.stats.elevationGainM, unit, true)}` : '--'}
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5 font-mono-numbers">
              {hasElev
                ? `Turun: -${formatElevation(selectedActivity.stats.elevationLossM, unit, true)}`
                : 'Tidak tersedia'}
            </span>
          </div>
        </div>

        {/* Route Map */}
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Peta Jalur Rute</h4>
          <CyclingMap
            currentLocation={selectedActivity.points[selectedActivity.points.length - 1] || null}
            points={selectedActivity.points}
            splits={selectedActivity.splits}
            stats={selectedActivity.stats}
            sportType={selectedActivity.sportType || 'cycling'}
            unit={unit}
            trackingState="finished"
            isTracking={false}
            highlightedPointIndex={hoveredPointIndex}
            heightClass="h-72 md:h-80"
          />
        </div>

        {/* Charts */}
        <ActivityCharts
          points={selectedActivity.points}
          splits={selectedActivity.splits}
          stats={selectedActivity.stats}
          sportType={selectedActivity.sportType || 'cycling'}
          unit={unit}
          onHoverPoint={setHoveredPointIndex}
        />

        <ShareRideModal
          isOpen={!!shareTargetActivity}
          onClose={() => setShareTargetActivity(null)}
          activity={shareTargetActivity}
          unit={unit}
        />

        <StravaConnectModal
          isOpen={showStravaModal}
          onClose={() => setShowStravaModal(false)}
          activities={activities}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      {/* Top Controls: View Switcher */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-4 md:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-2xl bg-cyan-50 border border-cyan-100 text-cyan-600 flex items-center justify-center shrink-0">
            <History className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
              Riwayat & Rekap Aktivitas Tersimpan
            </h2>
            <p className="text-xs text-slate-500">
              {activities.length} aktivitas telah diselesaikan dan dikonfirmasi penyimpanannya
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl border border-slate-200 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setSubTab('list')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              subTab === 'list'
                ? 'bg-white text-cyan-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            <span>Daftar ({activities.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('calendar')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              subTab === 'calendar'
                ? 'bg-white text-cyan-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Kalender & Rekap</span>
          </button>
        </div>
      </div>

      {/* Cloud Sync Banner */}
      <div className="bg-slate-900 text-white rounded-3xl p-4 md:p-5 border border-slate-800 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-sm">
                {user
                  ? `Sinkronisasi Cloud Gmail Aktif · ${user.email}`
                  : 'Sinkronisasi Cloud Akun Google (Gmail)'}
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                {user
                  ? `${activities.length} aktivitas tersimpan tersinkronisasi dua arah dengan akun Gmail Anda untuk diakses di perangkat lain.`
                  : 'Masuk dengan akun Google (Gmail) agar aktivitas Cycling & Running otomatis tersinkronisasi ke HP lain atau laptop Anda.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {user ? (
              <>
                {onSyncNow && (
                  <button
                    type="button"
                    onClick={async () => {
                      setSyncNotice(null);
                      const res = await onSyncNow();
                      await loadActivities(true);
                      if (res) {
                        setSyncNotice(
                          `Sinkronisasi Gmail selesai: ${res.totalActivities} total aktivitas (${res.syncedToCloud} diunggah, ${res.syncedFromCloud} diunduh dari perangkat lain).`
                        );
                      }
                    }}
                    disabled={isSyncing}
                    className="px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>{isSyncing ? 'Menyinkronkan...' : 'Sinkronkan Gmail'}</span>
                  </button>
                )}
                {onOpenAuthModal && (
                  <button
                    type="button"
                    onClick={onOpenAuthModal}
                    className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-all cursor-pointer"
                  >
                    Akun Gmail
                  </button>
                )}
              </>
            ) : (
              onOpenAuthModal && (
                <button
                  type="button"
                  onClick={onOpenAuthModal}
                  className="px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Cloud className="w-4 h-4 text-slate-950" />
                  <span>Masuk dengan Gmail</span>
                </button>
              )
            )}
          </div>
        </div>

        {syncError && (
          <div className="p-3 rounded-2xl bg-rose-500/15 border border-rose-400/30 text-rose-200 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{syncError}</span>
          </div>
        )}

        {syncNotice && !syncError && (
          <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-400/30 text-emerald-200 text-xs flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>{syncNotice}</span>
          </div>
        )}
      </div>

      {/* Inline Delete Confirmation for List/Calendar */}
      {pendingDeleteId && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between gap-3 text-xs text-rose-950">
          <span className="font-semibold">Hapus riwayat aktivitas ini dari perangkat dan cloud?</span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setPendingDeleteId(null)}
              className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 font-bold cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => confirmDelete(pendingDeleteId)}
              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold cursor-pointer"
            >
              Ya, Hapus
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="bg-white border border-slate-200/90 rounded-3xl p-10 text-center text-slate-500 text-xs">
          Memuat riwayat aktivitas...
        </div>
      ) : subTab === 'calendar' ? (
        <ActivityCalendarRecap
          activities={activities}
          unit={unit}
          onSelectActivity={(act) => setSelectedActivity(act)}
          onDeleteActivity={(id) => setPendingDeleteId(id)}
          initialDate={focusDate}
        />
      ) : activities.length === 0 ? (
        <div className="bg-white border border-slate-200/90 rounded-3xl p-10 text-center space-y-2 text-slate-500 text-xs">
          <Compass className="w-10 h-10 mx-auto text-slate-400 stroke-1" />
          <p className="font-bold text-slate-800 text-sm">Belum ada aktivitas yang tersimpan</p>
          <p className="text-slate-500 max-w-md mx-auto">
            Pilih mode Cycling atau Running pada Dashboard HUD, mulai perekaman GPS nyata, lalu tekan Finish & Konfirmasi Simpan untuk mencatat aktivitas pertama Anda.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200/90 rounded-3xl p-4 md:p-6 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Semua Aktivitas Tersimpan ({activities.length})
            </span>
            <span className="text-xs text-slate-500">Urut dari terbaru</span>
          </div>

          {activities.map((act) => {
            const isRun = act.sportType === 'running';
            return (
              <div
                key={act.id}
                onClick={() => setSelectedActivity(act)}
                className="p-4 bg-slate-50 hover:bg-slate-100/80 rounded-2xl border border-slate-200 hover:border-slate-300 transition-all cursor-pointer group flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1 font-bold text-slate-700">
                      {isRun ? (
                        <Footprints className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Bike className="w-3.5 h-3.5 text-cyan-600" />
                      )}
                      {isRun ? 'Running' : 'Cycling'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-numbers">{act.points.length} titik GPS</span>
                    {user && (
                      <>
                        <span aria-hidden="true">·</span>
                        {act.syncedUserId === user.uid ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                            <Cloud className="w-3 h-3" />
                            Tersinkron Gmail
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                            <Cloud className="w-3 h-3" />
                            Menunggu Sinkron
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  <h3 className="font-bold text-base text-slate-900 group-hover:text-cyan-700 transition-colors">
                    {act.title}
                  </h3>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>
                      {new Date(act.startTime).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {new Date(act.startTime).toLocaleTimeString('id-ID', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {act.notes && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="truncate max-w-xs italic">"{act.notes}"</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4 sm:gap-6 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-200 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block font-medium">Jarak</span>
                    <span className="text-base font-black font-mono-numbers text-slate-900">
                      {formatDistance(act.stats.distanceKm, unit)} {getDistanceUnitLabel(unit)}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block font-medium">Durasi</span>
                    <span className="text-base font-black font-mono-numbers text-slate-900">
                      {formatDuration(act.stats.totalDurationSeconds)}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block font-medium">
                      {isRun ? 'Avg Pace' : 'Avg Speed'}
                    </span>
                    <span
                      className={`text-base font-black font-mono-numbers ${
                        isRun ? 'text-emerald-700' : 'text-cyan-700'
                      }`}
                    >
                      {isRun
                        ? formatPaceFromSecPerKm(act.stats.avgPaceSecPerKm, unit, true)
                        : `${formatSpeed(act.stats.avgSpeedKmH, unit, act.points.length > 0)} ${getSpeedUnitLabel(unit)}`}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 ml-2">
                    <StravaSyncButton
                      activity={act}
                      compact={true}
                      onOpenStravaModal={() => setShowStravaModal(true)}
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShareTargetActivity(act);
                      }}
                      className="px-2.5 py-1.5 text-cyan-700 bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 rounded-lg text-xs font-bold inline-flex items-center gap-1 transition-colors cursor-pointer"
                      title="Share peta & detail aktivitas"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span className="hidden md:inline">Share</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleExportGPX(act, e)}
                      className="p-2 text-slate-500 hover:text-cyan-700 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
                      title="Unduh berkas GPX"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingDeleteId(act.id);
                      }}
                      className="p-2 text-slate-500 hover:text-rose-600 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
                      title="Hapus aktivitas"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-cyan-700 transition-all" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ShareRideModal
        isOpen={!!shareTargetActivity}
        onClose={() => setShareTargetActivity(null)}
        activity={shareTargetActivity}
        unit={unit}
      />

      <StravaConnectModal
        isOpen={showStravaModal}
        onClose={() => setShowStravaModal(false)}
        activities={activities}
      />
    </div>
  );
};
