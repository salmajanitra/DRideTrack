import { saveTile, getTile, saveOfflineRegion } from './db';
import { OfflineRegion, MapStyle } from '../types/cycling';

export interface TileCoordinate {
  x: number;
  y: number;
  z: number;
}

// Carto basemaps API key from environment variable (VITE_CARTO_API_KEY)
const CARTO_API_KEY = (import.meta.env.VITE_CARTO_API_KEY as string | undefined)?.trim() || '';

export function buildCartoTileUrl(variant: 'dark_all' | 'rastertiles/voyager'): string {
  const base = `https://a.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}.png`;
  return CARTO_API_KEY ? `${base}?api_key=${encodeURIComponent(CARTO_API_KEY)}` : base;
}

export const MAP_LAYERS: Record<MapStyle, { name: string; url: string; maxNativeZoom: number; attribution: string }> = {
  street: {
    name: 'OpenStreetMap (Standar)',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    maxNativeZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
  },
  topo: {
    name: 'OpenTopoMap (Topografi)',
    url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
    maxNativeZoom: 17,
    attribution: '&copy; OpenTopoMap (CC-BY-SA)',
  },
  dark: {
    name: 'Carto Dark (High Contrast HUD)',
    url: buildCartoTileUrl('dark_all'),
    maxNativeZoom: 19,
    attribution: '&copy; OpenStreetMap, &copy; CARTO',
  },
  voyager: {
    name: 'Carto Voyager (Outdoor Road)',
    url: buildCartoTileUrl('rastertiles/voyager'),
    maxNativeZoom: 19,
    attribution: '&copy; OpenStreetMap, &copy; CARTO',
  },
  satellite: {
    name: 'Esri Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxNativeZoom: 18,
    attribution: '&copy; Esri, Maxar, Earthstar',
  },
};

export function latLngToTile(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  return {
    x: Math.max(0, Math.min(n - 1, x)),
    y: Math.max(0, Math.min(n - 1, y)),
  };
}

export function tileToLatLng(x: number, y: number, zoom: number): { lat: number; lng: number } {
  const n = Math.pow(2, zoom);
  const lng = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  const lat = (latRad * 180) / Math.PI;
  return { lat, lng };
}

export function getTileKey(style: MapStyle, z: number, x: number, y: number): string {
  return `tile_${style}_${z}_${x}_${y}`;
}

export function getRegionTiles(
  bounds: { north: number; south: number; east: number; west: number },
  minZoom: number,
  maxZoom: number
): TileCoordinate[] {
  const tiles: TileCoordinate[] = [];

  for (let z = minZoom; z <= maxZoom; z++) {
    const nw = latLngToTile(bounds.north, bounds.west, z);
    const se = latLngToTile(bounds.south, bounds.east, z);

    const minX = Math.min(nw.x, se.x);
    const maxX = Math.max(nw.x, se.x);
    const minY = Math.min(nw.y, se.y);
    const maxY = Math.max(nw.y, se.y);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        tiles.push({ x, y, z });
      }
    }
  }

  return tiles;
}

export function getTileUrl(style: MapStyle, x: number, y: number, z: number): string {
  const template = MAP_LAYERS[style].url;
  return template
    .replace('{z}', z.toString())
    .replace('{x}', x.toString())
    .replace('{y}', y.toString());
}

export interface DownloadProgress {
  total: number;
  completed: number;
  failed: number;
  currentZoom: number;
  percent: number;
  bytesDownloaded: number;
  status: 'idle' | 'downloading' | 'completed' | 'cancelled' | 'error';
  errorMessage?: string;
}

