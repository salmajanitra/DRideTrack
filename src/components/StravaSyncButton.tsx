import React, { useState, useEffect } from 'react';
import { ActivityRecord } from '../types/cycling';
import { StravaService } from '../services/stravaService';
import { RefreshCw, CheckCircle2, ExternalLink, ArrowUpRight } from 'lucide-react';

interface StravaSyncButtonProps {
  activity: ActivityRecord;
  onOpenStravaModal?: () => void;
  className?: string;
  compact?: boolean;
}

export const StravaSyncButton: React.FC<StravaSyncButtonProps> = ({
  activity,
  onOpenStravaModal,
  className = '',
  compact = false,
}) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [stravaUrl, setStravaUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const existing = StravaService.getSyncedStravaUrl(activity.id);
    setStravaUrl(existing);
  }, [activity.id]);

  const handleSync = async (e: React.MouseEvent) => {
    e.stopPropagation();

    // If already synced, open Strava activity
    if (stravaUrl) {
      window.open(stravaUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    // Check if connected
    if (!StravaService.isConnected()) {
      if (onOpenStravaModal) {
        onOpenStravaModal();
      } else {
        alert('Silakan hubungkan akun Strava Anda terlebih dahulu di pengaturan Strava.');
      }
      return;
    }

    setIsSyncing(true);
    setErrorMessage(null);

    try {
      const res = await StravaService.uploadActivity(activity);
      if (res.success && res.stravaUrl) {
        setStravaUrl(res.stravaUrl);
      } else if (res.error) {
        setErrorMessage(res.error);
        alert(`Gagal sinkron ke Strava: ${res.error}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
      alert(`Gagal sinkron ke Strava: ${msg}`);
    } finally {
      setIsSyncing(false);
    }
  };

  if (compact) {
    if (stravaUrl) {
      return (
        <a
          href={stravaUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="p-1.5 rounded-lg bg-orange-50 hover:bg-orange-100 text-[#FC4C02] transition-colors border border-orange-200 inline-flex items-center gap-1 text-[11px] font-bold"
          title="Buka rute di Strava"
        >
          <span className="w-3.5 h-3.5 rounded-full bg-[#FC4C02] text-white flex items-center justify-center font-bold text-[8px]">
            S
          </span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </a>
      );
    }

    return (
      <button
        onClick={handleSync}
        disabled={isSyncing}
        className={`p-1.5 rounded-lg transition-colors border inline-flex items-center gap-1 text-[11px] font-bold ${
          isSyncing
            ? 'bg-orange-50 text-orange-600 border-orange-200 cursor-wait'
            : 'bg-white hover:bg-orange-50 text-slate-700 hover:text-[#FC4C02] border-slate-200 hover:border-orange-200'
        } ${className}`}
        title="Sinkronkan ke Strava"
      >
        {isSyncing ? (
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#FC4C02]" />
        ) : (
          <span className="w-3.5 h-3.5 rounded-full bg-[#FC4C02] text-white flex items-center justify-center font-bold text-[8px]">
            S
          </span>
        )}
      </button>
    );
  }

  // Full button style
  if (stravaUrl) {
    return (
      <a
        href={stravaUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={`px-3.5 py-2 rounded-xl bg-orange-50 hover:bg-orange-100 text-[#FC4C02] text-xs font-bold border border-orange-200 inline-flex items-center gap-2 transition-all shadow-3xs group ${className}`}
      >
        <span className="w-4 h-4 rounded-full bg-[#FC4C02] text-white flex items-center justify-center font-bold text-[9px]">
          S
        </span>
        <span>Lihat di Strava</span>
        <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
      </a>
    );
  }

  return (
    <button
      onClick={handleSync}
      disabled={isSyncing}
      className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-2 border shadow-3xs cursor-pointer active:scale-95 ${
        isSyncing
          ? 'bg-orange-50 text-orange-700 border-orange-200 cursor-wait'
          : 'bg-[#FC4C02] hover:bg-[#e04300] text-white border-transparent shadow-orange-500/20'
      } ${className}`}
      title="Unggah dan sinkronkan aktivitas ini ke Strava"
    >
      {isSyncing ? (
        <>
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          <span>Mengunggah ke Strava...</span>
        </>
      ) : (
        <>
          <span className="w-4 h-4 rounded-full bg-white text-[#FC4C02] flex items-center justify-center font-bold text-[10px]">
            S
          </span>
          <span>Sync ke Strava</span>
        </>
      )}
    </button>
  );
};
