import React, { useState, useEffect, useCallback } from 'react';
import { UnitSystem, ActivityRecord, DigitalRoute } from './types/cycling';
import { useGeolocationTracker } from './hooks/useGeolocationTracker';
import { Header } from './components/Header';
import { DashboardHUD } from './components/DashboardHUD';
import { CyclingMap } from './components/CyclingMap';
import { ActivityCharts } from './components/ActivityCharts';
import { ActivitySummaryModal } from './components/ActivitySummaryModal';
import { DisplaySettingsModal } from './components/DisplaySettingsModal';
import { StravaConnectModal } from './components/StravaConnectModal';
import { OfflineMapManager } from './components/OfflineMapManager';
import { RideHistory } from './components/RideHistory';
import { MobileBottomNav } from './components/MobileBottomNav';
import { PWAInstallButton } from './components/PWAInstallButton';
import { saveActivity, getActivities, clearActiveSession } from './services/db';
import { useScreenWakeLock } from './hooks/useScreenWakeLock';
import { useAuth } from './hooks/useAuth';
import { AuthModal } from './components/AuthModal';
import { syncActivityToCloud, ACTIVITIES_UPDATED_EVENT, getReadableSyncError } from './services/firebase';
import { ShieldAlert, Navigation, Pause, Play, Square } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'hud' | 'map' | 'stats' | 'offline' | 'history'>('hud');
  const [unit, setUnit] = useState<UnitSystem>(() => {
    try {
      const saved = localStorage.getItem('drt_unit_system');
      return saved === 'imperial' ? 'imperial' : 'metric';
    } catch {
      return 'metric';
    }
  });
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [savedRidesCount, setSavedRidesCount] = useState<number>(0);
  const [showSummaryModal, setShowSummaryModal] = useState<boolean>(false);
  const [showDisplaySettings, setShowDisplaySettings] = useState<boolean>(false);
  const [showStravaModal, setShowStravaModal] = useState<boolean>(false);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);
  const [isQuotaExceeded, setIsQuotaExceeded] = useState<boolean>(false);
  const [calendarFocusDate, setCalendarFocusDate] = useState<Date | undefined>(undefined);
  const [activeTargetRoute, setActiveTargetRoute] = useState<DigitalRoute | null>(null);

  const wakeLock = useScreenWakeLock();
  const authState = useAuth();

  const handleSetUnit = useCallback((nextUnit: UnitSystem) => {
    setUnit(nextUnit);
    try {
      localStorage.setItem('drt_unit_system', nextUnit);
    } catch {
      // ignore
    }
  }, []);

  // Monitor Google Maps Platform Quota Exceeded event
  useEffect(() => {
    const handleQuota = () => setIsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', handleQuota);
  }, []);

  const {
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
  } = useGeolocationTracker({
    unit,
    onRecoverUnit: handleSetUnit,
  });

  // Monitor network online/offline state
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Fetch count of confirmed saved activities
  const refreshHistoryCount = useCallback(async () => {
    try {
      const records = await getActivities();
      setSavedRidesCount(records.length);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    refreshHistoryCount();
    window.addEventListener(ACTIVITIES_UPDATED_EVENT, refreshHistoryCount);
    return () => {
      window.removeEventListener(ACTIVITIES_UPDATED_EVENT, refreshHistoryCount);
    };
  }, [refreshHistoryCount]);

  // Finish session and open confirmation summary modal (NOT counted as saved until user confirms)
  const handleFinish = () => {
    finishTracking();
    setShowSummaryModal(true);
  };

  // Persist activity ONLY when user explicitly confirms Save in ActivitySummaryModal
  const handleSaveActivity = async (record: ActivityRecord) => {
    const stampedRecord: ActivityRecord = {
      ...record,
      endTime: Math.max(record.startTime, record.endTime),
      clientUpdatedAt: Date.now(),
    };
    await saveActivity(stampedRecord);
    await clearActiveSession();
    if (authState.user) {
      try {
        await syncActivityToCloud(stampedRecord, authState.user);
      } catch (err) {
        console.warn('Auto cloud sync deferred:', getReadableSyncError(err));
      }
    }
    await refreshHistoryCount();
  };

  // Discard unconfirmed activity and reset
  const handleDiscardActivity = () => {
    setShowSummaryModal(false);
    discardTracking();
  };

  const handleCloseSummaryModal = (didSave: boolean) => {
    setShowSummaryModal(false);
    if (didSave) {
      completeSaveAndReset();
    }
  };

  const handleViewInCalendar = (activityDate: Date) => {
    setCalendarFocusDate(activityDate);
    setShowSummaryModal(false);
    completeSaveAndReset();
    setActiveTab('history');
  };

  const toggleUnitSystem = () => {
    handleSetUnit(unit === 'metric' ? 'imperial' : 'metric');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans pb-20 md:pb-8 selection:bg-cyan-500 selection:text-white">
      {/* Google Maps Platform Quota Notice */}
      {isQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* PWA In-App Install Prompt Banner */}
      <PWAInstallButton variant="banner" />

      {/* Top Header */}
      <Header
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        unit={unit}
        onToggleUnit={toggleUnitSystem}
        savedRidesCount={savedRidesCount}
        isOnline={isOnline}
        isScreenAwake={wakeLock.isEnabled && wakeLock.isActive}
        onToggleScreenAwake={wakeLock.toggleKeepAwake}
        onOpenDisplaySettings={() => setShowDisplaySettings(true)}
        onOpenStravaModal={() => setShowStravaModal(true)}
        user={authState.user}
        isSyncing={authState.isSyncing}
        onOpenAuthModal={() => setShowAuthModal(true)}
      />

      {/* Geolocation API Permission / Signal Alert */}
      {errorMessage && (
        <div className="max-w-7xl mx-auto px-4 w-full mt-3">
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-start justify-between gap-3 text-xs text-rose-900">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-rose-950 block">Pemberitahuan Geolocation GPS</span>
                <span>{errorMessage}</span>
                <p className="mt-1 text-[11px] text-rose-700">
                  Pastikan GPS perangkat aktif dan izin akses lokasi disetujui pada browser Anda.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={requestImmediateLocation}
              className="px-3 py-1.5 bg-white hover:bg-rose-100 text-rose-900 rounded-xl font-bold shrink-0 transition-colors border border-rose-300 cursor-pointer"
            >
              Coba Lagi GPS
            </button>
          </div>
        </div>
      )}

      {/* Main Content Viewport */}
      <main className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 w-full mt-4 flex-1">
        {/* TAB 1: DASHBOARD HUD & LIVE MAP */}
        {activeTab === 'hud' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Left / Top: GPS Activity Computer Console */}
              <div className="lg:col-span-7 flex flex-col gap-4">
                <DashboardHUD
                  sportType={sportType}
                  onChangeSportType={setSportType}
                  accuracyFilter={accuracyFilter}
                  onChangeAccuracyFilter={setAccuracyFilter}
                  stats={stats}
                  splits={splits}
                  trackingState={trackingState}
                  gpsStatus={gpsStatus}
                  gpsAccuracyM={gpsAccuracyM}
                  isOnline={isOnline}
                  unit={unit}
                  onChangeUnit={handleSetUnit}
                  onStart={startTracking}
                  onPause={pauseTracking}
                  onResume={resumeTracking}
                  onFinish={handleFinish}
                  onSave={() => setShowSummaryModal(true)}
                  onDiscard={discardTracking}
                  isScreenAwake={wakeLock.isEnabled && wakeLock.isActive}
                  onToggleScreenAwake={wakeLock.toggleKeepAwake}
                  onOpenDisplaySettings={() => setShowDisplaySettings(true)}
                  isAutoPaused={isAutoPaused}
                  isAutoPauseEnabled={isAutoPauseEnabled}
                  onToggleAutoPause={() => toggleAutoPause()}
                  activeInterruptionWarning={activeInterruptionWarning}
                  onDismissInterruptionWarning={dismissInterruptionWarning}
                  recoveredSessionBanner={recoveredSessionBanner}
                  onDismissRecoveredBanner={dismissRecoveredBanner}
                  activeTargetRoute={activeTargetRoute}
                  onViewRouteInMap={() => setActiveTab('map')}
                />
              </div>

              {/* Right / Bottom: Interactive Leaflet Live Map */}
              <div className="lg:col-span-5 flex flex-col">
                <div className="bg-white border border-slate-200/90 rounded-3xl p-3 shadow-xs flex-1 flex flex-col justify-between">
                  <div className="flex items-center justify-between px-2 py-1 mb-2">
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <Navigation className="w-3.5 h-3.5 text-cyan-600" />
                      Live Map & Route Tracking
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveTab('map')}
                      className="text-xs text-cyan-700 hover:underline font-bold cursor-pointer"
                    >
                      Buka Peta Penuh &rarr;
                    </button>
                  </div>

                  <div className="flex-1 min-h-[340px] lg:min-h-[460px]">
                    <CyclingMap
                      currentLocation={currentLocation}
                      points={points}
                      splits={splits}
                      stats={stats}
                      sportType={sportType}
                      unit={unit}
                      trackingState={trackingState}
                      isTracking={trackingState === 'recording'}
                      highlightedPointIndex={hoveredPointIndex}
                      heightClass="h-[340px] lg:h-[460px]"
                      activeTargetRoute={activeTargetRoute}
                      onClearTargetRoute={() => setActiveTargetRoute(null)}
                      onRequestLocation={requestImmediateLocation}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom: Charts & Splits */}
            <ActivityCharts
              points={points}
              splits={splits}
              stats={stats}
              sportType={sportType}
              unit={unit}
              onHoverPoint={setHoveredPointIndex}
            />
          </div>
        )}

        {/* TAB 2: FULL INTERACTIVE LIVE MAP VIEW */}
        {activeTab === 'map' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Navigation className="w-5 h-5 text-cyan-600" />
                  Live Map & Pelacakan Rute GPS
                </h2>
                <p className="text-xs text-slate-500">
                  Peta interaktif Leaflet OpenStreetMap dengan penanda lokasi, polyline rute, jarak per km, dan akurasi GPS
                </p>
              </div>

              <div className="flex items-center gap-2">
                {trackingState === 'idle' && (
                  <button
                    type="button"
                    onClick={startTracking}
                    className="min-h-[40px] px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Start</span>
                  </button>
                )}
                {trackingState === 'recording' && (
                  <>
                    <button
                      type="button"
                      onClick={pauseTracking}
                      className="min-h-[40px] px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Pause className="w-3.5 h-3.5 fill-current" />
                      <span>Pause</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleFinish}
                      className="min-h-[40px] px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                      <span>Finish</span>
                    </button>
                  </>
                )}
                {trackingState === 'paused' && (
                  <>
                    <button
                      type="button"
                      onClick={resumeTracking}
                      className="min-h-[40px] px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Resume</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleFinish}
                      className="min-h-[40px] px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                      <span>Finish</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            <CyclingMap
              currentLocation={currentLocation}
              points={points}
              splits={splits}
              stats={stats}
              sportType={sportType}
              unit={unit}
              trackingState={trackingState}
              isTracking={trackingState === 'recording'}
              highlightedPointIndex={hoveredPointIndex}
              heightClass="h-[74vh] min-h-[480px]"
              activeTargetRoute={activeTargetRoute}
              onClearTargetRoute={() => setActiveTargetRoute(null)}
              onRequestLocation={requestImmediateLocation}
            />
          </div>
        )}

        {/* TAB 3: STATS & CHARTS */}
        {activeTab === 'stats' && (
          <div className="space-y-4">
            <ActivityCharts
              points={points}
              splits={splits}
              stats={stats}
              sportType={sportType}
              unit={unit}
              onHoverPoint={setHoveredPointIndex}
            />
          </div>
        )}

        {/* TAB 4: OFFLINE MAP MANAGER */}
        {activeTab === 'offline' && (
          <OfflineMapManager
            currentLocation={currentLocation}
            activeTargetRouteId={activeTargetRoute?.id}
            onSelectRoute={(route) => {
              setActiveTargetRoute(route);
              setActiveTab('map');
            }}
          />
        )}

        {/* TAB 5: CONFIRMED ACTIVITY HISTORY & CALENDAR RECAP */}
        {activeTab === 'history' && (
          <RideHistory
            unit={unit}
            onActivitiesChanged={refreshHistoryCount}
            focusDate={calendarFocusDate}
            user={authState.user}
            onOpenAuthModal={() => setShowAuthModal(true)}
            onSyncNow={async () => {
              const res = await authState.syncNow();
              await refreshHistoryCount();
              return res;
            }}
            isSyncing={authState.isSyncing}
            syncError={authState.syncError}
            lastSyncTime={authState.lastSyncTime}
          />
        )}
      </main>

      {/* Activity Confirmation & Save Summary Modal */}
      {showSummaryModal && (
        <ActivitySummaryModal
          sportType={sportType}
          startedAt={startedAt}
          stats={stats}
          points={points}
          splits={splits}
          interruptions={interruptions}
          gpsQuality={getQualityAssessment()}
          unit={unit}
          onSave={handleSaveActivity}
          onDiscard={handleDiscardActivity}
          onClose={handleCloseSummaryModal}
          onViewInCalendar={handleViewInCalendar}
          user={authState.user}
          onOpenAuthModal={() => setShowAuthModal(true)}
        />
      )}

      {/* Display & Screen Settings Modal */}
      <DisplaySettingsModal
        isOpen={showDisplaySettings}
        onClose={() => setShowDisplaySettings(false)}
        wakeLock={wakeLock}
        unit={unit}
        onToggleUnit={toggleUnitSystem}
        isAutoPauseEnabled={isAutoPauseEnabled}
        onToggleAutoPause={() => toggleAutoPause()}
      />

      {/* Strava Connect & Master GPX Modal */}
      <StravaConnectModal
        isOpen={showStravaModal}
        onClose={() => setShowStravaModal(false)}
      />

      {/* Cloud Authentication & Sync Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        user={authState.user}
        onLoginGoogle={authState.loginWithGoogle}
        onSwitchAccount={authState.switchGoogleAccount}
        onLogOut={authState.logOut}
        onSyncNow={async () => {
          const res = await authState.syncNow();
          await refreshHistoryCount();
          return res;
        }}
        isSyncing={authState.isSyncing}
        syncError={authState.syncError}
        onClearSyncError={authState.clearSyncError}
        lastSyncTime={authState.lastSyncTime}
        lastSyncResult={authState.lastSyncResult}
        savedRidesCount={savedRidesCount}
      />

      <MobileBottomNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        savedRidesCount={savedRidesCount}
      />
    </div>
  );
}
