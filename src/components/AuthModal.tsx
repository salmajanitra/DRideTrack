import React, { useState } from 'react';
import { User, SyncResult, getReadableSyncError } from '../services/firebase';
import {
  X,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  LogOut,
  Cloud,
  ShieldCheck,
  Smartphone,
  Database,
  ArrowLeftRight,
  Laptop,
} from 'lucide-react';

interface AuthModalProps {
  user: User | null;
  isOpen: boolean;
  onClose: () => void;
  onLoginGoogle: () => Promise<User>;
  onSwitchAccount: () => Promise<User>;
  onLogOut: () => Promise<void>;
  onSyncNow: () => Promise<SyncResult | null>;
  isSyncing: boolean;
  syncError?: string | null;
  onClearSyncError?: () => void;
  lastSyncTime: number | null;
  lastSyncResult?: SyncResult | null;
  savedRidesCount: number;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  user,
  isOpen,
  onClose,
  onLoginGoogle,
  onSwitchAccount,
  onLogOut,
  onSyncNow,
  isSyncing,
  syncError = null,
  onClearSyncError,
  lastSyncTime,
  lastSyncResult = null,
  savedRidesCount,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  if (!isOpen) return null;

  const activeError = localError || syncError;

  const handleGoogleAuth = async () => {
    setIsLoading(true);
    setLocalError(null);
    onClearSyncError?.();
    setSuccessMessage(null);
    try {
      const u = await onLoginGoogle();
      setSuccessMessage(
        `Terhubung ke akun Gmail ${u.email || u.displayName}! Aktivitas Anda kini disinkronkan lintas perangkat.`
      );
    } catch (err) {
      setLocalError(getReadableSyncError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSwitchGmail = async () => {
    setIsLoading(true);
    setLocalError(null);
    onClearSyncError?.();
    setSuccessMessage(null);
    try {
      const u = await onSwitchAccount();
      setSuccessMessage(`Berhasil beralih ke akun Gmail ${u.email || u.displayName}.`);
    } catch (err) {
      setLocalError(getReadableSyncError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualSync = async () => {
    setLocalError(null);
    onClearSyncError?.();
    setSuccessMessage(null);
    const res = await onSyncNow();
    if (res) {
      const parts: string[] = [];
      if (res.syncedToCloud > 0) parts.push(`${res.syncedToCloud} diunggah ke Gmail Cloud`);
      if (res.syncedFromCloud > 0) parts.push(`${res.syncedFromCloud} diunduh ke perangkat ini`);
      const detail =
        parts.length > 0
          ? `(${parts.join(', ')})`
          : '(Semua data di perangkat & Cloud sudah terbaru)';
      setSuccessMessage(
        `Sinkronisasi Gmail berhasil! Total ${res.totalActivities} aktivitas tersimpan ${detail}.`
      );
    }
  };

  const handleConfirmLogOut = async () => {
    setConfirmSignOut(false);
    setLocalError(null);
    onClearSyncError?.();
    setSuccessMessage(null);
    await onLogOut();
    onClose();
  };

  const formatSyncTime = (timestamp: number | null) => {
    if (!timestamp) return 'Belum pernah sinkron';
    const diffMs = Date.now() - timestamp;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Baru saja';
    if (diffMins < 60) return `${diffMins} menit lalu`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} jam lalu`;
    return new Date(timestamp).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden text-slate-900 my-auto">
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-slate-900 via-slate-800 to-cyan-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-cyan-500 to-emerald-500 flex items-center justify-center shadow-lg text-white shrink-0">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-base md:text-lg leading-tight">
                Sinkronisasi Cloud Gmail
              </h3>
              <p className="text-xs text-slate-300 mt-0.5">
                Cadangkan & akses aktivitas di HP atau perangkat lain
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            title="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {activeError && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-rose-900 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed">{activeError}</div>
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-900 text-xs flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed font-semibold">{successMessage}</div>
            </div>
          )}

          {user ? (
            /* SIGNED IN STATE */
            <div className="space-y-4">
              {/* Connected Gmail Profile Card */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center gap-3.5">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'User'}
                    referrerPolicy="no-referrer"
                    className="w-12 h-12 rounded-2xl object-cover ring-2 ring-emerald-500/30 shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-600 to-emerald-600 text-white font-black text-lg flex items-center justify-center shadow-sm shrink-0">
                    {(user.displayName || user.email || 'G')[0].toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-black text-sm text-slate-900 truncate flex items-center gap-1.5">
                    <span className="truncate">{user.displayName || 'Atlet GPS'}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">
                      Gmail Aktif
                    </span>
                  </div>
                  <div className="text-xs text-slate-600 truncate font-mono-numbers mt-0.5">
                    {user.email}
                  </div>
                </div>
              </div>

              {/* Sync Telemetry Card */}
              <div className="p-4 bg-cyan-50/70 border border-cyan-200 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                  <span className="flex items-center gap-1.5 text-cyan-950">
                    <Database className="w-4 h-4 text-cyan-600" />
                    Aktivitas Tersinkron:
                  </span>
                  <span className="font-black font-mono-numbers text-cyan-800 text-sm">
                    {savedRidesCount} Aktivitas
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                  <span className="flex items-center gap-1.5">
                    <Cloud className="w-4 h-4 text-cyan-600" />
                    Sinkronisasi Terakhir:
                  </span>
                  <span className="font-mono-numbers text-slate-800">
                    {formatSyncTime(lastSyncTime)}
                  </span>
                </div>
                {lastSyncResult && (
                  <div className="pt-2 border-t border-cyan-200/70 grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                    <div>
                      Diunggah ke Cloud:{' '}
                      <strong className="font-mono-numbers text-slate-900">
                        {lastSyncResult.syncedToCloud}
                      </strong>
                    </div>
                    <div>
                      Diunduh ke Perangkat:{' '}
                      <strong className="font-mono-numbers text-slate-900">
                        {lastSyncResult.syncedFromCloud}
                      </strong>
                    </div>
                  </div>
                )}
              </div>

              {/* Cross-device tip */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-600 leading-relaxed flex items-start gap-2.5">
                <Laptop className="w-4 h-4 text-cyan-600 shrink-0 mt-0.5" />
                <div>
                  Untuk membuka riwayat aktivitas di perangkat lain, buka aplikasi ini lalu masuk dengan akun Gmail{' '}
                  <strong className="text-slate-900">{user.email}</strong>. Semua rute & statistik akan otomatis dimuat.
                </div>
              </div>

              {/* Inline Sign-Out Confirmation (No window.confirm) */}
              {confirmSignOut && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl space-y-2.5 text-xs text-rose-950">
                  <p className="font-semibold">
                    Keluar dari akun {user.email}? Aktivitas yang sudah tersimpan di perangkat ini tetap aman.
                  </p>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmSignOut(false)}
                      className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmLogOut}
                      className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold cursor-pointer"
                    >
                      Ya, Keluar
                    </button>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={handleManualSync}
                  disabled={isSyncing || isLoading}
                  className="w-full min-h-[44px] py-3 px-4 rounded-2xl bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white font-black text-sm shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>{isSyncing ? 'Menyinkronkan ke Gmail...' : 'Sinkronkan Sekarang'}</span>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleSwitchGmail}
                    disabled={isSyncing || isLoading}
                    className="py-2.5 px-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-200 transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5" />
                    <span>Ganti Akun Gmail</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setConfirmSignOut(true)}
                    disabled={isSyncing || isLoading}
                    className="py-2.5 px-3 rounded-2xl bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 text-xs font-bold border border-slate-200 hover:border-rose-200 transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Keluar Akun</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* SIGNED OUT STATE */
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 text-xs text-slate-600 leading-relaxed">
                <p className="font-bold text-slate-900 text-sm">
                  Hubungkan Akun Google (Gmail) Anda
                </p>
                <p>
                  Gunakan login resmi Google agar seluruh aktivitas <strong>Cycling</strong> &{' '}
                  <strong>Running</strong> tersinkronisasi dua arah secara otomatis antar HP, tablet, dan laptop menggunakan akun Gmail yang sama.
                </p>
              </div>

              {/* Official Google Sign-In Button */}
              <button
                type="button"
                onClick={handleGoogleAuth}
                disabled={isLoading || isSyncing}
                className="w-full min-h-[48px] py-3.5 px-4 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-3 cursor-pointer disabled:opacity-50"
              >
                <span className="w-6 h-6 rounded-lg bg-white flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                </span>
                <span>
                  {isLoading || isSyncing
                    ? 'Menghubungkan ke Gmail...'
                    : 'Masuk dengan Google (Gmail)'}
                </span>
              </button>

              {savedRidesCount > 0 && (
                <div className="p-3 bg-cyan-50 border border-cyan-200 rounded-xl text-xs text-cyan-900 flex items-center gap-2">
                  <Database className="w-4 h-4 text-cyan-600 shrink-0" />
                  <span>
                    <strong>{savedRidesCount} aktivitas lokal</strong> di perangkat ini akan langsung diunggah ke Gmail Anda begitu berhasil masuk.
                  </span>
                </div>
              )}

              {/* Cloud Benefits */}
              <div className="pt-3 border-t border-slate-100 space-y-2.5">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Cara Kerja Sinkronisasi Lintas Perangkat:
                </div>
                <div className="space-y-2 text-xs text-slate-600">
                  <div className="flex items-start gap-2">
                    <Smartphone className="w-4 h-4 text-cyan-600 shrink-0 mt-0.5" />
                    <span>
                      <strong>Perangkat 1 (HP Rekam GPS):</strong> Masuk dengan Gmail, rekam aktivitas, lalu konfirmasi simpan.
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>
                      <strong>Perangkat 2 (HP Lain / Laptop):</strong> Masuk dengan alamat Gmail yang sama untuk mengunduh seluruh rute, split km, dan rekap kalender secara real-time.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
