import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as L from 'leaflet';
import {
  GPSPoint,
  MapStyle,
  KilometerSplit,
  DigitalRoute,
  ActivityStats,
  SportType,
  UnitSystem,
  TrackingState,
} from '../types/cycling';
import { MAP_LAYERS, getTileKey, getOfflineMissingTileUrl } from '../services/offlineTiles';
import { getTile } from '../services/db';
import { GoogleCyclingMap } from './GoogleCyclingMap';
import { DigitalElevationChart } from './DigitalElevationChart';
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
  Compass,
  Layers,
  LocateFixed,
  Maximize2,
  Minimize2,
  WifiOff,
  Navigation,
  Globe2,
  Mountain,
  X,
  Bike,
  Plus,
  Minus,
  Eye,
  EyeOff,
  Crosshair,
  Radio,
} from 'lucide-react';

interface CyclingMapProps {
  currentLocation: {
    lat: number;
    lng: number;
    accuracy: number;
    heading: number | null;
  } | null;
  points: GPSPoint[];
  splits?: KilometerSplit[];
  stats?: ActivityStats;
  sportType?: SportType;
  unit?: UnitSystem;
  trackingState?: TrackingState;
  isTracking: boolean;
  highlightedPointIndex?: number | null;
  heightClass?: string;
  defaultEngine?: 'leaflet' | 'google';
  activeTargetRoute?: DigitalRoute | null;
  onClearTargetRoute?: () => void;
  onRequestLocation?: () => void;
}

