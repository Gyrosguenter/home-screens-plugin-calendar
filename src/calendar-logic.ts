/** Ein Termin, wie ihn der Hub unter `/api/calendar` liefert. */
export interface CalEvent {
  id: string;
  title: string;
  /** Ganztägig: "YYYY-MM-DD" (Ende exklusiv, wie iCal), sonst ISO-Zeitpunkt. */
  start: string;
  end: string;
  allDay: boolean;
  calendarColor?: string;
  sourceName?: string;
  kind?: string;
}

export interface Placed {
  key: string;
  title: string;
  color: string;
  /** 0 = Montag … 6 = Sonntag. */
  startCol: number;
  endCol: number;
  lane: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
  /** Eintägiger Termin mit Uhrzeit (kleiner Chip statt durchgehendem Balken). */
  isChip: boolean;
  time: string | null;
}

export interface DayCell {
  date: Date;
  dayNumber: number;
  /** Kurzer Monatsname, nur am Monatsersten. */
  monthLabel: string | null;
  isToday: boolean;
  isWeekend: boolean;
  isPast: boolean;
  /** Wie viele Termine dieses Tages keinen Platz mehr hatten ("+2"). */
  hidden: number;
}

export interface Week {
  weekNumber: number;
  days: DayCell[];
  items: Placed[];
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
export const MONTHS_LONG = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

const DEFAULT_COLOR = '#3b82f6';

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Ganze Tage von a nach b, DST-sicher (rechnet über UTC-Mitternachten). */
export function dayDiff(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / 86400000);
}

export function mondayOf(d: Date): Date {
  const day = d.getDay() || 7;
  return addDays(startOfDay(d), 1 - day);
}

/** ISO-8601-Kalenderwoche. */
export function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
}

interface Span {
  event: CalEvent;
  startDate: Date;
  /** Letzter Tag, inklusive. */
  endDate: Date;
  isSpan: boolean;
  time: string | null;
}

function parseDateOnly(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toSpan(event: CalEvent): Span | null {
  if (!event.start) return null;
  if (event.allDay) {
    const startDate = parseDateOnly(event.start);
    let endDate = event.end ? addDays(parseDateOnly(event.end), -1) : startDate;
    if (endDate < startDate) endDate = startDate;
    return { event, startDate, endDate, isSpan: true, time: null };
  }
  const start = new Date(event.start);
  if (Number.isNaN(start.getTime())) return null;
  const end = event.end ? new Date(event.end) : start;
  const startDate = startOfDay(start);
  let endDate = startOfDay(end);
  // Endet ein Termin exakt um 00:00, gehört dieser Tag nicht mehr dazu.
  if (end > start && end.getHours() === 0 && end.getMinutes() === 0) endDate = addDays(endDate, -1);
  if (endDate < startDate) endDate = startDate;
  const time = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
  return { event, startDate, endDate, isSpan: endDate > startDate, time };
}

/** Baut `weeksCount` Wochenzeilen ab der Woche von `today` (Montag zuerst).
 *  Mehrtägige und ganztägige Termine werden zu durchgehenden Balken, die
 *  über mehrere Tage laufen; eintägige Termine mit Uhrzeit zu Chips. Alles
 *  teilt sich `maxLanes` Zeilen je Woche, der Rest wird als "+N" gezählt. */
export function buildWeeks(events: CalEvent[], today: Date, weeksCount: number, maxLanes: number): Week[] {
  const spans = events.map(toSpan).filter((s): s is Span => s !== null);
  const todayStart = startOfDay(today);
  const firstMonday = mondayOf(todayStart);
  const weeks: Week[] = [];

  for (let w = 0; w < weeksCount; w++) {
    const weekStart = addDays(firstMonday, w * 7);

    const days: DayCell[] = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(weekStart, i);
      return {
        date,
        dayNumber: date.getDate(),
        monthLabel: date.getDate() === 1 ? MONTHS_SHORT[date.getMonth()] : null,
        isToday: dayDiff(todayStart, date) === 0,
        isWeekend: i >= 5,
        isPast: date < todayStart,
        hidden: 0,
      };
    });

    const candidates: Placed[] = [];
    for (const span of spans) {
      const s = dayDiff(weekStart, span.startDate);
      const e = dayDiff(weekStart, span.endDate);
      if (e < 0 || s > 6) continue;
      candidates.push({
        key: `${span.event.id}@${w}`,
        title: span.event.title,
        color: span.event.calendarColor || DEFAULT_COLOR,
        startCol: Math.max(0, s),
        endCol: Math.min(6, e),
        lane: 0,
        continuesBefore: s < 0,
        continuesAfter: e > 6,
        isChip: !span.isSpan,
        time: span.time,
      });
    }

    // Durchgehende Balken zuerst (längste oben), danach Chips nach Uhrzeit.
    candidates.sort((a, b) => {
      if (a.isChip !== b.isChip) return a.isChip ? 1 : -1;
      const lenA = a.endCol - a.startCol;
      const lenB = b.endCol - b.startCol;
      if (!a.isChip && lenA !== lenB) return lenB - lenA;
      if (a.startCol !== b.startCol) return a.startCol - b.startCol;
      if (a.time !== b.time) return (a.time ?? '').localeCompare(b.time ?? '');
      return a.title.localeCompare(b.title);
    });

    const occupied = new Set<string>();
    const items: Placed[] = [];
    for (const item of candidates) {
      const fits = (l: number) => {
        for (let c = item.startCol; c <= item.endCol; c++) if (occupied.has(`${l}:${c}`)) return false;
        return true;
      };
      let lane = 0;
      while (lane < maxLanes && !fits(lane)) lane++;
      if (lane >= maxLanes) {
        for (let c = item.startCol; c <= item.endCol; c++) days[c].hidden++;
        continue;
      }
      for (let c = item.startCol; c <= item.endCol; c++) occupied.add(`${lane}:${c}`);
      items.push({ ...item, lane });
    }

    weeks.push({ weekNumber: isoWeek(addDays(weekStart, 3)), days, items });
  }

  return weeks;
}
