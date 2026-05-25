"use client";

import { useState, useMemo } from "react";
import type { CalendarEvent, EventColor } from "@/lib/events-store";

// ─── Color Helpers ────────────────────────────────────────────────────────────

const COLOR_MAP: Record<EventColor, { pill: string; dot: string }> = {
  indigo: { pill: "bg-indigo-600 text-white", dot: "bg-indigo-500" },
  rose: { pill: "bg-rose-600 text-white", dot: "bg-rose-500" },
  emerald: { pill: "bg-emerald-600 text-white", dot: "bg-emerald-500" },
  amber: { pill: "bg-amber-500 text-black", dot: "bg-amber-400" },
  sky: { pill: "bg-sky-600 text-white", dot: "bg-sky-500" },
  violet: { pill: "bg-violet-600 text-white", dot: "bg-violet-500" },
};

export function colorClasses(color: EventColor) {
  return COLOR_MAP[color] ?? COLOR_MAP.indigo;
}

// ─── Date Utilities ───────────────────────────────────────────────────────────

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay(); // 0 = Sunday
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const MONTHS = [
  "January", "February", "March", "April",
  "May", "June", "July", "August",
  "September", "October", "November", "December",
];

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalendarProps {
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  /** If provided, shows a "+" on each day for admins */
  onDayClick?: (date: Date) => void;
  isAdmin?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Calendar({
  events,
  onEventClick,
  onDayClick,
  isAdmin = false,
}: CalendarProps) {
  const today = new Date();

  // Current week boundaries: Sunday 00:00:00 → Saturday 23:59:59
  const todayStart = new Date(today);
  todayStart.setHours(0, 0, 0, 0);

  const endOfCurrentWeek = new Date(today);
  endOfCurrentWeek.setDate(today.getDate() + (6 - today.getDay()));
  endOfCurrentWeek.setHours(23, 59, 59, 999);

  const [viewDate, setViewDate] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  // Build calendar grid: leading empty cells + days of month
  const cells = useMemo(() => {
    const grid: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) grid.push(null);
    for (let d = 1; d <= daysInMonth; d++) grid.push(d);
    return grid;
  }, [firstDay, daysInMonth]);

  // Map day → events starting that day
  const eventsByDay = useMemo(() => {
    const map: Record<number, CalendarEvent[]> = {};
    for (const event of events) {
      const d = new Date(event.startDate);
      if (d.getFullYear() === year && d.getMonth() === month) {
        const day = d.getDate();
        map[day] = map[day] ? [...map[day], event] : [event];
      }
    }
    return map;
  }, [events, year, month]);

  function prevMonth() {
    setViewDate(new Date(year, month - 1, 1));
  }

  function nextMonth() {
    setViewDate(new Date(year, month + 1, 1));
  }

  function goToToday() {
    setViewDate(new Date(today.getFullYear(), today.getMonth(), 1));
  }

  return (
    <div className="w-full select-none">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-white">
            {MONTHS[month]} {year}
          </h2>
          <button
            onClick={goToToday}
            className="text-xs px-2.5 py-1 rounded-md border border-[#2a2a2a] text-[#888] hover:text-white hover:border-[#444] transition-colors"
          >
            Today
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={prevMonth}
            aria-label="Previous month"
            className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-[#1c1c1c] text-[#888] hover:text-white transition-colors"
          >
            ←
          </button>
          <button
            onClick={nextMonth}
            aria-label="Next month"
            className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-[#1c1c1c] text-[#888] hover:text-white transition-colors"
          >
            →
          </button>
        </div>
      </div>

      {/* ── Day Labels ── */}
      <div className="grid grid-cols-7 mb-2">
        {DAYS.map((day) => (
          <div
            key={day}
            className="text-center text-xs font-medium text-[#888] pb-2"
          >
            {day}
          </div>
        ))}
      </div>

      {/* ── Calendar Grid ── */}
      <div className="grid grid-cols-7 gap-px bg-[#2a2a2a] rounded-lg overflow-hidden border border-[#2a2a2a]">
        {cells.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${idx}`} className="bg-[#0e0e0e] h-28" />;
          }

          const cellDate = new Date(year, month, day);
          const isToday = isSameDay(cellDate, today);
          const isPast = cellDate < todayStart;
          const isFutureLocked = !isAdmin && cellDate > endOfCurrentWeek;
          const dayEvents = eventsByDay[day] ?? [];
          const MAX_VISIBLE = 3;

          // ── Locked future cell (beyond current week) ──
          if (isFutureLocked) {
            return (
              <div
                key={day}
                className="bg-[#0c0c0c] h-28 p-2 flex flex-col"
              >
                <span className="text-sm font-medium w-7 h-7 flex items-center justify-center text-[#2a2a2a]">
                  {day}
                </span>
              </div>
            );
          }

          return (
            <div
              key={day}
              className={`
                h-28 p-2 flex flex-col group relative transition-colors
                ${isPast ? "bg-[#111]" : "bg-[#141414]"}
                ${isAdmin && !isPast ? "cursor-pointer hover:bg-[#1a1a1a]" : ""}
              `}
              onClick={() => isAdmin && !isPast && onDayClick?.(cellDate)}
            >
              {/* Day number */}
              <div className="flex items-start justify-between mb-1">
                <span
                  className={`
                    text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full
                    ${isToday
                      ? "bg-indigo-600 text-white"
                      : isPast
                        ? "text-[#444]"
                        : "text-[#ccc] group-hover:text-white"
                    }
                  `}
                >
                  {day}
                </span>

                {/* Admin "+" button appears on hover (not on past days) */}
                {isAdmin && !isPast && (
                  <span className="text-[#555] group-hover:text-[#888] text-lg leading-none opacity-0 group-hover:opacity-100 transition-opacity">
                    +
                  </span>
                )}
              </div>

              {/* Events */}
              <div className="flex flex-col gap-0.5 overflow-hidden">
                {dayEvents.slice(0, MAX_VISIBLE).map((event) => {
                  const c = colorClasses(event.color);
                  const isHidden = event.hidden && isAdmin;
                  return (
                    <button
                      key={event.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick(event);
                      }}
                      className={`
                        text-left text-xs px-1.5 py-0.5 rounded truncate font-medium
                        ${c.pill} hover:opacity-80 transition-opacity
                        ${isPast ? "opacity-30 grayscale" : ""}
                        ${isHidden ? "opacity-40 line-through" : ""}
                      `}
                      title={isHidden ? `${event.title} (hidden from users)` : event.title}
                    >
                      {isHidden ? "🚫 " : ""}{event.title}
                    </button>
                  );
                })}
                {dayEvents.length > MAX_VISIBLE && (
                  <span className={`text-xs px-1 ${isPast ? "text-[#444]" : "text-[#888]"}`}>
                    +{dayEvents.length - MAX_VISIBLE} more
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {/* Fill trailing cells to complete the last row */}
        {Array.from({
          length: (7 - ((cells.length % 7) || 7)) % 7,
        }).map((_, i) => (
          <div key={`trail-${i}`} className="bg-[#0e0e0e] h-28" />
        ))}
      </div>
    </div>
  );
}
