import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  getDocFromServer,
  Timestamp,
  DocumentSnapshot,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  ActivityRecord,
  ActivityStats,
  GPSPoint,
  KilometerSplit,
  GPSQualityAssessment,
  TrackingInterruption,
  SportType,
  GPSStatus,
} from '../types/cycling';
import { getActivities, saveActivity, deleteActivity } from './db';

// Blueprint-synchronized validation constants (must match firebase-blueprint.json & firestore.rules)
const ID_REGEX = /^[a-zA-Z0-9_-]+$/;
const MAX_ID_LEN = 128;
const MAX_EMAIL_LEN = 254;
const MAX_DISPLAY_NAME_LEN = 100;
const MAX_PHOTO_URL_LEN = 1024;
const MAX_TITLE_LEN = 200;
const MAX_NOTES_LEN = 2000;
const MAX_DELETED_IDS = 200;
const MAX_POINTS_CLOUD = 1800;
const MAX_SPLITS_CLOUD = 500;
const MAX_INTERRUPTIONS_CLOUD = 100;

export const ACTIVITIES_UPDATED_EVENT = 'ridetrack-activities-updated';

export function notifyActivitiesUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ACTIVITIES_UPDATED_EVENT));
  }
}

// Initialize Firebase App singleton
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);

// Connect to provisioned Firestore database (CRITICAL: pass firestoreDatabaseId)
export const db =
  firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
    ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
    : getFirestore(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function getReadableSyncError(err: unknown): string {
  if (!err) return 'Terjadi kesalahan saat menyinkronkan data.';
  const rawMessage = err instanceof Error ? err.message : String(err);

  // Check if error is JSON FirestoreErrorInfo
  try {
    const parsed = JSON.parse(rawMessage) as Partial<FirestoreErrorInfo>;
    if (parsed && typeof parsed.error === 'string') {
      if (parsed.error.includes('Quota exceeded')) {
        return 'Kuota harian Firestore telah tercapai. Kuota gratis akan direset esok hari.';
      }
      if (parsed.error.includes('offline') || parsed.error.includes('unavailable')) {
        return 'Perangkat sedang offline atau koneksi ke server Cloud terputus.';
      }
      if (parsed.error.includes('Missing or insufficient permissions')) {
        if (parsed.authInfo && parsed.authInfo.emailVerified === false) {
          return 'Akun email belum terverifikasi. Gunakan akun Google (Gmail) yang aktif.';
        }
        return 'Izin akses Cloud ditolak oleh sistem keamanan. Silakan keluar lalu masuk kembali dengan akun Gmail Anda.';
      }
      return `Kendala sinkronisasi Cloud: ${parsed.error}`;
    }
  } catch {
    // Not JSON, inspect raw Firebase Auth / network error
  }

  const code = (err as { code?: string })?.code || '';
  if (code.includes('popup-closed-by-user')) {
    return 'Jendela login Google ditutup sebelum proses masuk selesai.';
  }
  if (code.includes('popup-blocked')) {
    return 'Popup login Google diblokir oleh browser. Izinkan popup pada browser Anda lalu coba lagi.';
  }
  if (code.includes('cancelled-popup-request')) {
    return 'Permintaan jendela login sebelumnya dibatalkan. Silakan tekan tombol masuk sekali lagi.';
  }
  if (code.includes('network-request-failed') || rawMessage.includes('offline')) {
    return 'Gagal terhubung ke jaringan internet. Periksa koneksi Wi-Fi / data seluler Anda.';
  }
  if (code.includes('unauthorized-domain')) {
    return 'Domain aplikasi belum diizinkan pada konfigurasi Firebase Auth.';
  }
  if (rawMessage.includes('Quota exceeded')) {
    return 'Kuota harian Cloud telah tercapai dan akan pulih otomatis besok.';
  }

  return rawMessage || 'Gagal menyinkronkan data ke akun Gmail.';
}

// Initial connection validation on boot
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('email');
googleProvider.addScope('profile');
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Track which UIDs already have a verified /users/{uid} document in this session
const ensuredProfileUids = new Set<string>();

function sanitizeFiniteNumber(val: unknown, fallback = 0): number {
  if (typeof val === 'number' && Number.isFinite(val)) {
    return Number(val.toFixed(6));
  }
  return fallback;
}

function sanitizeNullableNumber(val: unknown): number | null {
  if (typeof val === 'number' && Number.isFinite(val)) {
    return Number(val.toFixed(6));
  }
  return null;
}

function sanitizeString(val: unknown, maxLen: number, fallback = ''): string {
  const str = typeof val === 'string' ? val.trim() : fallback;
  return str.slice(0, maxLen);
}

export function sanitizeDocumentId(rawId: string): string {
  const cleaned = String(rawId || '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, MAX_ID_LEN);
  if (cleaned.length > 0 && ID_REGEX.test(cleaned)) {
    return cleaned;
  }
  return 'act_' + Date.now().toString(36);
}

/**
 * Downsample route points only if exceeding MAX_POINTS_CLOUD (1800) so document size
 * is strictly guaranteed to remain well below Firestore's 1 MiB limit while keeping
 * start, finish, speed/elevation extrema, and accurate route polyline geometry.
 */
function downsamplePointsForCloud(points: GPSPoint[]): GPSPoint[] {
  if (!Array.isArray(points) || points.length === 0) return [];
  if (points.length <= MAX_POINTS_CLOUD) return points;

  const mustKeepIndices = new Set<number>([0, points.length - 1]);
  let maxSpeedIdx = 0;
  let maxAltIdx = 0;
  let minAltIdx = 0;

  for (let i = 1; i < points.length; i++) {
    if ((points[i].speed || 0) > (points[maxSpeedIdx].speed || 0)) maxSpeedIdx = i;
    if (
      points[i].altitude !== null &&
      (points[maxAltIdx].altitude === null ||
        (points[i].altitude as number) > (points[maxAltIdx].altitude as number))
    ) {
      maxAltIdx = i;
    }
    if (
      points[i].altitude !== null &&
      (points[minAltIdx].altitude === null ||
        (points[i].altitude as number) < (points[minAltIdx].altitude as number))
    ) {
      minAltIdx = i;
    }
  }
  mustKeepIndices.add(maxSpeedIdx);
  mustKeepIndices.add(maxAltIdx);
  mustKeepIndices.add(minAltIdx);

  const remainingBudget = MAX_POINTS_CLOUD - mustKeepIndices.size;
  const step = (points.length - 1) / Math.max(1, remainingBudget);

  for (let i = 0; i < remainingBudget; i++) {
    const idx = Math.min(points.length - 1, Math.round(i * step));
    mustKeepIndices.add(idx);
  }

  return Array.from(mustKeepIndices)
    .sort((a, b) => a - b)
    .slice(0, MAX_POINTS_CLOUD)
    .map((idx) => points[idx]);
}

function sanitizeGPSPoint(pt: GPSPoint): GPSPoint {
  return {
    lat: sanitizeFiniteNumber(pt.lat, 0),
    lng: sanitizeFiniteNumber(pt.lng, 0),
    altitude: sanitizeNullableNumber(pt.altitude),
    speed: Math.max(0, sanitizeFiniteNumber(pt.speed, 0)),
    accuracy: Math.max(0, sanitizeFiniteNumber(pt.accuracy, 0)),
    heading: sanitizeNullableNumber(pt.heading),
    timestamp: Math.max(0, Math.round(sanitizeFiniteNumber(pt.timestamp, Date.now()))),
    distanceDelta: Math.max(0, sanitizeFiniteNumber(pt.distanceDelta, 0)),
    cumulativeDistance: Math.max(0, sanitizeFiniteNumber(pt.cumulativeDistance, 0)),
    isMoving: Boolean(pt.isMoving),
  };
}

function sanitizeSplit(sp: KilometerSplit, idx: number): Record<string, unknown> {
  const paceVal = sanitizeNullableNumber(sp.paceSecondsPerKm);
  return {
    kmIndex: Math.max(1, Math.round(sanitizeFiniteNumber(sp.kmIndex, idx + 1))),
    distanceKm: Math.max(0, sanitizeFiniteNumber(sp.distanceKm, 1)),
    durationSeconds: Math.max(0, sanitizeFiniteNumber(sp.durationSeconds, 0)),
    avgSpeedKmH: Math.max(0, sanitizeFiniteNumber(sp.avgSpeedKmH, 0)),
    paceSecondsPerKm: paceVal,
    elevationGainM: Math.max(0, sanitizeFiniteNumber(sp.elevationGainM, 0)),
    elevationLossM: Math.max(0, sanitizeFiniteNumber(sp.elevationLossM, 0)),
    hasElevation: Boolean(sp.hasElevation),
    startTime: Math.max(0, Math.round(sanitizeFiniteNumber(sp.startTime, 0))),
    endTime: Math.max(0, Math.round(sanitizeFiniteNumber(sp.endTime, 0))),
  };
}

function sanitizeInterruption(intr: TrackingInterruption, idx: number): TrackingInterruption {
  const validReason =
    intr.reason === 'background_suspended' ||
    intr.reason === 'gps_signal_lost' ||
    intr.reason === 'page_reloaded'
      ? intr.reason
      : 'gps_signal_lost';

  return {
    id: sanitizeDocumentId(intr.id || `intr_${idx}`),
    startTime: Math.max(0, Math.round(sanitizeFiniteNumber(intr.startTime, 0))),
    endTime: Math.max(0, Math.round(sanitizeFiniteNumber(intr.endTime, 0))),
    durationSeconds: Math.max(0, sanitizeFiniteNumber(intr.durationSeconds, 0)),
    reason: validReason,
    message: sanitizeString(intr.message, 300, 'Tracking terputus sementara'),
  };
}

function sanitizeStats(stats: ActivityStats): ActivityStats {
  const validGpsStatuses: GPSStatus[] = [
    'searching',
    'locked',
    'weak',
    'lost',
    'denied',
    'unavailable',
  ];
  const gpsStatus: GPSStatus = validGpsStatuses.includes(stats?.gpsStatus)
    ? stats.gpsStatus
    : 'locked';

  return {
    distanceKm: Math.max(0, sanitizeFiniteNumber(stats?.distanceKm, 0)),
    totalDurationSeconds: Math.max(0, sanitizeFiniteNumber(stats?.totalDurationSeconds, 0)),
    movingTimeSeconds: Math.max(0, sanitizeFiniteNumber(stats?.movingTimeSeconds, 0)),
    stoppedTimeSeconds: Math.max(0, sanitizeFiniteNumber(stats?.stoppedTimeSeconds, 0)),
    currentSpeedKmH: Math.max(0, sanitizeFiniteNumber(stats?.currentSpeedKmH, 0)),
    hasSpeedData: Boolean(stats?.hasSpeedData),
    avgSpeedKmH: Math.max(0, sanitizeFiniteNumber(stats?.avgSpeedKmH, 0)),
    overallAvgSpeedKmH: Math.max(0, sanitizeFiniteNumber(stats?.overallAvgSpeedKmH, 0)),
    maxSpeedKmH: Math.max(0, sanitizeFiniteNumber(stats?.maxSpeedKmH, 0)),
    currentPaceSecPerKm: sanitizeNullableNumber(stats?.currentPaceSecPerKm),
    avgPaceSecPerKm: sanitizeNullableNumber(stats?.avgPaceSecPerKm),
    bestPaceSecPerKm: sanitizeNullableNumber(stats?.bestPaceSecPerKm),
    currentElevationM: sanitizeNullableNumber(stats?.currentElevationM),
    startElevationM: sanitizeNullableNumber(stats?.startElevationM),
    endElevationM: sanitizeNullableNumber(stats?.endElevationM),
    elevationGainM: Math.max(0, sanitizeFiniteNumber(stats?.elevationGainM, 0)),
    elevationLossM: Math.max(0, sanitizeFiniteNumber(stats?.elevationLossM, 0)),
    hasElevationData: Boolean(stats?.hasElevationData),
    gpsAccuracyM: sanitizeNullableNumber(stats?.gpsAccuracyM),
    gpsStatus,
    recordedPointsCount: Math.max(
      0,
      Math.round(sanitizeFiniteNumber(stats?.recordedPointsCount, 0))
    ),
  };
}

function sanitizeQuality(q: GPSQualityAssessment, pointsLen: number): GPSQualityAssessment {
  const validRatings: GPSQualityAssessment['qualityRating'][] = [
    'Optimal',
    'Good',
    'Fair',
    'Degraded',
  ];
  const qualityRating = validRatings.includes(q?.qualityRating) ? q.qualityRating : 'Good';

  return {
    totalPoints: Math.max(0, Math.round(sanitizeFiniteNumber(q?.totalPoints, pointsLen))),
    validPoints: Math.max(0, Math.round(sanitizeFiniteNumber(q?.validPoints, pointsLen))),
    avgAccuracyM: sanitizeNullableNumber(q?.avgAccuracyM),
    lostSignalIncidents: Math.max(
      0,
      Math.round(sanitizeFiniteNumber(q?.lostSignalIncidents, 0))
    ),
    samplingIntervalSec: Math.max(0, sanitizeFiniteNumber(q?.samplingIntervalSec, 1)),
    completenessPercent: Math.min(
      100,
      Math.max(0, sanitizeFiniteNumber(q?.completenessPercent, 100))
    ),
    qualityRating,
  };
}

function isFirestoreTimestamp(val: unknown): val is Timestamp {
  return Boolean(
    val &&
      typeof val === 'object' &&
      typeof (val as Timestamp).toMillis === 'function' &&
      typeof (val as Timestamp).seconds === 'number'
  );
}

/**
 * Construct a strictly schema-compliant Firestore payload for ActivityRecord
 * with zero undefined fields and bounded arrays.
 */
function buildCloudActivityPayload(
  activity: ActivityRecord,
  userId: string,
  existingSnap?: DocumentSnapshot | null
): { safeId: string; payload: Record<string, unknown>; clientUpdatedAt: number } {
  const safeId = sanitizeDocumentId(activity.id);
  const sportType: SportType = activity.sportType === 'running' ? 'running' : 'cycling';
  const fallbackTitle = sportType === 'running' ? 'Aktivitas Lari' : 'Aktivitas Bersepeda';
  const safeTitle = sanitizeString(activity.title, MAX_TITLE_LEN, fallbackTitle) || fallbackTitle;
  const safeNotes = sanitizeString(activity.notes, MAX_NOTES_LEN, '');

  const safeStartTime = Math.max(
    0,
    Math.round(sanitizeFiniteNumber(activity.startTime, Date.now()))
  );
  const rawEndTime = Math.round(sanitizeFiniteNumber(activity.endTime, safeStartTime));
  const safeEndTime = Math.max(safeStartTime, rawEndTime);
  const clientUpdatedAt = Math.max(
    safeEndTime,
    Math.round(sanitizeFiniteNumber(activity.clientUpdatedAt, Date.now()))
  );

  const sampledPoints = downsamplePointsForCloud(activity.points || []).map(sanitizeGPSPoint);
  const safeSplits = Array.isArray(activity.splits)
    ? activity.splits.slice(0, MAX_SPLITS_CLOUD).map(sanitizeSplit)
    : [];
  const safeInterruptions = Array.isArray(activity.interruptions)
    ? activity.interruptions.slice(0, MAX_INTERRUPTIONS_CLOUD).map(sanitizeInterruption)
    : [];

  const existingData = existingSnap?.exists() ? existingSnap.data() : null;
  const preservedCreatedAt =
    existingData && isFirestoreTimestamp(existingData.createdAt)
      ? existingData.createdAt
      : serverTimestamp();

  const payload: Record<string, unknown> = {
    id: safeId,
    userId,
    sportType,
    title: safeTitle,
    notes: safeNotes,
    startTime: safeStartTime,
    endTime: safeEndTime,
    clientUpdatedAt,
    stats: sanitizeStats(activity.stats),
    points: sampledPoints,
    splits: safeSplits,
    gpsQuality: sanitizeQuality(activity.gpsQuality, sampledPoints.length),
    interruptions: safeInterruptions,
    createdAt: preservedCreatedAt,
    updatedAt: serverTimestamp(),
  };

  return { safeId, payload, clientUpdatedAt };
}

/**
 * Convert a Firestore document back into a clean local ActivityRecord
 */
function cloudDataToActivityRecord(
  docId: string,
  data: Record<string, unknown>,
  userId: string
): ActivityRecord {
  const sportType: SportType = data.sportType === 'running' ? 'running' : 'cycling';
  const startTime = sanitizeFiniteNumber(data.startTime, Date.now());
  const endTime = Math.max(startTime, sanitizeFiniteNumber(data.endTime, startTime));
  const updatedMillis = isFirestoreTimestamp(data.updatedAt)
    ? data.updatedAt.toMillis()
    : sanitizeFiniteNumber(data.updatedAt, endTime);
  const clientUpdatedAt = sanitizeFiniteNumber(data.clientUpdatedAt, updatedMillis);

  const rawPoints = Array.isArray(data.points) ? (data.points as GPSPoint[]) : [];
  const rawSplits = Array.isArray(data.splits) ? (data.splits as KilometerSplit[]) : [];
  const rawInterruptions = Array.isArray(data.interruptions)
    ? (data.interruptions as TrackingInterruption[])
    : [];

  const cleanSplits: KilometerSplit[] = rawSplits.map((sp, i) => ({
    kmIndex: Math.max(1, Math.round(sanitizeFiniteNumber(sp?.kmIndex, i + 1))),
    distanceKm: Math.max(0, sanitizeFiniteNumber(sp?.distanceKm, 1)),
    durationSeconds: Math.max(0, sanitizeFiniteNumber(sp?.durationSeconds, 0)),
    avgSpeedKmH: Math.max(0, sanitizeFiniteNumber(sp?.avgSpeedKmH, 0)),
    paceSecondsPerKm:
      sp?.paceSecondsPerKm !== null && sp?.paceSecondsPerKm !== undefined
        ? sanitizeFiniteNumber(sp.paceSecondsPerKm, 0)
        : undefined,
    elevationGainM: Math.max(0, sanitizeFiniteNumber(sp?.elevationGainM, 0)),
    elevationLossM: Math.max(0, sanitizeFiniteNumber(sp?.elevationLossM, 0)),
    hasElevation: Boolean(sp?.hasElevation),
    startTime: Math.max(0, Math.round(sanitizeFiniteNumber(sp?.startTime, 0))),
    endTime: Math.max(0, Math.round(sanitizeFiniteNumber(sp?.endTime, 0))),
  }));

  return {
    id: sanitizeDocumentId((data.id as string) || docId),
    sportType,
    title: sanitizeString(data.title, MAX_TITLE_LEN, 'Aktivitas GPS'),
    notes: sanitizeString(data.notes, MAX_NOTES_LEN, ''),
    startTime,
    endTime,
    stats: sanitizeStats(data.stats as ActivityStats),
    points: rawPoints.map(sanitizeGPSPoint),
    splits: cleanSplits,
    gpsQuality: sanitizeQuality(data.gpsQuality as GPSQualityAssessment, rawPoints.length),
    interruptions: rawInterruptions.map(sanitizeInterruption),
    syncedUserId: userId,
    syncedAt: Date.now(),
    clientUpdatedAt,
  };
}

/**
 * Ensure /users/{uid} exists and adheres strictly to UserProfile schema.
 * Also returns the user's deletedActivityIds set for cross-device deletion sync.
 */
async function ensureUserProfile(
  user: User,
  options?: { forceRefresh?: boolean; appendDeletedId?: string }
): Promise<{ deletedActivityIds: Set<string> }> {
  const userPath = `users/${user.uid}`;
  const userRef = doc(db, 'users', user.uid);

  if (
    !options?.forceRefresh &&
    !options?.appendDeletedId &&
    ensuredProfileUids.has(user.uid)
  ) {
    return { deletedActivityIds: new Set<string>() };
  }

  let snap: DocumentSnapshot;
  try {
    snap = await getDoc(userRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, userPath);
  }

  const existingData = snap.exists() ? snap.data() : null;
  const rawDeleted = Array.isArray(existingData?.deletedActivityIds)
    ? existingData.deletedActivityIds
    : [];

  const validDeletedList: string[] = [];
  const seen = new Set<string>();
  for (const item of rawDeleted) {
    if (typeof item === 'string' && item.length >= 1 && item.length <= MAX_ID_LEN && !seen.has(item)) {
      seen.add(item);
      validDeletedList.push(item);
    }
  }

  if (options?.appendDeletedId) {
    const cleanDelId = sanitizeDocumentId(options.appendDeletedId);
    if (!seen.has(cleanDelId)) {
      seen.add(cleanDelId);
      validDeletedList.push(cleanDelId);
    }
  }

  const boundedDeletedIds =
    validDeletedList.length > MAX_DELETED_IDS
      ? validDeletedList.slice(validDeletedList.length - MAX_DELETED_IDS)
      : validDeletedList;

  const email = sanitizeString(user.email, MAX_EMAIL_LEN, '');
  const fallbackName = email ? email.split('@')[0] : 'Atlet GPS';
  const displayName = sanitizeString(
    user.displayName || existingData?.displayName,
    MAX_DISPLAY_NAME_LEN,
    fallbackName
  );
  const photoURL = sanitizeString(
    user.photoURL || existingData?.photoURL,
    MAX_PHOTO_URL_LEN,
    ''
  );

  const preservedCreatedAt =
    existingData && isFirestoreTimestamp(existingData.createdAt)
      ? existingData.createdAt
      : serverTimestamp();

  const profilePayload = {
    id: user.uid,
    email,
    displayName,
    photoURL,
    deletedActivityIds: boundedDeletedIds,
    createdAt: preservedCreatedAt,
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(userRef, profilePayload);
    ensuredProfileUids.add(user.uid);
  } catch (error) {
    handleFirestoreError(
      error,
      snap.exists() ? OperationType.UPDATE : OperationType.CREATE,
      userPath
    );
  }

  return { deletedActivityIds: new Set(boundedDeletedIds) };
}

/**
 * Sign in using Google (Gmail account) via Popup
 */
export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  await ensureUserProfile(result.user, { forceRefresh: true });
  return result.user;
}

/**
 * Switch to another Google / Gmail account
 */
export async function switchGoogleAccount(): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.addScope('email');
  provider.addScope('profile');
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(auth, provider);
  await ensureUserProfile(result.user, { forceRefresh: true });
  return result.user;
}

