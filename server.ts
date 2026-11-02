import express from 'express';
import type { Request, Response } from 'express';
import { createServer as createHttpServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProduction = process.env.NODE_ENV === 'production';
const PORT = parseInt(process.env.PORT || '3000', 10);

async function startServer() {
  const app = express();
  const httpServer = createHttpServer(app);

  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

  // Helper to determine accurate public App URL for redirects behind proxies
  const getAppBaseUrl = (req: Request): string => {
    if (process.env.APP_URL) {
      return process.env.APP_URL.replace(/\/$/, '');
    }
    const host = req.get('x-forwarded-host') || req.get('host') || `localhost:${PORT}`;
    const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
    return `${proto}://${host}`;
  };

  const getRedirectUri = (req: Request): string => {
    if (typeof req.query.redirect_uri === 'string' && req.query.redirect_uri) {
      return req.query.redirect_uri;
    }
    return `${getAppBaseUrl(req)}/auth/strava/callback`;
  };

  // --- STRAVA API ENDPOINTS ---

  // 1. Get Strava Configuration & Status
  app.get('/api/strava/config', (req: Request, res: Response) => {
    const clientId = process.env.STRAVA_CLIENT_ID || '';
    const redirectUri = getRedirectUri(req);
    res.json({
      configured: !!clientId,
      clientId,
      redirectUri,
      devAppUrl: process.env.APP_URL || '',
    });
  });

  // 2. Get Strava OAuth Authorization URL
  app.get('/api/strava/auth-url', (req: Request, res: Response) => {
    const clientId = (process.env.STRAVA_CLIENT_ID || (req.query.client_id as string) || '').trim();
    const redirectUri = getRedirectUri(req);

    if (!clientId) {
      return res.status(400).json({
        error: 'STRAVA_CLIENT_ID belum dikonfigurasi di environment atau parameter URL.',
        redirectUri,
      });
    }

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      approval_prompt: 'auto',
      scope: 'read,activity:write,activity:read_all',
    });

    const url = `https://www.strava.com/oauth/authorize?${params.toString()}`;
    res.json({ url, clientId, redirectUri });
  });

  // 3. Exchange Authorization Code or Refresh Token
  app.post('/api/strava/token', async (req: Request, res: Response) => {
    try {
      const { code, clientId, clientSecret, refreshToken } = req.body;
      const finalClientId = (clientId || process.env.STRAVA_CLIENT_ID || '').toString().trim();
      const finalClientSecret = (clientSecret || process.env.STRAVA_CLIENT_SECRET || '').toString().trim();

      if (!finalClientId || !finalClientSecret) {
        return res.status(400).json({
          error: 'Client ID dan Client Secret Strava diperlukan untuk pertukaran token.',
        });
      }

      const isRefresh = !!refreshToken;
      const payload: Record<string, string> = isRefresh
        ? {
            client_id: finalClientId,
            client_secret: finalClientSecret,
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
          }
        : {
            client_id: finalClientId,
            client_secret: finalClientSecret,
            grant_type: 'authorization_code',
            code,
          };

      const tokenResp = await fetch('https://www.strava.com/api/v3/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!tokenResp.ok) {
        const errText = await tokenResp.text();
        return res.status(tokenResp.status).json({
          error: `Gagal otentikasi Strava API: ${errText}`,
        });
      }

      const tokenData = await tokenResp.json();
      res.json({
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: tokenData.expires_at,
        athlete: tokenData.athlete,
        clientId: finalClientId,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: `Kesalahan server Strava: ${msg}` });
    }
  });

  // 3. OAuth Callback Handler (Popup Window Redirect)
  const handleStravaCallback = async (req: Request, res: Response) => {
    const { code, error } = req.query;

    if (error || !code) {
      return res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>Koneksi Strava Dibatalkan</title>
            <style>
              body { font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: #f8fafc; }
              .card { padding: 32px; background: #1e293b; border-radius: 20px; text-align: center; max-width: 400px; }
              h3 { color: #f43f5e; margin: 0 0 8px 0; }
              p { color: #94a3b8; font-size: 13px; line-height: 1.5; }
            </style>
          </head>
          <body>
            <div class="card">
              <h3>Autentikasi Dibatalkan</h3>
              <p>${error || 'Tidak ada kode otorisasi dari Strava.'}</p>
            </div>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'STRAVA_AUTH_ERROR', error: '${error || 'Otorisasi dibatalkan'}' }, '*');
              }
              setTimeout(() => window.close(), 1500);
            </script>
          </body>
        </html>
      `);
    }

    try {
      const clientId = process.env.STRAVA_CLIENT_ID || '';
      const clientSecret = process.env.STRAVA_CLIENT_SECRET || '';

      if (!clientId || !clientSecret) {
        // Fallback: pass authorization code back to opener to exchange if client-managed
        return res.send(`
          <!DOCTYPE html>
          <html>
            <head><meta charset="utf-8"><title>Strava Code Received</title></head>
            <body style="font-family:sans-serif;text-align:center;padding:40px;background:#f8fafc;">
              <p>Menghubungkan ke Strava...</p>
              <script>
                if (window.opener) {
                  window.opener.postMessage({ type: 'STRAVA_AUTH_CODE', code: '${code}' }, '*');
                }
                setTimeout(() => window.close(), 1000);
              </script>
            </body>
          </html>
        `);
      }

      // Exchange code for token with Strava API
      const tokenResp = await fetch('https://www.strava.com/api/v3/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code: code as string,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenResp.ok) {
        const errText = await tokenResp.text();
        throw new Error(`Strava token exchange failed: ${errText}`);
      }

      const tokenData = await tokenResp.json();
      const authPayload = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: tokenData.expires_at,
        athlete: tokenData.athlete,
        clientId,
      };

      res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>Koneksi Strava Berhasil</title>
            <style>
              body { font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0B1320; color: white; }
              .card { padding: 36px; background: #161F30; border-radius: 24px; text-align: center; border: 1px solid rgba(255,255,255,0.1); max-width: 420px; box-shadow: 0 20px 40px rgba(0,0,0,0.4); }
              .logo { width: 52px; height: 52px; background: #FC4C02; border-radius: 16px; margin: 0 auto 16px auto; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 24px; color: white; }
              h3 { margin: 0 0 8px 0; font-size: 20px; color: #FC4C02; }
              p { color: #94A3B8; font-size: 13px; line-height: 1.5; margin: 0; }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="logo">S</div>
              <h3>Terhubung ke Strava!</h3>
              <p>Selamat datang, <strong>${tokenData.athlete?.firstname || 'Atlet'}</strong>. Jendela ini akan tertutup otomatis...</p>
            </div>
            <script>
              try {
                if (window.opener) {
                  window.opener.postMessage({
                    type: 'STRAVA_AUTH_SUCCESS',
                    auth: ${JSON.stringify(authPayload)}
                  }, '*');
                }
              } catch (e) {
                console.error(e);
              }
              setTimeout(() => window.close(), 1200);
            </script>
          </body>
        </html>
      `);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).send(`
        <html><body><h3>Gagal Autentikasi Strava</h3><p>${msg}</p><script>setTimeout(() => window.close(), 3000);</script></body></html>
      `);
    }
  };

  app.get('/auth/strava/callback', handleStravaCallback);
  app.get('/auth/strava/callback/', handleStravaCallback);

  // 4. Upload Activity GPX to Strava API
  app.post('/api/strava/upload', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token otorisasi Strava diperlukan (Bearer token).' });
    }

    const { gpxContent, title, notes, activityType = 'ride' } = req.body;
    if (!gpxContent) {
      return res.status(400).json({ error: 'Konten file GPX tidak ditemukan.' });
    }

    try {
      const formData = new FormData();
      const fileBlob = new Blob([gpxContent], { type: 'application/gpx+xml' });
      formData.append('file', fileBlob, 'ride_activity.gpx');
      formData.append('name', title || 'Gowes Dhefin Ride Track GPS');
      formData.append('description', notes ? `${notes} (via Dhefin Ride Track GPS)` : 'Direkam dengan Dhefin Ride Track GPS');
      formData.append('trainer', '0');
      formData.append('commute', '0');
      formData.append('data_type', 'gpx');
      formData.append('activity_type', activityType);

      // Submit upload to Strava
      const uploadResp = await fetch('https://www.strava.com/api/v3/uploads', {
        method: 'POST',
        headers: {
          Authorization: authHeader,
        },
        body: formData,
      });

      if (!uploadResp.ok) {
        const errText = await uploadResp.text();
        return res.status(uploadResp.status).json({
          error: `Strava upload API error: ${errText}`,
        });
      }

      const uploadData = await uploadResp.json();
      const uploadId = uploadData.id;

      // Poll Strava Upload Status up to 4 times for completed activity_id
      let finalActivityId = uploadData.activity_id;
      if (!finalActivityId && uploadId) {
        for (let i = 0; i < 4; i++) {
          await new Promise((r) => setTimeout(r, 1500));
          try {
            const pollResp = await fetch(`https://www.strava.com/api/v3/uploads/${uploadId}`, {
              headers: { Authorization: authHeader },
            });
            if (pollResp.ok) {
              const pollData = await pollResp.json();
              if (pollData.activity_id) {
                finalActivityId = pollData.activity_id;
                break;
              }
            }
          } catch {
            // ignore polling transient error
          }
        }
      }

      const stravaUrl = finalActivityId ? `https://www.strava.com/activities/${finalActivityId}` : undefined;

      res.json({
        success: true,
        uploadId,
        activityId: finalActivityId,
        stravaUrl,
        message: finalActivityId
          ? 'Aktivitas berhasil disinkronkan dan dipublikasikan ke Strava!'
          : 'Aktivitas sedang diproses oleh server Strava.',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: `Gagal mengunggah ke Strava: ${msg}` });
    }
  });

  // --- VITE DEV MIDDLEWARE OR PRODUCTION STATIC SERVING ---
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: { server: httpServer },
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Dhefin Ride Track GPS server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