// Download area tiles into IndexedDB
export async function downloadAreaTiles(
  regionName: string,
  bounds: { north: number; south: number; east: number; west: number },
  minZoom: number,
  maxZoom: number,
  style: MapStyle = 'street',
  onProgress: (p: DownloadProgress) => void,
  abortSignal?: AbortSignal
): Promise<OfflineRegion | null> {
  const tiles = getRegionTiles(bounds, minZoom, maxZoom);

  // Safety cap to prevent browser lockup or tile server rate limit violations
  const MAX_ALLOWED_TILES = 600;
  if (tiles.length > MAX_ALLOWED_TILES) {
    throw new Error(
      `Area terlalu luas (${tiles.length} tiles). Maksimal ${MAX_ALLOWED_TILES} tiles per unduhan. Kurangi area atau tingkat zoom.`
    );
  }

  let completed = 0;
  let failed = 0;
  let totalBytes = 0;
  const regionId = 'reg_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);

  onProgress({
    total: tiles.length,
    completed: 0,
    failed: 0,
    currentZoom: minZoom,
    percent: 0,
    bytesDownloaded: 0,
    status: 'downloading',
  });

  // Batch concurrent requests (polite concurrency = 3)
  const CONCURRENCY = 3;
  let index = 0;

  async function worker() {
    while (index < tiles.length) {
      if (abortSignal?.aborted) {
        throw new Error('Unduhan dibatalkan pengguna');
      }

      const currentIndex = index++;
      const tile = tiles[currentIndex];
      const tileUrl = getTileUrl(style, tile.x, tile.y, tile.z);
      const key = getTileKey(style, tile.z, tile.x, tile.y);

      try {
        const response = await fetch(tileUrl, {
          cache: 'force-cache',
          signal: abortSignal,
        });

        if (response.ok) {
          const blob = await response.blob();
          await saveTile(key, blob, blob.type || 'image/png');
          totalBytes += blob.size;
          completed++;
        } else {
          failed++;
        }
      } catch {
        if (abortSignal?.aborted) throw new Error('Unduhan dibatalkan');
        failed++;
      }

      onProgress({
        total: tiles.length,
        completed,
        failed,
        currentZoom: tile.z,
        percent: Math.round(((completed + failed) / tiles.length) * 100),
        bytesDownloaded: totalBytes,
        status: 'downloading',
      });

      // Small throttle to be courteous to tile servers
      await new Promise((resolve) => setTimeout(resolve, 35));
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, tiles.length) }, () => worker());

  try {
    await Promise.all(workers);

    const offlineRegion: OfflineRegion = {
      id: regionId,
      name: regionName || `Area Rute ${new Date().toLocaleDateString('id-ID')}`,
      bounds,
      minZoom,
      maxZoom,
      tileCount: completed,
      sizeBytes: totalBytes,
      createdAt: Date.now(),
    };

    await saveOfflineRegion(offlineRegion);

    onProgress({
      total: tiles.length,
      completed,
      failed,
      currentZoom: maxZoom,
      percent: 100,
      bytesDownloaded: totalBytes,
      status: 'completed',
    });

    return offlineRegion;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Gagal mengunduh tile';
    onProgress({
      total: tiles.length,
      completed,
      failed,
      currentZoom: minZoom,
      percent: Math.round(((completed + failed) / tiles.length) * 100),
      bytesDownloaded: totalBytes,
      status: abortSignal?.aborted ? 'cancelled' : 'error',
      errorMessage: errorMsg,
    });
    return null;
  }
}

// Generate an offline placeholder tile when tile is not cached
let cachedFallbackDataUrl: string | null = null;
export function getOfflineMissingTileUrl(): string {
  if (cachedFallbackDataUrl) return cachedFallbackDataUrl;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, 256, 256);

    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, 256, 256);

    ctx.fillStyle = '#334155';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('OFFLINE TILE', 128, 118);

    ctx.fillStyle = '#64748b';
    ctx.font = '10px sans-serif';
    ctx.fillText('Belum diunduh', 128, 138);
    ctx.fillText('Unduh di Manajer Peta Offline', 128, 154);
  }

  cachedFallbackDataUrl = canvas.toDataURL('image/png');
  return cachedFallbackDataUrl;
}
