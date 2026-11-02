import { ActivityRecord, GPSPoint, MapStyle, UnitSystem } from '../types/cycling';
import { getTile } from './db';
import { getTileKey, getTileUrl, MAP_LAYERS } from './offlineTiles';
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

export type ShareCardAspectRatio = 'portrait' | 'story' | 'square';
export type ShareMapStyle = Extract<MapStyle, 'voyager' | 'street' | 'dark' | 'satellite'>;

export interface ShareImageOptions {
  theme?: 'dark' | 'light';
  aspectRatio?: ShareCardAspectRatio; // portrait = 1080x1350, story = 1080x1920, square = 1080x1080
  mapStyle?: ShareMapStyle;
  showSplits?: boolean;
}

// In-memory LRU tile blob cache so switching themes/ratios renders instantaneously
const memoryTileCache = new Map<string, Blob>();
const MAX_MEMORY_TILES = 96;

function putMemoryTile(key: string, blob: Blob) {
  if (memoryTileCache.size >= MAX_MEMORY_TILES) {
    const oldestKey = memoryTileCache.keys().next().value;
    if (oldestKey) memoryTileCache.delete(oldestKey);
  }
  memoryTileCache.set(key, blob);
}

function lngToWorldPx(lng: number, zoom: number): number {
  const scale = 256 * Math.pow(2, zoom);
  return ((lng + 180) / 360) * scale;
}

function latToWorldPx(lat: number, zoom: number): number {
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const sinLat = Math.sin((clampedLat * Math.PI) / 180);
  const scale = 256 * Math.pow(2, zoom);
  return (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchTileBlobWithFallback(
  style: ShareMapStyle,
  x: number,
  y: number,
  z: number
): Promise<Blob | null> {
  const cacheKey = getTileKey(style, z, x, y);
  const memHit = memoryTileCache.get(cacheKey);
  if (memHit) return memHit;

  try {
    const idbHit = await getTile(cacheKey);
    if (idbHit && idbHit.size > 0) {
      putMemoryTile(cacheKey, idbHit);
      return idbHit;
    }
  } catch {
    // Ignore IndexedDB read errors
  }

  const candidateStyles: ShareMapStyle[] =
    style === 'street' ? ['street', 'voyager'] : [style, 'voyager'];

  for (const candidate of candidateStyles) {
    const url = getTileUrl(candidate, x, y, z);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);
    try {
      const response = await fetch(url, {
        mode: 'cors',
        credentials: 'omit',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (response.ok) {
        const blob = await response.blob();
        if (blob.size > 0) {
          putMemoryTile(cacheKey, blob);
          return blob;
        }
      }
    } catch {
      clearTimeout(timeoutId);
    }
  }

  return null;
}

function decodeBlobToImage(blob: Blob): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };
    img.src = objectUrl;
  });
}

interface DistancePin {
  label: string;
  lat: number;
  lng: number;
}

function computeRouteDistancePins(points: GPSPoint[], unit: UnitSystem): DistancePin[] {
  if (points.length < 2) return [];
  const kmToUnit = unit === 'imperial' ? 0.621371 : 1;

  let totalUnits = 0;
  for (let i = 1; i < points.length; i++) {
    totalUnits +=
      haversineKm(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng) * kmToUnit;
  }

  if (totalUnits < 0.95) return [];

  const step =
    totalUnits < 10
      ? 1
      : totalUnits < 24
      ? 2
      : totalUnits < 60
      ? 5
      : totalUnits < 130
      ? 10
      : 25;

  const pins: DistancePin[] = [];
  let acc = 0;
  let nextMark = step;

  for (let i = 1; i < points.length; i++) {
    const p1 = points[i - 1];
    const p2 = points[i];
    const seg = haversineKm(p1.lat, p1.lng, p2.lat, p2.lng) * kmToUnit;
    if (seg <= 0) continue;

    while (acc + seg >= nextMark) {
      // Avoid placing a distance pin right on top of the finish pin
      if (totalUnits - nextMark > step * 0.18) {
        const ratio = (nextMark - acc) / seg;
        pins.push({
          label: `${nextMark}`,
          lat: p1.lat + (p2.lat - p1.lat) * ratio,
          lng: p1.lng + (p2.lng - p1.lng) * ratio,
        });
      }
      nextMark += step;
    }
    acc += seg;
  }

  return pins;
}

function truncateTextToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let trimmed = text;
  while (trimmed.length > 1 && ctx.measureText(trimmed + '…').width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed + '…';
}

