import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { callEpoch, cairoDateTime, dedupeAndRedateCalls, exactCairoTime } from '../src/lib/callKeys';
import type { CallRecord } from '../src/types/dashboard';

const call = (callDate: string, callId: string, to: string, duration = '0:16', outcome = 'ANSWERED'): CallRecord => ({
  callDate, callId, from: '18443910603', to, extension: '114 (MMS-Selene Myles)', department: 'BD', did: '', description: '',
  type: 'OUT-Bound', outcome, duration, durationSec: 16, notes: '', callPath: '', agent: 'Selene Myles', opener: '',
});

describe('call ids and times', () => {
  it('reads the epoch from Ultatel IDs', () => {
    expect(callEpoch('1791808392.14495')).toBe(1791808392);
    expect(callEpoch(1791808392)).toBe(1791808392);
    expect(callEpoch('abc')).toBeNull();
    expect(callEpoch('')).toBeNull();
  });

  it('converts to Cairo time with DST', () => {
    expect(cairoDateTime(1791808392)).toBe('2026-10-12 15:33:12'); // 12:33:12 UTC, Cairo is UTC+3 in October
    expect(cairoDateTime(1784375989)).toBe('2026-07-18 14:59:49');
  });

  it('puts a written time on the Cairo clock whichever clock it was on', () => {
    expect(exactCairoTime('10-12-2026 15:33:12', '1791808392.14495')).toBe('2026-10-12 15:33:12'); // already Cairo
    expect(exactCairoTime('10-12-2026 06:33:12', '1791808392.14495')).toBe('2026-10-12 15:33:12'); // export clock (UTC-6)
    expect(exactCairoTime('10-12-2026 6:33:00', '1791808392')).toBe('2026-10-12 15:33:12');         // export clock, seconds lost: exact time from the ID
    expect(exactCairoTime('garbage', '1791808392.14495')).toBe('2026-10-12 15:33:12');             // falls back to the ID
    expect(exactCairoTime('2026-10-12 09:00:00', '')).toBe('2026-10-12 09:00:00');                  // no ID: untouched
  });
});

describe('duplicates versus legitimate repeated Call IDs', () => {
  // These expectations are written on Cairo time.
  beforeEach(() => { process.env.CALL_DAY_TIMEZONE = 'Africa/Cairo'; });
  afterEach(() => { delete process.env.CALL_DAY_TIMEZONE; });

  it('removes extra copies (raw clock / shortened ID) but keeps real calls', () => {
    const rows = [
      call('10-12-2026 6:33:00', '1791808392', '4154400444'),                  // raw copy
      call('10-12-2026 15:33:12', '1791808392.14495', '4154400444'),           // converted copy
      call('10-12-2026 6:34:00', '1791808463.170981', '3475361784'),
      call('10-12-2026 15:34:23', '1791808463.170981', '3475361784'),
      call('10-12-2026 10:59:00', '1791824380', '4694966556'),                  // new, still on the export clock
    ];
    const { calls, duplicatesRemoved } = dedupeAndRedateCalls(rows);
    expect(duplicatesRemoved).toBe(2);
    expect(calls.map((c) => c.callDate)).toEqual(['2026-10-12 15:33:12', '2026-10-12 15:34:23', '2026-10-12 19:59:40']);
  });

  it('keeps every leg of a call that shares one Call ID (different time / duration / outcome)', () => {
    const rows = [
      call('10-12-2026 06:43:25', '1791817505.18977', '3193771533', '00:26', 'NO ANSWER'),
      call('10-12-2026 06:43:32', '1791817505.18977', '3193771533', '00:04', 'NO ANSWER'),
    ];
    expect(dedupeAndRedateCalls(rows).calls).toHaveLength(2);
  });

  it('keeps identical-looking rows from one export (same text) and removes only the second copy of them', () => {
    const four = (text: string, id: string) => Array.from({ length: 4 }, () => call(text, id, '112', '00:30', 'NO ANSWER'));
    expect(dedupeAndRedateCalls(four('10-12-2026 10:34:25', '1791822865.22502')).calls).toHaveLength(4);
    const bothCopies = [...four('10-12-2026 01:34:25', '1791822865.22502'), ...four('10-12-2026 10:34:25', '1791822865.22502')];
    expect(dedupeAndRedateCalls(bothCopies).calls).toHaveLength(4);
  });

  it('matches text IDs with trailing zeros to numeric IDs', () => {
    const rows = [call('10-12-2026 15:33:12', '1791808392.14500', '1'), call('10-12-2026 06:33:12', '1791808392.145', '1')];
    expect(dedupeAndRedateCalls(rows).calls).toHaveLength(1);
  });
});

describe('copies that differ by a "+" in the phone number', () => {
  beforeEach(() => { process.env.CALL_DAY_TIMEZONE = 'Africa/Cairo'; });
  afterEach(() => { delete process.env.CALL_DAY_TIMEZONE; });

  it('treats +16156173189 and 16156173189 as the same number', () => {
    const rows = [
      call('10-12-2026 16:02:17', '1791810137', '16156173189', '1:22'),
      call('10-12-2026 16:02:17', '1791810137', '+16156173189', '1:22'),
      call('10-12-2026 16:03:49', '1791810229', '13997265119', '0:00', 'NO ANSWER'),
    ];
    expect(dedupeAndRedateCalls(rows).calls).toHaveLength(2);
  });

  it('still keeps genuinely repeated, identically written rows', () => {
    const same = () => call('10-12-2026 10:34:25', '1791822865.22502', '+15109644107', '0:30', 'NO ANSWER');
    expect(dedupeAndRedateCalls([same(), same(), same(), same()]).calls).toHaveLength(4);
  });

  it('does not merge different numbers', () => {
    const rows = [call('10-12-2026 16:02:17', '1791810137', '16156173189', '1:22'), call('10-12-2026 16:02:17', '1791810137', '16156173180', '1:22')];
    expect(dedupeAndRedateCalls(rows).calls).toHaveLength(2);
  });
});

describe('which day a call belongs to', () => {
  afterEach(() => { delete process.env.CALL_DAY_TIMEZONE; });
  // 1791840000 = 2026-10-12 21:20:00 UTC: Cairo 2026-10-13 00:20, Ultatel clock (UTC-6) 2026-10-12 15:20
  const late = () => call('10-13-2026 00:20:00', '1791840000.1', '555', '0:10');

  it('defaults to local (Cairo) time, as written in the sheet', () => {
    expect(dedupeAndRedateCalls([late()]).calls[0].callDate).toBe('2026-10-13 00:20:00');
  });

  it('can count days on Ultatel\'s old UTC-6 clock instead', () => {
    process.env.CALL_DAY_TIMEZONE = 'Etc/GMT+6';
    expect(dedupeAndRedateCalls([late()]).calls[0].callDate).toBe('2026-10-12 15:20:00');
  });

  it('puts a row from the 10-12 export on its own export day (old UTC-6 clock)', () => {
    process.env.CALL_DAY_TIMEZONE = 'Etc/GMT+6';
    const row = call('10-12-2026 06:33:12', '1791808392.14495', '4154400444');
    expect(dedupeAndRedateCalls([row]).calls[0].callDate).toBe('2026-10-12 06:33:12');
  });
});
