import React, { useState, useEffect } from 'react';
import { StravaService, StravaAuthData } from '../services/stravaService';
import { exportAllActivitiesToGPX } from '../services/gpxExporter';
import { ActivityRecord } from '../types/cycling';
import {
  X,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  Sliders,
  Copy,
  Check,
  Zap,
  Download,
  AlertTriangle,
  ShieldCheck,
  Layers,
  ArrowRight,
} from 'lucide-react';

interface StravaConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  activities?: ActivityRecord[];
}

export const StravaConnectModal: React.FC<StravaConnectModalProps> = ({
  isOpen,
  onClose,
  activities = [],
}) => {
  const [authData, setAuthData] = useState<StravaAuthData | null>(null);
  const [isAutoSync, setIsAutoSync] = useState<boolean>(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [customClientId, setCustomClientId] = useState<string>('');
  const [customClientSecret, setCustomClientSecret] = useState<string>('');
  const [showManualConfig, setShowManualConfig] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setAuthData(StravaService.getAuth());
      setIsAutoSync(StravaService.isAutoSyncEnabled());
      setCustomClientId(StravaService.getSavedClientId());
      setCustomClientSecret(StravaService.getSavedClientSecret());
      setErrorMessage(null);
      setSuccessMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConnect = async () => {
    setIsConnecting(true);
    setErrorMessage(null);
    try {
      const auth = await StravaService.connectWithPopup(
        customClientId.trim(),
        customClientSecret.trim()
      );
      setAuthData(auth);
      setSuccessMessage(`Berhasil terhubung ke Strava sebagai ${auth.athlete?.firstname || 'Atlet'}!`);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    if (window.confirm('Putuskan sambungan dari akun Strava?')) {
      StravaService.disconnect();
      setAuthData(null);
      setSuccessMessage('Sambungan akun Strava telah diputuskan.');
      setTimeout(() => setSuccessMessage(null), 3000);
    }
  };

  const handleToggleAutoSync = () => {
    const nextVal = !isAutoSync;
    setIsAutoSync(nextVal);
    StravaService.setAutoSyncEnabled(nextVal);
  };

  const handleExportAll = () => {
    if (activities.length === 0) {
      alert('Belum ada riwayat aktivitas yang tersimpan untuk diekspor.');
      return;
    }
    exportAllActivitiesToGPX(activities);
  };

  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const currentDomain = typeof window !== 'undefined' ? window.location.hostname : 'ais-dev-sclnffyx4vidlmrvkxrtto-584977127108.asia-northeast1.run.app';
  const currentCallbackUrl = typeof window !== 'undefined' ? `${window.location.origin}/auth/strava/callback` : '';
  const devCallbackUrl = 'https://ais-dev-sclnffyx4vidlmrvkxrtto-584977127108.asia-northeast1.run.app/auth/strava/callback';
  const sharedCallbackUrl = 'https://ais-pre-sclnffyx4vidlmrvkxrtto-584977127108.asia-northeast1.run.app/auth/strava/callback';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/70 backdrop-blur-md animate-fade-in">
      <div
        className="bg-white rounded-3xl max-w-xl w-full border border-slate-200/90 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-orange-500/10 via-amber-500/5 to-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#FC4C02] text-white flex items-center justify-center font-black text-lg shadow-sm shadow-orange-500/30">
              S
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">Strava & Ekspor .GPX</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 border border-orange-200">
                  Sync API
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Otomatis sinkronkan rute gowes ke Strava dan unduh berkas GPX
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-200/80 hover:bg-slate-300 flex items-center justify-center text-slate-600 transition-colors"
            title="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {/* Notifications */}
          {errorMessage && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-900 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block">Gagal Menghubungkan ke Strava</strong>
                <span>{errorMessage}</span>
              </div>
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Strava Connection Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {authData?.athlete?.profile ? (
                  <img
                    src={authData.athlete.profile}
                    alt={authData.athlete.firstname}
                    className="w-12 h-12 rounded-full border-2 border-orange-500 shadow-xs object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center font-bold text-xl border border-orange-200">
                    S
                  </div>
                )}

                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-slate-900">
                      {authData
                        ? `${authData.athlete.firstname || ''} ${authData.athlete.lastname || ''}`.trim() || 'Atlet Strava'
                        : 'Akun Strava'}
                    </h4>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        authData
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-200 text-slate-600 border-slate-300'
                      }`}
                    >
                      {authData ? 'Terhubung ✓' : 'Belum Terhubung'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {authData
                      ? `${authData.athlete.city || 'Indonesia'} • ID: ${authData.athlete.id}`
                      : 'Hubungkan untuk mengunggah otomatis aktivitas gowes'}
                  </p>
                </div>
              </div>

              {authData ? (
                <button
                  onClick={handleDisconnect}
                  className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-rose-50 text-slate-700 hover:text-rose-600 border border-slate-200 text-xs font-semibold transition-colors shrink-0 shadow-3xs"
                >
                  Putuskan Akun
                </button>
              ) : (
                <button
                  onClick={handleConnect}
                  disabled={isConnecting}
                  className="px-5 py-2.5 rounded-xl bg-[#FC4C02] hover:bg-[#e04300] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-orange-500/20 transition-all active:scale-95 cursor-pointer shrink-0"
                >
                  {isConnecting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Menghubungkan...</span>
                    </>
                  ) : (
                    <>
                      <span>Hubungkan dengan Strava</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Auto-Sync Setting Switch */}
            {authData && (
              <div className="pt-3 border-t border-slate-200/80 flex items-center justify-between gap-3 text-xs">
                <div>
                  <span className="font-bold text-slate-800 block">Sinkronisasi Otomatis Rute</span>
                  <span className="text-slate-500 text-[11px]">
                    Otomatis unggah berkas GPX ke Strava saat Anda menekan tombol Simpan Aktivitas
                  </span>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={isAutoSync}
                  onClick={handleToggleAutoSync}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                    isAutoSync ? 'bg-[#FC4C02]' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      isAutoSync ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            )}
          </div>

          {/* Master GPX Export Section */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-cyan-50 border border-cyan-100 text-cyan-600 flex items-center justify-center shrink-0">
                <Download className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">Ekspor Semua Aktivitas (.GPX)</h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Unduh seluruh koleksi {activities.length} rute bersepeda Anda dalam 1 berkas master GPX multi-track untuk cadangan atau diimpor ke Garmin / Komoot / Wahoo.
                </p>
              </div>
            </div>

            <button
              onClick={handleExportAll}
              className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 text-cyan-700 border border-slate-200 shadow-3xs text-xs font-bold transition-all shrink-0 flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Unduh GPX</span>
            </button>
          </div>

          {/* Developer / Manual API Setup Guide Accordion */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden">
            <button
              onClick={() => setShowManualConfig(!showManualConfig)}
              className="w-full p-3.5 bg-slate-50 hover:bg-slate-100/80 flex items-center justify-between text-left text-xs font-bold text-slate-700 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-orange-600" />
                <span>Petunjuk Konfigurasi API Strava (OAuth Credentials)</span>
              </div>
              <span className="text-[11px] text-cyan-700 underline">
                {showManualConfig ? 'Sembunyikan' : 'Buka Petunjuk'}
              </span>
            </button>

            {showManualConfig && (
              <div className="p-4 bg-white border-t border-slate-100 text-xs space-y-4">
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-[11px] leading-relaxed">
                  <strong>Langkah Pendaftaran Strava API:</strong>
                  <ol className="list-decimal ml-4 mt-1 space-y-1">
                    <li>
                      Buka dashboard API Strava di:{' '}
                      <a
                        href="https://www.strava.com/settings/api"
                        target="_blank"
                        rel="noreferrer"
                        className="underline text-orange-600 font-bold inline-flex items-center gap-0.5"
                      >
                        strava.com/settings/api <ExternalLink className="w-3 h-3" />
                      </a>
                    </li>
                    <li>Buat aplikasi API dengan nama: <code>Dhefin Ride Track GPS</code></li>
                    <li>
                      Masukkan <strong>Authorization Callback Domain</strong>:
                      <div className="flex items-center gap-1.5 mt-1">
                        <code className="bg-white px-2 py-0.5 rounded border border-amber-300 font-mono text-[10px] break-all">
                          {currentDomain}
                        </code>
                        <button
                          onClick={() => copyToClipboard(currentDomain, 'domain')}
                          className="px-2 py-0.5 bg-amber-200 hover:bg-amber-300 text-amber-900 rounded text-[10px] font-bold cursor-pointer"
                        >
                          {copiedField === 'domain' ? 'Tersalin' : 'Salin Domain'}
                        </button>
                      </div>
                    </li>
                    <li>
                      Salin <strong>Client ID</strong> & <strong>Client Secret</strong> dari Strava ke form di bawah (atau simpan di Secrets AI Studio sebagai <code>STRAVA_CLIENT_ID</code> & <code>STRAVA_CLIENT_SECRET</code>):
                    </li>
                  </ol>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">
                      Client ID Strava:
                    </label>
                    <input
                      type="text"
                      placeholder="Misal: 145920"
                      value={customClientId}
                      onChange={(e) => setCustomClientId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono focus:outline-cyan-500 focus:border-cyan-500 bg-white"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">
                      Client Secret Strava:
                    </label>
                    <input
                      type="password"
                      placeholder="Masukkan Client Secret Strava Anda"
                      value={customClientSecret}
                      onChange={(e) => setCustomClientSecret(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono focus:outline-cyan-500 focus:border-cyan-500 bg-white"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      Kredensial tersimpan aman di browser Anda dan digunakan untuk sinkronisasi otomatis.
                    </p>
                  </div>

                  <button
                    onClick={handleConnect}
                    disabled={isConnecting}
                    className="w-full py-2.5 rounded-xl bg-[#FC4C02] hover:bg-[#e04300] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-orange-500/20 transition-all active:scale-95 cursor-pointer"
                  >
                    {isConnecting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Menghubungkan ke Strava...</span>
                      </>
                    ) : (
                      <>
                        <span>Simpan Kredensial & Hubungkan Sekarang</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  <span className="text-[11px] font-bold text-slate-700 block">Daftar Callback URL Lengkap:</span>
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-[11px] font-mono break-all space-y-2">
                    {currentCallbackUrl && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-slate-700">Aktif: {currentCallbackUrl}</span>
                        <button
                          onClick={() => copyToClipboard(currentCallbackUrl, 'currentUrl')}
                          className="text-cyan-700 hover:underline shrink-0 font-bold"
                        >
                          {copiedField === 'currentUrl' ? 'Tersalin' : 'Salin'}
                        </button>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-slate-600">Dev: {devCallbackUrl}</span>
                      <button
                        onClick={() => copyToClipboard(devCallbackUrl, 'devUrl')}
                        className="text-cyan-700 hover:underline shrink-0"
                      >
                        {copiedField === 'devUrl' ? 'Tersalin' : 'Salin'}
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-slate-600">Prod: {sharedCallbackUrl}</span>
                      <button
                        onClick={() => copyToClipboard(sharedCallbackUrl, 'prodUrl')}
                        className="text-cyan-700 hover:underline shrink-0"
                      >
                        {copiedField === 'prodUrl' ? 'Tersalin' : 'Salin'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span>Kompatibel dengan Strava, Garmin Connect, Wahoo, & Komoot</span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold transition-colors"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
};
