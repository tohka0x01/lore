import { describe, expect, it } from 'vitest';
import { getCronScheduleSlot, shouldRunCronSchedule } from '../schedule';

describe('jobs schedule helpers', () => {
  it('uses the configured timezone date and minute for a cron slot', () => {
    const slot = getCronScheduleSlot(new Date('2026-04-25T19:00:07.335Z'), 'Asia/Shanghai');

    expect(slot).toEqual({ slotKey: 'cron:2026-04-26T03:00', date: '2026-04-26', hour: 3, minute: 0 });
  });

  it('matches daily cron expressions in the configured timezone', () => {
    expect(shouldRunCronSchedule(new Date('2026-04-25T19:00:00.000Z'), 'Asia/Shanghai', '0 3 * * *')).toEqual({
      due: true,
      slotKey: 'cron:2026-04-26T03:00',
      date: '2026-04-26',
      hour: 3,
      minute: 0,
    });

    expect(shouldRunCronSchedule(new Date('2026-04-25T18:00:00.000Z'), 'Asia/Shanghai', '0 3 * * *')).toEqual({
      due: false,
      slotKey: 'cron:2026-04-26T02:00',
      date: '2026-04-26',
      hour: 2,
      minute: 0,
    });
  });

  it('matches hourly cron expressions once per hour', () => {
    expect(shouldRunCronSchedule(new Date('2026-04-25T09:00:00.000Z'), 'UTC', '0 * * * *')).toMatchObject({
      due: true,
      slotKey: 'cron:2026-04-25T09:00',
    });
    expect(shouldRunCronSchedule(new Date('2026-04-25T09:01:00.000Z'), 'UTC', '0 * * * *')).toMatchObject({ due: false });
  });

  it('supports comma, range, and step fields', () => {
    expect(shouldRunCronSchedule(new Date('2026-04-25T09:30:00.000Z'), 'UTC', '*/15 9-17 * * 6')).toMatchObject({ due: true });
    expect(shouldRunCronSchedule(new Date('2026-04-25T09:45:00.000Z'), 'UTC', '15,30 9-17 * * 6')).toMatchObject({ due: false });
  });

  it('does not run invalid cron expressions', () => {
    expect(shouldRunCronSchedule(new Date('2026-04-25T09:00:00.000Z'), 'UTC', 'bad')).toMatchObject({ due: false });
    expect(shouldRunCronSchedule(new Date('2026-04-25T09:00:00.000Z'), 'UTC', '61 * * * *')).toMatchObject({ due: false });
  });
});
