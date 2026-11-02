import React, { useState, useEffect } from 'react';
import { OfflineRegion, MapStyle, DigitalRoute, DigitalRoutePoint } from '../types/cycling';
import {
  getOfflineRegions,
  deleteOfflineRegion,
  getStorageQuota,
  countTiles,
  getTile,
  saveOfflineRoute,
  deleteOfflineRoute,
} from '../services/db';
import {
  downloadAreaTiles,
  DownloadProgress,
  getRegionTiles,
  latLngToTile,
  getTileKey,
} from '../services/offlineTiles';
import {
  getAllRoadBikeRoutes,
  generateRoadBikeRoute,
  downloadRouteOfflineTiles,
  haversineDistanceKm,
} from '../services/roadBikeRoutes';
import { DigitalElevationChart } from './DigitalElevationChart';
import {
  HardDrive,
  Download,
  Trash2,
  AlertTriangle,
  CheckCircle,
  Database,
  Layers,
  Info,
  Bike,
  Sparkles,
  Mountain,
  Compass,
  ArrowRight,
  Navigation,
  Check,
  RefreshCw,
  Search,
  ChevronDown,
  ChevronUp,
  MapPin,
  Flame,
  Zap,
  Gauge,
  Sliders,
} from 'lucide-react';

interface OfflineMapManagerProps {
  currentLocation: { lat: number; lng: number } | null;
  onClose?: () => void;
  onSelectRoute?: (route: DigitalRoute) => void;
  activeTargetRouteId?: string | null;
}

