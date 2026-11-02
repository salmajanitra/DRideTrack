import React, { useState, useMemo, useRef } from 'react';
import { GPSPoint, KilometerSplit, UnitSystem, ActivityStats, SportType } from '../types/cycling';
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
  TrendingUp,
  Gauge,
  Mountain,
  Clock,
  Activity,
  Layers,
  Compass,
  Zap,
} from 'lucide-react';

interface ActivityChartsProps {
  points: GPSPoint[];
  splits: KilometerSplit[];
  stats: ActivityStats;
  sportType?: SportType;
  unit: UnitSystem;
  onHoverPoint?: (index: number | null) => void;
}

type ChartMode = 'elev_dist' | 'speed_dist' | 'speed_time' | 'splits' | 'distribution';

export const ActivityCharts: React.FC<ActivityChartsProps> = ({
  points,
  splits,
  stats,
  sportType = 'cycling',
  unit,
  onHoverPoint,
}) => {
  const [activeMode, setActiveMode] = useState<ChartMode>(() =>
    sportType === 'running' ? 'splits' : 'speed_dist'
  );
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hasElevation = Boolean(
    stats.hasElevationData ?? points.some((p) => p.altitude !== null && !isNaN(p.altitude))
  );
  const hasRecordedPoints = points.length > 0;

  // Compute sampled points for fast SVG rendering (sample if > 350 points)
  const sampledPoints = useMemo(() => {
    if (points.length <= 400) return points;
    const step = Math.ceil(points.length / 400);
    const result: GPSPoint[] = [];
    for (let i = 0; i < points.length; i += step) {
      result.push(points[i]);
    }
    // Always include last point
    if (result[result.length - 1] !== points[points.length - 1]) {
      result.push(points[points.length - 1]);
    }
    return result;
  }, [points]);

  // Derived extremes with actual min/max values for stat cards
  const extremes = useMemo(() => {
    let maxSpeed = 10;
    let minElev = Infinity;
    let maxElev = -Infinity;
    let maxDist = 0.1;
    let maxTimeSec = 1;

    if (points.length > 0) {
      const startTime = points[0].timestamp;
      points.forEach((p) => {
        if (p.speed > maxSpeed) maxSpeed = p.speed;
        if (p.altitude !== null) {
          if (p.altitude < minElev) minElev = p.altitude;
          if (p.altitude > maxElev) maxElev = p.altitude;
        }
        if (p.cumulativeDistance > maxDist) maxDist = p.cumulativeDistance;
        const elapsedSec = (p.timestamp - startTime) / 1000;
        if (elapsedSec > maxTimeSec) maxTimeSec = elapsedSec;
      });
    }

    const minActualElev = minElev === Infinity ? 0 : Math.round(minElev);
    const maxActualElev = maxElev === -Infinity ? 50 : Math.round(maxElev);

    if (minElev === Infinity) minElev = 0;
    if (maxElev === -Infinity) maxElev = 50;
    // Add 15% breathing room to elevation bounds
    const elevPadding = Math.max(8, (maxElev - minElev) * 0.15);
    const paddedMinElev = Math.max(0, Math.floor(minElev - elevPadding));
    const paddedMaxElev = Math.ceil(maxElev + elevPadding);

    return {
      maxSpeed: Math.max(20, Math.ceil(maxSpeed + 4)),
      actualMaxSpeed: Math.max(stats.maxSpeedKmH, maxSpeed),
      minElev: paddedMinElev,
      maxElev: paddedMaxElev,
      minActualElev,
      maxActualElev,
      maxDist: Math.max(0.1, maxDist),
      maxTimeSec: Math.max(1, maxTimeSec),
    };
  }, [points, stats.maxSpeedKmH]);

  // Handle pointer scrub over SVG chart
  const updateScrubIndex = (clientX: number, target: SVGSVGElement) => {
    if (points.length < 2) return;
    const rect = target.getBoundingClientRect();
    const xPos = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const ratio = xPos / rect.width;
    const targetIndex = Math.min(
      points.length - 1,
      Math.max(0, Math.round(ratio * (points.length - 1)))
    );

    setHoverIndex(targetIndex);
    onHoverPoint?.(targetIndex);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    updateScrubIndex(e.clientX, e.currentTarget);
  };

  const handleTouchMove = (e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length > 0) {
      updateScrubIndex(e.touches[0].clientX, e.currentTarget);
    }
  };

  const handlePointerLeave = () => {
    setHoverIndex(null);
    onHoverPoint?.(null);
  };

  const hoveredPoint = hoverIndex !== null && points[hoverIndex] ? points[hoverIndex] : null;

  // Render SVG Line & Area Chart
  const renderLineChart = () => {
    if (points.length < 2) {
      return (
        <div className="h-72 flex flex-col items-center justify-center text-slate-500 bg-slate-50/70 border border-dashed border-slate-200 rounded-2xl px-4 text-center">
          <Activity className="w-10 h-10 mb-2 stroke-1 text-cyan-600" />
          <p className="font-bold text-slate-700">Belum cukup titik GPS untuk menampilkan grafik.</p>
          <p className="text-xs text-slate-500 mt-1">
            Mulai perekaman aktivitas di luar ruangan agar titik koordinat GPS terekam secara real-time.
          </p>
        </div>
      );
    }

    if (activeMode === 'elev_dist' && !hasElevation) {
      return (
        <div className="h-72 flex flex-col items-center justify-center text-slate-500 bg-slate-50/70 border border-dashed border-slate-200 rounded-2xl px-4 text-center">
          <Mountain className="w-10 h-10 mb-2 stroke-1 text-slate-400" />
          <p className="font-bold text-slate-700">Data elevasi tidak tersedia dari perangkat ini (--)</p>
          <p className="text-xs text-slate-500 mt-1">
            Sensor GPS browser perangkat belum mengirimkan nilai ketinggian (altitude).
          </p>
        </div>
      );
    }

    const width = 800;
    const height = 300;
    const padding = { top: 32, right: 35, bottom: 45, left: 68 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const startTime = points[0].timestamp;

    // Coordinate conversion functions
    const getX = (p: GPSPoint) => {
      let xRatio = 0;
      if (activeMode === 'speed_dist' || activeMode === 'elev_dist') {
        xRatio = extremes.maxDist > 0 ? p.cumulativeDistance / extremes.maxDist : 0;
      } else {
        const elapsedSec = (p.timestamp - startTime) / 1000;
        xRatio = extremes.maxTimeSec > 0 ? elapsedSec / extremes.maxTimeSec : 0;
      }
      return padding.left + xRatio * chartW;
    };

    const isElevationMode = activeMode === 'elev_dist';

    const getY = (p: GPSPoint) => {
      if (isElevationMode) {
        const alt = p.altitude ?? extremes.minElev;
        const range = extremes.maxElev - extremes.minElev || 1;
        const ratio = (alt - extremes.minElev) / range;
        return padding.top + chartH - ratio * chartH;
      } else {
        const ratio = p.speed / extremes.maxSpeed;
        return padding.top + chartH - ratio * chartH;
      }
    };

    // Build SVG path
    let pathD = '';
    let areaD = '';

    sampledPoints.forEach((p, i) => {
      const x = getX(p);
      const y = getY(p);
      if (i === 0) {
        pathD += `M ${x} ${y}`;
        areaD += `M ${x} ${padding.top + chartH} L ${x} ${y}`;
      } else {
        pathD += ` L ${x} ${y}`;
        areaD += ` L ${x} ${y}`;
      }
    });

    const lastX = getX(sampledPoints[sampledPoints.length - 1]);
    areaD += ` L ${lastX} ${padding.top + chartH} Z`;

    // Hover line coordinates
    const hoverX = hoveredPoint ? getX(hoveredPoint) : 0;
    const hoverY = hoveredPoint ? getY(hoveredPoint) : 0;

    const strokeColor = isElevationMode ? '#059669' : '#0284c7'; // vibrant emerald vs vivid cyan
    const gradientId = isElevationMode ? 'elevGradLarge' : 'speedGradLarge';

    // Tooltip floating bubble text
    const hoverValueText = hoveredPoint
      ? isElevationMode
        ? formatElevation(hoveredPoint.altitude, unit)
        : `${formatSpeed(hoveredPoint.speed, unit)} ${getSpeedUnitLabel(unit)}`
      : '';

    return (
      <div className="relative">
        {/* SVG Viewport */}
        <div className="bg-slate-50/50 border border-slate-200/90 rounded-2xl p-2 sm:p-3 overflow-hidden shadow-2xs">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-72 sm:h-80 md:h-92 touch-none select-none cursor-crosshair"
            onPointerMove={handlePointerMove}
            onPointerLeave={handlePointerLeave}
            onTouchStart={handleTouchMove}
            onTouchMove={handleTouchMove}
            onTouchEnd={handlePointerLeave}
          >
            <defs>
              <linearGradient id="elevGradLarge" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.55" />
                <stop offset="50%" stopColor="#10b981" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
              </linearGradient>
              <linearGradient id="speedGradLarge" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.60" />
                <stop offset="50%" stopColor="#06b6d4" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.02" />
              </linearGradient>
              {/* Drop shadow for hover bubble */}
              <filter id="bubbleShadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#0f172a" floodOpacity="0.25" />
              </filter>
            </defs>

            {/* Grid lines and large readable Y-Axis Labels */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
              const y = padding.top + chartH * ratio;
              const val = isElevationMode
                ? extremes.maxElev - ratio * (extremes.maxElev - extremes.minElev)
                : extremes.maxSpeed - ratio * extremes.maxSpeed;

              const labelStr = isElevationMode
                ? formatElevation(val, unit)
                : `${Math.round(val)} ${getSpeedUnitLabel(unit)}`;

              return (
                <g key={ratio}>
                  <line
                    x1={padding.left}
                    y1={y}
                    x2={width - padding.right}
                    y2={y}
                    stroke="#cbd5e1"
                    strokeDasharray="4 4"
                    strokeWidth="1.2"
                  />
                  {/* High contrast bold Y-axis label */}
                  <text
                    x={padding.left - 10}
                    y={y + 5}
                    fill="#0f172a"
                    fontSize="13"
                    fontWeight="800"
                    textAnchor="end"
                    className="font-mono-numbers select-none"
                  >
                    {labelStr}
                  </text>
                </g>
              );
            })}

            {/* Bottom axis ticks and large readable X-Axis Labels */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
              const x = padding.left + chartW * ratio;
              let label = '';
              if (activeMode === 'speed_dist' || activeMode === 'elev_dist') {
                const d = ratio * extremes.maxDist;
                label = `${formatDistance(d, unit)} ${getDistanceUnitLabel(unit)}`;
              } else {
                const sec = ratio * extremes.maxTimeSec;
                label = formatDuration(Math.round(sec));
              }

              return (
                <g key={ratio}>
                  <line
                    x1={x}
                    y1={padding.top + chartH}
                    x2={x}
                    y2={padding.top + chartH + 6}
                    stroke="#64748b"
                    strokeWidth="1.5"
                  />
                  <text
                    x={x}
                    y={padding.top + chartH + 24}
                    fill="#1e293b"
                    fontSize="13"
                    fontWeight="700"
                    textAnchor={ratio === 0 ? 'start' : ratio === 1 ? 'end' : 'middle'}
                    className="font-mono-numbers select-none"
                  >
                    {label}
                  </text>
                </g>
              );
            })}

            {/* Area Fill & Main Line Curve */}
            <path d={areaD} fill={`url(#${gradientId})`} />
            <path
              d={pathD}
              fill="none"
              stroke={strokeColor}
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Interactive Scrub Line, Target Marker, and Floating Live Bubble */}
            {hoveredPoint && (
              <g>
                {/* Vertical guide line */}
                <line
                  x1={hoverX}
                  y1={padding.top}
                  x2={hoverX}
                  y2={padding.top + chartH}
                  stroke="#f59e0b"
                  strokeWidth="2"
                  strokeDasharray="4 4"
                />

                {/* Outer pulse circle */}
                <circle
                  cx={hoverX}
                  cy={hoverY}
                  r="9"
                  fill="#f59e0b"
                  fillOpacity="0.3"
                  className="animate-ping"
                />

                {/* Point circle */}
                <circle
                  cx={hoverX}
                  cy={hoverY}
                  r="6.5"
                  fill="#f59e0b"
                  stroke="#ffffff"
                  strokeWidth="2.5"
                />

                {/* Floating tooltip bubble on top of the point */}
                <g
                  transform={`translate(${Math.max(
                    padding.left + 50,
                    Math.min(width - padding.right - 50, hoverX)
                  )}, ${Math.max(padding.top + 20, hoverY - 24)})`}
                  filter="url(#bubbleShadow)"
                >
                  <rect
                    x="-50"
                    y="-16"
                    width="100"
                    height="28"
                    rx="14"
                    fill="#0f172a"
                    stroke="#ffffff"
                    strokeWidth="1.5"
                  />
                  <text
                    x="0"
                    y="3"
                    fill="#ffffff"
                    fontSize="13"
                    fontWeight="900"
                    textAnchor="middle"
                    className="font-mono-numbers"
                  >
                    {hoverValueText}
                  </text>
                </g>
              </g>
            )}
          </svg>
        </div>

        {/* Large, High-Legibility Scrub Inspection Bar */}
        {hoveredPoint ? (
          <div className="mt-3 p-3.5 sm:p-4 bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl text-white shadow-lg animate-fade-in flex flex-wrap items-center justify-between gap-4 border border-slate-700">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">Waktu</span>
                <span className="text-base sm:text-lg font-black font-mono-numbers text-white">
                  {new Date(hoveredPoint.timestamp).toLocaleTimeString('id-ID')}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold">
                <Compass className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">Jarak</span>
                <span className="text-base sm:text-lg font-black font-mono-numbers text-cyan-300">
                  {formatDistance(hoveredPoint.cumulativeDistance, unit)} {getDistanceUnitLabel(unit)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                <Gauge className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">Kecepatan Titik</span>
                <span className="text-xl sm:text-2xl font-black font-mono-numbers text-amber-400">
                  {formatSpeed(hoveredPoint.speed, unit)} {getSpeedUnitLabel(unit)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                <Mountain className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">Elevasi Titik</span>
                <span className="text-xl sm:text-2xl font-black font-mono-numbers text-emerald-400">
                  {formatElevation(hoveredPoint.altitude, unit, hasElevation)}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-2 text-center text-xs text-slate-500 flex items-center justify-center gap-1.5 py-1">
            <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
            <span>Sentuh atau geser kursor di atas grafik untuk melihat nilai rinci setiap detik kayuhan.</span>
          </div>
        )}
      </div>
    );
  };

  // Render Kilometer Splits with Large Readable Values
  const renderSplits = () => {
    if (splits.length === 0) {
      return (
        <div className="h-64 flex flex-col items-center justify-center text-slate-500 bg-slate-50/70 border border-dashed border-slate-200 rounded-2xl">
          <Layers className="w-10 h-10 mb-2 stroke-1 text-slate-400" />
          <p className="font-bold text-slate-700">Belum ada split kilometer tercatat.</p>
          <p className="text-xs text-slate-400 mt-1">Split dihitung otomatis setiap kelipatan 1 km perjalanan.</p>
        </div>
      );
    }

    const fastestSplitSpeed = Math.max(...splits.map((s) => s.avgSpeedKmH));

    return (
      <div className="space-y-3">
        <div className="text-xs font-bold text-slate-700 flex items-center justify-between pb-2 border-b border-slate-200 uppercase tracking-wider">
          <span>Kilometer</span>
          <span>Durasi · Pace ({getPaceUnitLabel(unit)}) · Kecepatan</span>
        </div>

        <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
          {splits.map((split) => {
            const isFastest = split.avgSpeedKmH === fastestSplitSpeed;
            const barWidthPercent = Math.min(
              100,
              Math.round((split.avgSpeedKmH / (fastestSplitSpeed || 1)) * 100)
            );
            const splitPaceSec =
              split.paceSecondsPerKm ??
              (split.avgSpeedKmH > 0 ? Math.round(3600 / split.avgSpeedKmH) : null);

            return (
              <div
                key={split.kmIndex}
                className={`p-3.5 rounded-2xl border transition-all ${
                  isFastest
                    ? 'bg-amber-50/90 border-amber-300 text-amber-950 shadow-xs'
                    : 'bg-slate-50/80 border-slate-200 text-slate-800'
                }`}
              >
                <div className="flex items-center justify-between mb-2 gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-base sm:text-lg font-mono-numbers text-slate-900">
                      KM {split.kmIndex}
                    </span>
                    {isFastest && (
                      <span className="text-[11px] text-amber-800 font-bold flex items-center gap-1">
                        <Zap className="w-3 h-3 text-amber-600 fill-amber-500" />
                        <span>Tercepat</span>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 sm:gap-4 font-mono-numbers flex-wrap justify-end">
                    {hasElevation && (split.elevationGainM > 0 || split.elevationLossM > 0) && (
                      <div className="flex items-center gap-1.5 text-xs font-bold">
                        {split.elevationGainM > 0 && (
                          <span className="text-emerald-700">
                            +{formatElevation(split.elevationGainM, unit, true)}
                          </span>
                        )}
                        {split.elevationLossM > 0 && (
                          <span className="text-rose-700">
                            -{formatElevation(split.elevationLossM, unit, true)}
                          </span>
                        )}
                      </div>
                    )}
                    <span className="text-xs sm:text-sm font-bold text-slate-600">
                      {formatDuration(split.durationSeconds)}
                    </span>
                    <span className="font-black text-base sm:text-lg text-emerald-700">
                      {formatPaceFromSecPerKm(splitPaceSec, unit)} /{unit === 'imperial' ? 'mi' : 'km'}
                    </span>
                    <span className="font-bold text-sm sm:text-base text-cyan-700">
                      {formatSpeed(split.avgSpeedKmH, unit)} {getSpeedUnitLabel(unit)}
                    </span>
                  </div>
                </div>

                <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      isFastest ? 'bg-amber-500' : sportType === 'running' ? 'bg-emerald-600' : 'bg-cyan-600'
                    }`}
                    style={{ width: `${barWidthPercent}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Render Time Distribution & Speed Comparisons with Large Numbers
  const renderDistribution = () => {
    const totalSec = stats.totalDurationSeconds || 1;
    const movingPercent = Math.round((stats.movingTimeSeconds / totalSec) * 100);
    const stoppedPercent = 100 - movingPercent;

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
        {/* Moving vs Stopped Time */}
        <div className="p-4 sm:p-5 bg-slate-50/80 rounded-2xl border border-slate-200 flex flex-col justify-between shadow-2xs">
          <div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              Distribusi Waktu Perjalanan
            </div>
            <div className="text-xs sm:text-sm text-slate-600 mb-4">
              Perbandingan waktu bergerak dengan waktu istirahat / berhenti di lampu merah.
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-emerald-700 font-bold text-sm sm:text-base flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block"></span>
                Waktu Bergerak ({movingPercent}%)
              </span>
              <span className="font-mono-numbers text-slate-900 font-black text-xl sm:text-2xl">
                {formatDuration(stats.movingTimeSeconds)}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-rose-700 font-bold text-sm sm:text-base flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-rose-500 inline-block"></span>
                Waktu Berhenti ({stoppedPercent}%)
              </span>
              <span className="font-mono-numbers text-slate-900 font-black text-xl sm:text-2xl">
                {formatDuration(stats.stoppedTimeSeconds)}
              </span>
            </div>

            {/* Split bar */}
            <div className="w-full h-4 bg-slate-200 rounded-full flex overflow-hidden shadow-inner">
              <div
                className="bg-emerald-500 h-full transition-all duration-300"
                style={{ width: `${movingPercent}%` }}
              />
              <div
                className="bg-rose-500 h-full transition-all duration-300"
                style={{ width: `${stoppedPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Speed Comparison: Current vs Avg vs Max */}
        <div className="p-4 sm:p-5 bg-slate-50/80 rounded-2xl border border-slate-200 flex flex-col justify-between shadow-2xs">
          <div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              Perbandingan Kecepatan
            </div>
            <div className="text-xs sm:text-sm text-slate-600 mb-3">
              Tolak ukur performa kecepatan kayuhan road bike.
            </div>
          </div>

          <div className="space-y-3.5">
            {/* Avg Speed */}
            <div>
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-xs font-bold text-slate-600">Kecepatan Rata-rata</span>
                <span className="font-mono-numbers font-black text-lg sm:text-xl text-cyan-700">
                  {formatSpeed(stats.avgSpeedKmH, unit)} {getSpeedUnitLabel(unit)}
                </span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-cyan-600 h-full rounded-full"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.round((stats.avgSpeedKmH / (stats.maxSpeedKmH || 40)) * 100)
                    )}%`,
                  }}
                />
              </div>
            </div>

            {/* Max Speed */}
            <div>
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-xs font-bold text-slate-600">Kecepatan Maksimum</span>
                <span className="font-mono-numbers font-black text-lg sm:text-xl text-amber-600">
                  {formatSpeed(stats.maxSpeedKmH, unit)} {getSpeedUnitLabel(unit)}
                </span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                <div className="bg-amber-500 h-full rounded-full w-full" />
              </div>
            </div>

            {/* Total Climb & Descent */}
            <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-xs sm:text-sm">
              <span className="text-emerald-700 font-black flex items-center gap-1.5 text-base font-mono-numbers">
                <TrendingUp className="w-4 h-4" />
                Naik: {hasElevation ? `+${formatElevation(stats.elevationGainM, unit, true)}` : '--'}
              </span>
              <span className="text-rose-700 font-black flex items-center gap-1.5 text-base font-mono-numbers">
                <TrendingUp className="w-4 h-4 rotate-180" />
                Turun: {hasElevation ? `-${formatElevation(stats.elevationLossM, unit, true)}` : '--'}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className="bg-white border border-slate-200/90 rounded-3xl p-4 md:p-6 shadow-sm text-slate-900"
    >
      {/* Header and Mode Selector Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
        <div>
          <h3 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
            <Activity className="w-5 h-5 text-cyan-600" />
            Statistik & Grafik Aktivitas
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Analisis kecepatan, profil elevasi tanjakan, dan split kilometer performa kayuhan
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-2xl overflow-x-auto border border-slate-200">
          <button
            onClick={() => setActiveMode('elev_dist')}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap shrink-0 cursor-pointer ${
              activeMode === 'elev_dist'
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Elevasi / Jarak
          </button>
          <button
            onClick={() => setActiveMode('speed_dist')}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap shrink-0 cursor-pointer ${
              activeMode === 'speed_dist'
                ? 'bg-white text-cyan-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Kecepatan / Jarak
          </button>
          <button
            onClick={() => setActiveMode('speed_time')}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap shrink-0 cursor-pointer ${
              activeMode === 'speed_time'
                ? 'bg-white text-cyan-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Kecepatan / Waktu
          </button>
          <button
            onClick={() => setActiveMode('splits')}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap shrink-0 cursor-pointer ${
              activeMode === 'splits'
                ? 'bg-white text-amber-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Splits ({splits.length})
          </button>
          <button
            onClick={() => setActiveMode('distribution')}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap shrink-0 cursor-pointer ${
              activeMode === 'distribution'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Distribusi
          </button>
        </div>
      </div>

      {/* Prominent High-Visibility Telemetry Strip (Large Numbers for Easy Reading) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3.5 mb-4">
        {activeMode === 'elev_dist' ? (
          <>
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 sm:p-3.5 flex flex-col justify-between">
              <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                <span>Puncak Elevasi</span>
                <Mountain className="w-3.5 h-3.5 text-emerald-600" />
              </span>
              <span className="text-2xl sm:text-3xl font-black font-mono-numbers text-slate-900 mt-1">
                {formatElevation(extremes.maxActualElev, unit, hasElevation)}
              </span>
            </div>

            <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-3 sm:p-3.5 flex flex-col justify-between">
              <span className="text-[10px] sm:text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center justify-between">
                <span>Total Tanjakan</span>
                <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
              </span>
              <span className="text-2xl sm:text-3xl font-black font-mono-numbers text-emerald-700 mt-1">
                {hasElevation ? `+${formatElevation(stats.elevationGainM, unit, true)}` : '--'}
              </span>
            </div>

            <div className="bg-rose-50/70 border border-rose-200 rounded-2xl p-3 sm:p-3.5 flex flex-col justify-between">
              <span className="text-[10px] sm:text-xs font-bold text-rose-800 uppercase tracking-wider flex items-center justify-between">
                <span>Total Turunan</span>
                <TrendingUp className="w-3.5 h-3.5 text-rose-600 rotate-180" />
              </span>
              <span className="text-2xl sm:text-3xl font-black font-mono-numbers text-rose-700 mt-1">
                {hasElevation ? `-${formatElevation(stats.elevationLossM, unit, true)}` : '--'}
              </span>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 sm:p-3.5 flex flex-col justify-between">
              <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                <span>Elevasi Terendah</span>
                <Layers className="w-3.5 h-3.5 text-cyan-600" />
              </span>
              <span className="text-2xl sm:text-3xl font-black font-mono-numbers text-slate-700 mt-1">
                {formatElevation(extremes.minActualElev, unit, hasElevation)}
              </span>
            </div>
          </>
        ) : activeMode === 'splits' ? (
          <>
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 sm:p-3.5 flex flex-col justify-between">
              <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">
                Total Split
              </span>
              <span className="text-2xl sm:text-3xl font-black font-mono-numbers text-slate-900 mt-1">
                {splits.length} KM
              </span>
            </div>

            <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-3 sm:p-3.5 flex flex-col justify-between">
              <span className="text-[10px] sm:text-xs font-bold text-amber-800 uppercase tracking-wider flex items-center justify-between">
                <span>{sportType === 'running' ? 'Best Pace' : 'Split Tercepat'}</span>
                <Zap className="w-3.5 h-3.5 text-amber-600 fill-amber-500" />
              </span>
              <span className="text-2xl sm:text-3xl font-black font-mono-numbers text-amber-600 mt-1">
                {sportType === 'running'
                  ? formatPaceFromSecPerKm(stats.bestPaceSecPerKm, unit, true)
                  : splits.length > 0
                  ? `${formatSpeed(Math.max(...splits.map((s) => s.avgSpeedKmH)), unit)} ${getSpeedUnitLabel(unit)}`
                  : '--'}
              </span>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 sm:p-3.5 flex flex-col justify-between">
              <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">
                Total Jarak
              </span>
              <span className="text-2xl sm:text-3xl font-black font-mono-numbers text-slate-900 mt-1">
                {formatDistance(stats.distanceKm, unit)} {getDistanceUnitLabel(unit)}
              </span>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 sm:p-3.5 flex flex-col justify-between">
              <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">
                Total Durasi
              </span>
              <span className="text-2xl sm:text-3xl font-black font-mono-numbers text-slate-900 mt-1">
                {formatDuration(stats.totalDurationSeconds)}
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-3 sm:p-3.5 flex flex-col justify-between">
              <span className="text-[10px] sm:text-xs font-bold text-amber-800 uppercase tracking-wider flex items-center justify-between">
                <span>Kec. Maksimum</span>
                <Gauge className="w-3.5 h-3.5 text-amber-600" />
              </span>
              <span className="text-2xl sm:text-3xl font-black font-mono-numbers text-amber-600 mt-1">
                {formatSpeed(stats.maxSpeedKmH, unit, hasRecordedPoints)}{' '}
                <span className="text-sm font-bold text-amber-700">{getSpeedUnitLabel(unit)}</span>
              </span>
            </div>

            <div className="bg-cyan-50/70 border border-cyan-200 rounded-2xl p-3 sm:p-3.5 flex flex-col justify-between">
              <span className="text-[10px] sm:text-xs font-bold text-cyan-800 uppercase tracking-wider flex items-center justify-between">
                <span>Kec. Rata-Rata</span>
                <Activity className="w-3.5 h-3.5 text-cyan-600" />
              </span>
              <span className="text-2xl sm:text-3xl font-black font-mono-numbers text-cyan-700 mt-1">
                {formatSpeed(stats.avgSpeedKmH, unit, hasRecordedPoints)}{' '}
                <span className="text-sm font-bold text-cyan-700">{getSpeedUnitLabel(unit)}</span>
              </span>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 sm:p-3.5 flex flex-col justify-between">
              <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                <span>Total Jarak</span>
                <Compass className="w-3.5 h-3.5 text-slate-600" />
              </span>
              <span className="text-2xl sm:text-3xl font-black font-mono-numbers text-slate-900 mt-1">
                {formatDistance(stats.distanceKm, unit)}{' '}
                <span className="text-sm font-bold text-slate-500">{getDistanceUnitLabel(unit)}</span>
              </span>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 sm:p-3.5 flex flex-col justify-between">
              <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                <span>Durasi Bergerak</span>
                <Clock className="w-3.5 h-3.5 text-slate-600" />
              </span>
              <span className="text-2xl sm:text-3xl font-black font-mono-numbers text-slate-900 mt-1">
                {formatDuration(stats.movingTimeSeconds)}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Main Chart Content */}
      {activeMode === 'splits'
        ? renderSplits()
        : activeMode === 'distribution'
        ? renderDistribution()
        : renderLineChart()}
    </div>
  );
};
