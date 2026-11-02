import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Smartphone, Share2, PlusSquare, X, CheckCircle2, ShieldCheck, Sparkles } from 'lucide-react';

interface PWAInstallButtonProps {
  className?: string;
  variant?: 'header' | 'banner' | 'floating';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  className = '',
  variant = 'header',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showModal, setShowModal] = useState<boolean>(false);
  const [bannerDismissed, setBannerDismissed] = useState<boolean>(false);

  // If already running standalone, suppress install UI
  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      const success = await install();
      if (!success && isIOS) {
        setShowModal(true);
      }
    } else {
      setShowModal(true);
    }
  };

  // Header button variant
  if (variant === 'header') {
    return (
      <>
        <button
          type="button"
          onClick={handleInstallClick}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition-all shadow-sm ${
            isInstallable
              ? 'bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white animate-pulse'
              : 'bg-cyan-50 hover:bg-cyan-100 text-cyan-800 border border-cyan-200'
          } ${className}`}
          title="Instal Dhefin Ride Track GPS sebagai aplikasi mandiri (PWA)"
        >
          <Download className="w-3.5 h-3.5 shrink-0" />
          <span>Install App</span>
        </button>

        {showModal && <PWAInstructionsModal onClose={() => setShowModal(false)} onInstallPrompt={install} isInstallable={isInstallable} isIOS={isIOS} />}
      </>
    );
  }

  // Floating Banner variant (for bottom or top viewport)
  if (variant === 'banner' && !bannerDismissed) {
    return (
      <>
        <div className="bg-gradient-to-r from-slate-900 via-cyan-950 to-slate-900 text-white p-3 md:p-3.5 border-b border-cyan-500/30 shadow-lg sticky top-0 z-40 transition-all">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-emerald-400 p-0.5 shadow-md shrink-0 flex items-center justify-center">
                <img src="/pwa-192x192.png" alt="App Icon" className="w-8 h-8 rounded-lg object-contain" />
              </div>
              <div className="text-left">
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span>Instal Dhefin Ride Track GPS</span>
                  <span className="text-[10px] bg-cyan-500/30 text-cyan-300 px-1.5 py-0.2 rounded font-semibold border border-cyan-400/30">
                    PWA Standalone
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 hidden sm:block">
                  Jalankan aplikasi secara mandiri di layar utama smartphone dengan speedometer fullscreen dan peta offline tanpa gangguan browser.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleInstallClick}
                className="px-3.5 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded-xl shadow-md transition-transform active:scale-95 flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Install Sekarang</span>
              </button>
              <button
                type="button"
                onClick={() => setBannerDismissed(true)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                title="Tutup pemberitahuan"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {showModal && <PWAInstructionsModal onClose={() => setShowModal(false)} onInstallPrompt={install} isInstallable={isInstallable} isIOS={isIOS} />}
      </>
    );
  }

  return null;
};

// Instructions modal for Android & iOS
interface PWAInstructionsModalProps {
  onClose: () => void;
  onInstallPrompt: () => Promise<boolean>;
  isInstallable: boolean;
  isIOS: boolean;
}

const PWAInstructionsModal: React.FC<PWAInstructionsModalProps> = ({
  onClose,
  onInstallPrompt,
  isInstallable,
  isIOS,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 flex flex-col text-slate-900">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500 to-emerald-500 flex items-center justify-center shadow-lg p-1 shrink-0">
            <img src="/pwa-192x192.png" alt="RideTrack" className="w-full h-full rounded-xl object-contain" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Instal Dhefin Ride Track GPS
            </h3>
            <p className="text-xs text-slate-500">
              Progressive Web App Standalone
            </p>
          </div>
        </div>

        <div className="space-y-3.5 my-2 text-xs text-slate-600 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
          <div className="font-bold text-slate-800 text-[13px] flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-cyan-600" />
            Keunggulan Aplikasi Terinstal:
          </div>
          <ul className="space-y-1.5 list-disc pl-4 text-slate-700">
            <li>Tampilan layar penuh tanpa address bar (seperti aplikasi native Android / iOS).</li>
            <li>Akses instan dari Layar Utama (Home Screen) perangkat.</li>
            <li>GPS tracking lebih stabil dengan dukungan caching offline & service worker.</li>
            <li>Hemat memori dan baterai saat gowes jarak jauh.</li>
          </ul>
        </div>

        {isInstallable ? (
          <div className="mt-4 space-y-2">
            <button
              onClick={async () => {
                await onInstallPrompt();
                onClose();
              }}
              className="w-full py-3 bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white font-bold rounded-xl text-sm shadow-md transition-all flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>Konfirmasi & Pasang Sekarang</span>
            </button>
            <p className="text-[11px] text-center text-slate-500">
              Browser akan menampilkan dialog instalasi otomatis.
            </p>
          </div>
        ) : isIOS ? (
          <div className="mt-4 space-y-3">
            <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Cara Pasang di iPhone / iPad (Safari):
            </div>
            <div className="space-y-2 text-xs text-slate-700">
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-cyan-100 text-cyan-800 font-bold flex items-center justify-center text-[11px] shrink-0">
                  1
                </span>
                <span>
                  Ketuk tombol <strong>Share (Bagikan)</strong>{' '}
                  <Share2 className="w-3.5 h-3.5 inline text-cyan-600" /> di bilah navigasi Safari bawah.
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-cyan-100 text-cyan-800 font-bold flex items-center justify-center text-[11px] shrink-0">
                  2
                </span>
                <span>
                  Gulir ke bawah dan ketuk menu <strong>Tambah ke Layar Utama (Add to Home Screen)</strong>{' '}
                  <PlusSquare className="w-3.5 h-3.5 inline text-cyan-600" />.
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-cyan-100 text-cyan-800 font-bold flex items-center justify-center text-[11px] shrink-0">
                  3
                </span>
                <span>
                  Ketuk <strong>Tambah (Add)</strong> di pojok kanan atas. Aplikasi siap dibuka dari Home Screen!
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-full mt-2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded-xl text-xs transition-colors"
            >
              Mengerti
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Cara Pasang di Browser:
            </div>
            <p className="text-xs text-slate-700">
              Buka menu browser Anda (tiga titik di pojok kanan atas), lalu pilih <strong>"Instal aplikasi"</strong> atau <strong>"Tambahkan ke Layar Utama"</strong>.
            </p>
            <button
              onClick={onClose}
              className="w-full mt-2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded-xl text-xs transition-colors"
            >
              Tutup
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
