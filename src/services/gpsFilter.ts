import {
  GPSPoint,
  GPSQualityAssessment,
  SportType,
  AccuracyFilterLevel,
} from '../types/cycling';

// Earth mean radius in kilometers
const EARTH_RADIUS_KM = 6371.0088;

/**
 * Calculates great-circle distance between two GPS coordinates using Haversine formula
 */
export function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/**
 * Calculate bearing/heading from point 1 to point 2 in degrees (0 - 360)
 */
export function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const y = Math.sin(((lon2 - lon1) * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.cos(((lon2 - lon1) * Math.PI) / 180);
  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (bearing + 360) % 360;
}

export interface RawGeolocationData {
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number;
  speed: number | null; // in m/s from browser Geolocation API
  heading: number | null;
  timestamp: number;
}

export interface FilterResult {
  isValid: boolean;
  isWeakSignal?: boolean;
  rejectReason?: string;
  point?: GPSPoint;
  isStationary: boolean;
}

interface SportPhysicsProfile {
  maxSpeedKmH: number;
  maxAccelerationMs2: number;
  minMovingSpeedKmH: number;
  minAnchorDistanceM: number;
  bestPaceMinDurationSec: number;
  bestPaceMinDistanceKm: number;
  minRealisticPaceSecPerKm: number;
}

const SPORT_PROFILES: Record<SportType, SportPhysicsProfile> = {
  cycling: {
    maxSpeedKmH: 108, // 30 m/s fast descent ceiling
    maxAccelerationMs2: 6.5,
    minMovingSpeedKmH: 1.8, // 0.50 m/s
    minAnchorDistanceM: 2.0,
    bestPaceMinDurationSec: 15,
    bestPaceMinDistanceKm: 0.08, // at least 80m sustained segment
    minRealisticPaceSecPerKm: 35, // ~102 km/h
  },
  running: {
    maxSpeedKmH: 38, // 10.55 m/s sprint ceiling; rejects GPS teleports
    maxAccelerationMs2: 4.8,
    minMovingSpeedKmH: 1.4, // 0.39 m/s walk/jog threshold
    minAnchorDistanceM: 1.8,
    bestPaceMinDurationSec: 12,
    bestPaceMinDistanceKm: 0.035, // at least 35m & 12s valid GPS segment
    minRealisticPaceSecPerKm: 115, // ~1:55/km world-class bound
  },
};

export function getMaxAccuracyMeters(level: AccuracyFilterLevel): number {
  switch (level) {
    case 'strict':
      return 25;
    case 'relaxed':
      return 75;
    case 'balanced':
    default:
      return 45;
  }
}

export class GPSTrackerFilter {
  private sportType: SportType = 'cycling';
  private accuracyLevel: AccuracyFilterLevel = 'balanced';

  private lastRawTimestamp = 0;
  private lastValidPoint: GPSPoint | null = null;
  // Anchor point where distance was last accumulated (prevents stationary jitter while preserving slow jogging distance)
  private distanceAnchorPoint: { lat: number; lng: number; accuracy: number; timestamp: number } | null = null;
  private reanchorNextPoint = false;

  private smoothedAltitude: number | null = null;
  private hasElevationData = false;
  private elevationGain = 0;
  private elevationLoss = 0;
  private elevState: 'climbing' | 'descending' | 'flat' = 'flat';
  private extremeAltitude: number | null = null;
  private recentAltitudes: number[] = [];

  private totalCumulativeDistanceKm = 0;
  private recentSpeeds: number[] = [];

  // Rolling window of valid moving points to compute genuine Best Pace
  private paceWindow: { timestamp: number; cumulativeDistance: number; accuracy: number }[] = [];
  private bestPaceSecPerKm: number | null = null;

  private readonly MAX_ROAD_GRADIENT_PERCENT = 28;
  private readonly MAX_VERTICAL_CLIMB_SPEED_MS = 2.2;
  private readonly MAX_VERTICAL_DESCENT_SPEED_MS = 4.2;
  private readonly ELEVATION_HYSTERESIS_THRESHOLD = 2.8;

  public configure(sport: SportType, accuracyLevel: AccuracyFilterLevel): void {
    this.sportType = sport;
    this.accuracyLevel = accuracyLevel;
  }

  public reset(): void {
    this.lastRawTimestamp = 0;
    this.lastValidPoint = null;
    this.distanceAnchorPoint = null;
    this.reanchorNextPoint = false;
    this.smoothedAltitude = null;
    this.hasElevationData = false;
    this.elevationGain = 0;
    this.elevationLoss = 0;
    this.elevState = 'flat';
    this.extremeAltitude = null;
    this.recentAltitudes = [];
    this.totalCumulativeDistanceKm = 0;
    this.recentSpeeds = [];
    this.paceWindow = [];
    this.bestPaceSecPerKm = null;
  }

  /**
   * Called after Pause -> Resume or OS suspension discontinuity so straight-line displacement during pause is NOT added to distance
   */
  public markDiscontinuity(): void {
    this.reanchorNextPoint = true;
    this.recentSpeeds = [];
    this.paceWindow = [];
  }

  /**
   * Restores filter state when recovering an unfinished session after page reload
   */
  public hydrate(params: {
    sportType: SportType;
    accuracyLevel: AccuracyFilterLevel;
    lastPoint: GPSPoint | null;
    smoothedAltitude: number | null;
    elevationGain: number;
    elevationLoss: number;
    hasElevationData: boolean;
    totalCumulativeDistanceKm: number;
    bestPaceSecPerKm: number | null;
  }): void {
    this.sportType = params.sportType;
    this.accuracyLevel = params.accuracyLevel;
    this.lastValidPoint = params.lastPoint;
    this.distanceAnchorPoint = params.lastPoint
      ? {
          lat: params.lastPoint.lat,
          lng: params.lastPoint.lng,
          accuracy: params.lastPoint.accuracy,
          timestamp: params.lastPoint.timestamp,
        }
      : null;
    this.reanchorNextPoint = true; // Next point after reload re-anchors safely
    this.smoothedAltitude = params.smoothedAltitude;
    this.extremeAltitude = params.smoothedAltitude;
    this.elevationGain = params.elevationGain;
    this.elevationLoss = params.elevationLoss;
    this.hasElevationData = params.hasElevationData;
    this.totalCumulativeDistanceKm = params.totalCumulativeDistanceKm;
    this.bestPaceSecPerKm = params.bestPaceSecPerKm;
    this.recentSpeeds = [];
    this.paceWindow = [];
  }

  public getSnapshotState() {
    return {
      smoothedAltitude: this.smoothedAltitude,
      elevationGain: Math.round(this.elevationGain),
      elevationLoss: Math.round(this.elevationLoss),
      hasElevationData: this.hasElevationData,
      totalCumulativeDistanceKm: this.totalCumulativeDistanceKm,
      bestPaceSecPerKm: this.bestPaceSecPerKm,
    };
  }

  public getBestPaceSecPerKm(): number | null {
    return this.bestPaceSecPerKm;
  }

  public getTotalDistanceKm(): number {
    return this.totalCumulativeDistanceKm;
  }

  public getElevationStats(): { gain: number; loss: number; current: number | null; hasData: boolean } {
    return {
      gain: Math.round(this.elevationGain),
      loss: Math.round(this.elevationLoss),
      current: this.smoothedAltitude !== null ? Math.round(this.smoothedAltitude * 10) / 10 : null,
      hasData: this.hasElevationData,
    };
  }

  /**
   * Validates raw sensor readout for Idle / Paused preview WITHOUT mutating recorded route distance or elevation gain.
   */
  public previewSensorPoint(raw: RawGeolocationData): {
    isValid: boolean;
    isWeakSignal: boolean;
    lat?: number;
    lng?: number;
    altitude: number | null;
    speedKmH: number | null;
    heading: number | null;
    accuracy: number;
    timestamp: number;
  } {
    if (
      isNaN(raw.latitude) ||
      isNaN(raw.longitude) ||
      raw.latitude < -90 ||
      raw.latitude > 90 ||
      raw.longitude < -180 ||
      raw.longitude > 180 ||
      isNaN(raw.accuracy) ||
      raw.accuracy <= 0
    ) {
      return {
        isValid: false,
        isWeakSignal: true,
        altitude: null,
        speedKmH: null,
        heading: null,
        accuracy: raw.accuracy || 999,
        timestamp: raw.timestamp || Date.now(),
      };
    }

    const profile = SPORT_PROFILES[this.sportType];
    const maxAcc = getMaxAccuracyMeters(this.accuracyLevel);
    const isWeak = raw.accuracy > maxAcc;

    const hasValidAlt =
      raw.altitude !== null &&
      raw.altitude !== undefined &&
      !isNaN(raw.altitude) &&
      raw.altitude >= -430 &&
      raw.altitude <= 8848;

    let speedKmH: number | null = null;
    if (!isWeak && raw.speed !== null && raw.speed !== undefined && !isNaN(raw.speed) && raw.speed >= 0) {
      const s = raw.speed * 3.6;
      speedKmH = s < 0.7 ? 0 : Math.min(profile.maxSpeedKmH, Math.round(s * 10) / 10);
    } else if (!isWeak) {
      speedKmH = 0;
    }

    return {
      isValid: raw.accuracy <= 150, // Allow broad map location pin up to 150m in standby preview
      isWeakSignal: isWeak,
      lat: raw.latitude,
      lng: raw.longitude,
      altitude: hasValidAlt ? Math.round(raw.altitude! * 10) / 10 : null,
      speedKmH,
      heading: raw.heading !== null && !isNaN(raw.heading) ? Math.round(raw.heading) : null,
      accuracy: Math.round(raw.accuracy),
      timestamp: raw.timestamp || Date.now(),
    };
  }

  /**
   * Process a new raw GPS coordinate strictly during active recording.
   * Rejects duplicate timestamps, weak accuracy fixes, coordinate teleports, and stationary drift.
   */
  public processPoint(raw: RawGeolocationData): FilterResult {
    // 1. Validate coordinate bounds
    if (
      isNaN(raw.latitude) ||
      isNaN(raw.longitude) ||
      raw.latitude < -90 ||
      raw.latitude > 90 ||
      raw.longitude < -180 ||
      raw.longitude > 180 ||
      isNaN(raw.accuracy) ||
      raw.accuracy <= 0
    ) {
      return { isValid: false, rejectReason: 'Koordinat tidak valid', isStationary: true };
    }

    const now = raw.timestamp || Date.now();

    // 2. Prevent duplicate timestamp / double distance calculation
    if (this.lastRawTimestamp > 0 && now <= this.lastRawTimestamp) {
      return {
        isValid: false,
        rejectReason: 'Duplikat sampel waktu GPS diabaikan',
        isStationary: true,
      };
    }

    // Also ignore identical coordinate within < 300ms
    if (
      this.lastValidPoint &&
      now - this.lastValidPoint.timestamp < 300 &&
      Math.abs(raw.latitude - this.lastValidPoint.lat) < 1e-7 &&
      Math.abs(raw.longitude - this.lastValidPoint.lng) < 1e-7
    ) {
      return {
        isValid: false,
        rejectReason: 'Sampel koordinat identik beruntun',
        isStationary: true,
      };
    }

    const profile = SPORT_PROFILES[this.sportType];
    const maxAcceptableAccuracy = getMaxAccuracyMeters(this.accuracyLevel);

    // 3. Reject weak GPS accuracy so inaccurate jumps never pollute polyline or distance
    if (raw.accuracy > maxAcceptableAccuracy) {
      return {
        isValid: false,
        isWeakSignal: true,
        rejectReason: `Sinyal GPS lemah (±${Math.round(raw.accuracy)}m > batas ${maxAcceptableAccuracy}m)`,
        isStationary: true,
      };
    }

    this.lastRawTimestamp = now;

    const hasValidRawAlt =
      raw.altitude !== null &&
      raw.altitude !== undefined &&
      !isNaN(raw.altitude) &&
      raw.altitude >= -430 &&
      raw.altitude <= 8848;

    if (hasValidRawAlt) {
      this.hasElevationData = true;
    }

    // 4. First valid point OR first point after Resume / Discontinuity
    if (!this.lastValidPoint || this.reanchorNextPoint) {
      this.reanchorNextPoint = false;

      const initialSpeedKmH =
        raw.speed !== null && raw.speed !== undefined && !isNaN(raw.speed) && raw.speed >= 0.3
          ? Math.min(profile.maxSpeedKmH, raw.speed * 3.6)
          : 0;

      if (hasValidRawAlt && this.smoothedAltitude === null) {
        const initAlt = Math.round(raw.altitude! * 10) / 10;
        this.smoothedAltitude = initAlt;
        this.extremeAltitude = initAlt;
        this.recentAltitudes = [initAlt];
      }

      const isMoving = initialSpeedKmH >= profile.minMovingSpeedKmH;
      const anchorPt: GPSPoint = {
        lat: raw.latitude,
        lng: raw.longitude,
        altitude: this.smoothedAltitude,
        speed: Math.round(initialSpeedKmH * 10) / 10,
        accuracy: Math.round(raw.accuracy),
        heading: raw.heading !== null && !isNaN(raw.heading) ? Math.round(raw.heading) : null,
        timestamp: now,
        distanceDelta: 0,
        cumulativeDistance: this.totalCumulativeDistanceKm,
        isMoving,
      };

      this.lastValidPoint = anchorPt;
      this.distanceAnchorPoint = {
        lat: raw.latitude,
        lng: raw.longitude,
        accuracy: raw.accuracy,
        timestamp: now,
      };
      this.recentSpeeds = [initialSpeedKmH];
      return { isValid: true, point: anchorPt, isStationary: !isMoving };
    }

    // 5. Compute delta from lastValidPoint for velocity/spike verification
    const timeDeltaSeconds = Math.max(0.1, (now - this.lastValidPoint.timestamp) / 1000);
    const stepDistanceKm = haversineDistanceKm(
      this.lastValidPoint.lat,
      this.lastValidPoint.lng,
      raw.latitude,
      raw.longitude
    );
    const stepDistanceMeters = stepDistanceKm * 1000;

    // 6. Coordinate Spike / Teleport Gate (checked ALWAYS, even if hardware speed is present!)
    const uncertaintyBufferM = Math.min(18, (raw.accuracy + this.lastValidPoint.accuracy) * 0.45);
    const excessStepMeters = Math.max(0, stepDistanceMeters - uncertaintyBufferM);
    const effectiveImpliedSpeedKmH = (excessStepMeters / timeDeltaSeconds) * 3.6;

    if (effectiveImpliedSpeedKmH > profile.maxSpeedKmH) {
      return {
        isValid: false,
        rejectReason: `Lonjakan koordinat GPS tidak masuk akal (${Math.round(effectiveImpliedSpeedKmH)} km/h)`,
        isStationary: false,
      };
    }

    // Acceleration plausibility check over short intervals
    const rawImpliedSpeedMs = stepDistanceMeters / timeDeltaSeconds;
    const prevSpeedMs = this.lastValidPoint.speed / 3.6;
    if (
      timeDeltaSeconds <= 4.0 &&
      stepDistanceMeters > 22 &&
      (rawImpliedSpeedMs - prevSpeedMs) / timeDeltaSeconds > profile.maxAccelerationMs2 * 1.6
    ) {
      return {
        isValid: false,
        rejectReason: 'Akselerasi lonjakan GPS tidak wajar',
        isStationary: false,
      };
    }

    // 7. Real-time Speed Calculation
    let instantSpeedKmH = 0;
    const hasHardwareSpeed =
      raw.speed !== null &&
      raw.speed !== undefined &&
      !isNaN(raw.speed) &&
      raw.speed >= 0;

    const impliedStepSpeedKmH = (stepDistanceKm / timeDeltaSeconds) * 3600;

    if (hasHardwareSpeed) {
      const dopplerKmH = raw.speed! * 3.6;
      // Cross-check Doppler against geometric movement so stuck hardware speed or zero-movement noise doesn't mislead
      if (dopplerKmH < 0.7) {
        instantSpeedKmH = 0;
      } else if (dopplerKmH > profile.maxSpeedKmH) {
        instantSpeedKmH = Math.min(profile.maxSpeedKmH, impliedStepSpeedKmH);
      } else {
        instantSpeedKmH = dopplerKmH;
      }
    } else {
      if (stepDistanceMeters < profile.minAnchorDistanceM * 0.6 && timeDeltaSeconds < 2.5) {
        instantSpeedKmH = 0;
      } else {
        instantSpeedKmH = Math.min(profile.maxSpeedKmH, impliedStepSpeedKmH);
      }
    }

    this.recentSpeeds.push(instantSpeedKmH);
    if (this.recentSpeeds.length > 3) {
      this.recentSpeeds.shift();
    }

    let smoothedSpeedKmH = instantSpeedKmH;
    if (!hasHardwareSpeed && this.recentSpeeds.length >= 2) {
      smoothedSpeedKmH = this.recentSpeeds.reduce((a, b) => a + b, 0) / this.recentSpeeds.length;
    }

    const isMoving = smoothedSpeedKmH >= profile.minMovingSpeedKmH;

    // 8. Anchor-Based Distance Accumulation (Eliminates stationary drift AND avoids double counting)
    let deltaToAccumulateKm = 0;
    if (!this.distanceAnchorPoint) {
      this.distanceAnchorPoint = {
        lat: raw.latitude,
        lng: raw.longitude,
        accuracy: raw.accuracy,
        timestamp: now,
      };
    } else {
      const anchorDistKm = haversineDistanceKm(
        this.distanceAnchorPoint.lat,
        this.distanceAnchorPoint.lng,
        raw.latitude,
        raw.longitude
      );
      const anchorDistMeters = anchorDistKm * 1000;
      const anchorGateMeters = Math.max(
        profile.minAnchorDistanceM,
        Math.min(6.5, raw.accuracy * 0.28)
      );

      if (isMoving && anchorDistMeters >= anchorGateMeters) {
        // Sanity check implied speed from anchor
        const anchorDtSec = Math.max(0.2, (now - this.distanceAnchorPoint.timestamp) / 1000);
        const anchorSpeedKmH = (anchorDistKm / anchorDtSec) * 3600;
        if (anchorSpeedKmH <= profile.maxSpeedKmH * 1.15) {
          deltaToAccumulateKm = anchorDistKm;
          this.totalCumulativeDistanceKm += anchorDistKm;
          this.distanceAnchorPoint = {
            lat: raw.latitude,
            lng: raw.longitude,
            accuracy: raw.accuracy,
            timestamp: now,
          };
        }
      }
    }

    // 9. Valid-Interval Best Pace Computation
    if (isMoving && raw.accuracy <= 28) {
      this.paceWindow.push({
        timestamp: now,
        cumulativeDistance: this.totalCumulativeDistanceKm,
        accuracy: raw.accuracy,
      });

      // Prune entries older than 35 seconds
      const cutoff = now - 35000;
      while (this.paceWindow.length > 0 && this.paceWindow[0].timestamp < cutoff) {
        this.paceWindow.shift();
      }

      // Evaluate valid intervals meeting minimum duration & minimum distance
      for (let i = 0; i < this.paceWindow.length - 1; i++) {
        const startSample = this.paceWindow[i];
        const dtSec = (now - startSample.timestamp) / 1000;
        const dKm = this.totalCumulativeDistanceKm - startSample.cumulativeDistance;

        if (dtSec >= profile.bestPaceMinDurationSec && dKm >= profile.bestPaceMinDistanceKm) {
          const intervalPaceSecPerKm = dtSec / dKm;
          const intervalSpeedKmH = 3600 / intervalPaceSecPerKm;
          if (
            intervalPaceSecPerKm >= profile.minRealisticPaceSecPerKm &&
            intervalSpeedKmH <= profile.maxSpeedKmH
          ) {
            const roundedPace = Math.round(intervalPaceSecPerKm);
            if (this.bestPaceSecPerKm === null || roundedPace < this.bestPaceSecPerKm) {
              this.bestPaceSecPerKm = roundedPace;
            }
          }
        }
      }
    } else if (!isMoving) {
      // Clear continuous pace window when user stops so stops don't distort interval bounds
      this.paceWindow = [];
    }

    // 10. Elevation Smoothing & Gain/Loss Accumulation (only when altitude is genuinely provided by device)
    let finalAltitude = this.smoothedAltitude;
    if (hasValidRawAlt) {
      const rawAlt = raw.altitude!;
      this.recentAltitudes.push(rawAlt);
      if (this.recentAltitudes.length > 5) {
        this.recentAltitudes.shift();
      }

      const sorted = [...this.recentAltitudes].sort((a, b) => a - b);
      const medianAlt = sorted[Math.floor(sorted.length / 2)];

      if (this.smoothedAltitude === null) {
        this.smoothedAltitude = medianAlt;
        this.extremeAltitude = medianAlt;
        finalAltitude = Math.round(medianAlt * 10) / 10;
      } else {
        const maxVerticalFromDistance = Math.max(0.3, stepDistanceMeters * (this.MAX_ROAD_GRADIENT_PERCENT / 100));
        const maxClimbFromTime = timeDeltaSeconds * this.MAX_VERTICAL_CLIMB_SPEED_MS;
        const maxDescentFromTime = timeDeltaSeconds * this.MAX_VERTICAL_DESCENT_SPEED_MS;

        const maxAllowedRise = isMoving
          ? Math.max(0.4, Math.min(maxVerticalFromDistance, maxClimbFromTime))
          : Math.min(0.15, timeDeltaSeconds * 0.08);

        const maxAllowedFall = isMoving
          ? Math.max(0.4, Math.min(maxVerticalFromDistance, maxDescentFromTime))
          : Math.min(0.15, timeDeltaSeconds * 0.08);

        const clampedAlt = Math.max(
          this.smoothedAltitude - maxAllowedFall,
          Math.min(this.smoothedAltitude + maxAllowedRise, medianAlt)
        );

        this.smoothedAltitude = this.smoothedAltitude * 0.75 + clampedAlt * 0.25;
        finalAltitude = Math.round(this.smoothedAltitude * 10) / 10;

        if (isMoving && deltaToAccumulateKm > 0) {
          const curr = this.smoothedAltitude;
          if (this.extremeAltitude === null) {
            this.extremeAltitude = curr;
          } else if (this.elevState === 'climbing') {
            if (curr > this.extremeAltitude) {
              this.elevationGain += curr - this.extremeAltitude;
              this.extremeAltitude = curr;
            } else if (this.extremeAltitude - curr >= this.ELEVATION_HYSTERESIS_THRESHOLD) {
              this.elevState = 'descending';
              this.elevationLoss += this.extremeAltitude - curr;
              this.extremeAltitude = curr;
            }
          } else if (this.elevState === 'descending') {
            if (curr < this.extremeAltitude) {
              this.elevationLoss += this.extremeAltitude - curr;
              this.extremeAltitude = curr;
            } else if (curr - this.extremeAltitude >= this.ELEVATION_HYSTERESIS_THRESHOLD) {
              this.elevState = 'climbing';
              this.elevationGain += curr - this.extremeAltitude;
              this.extremeAltitude = curr;
            }
          } else {
            if (curr - this.extremeAltitude >= this.ELEVATION_HYSTERESIS_THRESHOLD) {
              this.elevState = 'climbing';
              this.elevationGain += curr - this.extremeAltitude;
              this.extremeAltitude = curr;
            } else if (this.extremeAltitude - curr >= this.ELEVATION_HYSTERESIS_THRESHOLD) {
              this.elevState = 'descending';
              this.elevationLoss += this.extremeAltitude - curr;
              this.extremeAltitude = curr;
            }
          }
        }
      }
    }

    // 11. Bearing / Heading
    let calculatedHeading = raw.heading;
    if (calculatedHeading === null || isNaN(calculatedHeading)) {
      if (isMoving && stepDistanceMeters > 2.0) {
        calculatedHeading = calculateBearing(
          this.lastValidPoint.lat,
          this.lastValidPoint.lng,
          raw.latitude,
          raw.longitude
        );
      } else {
        calculatedHeading = this.lastValidPoint.heading;
      }
    }

    const newPoint: GPSPoint = {
      lat: raw.latitude,
      lng: raw.longitude,
      altitude: hasValidRawAlt ? finalAltitude : null,
      speed: Math.round(smoothedSpeedKmH * 10) / 10,
      accuracy: Math.round(raw.accuracy),
      heading: calculatedHeading !== null ? Math.round(calculatedHeading) : null,
      timestamp: now,
      distanceDelta: deltaToAccumulateKm,
      cumulativeDistance: this.totalCumulativeDistanceKm,
      isMoving,
    };

    this.lastValidPoint = newPoint;

    return {
      isValid: true,
      point: newPoint,
      isStationary: !isMoving,
    };
  }
}

/**
 * Assess overall GPS telemetry quality without inventing fake accuracy numbers when < 2 points exist
 */
export function assessGPSQuality(
  points: GPSPoint[],
  durationSeconds: number,
  extraLostIncidents: number = 0
): GPSQualityAssessment {
  if (points.length === 0) {
    return {
      totalPoints: 0,
      validPoints: 0,
      avgAccuracyM: null,
      lostSignalIncidents: extraLostIncidents,
      samplingIntervalSec: 0,
      completenessPercent: 0,
      qualityRating: 'Degraded',
    };
  }

  let totalAccuracy = 0;
  let lostSignalCount = extraLostIncidents;
  let totalIntervals = 0;

  for (let i = 0; i < points.length; i++) {
    totalAccuracy += points[i].accuracy;
    if (i > 0) {
      const timeGap = (points[i].timestamp - points[i - 1].timestamp) / 1000;
      totalIntervals += timeGap;
      if (timeGap > 10) {
        lostSignalCount++;
      }
    }
  }

  const avgAccuracy = Math.round(totalAccuracy / points.length);
  const avgInterval = points.length > 1 ? Math.max(1, Math.round(totalIntervals / (points.length - 1))) : 1;
  const expectedPoints = Math.max(1, Math.round(durationSeconds / Math.max(1, avgInterval)));
  const completeness = Math.min(100, Math.round((points.length / expectedPoints) * 100));

  let qualityRating: 'Optimal' | 'Good' | 'Fair' | 'Degraded' = 'Good';
  if (avgAccuracy <= 10 && lostSignalCount === 0) qualityRating = 'Optimal';
  else if (avgAccuracy <= 20 && lostSignalCount <= 2) qualityRating = 'Good';
  else if (avgAccuracy <= 35 && lostSignalCount <= 5) qualityRating = 'Fair';
  else qualityRating = 'Degraded';

  return {
    totalPoints: points.length,
    validPoints: points.length,
    avgAccuracyM: avgAccuracy,
    lostSignalIncidents: lostSignalCount,
    samplingIntervalSec: avgInterval,
    completenessPercent: completeness,
    qualityRating,
  };
}

/**
 * Accurately calculate elevation gain and loss from an array of GPS points.
 */
export function calculateAccurateElevation(
  points: GPSPoint[],
  hysteresisThreshold = 2.8
): { gain: number; loss: number; current: number | null; hasData: boolean; smoothedPoints: GPSPoint[] } {
  if (points.length === 0) {
    return { gain: 0, loss: 0, current: null, hasData: false, smoothedPoints: [] };
  }

  const validAlts = points
    .map((p) => p.altitude)
    .filter((a): a is number => a !== null && !isNaN(a) && a >= -430 && a <= 8848);

  if (validAlts.length === 0) {
    return { gain: 0, loss: 0, current: null, hasData: false, smoothedPoints: points };
  }

  const smoothedAlts: (number | null)[] = [];
  const WINDOW_SIZE = 5;
  const HALF_WINDOW = Math.floor(WINDOW_SIZE / 2);

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    if (pt.altitude === null || isNaN(pt.altitude) || pt.altitude < -430 || pt.altitude > 8848) {
      smoothedAlts.push(null);
      continue;
    }

    const neighborhood: number[] = [];
    for (
      let j = Math.max(0, i - HALF_WINDOW);
      j <= Math.min(points.length - 1, i + HALF_WINDOW);
      j++
    ) {
      const a = points[j].altitude;
      if (a !== null && !isNaN(a) && a >= -430 && a <= 8848) {
        neighborhood.push(a);
      }
    }

    if (neighborhood.length === 0) {
      smoothedAlts.push(pt.altitude);
    } else {
      neighborhood.sort((a, b) => a - b);
      const med = neighborhood[Math.floor(neighborhood.length / 2)];
      smoothedAlts.push(Math.round(med * 10) / 10);
    }
  }

  let gain = 0;
  let loss = 0;
  let state: 'flat' | 'climbing' | 'descending' = 'flat';
  let extremeAlt: number | null = null;

  for (let i = 0; i < points.length; i++) {
    const alt = smoothedAlts[i];
    const pt = points[i];
    if (alt === null) continue;

    if (extremeAlt === null) {
      extremeAlt = alt;
      continue;
    }

    const isMoving =
      pt.isMoving ||
      (i > 0 && pt.cumulativeDistance > points[i - 1].cumulativeDistance + 0.0007);
    if (!isMoving) continue;

    if (state === 'climbing') {
      if (alt > extremeAlt) {
        gain += alt - extremeAlt;
        extremeAlt = alt;
      } else if (extremeAlt - alt >= hysteresisThreshold) {
        state = 'descending';
        loss += extremeAlt - alt;
        extremeAlt = alt;
      }
    } else if (state === 'descending') {
      if (alt < extremeAlt) {
        loss += extremeAlt - alt;
        extremeAlt = alt;
      } else if (alt - extremeAlt >= hysteresisThreshold) {
        state = 'climbing';
        gain += alt - extremeAlt;
        extremeAlt = alt;
      }
    } else {
      if (alt - extremeAlt >= hysteresisThreshold) {
        state = 'climbing';
        gain += alt - extremeAlt;
        extremeAlt = alt;
      } else if (extremeAlt - alt >= hysteresisThreshold) {
        state = 'descending';
        loss += extremeAlt - alt;
        extremeAlt = alt;
      }
    }
  }

  const smoothedPoints = points.map((p, idx) => ({
    ...p,
    altitude: smoothedAlts[idx] ?? p.altitude,
  }));

  const lastAlt = [...smoothedAlts].reverse().find((a) => a !== null) ?? null;

  return {
    gain: Math.round(gain),
    loss: Math.round(loss),
    current: lastAlt,
    hasData: true,
    smoothedPoints,
  };
}
