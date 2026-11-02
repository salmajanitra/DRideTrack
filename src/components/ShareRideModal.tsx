import React, { useState, useEffect, useMemo } from 'react';
import { ActivityRecord, UnitSystem } from '../types/cycling';
import {
  generateRideSnapshotBlob,
  shareOrDownloadRideSnapshot,
  buildActivityShareText,
  ShareCardAspectRatio,
  ShareMapStyle,
} from '../services/shareImageGenerator';
import {
  X,
  Share2,
  Download,
  Copy,
  Check,
  Moon,
  Sun,
  Map as MapIcon,
  FileText,
  Bike,
  Footprints,
} from 'lucide-react';

interface ShareRideModalProps {
  isOpen: boolean;
  onClose: () => void;
  activity: ActivityRecord | null;
  unit: UnitSystem;
}

const MAP_STYLE_OPTIONS: Array<{ value: ShareMapStyle; label: string }> = [
  { value: 'voyager', label: 'Peta Jalan' },
  { value: 'street', label: 'OSM Standar' },
  { value: 'dark', label: 'Peta Gelap' },
  { value: 'satellite', label: 'Satelit' },
];

const ASPECT_OPTIONS: Array<{ value: ShareCardAspectRatio; label: string; res: string }> = [
  { value: 'portrait', label: '4:5 Feed', res: '1080 × 1350' },
  { value: 'story', label: '9:16 Story', res: '1080 × 1920' },
  { value: 'square', label: '1:1 Persegi', res: '1080 × 1080' },
];

