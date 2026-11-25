import { describe, expect, it } from 'vitest';
import { shiftHours, staffTime, weekOf, type ShiftForTime } from './staff-time.js';

const shift = (over: Partial<ShiftForTime>): ShiftForTime => ({
  staffId: 's1',
  venueId: 'v1',
  date: '2026-11-23',
  startTime: '10:00',
  endTime: '22:00',
  status: 'CONFIRMED',
  ...over,
});

describe('staff time', () => {
  it('counts hours of a shift, also past midnight', () => {
    expect(shiftHours('10:00', '22:00')).toBe(12);
    expect(shiftHours('22:00', '02:30')).toBe(4.5);
    expect(shiftHours('9:15', '17:45')).toBe(8.5);
    expect(shiftHours('bad', '17:00')).toBe(0);
  });

  it('weeks run Monday to Sunday', () => {
    expect(weekOf('2026-11-25')).toEqual({ from: '2026-11-23', to: '2026-11-29' });
    expect(weekOf('2026-11-29')).toEqual({ from: '2026-11-23', to: '2026-11-29' });
    expect(weekOf('2026-11-23')).toEqual({ from: '2026-11-23', to: '2026-11-29' });
  });

  it('matches the site schedule: a declined shift does not count ("1 см · 12 ч")', () => {
    const { byStaff, venueHoursThisWeek } = staffTime(
      [shift({}), shift({ date: '2026-11-24', startTime: '14:00', endTime: '23:00', status: 'DECLINED' })],
      '2026-11-25',
    );
    expect(byStaff.get('s1')).toEqual({ shiftsThisWeek: 1, hoursThisWeek: 12, hoursThisMonth: 12 });
    expect(venueHoursThisWeek.get('v1')).toBe(12);
  });

  it('pending and swap-requested shifts count; other weeks count only in the month', () => {
    const { byStaff } = staffTime(
      [
        shift({ status: 'PENDING', startTime: '08:00', endTime: '12:00' }),
        shift({ status: 'SWAP_REQUESTED', date: '2026-11-29', startTime: '18:00', endTime: '23:00' }),
        shift({ date: '2026-11-10', startTime: '10:00', endTime: '16:00' }),
        shift({ date: '2026-10-31', startTime: '10:00', endTime: '16:00' }),
      ],
      '2026-11-25',
    );
    expect(byStaff.get('s1')).toEqual({ shiftsThisWeek: 2, hoursThisWeek: 9, hoursThisMonth: 15 });
  });

  it('a staff member with only declined shifts still appears with zeros', () => {
    expect(staffTime([shift({ status: 'DECLINED' })], '2026-11-25').byStaff.get('s1')).toEqual({ shiftsThisWeek: 0, hoursThisWeek: 0, hoursThisMonth: 0 });
  });
});