export const CyclingMap: React.FC<CyclingMapProps> = ({
  currentLocation,
  points,
  splits = [],
  stats,
  sportType = 'cycling',
  unit = 'metric',
  trackingState = 'idle',
  isTracking,
  highlightedPointIndex,
  heightClass = 'h-[360px] md:h-[450px]',
  defaultEngine = 'leaflet',
  activeTargetRoute,
  onClearTargetRoute,
  onRequestLocation,
}) => {
  const [mapEngine, setMapEngine] = useState<'leaflet' | 'google'>(defaultEngine);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showElevationModal, setShowElevationModal] = useState(false);

  const mapWrapperRef = useRef<HTMLDivElement | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const currentTileLayerRef = useRef<L.TileLayer | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const targetRoutePolylineRef = useRef<L.Polyline | null>(null);
  const targetRouteMarkersRef = useRef<L.Marker[]>([]);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);
  const startMarkerRef = useRef<L.Marker | null>(null);
  const finishMarkerRef = useRef<L.Marker | null>(null);
  const distanceMarkersRef = useRef<L.Marker[]>([]);
  const highlightMarkerRef = useRef<L.CircleMarker | null>(null);
  const hasCenteredInitialFixRef = useRef<boolean>(false);

  // Default to legitimate OpenStreetMap standard tiles
  const [activeLayer, setActiveLayer] = useState<MapStyle>('street');
  const [showLayerMenu, setShowLayerMenu] = useState(false);
  const [autoFollow, setAutoFollow] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showStatsOverlay, setShowStatsOverlay] = useState(true);

  // Compute distance markers every 1 km directly from recorded points (works live & in history)
  const distanceMarkersData = useMemo(() => {
    if (points.length < 2) return [];
    const maxDistKm = points[points.length - 1].cumulativeDistance;
    const wholeKms = Math.floor(maxDistKm);
    if (wholeKms < 1) return [];

    const markers: {
      km: number;
      lat: number;
      lng: number;
      split?: KilometerSplit;
    }[] = [];

    let searchIdx = 0;
    for (let km = 1; km <= wholeKms; km++) {
      while (searchIdx < points.length && points[searchIdx].cumulativeDistance < km) {
        searchIdx++;
      }
      if (searchIdx < points.length) {
        const pt = points[searchIdx];
        const matchingSplit = splits.find((s) => s.kmIndex === km);
        markers.push({
          km,
          lat: pt.lat,
          lng: pt.lng,
          split: matchingSplit,
        });
      }
    }
    return markers;
  }, [points, splits]);

  // Monitor network status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => {
      setIsOnline(false);
      setMapEngine('leaflet');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Sync fullscreen Escape key and invalidate Leaflet size on viewport resize
  useEffect(() => {
    const handleFsChange = () => {
      if (!document.fullscreenElement && isFullscreen) {
        // Keep CSS fullscreen if triggered inside an iframe unless exited via ESC or button
      }
      window.setTimeout(() => {
        mapInstanceRef.current?.invalidateSize();
      }, 150);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
      }
    };

    document.addEventListener('fullscreenchange', handleFsChange);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullscreen]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      mapInstanceRef.current?.invalidateSize();
    }, 160);
    return () => window.clearTimeout(timer);
  }, [isFullscreen]);

  // Construct offline-aware Leaflet TileLayer complying with OpenStreetMap attribution policy
  const createCachedTileLayer = useCallback((style: MapStyle) => {
    const layerConfig = MAP_LAYERS[style];

    const CachedLayer = L.TileLayer.extend({
      createTile: function (coords: L.Coords, done: L.DoneCallback) {
        const tile = document.createElement('img');
        tile.alt = '';
        tile.setAttribute('role', 'presentation');
        tile.referrerPolicy = 'strict-origin-when-cross-origin';

        const key = getTileKey(style, coords.z, coords.x, coords.y);

        getTile(key)
          .then((blob) => {
            if (blob) {
              const url = URL.createObjectURL(blob);
              tile.src = url;
              tile.onload = () => {
                URL.revokeObjectURL(url);
                done(undefined, tile);
              };
              tile.onerror = () => done(undefined, tile);
            } else if (navigator.onLine) {
              tile.src = (this as L.TileLayer).getTileUrl(coords);
              tile.onload = () => done(undefined, tile);
              tile.onerror = () => {
                tile.src = getOfflineMissingTileUrl();
                done(undefined, tile);
              };
            } else {
              tile.src = getOfflineMissingTileUrl();
              done(undefined, tile);
            }
          })
          .catch(() => {
            if (navigator.onLine) {
              tile.src = (this as L.TileLayer).getTileUrl(coords);
            } else {
              tile.src = getOfflineMissingTileUrl();
            }
            done(undefined, tile);
          });

        return tile;
      },
    });

    // @ts-expect-error Leaflet custom TileLayer extend typing
    return new CachedLayer(layerConfig.url, {
      maxZoom: layerConfig.maxNativeZoom,
      attribution: layerConfig.attribution,
    }) as L.TileLayer;
  }, []);

  // Initialize Leaflet Map
  useEffect(() => {
    if (mapEngine !== 'leaflet') return;
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const hasKnownPoint = currentLocation !== null || points.length > 0;
    const initialLat = currentLocation?.lat ?? (points.length > 0 ? points[0].lat : -2.5489);
    const initialLng = currentLocation?.lng ?? (points.length > 0 ? points[0].lng : 118.0149);
    const initialZoom = hasKnownPoint ? 16 : 5;

    if (currentLocation) {
      hasCenteredInitialFixRef.current = true;
    }

    const map = L.map(mapContainerRef.current, {
      center: [initialLat, initialLng],
      zoom: initialZoom,
      zoomControl: false, // Using custom tactile Zoom In / Zoom Out buttons
      attributionControl: true,
    });

    const tileLayer = createCachedTileLayer(activeLayer);
    tileLayer.addTo(map);
    currentTileLayerRef.current = tileLayer;

    map.on('dragstart', () => {
      setAutoFollow(false);
    });

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      polylineRef.current = null;
      userMarkerRef.current = null;
      accuracyCircleRef.current = null;
      startMarkerRef.current = null;
      finishMarkerRef.current = null;
      distanceMarkersRef.current = [];
      targetRoutePolylineRef.current = null;
      targetRouteMarkersRef.current = [];
      highlightMarkerRef.current = null;
    };
  }, [mapEngine, createCachedTileLayer]);

  // Switch Leaflet Tile Layer
  useEffect(() => {
    if (mapEngine !== 'leaflet' || !mapInstanceRef.current) return;
    if (currentTileLayerRef.current) {
      mapInstanceRef.current.removeLayer(currentTileLayerRef.current);
    }
    const newLayer = createCachedTileLayer(activeLayer);
    newLayer.addTo(mapInstanceRef.current);
    currentTileLayerRef.current = newLayer;
  }, [mapEngine, activeLayer, createCachedTileLayer]);

  // Update Route Polyline, Start Marker, Distance Markers, and Finish Marker
  useEffect(() => {
    if (mapEngine !== 'leaflet' || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    const latLngs = points.map((p) => [p.lat, p.lng] as [number, number]);
    const routeColor = sportType === 'running' ? '#10b981' : '#0284c7';

    if (!polylineRef.current) {
      polylineRef.current = L.polyline(latLngs, {
        color: routeColor,
        weight: 5,
        opacity: 0.92,
        lineJoin: 'round',
        lineCap: 'round',
      }).addTo(map);
    } else {
      polylineRef.current.setLatLngs(latLngs);
      polylineRef.current.setStyle({ color: routeColor });
    }

    // Start Marker management (also cleans up when points are cleared on Discard/Reset)
    if (points.length > 0) {
      const startPt = points[0];
      const startIcon = L.divIcon({
        className: 'start-marker-icon',
        html: `
          <div class="flex items-center justify-center w-7 h-7 bg-emerald-600 text-white rounded-full shadow-md border-2 border-white font-bold text-[10px]">
            S
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      if (!startMarkerRef.current) {
        startMarkerRef.current = L.marker([startPt.lat, startPt.lng], { icon: startIcon })
          .bindTooltip('Titik Start', { direction: 'top', offset: [0, -10] })
          .addTo(map);
      } else {
        startMarkerRef.current.setLatLng([startPt.lat, startPt.lng]);
      }
    } else if (startMarkerRef.current) {
      map.removeLayer(startMarkerRef.current);
      startMarkerRef.current = null;
    }

    // Distance Markers (1 km, 2 km, ...)
    distanceMarkersRef.current.forEach((m) => map.removeLayer(m));
    distanceMarkersRef.current = [];

    distanceMarkersData.forEach((dm) => {
      const kmIcon = L.divIcon({
        className: 'km-split-icon',
        html: `
          <div class="px-1.5 py-0.5 bg-slate-900 text-white font-bold text-[10px] rounded-md border border-white shadow-sm flex items-center justify-center font-mono-numbers whitespace-nowrap">
            ${dm.km} km
          </div>
        `,
        iconSize: [38, 20],
        iconAnchor: [19, 10],
      });

      const splitInfo = dm.split
        ? sportType === 'running' && dm.split.paceSecondsPerKm
          ? `KM ${dm.km} · Pace ${formatPaceFromSecPerKm(dm.split.paceSecondsPerKm, unit)} /${unit === 'imperial' ? 'mi' : 'km'} (${formatDuration(dm.split.durationSeconds)})`
          : `KM ${dm.km} · ${formatSpeed(dm.split.avgSpeedKmH, unit)} ${getSpeedUnitLabel(unit)} (${formatDuration(dm.split.durationSeconds)})`
        : `Penanda Jarak ${dm.km} km`;

      const marker = L.marker([dm.lat, dm.lng], { icon: kmIcon })
        .bindTooltip(splitInfo, { direction: 'top', offset: [0, -8] })
        .addTo(map);
      distanceMarkersRef.current.push(marker);
    });

    // Finish Marker management (shown when finished or viewing saved route; removed when recording/reset)
    const shouldShowFinish =
      (trackingState === 'finished' || (!isTracking && trackingState === 'idle')) && points.length > 1;

    if (shouldShowFinish) {
      const lastPt = points[points.length - 1];
      const finishIcon = L.divIcon({
        className: 'finish-marker-icon',
        html: `
          <div class="flex items-center justify-center w-7 h-7 bg-rose-600 text-white rounded-full shadow-md border-2 border-white font-bold text-[10px]">
            F
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      if (!finishMarkerRef.current) {
        finishMarkerRef.current = L.marker([lastPt.lat, lastPt.lng], { icon: finishIcon })
          .bindTooltip('Titik Finish', { direction: 'top', offset: [0, -10] })
          .addTo(map);
      } else {
        finishMarkerRef.current.setLatLng([lastPt.lat, lastPt.lng]);
      }
    } else if (finishMarkerRef.current) {
      map.removeLayer(finishMarkerRef.current);
      finishMarkerRef.current = null;
    }
  }, [mapEngine, points, distanceMarkersData, isTracking, trackingState, sportType, unit]);

  // Render Target Road Bike Route Guide in Leaflet
  useEffect(() => {
    if (mapEngine !== 'leaflet' || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    if (targetRoutePolylineRef.current) {
      map.removeLayer(targetRoutePolylineRef.current);
      targetRoutePolylineRef.current = null;
    }
    targetRouteMarkersRef.current.forEach((m) => map.removeLayer(m));
    targetRouteMarkersRef.current = [];

    if (!activeTargetRoute || !activeTargetRoute.points || activeTargetRoute.points.length < 2) {
      return;
    }

    const routeCoords = activeTargetRoute.points.map((p) => [p.lat, p.lng] as [number, number]);
    targetRoutePolylineRef.current = L.polyline(routeCoords, {
      color: '#2563eb',
      weight: 5,
      opacity: 0.8,
      dashArray: '6, 8',
      lineJoin: 'round',
    }).addTo(map);

    const startPt = activeTargetRoute.points[0];
    const startIcon = L.divIcon({
      className: 'target-start-icon',
      html: `<div class="px-2 py-0.5 bg-blue-600 text-white font-bold text-[10px] rounded-md border border-white shadow-md flex items-center justify-center">Start Rute</div>`,
      iconSize: [64, 20],
      iconAnchor: [32, 10],
    });
    targetRouteMarkersRef.current.push(
      L.marker([startPt.lat, startPt.lng], { icon: startIcon }).addTo(map)
    );

    const endPt = activeTargetRoute.points[activeTargetRoute.points.length - 1];
    const finishIcon = L.divIcon({
      className: 'target-finish-icon',
      html: `<div class="px-2 py-0.5 bg-slate-800 text-white font-bold text-[10px] rounded-md border border-white shadow-md flex items-center justify-center">Target Finish</div>`,
      iconSize: [74, 20],
      iconAnchor: [37, 10],
    });
    targetRouteMarkersRef.current.push(
      L.marker([endPt.lat, endPt.lng], { icon: finishIcon }).addTo(map)
    );
  }, [mapEngine, activeTargetRoute]);

  // Update Live GPS Marker & GPS Accuracy Circle
  useEffect(() => {
    if (mapEngine !== 'leaflet' || !mapInstanceRef.current || !currentLocation) return;
    const map = mapInstanceRef.current;
    const { lat, lng, accuracy, heading } = currentLocation;

    const headingRotation = heading !== null && !isNaN(heading) ? heading : 0;
    const hasHeading = heading !== null && !isNaN(heading);
    const markerBg = sportType === 'running' ? 'bg-emerald-600 ring-emerald-500/40' : 'bg-cyan-600 ring-cyan-500/40';
    const pulseBg = sportType === 'running' ? 'bg-emerald-500/25' : 'bg-cyan-500/25';

    const liveHtml = `
      <div class="relative flex items-center justify-center w-8 h-8">
        <div class="absolute w-8 h-8 rounded-full ${pulseBg} animate-ping"></div>
        <div class="w-7 h-7 rounded-full ${markerBg} text-white flex items-center justify-center shadow-lg border-2 border-white ring-2" style="transform: rotate(${headingRotation}deg);">
          ${
            hasHeading
              ? '<svg class="w-3.5 h-3.5 fill-white" viewBox="0 0 24 24"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/></svg>'
              : '<div class="w-2.5 h-2.5 rounded-full bg-white"></div>'
          }
        </div>
      </div>
    `;

    const liveIcon = L.divIcon({
      className: 'live-gps-marker-icon',
      html: liveHtml,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    if (!userMarkerRef.current) {
      userMarkerRef.current = L.marker([lat, lng], { icon: liveIcon, zIndexOffset: 1000 }).addTo(map);
    } else {
      userMarkerRef.current.setLatLng([lat, lng]);
      userMarkerRef.current.setIcon(liveIcon);
    }

    const circleColor = accuracy <= 20 ? '#059669' : accuracy <= 45 ? '#d97706' : '#e11d48';
    if (!accuracyCircleRef.current) {
      accuracyCircleRef.current = L.circle([lat, lng], {
        radius: Math.max(4, accuracy),
        color: circleColor,
        fillColor: circleColor,
        fillOpacity: 0.12,
        weight: 1.5,
      }).addTo(map);
    } else {
      accuracyCircleRef.current.setLatLng([lat, lng]);
      accuracyCircleRef.current.setRadius(Math.max(4, accuracy));
      accuracyCircleRef.current.setStyle({ color: circleColor, fillColor: circleColor });
    }

    if (!hasCenteredInitialFixRef.current) {
      hasCenteredInitialFixRef.current = true;
      map.setView([lat, lng], 16, { animate: true });
    } else if (autoFollow) {
      map.panTo([lat, lng], { animate: true, duration: 0.7 });
    }
  }, [mapEngine, currentLocation, autoFollow, sportType]);

  // Handle Chart Scrub Highlight Marker in Leaflet
  useEffect(() => {
    if (mapEngine !== 'leaflet' || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    if (
      highlightedPointIndex !== null &&
      highlightedPointIndex !== undefined &&
      points[highlightedPointIndex]
    ) {
      const pt = points[highlightedPointIndex];
      if (!highlightMarkerRef.current) {
        highlightMarkerRef.current = L.circleMarker([pt.lat, pt.lng], {
          radius: 7,
          color: '#ffffff',
          weight: 2.5,
          fillColor: '#f59e0b',
          fillOpacity: 1,
        }).addTo(map);
      } else {
        highlightMarkerRef.current.setLatLng([pt.lat, pt.lng]);
      }
    } else if (highlightMarkerRef.current) {
      map.removeLayer(highlightMarkerRef.current);
      highlightMarkerRef.current = null;
    }
  }, [mapEngine, highlightedPointIndex, points]);

  // Map Action Handlers
  const handleCurrentLocation = () => {
    onRequestLocation?.();
    if (currentLocation && mapInstanceRef.current) {
      mapInstanceRef.current.setView([currentLocation.lat, currentLocation.lng], 17, { animate: true });
    }
  };

  const handleToggleAutoCenter = () => {
    setAutoFollow((prev) => {
      const next = !prev;
      if (next && currentLocation && mapInstanceRef.current) {
        mapInstanceRef.current.panTo([currentLocation.lat, currentLocation.lng], { animate: true });
      }
      return next;
    });
  };

  const handleZoomIn = () => {
    mapInstanceRef.current?.zoomIn();
  };

  const handleZoomOut = () => {
    mapInstanceRef.current?.zoomOut();
  };

  const handleRouteOverview = () => {
    if (!mapInstanceRef.current) return;
    if (points.length >= 2) {
      setAutoFollow(false);
      const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
      mapInstanceRef.current.fitBounds(bounds, { padding: [44, 44], maxZoom: 17 });
    } else if (activeTargetRoute && activeTargetRoute.points.length >= 2) {
      setAutoFollow(false);
      const bounds = L.latLngBounds(activeTargetRoute.points.map((p) => [p.lat, p.lng]));
      mapInstanceRef.current.fitBounds(bounds, { padding: [44, 44], maxZoom: 16 });
    } else if (currentLocation) {
      mapInstanceRef.current.setView([currentLocation.lat, currentLocation.lng], 16, { animate: true });
    }
  };

  const toggleFullscreen = () => {
    const next = !isFullscreen;
    setIsFullscreen(next);
    if (next && mapWrapperRef.current?.requestFullscreen) {
      mapWrapperRef.current.requestFullscreen().catch(() => {
        // Fallback CSS fixed fullscreen already active
      });
    } else if (!next && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Accuracy indicator display helper
  const accuracyValue = currentLocation?.accuracy ?? stats?.gpsAccuracyM ?? null;
  const accuracyQualityText =
    accuracyValue === null
      ? 'Mencari sinyal'
      : accuracyValue <= 15
      ? 'Akurat'
      : accuracyValue <= 35
      ? 'Sedang'
      : 'Lemah';
  const accuracyColorClass =
    accuracyValue === null
      ? 'text-slate-500'
      : accuracyValue <= 15
      ? 'text-emerald-700'
      : accuracyValue <= 35
      ? 'text-amber-700'
      : 'text-rose-700';

  const hasElev = Boolean(stats?.hasElevationData);

  return (
    <div className="relative w-full flex flex-col">
      {/* Map Engine & Offline Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 px-0.5">
        <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setMapEngine('leaflet')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
              mapEngine === 'leaflet'
                ? 'bg-white text-slate-900 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Navigation className="w-3.5 h-3.5 text-cyan-600" />
            <span>Leaflet OpenStreetMap</span>
          </button>
          <button
            type="button"
            onClick={() => setMapEngine('google')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
              mapEngine === 'google'
                ? 'bg-white text-slate-900 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Globe2 className="w-3.5 h-3.5 text-slate-600" />
            <span>Google Maps</span>
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500">
          {!isOnline && (
            <span className="font-semibold text-amber-700 flex items-center gap-1">
              <WifiOff className="w-3.5 h-3.5 text-amber-600" />
              <span>Offline</span>
              <span aria-hidden="true">·</span>
            </span>
          )}
          <span className={`font-mono-numbers font-semibold ${accuracyColorClass}`}>
            GPS {accuracyValue !== null ? `±${accuracyValue}m (${accuracyQualityText})` : '--'}
          </span>
        </div>
      </div>

      {/* Active Target Route Guidance Bar */}
      {activeTargetRoute && (
        <div className="mb-2 p-2.5 bg-slate-900 rounded-2xl border border-slate-800 text-white flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <Bike className="w-4 h-4 text-cyan-400 shrink-0" />
            <div className="min-w-0">
              <div className="font-bold text-white text-xs truncate">
                {activeTargetRoute.title} · {activeTargetRoute.climbCategory || 'Datar'}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono-numbers">
                <span>{activeTargetRoute.distanceKm} km</span>
                <span aria-hidden="true">·</span>
                <span className="text-emerald-400">+{activeTargetRoute.elevationGainM}m</span>
                <span aria-hidden="true">·</span>
                <span className="text-amber-400">Maks {activeTargetRoute.maxGradientPercent}%</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowElevationModal(true)}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors border border-slate-700 cursor-pointer"
            >
              <Mountain className="w-3 h-3" />
              <span>Profil DEM</span>
            </button>
            {onClearTargetRoute && (
              <button
                type="button"
                onClick={onClearTargetRoute}
                className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                title="Tutup panduan rute"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {mapEngine === 'google' ? (
        <GoogleCyclingMap
          currentLocation={currentLocation}
          points={points}
          splits={splits}
          isTracking={isTracking}
          highlightedPointIndex={highlightedPointIndex}
          heightClass={heightClass}
          onSwitchToOffline={() => setMapEngine('leaflet')}
          activeTargetRoute={activeTargetRoute}
        />
      ) : (
        /* Interactive Leaflet Live Map Viewport */
        <div
          ref={mapWrapperRef}
          className={`relative w-full overflow-hidden border border-slate-200/90 shadow-xs bg-slate-100 ${
            isFullscreen
              ? 'fixed inset-0 z-50 rounded-none h-screen w-screen'
              : `rounded-2xl md:rounded-3xl ${heightClass}`
          }`}
        >
          {/* Dedicated Leaflet Canvas Container */}
          <div ref={mapContainerRef} className="w-full h-full" />

          {/* Top-Left Overlay: Toggleable Live Stats HUD & GPS Accuracy Indicator */}
          <div className="absolute top-3 left-3 right-16 z-[400] pointer-events-none flex flex-col items-start gap-2">
            <div className="pointer-events-auto flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowStatsOverlay((prev) => !prev)}
                className="h-9 px-3 rounded-xl bg-white/95 hover:bg-white text-slate-800 border border-slate-200/90 shadow-sm text-xs font-bold flex items-center gap-1.5 backdrop-blur-md transition-colors cursor-pointer"
                title={showStatsOverlay ? 'Sembunyikan statistik di atas peta' : 'Tampilkan statistik di atas peta'}
              >
                {showStatsOverlay ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5 text-slate-600" />
                    <span>Sembunyikan Statistik</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5 text-cyan-600" />
                    <span>Tampilkan Statistik</span>
                  </>
                )}
              </button>

              {/* GPS Accuracy Indicator on Map */}
              <div className="h-9 px-3 rounded-xl bg-white/95 border border-slate-200/90 shadow-sm text-xs flex items-center gap-1.5 backdrop-blur-md">
                <Radio
                  className={`w-3.5 h-3.5 ${
                    accuracyValue === null
                      ? 'text-slate-400'
                      : accuracyValue <= 20
                      ? 'text-emerald-600'
                      : accuracyValue <= 45
                      ? 'text-amber-600'
                      : 'text-rose-600'
                  }`}
                />
                <span className="font-mono-numbers font-bold text-slate-800">
                  {accuracyValue !== null ? `±${accuracyValue} m` : '--'}
                </span>
                <span className="text-slate-400 hidden sm:inline">·</span>
                <span className={`text-[11px] font-semibold hidden sm:inline ${accuracyColorClass}`}>
                  {accuracyQualityText}
                </span>
              </div>
            </div>

            {/* Collapsible Real-Time Telemetry Overlay Card (Digital Moto Cockpit Mini-HUD) */}
            {showStatsOverlay && stats && (
              <div className="pointer-events-auto bg-slate-950/92 backdrop-blur-md text-white border border-slate-800 rounded-2xl px-3.5 py-3 shadow-xl max-w-full sm:max-w-lg moto-lcd-grid">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-4">
                  {/* Enlarged Digital Speed / Pace Focal Box */}
                  {sportType === 'running' ? (
                    <div className="flex items-baseline gap-1.5 pr-3 sm:border-r sm:border-slate-800">
                      <span className="text-3xl sm:text-4xl font-bold italic font-moto-digital text-emerald-400 leading-none">
                        {formatPaceFromSecPerKm(stats.currentPaceSecPerKm, unit)}
                      </span>
                      <span className="text-[11px] font-bold uppercase text-slate-400 font-moto-digital">
                        {getPaceUnitLabel(unit)}
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col pr-3 sm:border-r sm:border-slate-800 min-w-[132px]">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-4xl sm:text-5xl font-bold italic font-moto-digital text-white leading-none drop-shadow-[0_0_12px_rgba(34,211,238,0.28)]">
                          {formatSpeed(
                            stats.currentSpeedKmH,
                            unit,
                            Boolean(stats.hasSpeedData || stats.recordedPointsCount > 0)
                          )}
                        </span>
                        <span className="text-xs sm:text-sm font-bold uppercase text-cyan-400 font-moto-digital">
                          {getSpeedUnitLabel(unit)}
                        </span>
                      </div>
                      {/* Mini 12-Segment Motorcycle Bar */}
                      <div className="flex items-center gap-0.5 mt-1.5" aria-hidden="true">
                        {Array.from({ length: 12 }, (_, idx) => {
                          const hasSpd = Boolean(stats.hasSpeedData || stats.recordedPointsCount > 0);
                          const spdRatio = hasSpd ? Math.min(1, stats.currentSpeedKmH / 60) : 0;
                          const litCount = Math.round(spdRatio * 12);
                          const isLit = idx < litCount;
                          const segColor =
                            idx >= 10
                              ? 'bg-rose-500'
                              : idx >= 7
                              ? 'bg-amber-400'
                              : idx >= 4
                              ? 'bg-emerald-400'
                              : 'bg-cyan-400';
                          return (
                            <span
                              key={idx}
                              className={`h-1.5 flex-1 -skew-x-12 rounded-[1px] ${
                                isLit ? segColor : 'bg-slate-800'
                              }`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Secondary Map Telemetry Strip */}
                  <div className="grid grid-cols-3 gap-3 text-xs flex-1">
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-slate-400 block font-semibold">
                        Jarak
                      </span>
                      <span className="text-base sm:text-lg font-bold font-moto-digital text-white">
                        {formatDistance(stats.distanceKm, unit)}
                      </span>
                      <span className="text-[10px] text-cyan-400 ml-1 font-moto-digital uppercase">
                        {getDistanceUnitLabel(unit)}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-slate-400 block font-semibold">
                        Waktu
                      </span>
                      <span className="text-base sm:text-lg font-bold font-moto-digital text-white">
                        {formatDuration(stats.totalDurationSeconds)}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-slate-400 block font-semibold">
                        {sportType === 'running' ? 'Avg Pace' : 'Elevasi Naik'}
                      </span>
                      {sportType === 'running' ? (
                        <span className="text-base sm:text-lg font-bold font-moto-digital text-amber-300">
                          {formatPaceFromSecPerKm(stats.avgPaceSecPerKm, unit)}
                        </span>
                      ) : (
                        <span className="text-base sm:text-lg font-bold font-moto-digital text-emerald-400">
                          {hasElev ? `+${formatElevation(stats.elevationGainM, unit, true)}` : '--'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Map Control Stack: Layer, Zoom In, Zoom Out, Current Location, Auto-Center, Route Overview, Fullscreen */}
          <div className="absolute top-3 right-3 z-[400] flex flex-col gap-1.5">
            {/* Tile Layer Switcher */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowLayerMenu((prev) => !prev)}
                title="Pilih Lapisan Peta"
                className="w-10 h-10 rounded-xl bg-white/95 hover:bg-white text-slate-700 border border-slate-200 shadow-sm flex items-center justify-center transition-colors backdrop-blur-md active:scale-95 cursor-pointer"
              >
                <Layers className="w-4.5 h-4.5" />
              </button>

              {showLayerMenu && (
                <div className="absolute right-0 mt-1.5 w-52 p-1.5 bg-white border border-slate-200 rounded-xl shadow-xl flex flex-col gap-0.5 z-50">
                  <div className="text-[10px] font-bold text-slate-500 px-2.5 py-1 uppercase tracking-wider">
                    Penyedia Peta Sah
                  </div>
                  {(['street', 'voyager', 'topo', 'dark', 'satellite'] as MapStyle[]).map((style) => (
                    <button
                      key={style}
                      type="button"
                      onClick={() => {
                        setActiveLayer(style);
                        setShowLayerMenu(false);
                      }}
                      className={`w-full text-left px-2.5 py-2 text-xs rounded-lg transition-colors flex items-center justify-between cursor-pointer ${
                        activeLayer === style
                          ? 'bg-cyan-50 text-cyan-800 font-bold'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span>{MAP_LAYERS[style].name}</span>
                      {activeLayer === style && <span className="w-1.5 h-1.5 rounded-full bg-cyan-600" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Zoom In & Zoom Out */}
            <div className="flex flex-col rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-white/95 backdrop-blur-md">
              <button
                type="button"
                onClick={handleZoomIn}
                title="Perbesar Peta (Zoom In)"
                aria-label="Zoom in"
                className="w-10 h-10 hover:bg-slate-100 text-slate-800 flex items-center justify-center border-b border-slate-200 transition-colors active:bg-slate-200 cursor-pointer"
              >
                <Plus className="w-4.5 h-4.5" />
              </button>
              <button
                type="button"
                onClick={handleZoomOut}
                title="Perkecil Peta (Zoom Out)"
                aria-label="Zoom out"
                className="w-10 h-10 hover:bg-slate-100 text-slate-800 flex items-center justify-center transition-colors active:bg-slate-200 cursor-pointer"
              >
                <Minus className="w-4.5 h-4.5" />
              </button>
            </div>

            {/* Current Location */}
            <button
              type="button"
              onClick={handleCurrentLocation}
              title="Ke Lokasi Saat Ini"
              aria-label="Lokasi saat ini"
              className="w-10 h-10 rounded-xl bg-white/95 hover:bg-white text-slate-700 border border-slate-200 shadow-sm flex items-center justify-center transition-colors backdrop-blur-md active:scale-95 cursor-pointer"
            >
              <Crosshair className="w-4.5 h-4.5 text-cyan-600" />
            </button>

            {/* Auto-Center Map Toggle */}
            <button
              type="button"
              onClick={handleToggleAutoCenter}
              title={autoFollow ? 'Auto-Center Aktif (Klik untuk matikan)' : 'Aktifkan Auto-Center Peta'}
              aria-label="Auto-center peta"
              className={`w-10 h-10 rounded-xl border shadow-sm flex items-center justify-center transition-all backdrop-blur-md active:scale-95 cursor-pointer ${
                autoFollow
                  ? 'bg-cyan-600 text-white border-cyan-600'
                  : 'bg-white/95 hover:bg-white text-slate-700 border-slate-200'
              }`}
            >
              <LocateFixed className="w-4.5 h-4.5" />
            </button>

            {/* Route Overview */}
            <button
              type="button"
              onClick={handleRouteOverview}
              disabled={points.length < 2 && (!activeTargetRoute || activeTargetRoute.points.length < 2)}
              title="Tampilkan Seluruh Rute (Route Overview)"
              aria-label="Overview rute"
              className="w-10 h-10 rounded-xl bg-white/95 hover:bg-white disabled:opacity-45 text-slate-700 border border-slate-200 shadow-sm flex items-center justify-center transition-colors backdrop-blur-md active:scale-95 cursor-pointer disabled:cursor-not-allowed"
            >
              <Compass className="w-4.5 h-4.5" />
            </button>

            {/* Fullscreen Map */}
            <button
              type="button"
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Keluar Layar Penuh' : 'Layar Penuh Peta'}
              aria-label="Layar penuh peta"
              className="w-10 h-10 rounded-xl bg-white/95 hover:bg-white text-slate-700 border border-slate-200 shadow-sm flex items-center justify-center transition-colors backdrop-blur-md active:scale-95 cursor-pointer"
            >
              {isFullscreen ? <Minimize2 className="w-4.5 h-4.5" /> : <Maximize2 className="w-4.5 h-4.5" />}
            </button>
          </div>

          {/* Bottom Coordinate & Route Waypoint Status Bar */}
          <div className="absolute bottom-2 left-2.5 right-2.5 z-[400] pointer-events-none flex flex-wrap items-center justify-between gap-2">
            <div className="pointer-events-auto flex items-center gap-1.5 px-2.5 py-1 bg-white/92 backdrop-blur-md rounded-lg border border-slate-200/90 shadow-2xs text-[11px] text-slate-700 font-mono-numbers">
              <Navigation className="w-3 h-3 text-cyan-600 shrink-0" />
              <span>
                {currentLocation
                  ? `${currentLocation.lat.toFixed(5)}, ${currentLocation.lng.toFixed(5)}`
                  : 'Menunggu sinyal koordinat GPS...'}
              </span>
            </div>

            {points.length > 0 && (
              <div className="pointer-events-auto px-2.5 py-1 bg-white/92 backdrop-blur-md rounded-lg border border-slate-200/90 shadow-2xs text-[11px] text-slate-700 font-mono-numbers font-semibold mr-auto sm:mr-0">
                {points.length} titik · {distanceMarkersData.length} penanda km
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Peek Elevation Profile */}
      {showElevationModal && activeTargetRoute && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-4 md:p-6 space-y-4 shadow-2xl text-white">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-extrabold text-base text-white">{activeTargetRoute.title}</h3>
                <p className="text-xs text-slate-400">{activeTargetRoute.subtitle}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowElevationModal(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <DigitalElevationChart route={activeTargetRoute} />
          </div>
        </div>
      )}
    </div>
  );
};