/**
 * Log out of current Gmail account
 */
export async function logOut(): Promise<void> {
  ensuredProfileUids.clear();
  await signOut(auth);
}

/**
 * Upload or update a single confirmed activity to Firestore and mark local copy as synced
 */
export async function syncActivityToCloud(
  activity: ActivityRecord,
  user: User,
  existingCloudSnap?: DocumentSnapshot | null
): Promise<void> {
  await ensureUserProfile(user);

  const safeId = sanitizeDocumentId(activity.id);
  const actPath = `users/${user.uid}/activities/${safeId}`;
  const actRef = doc(db, 'users', user.uid, 'activities', safeId);

  let snapToUse = existingCloudSnap;
  if (snapToUse === undefined) {
    try {
      snapToUse = await getDoc(actRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, actPath);
    }
  }

  const { payload, clientUpdatedAt } = buildCloudActivityPayload(activity, user.uid, snapToUse);

  try {
    await setDoc(actRef, payload);
  } catch (error) {
    handleFirestoreError(
      error,
      snapToUse?.exists() ? OperationType.UPDATE : OperationType.CREATE,
      actPath
    );
  }

  // Mark local copy in IndexedDB as synced with this Gmail account
  const updatedLocalRecord: ActivityRecord = {
    ...activity,
    id: safeId,
    syncedUserId: user.uid,
    syncedAt: Date.now(),
    clientUpdatedAt,
  };
  await saveActivity(updatedLocalRecord);
  notifyActivitiesUpdated();
}

