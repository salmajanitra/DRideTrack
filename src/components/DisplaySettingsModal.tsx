import React, { useState, useEffect } from 'react';
import { UnitSystem } from '../types/cycling';
import {
  X,
  Sun,
  Moon,
  Smartphone,
  Maximize2,
  Minimize2,
  Sliders,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ShieldCheck,
  Zap,
  Pause,
} from 'lucide-react';
import { ScreenWakeLockState } from '../hooks/useScreenWakeLock';

interface DisplaySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  wakeLock: ScreenWakeLockState;
  unit: UnitSystem;
  onToggleUnit: () => void;
  isAutoPauseEnabled?: boolean;
  onToggleAutoPause?: () => void;
}

export const DisplaySettingsModal: React.FC<DisplaySettingsModalProps> = ({
  isOpen,
  onClose,
  wakeLock,
  unit,
  onToggleUnit,
  isAutoPauseEnabled = true,
  onToggleAutoPause,
}) => {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => {
    return typeof document !== 'undefined' && !!document.fullscreenElement;
  });

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
      }
    } catch (err) {
      console.warn('Fullscreen toggle error:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div
        className="bg-white rounded-3xl max-w-lg w-full border border-slate-200/90 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 md:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-emerald-500 text-white flex items-center justify-center shadow-sm">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Pengaturan Tampilan & Layar</h3>
              <p className="text-xs text-slate-500">Konfigurasi visibilitas dan kenyamanan saat gowes</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-200/80 hover:bg-slate-300 flex items-center justify-center text-slate-600 transition-colors"
            title="Tutup pengaturan"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 md:p-6 space-y-5 overflow-y-auto">
          {/* Section 1: Screen Wake Lock (Anti Redup) */}
          <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-4 transition-all">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div
                  className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${
                    wakeLock.isEnabled && wakeLock.isActive
                      ? 'bg-amber-100 text-amber-600 ring-2 ring-amber-400/30'
                      : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  <Sun className={`w-5 h-5 ${wakeLock.isEnabled && wakeLock.isActive ? 'animate-spin-slow' : ''}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-bold text-slate-900">Biarkan Layar Tetap Menyala</h4>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        wakeLock.isEnabled && wakeLock.isActive
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : wakeLock.isEnabled
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      {wakeLock.isEnabled && wakeLock.isActive
                        ? 'Layar Tidak Redup (Aktif)'
                        : wakeLock.isEnabled
                        ? 'Siaga (Menunggu Izin)'
                        : 'Mati (Standar Sistem)'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">
                    Mencegah layar HP mati, redup, atau mengunci otomatis saat ponsel dipasang di mount stang sepeda.
                  </p>
                </div>
              </div>

              {/* Toggle Switch */}
              <button
                type="button"
                role="switch"
                aria-checked={wakeLock.isEnabled}
                onClick={wakeLock.toggleKeepAwake}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                  wakeLock.isEnabled ? 'bg-cyan-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    wakeLock.isEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Wake Lock Status Notification */}
            <div className="mt-3 pt-3 border-t border-slate-200/60 flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 text-slate-500">
                <Smartphone className="w-3.5 h-3.5 text-cyan-600" />
                <span>
                  {wakeLock.isSupported
                    ? 'Screen Wake Lock API didukung oleh browser ini'
                    : 'Fitur wake lock otomatis memerlukan browser modern (Chrome/Edge/Safari/PWA)'}
                </span>
              </div>
              {wakeLock.isEnabled && !wakeLock.isActive && wakeLock.isSupported && (
                <button
                  onClick={() => wakeLock.requestWakeLock()}
                  className="text-xs font-bold text-cyan-600 hover:text-cyan-800 underline shrink-0 ml-2"
                >
                  Aktifkan Ulang
                </button>
              )}
            </div>
          </div>

          {/* Section: Smart Auto-Pause */}
          <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-4 flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                <Pause className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-slate-900">Smart Auto-Pause</h4>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                    Otomatis
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5">
                  Otomatis jeda pencatatan saat pesepeda berhenti lebih dari 5 detik di lampu merah / istirahat, dan otomatis lanjut saat bergerak kembali.
                </p>
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={isAutoPauseEnabled}
              onClick={onToggleAutoPause}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                isAutoPauseEnabled ? 'bg-amber-500' : 'bg-slate-300'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  isAutoPauseEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Section 2: Fullscreen Mode */}
          <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-4 flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-cyan-50 border border-cyan-100 text-cyan-600 flex items-center justify-center shrink-0">
                {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">Mode Layar Penuh (Fullscreen)</h4>
                <p className="text-xs text-slate-600 mt-0.5">
                  Menyembunyikan address bar browser agar tampilan HUD menyerupai cycling computer mandiri.
                </p>
              </div>
            </div>

            <button
              onClick={toggleFullscreen}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border shrink-0 ${
                isFullscreen
                  ? 'bg-cyan-50 text-cyan-700 border-cyan-200 hover:bg-cyan-100'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100 shadow-2xs'
              }`}
            >
              {isFullscreen ? 'Keluar Fullscreen' : 'Masuk Fullscreen'}
            </button>
          </div>

          {/* Section 3: Unit System Preference */}
          <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-4 flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center shrink-0 font-mono font-bold text-xs">
                {unit === 'metric' ? 'KM' : 'MI'}
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">Format Satuan (Unit)</h4>
                <p className="text-xs text-slate-600 mt-0.5">
                  {unit === 'metric'
                    ? 'Metrik: Kilometer per jam (km/h), Jarak (km), Elevasi (meter)'
                    : 'Imperial: Mil per jam (mph), Jarak (mil), Elevasi (kaki/ft)'}
                </p>
              </div>
            </div>

            <button
              onClick={onToggleUnit}
              className="px-3 py-1.5 rounded-xl bg-white text-slate-800 border border-slate-200 shadow-2xs hover:bg-slate-100 text-xs font-mono font-bold transition-all shrink-0 flex items-center gap-1"
            >
              <span className={unit === 'metric' ? 'text-cyan-600 font-black' : 'text-slate-400'}>Metrik</span>
              <span className="text-slate-300">/</span>
              <span className={unit === 'imperial' ? 'text-amber-600 font-black' : 'text-slate-400'}>Imperial</span>
            </button>
          </div>

          {/* Tips for outdoor cycling */}
          <div className="p-3.5 bg-cyan-50/60 border border-cyan-100 rounded-2xl text-xs text-cyan-950 space-y-1.5">
            <div className="font-bold flex items-center gap-1.5 text-cyan-900">
              <Zap className="w-3.5 h-3.5 text-cyan-600" />
              <span>Tips Penggunaan di Bawah Terik Matahari:</span>
            </div>
            <p className="text-[11px] text-cyan-900/80 leading-relaxed">
              Saat fitur <strong>Layar Tetap Menyala</strong> aktif, layar Anda tidak akan mengunci saat sedang gowes.
              Untuk menghemat baterai saat rute panjang, Anda dapat mengatur kecerahan layar HP ke tingkat sedang atau
              mengaktifkan fitur mode hemat baterai bawaan ponsel jika diperlukan.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-md shadow-cyan-600/20 transition-all active:scale-95"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
};