export function buildActivityShareText(activity: ActivityRecord, unit: UnitSystem): string {
  const isRunning = activity.sportType === 'running';
  const sportLabel = isRunning ? 'Lari (Running)' : 'Bersepeda (Cycling)';
  const hasPoints = activity.points.length > 0;
  const hasElev = Boolean(
    activity.stats.hasElevationData ??
      (activity.stats.currentElevationM !== null || activity.stats.elevationGainM > 0)
  );

  const dateStr = new Date(activity.startTime).toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const startStr = new Date(activity.startTime).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const endStr = new Date(activity.endTime).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const lines: string[] = [
    `${activity.title} — ${sportLabel}`,
    `${dateStr} · ${startStr} – ${endStr}`,
    '',
    `Jarak Tempuh: ${formatDistance(activity.stats.distanceKm, unit)} ${getDistanceUnitLabel(unit)}`,
    `Waktu Bergerak: ${formatDuration(activity.stats.movingTimeSeconds)} (Total: ${formatDuration(activity.stats.totalDurationSeconds)})`,
  ];

  if (isRunning) {
    lines.push(
      `Pace Rata-Rata: ${formatPaceFromSecPerKm(activity.stats.avgPaceSecPerKm, unit)} ${getPaceUnitLabel(unit)}`,
      `Best Pace: ${formatPaceFromSecPerKm(activity.stats.bestPaceSecPerKm, unit)} ${getPaceUnitLabel(unit)}`,
      `Kecepatan Rata-Rata: ${formatSpeed(activity.stats.avgSpeedKmH, unit, hasPoints)} ${getSpeedUnitLabel(unit)}`
    );
  } else {
    lines.push(
      `Kecepatan Rata-Rata: ${formatSpeed(activity.stats.avgSpeedKmH, unit, hasPoints)} ${getSpeedUnitLabel(unit)}`,
      `Kecepatan Maksimum: ${formatSpeed(activity.stats.maxSpeedKmH, unit, hasPoints)} ${getSpeedUnitLabel(unit)}`,
      `Waktu Berhenti: ${formatDuration(activity.stats.stoppedTimeSeconds)}`
    );
  }

  if (hasElev) {
    lines.push(
      `Elevasi Naik / Turun: +${formatElevation(activity.stats.elevationGainM, unit, true)} / -${formatElevation(activity.stats.elevationLossM, unit, true)}`
    );
  } else {
    lines.push('Elevasi: -- (sensor altimeter tidak tersedia)');
  }

  if (activity.splits && activity.splits.length > 0) {
    const previewSplits = activity.splits
      .slice(0, 5)
      .map((s) =>
        isRunning
          ? `KM ${s.kmIndex}: ${formatPaceFromSecPerKm(s.paceSecondsPerKm ?? s.durationSeconds, unit)} ${getPaceUnitLabel(unit)}`
          : `KM ${s.kmIndex}: ${formatSpeed(s.avgSpeedKmH, unit, true)} ${getSpeedUnitLabel(unit)}`
      )
      .join(' · ');
    lines.push(`Split Rute: ${previewSplits}`);
  }

  if (activity.notes) {
    lines.push('', `Catatan: "${activity.notes}"`);
  }

  lines.push('', 'Direkam menggunakan RideTrack GPS');
  return lines.join('\n');
}

