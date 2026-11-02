import { ActivityRecord } from '../types/cycling';
import { generateGPXString } from './gpxExporter';

export interface StravaAthlete {
  id: number;
  username: string;
  firstname: string;
  lastname: string;
  profile: string;
  city?: string;
  state?: string;
  country?: string;
}

export interface StravaAuthData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch seconds
  athlete: StravaAthlete;
  clientId?: string;
  clientSecret?: string;
}

export interface StravaUploadResult {
  success: boolean;
  activityId?: number;
  stravaUrl?: string;
  error?: string;
}

const STORAGE_AUTH_KEY = 'drt_strava_auth';
const STORAGE_AUTOSYNC_KEY = 'drt_strava_autosync';
const STORAGE_SYNCED_IDS_KEY = 'drt_strava_synced_ids'; // map of activityId -> stravaUrl
const STORAGE_CLIENT_ID_KEY = 'drt_strava_custom_client_id';
const STORAGE_CLIENT_SECRET_KEY = 'drt_strava_custom_client_secret';

export class StravaService {
  /**
   * Retrieves saved Strava auth session from localStorage
   */
  static getAuth(): StravaAuthData | null {
    try {
      const saved = localStorage.getItem(STORAGE_AUTH_KEY);
      if (!saved) return null;
      return JSON.parse(saved);
    } catch {
      return null;
    }
  }

  /**
   * Stores Strava auth session
   */
  static setAuth(auth: StravaAuthData): void {
    try {
      localStorage.setItem(STORAGE_AUTH_KEY, JSON.stringify(auth));
    } catch {
      // ignore
    }
  }

  /**
   * Disconnects and removes stored Strava credentials
   */
  static disconnect(): void {
    try {
      localStorage.removeItem(STORAGE_AUTH_KEY);
    } catch {
      // ignore
    }
  }

  /**
   * Checks if user is currently connected to Strava
   */
  static isConnected(): boolean {
    const auth = this.getAuth();
    return !!(auth && auth.accessToken);
  }

  /**
   * Stored Custom Client ID and Secret for user-provided API credentials
   */
  static getSavedClientId(): string {
    try {
      return localStorage.getItem(STORAGE_CLIENT_ID_KEY) || '';
    } catch {
      return '';
    }
  }

  static setSavedClientId(clientId: string): void {
    try {
      localStorage.setItem(STORAGE_CLIENT_ID_KEY, clientId);
    } catch {
      // ignore
    }
  }

  static getSavedClientSecret(): string {
    try {
      return localStorage.getItem(STORAGE_CLIENT_SECRET_KEY) || '';
    } catch {
      return '';
    }
  }

  static setSavedClientSecret(clientSecret: string): void {
    try {
      localStorage.setItem(STORAGE_CLIENT_SECRET_KEY, clientSecret);
    } catch {
      // ignore
    }
  }

  /**
   * Checks if auto-sync to Strava on ride completion is enabled
   */
  static isAutoSyncEnabled(): boolean {
    try {
      const val = localStorage.getItem(STORAGE_AUTOSYNC_KEY);
      return val !== null ? val === 'true' : true; // Default ON if connected
    } catch {
      return true;
    }
  }

  /**
   * Toggles auto-sync
   */
  static setAutoSyncEnabled(enabled: boolean): void {
    try {
      localStorage.setItem(STORAGE_AUTOSYNC_KEY, enabled.toString());
    } catch {
      // ignore
    }
  }

  /**
   * Checks if an activity was already synced to Strava and returns Strava URL if so
   */
  static getSyncedStravaUrl(activityId: string): string | null {
    try {
      const mapStr = localStorage.getItem(STORAGE_SYNCED_IDS_KEY);
      if (!mapStr) return null;
      const map = JSON.parse(mapStr);
      return map[activityId] || null;
    } catch {
      return null;
    }
  }

