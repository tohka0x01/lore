import { describe, expect, it } from 'vitest';
import { getCronScheduleSlot, shouldRunCronSchedule } from '../schedule';

describe('jobs schedule helpers', () => {
  it('returns a cron slot from a Date using the system timezone', () => {
    const slot = getCronScheduleSlot(new Date('2026-04-25T19:00:07.335Z'));

    expect(slot.slotKey).toMatch(/^cron:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(slot.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof slot.hour).toBe('number');
    expect(typeof slot.minute).toBe('number');
  });

  it('matches daily cron expressions using system timezone', () => {
    const due = shouldRunCronSchedule(new Date('2026-04-25T19:00:00.000Z'), '0 3 * * *');
    expect(typeof due.due).toBe('boolean');
    expect(due.slotKey).toMatch(/^cron:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(due.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof due.hour).toBe('number');
    expect(typeof due.minute).toBe('number');
  });

  it('matches hourly cron expressions once per hour', () => {
    const result = shouldRunCronSchedule(new Date('2026-04-25T01:00:00.000Z'), '0 * * * *');
    expect(typeof result.due).toBe('boolean');
    expect(result.slotKey).toMatch(/^cron:/);
    expect(result.minute).toBe(0);
  });

  it('supports comma, range, and step fields', () => {
    const result = shouldRunCronSchedule(new Date('2026-04-25T01:30:00.000Z'), '*/15 9-17 * * 6');
    expect(typeof result.due).toBe('boolean');
    expect(result.minute).toBe(30);
  });

  it('does not run invalid cron expressions', () => {
    expect(shouldRunCronSchedule(new Date('2026-04-25T01:00:00.000Z'), 'bad')).toMatchObject({ due: false });
    expect(shouldRunCronSchedule(new Date('2026-04-25T01:00:00.000Z'), '61 * * * *')).toMatchObject({ due: false });
  });
});
