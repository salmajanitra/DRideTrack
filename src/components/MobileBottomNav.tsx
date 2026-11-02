import React from 'react';
import { Activity, Navigation, Radio, HardDrive, Calendar } from 'lucide-react';

interface MobileBottomNavProps {
  activeTab: 'hud' | 'map' | 'stats' | 'offline' | 'history';
  onSelectTab: (tab: 'hud' | 'map' | 'stats' | 'offline' | 'history') => void;
  savedRidesCount?: number;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  onSelectTab,
  savedRidesCount = 0,
}) => {
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-xl border-t border-slate-200/90 px-2 py-1.5 shadow-lg">
      <div className="grid grid-cols-5 items-center">
        <button
          onClick={() => onSelectTab('hud')}
          className={`flex flex-col items-center justify-center py-1 rounded-xl transition-all ${
            activeTab === 'hud' ? 'text-cyan-600 font-bold' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <Activity className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] tracking-tight">HUD</span>
        </button>

        <button
          onClick={() => onSelectTab('map')}
          className={`flex flex-col items-center justify-center py-1 rounded-xl transition-all ${
            activeTab === 'map' ? 'text-cyan-600 font-bold' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <Navigation className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] tracking-tight">Peta</span>
        </button>

        <button
          onClick={() => onSelectTab('stats')}
          className={`flex flex-col items-center justify-center py-1 rounded-xl transition-all ${
            activeTab === 'stats' ? 'text-cyan-600 font-bold' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <Radio className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] tracking-tight">Statistik</span>
        </button>

        <button
          onClick={() => onSelectTab('offline')}
          className={`flex flex-col items-center justify-center py-1 rounded-xl transition-all ${
            activeTab === 'offline' ? 'text-cyan-600 font-bold' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <HardDrive className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] tracking-tight">Offline</span>
        </button>

        <button
          onClick={() => onSelectTab('history')}
          className={`flex flex-col items-center justify-center py-1 rounded-xl transition-all relative ${
            activeTab === 'history' ? 'text-cyan-600 font-bold' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <Calendar className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] tracking-tight">Kalender</span>
          {savedRidesCount > 0 && (
            <span className="absolute top-0 right-4 w-4 h-4 bg-cyan-600 text-white font-mono text-[9px] font-black rounded-full flex items-center justify-center shadow-xs">
              {savedRidesCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
};
