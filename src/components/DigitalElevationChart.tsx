import React, { useState, useMemo, useRef } from 'react';
import { DigitalRoute, DigitalRoutePoint } from '../types/cycling';
import {
  TrendingUp,
  Mountain,
  Gauge,
  Compass,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  MapPin,
  CheckCircle2,
} from 'lucide-react';

interface DigitalElevationChartProps {
  route: DigitalRoute;
  onHoverPoint?: (point: DigitalRoutePoint | null, index: number | null) => void;
  activePointIndex?: number | null;
  compact?: boolean;
}

export const DigitalElevationChart: React.FC<DigitalElevationChartProps> = ({
  route,
  onHoverPoint,
  activePointIndex,
  compact = false,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const points = route.points;

  // Compute elevation boundaries
  const { minAlt, maxAlt, totalDist, altRange } = useMemo(() => {
    if (!points || points.length === 0) {
      return { minAlt: 0, maxAlt: 100, totalDist: 10, altRange: 100 };
    }
    let min = points[0].altitude;
    let max = points[0].altitude;
    points.forEach((p) => {
      if (p.altitude < min) min = p.altitude;
      if (p.altitude > max) max = p.altitude;
    });

    // Provide buffer
    const range = Math.max(30, max - min);
    const paddedMin = Math.max(0, Math.floor((min - range * 0.1) / 10) * 10);
    const paddedMax = Math.ceil((max + range * 0.15) / 10) * 10;
    const finalDist = points[points.length - 1].distanceKm || route.distanceKm || 1;

    return {
      minAlt: paddedMin,
      maxAlt: paddedMax,
      totalDist: finalDist,
      altRange: Math.max(20, paddedMax - paddedMin),
    };
  }, [points, route.distanceKm]);

  // SVG dimensions
  const svgWidth = 800;
  const svgHeight = compact ? 140 : 200;
  const paddingLeft = 45;
  const paddingRight = 20;
  const paddingTop = 25;
  const paddingBottom = 30;

  const chartWidth = svgWidth - paddingLeft - paddingRight;
  const chartHeight = svgHeight - paddingTop - paddingBottom;

  // Convert (distance, altitude) to SVG coordinates
  const getCoordinates = (dist: number, alt: number) => {
    const x = paddingLeft + (dist / totalDist) * chartWidth;
    const y = paddingTop + chartHeight - ((alt - minAlt) / altRange) * chartHeight;
    return { x, y };
  };

  // Generate SVG path for elevation polygon and line
  const { pathD, areaD, segments } = useMemo(() => {
    if (!points || points.length < 2) {
      return { pathD: '', areaD: '', segments: [] };
    }

    const coords = points.map((p) => getCoordinates(p.distanceKm, p.altitude));

    // Smooth spline or polyline
    const pathParts: string[] = [`M ${coords[0].x} ${coords[0].y}`];
    for (let i = 1; i < coords.length; i++) {
      pathParts.push(`L ${coords[i].x} ${coords[i].y}`);
    }
    const pathD = pathParts.join(' ');

    // Area path for gradient fill
    const first = coords[0];
    const last = coords[coords.length - 1];
    const bottomY = paddingTop + chartHeight;
    const areaD = `${pathD} L ${last.x} ${bottomY} L ${first.x} ${bottomY} Z`;

    // Segment color based on gradient
    const segmentList = [];
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const c1 = coords[i];
      const c2 = coords[i + 1];

      const grad = p2.gradientPercent;
      let strokeColor = '#10b981'; // Flat / downhill (green)
      if (grad >= 9.0) {
        strokeColor = '#e11d48'; // Extreme steep (red/rose)
      } else if (grad >= 6.0) {
        strokeColor = '#f97316'; // Punchy climb (orange)
      } else if (grad >= 3.0) {
        strokeColor = '#eab308'; // Moderate climb (yellow)
      } else if (grad >= 1.0) {
        strokeColor = '#06b6d4'; // False flat (cyan)
      }

      segmentList.push({
        x1: c1.x,
        y1: c1.y,
        x2: c2.x,
        y2: c2.y,
        color: strokeColor,
        grad,
      });
    }

    return { pathD, areaD, segments: segmentList };
  }, [points, chartWidth, chartHeight, minAlt, altRange, totalDist]);

  // Horizontal elevation grid lines
  const gridLines = useMemo(() => {
    const steps = compact ? 3 : 4;
    const lines = [];
    for (let i = 0; i <= steps; i++) {
      const altValue = Math.round(minAlt + (altRange * i) / steps);
      const y = paddingTop + chartHeight - (i / steps) * chartHeight;
      lines.push({ altValue, y });
    }
    return lines;
  }, [minAlt, altRange, chartHeight, compact]);

  // Distance marks along bottom
  const distanceMarks = useMemo(() => {
    const marks = [];
    const count = compact ? 4 : 6;
    for (let i = 0; i <= count; i++) {
      const d = (totalDist * i) / count;
      const x = paddingLeft + (i / count) * chartWidth;
      marks.push({ dist: Math.round(d * 10) / 10, x });
    }
    return marks;
  }, [totalDist, chartWidth, compact]);

  // Handle pointer scrub
  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!containerRef.current || points.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const relativeX = (clientX / rect.width) * svgWidth;

    // Find nearest point
    const clampedX = Math.max(paddingLeft, Math.min(paddingLeft + chartWidth, relativeX));
    const targetDist = ((clampedX - paddingLeft) / chartWidth) * totalDist;

    let closestIdx = 0;
    let minDist = 999999;
    points.forEach((p, idx) => {
      const diff = Math.abs(p.distanceKm - targetDist);
      if (diff < minDist) {
        minDist = diff;
        closestIdx = idx;
      }
    });

    setHoverIndex(closestIdx);
    onHoverPoint?.(points[closestIdx], closestIdx);
  };

  const handlePointerLeave = () => {
    setHoverIndex(null);
    onHoverPoint?.(null, null);
  };

  const activeIdx = hoverIndex !== null ? hoverIndex : activePointIndex !== null && activePointIndex !== undefined ? activePointIndex : null;
  const currentHoveredPoint = activeIdx !== null && points[activeIdx] ? points[activeIdx] : null;
  const hoverCoord = currentHoveredPoint ? getCoordinates(currentHoveredPoint.distanceKm, currentHoveredPoint.altitude) : null;

  // Climb category color badge
  const getClimbCategoryBadge = () => {
    const cat = route.climbCategory || 'Datar / Flat';
    if (cat === 'HC') return 'bg-rose-500/20 text-rose-300 border-rose-500/40 ring-1 ring-rose-500/30';
    if (cat === 'Cat 1') return 'bg-orange-500/20 text-orange-300 border-orange-500/40';
    if (cat === 'Cat 2') return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    if (cat === 'Cat 3') return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40';
    if (cat === 'Cat 4') return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
    return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 text-white shadow-xl flex flex-col gap-3">
      {/* Header Metric Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Mountain className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                Profil Elevasi Digital (DEM)
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getClimbCategoryBadge()}`}>
                {route.climbCategory || 'Datar'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Analisis gradien tanjakan & permukaan jalan khusus road bike
            </p>
          </div>
        </div>

        {/* Surface & Traffic Pill */}
        <div className="flex items-center gap-1.5 text-[11px] text-slate-300 bg-slate-950/80 px-2.5 py-1 rounded-lg border border-slate-800">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>{route.surfaceSuitability?.smoothAsphaltPercent ?? 95}% Aspal Mulus</span>
          <span className="text-slate-600">|</span>
          <span className="text-cyan-300">{route.surfaceSuitability?.trafficLevel ?? 'Rendah'}</span>
        </div>
      </div>

      {/* Numerical Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="bg-slate-950/70 p-2 rounded-xl border border-slate-800/70 flex flex-col">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <ArrowUpRight className="w-3 h-3 text-emerald-400" /> Total Naik (Gain)
          </span>
          <span className="text-base font-extrabold text-emerald-400 font-mono mt-0.5">
            +{route.elevationGainM} m
          </span>
          <span className="text-[10px] text-slate-500">Turun: -{route.elevationLossM} m</span>
        </div>

        <div className="bg-slate-950/70 p-2 rounded-xl border border-slate-800/70 flex flex-col">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <Gauge className="w-3 h-3 text-rose-400" /> Gradien Maks
          </span>
          <span className="text-base font-extrabold text-rose-400 font-mono mt-0.5">
            {route.maxGradientPercent}%
          </span>
          <span className="text-[10px] text-slate-500">Rata-rata: {route.avgGradientPercent}%</span>
        </div>

        <div className="bg-slate-950/70 p-2 rounded-xl border border-slate-800/70 flex flex-col">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <TrendingUp className="w-3 h-3 text-cyan-400" /> Puncak Elevasi
          </span>
          <span className="text-base font-extrabold text-cyan-300 font-mono mt-0.5">
            {route.maxAltitudeM} m
          </span>
          <span className="text-[10px] text-slate-500">Dasar: {route.minAltitudeM} m dpl</span>
        </div>

        <div className="bg-slate-950/70 p-2 rounded-xl border border-slate-800/70 flex flex-col">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <Compass className="w-3 h-3 text-amber-400" /> Estimasi Gowes
          </span>
          <span className="text-base font-extrabold text-amber-300 font-mono mt-0.5">
            ~{route.estimatedTimeMinutes} menit
          </span>
          <span className="text-[10px] text-slate-500">Pace 25-30 km/h</span>
        </div>
      </div>

      {/* Interactive SVG Chart Container */}
      <div
        ref={containerRef}
        className="relative w-full select-none touch-none bg-slate-950/90 rounded-xl border border-slate-800/80 p-1.5 overflow-hidden"
      >
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-auto cursor-crosshair block"
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
        >
          <defs>
            {/* Elevation Area Fill Gradient */}
            <linearGradient id={`demGradient_${route.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.38" />
              <stop offset="60%" stopColor="#0ea5e9" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#0284c7" stopOpacity="0.0" />
            </linearGradient>

            {/* Glowing filter for active needle */}
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Grid lines & Alt values */}
          {gridLines.map((line, idx) => (
            <g key={`grid_${idx}`}>
              <line
                x1={paddingLeft}
                y1={line.y}
                x2={paddingLeft + chartWidth}
                y2={line.y}
                stroke="#334155"
                strokeDasharray="3 3"
                strokeWidth="0.8"
                strokeOpacity="0.6"
              />
              <text
                x={paddingLeft - 8}
                y={line.y + 3.5}
                textAnchor="end"
                className="fill-slate-500 text-[9px] font-mono font-medium"
              >
                {line.altValue}m
              </text>
            </g>
          ))}

          {/* Elevation Area Background */}
          {areaD && (
            <path
              d={areaD}
              fill={`url(#demGradient_${route.id})`}
            />
          )}

          {/* Base elevation line */}
          {pathD && (
            <path
              d={pathD}
              fill="none"
              stroke="#0ea5e9"
              strokeWidth="1.5"
              strokeOpacity="0.4"
            />
          )}

          {/* Multi-colored Gradient Segments (shows steepness dynamically) */}
          {segments.map((seg, i) => (
            <line
              key={`seg_${i}`}
              x1={seg.x1}
              y1={seg.y1}
              x2={seg.x2}
              y2={seg.y2}
              stroke={seg.color}
              strokeWidth="3.2"
              strokeLinecap="round"
            />
          ))}

          {/* Significant Landmark / Peak Dots */}
          {points.map((p, idx) => {
            if (!p.isPeak && !p.name) return null;
            const ptCoord = getCoordinates(p.distanceKm, p.altitude);
            if (p.isPeak) {
              return (
                <g key={`peak_${idx}`}>
                  <circle
                    cx={ptCoord.x}
                    cy={ptCoord.y}
                    r="4.5"
                    className="fill-rose-500 stroke-white stroke-2"
                  />
                  <text
                    x={ptCoord.x}
                    y={ptCoord.y - 8}
                    textAnchor="middle"
                    className="fill-rose-400 text-[10px] font-bold font-mono"
                  >
                    KOM {p.altitude}m
                  </text>
                </g>
              );
            }
            return null;
          })}

          {/* Distance Axis Marks */}
          {distanceMarks.map((m, idx) => (
            <g key={`dist_${idx}`}>
              <line
                x1={m.x}
                y1={paddingTop + chartHeight}
                x2={m.x}
                y2={paddingTop + chartHeight + 4}
                stroke="#475569"
                strokeWidth="1"
              />
              <text
                x={m.x}
                y={paddingTop + chartHeight + 16}
                textAnchor="middle"
                className="fill-slate-400 text-[9px] font-mono"
              >
                {m.dist}k
              </text>
            </g>
          ))}

          {/* Interactive Scrub Needle */}
          {hoverCoord && currentHoveredPoint && (
            <g>
              {/* Vertical Guide Line */}
              <line
                x1={hoverCoord.x}
                y1={paddingTop}
                x2={hoverCoord.x}
                y2={paddingTop + chartHeight}
                stroke="#38bdf8"
                strokeWidth="1.5"
                strokeDasharray="2 2"
              />

              {/* Point Indicator Glow Dot */}
              <circle
                cx={hoverCoord.x}
                cy={hoverCoord.y}
                r="7"
                className="fill-cyan-400/30"
              />
              <circle
                cx={hoverCoord.x}
                cy={hoverCoord.y}
                r="4"
                className="fill-cyan-400 stroke-white stroke-2"
                filter="url(#glow)"
              />
            </g>
          )}
        </svg>

        {/* Floating Tooltip Needle Box */}
        {currentHoveredPoint && hoverCoord && (
          <div
            className="absolute pointer-events-none z-10 transition-transform duration-75 bg-slate-900/95 border border-cyan-500/50 rounded-xl px-2.5 py-1.5 shadow-2xl backdrop-blur-md text-[11px] text-white flex flex-col gap-0.5"
            style={{
              left: `${Math.min(75, Math.max(25, (hoverCoord.x / svgWidth) * 100))}%`,
              top: '12px',
              transform: 'translateX(-50%)',
            }}
          >
            <div className="flex items-center gap-2 font-mono">
              <span className="font-bold text-cyan-400">{currentHoveredPoint.distanceKm} km</span>
              <span className="text-slate-400">|</span>
              <span className="font-extrabold text-white">{currentHoveredPoint.altitude} mdpl</span>
              <span className="text-slate-400">|</span>
              <span
                className={`font-bold ${
                  currentHoveredPoint.gradientPercent >= 6
                    ? 'text-rose-400'
                    : currentHoveredPoint.gradientPercent >= 3
                    ? 'text-amber-400'
                    : 'text-emerald-400'
                }`}
              >
                {currentHoveredPoint.gradientPercent > 0 ? '+' : ''}
                {currentHoveredPoint.gradientPercent}% slope
              </span>
            </div>
            {currentHoveredPoint.name && (
              <span className="text-[10px] text-slate-300 font-sans flex items-center gap-1 truncate max-w-[220px]">
                <MapPin className="w-2.5 h-2.5 text-cyan-400 shrink-0" />
                {currentHoveredPoint.name}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Slope / Gradient Color Legend Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400 px-1 pt-1">
        <span className="font-semibold text-slate-500">Tingkat Kemiringan (Slope %):</span>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
            <span>&lt; 3% Datar / Turun</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block"></span>
            <span>3–6% Rolling</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block"></span>
            <span>6–9% Tanjakan</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block"></span>
            <span>&gt; 9% Dinding Terjal</span>
          </div>
        </div>
      </div>
    </div>
  );
};
