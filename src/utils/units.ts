import { UnitSystem } from '../types/cycling';

export function formatSpeed(speedKmH: number | null | undefined, unit: UnitSystem, hasData: boolean = true): string {
  if (!hasData || speedKmH === null || speedKmH === undefined || isNaN(speedKmH)) return '--';
  if (unit === 'imperial') {
    const mph = speedKmH * 0.621371;
    return mph.toFixed(1);
  }
  return speedKmH.toFixed(1);
}

export function formatDistance(distanceKm: number | null | undefined, unit: UnitSystem): string {
  if (distanceKm === null || distanceKm === undefined || isNaN(distanceKm)) return '--';
  if (unit === 'imperial') {
    const miles = distanceKm * 0.621371;
    return miles.toFixed(2);
  }
  return distanceKm.toFixed(2);
}

export function formatElevation(meters: number | null | undefined, unit: UnitSystem, hasData: boolean = true): string {
  if (!hasData || meters === null || meters === undefined || isNaN(meters)) return '--';
  if (unit === 'imperial') {
    const feet = Math.round(meters * 3.28084);
    return `${feet} ft`;
  }
  return `${Math.round(meters)} m`;
}

export function getSpeedUnitLabel(unit: UnitSystem): string {
  return unit === 'imperial' ? 'mph' : 'km/h';
}

export function getDistanceUnitLabel(unit: UnitSystem): string {
  return unit === 'imperial' ? 'mi' : 'km';
}

export function getElevationUnitLabel(unit: UnitSystem): string {
  return unit === 'imperial' ? 'ft' : 'm';
}

export function getPaceUnitLabel(unit: UnitSystem): string {
  return unit === 'imperial' ? 'menit/mi' : 'menit/km';
}

export function formatDuration(totalSeconds: number | null | undefined): string {
  if (totalSeconds === null || totalSeconds === undefined || isNaN(totalSeconds) || totalSeconds < 0) {
    return '00:00:00';
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  const hStr = hours.toString().padStart(2, '0');
  const mStr = minutes.toString().padStart(2, '0');
  const sStr = seconds.toString().padStart(2, '0');

  return `${hStr}:${mStr}:${sStr}`;
}

/**
 * Formats pace from seconds-per-kilometer into MM:SS string (converts to sec/mile if imperial).
 * Returns "--:--" if data is unavailable or out of realistic bounds.
 */
export function formatPaceFromSecPerKm(
  secPerKm: number | null | undefined,
  unit: UnitSystem,
  includeUnit: boolean = false
): string {
  if (secPerKm === null || secPerKm === undefined || isNaN(secPerKm) || secPerKm <= 0 || secPerKm > 3600) {
    return '--:--';
  }
  const effectiveSec = unit === 'imperial' ? secPerKm * 1.609344 : secPerKm;
  const totalSec = Math.round(effectiveSec);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  const formatted = `${mins}:${secs.toString().padStart(2, '0')}`;
  if (!includeUnit) return formatted;
  return `${formatted} /${unit === 'imperial' ? 'mi' : 'km'}`;
}

export function formatPace(speedKmH: number | null | undefined, unit: UnitSystem): string {
  if (speedKmH === null || speedKmH === undefined || isNaN(speedKmH) || speedKmH < 1.0) return '--:--';
  const secPerKm = 3600 / speedKmH;
  return formatPaceFromSecPerKm(secPerKm, unit, true);
}
