export type SportType = 'cycling' | 'running';

export type AccuracyFilterLevel = 'strict' | 'balanced' | 'relaxed';

export interface GPSPoint {
  lat: number;
  lng: number;
  altitude: number | null; // meters (null if unavailable)
  speed: number; // km/h
  accuracy: number; // meters
  heading: number | null; // degrees 0-360
  timestamp: number; // epoch ms
  distanceDelta: number; // km from prev valid anchor point
  cumulativeDistance: number; // km total
  isMoving: boolean;
}

export type TrackingState = 'idle' | 'recording' | 'paused' | 'finished';

export type GPSStatus = 'searching' | 'locked' | 'weak' | 'lost' | 'denied' | 'unavailable';

export interface KilometerSplit {
  kmIndex: number;
  distanceKm: number;
  durationSeconds: number;
  avgSpeedKmH: number;
  paceSecondsPerKm?: number; // seconds per km for running/cycling split
  elevationGainM: number;
  elevationLossM: number;
  hasElevation?: boolean;
  startTime: number;
  endTime: number;
}

export interface TrackingInterruption {
  id: string;
  startTime: number;
  endTime: number;
  durationSeconds: number;
  reason: 'background_suspended' | 'gps_signal_lost' | 'page_reloaded';
  message: string;
}

export interface ActivityStats {
  distanceKm: number;
  totalDurationSeconds: number; // Elapsed time
  movingTimeSeconds: number;
  stoppedTimeSeconds: number;
  currentSpeedKmH: number;
  hasSpeedData?: boolean;
  avgSpeedKmH: number; // Moving average speed (km/h)
  overallAvgSpeedKmH?: number; // Overall / elapsed average speed (km/h)
  maxSpeedKmH: number;
  currentPaceSecPerKm?: number | null; // Real-time pace in sec/km (null when stationary or unavailable)
  avgPaceSecPerKm?: number | null; // Moving average pace in sec/km
  bestPaceSecPerKm?: number | null; // Best pace over a valid sustained GPS interval
  currentElevationM: number | null;
  startElevationM: number | null;
  endElevationM: number | null;
  elevationGainM: number;
  elevationLossM: number;
  hasElevationData?: boolean;
  gpsAccuracyM: number | null;
  gpsStatus: GPSStatus;
  recordedPointsCount: number;
}

export interface GPSQualityAssessment {
  totalPoints: number;
  validPoints: number;
  avgAccuracyM: number | null;
  lostSignalIncidents: number;
  samplingIntervalSec: number;
  completenessPercent: number;
  qualityRating: 'Optimal' | 'Good' | 'Fair' | 'Degraded';
}

export interface ActivityRecord {
  id: string;
  sportType?: SportType;
  title: string;
  notes?: string;
  startTime: number;
  endTime: number;
  stats: ActivityStats;
  points: GPSPoint[];
  splits: KilometerSplit[];
  gpsQuality: GPSQualityAssessment;
  interruptions?: TrackingInterruption[];
  syncedUserId?: string;
  syncedAt?: number;
  clientUpdatedAt?: number;
}

export interface ActiveSessionSnapshot {
  id: 'current_active_session';
  sessionId: string;
  sportType: SportType;
  unit: UnitSystem;
  trackingState: 'recording' | 'paused' | 'finished';
  startedAt: number;
  lastSavedAt: number;
  stats: ActivityStats;
  points: GPSPoint[];
  splits: KilometerSplit[];
  interruptions: TrackingInterruption[];
  settings: {
    autoPause: boolean;
    accuracyFilter: AccuracyFilterLevel;
  };
  splitCursor: {
    startKm: number;
    startTime: number;
    startMovingSec: number;
    startElevGain: number;
    startElevLoss: number;
  };
  filterSnapshot: {
    smoothedAltitude: number | null;
    elevationGain: number;
    elevationLoss: number;
    hasElevationData: boolean;
    totalCumulativeDistanceKm: number;
    bestPaceSecPerKm: number | null;
  };
}

export interface OfflineRegion {
  id: string;
  name: string;
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  minZoom: number;
  maxZoom: number;
  tileCount: number;
  sizeBytes: number;
  createdAt: number;
}

export type UnitSystem = 'metric' | 'imperial';

export type MapStyle = 'street' | 'topo' | 'dark' | 'voyager' | 'satellite';

export interface DigitalRoutePoint {
  lat: number;
  lng: number;
  altitude: number; // meters
  distanceKm: number; // cumulative distance from start
  gradientPercent: number; // calculated slope (%)
  surface: 'smooth_asphalt' | 'paved_bike_lane' | 'rough_asphalt';
  name?: string;
  isPeak?: boolean;
  isValley?: boolean;
}

export interface DigitalRoute {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  category: 'curated' | 'generated' | 'saved';
  difficulty: 'Mudah (Datar)' | 'Sedang (Rolling)' | 'Tantangan (Tanjakan)' | 'Ekstrem (HC Climb)';
  climbCategory?: 'Cat 4' | 'Cat 3' | 'Cat 2' | 'Cat 1' | 'HC' | 'Datar / Flat';
  distanceKm: number;
  elevationGainM: number;
  elevationLossM: number;
  maxGradientPercent: number;
  avgGradientPercent: number;
  minAltitudeM: number;
  maxAltitudeM: number;
  estimatedTimeMinutes: number;
  surfaceSuitability: {
    smoothAsphaltPercent: number;
    bikeLanePercent: number;
    trafficLevel: 'Rendah (Pagi Hari)' | 'Sedang' | 'Terkendali';
  };
  recommendedTime: string;
  points: DigitalRoutePoint[];
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  isOfflineCached?: boolean;
  cachedTileCount?: number;
  cachedAt?: number;
}
