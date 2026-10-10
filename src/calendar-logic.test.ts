import { describe, expect, it } from 'vitest';
import { buildWeeks, dayDiff, isoWeek, mondayOf, type CalEvent } from './calendar-logic';

const TODAY = new Date(2026, 9, 10, 12, 0); // Samstag, 10.10.2026, KW 41

function allDay(id: string, title: string, start: string, end: string, color = '#3b82f6'): CalEvent {
  return { id, title, start, end, allDay: true, calendarColor: color };
}
function timed(id: string, title: string, start: Date, end: Date): CalEvent {
  return { id, title, start: start.toISOString(), end: end.toISOString(), allDay: false, calendarColor: '#10b981' };
}

describe('Datumshilfen', () => {
  it('Montag der Woche', () => {
    expect(mondayOf(TODAY)).toEqual(new Date(2026, 9, 5));
    expect(mondayOf(new Date(2026, 9, 5))).toEqual(new Date(2026, 9, 5));
    expect(mondayOf(new Date(2026, 9, 11))).toEqual(new Date(2026, 9, 5));
  });
  it('dayDiff ist über die Zeitumstellung stabil', () => {
    expect(dayDiff(new Date(2026, 9, 20), new Date(2026, 9, 28))).toBe(8);
    expect(dayDiff(new Date(2026, 2, 28), new Date(2026, 2, 30))).toBe(2);
  });
  it('Kalenderwoche', () => {
    expect(isoWeek(TODAY)).toBe(41);
  });
});

describe('buildWeeks', () => {
  it('beginnt mit der aktuellen Woche, Wochennummern und Markierungen', () => {
    const weeks = buildWeeks([], TODAY, 3, 4);
    expect(weeks.map((w) => w.weekNumber)).toEqual([41, 42, 43]);
    const first = weeks[0].days;
    expect(first[0].date).toEqual(new Date(2026, 9, 5));
    expect(first[5].isToday).toBe(true);
    expect(first[5].isWeekend).toBe(true);
    expect(first[4].isPast).toBe(true);
    expect(first[6].isPast).toBe(false);
  });

  it('mehrtägiger Termin wird zu einem Balken über mehrere Tage (Ende exklusiv)', () => {
    const weeks = buildWeeks([allDay('a', 'V2600048', '2026-10-06', '2026-10-09')], TODAY, 1, 4);
    expect(weeks[0].items).toHaveLength(1);
    expect(weeks[0].items[0]).toMatchObject({ startCol: 1, endCol: 3, lane: 0, isChip: false });
  });

  it('Balken über Wochengrenzen laufen in beiden Wochen weiter', () => {
    const weeks = buildWeeks([allDay('a', 'Urlaub', '2026-10-09', '2026-10-14')], TODAY, 2, 4);
    expect(weeks[0].items[0]).toMatchObject({ startCol: 4, endCol: 6, continuesBefore: false, continuesAfter: true });
    expect(weeks[1].items[0]).toMatchObject({ startCol: 0, endCol: 1, continuesBefore: true, continuesAfter: false });
  });

  it('beginnt ein Balken vor der Woche, wird er links angeschnitten', () => {
    const weeks = buildWeeks([allDay('w', 'Wiesn', '2026-09-19', '2026-10-07')], TODAY, 1, 4);
    expect(weeks[0].items[0]).toMatchObject({ startCol: 0, endCol: 1, continuesBefore: true });
  });

  it('eintägige Termine mit Uhrzeit werden Chips', () => {
    const ev = timed('t', 'Zahnarzt', new Date(2026, 9, 8, 15, 0), new Date(2026, 9, 8, 16, 0));
    const [item] = buildWeeks([ev], TODAY, 1, 4)[0].items;
    expect(item).toMatchObject({ startCol: 3, endCol: 3, isChip: true, time: '15:00' });
  });

  it('Termine über Mitternacht werden zu Balken, 00:00-Ende zählt nicht mehr dazu', () => {
    const ev = timed('n', 'Nachtschicht', new Date(2026, 9, 6, 22, 0), new Date(2026, 9, 7, 6, 0));
    expect(buildWeeks([ev], TODAY, 1, 4)[0].items[0]).toMatchObject({ startCol: 1, endCol: 2, isChip: false });
    const ev2 = timed('m', 'Bis Mitternacht', new Date(2026, 9, 6, 22, 0), new Date(2026, 9, 7, 0, 0));
    expect(buildWeeks([ev2], TODAY, 1, 4)[0].items[0]).toMatchObject({ startCol: 1, endCol: 1 });
  });

  it('Balken liegen oben, überlappende bekommen eigene Zeilen', () => {
    const events = [
      timed('c', 'Chip', new Date(2026, 9, 6, 9, 0), new Date(2026, 9, 6, 10, 0)),
      allDay('b1', 'Lang', '2026-10-05', '2026-10-09'),
      allDay('b2', 'Kurz', '2026-10-06', '2026-10-08'),
    ];
    const items = buildWeeks(events, TODAY, 1, 4)[0].items;
    const byTitle = Object.fromEntries(items.map((i) => [i.title, i.lane]));
    expect(byTitle).toEqual({ Lang: 0, Kurz: 1, Chip: 2 });
  });

  it('zählt Termine ohne Platz als "+N" je Tag', () => {
    const events = [
      allDay('a', 'A', '2026-10-06', '2026-10-07'),
      allDay('b', 'B', '2026-10-06', '2026-10-07'),
      allDay('c', 'C', '2026-10-06', '2026-10-07'),
    ];
    const week = buildWeeks(events, TODAY, 1, 2)[0];
    expect(week.items).toHaveLength(2);
    expect(week.days[1].hidden).toBe(1);
    expect(week.days[0].hidden).toBe(0);
  });

  it('Monatserster trägt den Monatsnamen', () => {
    const weeks = buildWeeks([], new Date(2026, 9, 28), 1, 4);
    expect(weeks[0].days.find((d) => d.dayNumber === 1)?.monthLabel).toBe('Nov');
  });
});
