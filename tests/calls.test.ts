import { describe, expect, it } from 'vitest';
import { callEpoch, cairoDateTime, dedupeAndRedateCalls } from '../src/lib/callKeys';
import type { CallRecord } from '../src/types/dashboard';

const call = (callDate: string, callId: string, to: string): CallRecord => ({
  callDate, callId, from: '18443910603', to, extension: '114 (MMS-Selene Myles)', department: 'BD', did: '', description: '',
  type: 'OUT-Bound', outcome: 'ANSWERED', duration: '0:16', durationSec: 16, notes: '', callPath: '', agent: 'Selene Myles', opener: '',
});

describe('call identity and dating from the Call ID', () => {
  it('reads the epoch from Ultatel IDs', () => {
    expect(callEpoch('1791808392.170981')).toBe(1791808392);
    expect(callEpoch(1791808392)).toBe(1791808392);
    expect(callEpoch('abc')).toBeNull();
    expect(callEpoch('')).toBeNull();
  });

  it('converts to Cairo time with DST', () => {
    expect(cairoDateTime(1791808392)).toBe('2026-10-12 15:33:12'); // 12:33:12 UTC, Cairo is UTC+3 in October
    expect(cairoDateTime(1784375989)).toBe('2026-07-18 14:59:49'); // matches the 05:59:49 UTC-6 export row +9h
  });

  it('removes copies with a raw clock or a shortened ID, and fixes the time of the rest', () => {
    const rows = [
      call('10-12-2026 6:33:00', '1791808392', '4154400444'),                // raw copy (seconds lost, not converted)
      call('10-12-2026 15:33:12', '1791808392', '4154400444'),               // converted copy
      call('10-12-2026 6:34:00', '1791808463.170981', '3475361784'),         // full ID
      call('10-12-2026 15:34:23', '1791808463', '3475361784'),               // shortened ID
      call('10-12-2026 10:59:00', '1791824380', '4694966556'),               // genuinely new, still on the export clock
      call('2026-10-12 09:00:00', '', '1'),                                   // no ID: kept as written
    ];
    const { calls, duplicatesRemoved, redated } = dedupeAndRedateCalls(rows);
    expect(duplicatesRemoved).toBe(2);
    expect(calls).toHaveLength(4);
    expect(calls.map((c) => c.callDate)).toEqual(['2026-10-12 15:33:12', '2026-10-12 15:34:23', '2026-10-12 19:59:40', '2026-10-12 09:00:00']);
    expect(redated).toBe(3);
  });

  it('keeps two different calls that share only a timestamp', () => {
    const { calls } = dedupeAndRedateCalls([call('x', '1791808392.1', '111'), call('x', '1791808392.2', '222')]);
    expect(calls).toHaveLength(2);
  });
});
