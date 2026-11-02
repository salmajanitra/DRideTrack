import React, { useState, useMemo } from 'react';
import { ActivityRecord, UnitSystem } from '../types/cycling';
import {
  formatDistance,
  formatDuration,
  formatSpeed,
  formatElevation,
  getDistanceUnitLabel,
  getSpeedUnitLabel,
} from '../utils/units';
import { exportActivityToGPX } from '../services/gpxExporter';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Clock,
  Compass,
  Bike,
  Award,
  BarChart3,
  Flame,
  ArrowUpRight,
  Download,
  Trash2,
  Layers,
  Sparkles,
  Share2,
} from 'lucide-react';
import { ShareRideModal } from './ShareRideModal';
import { StravaSyncButton } from './StravaSyncButton';
import { StravaConnectModal } from './StravaConnectModal';

interface ActivityCalendarRecapProps {
  activities: ActivityRecord[];
  unit: UnitSystem;
  onSelectActivity: (activity: ActivityRecord) => void;
  onDeleteActivity?: (id: string) => void;
  initialDate?: Date;
}

type RecapViewMode = 'calendar' | 'daily' | 'weekly' | 'monthly';

export const ActivityCalendarRecap: React.FC<ActivityCalendarRecapProps> = ({
  activities,
  unit,
  onSelectActivity,
  onDeleteActivity,
  initialDate,
}) => {
  // Calendar viewing month/year state
  const [currentMonthDate, setCurrentMonthDate] = useState<Date>(() => {
    if (initialDate) return new Date(initialDate.getFullYear(), initialDate.getMonth(), 1);
    if (activities.length > 0) {
      const latest = new Date(activities[0].startTime);
      return new Date(latest.getFullYear(), latest.getMonth(), 1);
    }
    return new Date();
  });

  // Selected specific date state
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    if (initialDate) return initialDate;
    if (activities.length > 0) {
      return new Date(activities[0].startTime);
    }
    return new Date();
  });

  const [activeTab, setActiveTab] = useState<RecapViewMode>('calendar');
  const [shareTargetActivity, setShareTargetActivity] = useState<ActivityRecord | null>(null);
  const [showStravaModal, setShowStravaModal] = useState(false);

  // Month navigation helpers
  const handlePrevMonth = () => {
    setCurrentMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleGoToToday = () => {
    const today = new Date();
    setCurrentMonthDate(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(today);
  };

  // Group activities by date string key 'YYYY-MM-DD'
  const activitiesByDateKey = useMemo(() => {
    const map = new Map<string, ActivityRecord[]>();
    for (const act of activities) {
      const d = new Date(act.startTime);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate()
      ).padStart(2, '0')}`;
      const existing = map.get(key) || [];
      existing.push(act);
      map.set(key, existing);
    }
    return map;
  }, [activities]);

  const getDateKey = (date: Date): string => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate()
    ).padStart(2, '0')}`;
  };

  // Calculate totals helper
  const calculateTotals = (records: ActivityRecord[]) => {
    let distanceKm = 0;
    let totalDurationSeconds = 0;
    let movingTimeSeconds = 0;
    let elevationGainM = 0;
    let elevationLossM = 0;
    let maxSpeedKmH = 0;

    for (const act of records) {
      distanceKm += act.stats.distanceKm;
      totalDurationSeconds += act.stats.totalDurationSeconds;
      movingTimeSeconds += act.stats.movingTimeSeconds;
      elevationGainM += act.stats.elevationGainM;
      elevationLossM += act.stats.elevationLossM;
      if (act.stats.maxSpeedKmH > maxSpeedKmH) {
        maxSpeedKmH = act.stats.maxSpeedKmH;
      }
    }

    const movingHours = movingTimeSeconds / 3600;
    const avgSpeedKmH = movingHours > 0 ? distanceKm / movingHours : 0;
    const overallHours = totalDurationSeconds / 3600;
    const overallAvgSpeedKmH = overallHours > 0 ? distanceKm / overallHours : 0;

    return {
      count: records.length,
      distanceKm,
      totalDurationSeconds,
      movingTimeSeconds,
      elevationGainM,
      elevationLossM,
      avgSpeedKmH,
      overallAvgSpeedKmH,
      maxSpeedKmH,
    };
  };

  // 1. DAILY RECAP for selectedDate
  const selectedDateKey = getDateKey(selectedDate);
  const dailyActivities = useMemo(() => {
    return activitiesByDateKey.get(selectedDateKey) || [];
  }, [activitiesByDateKey, selectedDateKey]);

  const dailyTotals = useMemo(() => {
    return calculateTotals(dailyActivities);
  }, [dailyActivities]);

  // 2. WEEKLY RECAP for the week containing selectedDate (Monday to Sunday)
  const { weekStart, weekEnd, weeklyActivities, weeklyDaysBreakdown, weeklyTotals } = useMemo(() => {
    const d = new Date(selectedDate);
    const dayOfWeek = d.getDay(); // 0 is Sunday, 1 is Monday...
    const diffToMonday = (dayOfWeek + 6) % 7; // days since Monday
    const start = new Date(d);
    start.setDate(d.getDate() - diffToMonday);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    const weekActs: ActivityRecord[] = [];
    const daysBreakdown: {
      date: Date;
      dayLabel: string;
      dateNumber: number;
      distanceKm: number;
      durationSec: number;
      elevationGainM: number;
      activities: ActivityRecord[];
    }[] = [];

    const dayLabels = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

    for (let i = 0; i < 7; i++) {
      const curDate = new Date(start);
      curDate.setDate(start.getDate() + i);
      const key = `${curDate.getFullYear()}-${String(curDate.getMonth() + 1).padStart(2, '0')}-${String(
        curDate.getDate()
      ).padStart(2, '0')}`;
      const dayActs = activitiesByDateKey.get(key) || [];
      weekActs.push(...dayActs);

      const dDist = dayActs.reduce((acc, a) => acc + a.stats.distanceKm, 0);
      const dDur = dayActs.reduce((acc, a) => acc + a.stats.totalDurationSeconds, 0);
      const dElev = dayActs.reduce((acc, a) => acc + a.stats.elevationGainM, 0);

      daysBreakdown.push({
        date: curDate,
        dayLabel: dayLabels[i],
        dateNumber: curDate.getDate(),
        distanceKm: dDist,
        durationSec: dDur,
        elevationGainM: dElev,
        activities: dayActs,
      });
    }

    const totals = calculateTotals(weekActs);

    return {
      weekStart: start,
      weekEnd: end,
      weeklyActivities: weekActs,
      weeklyDaysBreakdown: daysBreakdown,
      weeklyTotals: totals,
    };
  }, [selectedDate, activitiesByDateKey]);

  // 3. MONTHLY RECAP for currentMonthDate
  const { monthlyActivities, monthlyTotals, monthlyWeeklyBreakdown, longestRide, highestElevationRide } = useMemo(() => {
    const year = currentMonthDate.getFullYear();
    const month = currentMonthDate.getMonth();

    const monthActs = activities.filter((act) => {
      const d = new Date(act.startTime);
      return d.getFullYear() === year && d.getMonth() === month;
    });

    const totals = calculateTotals(monthActs);

    let longest: ActivityRecord | null = null;
    let highestElev: ActivityRecord | null = null;

    for (const act of monthActs) {
      if (!longest || act.stats.distanceKm > longest.stats.distanceKm) {
        longest = act;
      }
      if (!highestElev || act.stats.elevationGainM > highestElev.stats.elevationGainM) {
        highestElev = act;
      }
    }

    // Weekly chunks for the month
    const weeks: {
      weekNum: number;
      label: string;
      distanceKm: number;
      durationSec: number;
      elevationGainM: number;
      count: number;
    }[] = [];

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    let currentWeekStart = new Date(firstDay);
    let weekIndex = 1;

    while (currentWeekStart <= lastDay) {
      const currentWeekEnd = new Date(currentWeekStart);
      currentWeekEnd.setDate(currentWeekStart.getDate() + 6);
      if (currentWeekEnd > lastDay) {
        currentWeekEnd.setTime(lastDay.getTime());
      }
      currentWeekEnd.setHours(23, 59, 59, 999);

      const wActs = monthActs.filter((a) => {
        const t = a.startTime;
        return t >= currentWeekStart.getTime() && t <= currentWeekEnd.getTime();
      });

      const wDist = wActs.reduce((acc, a) => acc + a.stats.distanceKm, 0);
      const wDur = wActs.reduce((acc, a) => acc + a.stats.totalDurationSeconds, 0);
      const wElev = wActs.reduce((acc, a) => acc + a.stats.elevationGainM, 0);

      weeks.push({
        weekNum: weekIndex,
        label: `Mgg ${weekIndex} (${currentWeekStart.getDate()} - ${currentWeekEnd.getDate()} ${currentMonthDate.toLocaleDateString(
          'id-ID',
          { month: 'short' }
        )})`,
        distanceKm: wDist,
        durationSec: wDur,
        elevationGainM: wElev,
        count: wActs.length,
      });

      currentWeekStart = new Date(currentWeekEnd);
      currentWeekStart.setDate(currentWeekStart.getDate() + 1);
      currentWeekStart.setHours(0, 0, 0, 0);
      weekIndex++;
    }

    return {
      monthlyActivities: monthActs,
      monthlyTotals: totals,
      monthlyWeeklyBreakdown: weeks,
      longestRide: longest,
      highestElevationRide: highestElev,
    };
  }, [currentMonthDate, activities]);

  // Calendar Matrix generation (Monday-first ISO style)
  const calendarDays = useMemo(() => {
    const year = currentMonthDate.getFullYear();
    const month = currentMonthDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const totalDays = lastDayOfMonth.getDate();

    // In JS getDay(): 0 is Sunday, 1 is Monday... 6 is Saturday
    // In Monday-first calendar: Mon=0, Tue=1, Wed=2, Thu=3, Fri=4, Sat=5, Sun=6
    const startDayOffset = (firstDayOfMonth.getDay() + 6) % 7;

    const days: {
      date: Date;
      isCurrentMonth: boolean;
      isToday: boolean;
      isSelected: boolean;
      dateNumber: number;
      activities: ActivityRecord[];
      totalDistanceKm: number;
      totalElevationGainM: number;
    }[] = [];

    const todayStr = getDateKey(new Date());
    const selStr = getDateKey(selectedDate);

    // Previous month padding days
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startDayOffset - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevMonthLastDay - i);
      const key = getDateKey(d);
      const acts = activitiesByDateKey.get(key) || [];
      const dist = acts.reduce((acc, a) => acc + a.stats.distanceKm, 0);
      const elev = acts.reduce((acc, a) => acc + a.stats.elevationGainM, 0);
      days.push({
        date: d,
        isCurrentMonth: false,
        isToday: key === todayStr,
        isSelected: key === selStr,
        dateNumber: d.getDate(),
        activities: acts,
        totalDistanceKm: dist,
        totalElevationGainM: elev,
      });
    }

    // Current month days
    for (let day = 1; day <= totalDays; day++) {
      const d = new Date(year, month, day);
      const key = getDateKey(d);
      const acts = activitiesByDateKey.get(key) || [];
      const dist = acts.reduce((acc, a) => acc + a.stats.distanceKm, 0);
      const elev = acts.reduce((acc, a) => acc + a.stats.elevationGainM, 0);
      days.push({
        date: d,
        isCurrentMonth: true,
        isToday: key === todayStr,
        isSelected: key === selStr,
        dateNumber: day,
        activities: acts,
        totalDistanceKm: dist,
        totalElevationGainM: elev,
      });
    }

    // Next month padding days to complete 35 or 42 grid cells
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      const key = getDateKey(d);
      const acts = activitiesByDateKey.get(key) || [];
      const dist = acts.reduce((acc, a) => acc + a.stats.distanceKm, 0);
      const elev = acts.reduce((acc, a) => acc + a.stats.elevationGainM, 0);
      days.push({
        date: d,
        isCurrentMonth: false,
        isToday: key === todayStr,
        isSelected: key === selStr,
        dateNumber: i,
        activities: acts,
        totalDistanceKm: dist,
        totalElevationGainM: elev,
      });
    }

    return days;
  }, [currentMonthDate, selectedDate, activitiesByDateKey]);

  // Max distance in week breakdown for bar scaling
  const maxWeeklyDistance = useMemo(() => {
    return Math.max(...weeklyDaysBreakdown.map((d) => d.distanceKm), 10);
  }, [weeklyDaysBreakdown]);

  // Max distance in monthly weekly breakdown
  const maxMonthlyWeekDistance = useMemo(() => {
    return Math.max(...monthlyWeeklyBreakdown.map((w) => w.distanceKm), 10);
  }, [monthlyWeeklyBreakdown]);

  return (
    <div className="space-y-6">
      {/* Top Bar: View Mode Switcher & Quick Stats */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-emerald-500 text-white flex items-center justify-center shadow-xs">
                <CalendarIcon className="w-4.5 h-4.5" />
              </span>
              <h2 className="text-lg md:text-xl font-black text-slate-900 tracking-tight">
                Kalender & Rekap Statistik Gowes
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Rekapitulasi total jarak tempuh, durasi gowes, dan elevasi per hari, minggu, dan bulan
            </p>
          </div>

          {/* Granularity Switcher Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl border border-slate-200 shrink-0 self-start sm:self-auto">
            <button
              onClick={() => setActiveTab('calendar')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'calendar'
                  ? 'bg-white text-cyan-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>Kalender</span>
            </button>
            <button
              onClick={() => setActiveTab('daily')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'daily'
                  ? 'bg-white text-cyan-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Harian</span>
            </button>
            <button
              onClick={() => setActiveTab('weekly')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'weekly'
                  ? 'bg-white text-cyan-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Mingguan</span>
            </button>
            <button
              onClick={() => setActiveTab('monthly')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'monthly'
                  ? 'bg-white text-cyan-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Bulanan</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Interactive Month Calendar (visible in calendar and daily tabs, or as reference) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white border border-slate-200/90 rounded-3xl p-4 sm:p-5 shadow-sm">
            {/* Calendar Month Header Controls */}
            <div className="flex items-center justify-between pb-3.5 mb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-slate-900">
                  {currentMonthDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
                </h3>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-cyan-50 text-cyan-700 border border-cyan-200">
                  {monthlyTotals.count} Gowes
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleGoToToday}
                  className="px-2.5 py-1 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                  title="Ke Hari Ini"
                >
                  Hari Ini
                </button>
                <button
                  onClick={handlePrevMonth}
                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                  title="Bulan sebelumnya"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={handleNextMonth}
                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                  title="Bulan berikutnya"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Days of week header */}
            <div className="grid grid-cols-7 gap-1 text-center mb-1.5">
              {['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((d, idx) => (
                <div
                  key={d}
                  className={`text-[11px] font-bold py-1 ${
                    idx >= 5 ? 'text-amber-600' : 'text-slate-400'
                  }`}
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar Grid Matrix */}
            <div className="grid grid-cols-7 gap-1.5">
              {calendarDays.map((cell, idx) => {
                const hasActivity = cell.activities.length > 0;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setSelectedDate(cell.date);
                      if (activeTab === 'calendar') {
                        // keep in calendar or switch to daily if preferred
                      }
                    }}
                    className={`min-h-[64px] sm:min-h-[76px] p-1.5 rounded-2xl flex flex-col justify-between text-left transition-all relative border ${
                      cell.isSelected
                        ? 'border-cyan-500 bg-cyan-50/60 ring-2 ring-cyan-500/30'
                        : cell.isToday
                        ? 'border-amber-400 bg-amber-50/30'
                        : cell.isCurrentMonth
                        ? 'border-slate-100 bg-slate-50/50 hover:bg-slate-100/70 hover:border-slate-300'
                        : 'border-transparent bg-transparent opacity-40 hover:opacity-75'
                    }`}
                  >
                    {/* Day number & indicators */}
                    <div className="flex items-center justify-between w-full">
                      <span
                        className={`text-xs font-bold inline-flex items-center justify-center w-5 h-5 rounded-full ${
                          cell.isToday
                            ? 'bg-amber-500 text-white font-black'
                            : cell.isSelected
                            ? 'bg-cyan-600 text-white'
                            : 'text-slate-700'
                        }`}
                      >
                        {cell.dateNumber}
                      </span>

                      {hasActivity && (
                        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                      )}
                    </div>

                    {/* Cycling Activity Badge inside calendar cell */}
                    {hasActivity ? (
                      <div className="mt-1 w-full space-y-0.5">
                        <div className="text-[10px] sm:text-[11px] font-black font-mono-numbers text-cyan-800 truncate bg-white/90 px-1 py-0.5 rounded border border-cyan-100 shadow-3xs leading-none">
                          {formatDistance(cell.totalDistanceKm, unit)}
                        </div>
                        {cell.totalElevationGainM > 0 && (
                          <div className="text-[9px] font-bold text-emerald-700 hidden sm:block truncate leading-none">
                            +{formatElevation(cell.totalElevationGainM, unit)}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="h-4" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Calendar Legend */}
            <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs text-slate-500 gap-2">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span>Ada Aktivitas Gowes</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <span>Hari Ini</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-600" />
                  <span>Tanggal Terpilih</span>
                </span>
              </div>
              <span className="text-[11px] text-slate-400">
                Klik tanggal untuk melihat rekap hari tersebut
              </span>
            </div>
          </div>

          {/* Quick Month Highlights */}
          <div className="bg-gradient-to-br from-cyan-600 to-emerald-600 rounded-3xl p-5 text-white shadow-md space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase font-bold tracking-wider text-cyan-100 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-300" />
                Rangkuman Bulan {currentMonthDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
              </span>
              <span className="text-xs bg-white/20 backdrop-blur-xs px-2.5 py-0.5 rounded-full font-bold">
                {monthlyTotals.count} Total Sesi
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3 pt-1">
              <div>
                <span className="text-[10px] uppercase font-bold text-cyan-100 block">Total Jarak</span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-2xl sm:text-3xl font-black font-mono-numbers">
                    {formatDistance(monthlyTotals.distanceKm, unit)}
                  </span>
                  <span className="text-xs font-bold text-cyan-200">{getDistanceUnitLabel(unit)}</span>
                </div>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-cyan-100 block">Total Durasi</span>
                <div className="mt-0.5">
                  <span className="text-2xl sm:text-3xl font-black font-mono-numbers">
                    {formatDuration(monthlyTotals.totalDurationSeconds)}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-cyan-100 block">Total Elevasi</span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-2xl sm:text-3xl font-black font-mono-numbers">
                    +{formatElevation(monthlyTotals.elevationGainM, unit)}
                  </span>
                  <span className="text-xs font-bold text-cyan-200">
                    {unit === 'metric' ? 'm' : 'ft'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Detailed Recap Cards based on Active Tab */}
        <div className="lg:col-span-5 space-y-5">
          {/* VIEW: HARIAN (Daily Recap) */}
          {(activeTab === 'calendar' || activeTab === 'daily') && (
            <div className="bg-white border border-slate-200/90 rounded-3xl p-4 sm:p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-cyan-700 block">
                    Rekap Harian
                  </span>
                  <h3 className="text-base font-black text-slate-900">
                    {selectedDate.toLocaleDateString('id-ID', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </h3>
                </div>
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                  {dailyTotals.count} Aktivitas
                </span>
              </div>

              {dailyTotals.count === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 space-y-2">
                  <Bike className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-xs font-bold text-slate-700">Tidak ada aktivitas pada tanggal ini</p>
                  <p className="text-[11px] text-slate-500">
                    Pilih tanggal bertitik hijau di kalender atau mulai kayuh rute baru hari ini!
                  </p>
                </div>
              ) : (
                <>
                  {/* Daily Metric Grid */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block">Total Jarak</span>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className="text-xl sm:text-2xl font-black font-mono-numbers text-slate-900">
                          {formatDistance(dailyTotals.distanceKm, unit)}
                        </span>
                        <span className="text-xs text-cyan-700 font-bold">{getDistanceUnitLabel(unit)}</span>
                      </div>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block">Total Durasi</span>
                      <div className="text-xl sm:text-2xl font-black font-mono-numbers text-slate-900 mt-0.5">
                        {formatDuration(dailyTotals.totalDurationSeconds)}
                      </div>
                      <span className="text-[10px] text-slate-500 block">
                        Bergerak: {formatDuration(dailyTotals.movingTimeSeconds)}
                      </span>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block">Elevasi Naik / Turun</span>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className="text-lg font-black font-mono-numbers text-emerald-600">
                          +{formatElevation(dailyTotals.elevationGainM, unit)}
                        </span>
                        <span className="text-xs text-rose-600 font-mono-numbers">
                          -{formatElevation(dailyTotals.elevationLossM, unit)}
                        </span>
                      </div>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block">Kec. Rata-rata</span>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className="text-xl sm:text-2xl font-black font-mono-numbers text-cyan-700">
                          {formatSpeed(dailyTotals.avgSpeedKmH, unit)}
                        </span>
                        <span className="text-xs text-slate-500 font-bold">{getSpeedUnitLabel(unit)}</span>
                      </div>
                      <span className="text-[10px] text-slate-500 block">
                        Maks: {formatSpeed(dailyTotals.maxSpeedKmH, unit)} {getSpeedUnitLabel(unit)}
                      </span>
                    </div>
                  </div>

                  {/* List of activities completed on this day */}
                  <div className="space-y-2 pt-1">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                      Daftar Gowes Hari Ini ({dailyActivities.length})
                    </span>
                    {dailyActivities.map((act) => (
                      <div
                        key={act.id}
                        onClick={() => onSelectActivity(act)}
                        className="p-3 bg-slate-50 hover:bg-slate-100 rounded-2xl border border-slate-200 hover:border-cyan-300 transition-all cursor-pointer shadow-3xs flex items-center justify-between gap-3 group"
                      >
                        <div className="space-y-0.5 flex-1 min-w-0">
                          <h4 className="text-xs font-bold text-slate-900 truncate group-hover:text-cyan-700 transition-colors">
                            {act.title}
                          </h4>
                          <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono-numbers">
                            <span className="text-cyan-700 font-bold">
                              {formatDistance(act.stats.distanceKm, unit)} {getDistanceUnitLabel(unit)}
                            </span>
                            <span>·</span>
                            <span>{formatDuration(act.stats.totalDurationSeconds)}</span>
                            <span>·</span>
                            <span className="text-emerald-600">
                              +{formatElevation(act.stats.elevationGainM, unit)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <StravaSyncButton
                            activity={act}
                            compact={true}
                            onOpenStravaModal={() => setShowStravaModal(true)}
                          />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShareTargetActivity(act);
                            }}
                            className="p-1.5 rounded-lg bg-white hover:bg-slate-200 text-slate-600 hover:text-cyan-600 transition-colors border border-slate-200"
                            title="Share My Ride (PNG Snapshot)"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              exportActivityToGPX(act);
                            }}
                            className="p-1.5 rounded-lg bg-white hover:bg-slate-200 text-slate-600 transition-colors border border-slate-200"
                            title="Ekspor GPX"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <span className="p-1.5 rounded-lg text-slate-400 group-hover:text-cyan-700">
                            <ArrowUpRight className="w-4 h-4" />
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* VIEW: MINGGUAN (Weekly Recap) */}
          {activeTab === 'weekly' && (
            <div className="bg-white border border-slate-200/90 rounded-3xl p-4 sm:p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-cyan-700 block">
                    Rekap Mingguan
                  </span>
                  <h3 className="text-base font-black text-slate-900">
                    {weekStart.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} –{' '}
                    {weekEnd.toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </h3>
                </div>
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-cyan-50 text-cyan-700 border border-cyan-200">
                  {weeklyTotals.count} Sesi Gowes
                </span>
              </div>

              {/* Weekly Top Metrics */}
              <div className="grid grid-cols-3 gap-2.5">
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Jarak Seminggu</span>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-xl font-black font-mono-numbers text-cyan-800">
                      {formatDistance(weeklyTotals.distanceKm, unit)}
                    </span>
                    <span className="text-xs text-slate-500">{getDistanceUnitLabel(unit)}</span>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Durasi Seminggu</span>
                  <div className="text-lg font-black font-mono-numbers text-slate-900 mt-0.5">
                    {formatDuration(weeklyTotals.totalDurationSeconds)}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Elevasi Seminggu</span>
                  <div className="text-lg font-black font-mono-numbers text-emerald-600 mt-0.5">
                    +{formatElevation(weeklyTotals.elevationGainM, unit)}
                  </div>
                </div>
              </div>

              {/* 7-Day Visual Bar Chart */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                  <span>Distribusi Jarak Harian (Senin - Minggu)</span>
                  <span className="text-[10px] text-slate-500">Skala: {formatDistance(maxWeeklyDistance, unit)} {getDistanceUnitLabel(unit)}</span>
                </div>

                <div className="grid grid-cols-7 gap-1.5 pt-3 items-end h-32">
                  {weeklyDaysBreakdown.map((item, idx) => {
                    const heightPercent =
                      maxWeeklyDistance > 0 ? Math.min(100, Math.round((item.distanceKm / maxWeeklyDistance) * 100)) : 0;
                    const isSelected = getDateKey(item.date) === selectedDateKey;

                    return (
                      <div
                        key={idx}
                        onClick={() => setSelectedDate(item.date)}
                        className="flex flex-col items-center h-full justify-end cursor-pointer group"
                      >
                        <span className="text-[9px] font-mono-numbers text-slate-500 mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {item.distanceKm > 0 ? `${item.distanceKm.toFixed(1)}` : '0'}
                        </span>
                        <div className="w-full bg-slate-200 rounded-t-lg h-24 flex items-end overflow-hidden">
                          <div
                            style={{ height: `${Math.max(item.distanceKm > 0 ? 12 : 0, heightPercent)}%` }}
                            className={`w-full rounded-t-lg transition-all ${
                              isSelected
                                ? 'bg-cyan-500'
                                : item.distanceKm > 0
                                ? 'bg-emerald-500 group-hover:bg-emerald-400'
                                : 'bg-transparent'
                            }`}
                          />
                        </div>
                        <span
                          className={`text-[10px] font-bold mt-1.5 ${
                            isSelected ? 'text-cyan-600 underline' : 'text-slate-600'
                          }`}
                        >
                          {item.dayLabel}
                        </span>
                        <span className="text-[9px] text-slate-400 font-mono-numbers">{item.dateNumber}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Rides this week */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                  Aktivitas Minggu Ini ({weeklyActivities.length})
                </span>
                {weeklyActivities.length === 0 ? (
                  <p className="text-xs text-slate-500 italic p-3 bg-slate-50 rounded-xl">
                    Belum ada sesi gowes di minggu ini.
                  </p>
                ) : (
                  weeklyActivities.map((act) => (
                    <div
                      key={act.id}
                      onClick={() => onSelectActivity(act)}
                      className="p-3 bg-slate-50 hover:bg-slate-100 rounded-2xl border border-slate-200 hover:border-cyan-300 transition-all cursor-pointer flex items-center justify-between"
                    >
                      <div>
                        <div className="text-xs font-bold text-slate-900">{act.title}</div>
                        <div className="text-[11px] text-slate-500 font-mono-numbers mt-0.5">
                          {new Date(act.startTime).toLocaleDateString('id-ID', {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short',
                          })}{' '}
                          · {formatDistance(act.stats.distanceKm, unit)} {getDistanceUnitLabel(unit)} ·{' '}
                          {formatDuration(act.stats.totalDurationSeconds)}
                        </div>
                      </div>
                      <ArrowUpRight className="w-4 h-4 text-slate-400" />
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* VIEW: BULANAN (Monthly Recap) */}
          {activeTab === 'monthly' && (
            <div className="bg-white border border-slate-200/90 rounded-3xl p-4 sm:p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-cyan-700 block">
                    Rekap Bulanan
                  </span>
                  <h3 className="text-base font-black text-slate-900">
                    Bulan {currentMonthDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
                  </h3>
                </div>
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {monthlyTotals.count} Total Sesi
                </span>
              </div>

              {/* Records & Highlights */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3.5 bg-cyan-50/60 border border-cyan-100 rounded-2xl">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-cyan-900">
                    <Award className="w-4 h-4 text-cyan-600" />
                    <span>Gowes Terjauh</span>
                  </div>
                  {longestRide ? (
                    <div className="mt-1.5">
                      <div className="text-lg font-black font-mono-numbers text-cyan-950">
                        {formatDistance(longestRide.stats.distanceKm, unit)} {getDistanceUnitLabel(unit)}
                      </div>
                      <div className="text-[10px] text-cyan-800 truncate">{longestRide.title}</div>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400 mt-1">-</div>
                  )}
                </div>

                <div className="p-3.5 bg-emerald-50/60 border border-emerald-100 rounded-2xl">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900">
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                    <span>Elevasi Tertinggi</span>
                  </div>
                  {highestElevationRide ? (
                    <div className="mt-1.5">
                      <div className="text-lg font-black font-mono-numbers text-emerald-950">
                        +{formatElevation(highestElevationRide.stats.elevationGainM, unit)}
                      </div>
                      <div className="text-[10px] text-emerald-800 truncate">{highestElevationRide.title}</div>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400 mt-1">-</div>
                  )}
                </div>
              </div>

              {/* Weekly Progression in this Month */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                  Progres Per Minggu di Bulan Ini
                </span>
                <div className="space-y-3">
                  {monthlyWeeklyBreakdown.map((wb) => {
                    const barPercent =
                      maxMonthlyWeekDistance > 0
                        ? Math.min(100, Math.round((wb.distanceKm / maxMonthlyWeekDistance) * 100))
                        : 0;

                    return (
                      <div key={wb.weekNum} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-700">{wb.label}</span>
                          <span className="font-mono-numbers font-bold text-slate-900">
                            {formatDistance(wb.distanceKm, unit)} {getDistanceUnitLabel(unit)} (
                            {wb.count} sesi)
                          </span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            style={{ width: `${barPercent}%` }}
                            className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-full transition-all duration-300"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Averages */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between text-xs">
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Rata-rata per Sesi</span>
                  <span className="text-sm font-bold text-slate-900 font-mono-numbers">
                    {monthlyTotals.count > 0
                      ? `${formatDistance(monthlyTotals.distanceKm / monthlyTotals.count, unit)} ${getDistanceUnitLabel(
                          unit
                        )}`
                      : '0 km'}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Kec. Rata-rata Bulan Ini</span>
                  <span className="text-sm font-bold text-cyan-700 font-mono-numbers">
                    {formatSpeed(monthlyTotals.avgSpeedKmH, unit)} {getSpeedUnitLabel(unit)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Share My Ride Modal */}
      <ShareRideModal
        isOpen={!!shareTargetActivity}
        onClose={() => setShareTargetActivity(null)}
        activity={shareTargetActivity}
        unit={unit}
      />

      {/* Strava Connect & Master GPX Modal */}
      <StravaConnectModal
        isOpen={showStravaModal}
        onClose={() => setShowStravaModal(false)}
        activities={activities}
      />
    </div>
  );
};