  /**
   * Records that an activity was synced
   */
  static markAsSynced(activityId: string, stravaUrl: string): void {
    try {
      const mapStr = localStorage.getItem(STORAGE_SYNCED_IDS_KEY);
      const map = mapStr ? JSON.parse(mapStr) : {};
      map[activityId] = stravaUrl;
      localStorage.setItem(STORAGE_SYNCED_IDS_KEY, JSON.stringify(map));
    } catch {
      // ignore
    }
  }

  /**
   * Determines the OAuth redirect URI for current environment
   */
  static getRedirectUri(): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/auth/strava/callback`;
  }

  /**
   * Exchange code or refresh token using server API proxy
   */
  static async exchangeToken(params: {
    code?: string;
    refreshToken?: string;
    clientId?: string;
    clientSecret?: string;
  }): Promise<StravaAuthData> {
    const res = await fetch('/api/strava/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Gagal otentikasi Strava (HTTP ${res.status})`);
    }

    const data = await res.json();
    return {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresAt: data.expiresAt,
      athlete: data.athlete,
      clientId: params.clientId || data.clientId,
      clientSecret: params.clientSecret,
    };
  }

  /**
   * Automatically refreshes expired token if needed before API calls
   */
  static async ensureValidToken(): Promise<StravaAuthData> {
    const currentAuth = this.getAuth();
    if (!currentAuth || !currentAuth.accessToken) {
      throw new Error('Akun Strava belum terhubung.');
    }

    const nowSec = Math.floor(Date.now() / 1000);
    // If token expires within 5 minutes, refresh it
    if (currentAuth.expiresAt && currentAuth.expiresAt < nowSec + 300) {
      const clientId = currentAuth.clientId || this.getSavedClientId();
      const clientSecret = currentAuth.clientSecret || this.getSavedClientSecret();
      try {
        const refreshed = await this.exchangeToken({
          refreshToken: currentAuth.refreshToken,
          clientId,
          clientSecret,
        });
        this.setAuth({
          ...currentAuth,
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken || currentAuth.refreshToken,
          expiresAt: refreshed.expiresAt,
        });
        return refreshed;
      } catch (e) {
        console.warn('Gagal me-refresh token Strava otomatis:', e);
      }
    }

    return currentAuth;
  }

  /**
   * Connects with Strava using popup window as per AI Studio iframe OAuth guidelines
   */
  static async connectWithPopup(customClientId?: string, customClientSecret?: string): Promise<StravaAuthData> {
    const redirectUri = this.getRedirectUri();

    if (customClientId) this.setSavedClientId(customClientId);
    if (customClientSecret) this.setSavedClientSecret(customClientSecret);

    const activeClientId = customClientId || this.getSavedClientId();
    const activeClientSecret = customClientSecret || this.getSavedClientSecret();

    // 1. Fetch Auth URL from server with current origin's redirectUri
    let authUrl = '';
    let serverClientId = '';

    try {
      const queryParams = new URLSearchParams({
        redirect_uri: redirectUri,
      });
      if (activeClientId) queryParams.set('client_id', activeClientId);

      const res = await fetch(`/api/strava/auth-url?${queryParams.toString()}`);
      if (res.ok) {
        const data = await res.json();
        authUrl = data.url;
        serverClientId = data.clientId || '';
      }
    } catch {
      // fallback to manual client-side URL
    }

    const finalClientId = activeClientId || serverClientId || this.getAuth()?.clientId || '';

    if (!authUrl) {
      if (!finalClientId) {
        throw new Error(
          'Client ID Strava belum dikonfigurasi. Masukkan Client ID di form Strava atau atur STRAVA_CLIENT_ID di environment.'
        );
      }

      const params = new URLSearchParams({
        client_id: finalClientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        approval_prompt: 'auto',
        scope: 'read,activity:write,activity:read_all',
      });
      authUrl = `https://www.strava.com/oauth/authorize?${params.toString()}`;
    }

    // 2. Open Strava Authorization URL directly in popup
    const width = 600;
    const height = 750;
    const left = Math.max(0, (window.screen.width - width) / 2);
    const top = Math.max(0, (window.screen.height - height) / 2);

    const authWindow = window.open(
      authUrl,
      'strava_oauth_popup',
      `width=${width},height=${height},top=${top},left=${left},resizable=yes,scrollbars=yes,status=yes`
    );

    if (!authWindow) {
      throw new Error('Jendela popup diblokir oleh browser. Izinkan popup pada browser untuk menyambungkan Strava.');
    }

    // 3. Listen for postMessage from popup callback
    return new Promise((resolve, reject) => {
      let resolved = false;

      const cleanup = () => {
        window.removeEventListener('message', handleMessage);
        if (checkClosedInterval) window.clearInterval(checkClosedInterval);
      };

      const handleMessage = async (event: MessageEvent) => {
        const origin = event.origin;
        // Verify valid origin
        if (
          !origin.endsWith('.run.app') &&
          !origin.includes('localhost') &&
          origin !== window.location.origin
        ) {
          return;
        }

        if (event.data?.type === 'STRAVA_AUTH_SUCCESS') {
          resolved = true;
          cleanup();
          const authData: StravaAuthData = {
            ...event.data.auth,
            clientId: finalClientId,
            clientSecret: activeClientSecret,
          };
          this.setAuth(authData);
          resolve(authData);
        } else if (event.data?.type === 'STRAVA_AUTH_CODE') {
          // Popup returned authorization code, exchange it now via server token endpoint
          resolved = true;
          cleanup();
          try {
            const authData = await this.exchangeToken({
              code: event.data.code,
              clientId: finalClientId,
              clientSecret: activeClientSecret,
            });
            this.setAuth(authData);
            resolve(authData);
          } catch (exchangeErr: unknown) {
            const msg = exchangeErr instanceof Error ? exchangeErr.message : String(exchangeErr);
            reject(new Error(`Otorisasi diterima tetapi gagal menukar token: ${msg}`));
          }
        } else if (event.data?.type === 'STRAVA_AUTH_ERROR') {
          resolved = true;
          cleanup();
          reject(new Error(event.data.error || 'Autentikasi Strava dibatalkan atau ditolak.'));
        }
      };

      window.addEventListener('message', handleMessage);

      // Check if popup closed by user
      const checkClosedInterval = window.setInterval(() => {
        if (authWindow.closed && !resolved) {
          cleanup();
          setTimeout(() => {
            const current = this.getAuth();
            if (current && current.accessToken) {
              resolve(current);
            } else {
              reject(new Error('Jendela otorisasi Strava ditutup sebelum autentikasi selesai.'));
            }
          }, 600);
        }
      }, 500);
    });
  }

  /**
   * Uploads an activity to Strava via backend API
   */
  static async uploadActivity(activity: ActivityRecord): Promise<StravaUploadResult> {
    if (!this.isConnected()) {
      throw new Error('Belum tersambung ke akun Strava. Silakan sambungkan akun terlebih dahulu.');
    }

    const auth = await this.ensureValidToken();
    const gpxContent = generateGPXString(activity);

    try {
      const response = await fetch('/api/strava/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.accessToken}`,
        },
        body: JSON.stringify({
          gpxContent,
          title: activity.title,
          notes: activity.notes || '',
          activityType: 'ride',
          activityId: activity.id,
          startTime: activity.startTime,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || errData.message || `Gagal mengunggah ke Strava (HTTP ${response.status})`);
      }

      const result = await response.json();
      if (result.stravaUrl) {
        this.markAsSynced(activity.id, result.stravaUrl);
      }

      return {
        success: true,
        activityId: result.activityId,
        stravaUrl: result.stravaUrl || (result.activityId ? `https://www.strava.com/activities/${result.activityId}` : undefined),
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: msg,
      };
    }
  }
}