/**
 * Delete activity from Firestore and record tombstone ID on UserProfile so other devices remove it too
 */
export async function deleteCloudActivity(activityId: string, user: User): Promise<void> {
  const safeId = sanitizeDocumentId(activityId);
  await ensureUserProfile(user, { forceRefresh: true, appendDeletedId: safeId });

  const actPath = `users/${user.uid}/activities/${safeId}`;
  const actRef = doc(db, 'users', user.uid, 'activities', safeId);

  try {
    const snap = await getDoc(actRef);
    if (snap.exists()) {
      await deleteDoc(actRef);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, actPath);
  }
}

export interface SyncResult {
  syncedToCloud: number;
  syncedFromCloud: number;
  removedDeleted: number;
  totalActivities: number;
  lastSyncTime: number;
}

// Mutex promise to avoid duplicate parallel sync runs on login
let activeSyncPromise: Promise<SyncResult> | null = null;

/**
 * Perform full bidirectional cross-device synchronization between Local IndexedDB and Gmail Cloud Firestore
 */
export async function synchronizeUserData(user: User): Promise<SyncResult> {
  if (activeSyncPromise) {
    return activeSyncPromise;
  }

  activeSyncPromise = (async (): Promise<SyncResult> => {
    let syncedToCloud = 0;
    let syncedFromCloud = 0;
    let removedDeleted = 0;

    // 1. Ensure UserProfile exists & fetch cross-device deleted activity IDs
    const { deletedActivityIds } = await ensureUserProfile(user, { forceRefresh: true });

    // 2. Fetch all cloud activities belonging to this Gmail account (strictly matching allow list rule)
    const collPath = `users/${user.uid}/activities`;
    const activitiesQuery = query(
      collection(db, 'users', user.uid, 'activities'),
      where('userId', '==', user.uid)
    );

    let querySnap;
    try {
      querySnap = await getDocs(activitiesQuery);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, collPath);
    }

    const cloudSnaps = new Map<string, DocumentSnapshot>();
    const cloudRecords = new Map<string, ActivityRecord>();

    querySnap.forEach((docSnap) => {
      const cleanId = sanitizeDocumentId(docSnap.id);
      if (!deletedActivityIds.has(cleanId)) {
        cloudSnaps.set(cleanId, docSnap);
        cloudRecords.set(
          cleanId,
          cloudDataToActivityRecord(cleanId, docSnap.data() as Record<string, unknown>, user.uid)
        );
      }
    });

    // 3. Read all local activities from IndexedDB
    const localActivities = await getActivities();
    const localMap = new Map<string, ActivityRecord>();
    for (const act of localActivities) {
      localMap.set(sanitizeDocumentId(act.id), act);
    }

    // 4. Remove local activities that were deleted on another device under this Gmail account
    for (const [id, localAct] of Array.from(localMap.entries())) {
      const wasDeletedInCloud =
        deletedActivityIds.has(id) ||
        (localAct.syncedUserId === user.uid && !cloudRecords.has(id));

      if (wasDeletedInCloud) {
        await deleteActivity(localAct.id);
        localMap.delete(id);
        removedDeleted++;
      }
    }

    // 5. Upload local unsynced or newer activities to Gmail Cloud
    let firstUploadError: unknown = null;
    for (const [id, localAct] of localMap.entries()) {
      const cloudAct = cloudRecords.get(id);
      const localStamp = localAct.clientUpdatedAt || localAct.endTime || localAct.startTime || 0;
      const cloudStamp = cloudAct?.clientUpdatedAt || cloudAct?.endTime || cloudAct?.startTime || 0;

      const needsUpload = !cloudAct || localStamp > cloudStamp + 1000;
      if (needsUpload) {
        try {
          await syncActivityToCloud(localAct, user, cloudSnaps.get(id) ?? null);
          syncedToCloud++;
        } catch (err) {
          if (!firstUploadError) firstUploadError = err;
        }
      } else if (localAct.syncedUserId !== user.uid || !localAct.syncedAt) {
        // Already in cloud with up-to-date data; mark local record as synced
        await saveActivity({
          ...localAct,
          syncedUserId: user.uid,
          syncedAt: Date.now(),
          clientUpdatedAt: cloudStamp,
        });
      }
    }

    // 6. Download Gmail Cloud activities onto this device (enables cross-device Gmail access)
    for (const [id, cloudAct] of cloudRecords.entries()) {
      const localAct = localMap.get(id);
      if (!localAct) {
        await saveActivity(cloudAct);
        syncedFromCloud++;
      } else {
        const localStamp = localAct.clientUpdatedAt || localAct.endTime || 0;
        const cloudStamp = cloudAct.clientUpdatedAt || cloudAct.endTime || 0;
        if (cloudStamp > localStamp + 1000) {
          // Preserve local high-density points if this device recorded the original ride
          const mergedPoints =
            localAct.points.length > cloudAct.points.length ? localAct.points : cloudAct.points;
          await saveActivity({
            ...cloudAct,
            points: mergedPoints,
          });
          syncedFromCloud++;
        }
      }
    }

    notifyActivitiesUpdated();

    if (firstUploadError) {
      throw firstUploadError;
    }

    const updatedLocal = await getActivities();
    return {
      syncedToCloud,
      syncedFromCloud,
      removedDeleted,
      totalActivities: updatedLocal.length,
      lastSyncTime: Date.now(),
    };
  })();

  try {
    return await activeSyncPromise;
  } finally {
    activeSyncPromise = null;
  }
}

