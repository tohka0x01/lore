function getTimeZonePart(parts: Intl.DateTimeFormatPart[], type: string): string {
  return parts.find((part) => part.type === type)?.value || '';
}

interface CronSlot {
  slotKey: string;
  date: string;
  hour: number;
  minute: number;
}

function parseCronField(field: string, min: number, max: number): Set<number> | null {
  const values = new Set<number>();
  for (const part of field.split(',')) {
    const token = part.trim();
    if (!token) return null;
    const [rangeToken, stepToken] = token.split('/');
    const step = stepToken === undefined ? 1 : Number(stepToken);
    if (!Number.isInteger(step) || step < 1) return null;

    let start = min;
    let end = max;
    if (rangeToken !== '*') {
      if (rangeToken.includes('-')) {
        const [rawStart, rawEnd] = rangeToken.split('-', 2).map(Number);
        start = rawStart;
        end = rawEnd;
      } else {
        start = Number(rangeToken);
        end = Number(rangeToken);
      }
    }

    if (!Number.isInteger(start) || !Number.isInteger(end) || start < min || end > max || start > end) return null;
    for (let value = start; value <= end; value += step) values.add(value);
  }
  return values;
}

export function getCronScheduleSlot(now: Date, timeZone: string): CronSlot {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const year = getTimeZonePart(parts, 'year');
  const month = getTimeZonePart(parts, 'month');
  const day = getTimeZonePart(parts, 'day');
  const hour = Number(getTimeZonePart(parts, 'hour'));
  const minute = Number(getTimeZonePart(parts, 'minute'));
  const date = `${year}-${month}-${day}`;
  return { slotKey: `cron:${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`, date, hour, minute };
}

export function shouldRunCronSchedule(
  now: Date,
  timeZone: string,
  cron: string,
): { due: boolean; slotKey: string; date: string; hour: number; minute: number } {
  const slot = getCronScheduleSlot(now, timeZone);
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) return { ...slot, due: false };

  const [minuteField, hourField, dayOfMonthField, monthField, dayOfWeekField] = fields;
  const minutes = parseCronField(minuteField, 0, 59);
  const hours = parseCronField(hourField, 0, 23);
  const dayOfMonths = parseCronField(dayOfMonthField, 1, 31);
  const months = parseCronField(monthField, 1, 12);
  const dayOfWeeks = parseCronField(dayOfWeekField, 0, 7);
  if (!minutes || !hours || !dayOfMonths || !months || !dayOfWeeks) return { ...slot, due: false };

  const localDate = new Date(`${slot.date}T00:00:00.000Z`);
  const dayOfWeek = localDate.getUTCDay();
  const cronDayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek;
  const due = minutes.has(slot.minute)
    && hours.has(slot.hour)
    && dayOfMonths.has(Number(slot.date.slice(8, 10)))
    && months.has(Number(slot.date.slice(5, 7)))
    && (dayOfWeeks.has(dayOfWeek) || dayOfWeeks.has(cronDayOfWeek));
  return { ...slot, due };
}
