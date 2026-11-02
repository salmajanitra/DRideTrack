// Source: Google Maps Platform Code Assist
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  useMap,
} from '@vis.gl/react-google-maps';
import { GPSPoint, KilometerSplit, DigitalRoute } from '../types/cycling';
import { GOOGLE_MAPS_API_KEY, GMP_ATTRIBUTION_ID, GMP_MAP_ID } from '../services/googleMapsConfig';
import {
  Navigation,
  Compass,
  Maximize2,
  Minimize2,
  Bike,
  Activity,
  Layers,
  LocateFixed,
} from 'lucide-react';

interface GoogleCyclingMapProps {
  currentLocation: {
    lat: number;
    lng: number;
    accuracy: number;
    heading: number | null;
  } | null;
  points: GPSPoint[];
  splits?: KilometerSplit[];
  isTracking: boolean;
  highlightedPointIndex?: number | null;
  heightClass?: string;
  onSwitchToOffline?: () => void;
  activeTargetRoute?: DigitalRoute | null;
}

// Inner helper to manage Target Road Bike Route Guide
function TargetRoutePolyline({ route }: { route?: DigitalRoute | null }) {
  const map = useMap();
  const polylineRef = useRef<google.maps.Polyline | null>(null);

  useEffect(() => {
    if (!map || !route || !route.points || route.points.length < 2) {
      if (polylineRef.current) {
        polylineRef.current.setMap(null);
        polylineRef.current = null;
      }
      return;
    }

    const path = route.points.map((p) => ({ lat: p.lat, lng: p.lng }));

    if (!polylineRef.current) {
      polylineRef.current = new google.maps.Polyline({
        path,
        geodesic: true,
        strokeColor: '#2563eb', // Royal blue guide for target route
        strokeOpacity: 0.75,
        strokeWeight: 6,
        map,
      });
    } else {
      polylineRef.current.setPath(path);
    }

    return () => {
      if (polylineRef.current) {
        polylineRef.current.setMap(null);
        polylineRef.current = null;
      }
    };
  }, [map, route]);

  return null;
}

// Inner helper to manage Google Maps Polyline
function RoutePolyline({ points }: { points: GPSPoint[] }) {
  const map = useMap();
  const polylineRef = useRef<google.maps.Polyline | null>(null);

  useEffect(() => {
    if (!map) return;

    const path = points.map((p) => ({ lat: p.lat, lng: p.lng }));

    if (!polylineRef.current) {
      polylineRef.current = new google.maps.Polyline({
        path,
        geodesic: true,
        strokeColor: '#06b6d4', // Road bike electric cyan
        strokeOpacity: 0.95,
        strokeWeight: 5,
        map,
      });
    } else {
      polylineRef.current.setPath(path);
    }

    return () => {
      if (polylineRef.current) {
        polylineRef.current.setMap(null);
        polylineRef.current = null;
      }
    };
  }, [map, points]);

  return null;
}

// Inner helper to manage Accuracy Circle
function AccuracyCircle({
  center,
  radius,
}: {
  center: { lat: number; lng: number } | null;
  radius: number;
}) {
  const map = useMap();
  const circleRef = useRef<google.maps.Circle | null>(null);

  useEffect(() => {
    if (!map || !center) {
      if (circleRef.current) {
        circleRef.current.setMap(null);
        circleRef.current = null;
      }
      return;
    }

    if (!circleRef.current) {
      circleRef.current = new google.maps.Circle({
        strokeColor: '#06b6d4',
        strokeOpacity: 0.5,
        strokeWeight: 1.5,
        fillColor: '#06b6d4',
        fillOpacity: 0.12,
        map,
        center,
        radius,
      });
    } else {
      circleRef.current.setCenter(center);
      circleRef.current.setRadius(radius);
    }

    return () => {
      if (circleRef.current) {
        circleRef.current.setMap(null);
        circleRef.current = null;
      }
    };
  }, [map, center, radius]);

  return null;
}

// Inner helper to manage Bicycling layer
function BicyclingLayer({ enabled }: { enabled: boolean }) {
  const map = useMap();
  const layerRef = useRef<google.maps.BicyclingLayer | null>(null);

  useEffect(() => {
    if (!map) return;

    if (enabled) {
      if (!layerRef.current) {
        layerRef.current = new google.maps.BicyclingLayer();
      }
      layerRef.current.setMap(map);
    } else if (layerRef.current) {
      layerRef.current.setMap(null);
    }

    return () => {
      if (layerRef.current) {
        layerRef.current.setMap(null);
        layerRef.current = null;
      }
    };
  }, [map, enabled]);

  return null;
}