export const ShareRideModal: React.FC<ShareRideModalProps> = ({
  isOpen,
  onClose,
  activity,
  unit,
}) => {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [mapStyle, setMapStyle] = useState<ShareMapStyle>('voyager');
  const [aspectRatio, setAspectRatio] = useState<ShareCardAspectRatio>('portrait');
  const [snapshotDataUrl, setSnapshotDataUrl] = useState<string | null>(null);
  const [snapshotBlob, setSnapshotBlob] = useState<Blob | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: 1080,
    height: 1350,
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isImageCopied, setIsImageCopied] = useState(false);
  const [isTextCopied, setIsTextCopied] = useState(false);

  const shareCaptionText = useMemo(() => {
    if (!activity) return '';
    return buildActivityShareText(activity, unit);
  }, [activity, unit]);

  useEffect(() => {
    if (!isOpen || !activity) return;

    let isMounted = true;
    setIsGenerating(true);

    const generate = async () => {
      try {
        const result = await generateRideSnapshotBlob(activity, unit, {
          theme,
          aspectRatio,
          mapStyle,
          showSplits: true,
        });
        if (isMounted) {
          setSnapshotBlob(result.blob);
          setSnapshotDataUrl(result.dataUrl);
          setDimensions({ width: result.width, height: result.height });
        }
      } catch (err) {
        console.error('Failed to generate activity snapshot:', err);
      } finally {
        if (isMounted) {
          setIsGenerating(false);
        }
      }
    };

    generate();

    return () => {
      isMounted = false;
    };
  }, [isOpen, activity, unit, theme, aspectRatio, mapStyle]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  if (!isOpen || !activity) return null;

  const isRunning = activity.sportType === 'running';

  const handleNativeShare = async () => {
    if (!snapshotBlob || !snapshotDataUrl) return;
    setIsSharing(true);
    try {
      const res = await shareOrDownloadRideSnapshot(activity, snapshotBlob, snapshotDataUrl, unit);
      showToast(res.message);
    } catch (err) {
      console.error('Error sharing activity:', err);
      showToast('Gagal membagikan gambar. Silakan gunakan tombol Unduh PNG.');
    } finally {
      setIsSharing(false);
    }
  };

  const handleDownload = () => {
    if (!snapshotDataUrl) return;
    const cleanTitle = activity.title.replace(/[^a-zA-Z0-9]/g, '_') || 'aktivitas';
    const sportPrefix = isRunning ? 'Run' : 'Ride';
    const fileName = `RideTrack_${sportPrefix}_${cleanTitle}_${activity.stats.distanceKm.toFixed(2)}km.png`;

    const a = document.createElement('a');
    a.href = snapshotDataUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Gambar peta & detail aktivitas PNG berhasil diunduh.');
  };

  const handleCopyImage = async () => {
    if (!snapshotBlob) return;
    try {
      const ClipboardItemCtor = (
        window as unknown as { ClipboardItem?: new (items: Record<string, Blob>) => ClipboardItem }
      ).ClipboardItem;
      if (typeof navigator !== 'undefined' && navigator.clipboard && ClipboardItemCtor) {
        await navigator.clipboard.write([
          new ClipboardItemCtor({
            'image/png': snapshotBlob,
          }),
        ]);
        setIsImageCopied(true);
        showToast('Gambar kartu peta & detail berhasil disalin ke clipboard.');
        setTimeout(() => setIsImageCopied(false), 2500);
      } else {
        handleDownload();
      }
    } catch {
      handleDownload();
    }
  };

  const handleCopyText = async () => {
    if (!shareCaptionText) return;
    try {
      await navigator.clipboard.writeText(shareCaptionText);
      setIsTextCopied(true);
      showToast('Teks detail aktivitas berhasil disalin ke clipboard.');
      setTimeout(() => setIsTextCopied(false), 2500);
    } catch {
      showToast('Tidak dapat menyalin teks secara otomatis pada browser ini.');
    }
  };

  const isNativeShareSupported = typeof navigator !== 'undefined' && !!navigator.share;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/75 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl max-w-4xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-white">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl text-white flex items-center justify-center shrink-0 ${
                isRunning ? 'bg-emerald-600' : 'bg-cyan-600'
              }`}
            >
              {isRunning ? <Footprints className="w-5 h-5" /> : <Bike className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900">
                {isRunning ? 'Bagikan Aktivitas Lari' : 'Share My Ride · Bagikan Aktivitas'}
              </h3>
              <p className="text-xs text-slate-500">
                Gambar peta rute asli beserta detail telemetri lengkap · {dimensions.width} × {dimensions.height} PNG
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors cursor-pointer"
            title="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Snapshot Image Preview */}
            <div className="lg:col-span-7 space-y-3">
              <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 flex items-center justify-center min-h-[360px] max-h-[520px] p-3">
                {isGenerating ? (
                  <div className="text-center space-y-2.5 text-slate-600 py-20">
                    <div className="w-8 h-8 border-3 border-cyan-600 border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="text-xs font-semibold">
                      Memuat citra peta rute & menyusun detail aktivitas...
                    </p>
                  </div>
                ) : snapshotDataUrl ? (
                  <img
                    src={snapshotDataUrl}
                    alt={`Kartu peta dan detail ${activity.title}`}
                    className="max-h-[490px] w-auto object-contain rounded-xl shadow-md border border-slate-200/60"
                  />
                ) : (
                  <div className="text-xs text-slate-500 py-16">
                    Gagal merender pratinjau kartu aktivitas.
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                <span>Peta rute GPS + penanda kilometer + metrik lengkap</span>
                <span className="font-mono tabular-nums">
                  {dimensions.width} × {dimensions.height} px
                </span>
              </div>
            </div>

            {/* Right Column: Map/Card Customization & Activity Detail Text */}
            <div className="lg:col-span-5 space-y-5">
              {/* 1. Map Tile Layer Selector */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <MapIcon className="w-3.5 h-3.5 text-cyan-600" />
                  <span>Gaya Citra Peta pada Kartu</span>
                </label>
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
                  {MAP_STYLE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setMapStyle(opt.value)}
                      className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        mapStyle === opt.value
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. Card Theme & Aspect Ratio */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700 block">
                    Tema Latar Kartu
                  </label>
                  <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setTheme('dark')}
                      className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                        theme === 'dark'
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Moon className="w-3.5 h-3.5" />
                      <span>Dark Carbon</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTheme('light')}
                      className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                        theme === 'light'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Sun className="w-3.5 h-3.5 text-amber-500" />
                      <span>Clean Light</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700 block">
                    Ukuran & Format Gambar
                  </label>
                  <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
                    {ASPECT_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setAspectRatio(opt.value)}
                        className={`min-h-[40px] px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                          aspectRatio === opt.value
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 3. Attached Activity Details Caption Preview */}
              <div className="space-y-2 pt-1 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-cyan-600" />
                    <span>Teks Detail Aktivitas Terlampir</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyText}
                    className="text-xs font-semibold text-cyan-700 hover:text-cyan-800 flex items-center gap-1 cursor-pointer"
                  >
                    {isTextCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Teks Tersalin</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Salin Teks</span>
                      </>
                    )}
                  </button>
                </div>

                <pre className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] leading-relaxed text-slate-700 font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {shareCaptionText}
                </pre>
              </div>
            </div>
          </div>

          {toastMessage && (
            <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{toastMessage}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-4 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleCopyImage}
            disabled={isGenerating || !snapshotBlob}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-200 cursor-pointer disabled:opacity-50"
          >
            {isImageCopied ? (
              <Check className="w-4 h-4 text-emerald-600" />
            ) : (
              <Copy className="w-4 h-4 text-slate-600" />
            )}
            <span>{isImageCopied ? 'Gambar Tersalin' : 'Salin Gambar'}</span>
          </button>

          <div className="flex items-center gap-2.5 ml-auto flex-wrap">
            <button
              type="button"
              onClick={handleDownload}
              disabled={isGenerating || !snapshotDataUrl}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-800 text-xs font-bold flex items-center gap-1.5 transition-colors border border-slate-200 cursor-pointer disabled:opacity-50"
            >
              <Download className="w-4 h-4 text-cyan-600" />
              <span>Unduh PNG</span>
            </button>

            <button
              type="button"
              onClick={handleNativeShare}
              disabled={isSharing || isGenerating || !snapshotBlob}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center gap-2 shadow-sm transition-colors cursor-pointer disabled:opacity-50"
            >
              <Share2 className="w-4 h-4" />
              <span>
                {isNativeShareSupported
                  ? 'Share Gambar Peta & Detail'
                  : 'Unduh Peta & Salin Detail'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
