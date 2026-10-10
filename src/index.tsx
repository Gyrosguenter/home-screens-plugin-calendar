import React from 'react';
import type { PluginComponentProps } from './hs-plugin';
import { hostFrameStyle, scalePx } from './host-style';
import {
  MONTHS_LONG,
  addDays,
  buildWeeks,
  mondayOf,
  startOfDay,
  type CalEvent,
  type Placed,
} from './calendar-logic';

const WEEKDAY_LETTERS = ['M', 'D', 'M', 'D', 'F', 'S', 'S'];
const DEFAULT_REFRESH_MS = 5 * 60 * 1000;

function useNow(intervalMs: number): Date {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Termine über den Hub (`/api/calendar`, derselbe interne Endpunkt wie beim
 *  eingebauten Kalender-Modul: alle in den Einstellungen verbundenen
 *  Kalender plus Feiertage, fertig geparst). Bei einem Fehler bleiben die
 *  zuletzt geladenen Termine stehen. */
function useEvents(rangeStart: Date, weeksCount: number, refreshMs: number): CalEvent[] | null {
  const [events, setEvents] = React.useState<CalEvent[] | null>(null);
  const startKey = rangeStart.getTime();

  React.useEffect(() => {
    let cancelled = false;
    const timeMin = new Date(startKey);
    const timeMax = addDays(timeMin, weeksCount * 7);

    async function load() {
      try {
        const res = await fetch(
          `/api/calendar?timeMin=${encodeURIComponent(timeMin.toISOString())}&timeMax=${encodeURIComponent(timeMax.toISOString())}`,
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data?.events)) setEvents(data.events as CalEvent[]);
      } catch {
        // Hub kurz nicht erreichbar: alte Anzeige behalten.
      }
    }

    load();
    const id = setInterval(load, refreshMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [startKey, weeksCount, refreshMs]);

  return events;
}

function Bar({ item, dim }: { item: Placed; dim: boolean }) {
  const radius = scalePx(5);
  return (
    <div
      title={item.time ? `${item.time} ${item.title}` : item.title}
      style={{
        gridColumn: `${item.startCol + 1} / ${item.endCol + 2}`,
        gridRow: item.lane + 2,
        minWidth: 0,
        margin: '0 1px',
        padding: '0 0.4em',
        display: 'flex',
        alignItems: 'center',
        fontSize: '0.72em',
        fontWeight: item.isChip ? 500 : 600,
        lineHeight: 1,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        background: `color-mix(in srgb, ${item.color} ${item.isChip ? 22 : 32}%, transparent)`,
        color: `color-mix(in srgb, ${item.color} 62%, #ffffff)`,
        borderRadius: `${item.continuesBefore ? 0 : radius} ${item.continuesAfter ? 0 : radius} ${
          item.continuesAfter ? 0 : radius
        } ${item.continuesBefore ? 0 : radius}`,
        opacity: dim ? 0.55 : 1,
      }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</span>
    </div>
  );
}

export default function CalendarMonthPlugin({ config, style }: PluginComponentProps) {
  const weeksCount = Math.min(6, Math.max(2, Math.round(Number(config.weeksToShow) || 5)));
  const maxLanes = Math.min(8, Math.max(1, Math.round(Number(config.maxLanes) || 4)));
  const showWeekNumbers = config.showWeekNumbers !== false;
  const refreshMs = Math.max(60000, Number(config.refreshIntervalMs) || DEFAULT_REFRESH_MS);

  const now = useNow(60000);
  const rangeStart = mondayOf(startOfDay(now));
  const events = useEvents(rangeStart, weeksCount, refreshMs);

  const weeks = React.useMemo(
    () => buildWeeks(events ?? [], now, weeksCount, maxLanes),
    // `now` ändert sich minütlich; der Tageswechsel genügt für die Struktur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, now.getFullYear(), now.getMonth(), now.getDate(), weeksCount, maxLanes],
  );

  const weekCol = showWeekNumbers ? scalePx(30) : '0px';
  const columns = `${weekCol} repeat(7, minmax(0, 1fr))`;
  const divider = '1px solid rgba(255, 255, 255, 0.1)';

  return (
    <div
      style={{
        ...hostFrameStyle(style),
        display: 'flex',
        flexDirection: 'column',
        gap: '0.4em',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5em' }}>
        <span style={{ fontSize: '2em', fontWeight: 700, lineHeight: 1.1 }}>{MONTHS_LONG[now.getMonth()]}</span>
        <span style={{ fontSize: '0.9em', opacity: 0.55 }}>{now.getFullYear()}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: columns, fontSize: '0.8em', opacity: 0.55 }}>
        <span />
        {WEEKDAY_LETTERS.map((letter, i) => (
          <span key={i} style={{ textAlign: 'center' }}>
            {letter}
          </span>
        ))}
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {weeks.map((week) => (
          <div
            key={week.days[0].date.getTime()}
            style={{
              flex: '1 1 0',
              minHeight: 0,
              display: 'grid',
              gridTemplateColumns: columns,
              borderTop: divider,
              paddingTop: '0.25em',
              overflow: 'hidden',
            }}
          >
            {showWeekNumbers ? (
              <div style={{ fontSize: '0.7em', opacity: 0.5, paddingTop: '0.35em' }}>{week.weekNumber}</div>
            ) : (
              <span />
            )}
            <div
              style={{
                gridColumn: '2 / -1',
                display: 'grid',
                gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                gridTemplateRows: `auto repeat(${maxLanes}, minmax(0, 1.5em)) auto`,
                rowGap: '0.15em',
                minHeight: 0,
              }}
            >
              {week.days.map((day, i) => (
                <div
                  key={`n${i}`}
                  style={{
                    gridColumn: i + 1,
                    gridRow: 1,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: '0.25em',
                    opacity: day.isToday ? 1 : day.isPast ? 0.4 : day.isWeekend ? 0.6 : 0.95,
                  }}
                >
                  {day.monthLabel && !day.isToday && (
                    <span style={{ fontSize: '0.6em', opacity: 0.8 }}>{day.monthLabel}</span>
                  )}
                  <span
                    style={{
                      minWidth: '1.6em',
                      height: '1.6em',
                      borderRadius: '50%',
                      display: 'inline-flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      fontSize: '0.95em',
                      fontWeight: day.isToday ? 700 : 500,
                      background: day.isToday ? '#ef4444' : 'transparent',
                      color: '#ffffff',
                    }}
                  >
                    {day.dayNumber}
                  </span>
                </div>
              ))}

              {week.items.map((item) => (
                <Bar key={item.key} item={item} dim={week.days[item.endCol].isPast} />
              ))}

              {week.days.map(
                (day, i) =>
                  day.hidden > 0 && (
                    <div
                      key={`h${i}`}
                      style={{
                        gridColumn: i + 1,
                        gridRow: maxLanes + 2,
                        textAlign: 'center',
                        fontSize: '0.7em',
                        opacity: 0.6,
                      }}
                    >
                      +{day.hidden}
                    </div>
                  ),
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