// Inner helper to manage Traffic layer
function TrafficLayer({ enabled }: { enabled: boolean }) {
  const map = useMap();
  const layerRef = useRef<google.maps.TrafficLayer | null>(null);

  useEffect(() => {
    if (!map) return;

    if (enabled) {
      if (!layerRef.current) {
        layerRef.current = new google.maps.TrafficLayer();
      }
      layerRef.current.setMap(map);
    } else if (layerRef.current) {
      layerRef.current.setMap(null);
    }

    return () => {
      if (layerRef.current) {
        layerRef.current.setMap(null);
        layerRef.current = null;
      }
    };
  }, [map, enabled]);

  return null;
}

// Camera pan controller
function CameraController({
  currentLocation,
  autoFollow,
}: {
  currentLocation: { lat: number; lng: number } | null;
  autoFollow: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map || !currentLocation || !autoFollow) return;
    map.panTo({ lat: currentLocation.lat, lng: currentLocation.lng });
  }, [map, currentLocation, autoFollow]);

  return null;
}

export const GoogleCyclingMap: React.FC<GoogleCyclingMapProps> = ({
  currentLocation,
  points,
  splits = [],
  isTracking,
  highlightedPointIndex,
  heightClass = 'h-[360px] md:h-[450px]',
  onSwitchToOffline,
  activeTargetRoute,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [mapType, setMapType] = useState<'roadmap' | 'satellite' | 'terrain' | 'hybrid'>('roadmap');
  const [showBicycling, setShowBicycling] = useState<boolean>(true);
  const [showTraffic, setShowTraffic] = useState<boolean>(false);
  const [autoFollow, setAutoFollow] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showLayersMenu, setShowLayersMenu] = useState<boolean>(false);

  // Compute default center (cyclist current location or start of points or default Jakarta)
  const defaultCenter = points.length > 0
    ? { lat: points[points.length - 1].lat, lng: points[points.length - 1].lng }
    : currentLocation
    ? { lat: currentLocation.lat, lng: currentLocation.lng }
    : { lat: -6.175392, lng: 106.827153 };

  const startPoint = points.length > 0 ? points[0] : null;
  const finishPoint = !isTracking && points.length > 1 ? points[points.length - 1] : null;
  const highlightedPoint =
    highlightedPointIndex !== null &&
    highlightedPointIndex !== undefined &&
    points[highlightedPointIndex]
      ? points[highlightedPointIndex]
      : null;

  // Toggle fullscreen
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative w-full rounded-2xl md:rounded-3xl overflow-hidden border border-slate-200/90 shadow-sm bg-slate-100 flex flex-col ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none h-screen' : heightClass
      }`}
      style={{ height: isFullscreen ? '100vh' : undefined }}
    >
      <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
        <div className="relative w-full h-full min-h-[260px]">
          <Map
            mapId={GMP_MAP_ID}
            internalUsageAttributionIds={[GMP_ATTRIBUTION_ID]}
            defaultCenter={defaultCenter}
            defaultZoom={15}
            mapTypeId={mapType}
            gestureHandling="greedy"
            disableDefaultUI={false}
            className="w-full h-full"
            style={{ width: '100%', height: '100%' }}
            onDragstart={() => setAutoFollow(false)}
          >
            {/* Target Guided Road Bike Route */}
            <TargetRoutePolyline route={activeTargetRoute} />

            {/* Cyclist recorded path polyline */}
            <RoutePolyline points={points} />

            {/* Cyclist Accuracy Circle */}
            {currentLocation && (
              <AccuracyCircle
                center={{ lat: currentLocation.lat, lng: currentLocation.lng }}
                radius={currentLocation.accuracy}
              />
            )}

            {/* Bicycling & Traffic layers */}
            <BicyclingLayer enabled={showBicycling} />
            <TrafficLayer enabled={showTraffic} />

            {/* Camera follow */}
            <CameraController
              currentLocation={currentLocation ? { lat: currentLocation.lat, lng: currentLocation.lng } : null}
              autoFollow={autoFollow}
            />

            {/* Start Marker (Green Flag) */}
            {startPoint && (
              <AdvancedMarker position={{ lat: startPoint.lat, lng: startPoint.lng }} title="Titik Awal">
                <div className="flex items-center justify-center w-7 h-7 bg-emerald-500 text-white rounded-full shadow-lg border-2 border-white ring-2 ring-emerald-500/40">
                  <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                    <path d="M4 2v20h2V14h11l-1.5-4.5L17 5H6V2H4z" />
                  </svg>
                </div>
              </AdvancedMarker>
            )}

            {/* Finish Marker (Red checkered) */}
            {finishPoint && (
              <AdvancedMarker position={{ lat: finishPoint.lat, lng: finishPoint.lng }} title="Garis Akhir">
                <div className="flex items-center justify-center w-7 h-7 bg-rose-500 text-white rounded-full shadow-lg border-2 border-white ring-2 ring-rose-500/40">
                  <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                    <path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z" />
                  </svg>
                </div>
              </AdvancedMarker>
            )}

            {/* Kilometer Milestone Markers */}
            {splits.map((split) => {
              const pointAtKm = points.find((p) => p.cumulativeDistance >= split.kmIndex);
              if (!pointAtKm) return null;
              return (
                <AdvancedMarker
                  key={`split-${split.kmIndex}`}
                  position={{ lat: pointAtKm.lat, lng: pointAtKm.lng }}
                  title={`Kilometer ${split.kmIndex} - Avg ${split.avgSpeedKmH} km/h`}
                >
                  <div className="px-1.5 py-0.5 bg-amber-500 text-slate-950 font-bold text-[10px] rounded border border-white/80 shadow-md flex items-center justify-center font-mono">
                    {split.kmIndex}K
                  </div>
                </AdvancedMarker>
              );
            })}

            {/* Cyclist Live Marker with Heading */}
            {currentLocation && (
              <AdvancedMarker
                position={{ lat: currentLocation.lat, lng: currentLocation.lng }}
                title="Posisi Pengayuh Sepeda"
              >
                <div className="relative flex items-center justify-center">
                  {/* Outer pulse */}
                  <div className="absolute w-10 h-10 rounded-full bg-cyan-400/30 animate-ping pointer-events-none" />
                  {/* Central rider marker */}
                  <div
                    className="relative w-8 h-8 rounded-full bg-cyan-500 text-white flex items-center justify-center shadow-lg border-2 border-white ring-2 ring-cyan-500/50 transition-transform duration-300"
                    style={{
                      transform: currentLocation.heading !== null
                        ? `rotate(${currentLocation.heading}deg)`
                        : undefined,
                    }}
                  >
                    {currentLocation.heading !== null ? (
                      <Navigation className="w-4 h-4 fill-white stroke-none transform -rotate-45" />
                    ) : (
                      <Bike className="w-4 h-4" />
                    )}
                  </div>
                </div>
              </AdvancedMarker>
            )}

            {/* Highlighted point from chart scrubber */}
            {highlightedPoint && (
              <AdvancedMarker
                position={{ lat: highlightedPoint.lat, lng: highlightedPoint.lng }}
                title="Titik Inspeksi Grafik"
              >
                <div className="w-4 h-4 rounded-full bg-amber-400 border-2 border-white ring-4 ring-amber-400/50 animate-bounce" />
              </AdvancedMarker>
            )}
          </Map>

          {/* Top Left: Google Maps Layer & Features Controls */}
          <div className="absolute top-3 left-3 z-10 flex flex-col gap-2">
            <div className="relative">
              <button
                onClick={() => setShowLayersMenu(!showLayersMenu)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/95 backdrop-blur-md hover:bg-white text-slate-800 rounded-xl text-xs font-bold shadow-md border border-slate-200 transition-colors"
                title="Pilih Tampilan Peta Google"
              >
                <Layers className="w-3.5 h-3.5 text-cyan-600" />
                <span className="capitalize">{mapType}</span>
              </button>

              {showLayersMenu && (
                <div className="absolute top-full left-0 mt-1.5 bg-white/98 backdrop-blur-md border border-slate-200 rounded-xl shadow-xl p-2 w-48 text-xs z-30">
                  <div className="text-[10px] font-bold text-slate-600 uppercase px-2 py-1">
                    Jenis Peta Google
                  </div>
                  <div className="space-y-0.5">
                    {(['roadmap', 'satellite', 'terrain', 'hybrid'] as const).map((type) => (
                      <button
                        key={type}
                        onClick={() => {
                          setMapType(type);
                          setShowLayersMenu(false);
                        }}
                        className={`w-full text-left px-2 py-1.5 rounded-lg capitalize flex items-center justify-between ${
                          mapType === type
                            ? 'bg-cyan-50 font-bold text-cyan-800'
                            : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <span>{type === 'roadmap' ? 'Peta Jalan' : type === 'satellite' ? 'Satelit' : type === 'terrain' ? 'Medan/Topografi' : 'Hybrid'}</span>
                        {mapType === type && <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />}
                      </button>
                    ))}
                  </div>

                  <div className="border-t border-slate-100 my-1 pt-1">
                    <div className="text-[10px] font-bold text-slate-600 uppercase px-2 py-1">
                      Lapisan Tambahan
                    </div>
                    <label className="flex items-center justify-between px-2 py-1 hover:bg-slate-50 rounded cursor-pointer">
                      <span className="flex items-center gap-1.5 text-slate-700">
                        <Bike className="w-3 h-3 text-emerald-600" /> Jalur Bersepeda
                      </span>
                      <input
                        type="checkbox"
                        checked={showBicycling}
                        onChange={(e) => setShowBicycling(e.target.checked)}
                        className="rounded text-cyan-600 focus:ring-cyan-500"
                      />
                    </label>
                    <label className="flex items-center justify-between px-2 py-1 hover:bg-slate-50 rounded cursor-pointer">
                      <span className="flex items-center gap-1.5 text-slate-700">
                        <Activity className="w-3 h-3 text-amber-600" /> Lalu Lintas
                      </span>
                      <input
                        type="checkbox"
                        checked={showTraffic}
                        onChange={(e) => setShowTraffic(e.target.checked)}
                        className="rounded text-cyan-600 focus:ring-cyan-500"
                      />
                    </label>
                  </div>

                  {onSwitchToOffline && (
                    <div className="border-t border-slate-100 mt-1 pt-1">
                      <button
                        onClick={() => {
                          setShowLayersMenu(false);
                          onSwitchToOffline();
                        }}
                        className="w-full text-left px-2 py-1.5 text-[11px] text-slate-600 hover:bg-slate-100 rounded-lg flex items-center gap-1.5"
                      >
                        Beralih ke Peta Offline Leaflet &rarr;
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Top Right: Status Badge & Controls */}
          <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
            <span className="px-2.5 py-1 bg-white/95 backdrop-blur-md rounded-xl text-[10px] font-bold text-emerald-800 border border-emerald-200 shadow-sm flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Google Maps Live
            </span>

            {/* Auto Follow Toggle */}
            <button
              onClick={() => setAutoFollow(!autoFollow)}
              className={`p-2 rounded-xl text-xs font-bold shadow-md border transition-colors ${
                autoFollow
                  ? 'bg-cyan-600 text-white border-cyan-700 ring-2 ring-cyan-400/40'
                  : 'bg-white/95 text-slate-700 border-slate-200 hover:bg-white'
              }`}
              title={autoFollow ? 'Ikuti Posisi Sepeda (Aktif)' : 'Aktifkan Ikuti Posisi'}
            >
              <LocateFixed className="w-4 h-4" />
            </button>

            {/* Fullscreen Button */}
            <button
              onClick={toggleFullscreen}
              className="p-2 bg-white/95 backdrop-blur-md hover:bg-white text-slate-700 border border-slate-200 rounded-xl shadow-md transition-colors"
              title="Layar Penuh"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>

          {/* Bottom Left: Live Telemetry Indicator Bar */}
          <div className="absolute bottom-3 left-3 z-10 bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-xl p-2 px-3 shadow-md flex items-center gap-3 text-xs pointer-events-none">
            <div className="flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5 text-cyan-600" />
              <span className="font-semibold text-slate-700">Titik GPS:</span>
              <span className="font-mono font-bold text-slate-900">{points.length}</span>
            </div>
            {currentLocation?.accuracy && (
              <div className="flex items-center gap-1 border-l border-slate-200 pl-3">
                <Compass className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-[11px] text-slate-600">Akurasi:</span>
                <span className="font-mono font-bold text-slate-900">
                  &plusmn;{Math.round(currentLocation.accuracy)}m
                </span>
              </div>
            )}
          </div>
        </div>
      </APIProvider>
    </div>
  );
};