export const OfflineMapManager: React.FC<OfflineMapManagerProps> = ({
  currentLocation,
  onClose,
  onSelectRoute,
  activeTargetRouteId,
}) => {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'routes' | 'generator' | 'manual' | 'storage'>('routes');

  // Road bike routes state
  const [routes, setRoutes] = useState<DigitalRoute[]>([]);
  const [routeFilter, setRouteFilter] = useState<'all' | 'flat' | 'rolling' | 'climbing'>('all');
  const [expandedElevationRouteId, setExpandedElevationRouteId] = useState<string | null>(null);
  const [downloadingRouteId, setDownloadingRouteId] = useState<string | null>(null);
  const [routeDownloadProgress, setRouteDownloadProgress] = useState<DownloadProgress | null>(null);
  const [routeAbortController, setRouteAbortController] = useState<AbortController | null>(null);

  // Storage and regions state
  const [regions, setRegions] = useState<OfflineRegion[]>([]);
  const [totalCachedTiles, setTotalCachedTiles] = useState<number>(0);
  const [quota, setQuota] = useState<{ usedBytes: number; quotaBytes: number; percentage: number }>({
    usedBytes: 0,
    quotaBytes: 1024 * 1024 * 500,
    percentage: 0,
  });

  // Generator State
  const [genDistance, setGenDistance] = useState<number>(30);
  const [genProfile, setGenProfile] = useState<'flat' | 'rolling' | 'climbing'>('flat');
  const [genIsLoop, setGenIsLoop] = useState<boolean>(true);
  const [genRouteName, setGenRouteName] = useState<string>('');
  const [generatedRoute, setGeneratedRoute] = useState<DigitalRoute | null>(null);

  // Manual Area Download Form State
  const [areaName, setAreaName] = useState<string>('');
  const [centerLat, setCenterLat] = useState<number>(() => currentLocation?.lat ?? -6.175392);
  const [centerLng, setCenterLng] = useState<number>(() => currentLocation?.lng ?? 106.827153);
  const [radiusKm, setRadiusKm] = useState<number>(3);
  const [minZoom, setMinZoom] = useState<number>(13);
  const [maxZoom, setMaxZoom] = useState<number>(15);
  const [selectedStyle, setSelectedStyle] = useState<MapStyle>('voyager');

  // Area Download Execution State
  const [isDownloadingArea, setIsDownloadingArea] = useState(false);
  const [areaDownloadProgress, setAreaDownloadProgress] = useState<DownloadProgress | null>(null);
  const [areaAbortController, setAreaAbortController] = useState<AbortController | null>(null);

  // Tile Verification Tool State
  const [testLat, setTestLat] = useState<number>(() => currentLocation?.lat ?? -6.175392);
  const [testLng, setTestLng] = useState<number>(() => currentLocation?.lng ?? 106.827153);
  const [testZoom, setTestZoom] = useState<number>(14);
  const [testResult, setTestResult] = useState<{ checked: boolean; isCached: boolean; tileKey?: string } | null>(null);
  const [confirmDeleteRegionId, setConfirmDeleteRegionId] = useState<string | null>(null);
  const [confirmDeleteRouteId, setConfirmDeleteRouteId] = useState<string | null>(null);

  // Load routes and storage
  const loadRoutesAndStorage = async () => {
    try {
      const [allRoutes, savedRegions, totalTiles, storageInfo] = await Promise.all([
        getAllRoadBikeRoutes(),
        getOfflineRegions(),
        countTiles(),
        getStorageQuota(),
      ]);
      setRoutes(allRoutes);
      setRegions(savedRegions);
      setTotalCachedTiles(totalTiles);
      setQuota(storageInfo);
    } catch (err) {
      console.warn('Error loading offline routes/storage:', err);
    }
  };

  useEffect(() => {
    loadRoutesAndStorage();
  }, []);

  // Update center coords if current location updates
  useEffect(() => {
    if (currentLocation) {
      setCenterLat(currentLocation.lat);
      setCenterLng(currentLocation.lng);
      setTestLat(currentLocation.lat);
      setTestLng(currentLocation.lng);
    }
  }, [currentLocation]);

  // Calculate bounding box for manual area
  const calculateBounds = (lat: number, lng: number, rKm: number) => {
    const latDelta = rKm / 111;
    const lngDelta = rKm / (111 * Math.cos((lat * Math.PI) / 180));
    return {
      north: lat + latDelta,
      south: lat - latDelta,
      east: lng + lngDelta,
      west: lng - lngDelta,
    };
  };

  const calculatedBounds = calculateBounds(centerLat, centerLng, radiusKm);
  const estimatedAreaTiles = getRegionTiles(calculatedBounds, minZoom, maxZoom);
  const estimatedSizeBytes = estimatedAreaTiles.length * 18 * 1024;

  const formatMB = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);

  // 1-Click Offline Route Tile Download
  const handleDownloadRouteOffline = async (route: DigitalRoute) => {
    if (downloadingRouteId) return;
    setDownloadingRouteId(route.id);
    const controller = new AbortController();
    setRouteAbortController(controller);

    try {
      await downloadRouteOfflineTiles(route, {
        minZoom: 13,
        maxZoom: 15,
        style: 'voyager',
        signal: controller.signal,
        onProgress: (progress) => setRouteDownloadProgress(progress),
      });
      await loadRoutesAndStorage();
    } catch (err: unknown) {
      console.error('Download route offline error:', err);
    } finally {
      setDownloadingRouteId(null);
      setRouteAbortController(null);
    }
  };

  const handleCancelRouteDownload = () => {
    if (routeAbortController) {
      routeAbortController.abort();
    }
  };

  // Generate Road Bike Route
  const handleGenerateRoute = () => {
    const lat = currentLocation?.lat ?? -6.1754;
    const lng = currentLocation?.lng ?? 106.8272;
    const newRoute = generateRoadBikeRoute({
      startLat: lat,
      startLng: lng,
      targetDistanceKm: genDistance,
      profileType: genProfile,
      isLoop: genIsLoop,
      name: genRouteName.trim() || undefined,
    });
    setGeneratedRoute(newRoute);
    setExpandedElevationRouteId(newRoute.id);
  };

  const handleSaveGeneratedRoute = async () => {
    if (!generatedRoute) return;
    await saveOfflineRoute(generatedRoute);
    await loadRoutesAndStorage();
    setActiveTab('routes');
  };

  // Manual Area Download Actions
  const handleStartAreaDownload = async () => {
    if (isDownloadingArea) return;
    setIsDownloadingArea(true);
    const controller = new AbortController();
    setAreaAbortController(controller);
    const defaultName = areaName.trim() || `Area Gowes ${radiusKm}km (${centerLat.toFixed(3)}, ${centerLng.toFixed(3)})`;

    try {
      await downloadAreaTiles(
        defaultName,
        calculatedBounds,
        minZoom,
        maxZoom,
        selectedStyle,
        (progress) => setAreaDownloadProgress(progress),
        controller.signal
      );
      await loadRoutesAndStorage();
    } catch (err) {
      console.error('Area download error:', err);
    } finally {
      setIsDownloadingArea(false);
      setAreaAbortController(null);
    }
  };

  const handleCancelAreaDownload = () => {
    if (areaAbortController) {
      areaAbortController.abort();
    }
  };

  const handleDeleteRegion = async (id: string) => {
    await deleteOfflineRegion(id);
    setConfirmDeleteRegionId(null);
    await loadRoutesAndStorage();
  };

  const handleDeleteRoute = async (id: string) => {
    await deleteOfflineRoute(id);
    setConfirmDeleteRouteId(null);
    await loadRoutesAndStorage();
  };

  // Filtered routes
  const filteredRoutes = routes.filter((r) => {
    if (routeFilter === 'all') return true;
    if (routeFilter === 'flat') return r.elevationGainM < 100 && r.maxGradientPercent < 4;
    if (routeFilter === 'rolling') return r.elevationGainM >= 100 && r.elevationGainM < 400;
    if (routeFilter === 'climbing') return r.elevationGainM >= 400 || r.maxGradientPercent >= 8;
    return true;
  });

  // Verify tile
  const handleCheckTileAvailability = async () => {
    const tileCoords = latLngToTile(testLat, testLng, testZoom);
    const key = getTileKey(selectedStyle, testZoom, tileCoords.x, tileCoords.y);
    const blob = await getTile(key);
    setTestResult({
      checked: true,
      isCached: !!blob,
      tileKey: key,
    });
  };

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-4 md:p-6 shadow-sm text-slate-900 max-w-4xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <Bike className="w-6 h-6 text-cyan-600" />
            Rute & Peta Offline Road Bike
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Rekomendasi rute aspal mulus, profil elevasi digital (DEM), dan unduhan peta offline untuk bersepeda tanpa sinyal seluler
          </p>
        </div>

        {/* Storage Quick Summary */}
        <div className="flex items-center gap-2.5 bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200 text-xs">
          <Database className="w-4 h-4 text-emerald-600 shrink-0" />
          <div>
            <span className="text-slate-500 block text-[10px] font-semibold uppercase tracking-wider">Penyimpanan Offline</span>
            <span className="font-mono text-slate-800 font-extrabold text-xs">
              {formatMB(quota.usedBytes)} MB / {formatMB(quota.quotaBytes)} MB ({totalCachedTiles} Tiles)
            </span>
          </div>
        </div>
      </div>

      {/* Modern Navigation Tabs */}
      <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200/80 overflow-x-auto text-xs font-bold scrollbar-none">
        <button
          onClick={() => setActiveTab('routes')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-all shrink-0 cursor-pointer ${
            activeTab === 'routes'
              ? 'bg-white text-cyan-700 shadow-xs border border-slate-200/60'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Sparkles className="w-4 h-4 text-cyan-600" />
          <span>Rekomendasi Rute ({routes.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('generator')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-all shrink-0 cursor-pointer ${
            activeTab === 'generator'
              ? 'bg-white text-cyan-700 shadow-xs border border-slate-200/60'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Zap className="w-4 h-4 text-amber-500" />
          <span>Generator Rute Cerdas</span>
        </button>

        <button
          onClick={() => setActiveTab('manual')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-all shrink-0 cursor-pointer ${
            activeTab === 'manual'
              ? 'bg-white text-cyan-700 shadow-xs border border-slate-200/60'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Download className="w-4 h-4 text-slate-600" />
          <span>Unduh Area Manual</span>
        </button>

        <button
          onClick={() => setActiveTab('storage')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-all shrink-0 cursor-pointer ${
            activeTab === 'storage'
              ? 'bg-white text-cyan-700 shadow-xs border border-slate-200/60'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <HardDrive className="w-4 h-4 text-slate-600" />
          <span>Penyimpanan ({regions.length})</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: REKOMENDASI RUTE ROAD BIKE */}
      {/* ========================================================================= */}
      {activeTab === 'routes' && (
        <div className="space-y-4">
          {/* Filter Pills */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-500 font-semibold text-[11px] mr-1">Tipe Jalur:</span>
              <button
                onClick={() => setRouteFilter('all')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                  routeFilter === 'all'
                    ? 'bg-cyan-600 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                Semua ({routes.length})
              </button>
              <button
                onClick={() => setRouteFilter('flat')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                  routeFilter === 'flat'
                    ? 'bg-cyan-600 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                ⚡ Datar / Aero Sprint
              </button>
              <button
                onClick={() => setRouteFilter('rolling')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                  routeFilter === 'rolling'
                    ? 'bg-cyan-600 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                🌊 Rolling Hills
              </button>
              <button
                onClick={() => setRouteFilter('climbing')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                  routeFilter === 'climbing'
                    ? 'bg-cyan-600 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                ⛰️ Tanjakan (KOM)
              </button>
            </div>

            <span className="text-xs text-slate-500">
              {filteredRoutes.length} rute siap gowes
            </span>
          </div>

          {/* Download Progress Bar for Route */}
          {downloadingRouteId && routeDownloadProgress && (
            <div className="p-4 bg-cyan-50/90 border border-cyan-200 rounded-2xl space-y-2.5 shadow-sm">
              <div className="flex items-center justify-between text-xs font-bold text-cyan-900">
                <span className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-cyan-600" />
                  Mengunduh peta offline rute...
                </span>
                <span className="font-mono text-cyan-800">
                  {routeDownloadProgress.completed} / {routeDownloadProgress.total} tile ({routeDownloadProgress.percent}%)
                </span>
              </div>
              <div className="w-full bg-cyan-200 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-cyan-600 h-full transition-all duration-200"
                  style={{ width: `${routeDownloadProgress.percent}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-cyan-700">
                <span>{formatMB(routeDownloadProgress.bytesDownloaded)} MB tersimpan</span>
                <button
                  onClick={handleCancelRouteDownload}
                  className="text-rose-600 hover:text-rose-700 font-bold underline cursor-pointer"
                >
                  Batalkan Unduhan
                </button>
              </div>
            </div>
          )}

          {/* Route Cards */}
          <div className="grid grid-cols-1 gap-4">
            {filteredRoutes.map((route) => {
              const isSelected = activeTargetRouteId === route.id;
              const isElevExpanded = expandedElevationRouteId === route.id;
              const isCached = route.isOfflineCached;

              return (
                <div
                  key={route.id}
                  className={`bg-slate-50/80 rounded-2xl border transition-all overflow-hidden ${
                    isSelected
                      ? 'border-cyan-500 ring-2 ring-cyan-500/30 bg-cyan-50/20 shadow-md'
                      : 'border-slate-200 hover:border-slate-300 shadow-2xs'
                  }`}
                >
                  {/* Card Content Top */}
                  <div className="p-4 md:p-5 flex flex-col gap-3">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-extrabold text-base text-slate-900">
                            {route.title}
                          </h3>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-extrabold border ${
                              route.climbCategory === 'HC' || route.climbCategory === 'Cat 1'
                                ? 'bg-rose-100 text-rose-700 border-rose-300'
                                : route.climbCategory === 'Cat 2' || route.climbCategory === 'Cat 3'
                                ? 'bg-amber-100 text-amber-800 border-amber-300'
                                : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            }`}
                          >
                            {route.climbCategory || 'Datar'}
                          </span>

                          {isCached && (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-100 text-cyan-800 border border-cyan-300">
                              <Check className="w-3 h-3 text-cyan-600" /> Offline Siap
                            </span>
                          )}

                          {isSelected && (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500 text-slate-950">
                              <Navigation className="w-3 h-3" /> Sedang Diikuti
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-medium text-slate-600">
                          {route.subtitle}
                        </p>
                      </div>

                      {/* Distance & Time Highlight Pill */}
                      <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs shrink-0 self-start">
                        <div className="text-right">
                          <span className="text-slate-400 text-[10px] block uppercase font-bold">Jarak</span>
                          <span className="font-mono text-base font-extrabold text-slate-900">
                            {route.distanceKm} km
                          </span>
                        </div>
                        <div className="h-6 w-px bg-slate-200"></div>
                        <div className="text-right">
                          <span className="text-slate-400 text-[10px] block uppercase font-bold">Waktu</span>
                          <span className="font-mono text-sm font-bold text-cyan-700">
                            ~{route.estimatedTimeMinutes} mnt
                          </span>
                        </div>
                      </div>
                    </div>

                    <p className="text-xs text-slate-600 leading-relaxed">
                      {route.description}
                    </p>

                    {/* Metric Quick Bar */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1">
                      <div className="bg-white p-2 rounded-xl border border-slate-200">
                        <span className="text-[10px] font-semibold text-slate-400 block uppercase">Elevasi Naik</span>
                        <span className="font-mono font-extrabold text-emerald-600 text-sm">
                          +{route.elevationGainM} m
                        </span>
                      </div>
                      <div className="bg-white p-2 rounded-xl border border-slate-200">
                        <span className="text-[10px] font-semibold text-slate-400 block uppercase">Gradien Maks</span>
                        <span className="font-mono font-extrabold text-rose-600 text-sm">
                          {route.maxGradientPercent}%
                        </span>
                      </div>
                      <div className="bg-white p-2 rounded-xl border border-slate-200">
                        <span className="text-[10px] font-semibold text-slate-400 block uppercase">Kualitas Aspal</span>
                        <span className="font-mono font-bold text-slate-800 text-xs">
                          {route.surfaceSuitability.smoothAsphaltPercent}% Mulus
                        </span>
                      </div>
                      <div className="bg-white p-2 rounded-xl border border-slate-200">
                        <span className="text-[10px] font-semibold text-slate-400 block uppercase">Rekomendasi Jam</span>
                        <span className="font-sans font-medium text-slate-700 text-[11px] truncate block" title={route.recommendedTime}>
                          {route.recommendedTime.split('(')[0]}
                        </span>
                      </div>
                    </div>

                    {/* Action Buttons Row */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200">
                      <button
                        onClick={() => setExpandedElevationRouteId(isElevExpanded ? null : route.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-200/80 hover:bg-slate-300 text-slate-800 text-xs font-bold transition-all cursor-pointer"
                      >
                        <Mountain className="w-3.5 h-3.5 text-cyan-600" />
                        <span>{isElevExpanded ? 'Tutup Profil Elevasi' : 'Lihat Profil Elevasi (DEM)'}</span>
                        {isElevExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>

                      <div className="flex items-center gap-2">
                        {/* 1-Click Offline Download */}
                        <button
                          onClick={() => handleDownloadRouteOffline(route)}
                          disabled={downloadingRouteId === route.id}
                          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            isCached
                              ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
                              : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs'
                          }`}
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>{isCached ? 'Perbarui Tile Offline' : 'Unduh Peta Offline'}</span>
                        </button>

                        {/* Ikuti Rute / Navigation */}
                        {onSelectRoute && (
                          <button
                            onClick={() => onSelectRoute(route)}
                            className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-extrabold transition-all shadow-xs cursor-pointer ${
                              isSelected
                                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                                : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                            }`}
                          >
                            <Navigation className="w-3.5 h-3.5" />
                            <span>{isSelected ? 'Rute Aktif (Diikuti)' : 'Ikuti Rute Ini'}</span>
                          </button>
                        )}

                        {route.category === 'generated' && (
                          confirmDeleteRouteId === route.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleDeleteRoute(route.id)}
                                className="px-2.5 py-1 bg-rose-600 text-white rounded-lg text-xs font-bold cursor-pointer"
                              >
                                Hapus
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteRouteId(null)}
                                className="px-2 py-1 bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
                              >
                                Batal
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteRouteId(route.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
                              title="Hapus rute tersimpan"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Digital Elevation Chart Profile */}
                  {isElevExpanded && (
                    <div className="p-3 md:p-4 bg-slate-950 border-t border-slate-800">
                      <DigitalElevationChart route={route} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: GENERATOR RUTE CERDAS (ROAD BIKE) */}
      {/* ========================================================================= */}
      {activeTab === 'generator' && (
        <div className="space-y-5">
          <div className="bg-linear-to-r from-amber-50 to-cyan-50 rounded-2xl p-4 md:p-5 border border-amber-200/80 space-y-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-amber-500 text-white rounded-xl shadow-xs">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm md:text-base text-slate-900">
                  Generator Otomatis Rute Road Bike Berbasis Lokasi GPS
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Buat jalur sepeda melingkar (loop) atau bolak-balik dengan kontur elevasi digital, aspal mulus, dan elevasi realistis langsung dari titik Anda berada saat ini.
                </p>
              </div>
            </div>

            {/* Current Location Pin */}
            <div className="flex items-center gap-2 text-xs bg-white/90 p-2.5 rounded-xl border border-slate-200 text-slate-700">
              <MapPin className="w-4 h-4 text-cyan-600 shrink-0" />
              <span>
                Lokasi Pusat:{' '}
                <strong className="text-slate-900 font-mono">
                  {currentLocation ? `${currentLocation.lat.toFixed(5)}, ${currentLocation.lng.toFixed(5)}` : 'Monumen Nasional, Jakarta (-6.1754, 106.8272)'}
                </strong>{' '}
                {currentLocation ? '(GPS Terkunci)' : '(Standar)'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* Distance Target */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-800">Target Jarak Gowes</label>
                  <span className="font-mono text-cyan-700 font-extrabold text-sm">
                    {genDistance} km
                  </span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="100"
                  step="5"
                  value={genDistance}
                  onChange={(e) => setGenDistance(parseInt(e.target.value, 10))}
                  className="w-full accent-cyan-600 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                  <span>10 km (Sprint)</span>
                  <span>30 km (Daily)</span>
                  <span>60 km (Long)</span>
                  <span>100 km (Century)</span>
                </div>
              </div>

              {/* Profile Type */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-800 block">Karakter Elevasi / Tanjakan</label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setGenProfile('flat')}
                    className={`py-2 px-1.5 rounded-xl font-bold text-center border transition-all cursor-pointer ${
                      genProfile === 'flat'
                        ? 'bg-cyan-600 text-white border-cyan-700 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    ⚡ Datar (Aero)
                  </button>
                  <button
                    type="button"
                    onClick={() => setGenProfile('rolling')}
                    className={`py-2 px-1.5 rounded-xl font-bold text-center border transition-all cursor-pointer ${
                      genProfile === 'rolling'
                        ? 'bg-cyan-600 text-white border-cyan-700 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    🌊 Rolling
                  </button>
                  <button
                    type="button"
                    onClick={() => setGenProfile('climbing')}
                    className={`py-2 px-1.5 rounded-xl font-bold text-center border transition-all cursor-pointer ${
                      genProfile === 'climbing'
                        ? 'bg-cyan-600 text-white border-cyan-700 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    ⛰️ KOM Climb
                  </button>
                </div>
              </div>

              {/* Route Shape */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-800 block">Bentuk Jalur</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setGenIsLoop(true)}
                    className={`py-2 px-2 rounded-xl font-bold text-center border transition-all cursor-pointer ${
                      genIsLoop
                        ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    🔄 Sirkuit Loop (Melingkar)
                  </button>
                  <button
                    type="button"
                    onClick={() => setGenIsLoop(false)}
                    className={`py-2 px-2 rounded-xl font-bold text-center border transition-all cursor-pointer ${
                      !genIsLoop
                        ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    ↔️ Bolak-Balik (Out & Back)
                  </button>
                </div>
              </div>

              {/* Optional Name */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-800 block">Nama Khusus (Opsional)</label>
                <input
                  type="text"
                  placeholder="Contoh: Morning Pelotons Loop 40k"
                  value={genRouteName}
                  onChange={(e) => setGenRouteName(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-cyan-600 shadow-2xs"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={handleGenerateRoute}
                className="w-full py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 active:scale-[0.99] text-white rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 shadow-md shadow-cyan-600/25 transition-all cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>Hasilkan Rekomendasi Rute & Profil Elevasi Digital</span>
              </button>
            </div>
          </div>

          {/* Generated Result Preview */}
          {generatedRoute && (
            <div className="bg-slate-50 rounded-2xl border-2 border-cyan-500/50 p-4 md:p-5 space-y-4 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500 text-slate-950">
                      Rute Baru Dihasilkan
                    </span>
                    <h4 className="font-extrabold text-base text-slate-900">
                      {generatedRoute.title}
                    </h4>
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {generatedRoute.subtitle}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSaveGeneratedRoute}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Simpan ke Rekomendasi</span>
                  </button>

                  {onSelectRoute && (
                    <button
                      onClick={() => onSelectRoute(generatedRoute)}
                      className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      <span>Ikuti Langsung</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Digital Elevation Chart for Generated Route */}
              <DigitalElevationChart route={generatedRoute} />
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: UNDUH AREA MANUAL (BOUNDING BOX) */}
      {/* ========================================================================= */}
      {activeTab === 'manual' && (
        <div className="bg-slate-50/80 rounded-2xl p-4 md:p-5 border border-slate-200 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <Download className="w-4 h-4 text-cyan-600" />
                Unduh Area Peta Manual Berdasarkan Radius
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Unduh seluruh kotak koordinat dan zoom level di sekitar titik latihan Anda
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            {/* Area Name */}
            <div className="lg:col-span-3">
              <label className="text-slate-600 font-medium block mb-1">Nama Area / Rute Gowes</label>
              <input
                type="text"
                value={areaName}
                onChange={(e) => setAreaName(e.target.value)}
                placeholder="Contoh: Sirkuit Loop BSD City / Sentul KM 0"
                disabled={isDownloadingArea}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-cyan-600 shadow-2xs"
              />
            </div>

            {/* Latitude */}
            <div>
              <label className="text-slate-600 font-medium block mb-1">Latitude Pusat</label>
              <input
                type="number"
                step="0.0001"
                value={centerLat}
                onChange={(e) => setCenterLat(parseFloat(e.target.value) || 0)}
                disabled={isDownloadingArea}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-mono focus:outline-none focus:border-cyan-600 shadow-2xs"
              />
            </div>

            {/* Longitude */}
            <div>
              <label className="text-slate-600 font-medium block mb-1">Longitude Pusat</label>
              <input
                type="number"
                step="0.0001"
                value={centerLng}
                onChange={(e) => setCenterLng(parseFloat(e.target.value) || 0)}
                disabled={isDownloadingArea}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-mono focus:outline-none focus:border-cyan-600 shadow-2xs"
              />
            </div>

            {/* Radius */}
            <div>
              <label className="text-slate-600 font-medium block mb-1">Radius Gowes (km)</label>
              <select
                value={radiusKm}
                onChange={(e) => setRadiusKm(Number(e.target.value))}
                disabled={isDownloadingArea}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-cyan-600 shadow-2xs"
              >
                <option value={1}>1 km (~Criterium Lap)</option>
                <option value={2}>2 km (~Lingkar Kota)</option>
                <option value={3}>3 km (~Zona Latihan)</option>
                <option value={5}>5 km (~Zona Luas)</option>
              </select>
            </div>

            {/* Min Zoom */}
            <div>
              <label className="text-slate-600 font-medium block mb-1">Min Zoom (Tampilan Jauh)</label>
              <select
                value={minZoom}
                onChange={(e) => setMinZoom(Number(e.target.value))}
                disabled={isDownloadingArea}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-cyan-600 shadow-2xs"
              >
                <option value={12}>Zoom 12 (Kota)</option>
                <option value={13}>Zoom 13 (Kecamatan)</option>
                <option value={14}>Zoom 14 (Jalan Utama)</option>
              </select>
            </div>

            {/* Max Zoom */}
            <div>
              <label className="text-slate-600 font-medium block mb-1">Max Zoom (Tampilan Dekat)</label>
              <select
                value={maxZoom}
                onChange={(e) => setMaxZoom(Number(e.target.value))}
                disabled={isDownloadingArea}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-cyan-600 shadow-2xs"
              >
                <option value={14}>Zoom 14</option>
                <option value={15}>Zoom 15 (Jalan & Gang)</option>
                <option value={16}>Zoom 16 (Detail Tajam)</option>
              </select>
            </div>

            {/* Map Style */}
            <div>
              <label className="text-slate-600 font-medium block mb-1">Gaya Peta</label>
              <select
                value={selectedStyle}
                onChange={(e) => setSelectedStyle(e.target.value as MapStyle)}
                disabled={isDownloadingArea}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-cyan-600 shadow-2xs"
              >
                <option value="voyager">Carto Voyager (Outdoor Road)</option>
                <option value="street">OpenStreetMap (Street)</option>
                <option value="dark">Carto Dark (High Contrast HUD)</option>
                <option value="topo">OpenTopoMap (Topografi)</option>
              </select>
            </div>
          </div>

          {/* Download Size Estimate and Action */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-200">
            <div className="flex items-center gap-4 text-xs">
              <div>
                <span className="text-slate-500 text-[10px] block">Estimasi Jumlah Tile:</span>
                <span className="font-mono font-bold text-sm text-cyan-700">
                  {estimatedAreaTiles.length} Tiles
                </span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block">Estimasi Ukuran:</span>
                <span className="font-mono font-bold text-sm text-slate-800">
                  ~{formatMB(estimatedSizeBytes)} MB
                </span>
              </div>
            </div>

            {estimatedAreaTiles.length > 600 ? (
              <div className="text-rose-600 text-xs flex items-center gap-1.5 font-bold">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Melebihi batas aman (maks 600). Kurangi radius atau zoom.</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {isDownloadingArea ? (
                  <button
                    onClick={handleCancelAreaDownload}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold text-xs transition-colors"
                  >
                    Batalkan Unduhan
                  </button>
                ) : (
                  <button
                    onClick={handleStartAreaDownload}
                    className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white rounded-xl font-bold text-xs flex items-center gap-2 transition-all shadow-md shadow-cyan-600/20 active:scale-95 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Unduh Peta Area Ini</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Progress Bar (When downloading area) */}
          {areaDownloadProgress && (
            <div className="p-3.5 bg-white rounded-xl border border-slate-200 space-y-2 shadow-2xs">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-700 font-semibold">
                  {areaDownloadProgress.status === 'completed'
                    ? 'Unduhan selesai!'
                    : areaDownloadProgress.status === 'cancelled'
                    ? 'Unduhan dibatalkan.'
                    : `Mengunduh tile (Zoom ${areaDownloadProgress.currentZoom})...`}
                </span>
                <span className="font-mono text-cyan-700 font-bold">
                  {areaDownloadProgress.completed} / {areaDownloadProgress.total} ({areaDownloadProgress.percent}%)
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
                <div
                  className="h-full bg-cyan-600 transition-all duration-200"
                  style={{ width: `${areaDownloadProgress.percent}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: PENYIMPANAN & DIAGNOSTIK */}
      {/* ========================================================================= */}
      {activeTab === 'storage' && (
        <div className="space-y-5">
          {/* List of saved regions */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-600" />
              Daftar Area Tersimpan ({regions.length})
            </h3>

            {regions.length === 0 ? (
              <div className="p-6 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-center text-slate-500 text-xs">
                Belum ada area peta offline yang diunduh. Gunakan formulir Unduh Area Manual atau Rekomendasi Rute untuk mengunduh peta.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {regions.map((region) => (
                  <div
                    key={region.id}
                    className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col justify-between gap-3 shadow-2xs"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-bold text-sm text-slate-900">{region.name}</h4>
                        {confirmDeleteRegionId === region.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleDeleteRegion(region.id)}
                              className="px-2 py-1 bg-rose-600 text-white rounded-lg text-[11px] font-bold cursor-pointer"
                            >
                              Hapus
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteRegionId(null)}
                              className="px-2 py-1 bg-slate-200 text-slate-700 rounded-lg text-[11px] font-semibold cursor-pointer"
                            >
                              Batal
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteRegionId(region.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
                            title="Hapus area offline ini"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        Disimpan: {new Date(region.createdAt).toLocaleDateString('id-ID')}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-xs font-mono">
                      <span className="text-slate-600 font-medium">
                        Zoom: {region.minZoom} - {region.maxZoom}
                      </span>
                      <span className="text-emerald-700 font-bold">
                        {region.tileCount} Tiles ({formatMB(region.sizeBytes)} MB)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Diagnostic / Tile Availability Tool */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5 text-cyan-600" />
                Uji Ketersediaan Tile Offline
              </h3>
              <span className="text-[11px] text-slate-500">Cek koordinat tanpa koneksi internet</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
              <div>
                <label className="text-slate-500 block text-[10px]">Lat</label>
                <input
                  type="number"
                  step="0.0001"
                  value={testLat}
                  onChange={(e) => setTestLat(parseFloat(e.target.value) || 0)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 font-mono shadow-2xs"
                />
              </div>
              <div>
                <label className="text-slate-500 block text-[10px]">Lng</label>
                <input
                  type="number"
                  step="0.0001"
                  value={testLng}
                  onChange={(e) => setTestLng(parseFloat(e.target.value) || 0)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 font-mono shadow-2xs"
                />
              </div>
              <div>
                <label className="text-slate-500 block text-[10px]">Zoom</label>
                <input
                  type="number"
                  min="10"
                  max="18"
                  value={testZoom}
                  onChange={(e) => setTestZoom(parseInt(e.target.value, 10) || 14)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 font-mono shadow-2xs"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={handleCheckTileAvailability}
                  className="w-full py-1.5 bg-slate-200 hover:bg-slate-300 text-cyan-800 font-bold rounded-lg transition-colors border border-slate-300 cursor-pointer"
                >
                  Cek Ketersediaan
                </button>
              </div>
            </div>

            {testResult && (
              <div
                className={`p-2.5 rounded-xl border text-xs flex items-center justify-between ${
                  testResult.isCached
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                    : 'bg-amber-50 border-amber-300 text-amber-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  {testResult.isCached ? (
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                  )}
                  <span className="font-medium">
                    {testResult.isCached
                      ? 'Tile tersedia di penyimpanan offline!'
                      : 'Tile ini belum diunduh untuk penggunaan offline.'}
                  </span>
                </div>
                <span className="font-mono text-[10px] text-slate-500">{testResult.tileKey}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
