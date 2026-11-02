import React from 'react';
import { UnitSystem } from '../types/cycling';
import { Radio, Navigation, HardDrive, History, Activity, Bike, Sun, Sliders, Calendar, Cloud, User as UserIcon } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';
import { User } from '../services/firebase';

interface HeaderProps {
  activeTab: 'hud' | 'map' | 'stats' | 'offline' | 'history';
  onSelectTab: (tab: 'hud' | 'map' | 'stats' | 'offline' | 'history') => void;
  unit: UnitSystem;
  onToggleUnit: () => void;
  savedRidesCount?: number;
  isOnline: boolean;
  isScreenAwake?: boolean;
  onToggleScreenAwake?: () => void;
  onOpenDisplaySettings?: () => void;
  onOpenStravaModal?: () => void;
  user?: User | null;
  isSyncing?: boolean;
  onOpenAuthModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onSelectTab,
  unit,
  onToggleUnit,
  savedRidesCount = 0,
  isOnline,
  isScreenAwake = true,
  onToggleScreenAwake,
  onOpenDisplaySettings,
  onOpenStravaModal,
  user = null,
  isSyncing = false,
  onOpenAuthModal,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xl border-b border-slate-200/90 px-4 md:px-8 py-3.5 flex items-center justify-between gap-4 md:gap-8 shadow-sm">
      {/* Zone 1: Single text element wordmark */}
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault();
          onSelectTab('hud');
        }}
        className="text-lg md:text-xl font-black tracking-tight text-slate-900 flex items-center gap-2 whitespace-nowrap shrink-0 group"
      >
        <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-emerald-500 text-white flex items-center justify-center shadow-md group-hover:scale-105 transition-transform shrink-0 ring-2 ring-cyan-500/20">
          <Bike className="w-4.5 h-4.5 text-white stroke-[2.2]" />
        </span>
        <span className="tracking-tighter">
          Dhefin Ride Track <span className="text-cyan-600">GPS</span>
        </span>
      </a>

      {/* Zone 2: 4-5 clean single-line navigation tabs */}
      <nav className="hidden md:flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
        <button
          onClick={() => onSelectTab('hud')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
            activeTab === 'hud'
              ? 'bg-white text-cyan-600 shadow-sm font-bold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Dashboard HUD</span>
        </button>

        <button
          onClick={() => onSelectTab('map')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
            activeTab === 'map'
              ? 'bg-white text-cyan-600 shadow-sm font-bold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Navigation className="w-3.5 h-3.5" />
          <span>Peta Rute</span>
        </button>

        <button
          onClick={() => onSelectTab('stats')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
            activeTab === 'stats'
              ? 'bg-white text-cyan-600 shadow-sm font-bold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          <span>Statistik</span>
        </button>

        <button
          onClick={() => onSelectTab('offline')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
            activeTab === 'offline'
              ? 'bg-white text-cyan-600 shadow-sm font-bold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <HardDrive className="w-3.5 h-3.5" />
          <span>Peta Offline</span>
        </button>

        <button
          onClick={() => onSelectTab('history')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
            activeTab === 'history'
              ? 'bg-white text-cyan-600 shadow-sm font-bold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>Kalender & Rekap ({savedRidesCount})</span>
        </button>
      </nav>

      {/* Zone 3: Screen Wake Lock, settings, unit toggle & online status */}
      <div className="flex items-center gap-2 md:gap-2.5 shrink-0">
        {!isOnline && (
          <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
            Offline
          </span>
        )}

        {/* Quick Screen Wake Lock (Anti Redup) Toggle */}
        {onToggleScreenAwake && (
          <button
            onClick={onToggleScreenAwake}
            title={
              isScreenAwake
                ? 'Fitur Anti-Redup: AKTIF (Layar tidak akan mati/tidur saat gowes)'
                : 'Fitur Anti-Redup: MATI (Layar mengikuti standar tidur HP)'
            }
            className={`px-2.5 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 shadow-2xs ${
              isScreenAwake
                ? 'bg-amber-50 text-amber-800 border-amber-300 ring-2 ring-amber-400/20'
                : 'bg-white hover:bg-slate-50 text-slate-500 border-slate-200'
            }`}
          >
            <Sun
              className={`w-3.5 h-3.5 ${
                isScreenAwake ? 'text-amber-500 fill-amber-400' : 'text-slate-400'
              }`}
            />
            <span className="hidden lg:inline text-[11px]">
              {isScreenAwake ? 'Layar Terus Menyala' : 'Layar Redup'}
            </span>
          </button>
        )}

        {/* Display Settings Modal Trigger */}
        {onOpenDisplaySettings && (
          <button
            onClick={onOpenDisplaySettings}
            title="Buka Pengaturan Tampilan & Layar"
            className="p-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-2xs transition-all active:scale-95 flex items-center gap-1 text-xs font-semibold"
          >
            <Sliders className="w-4 h-4 text-slate-600" />
            <span className="hidden xl:inline text-[11px] text-slate-600">Pengaturan Layar</span>
          </button>
        )}

        {/* Cloud Sync & Google (Gmail) Login Button */}
        {onOpenAuthModal && (
          <button
            onClick={onOpenAuthModal}
            title={
              user
                ? `Tersinkronisasi ke Gmail ${user.email} (Klik untuk info & sinkronisasi)`
                : 'Masuk dengan Google (Gmail) untuk sinkronisasi aktivitas antar perangkat'
            }
            className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 shadow-2xs cursor-pointer ${
              user
                ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-300'
                : 'bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white border-transparent'
            }`}
          >
            {user ? (
              <>
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'User'}
                    referrerPolicy="no-referrer"
                    className="w-4 h-4 rounded-full object-cover ring-1 ring-emerald-400"
                  />
                ) : (
                  <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-black">
                    {(user.displayName || user.email || 'G')[0].toUpperCase()}
                  </span>
                )}
                <span className="hidden sm:inline max-w-[110px] truncate text-[11px]">
                  {user.email?.split('@')[0] || user.displayName}
                </span>
                <Cloud className={`w-3.5 h-3.5 text-emerald-700 ${isSyncing ? 'animate-spin' : ''}`} />
              </>
            ) : (
              <>
                <Cloud className="w-3.5 h-3.5 text-white" />
                <span className="text-[11px]">Sinkron Gmail</span>
              </>
            )}
          </button>
        )}

        {/* Strava & GPX Modal Trigger */}
        {onOpenStravaModal && (
          <button
            onClick={onOpenStravaModal}
            title="Koneksi Strava & Ekspor Berkas GPX"
            className="p-1.5 rounded-xl bg-white hover:bg-orange-50 text-slate-700 border border-slate-200 shadow-2xs transition-all active:scale-95 flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
          >
            <span className="w-4 h-4 rounded-full bg-[#FC4C02] text-white flex items-center justify-center font-bold text-[9px] shadow-3xs">
              S
            </span>
            <span className="hidden xl:inline text-[11px] text-slate-700">Strava & GPX</span>
          </button>
        )}

        {/* In-App PWA Install Button */}
        <PWAInstallButton variant="header" />

        {/* Metric / Imperial Unit Switcher */}
        <button
          onClick={onToggleUnit}
          title="Ganti satuan metrik (km/h) ke imperial (mph)"
          className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 shadow-2xs text-xs font-mono font-bold transition-all active:scale-95 flex items-center gap-1"
        >
          <span className={unit === 'metric' ? 'text-cyan-600' : 'text-slate-400'}>KM/H</span>
          <span className="text-slate-300">/</span>
          <span className={unit === 'imperial' ? 'text-amber-600' : 'text-slate-400'}>MPH</span>
        </button>
      </div>
    </header>
  );
};
