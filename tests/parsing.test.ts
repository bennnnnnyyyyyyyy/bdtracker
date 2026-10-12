import { describe, expect, it } from 'vitest';
import { parseDateToISO, durationToSeconds, getIsoWeekKey, normalizeCallType, normalizeCallOutcome } from '../src/lib/analytics';
import { isExcludedAgent } from '../src/lib/config';
import { parseUltatelDuration } from '../src/lib/ultatel';

describe('parseDateToISO', () => {
  it.each([
    ['2026-08-15', '2026-08-15'],
    ['2026-08-15T10:00:00Z', '2026-08-15'],
    ['07-18-2026 05:59:49', '2026-07-18'], // Ultatel export format
    ['8/15/26', '2026-08-15'],
    ['15/8/2026', '2026-08-15'], // first part cannot be a month
    ['March 5, 2026', '2026-03-05'],
    ['5 Mar 2026', '2026-03-05'],
  ])('parses %s', (input, expected) => expect(parseDateToISO(input)).toBe(expected));

  it.each(['Suite 2', 'Plaza 5', 'Mar 5', '13/45/2026', '2026-02-31', '12/5/202', '', 'n/a'])(
    'rejects %s',
    (input) => expect(parseDateToISO(input)).toBeNull()
  );

  it('converts Excel serials', () => expect(parseDateToISO(46250)).toBe('2026-08-16'));
});

describe('durations', () => {
  it('parses clock and Ultatel formats', () => {
    expect(durationToSeconds('00:35')).toBe(35);
    expect(durationToSeconds('1:02:03')).toBe(3723);
    expect(parseUltatelDuration('1 H , 2.53 M')).toBe(3600 + Math.round(2.53 * 60));
  });
});

describe('ISO weeks', () => {
  it('uses ISO-8601 week numbers and Monday-Sunday ranges', () => {
    expect(getIsoWeekKey('2026-01-01').key).toBe('2026-W01');
    expect(getIsoWeekKey('2026-12-31').key).toBe('2026-W53');
    expect(getIsoWeekKey('2027-01-01').key).toBe('2026-W53'); // Friday belongs to the previous ISO year
    const w = getIsoWeekKey('2026-08-15'); // Saturday
    expect(w.startISO).toBe('2026-08-10');
    expect(w.endISO).toBe('2026-08-16');
    expect(w.key).toBe('2026-W33');
  });
});

describe('call normalization', () => {
  it('normalizes type and outcome casing', () => {
    expect(normalizeCallType('out-bound')).toBe('OUT-Bound');
    expect(normalizeCallType('IN-Bound')).toBe('IN-Bound');
    expect(normalizeCallType('INTERNAL')).toBe('INTERNAL');
    expect(normalizeCallOutcome('answered')).toBe('ANSWERED');
    expect(normalizeCallOutcome('No Answer')).toBe('NO ANSWER');
    expect(normalizeCallOutcome('BUSY')).toBe('BUSY');
  });
});

describe('isExcludedAgent', () => {
  it('matches whole words only', () => {
    expect(isExcludedAgent('George Smith')).toBe(true);
    expect(isExcludedAgent('112 (MMS-George)')).toBe(true);
    expect(isExcludedAgent('Caroline Richards')).toBe(true);
    expect(isExcludedAgent('Georgette')).toBe(false);
    expect(isExcludedAgent('Russell')).toBe(false);
    expect(isExcludedAgent('Ben')).toBe(false);
  });
});