export async function generateRideSnapshotBlob(
  activity: ActivityRecord,
  unit: UnitSystem,
  options: ShareImageOptions = {}
): Promise<{ blob: Blob; dataUrl: string; width: number; height: number }> {
  const theme = options.theme || 'dark';
  const aspectRatio: ShareCardAspectRatio = options.aspectRatio || 'portrait';
  const mapStyle: ShareMapStyle = options.mapStyle || (theme === 'dark' ? 'voyager' : 'street');
  const showSplits = options.showSplits !== false;

  const width = 1080;
  const height =
    aspectRatio === 'story' ? 1920 : aspectRatio === 'portrait' ? 1350 : 1080;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Canvas 2D context is not available');
  }

  const isDark = theme === 'dark';
  const isRunning = activity.sportType === 'running';
  const hasPoints = activity.points.length > 0;
  const hasElev = Boolean(
    activity.stats.hasElevationData ??
      (activity.stats.currentElevationM !== null || activity.stats.elevationGainM > 0)
  );

  // Palette
  const bgStart = isDark ? '#0B1220' : '#F8FAFC';
  const bgEnd = isDark ? '#111C30' : '#EEF2F6';
  const surfaceBg = isDark ? 'rgba(255, 255, 255, 0.045)' : '#FFFFFF';
  const surfaceBorder = isDark ? 'rgba(148, 163, 184, 0.16)' : 'rgba(203, 213, 225, 0.9)';
  const textPrimary = isDark ? '#F8FAFC' : '#0F172A';
  const textSecondary = isDark ? '#94A3B8' : '#64748B';
  const sportAccent = isRunning ? '#10B981' : '#06B6D4';
  const sportAccentSecondary = isRunning ? '#059669' : '#0284C7';
  const fontSans = '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const fontMono = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

  // 1. Canvas Background
  const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
  bgGrad.addColorStop(0, bgStart);
  bgGrad.addColorStop(1, bgEnd);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  const paddingX = 52;
  const contentW = width - paddingX * 2;
  let cursorY = aspectRatio === 'square' ? 42 : 52;

  // 2. Top Brand & Timestamp Header
  ctx.save();
  ctx.fillStyle = sportAccent;
  ctx.beginPath();
  ctx.roundRect(paddingX, cursorY, 44, 44, 12);
  ctx.fill();

  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (isRunning) {
    // Minimalist stride mark
    ctx.beginPath();
    ctx.arc(paddingX + 25, cursorY + 13, 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(paddingX + 14, cursorY + 31);
    ctx.lineTo(paddingX + 21, cursorY + 22);
    ctx.lineTo(paddingX + 27, cursorY + 24);
    ctx.lineTo(paddingX + 32, cursorY + 17);
    ctx.stroke();
  } else {
    // Minimalist bicycle mark
    ctx.beginPath();
    ctx.arc(paddingX + 15, cursorY + 27, 6.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(paddingX + 30, cursorY + 27, 6.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(paddingX + 15, cursorY + 27);
    ctx.lineTo(paddingX + 22.5, cursorY + 16);
    ctx.lineTo(paddingX + 30, cursorY + 27);
    ctx.stroke();
  }
  ctx.restore();

  ctx.font = `800 22px ${fontSans}`;
  ctx.fillStyle = textPrimary;
  ctx.fillText('RideTrack GPS', paddingX + 58, cursorY + 23);

  ctx.font = `600 13px ${fontSans}`;
  ctx.fillStyle = sportAccent;
  const sportModeText = isRunning ? 'Aktivitas Lari · GPS Terverifikasi' : 'Aktivitas Bersepeda · GPS Terverifikasi';
  ctx.fillText(sportModeText, paddingX + 58, cursorY + 42);

  // Date & Start-End Time (Top Right)
  const dateFormatted = new Date(activity.startTime).toLocaleDateString('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const startClock = new Date(activity.startTime).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const endClock = new Date(activity.endTime).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });

  ctx.textAlign = 'right';
  ctx.font = `700 16px ${fontSans}`;
  ctx.fillStyle = textPrimary;
  ctx.fillText(dateFormatted, width - paddingX, cursorY + 22);
  ctx.font = `500 14px ${fontMono}`;
  ctx.fillStyle = textSecondary;
  ctx.fillText(`${startClock} – ${endClock}`, width - paddingX, cursorY + 42);
  ctx.textAlign = 'left';

  cursorY += 68;

  // 3. Activity Title & Optional Notes
  ctx.font = `800 ${aspectRatio === 'square' ? 30 : 34}px ${fontSans}`;
  ctx.fillStyle = textPrimary;
  const cleanTitle = truncateTextToWidth(ctx, activity.title || (isRunning ? 'Lari GPS' : 'Bersepeda GPS'), contentW);
  ctx.fillText(cleanTitle, paddingX, cursorY + 12);
  cursorY += aspectRatio === 'square' ? 26 : 32;

  if (activity.notes && activity.notes.trim().length > 0) {
    ctx.font = `500 15px ${fontSans}`;
    ctx.fillStyle = textSecondary;
    const cleanNote = truncateTextToWidth(ctx, `"${activity.notes.trim()}"`, contentW);
    ctx.fillText(cleanNote, paddingX, cursorY + 8);
    cursorY += 24;
  } else {
    cursorY += 6;
  }

  // 4. Real Stitched Map Image + GPS Route Polyline + KM Pins + Elevation Contour
  const hasSplitsToRender = showSplits && activity.splits && activity.splits.length > 0 && aspectRatio !== 'square';

  const mapBoxX = paddingX;
  const mapBoxY = cursorY;
  const mapBoxW = contentW;
  const mapBoxH =
    aspectRatio === 'story'
      ? hasSplitsToRender
        ? 850
        : 960
      : aspectRatio === 'portrait'
      ? hasSplitsToRender
        ? 490
        : 565
      : 375;

  const validPoints = activity.points.filter(
    (p) =>
      typeof p.lat === 'number' &&
      typeof p.lng === 'number' &&
      Number.isFinite(p.lat) &&
      Number.isFinite(p.lng)
  );

  const elevPoints = validPoints.filter(
    (p) => p.altitude !== null && p.altitude !== undefined && Number.isFinite(p.altitude)
  );
  const drawMiniElevStrip = hasElev && elevPoints.length >= 4 && mapBoxH >= 420;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(mapBoxX, mapBoxY, mapBoxW, mapBoxH, 24);
  ctx.clip();

  // Base fallback fill inside map box
  ctx.fillStyle = mapStyle === 'dark' || mapStyle === 'satellite' ? '#0F172A' : '#E2E8F0';
  ctx.fillRect(mapBoxX, mapBoxY, mapBoxW, mapBoxH);

  if (validPoints.length >= 1) {
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;

    for (const p of validPoints) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
    }

    const maxAllowedZoom = Math.min(MAP_LAYERS[mapStyle].maxNativeZoom, 17);
    let chosenZoom = validPoints.length === 1 ? 15 : maxAllowedZoom;

    if (validPoints.length >= 2) {
      const padLeftRight = 76;
      const padTop = 72;
      const padBottom = drawMiniElevStrip ? 124 : 76;
      const usableW = Math.max(120, mapBoxW - padLeftRight * 2);
      const usableH = Math.max(120, mapBoxH - padTop - padBottom);

      for (let z = maxAllowedZoom; z >= 3; z--) {
        const spanPxX = Math.abs(lngToWorldPx(maxLng, z) - lngToWorldPx(minLng, z));
        const spanPxY = Math.abs(latToWorldPx(minLat, z) - latToWorldPx(maxLat, z));
        chosenZoom = z;
        if (spanPxX <= usableW && spanPxY <= usableH) {
          break;
        }
      }
    }

    // Shift center slightly upward if elevation strip occupies bottom of map
    const verticalBiasPx = drawMiniElevStrip ? 20 : 0;
    const centerWorldX = (lngToWorldPx(minLng, chosenZoom) + lngToWorldPx(maxLng, chosenZoom)) / 2;
    const centerWorldY =
      (latToWorldPx(minLat, chosenZoom) + latToWorldPx(maxLat, chosenZoom)) / 2 + verticalBiasPx;

    const viewOriginWorldX = centerWorldX - mapBoxW / 2;
    const viewOriginWorldY = centerWorldY - mapBoxH / 2;
    const viewEndWorldX = centerWorldX + mapBoxW / 2;
    const viewEndWorldY = centerWorldY + mapBoxH / 2;

    const numTiles = 1 << chosenZoom;
    const minTileX = Math.floor(viewOriginWorldX / 256);
    const maxTileX = Math.floor(viewEndWorldX / 256);
    const minTileY = Math.max(0, Math.floor(viewOriginWorldY / 256));
    const maxTileY = Math.min(numTiles - 1, Math.floor(viewEndWorldY / 256));

    const tileJobs: Array<{ tx: number; ty: number; wrappedX: number }> = [];
    for (let tx = minTileX; tx <= maxTileX; tx++) {
      const wrappedX = ((tx % numTiles) + numTiles) % numTiles;
      for (let ty = minTileY; ty <= maxTileY; ty++) {
        tileJobs.push({ tx, ty, wrappedX });
      }
    }

    // Fetch & decode tiles in parallel batches of 8
    let renderedAnyTile = false;
    const batchSize = 8;
    for (let i = 0; i < tileJobs.length; i += batchSize) {
      const batch = tileJobs.slice(i, i + batchSize);
      const loadedBatch = await Promise.all(
        batch.map(async (job) => {
          const blob = await fetchTileBlobWithFallback(mapStyle, job.wrappedX, job.ty, chosenZoom);
          if (!blob) return { job, img: null };
          const img = await decodeBlobToImage(blob);
          return { job, img };
        })
      );

      for (const { job, img } of loadedBatch) {
        if (!img) continue;
        renderedAnyTile = true;
        const drawX = Math.round(mapBoxX + job.tx * 256 - viewOriginWorldX);
        const drawY = Math.round(mapBoxY + job.ty * 256 - viewOriginWorldY);
        ctx.drawImage(img, drawX, drawY, 256.5, 256.5);
      }
    }

    // If completely offline without cached tiles, draw clean topographic coordinate grid fallback
    if (!renderedAnyTile) {
      ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.1)' : 'rgba(100, 116, 139, 0.12)';
      ctx.lineWidth = 1;
      for (let gx = mapBoxX; gx <= mapBoxX + mapBoxW; gx += 56) {
        ctx.beginPath();
        ctx.moveTo(gx, mapBoxY);
        ctx.lineTo(gx, mapBoxY + mapBoxH);
        ctx.stroke();
      }
      for (let gy = mapBoxY; gy <= mapBoxY + mapBoxH; gy += 56) {
        ctx.beginPath();
        ctx.moveTo(mapBoxX, gy);
        ctx.lineTo(mapBoxX + mapBoxW, gy);
        ctx.stroke();
      }
    } else if (mapStyle === 'street' || mapStyle === 'voyager') {
      // Very subtle contrast veil so vibrant route line & markers stand out crisply
      ctx.fillStyle = 'rgba(15, 23, 42, 0.04)';
      ctx.fillRect(mapBoxX, mapBoxY, mapBoxW, mapBoxH);
    }

    const projectToCanvas = (lat: number, lng: number) => ({
      x: mapBoxX + (lngToWorldPx(lng, chosenZoom) - viewOriginWorldX),
      y: mapBoxY + (latToWorldPx(lat, chosenZoom) - viewOriginWorldY),
    });

    if (validPoints.length >= 2) {
      const startPt = projectToCanvas(validPoints[0].lat, validPoints[0].lng);
      const endPt = projectToCanvas(
        validPoints[validPoints.length - 1].lat,
        validPoints[validPoints.length - 1].lng
      );

      // 1) High-contrast route casing (ensures visibility on bright roads, dark tiles, & satellite)
      ctx.save();
      ctx.strokeStyle =
        mapStyle === 'dark' || mapStyle === 'satellite'
          ? 'rgba(255, 255, 255, 0.9)'
          : 'rgba(15, 23, 42, 0.82)';
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = 'rgba(15, 23, 42, 0.32)';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(startPt.x, startPt.y);
      for (let i = 1; i < validPoints.length; i++) {
        const pt = projectToCanvas(validPoints[i].lat, validPoints[i].lng);
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();
      ctx.restore();

      // 2) Inner Sport Route Line
      const routeGrad = ctx.createLinearGradient(
        mapBoxX,
        mapBoxY,
        mapBoxX + mapBoxW,
        mapBoxY + mapBoxH
      );
      if (isRunning) {
        routeGrad.addColorStop(0, '#10B981');
        routeGrad.addColorStop(0.5, '#06B6D4');
        routeGrad.addColorStop(1, '#059669');
      } else {
        routeGrad.addColorStop(0, '#06B6D4');
        routeGrad.addColorStop(0.5, '#2563EB');
        routeGrad.addColorStop(1, '#10B981');
      }

      ctx.save();
      ctx.strokeStyle = routeGrad;
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(startPt.x, startPt.y);
      for (let i = 1; i < validPoints.length; i++) {
        const pt = projectToCanvas(validPoints[i].lat, validPoints[i].lng);
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();
      ctx.restore();

      // 3) Distance Markers along Route (1 km, 2 km, ...)
      const distPins = computeRouteDistancePins(validPoints, unit);
      for (const pin of distPins) {
        const pos = projectToCanvas(pin.lat, pin.lng);
        ctx.save();
        ctx.fillStyle = '#0F172A';
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = 'rgba(15, 23, 42, 0.35)';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `700 11px ${fontMono}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(pin.label, pos.x, pos.y + 0.5);
        ctx.restore();
      }

      // Offset Start & Finish slightly if loop finishes at exact same pixel
      const dxPins = endPt.x - startPt.x;
      const dyPins = endPt.y - startPt.y;
      const pinSep = Math.hypot(dxPins, dyPins);
      const startDrawX = pinSep < 18 ? startPt.x - 8 : startPt.x;
      const endDrawX = pinSep < 18 ? endPt.x + 8 : endPt.x;

      // Start Marker ("S")
      ctx.save();
      ctx.fillStyle = '#10B981';
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 3.5;
      ctx.shadowColor = 'rgba(15, 23, 42, 0.45)';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(startDrawX, startPt.y, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `800 13px ${fontSans}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('S', startDrawX, startPt.y + 0.5);
      ctx.restore();

      // Finish Marker ("F")
      ctx.save();
      ctx.fillStyle = '#EF4444';
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 3.5;
      ctx.shadowColor = 'rgba(15, 23, 42, 0.45)';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(endDrawX, endPt.y, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `800 13px ${fontSans}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('F', endDrawX, endPt.y + 0.5);
      ctx.restore();
    } else {
      // Single point pin
      const onlyPt = projectToCanvas(validPoints[0].lat, validPoints[0].lng);
      ctx.save();
      ctx.fillStyle = sportAccent;
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(onlyPt.x, onlyPt.y, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Optional Mini Elevation Contour Strip docked inside lower map area
    if (drawMiniElevStrip) {
      const stripMarginX = 16;
      const stripH = 62;
      const stripX = mapBoxX + stripMarginX;
      const stripW = mapBoxW - stripMarginX * 2;
      const stripY = mapBoxY + mapBoxH - stripH - 34;

      ctx.save();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.76)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(stripX, stripY, stripW, stripH, 14);
      ctx.fill();
      ctx.stroke();

      let minAlt = Infinity;
      let maxAlt = -Infinity;
      for (const ep of elevPoints) {
        const a = ep.altitude as number;
        if (a < minAlt) minAlt = a;
        if (a > maxAlt) maxAlt = a;
      }
      const altSpan = Math.max(8, maxAlt - minAlt);
      const graphLeft = stripX + 16;
      const graphRight = stripX + stripW - 175;
      const graphW = graphRight - graphLeft;
      const graphTop = stripY + 14;
      const graphBottom = stripY + stripH - 10;
      const graphH = graphBottom - graphTop;

      const elevFill = ctx.createLinearGradient(0, graphTop, 0, graphBottom);
      elevFill.addColorStop(0, isRunning ? 'rgba(16, 185, 129, 0.45)' : 'rgba(6, 182, 212, 0.45)');
      elevFill.addColorStop(1, 'rgba(15, 23, 42, 0.05)');

      ctx.beginPath();
      elevPoints.forEach((ep, idx) => {
        const x = graphLeft + (idx / (elevPoints.length - 1)) * graphW;
        const y = graphBottom - (((ep.altitude as number) - minAlt) / altSpan) * graphH;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = sportAccent;
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.lineTo(graphRight, graphBottom);
      ctx.lineTo(graphLeft, graphBottom);
      ctx.closePath();
      ctx.fillStyle = elevFill;
      ctx.fill();

      ctx.textAlign = 'right';
      ctx.font = `600 11px ${fontSans}`;
      ctx.fillStyle = '#94A3B8';
      ctx.fillText('Profil Elevasi', stripX + stripW - 14, stripY + 24);
      ctx.font = `700 13px ${fontMono}`;
      ctx.fillStyle = '#F8FAFC';
      ctx.fillText(
        `${formatElevation(minAlt, unit, true)} – ${formatElevation(maxAlt, unit, true)}`,
        stripX + stripW - 14,
        stripY + 44
      );
      ctx.textAlign = 'left';
      ctx.restore();
    }

    // Map Top-Left Legend Overlay
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
    ctx.beginPath();
    ctx.roundRect(mapBoxX + 16, mapBoxY + 16, 290, 34, 10);
    ctx.fill();

    // Start green dot
    ctx.fillStyle = '#10B981';
    ctx.beginPath();
    ctx.arc(mapBoxX + 32, mapBoxY + 33, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#F8FAFC';
    ctx.font = `600 12px ${fontSans}`;
    ctx.fillText('Start', mapBoxX + 43, mapBoxY + 37);

    // Finish red dot
    ctx.fillStyle = '#EF4444';
    ctx.beginPath();
    ctx.arc(mapBoxX + 92, mapBoxY + 33, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#F8FAFC';
    ctx.fillText('Finish', mapBoxX + 103, mapBoxY + 37);

    ctx.fillStyle = '#94A3B8';
    ctx.font = `600 12px ${fontMono}`;
    ctx.fillText(`· ${validPoints.length} titik GPS`, mapBoxX + 150, mapBoxY + 37);
    ctx.restore();

    // Map Bottom Attribution Strip (Required by OpenStreetMap / CARTO / Esri)
    const attributionLabel =
      mapStyle === 'satellite'
        ? 'Peta: © Esri, Maxar, Earthstar Geographics'
        : mapStyle === 'street'
        ? 'Peta: © OpenStreetMap contributors'
        : 'Peta: © OpenStreetMap contributors · © CARTO';

    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
    ctx.fillRect(mapBoxX, mapBoxY + mapBoxH - 26, mapBoxW, 26);
    ctx.fillStyle = '#CBD5E1';
    ctx.font = `500 11px ${fontSans}`;
    ctx.textAlign = 'right';
    ctx.fillText(attributionLabel, mapBoxX + mapBoxW - 14, mapBoxY + mapBoxH - 9);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#94A3B8';
    ctx.fillText(
      `Penanda jarak dalam ${getDistanceUnitLabel(unit)}`,
      mapBoxX + 14,
      mapBoxY + mapBoxH - 9
    );
    ctx.restore();
  } else {
    // Zero GPS points fallback
    ctx.fillStyle = isDark ? '#0F172A' : '#F1F5F9';
    ctx.fillRect(mapBoxX, mapBoxY, mapBoxW, mapBoxH);
    ctx.fillStyle = textSecondary;
    ctx.font = `700 20px ${fontSans}`;
    ctx.textAlign = 'center';
    ctx.fillText(
      'Tidak ada koordinat rute GPS pada sesi ini',
      mapBoxX + mapBoxW / 2,
      mapBoxY + mapBoxH / 2
    );
    ctx.textAlign = 'left';
  }
  ctx.restore();

  // Map outer border
  ctx.save();
  ctx.strokeStyle = surfaceBorder;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(mapBoxX, mapBoxY, mapBoxW, mapBoxH, 24);
  ctx.stroke();
  ctx.restore();

  cursorY = mapBoxY + mapBoxH + (aspectRatio === 'square' ? 20 : 24);

  // 5. Primary 4 Hero Metrics Row
  const colGap = 16;
  const colW = (contentW - colGap * 3) / 4;
  const heroTileH = aspectRatio === 'square' ? 124 : 138;

  const primaryCards = [
    {
      label: 'Jarak Tempuh',
      value: formatDistance(activity.stats.distanceKm, unit),
      unit: getDistanceUnitLabel(unit),
      sub: `${validPoints.length} titik terekam`,
      accent: sportAccent,
    },
    {
      label: 'Waktu Bergerak',
      value: formatDuration(activity.stats.movingTimeSeconds),
      unit: '',
      sub: `Total: ${formatDuration(activity.stats.totalDurationSeconds)}`,
      accent: '#3B82F6',
    },
    isRunning
      ? {
          label: 'Pace Rata-Rata',
          value: formatPaceFromSecPerKm(activity.stats.avgPaceSecPerKm, unit),
          unit: getPaceUnitLabel(unit),
          sub: `Best: ${formatPaceFromSecPerKm(activity.stats.bestPaceSecPerKm, unit)} ${getPaceUnitLabel(unit)}`,
          accent: '#10B981',
        }
      : {
          label: 'Kec. Rata-Rata',
          value: formatSpeed(activity.stats.avgSpeedKmH, unit, hasPoints),
          unit: getSpeedUnitLabel(unit),
          sub: `Maks: ${formatSpeed(activity.stats.maxSpeedKmH, unit, hasPoints)} ${getSpeedUnitLabel(unit)}`,
          accent: '#06B6D4',
        },
    {
      label: 'Elevasi Naik',
      value: hasElev ? `+${formatElevation(activity.stats.elevationGainM, unit, true)}` : '--',
      unit: '',
      sub: hasElev
        ? `Turun: -${formatElevation(activity.stats.elevationLossM, unit, true)}`
        : 'Sensor tidak tersedia',
      accent: '#F59E0B',
    },
  ];

  primaryCards.forEach((card, idx) => {
    const x = paddingX + idx * (colW + colGap);
    const y = cursorY;

    ctx.save();
    ctx.fillStyle = surfaceBg;
    ctx.strokeStyle = surfaceBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, colW, heroTileH, 18);
    ctx.fill();
    ctx.stroke();

    ctx.font = `600 13px ${fontSans}`;
    ctx.fillStyle = textSecondary;
    ctx.fillText(card.label, x + 18, y + 30);

    const valFontSize = aspectRatio === 'square' ? 28 : 32;
    ctx.font = `800 ${valFontSize}px ${fontMono}`;
    ctx.fillStyle = textPrimary;
    ctx.fillText(card.value, x + 18, y + (aspectRatio === 'square' ? 72 : 78));

    if (card.unit) {
      const valW = ctx.measureText(card.value).width;
      ctx.font = `700 14px ${fontSans}`;
      ctx.fillStyle = card.accent;
      ctx.fillText(card.unit, x + 24 + valW, y + (aspectRatio === 'square' ? 72 : 78));
    }

    ctx.font = `500 12px ${fontMono}`;
    ctx.fillStyle = textSecondary;
    ctx.fillText(truncateTextToWidth(ctx, card.sub, colW - 32), x + 18, y + heroTileH - 18);
    ctx.restore();
  });

  cursorY += heroTileH + (aspectRatio === 'square' ? 16 : 20);

  // 6. Complete Activity Details Grid (2 Rows × 3 Columns = 6 Telemetry Details)
  const detailBoxH = aspectRatio === 'square' ? 138 : 156;
  ctx.save();
  ctx.fillStyle = surfaceBg;
  ctx.strokeStyle = surfaceBorder;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(paddingX, cursorY, contentW, detailBoxH, 18);
  ctx.fill();
  ctx.stroke();

  // Horizontal & vertical hairline dividers inside the 2x3 detail grid
  ctx.strokeStyle = surfaceBorder;
  ctx.beginPath();
  ctx.moveTo(paddingX + 20, cursorY + detailBoxH / 2);
  ctx.lineTo(paddingX + contentW - 20, cursorY + detailBoxH / 2);
  ctx.moveTo(paddingX + contentW / 3, cursorY + 16);
  ctx.lineTo(paddingX + contentW / 3, cursorY + detailBoxH - 16);
  ctx.moveTo(paddingX + (contentW * 2) / 3, cursorY + 16);
  ctx.lineTo(paddingX + (contentW * 2) / 3, cursorY + detailBoxH - 16);
  ctx.stroke();

  const accStr =
    activity.gpsQuality.avgAccuracyM !== null ? `±${activity.gpsQuality.avgAccuracyM}m` : '--';

  const detailCells = [
    {
      label: 'Elapsed Time (Total)',
      value: formatDuration(activity.stats.totalDurationSeconds),
    },
    {
      label: 'Waktu Berhenti',
      value: formatDuration(activity.stats.stoppedTimeSeconds),
    },
    isRunning
      ? {
          label: 'Kec. Rata-Rata / Maks',
          value: `${formatSpeed(activity.stats.avgSpeedKmH, unit, hasPoints)} / ${formatSpeed(activity.stats.maxSpeedKmH, unit, hasPoints)} ${getSpeedUnitLabel(unit)}`,
        }
      : {
          label: 'Kecepatan Maksimum',
          value: `${formatSpeed(activity.stats.maxSpeedKmH, unit, hasPoints)} ${getSpeedUnitLabel(unit)}`,
        },
    isRunning
      ? {
          label: 'Best Pace Valid',
          value: `${formatPaceFromSecPerKm(activity.stats.bestPaceSecPerKm, unit)} ${getPaceUnitLabel(unit)}`,
        }
      : {
          label: 'Pace Rata-Rata / Best',
          value: `${formatPaceFromSecPerKm(activity.stats.avgPaceSecPerKm, unit)} / ${formatPaceFromSecPerKm(activity.stats.bestPaceSecPerKm, unit)}`,
        },
    {
      label: 'Elevasi Awal → Akhir',
      value: hasElev
        ? `${formatElevation(activity.stats.startElevationM, unit, true)} → ${formatElevation(activity.stats.endElevationM, unit, true)}`
        : '--',
    },
    {
      label: 'Kualitas & Akurasi GPS',
      value: `${activity.gpsQuality.qualityRating} (${accStr})`,
    },
  ];

  const cellW = contentW / 3;
  const cellH = detailBoxH / 2;

  detailCells.forEach((cell, idx) => {
    const col = idx % 3;
    const row = Math.floor(idx / 3);
    const cx = paddingX + col * cellW + 22;
    const cy = cursorY + row * cellH;

    ctx.font = `500 12px ${fontSans}`;
    ctx.fillStyle = textSecondary;
    ctx.fillText(cell.label, cx, cy + (aspectRatio === 'square' ? 26 : 30));

    ctx.font = `700 ${aspectRatio === 'square' ? 16 : 18}px ${fontMono}`;
    ctx.fillStyle = textPrimary;
    ctx.fillText(
      truncateTextToWidth(ctx, cell.value, cellW - 36),
      cx,
      cy + (aspectRatio === 'square' ? 52 : 58)
    );
  });
  ctx.restore();

  cursorY += detailBoxH + (aspectRatio === 'square' ? 16 : 20);

  // 7. Split Per Kilometer Strip (Portrait & Story when splits are available)
  if (hasSplitsToRender) {
    const splitsToShow = activity.splits.slice(0, aspectRatio === 'story' ? 6 : 5);
    const splitBoxH = aspectRatio === 'story' ? 126 : 98;

    ctx.save();
    ctx.fillStyle = surfaceBg;
    ctx.strokeStyle = surfaceBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(paddingX, cursorY, contentW, splitBoxH, 18);
    ctx.fill();
    ctx.stroke();

    ctx.font = `700 12px ${fontSans}`;
    ctx.fillStyle = sportAccentSecondary;
    ctx.fillText(
      isRunning
        ? `Split Per Kilometer (${activity.splits.length} KM Tercatat)`
        : `Kecepatan Per Kilometer (${activity.splits.length} KM Tercatat)`,
      paddingX + 20,
      cursorY + 26
    );

    let fastestIdx = 0;
    splitsToShow.forEach((s, i) => {
      if (s.durationSeconds < splitsToShow[fastestIdx].durationSeconds) {
        fastestIdx = i;
      }
    });

    const splitColW = (contentW - 24) / splitsToShow.length;
    splitsToShow.forEach((sp, i) => {
      const sx = paddingX + 20 + i * splitColW;
      const sy = cursorY + (aspectRatio === 'story' ? 58 : 52);
      const isFastest = i === fastestIdx && splitsToShow.length > 1;

      ctx.font = `600 12px ${fontSans}`;
      ctx.fillStyle = isFastest ? sportAccent : textSecondary;
      ctx.fillText(`KM ${sp.kmIndex}${isFastest ? ' ★' : ''}`, sx, sy);

      ctx.font = `700 ${aspectRatio === 'story' ? 18 : 16}px ${fontMono}`;
      ctx.fillStyle = textPrimary;
      const metricStr = isRunning
        ? `${formatPaceFromSecPerKm(sp.paceSecondsPerKm ?? sp.durationSeconds, unit)} ${getPaceUnitLabel(unit)}`
        : `${formatSpeed(sp.avgSpeedKmH, unit, true)} ${getSpeedUnitLabel(unit)}`;
      ctx.fillText(metricStr, sx, sy + (aspectRatio === 'story' ? 28 : 24));

      if (aspectRatio === 'story' && hasElev && sp.hasElevation !== false) {
        const netElevM = Math.round(sp.elevationGainM - sp.elevationLossM);
        const elevSign = netElevM >= 0 ? '+' : '';
        ctx.font = `500 12px ${fontMono}`;
        ctx.fillStyle = textSecondary;
        ctx.fillText(`${elevSign}${netElevM} m`, sx, sy + 48);
      }
    });

    ctx.restore();
  }

  // 8. Clean Footer Signature
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = `600 13px ${fontSans}`;
  ctx.fillStyle = textSecondary;
  ctx.fillText(
    'RideTrack GPS · Peta Rute & Detail Aktivitas Berdasarkan Sensor Perangkat',
    width / 2,
    height - 26
  );
  ctx.restore();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Gagal menghasilkan gambar PNG ringkasan aktivitas.'));
          return;
        }
        const dataUrl = canvas.toDataURL('image/png');
        resolve({ blob, dataUrl, width, height });
      },
      'image/png',
      0.95
    );
  });
}

/**
 * Trigger native OS share sheet with BOTH the Map+Details PNG image AND the structured activity text,
 * or download PNG + copy detail text fallback.
 */
export async function shareOrDownloadRideSnapshot(
  activity: ActivityRecord,
  blob: Blob,
  dataUrl: string,
  unit: UnitSystem
): Promise<{ method: 'shared' | 'downloaded' | 'copied'; message: string }> {
  const cleanTitle = activity.title.replace(/[^a-zA-Z0-9]/g, '_') || 'aktivitas';
  const sportPrefix = activity.sportType === 'running' ? 'Run' : 'Ride';
  const fileName = `RideTrack_${sportPrefix}_${cleanTitle}_${activity.stats.distanceKm.toFixed(2)}km.png`;
  const shareFile = new File([blob], fileName, { type: 'image/png' });
  const shareText = buildActivityShareText(activity, unit);

  // 1. Try Native Web Share API with PNG Map Image + Full Activity Details Text
  if (
    typeof navigator !== 'undefined' &&
    navigator.canShare &&
    navigator.canShare({ files: [shareFile] })
  ) {
    try {
      await navigator.share({
        title: `${activity.title} · RideTrack GPS`,
        text: shareText,
        files: [shareFile],
      });
      return {
        method: 'shared',
        message: 'Gambar peta & detail aktivitas berhasil dibagikan melalui menu perangkat.',
      };
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        return { method: 'shared', message: 'Berbagi dibatalkan.' };
      }
    }
  }

  // 2. Fallback: copy text details to clipboard if available + download the PNG map card
  let copiedCaption = false;
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareText);
      copiedCaption = true;
    }
  } catch {
    // Ignore clipboard error
  }

  const downloadLink = document.createElement('a');
  downloadLink.href = dataUrl;
  downloadLink.download = fileName;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);

  return {
    method: 'downloaded',
    message: copiedCaption
      ? 'Gambar peta PNG berhasil diunduh & teks detail aktivitas telah disalin ke clipboard.'
      : 'Gambar peta & detail aktivitas PNG berhasil diunduh ke perangkat.',
  };
}