/**
 * Real-time listener so activities saved or deleted on Device A appear automatically on Device B
 * when logged into the same Gmail account.
 */
export function subscribeToCloudActivities(
  user: User,
  onSyncApplied: () => void,
  onError?: (readableError: string) => void
): () => void {
  const collPath = `users/${user.uid}/activities`;
  const activitiesQuery = query(
    collection(db, 'users', user.uid, 'activities'),
    where('userId', '==', user.uid)
  );

  let isInitialSnapshot = true;

  const unsubscribe = onSnapshot(
    activitiesQuery,
    async (snapshot) => {
      // Initial snapshot is handled by full bidirectional synchronizeUserData
      if (isInitialSnapshot) {
        isInitialSnapshot = false;
        return;
      }

      const changes = snapshot.docChanges();
      if (changes.length === 0) return;

      let didMutateLocal = false;
      const localList = await getActivities();
      const localById = new Map<string, ActivityRecord>();
      localList.forEach((a) => localById.set(sanitizeDocumentId(a.id), a));

      for (const change of changes) {
        const cleanId = sanitizeDocumentId(change.doc.id);
        if (change.type === 'removed') {
          const existingLocal = localById.get(cleanId);
          if (existingLocal && existingLocal.syncedUserId === user.uid) {
            await deleteActivity(existingLocal.id);
            didMutateLocal = true;
          }
        } else if (change.type === 'added' || change.type === 'modified') {
          const incomingRecord = cloudDataToActivityRecord(
            cleanId,
            change.doc.data() as Record<string, unknown>,
            user.uid
          );
          const existingLocal = localById.get(cleanId);
          const localStamp = existingLocal?.clientUpdatedAt || existingLocal?.endTime || 0;
          const cloudStamp = incomingRecord.clientUpdatedAt || incomingRecord.endTime || 0;

          if (!existingLocal || cloudStamp > localStamp + 1000) {
            const mergedPoints =
              existingLocal && existingLocal.points.length > incomingRecord.points.length
                ? existingLocal.points
                : incomingRecord.points;
            await saveActivity({
              ...incomingRecord,
              points: mergedPoints,
            });
            didMutateLocal = true;
          }
        }
      }

      if (didMutateLocal) {
        notifyActivitiesUpdated();
        onSyncApplied();
      }
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, collPath);
      } catch (formattedErr) {
        onError?.(getReadableSyncError(formattedErr));
      }
    }
  );

  return unsubscribe;
}

export { onAuthStateChanged, type User };
