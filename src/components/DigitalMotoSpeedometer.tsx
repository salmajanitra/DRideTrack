import React, { useMemo } from 'react';
import {
  ActivityStats,
  GPSStatus,
  SportType,
  TrackingState,
  UnitSystem,
} from '../types/cycling';
import {
  formatDistance,
  formatDuration,
  formatSpeed,
  getDistanceUnitLabel,
  getSpeedUnitLabel,
} from '../utils/units';
import { Bike, Footprints, Gauge, Pause, Wifi, WifiOff } from 'lucide-react';

interface DigitalMotoSpeedometerProps {
  stats: ActivityStats;
  unit: UnitSystem;
  sportType: SportType;
  trackingState: TrackingState;
  gpsStatus: GPSStatus;
  gpsAccuracyM: number | null;
  isOnline: boolean;
  isAutoPaused?: boolean;
}

const TOTAL_SEGMENTS = 32;

export const DigitalMotoSpeedometer: React.FC<DigitalMotoSpeedometerProps> = ({
  stats,
  unit,
  sportType,
  trackingState,
  gpsStatus,
  gpsAccuracyM,
  isOnline,
  isAutoPaused = false,
}) => {
  const isRunning = sportType === 'running';
  const hasRecordedPoints = stats.recordedPointsCount > 0;
  const hasSpeed = Boolean(stats.hasSpeedData || hasRecordedPoints);

  const conversionFactor = unit === 'imperial' ? 0.621371 : 1;
  const rawDisplaySpeed = hasSpeed ? Math.max(0, stats.currentSpeedKmH * conversionFactor) : null;
  const roundedSpeed = rawDisplaySpeed !== null ? Math.round(rawDisplaySpeed * 10) / 10 : null;
  const maxDisplaySpeed = hasRecordedPoints ? Math.max(0, stats.maxSpeedKmH * conversionFactor) : 0;

  // Dynamic motorcycle speedometer scale ceiling (adapts cleanly if rider sprints faster)
  const scaleMax = useMemo(() => {
    if (isRunning) {
      return unit === 'imperial' ? 16 : 24;
    }
    const baseMax = unit === 'imperial' ? 40 : 60;
    const highest = Math.max(roundedSpeed ?? 0, maxDisplaySpeed);
    if (highest > baseMax) {
      return Math.ceil(highest / 20) * 20;
    }
    return baseMax;
  }, [isRunning, unit, roundedSpeed, maxDisplaySpeed]);

  // Split speed into giant integer digits and tenth-decimal digit like a real digital motorcycle cluster
  const { integerDigits, decimalDigit, ghostDigits } = useMemo(() => {
    if (roundedSpeed === null || Number.isNaN(roundedSpeed)) {
      return {
        integerDigits: '--',
        decimalDigit: '-',
        ghostDigits: '88',
      };
    }
    const fixed = roundedSpeed.toFixed(1);
    const [intStr, decStr] = fixed.split('.');
    const ghost = intStr.length >= 3 ? '888' : intStr.length === 2 ? '88' : '8';
    return {
      integerDigits: intStr,
      decimalDigit: decStr ?? '0',
      ghostDigits: ghost,
    };
  }, [roundedSpeed]);

  const activeSegments = useMemo(() => {
    if (roundedSpeed === null || roundedSpeed <= 0) return 0;
    const ratio = Math.min(1, roundedSpeed / scaleMax);
    return Math.max(roundedSpeed > 0.1 ? 1 : 0, Math.round(ratio * TOTAL_SEGMENTS));
  }, [roundedSpeed, scaleMax]);

  const peakSegmentIndex = useMemo(() => {
    if (!hasRecordedPoints || maxDisplaySpeed <= 0.2) return null;
    const ratio = Math.min(1, maxDisplaySpeed / scaleMax);
    return Math.min(TOTAL_SEGMENTS - 1, Math.max(0, Math.round(ratio * TOTAL_SEGMENTS) - 1));
  }, [hasRecordedPoints, maxDisplaySpeed, scaleMax]);

  // Precompute hockey-stick motorcycle bar-graph segment polygons in SVG space (640 x 122)
  const segments = useMemo(() => {
    return Array.from({ length: TOTAL_SEGMENTS }, (_, i) => {
      const t = i / (TOTAL_SEGMENTS - 1);
      // Hockey-stick curve: rises steeply over first 32% (left ramp), then levels across top shelf
      const rampT = Math.min(1, t / 0.34);
      const easeRamp = 1 - Math.pow(1 - rampT, 2.1);
      const shelfLift = t > 0.34 ? ((t - 0.34) / 0.66) * 6 : 0;

      const yBottom = 94 - easeRamp * 48 - shelfLift;
      const segHeight = 17 + t * 14;
      const yTop = yBottom - segHeight;

      const xStart = 24 + i * 18.4;
      const segWidth = 12.6;
      const slant = 6.5;

      // 4-point slanted parallelogram for crisp digital LCD segment look
      const points = [
        `${(xStart + slant).toFixed(1)},${yTop.toFixed(1)}`,
        `${(xStart + segWidth + slant).toFixed(1)},${yTop.toFixed(1)}`,
        `${(xStart + segWidth).toFixed(1)},${yBottom.toFixed(1)}`,
        `${xStart.toFixed(1)},${yBottom.toFixed(1)}`,
      ].join(' ');

      let activeFill = '#22d3ee'; // Cyan cruise zone
      if (t >= 0.82) {
        activeFill = '#f43f5e'; // Redline sprint zone
      } else if (t >= 0.62) {
        activeFill = '#fbbf24'; // High-tempo amber zone
      } else if (t >= 0.36) {
        activeFill = '#34d399'; // Optimal emerald zone
      }

      return {
        index: i,
        points,
        activeFill,
        centerX: xStart + segWidth / 2 + slant / 2,
        yTop,
        yBottom,
      };
    });
  }, []);

  // Scale tick labels along the motorcycle bar (e.g., 0, 10, 20, 30, 40, 50, 60)
  const scaleTicks = useMemo(() => {
    const tickCount = isRunning ? 4 : 6;
    return Array.from({ length: tickCount + 1 }, (_, idx) => {
      const frac = idx / tickCount;
      const value = Math.round(frac * scaleMax);
      const segIdx = Math.min(TOTAL_SEGMENTS - 1, Math.round(frac * (TOTAL_SEGMENTS - 1)));
      const seg = segments[segIdx];
      return {
        value,
        x: seg.centerX - 2,
        y: seg.yBottom + 17,
      };
    });
  }, [isRunning, scaleMax, segments]);

  // Real GPS Signal Bars (0..4) derived strictly from actual GPS status and accuracy
  const gpsSignalBars = useMemo(() => {
    if (gpsStatus === 'denied' || gpsStatus === 'unavailable' || gpsStatus === 'lost') return 0;
    if (gpsStatus === 'searching') return 1;
    if (gpsAccuracyM === null) return gpsStatus === 'locked' ? 3 : 2;
    if (gpsAccuracyM <= 12) return 4;
    if (gpsAccuracyM <= 25) return 3;
    if (gpsAccuracyM <= 50) return 2;
    return 1;
  }, [gpsStatus, gpsAccuracyM]);

  // Speed Zone Tell-Tale (derived strictly from real speed)
  const speedZone = useMemo(() => {
    if (trackingState === 'paused' || isAutoPaused) {
      return { label: isAutoPaused ? 'AUTO-PAUSE' : 'PAUSED', color: 'text-amber-400 border-amber-500/40 bg-amber-950/50' };
    }
    if (!hasSpeed || roundedSpeed === null || roundedSpeed < 0.5) {
      return {
        label: trackingState === 'recording' ? 'IDLE 0.0' : 'STANDBY',
        color: 'text-slate-400 border-slate-700 bg-slate-900/90',
      };
    }
    const ratio = roundedSpeed / scaleMax;
    if (ratio >= 0.8) {
      return { label: 'SPRINT / MAX', color: 'text-rose-400 border-rose-500/50 bg-rose-950/60' };
    }
    if (ratio >= 0.55) {
      return { label: 'SPORT / TEMPO', color: 'text-amber-300 border-amber-500/40 bg-amber-950/50' };
    }
    return { label: 'ECO / CRUISE', color: 'text-emerald-400 border-emerald-500/40 bg-emerald-950/50' };
  }, [trackingState, isAutoPaused, hasSpeed, roundedSpeed, scaleMax]);

  const speedUnit = getSpeedUnitLabel(unit).toUpperCase();
  const distUnit = getDistanceUnitLabel(unit).toUpperCase();

  return (
    <div className="w-full select-none">
      {/* Outer Sculpted Motorcycle Cockpit Bezel */}
      <div className="w-full rounded-[28px] bg-gradient-to-b from-slate-700 via-slate-900 to-slate-950 p-1.5 sm:p-2 shadow-xl border border-slate-700/80">
        {/* Inner High-Contrast Negative-LCD / TFT Instrument Panel */}
        <div className="relative w-full rounded-[22px] bg-slate-950 text-white px-4 py-4 sm:px-6 sm:py-5 md:px-7 md:py-6 overflow-hidden border border-slate-800/90 moto-lcd-grid">
          {/* Subtle Top Cockpit Visor Sheen */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-cyan-500/[0.07] to-transparent"
          />

          {/* TOP INSTRUMENT TELL-TALE BAR (Motorcycle Cluster Indicators) */}
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-800/90 text-[11px] font-bold tracking-wider uppercase">
            {/* Left Tell-Tales: Mode + Active Recording Lamp */}
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-extrabold ${
                  isRunning
                    ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                    : 'bg-cyan-950/60 border-cyan-500/40 text-cyan-300'
                }`}
              >
                {isRunning ? <Footprints className="w-3.5 h-3.5" /> : <Bike className="w-3.5 h-3.5" />}
                <span>{isRunning ? 'RUN' : 'RIDE'}</span>
              </span>

              <span className={`px-2.5 py-1 rounded-lg border font-mono-numbers text-[10px] sm:text-[11px] ${speedZone.color}`}>
                {speedZone.label}
              </span>

              {trackingState === 'recording' && !isAutoPaused && (
                <span className="inline-flex items-center gap-1.5 text-emerald-400 font-extrabold text-[10px] sm:text-[11px]">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>REC</span>
                </span>
              )}
              {(trackingState === 'paused' || isAutoPaused) && (
                <span className="inline-flex items-center gap-1 text-amber-400 font-extrabold text-[10px] sm:text-[11px]">
                  <Pause className="w-3 h-3 fill-current" />
                  <span>{isAutoPaused ? 'AUTO-PAUSE' : 'HOLD'}</span>
                </span>
              )}
            </div>

            {/* Right Tell-Tales: Network + Stepped GPS Signal Bars */}
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex items-center gap-1 text-[10px] sm:text-[11px] ${
                  isOnline ? 'text-slate-300' : 'text-amber-400'
                }`}
              >
                {isOnline ? <Wifi className="w-3.5 h-3.5 text-cyan-400" /> : <WifiOff className="w-3.5 h-3.5" />}
                <span className="hidden min-[420px]:inline">{isOnline ? 'NET' : 'OFFLINE'}</span>
              </span>

              <div className="flex items-center gap-1.5" title={`Akurasi GPS: ${gpsAccuracyM !== null ? `±${gpsAccuracyM}m` : '--'}`}>
                <span className="text-[10px] text-slate-400 font-mono-numbers">
                  GPS {gpsAccuracyM !== null ? `±${gpsAccuracyM}m` : '--'}
                </span>
                <div className="flex items-end gap-0.5 h-3.5" aria-hidden="true">
                  {[1, 2, 3, 4].map((bar) => {
                    const lit = bar <= gpsSignalBars;
                    const barColor =
                      gpsSignalBars >= 3
                        ? 'bg-emerald-400'
                        : gpsSignalBars === 2
                        ? 'bg-amber-400'
                        : 'bg-rose-500';
                    const heightClass =
                      bar === 1 ? 'h-1.5' : bar === 2 ? 'h-2' : bar === 3 ? 'h-2.5' : 'h-3.5';
                    return (
                      <span
                        key={bar}
                        className={`w-1 rounded-[1px] transition-opacity duration-200 ${heightClass} ${
                          lit ? barColor : 'bg-slate-800'
                        }`}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* UPPER HOCKEY-STICK STEPPED MOTORCYCLE SPEED BAR-GRAPH */}
          <div className="relative z-10 mt-2 sm:mt-3 w-full">
            <svg
              viewBox="0 0 640 120"
              className="w-full h-[74px] min-[400px]:h-[84px] sm:h-[102px] md:h-[112px] overflow-visible"
              role="img"
              aria-label={`Bar speedometer digital ${roundedSpeed ?? 0} dari ${scaleMax} ${speedUnit}`}
            >
              {/* Subtle precision top & bottom guide rails */}
              <path
                d="M 22 99 Q 125 49 235 47 L 615 41"
                fill="none"
                stroke="#1e293b"
                strokeWidth="2"
              />

              {/* 32 Discrete Angled Digital LCD Segments */}
              {segments.map((seg) => {
                const isLit = seg.index < activeSegments;
                const isPeak = peakSegmentIndex !== null && seg.index === peakSegmentIndex;
                return (
                  <g key={seg.index}>
                    <polygon
                      points={seg.points}
                      fill={isLit ? seg.activeFill : '#0f172a'}
                      stroke={isLit ? seg.activeFill : '#1e293b'}
                      strokeWidth={isLit ? '0.6' : '1'}
                      opacity={isLit ? 1 : 0.9}
                    />
                    {/* Peak / Max Speed Hold Indicator Tick above segment */}
                    {isPeak && (
                      <polygon
                        points={`${(seg.centerX - 4).toFixed(1)},${(seg.yTop - 9).toFixed(1)} ${(
                          seg.centerX + 4
                        ).toFixed(1)},${(seg.yTop - 9).toFixed(1)} ${seg.centerX.toFixed(1)},${(
                          seg.yTop - 2
                        ).toFixed(1)}`}
                        fill="#fbbf24"
                      />
                    )}
                  </g>
                );
              })}

              {/* Scale Numerals along the Hockey-Stick Curve */}
              {scaleTicks.map((tick) => (
                <text
                  key={tick.value}
                  x={tick.x}
                  y={tick.y}
                  textAnchor="middle"
                  className="fill-slate-400 font-moto-digital text-[13px] font-bold"
                >
                  {tick.value}
                </text>
              ))}

              {/* Right-corner scale label */}
              <text
                x="614"
                y="113"
                textAnchor="end"
                className="fill-cyan-500/80 font-moto-digital text-[10px] font-bold tracking-widest"
              >
                SCALE {scaleMax} {speedUnit}
              </text>
            </svg>
          </div>

          {/* CENTERPIECE: OVERSIZED DIGITAL MOTORCYCLE SPEED NUMERALS */}
          <div className="relative z-10 flex items-center justify-center py-1 sm:py-2 md:py-3">
            <div className="flex items-end justify-center gap-2.5 sm:gap-4">
              {/* Giant Main Integer Speed Readout with Subtle 7-Segment Ghost Backplate */}
              <div className="relative inline-flex items-center justify-end leading-none">
                {/* Dim LCD 88/888 Ghost Backplate */}
                <span
                  aria-hidden="true"
                  className="font-moto-digital italic font-bold tracking-tight text-slate-900/90 text-[6.75rem] min-[390px]:text-[7.75rem] sm:text-[10rem] md:text-[11.5rem] lg:text-[10.5rem] xl:text-[12rem] leading-[0.82] select-none"
                >
                  {ghostDigits}
                </span>

                {/* Active Glowing Digital Speed Digits */}
                <span
                  className={`absolute inset-0 flex items-center justify-end font-moto-digital italic font-bold tracking-tight text-[6.75rem] min-[390px]:text-[7.75rem] sm:text-[10rem] md:text-[11.5rem] lg:text-[10.5rem] xl:text-[12rem] leading-[0.82] ${
                    hasSpeed
                      ? 'text-white drop-shadow-[0_0_22px_rgba(34,211,238,0.28)]'
                      : 'text-slate-500'
                  }`}
                >
                  {integerDigits}
                </span>
              </div>

              {/* Right Stacked Unit Badge + Enlarged Tenth-Decimal Readout (.0) */}
              <div className="flex flex-col items-start justify-between pb-1.5 sm:pb-3 gap-1.5 sm:gap-2">
                <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 font-moto-digital font-bold text-sm sm:text-lg md:text-xl tracking-wider leading-none">
                  <Gauge className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-400" />
                  <span>{speedUnit}</span>
                </div>

                <div
                  className={`font-moto-digital italic font-bold text-[2.75rem] min-[390px]:text-[3.25rem] sm:text-[4.25rem] md:text-[4.75rem] leading-[0.85] ${
                    hasSpeed ? 'text-cyan-400' : 'text-slate-600'
                  }`}
                >
                  .{decimalDigit}
                </div>
              </div>
            </div>
          </div>

          {/* BOTTOM LCD ODOMETER & TRIP TELEMETRY STRIP */}
          <div className="relative z-10 mt-3 sm:mt-4 pt-3 border-t border-slate-800/90 grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
            {/* ODO / TRIP Distance */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-2 flex flex-col justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                TRIP DIST
              </span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="font-moto-digital font-bold text-xl sm:text-2xl text-white">
                  {formatDistance(stats.distanceKm, unit)}
                </span>
                <span className="font-moto-digital text-xs font-bold text-cyan-400">{distUnit}</span>
              </div>
            </div>

            {/* Ride Duration */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-2 flex flex-col justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                TRIP TIME
              </span>
              <div className="mt-0.5">
                <span className="font-moto-digital font-bold text-xl sm:text-2xl text-white">
                  {formatDuration(stats.totalDurationSeconds)}
                </span>
              </div>
            </div>

            {/* Average Speed */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-2 flex flex-col justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                AVG SPEED
              </span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="font-moto-digital font-bold text-xl sm:text-2xl text-emerald-400">
                  {formatSpeed(stats.avgSpeedKmH, unit, hasRecordedPoints)}
                </span>
                <span className="font-moto-digital text-[11px] font-bold text-slate-400">
                  {speedUnit}
                </span>
              </div>
            </div>

            {/* Maximum Peak Speed */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-2 flex flex-col justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center justify-between">
                <span>MAX SPEED</span>
                <span className="w-2 h-2 rounded-xs bg-amber-400 inline-block" aria-hidden="true" />
              </span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="font-moto-digital font-bold text-xl sm:text-2xl text-amber-400">
                  {formatSpeed(stats.maxSpeedKmH, unit, hasRecordedPoints)}
                </span>
                <span className="font-moto-digital text-[11px] font-bold text-slate-400">
                  {speedUnit}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
