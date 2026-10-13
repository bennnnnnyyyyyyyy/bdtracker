import { describe, expect, it } from 'vitest';
import { lastDueWorkday, missingUploadDay } from '../src/lib/uploadReminder';

const at = (iso: string) => new Date(iso);
describe('upload reminder', () => {
  it('asks for yesterday on a weekday morning', () => {
    expect(lastDueWorkday(at('2026-10-14T08:00:00Z'), 'Africa/Cairo')).toBe('2026-10-13'); // Wed -> Tue
  });
  it('asks for Friday on Saturday, Sunday and Monday', () => {
    ['2026-10-17', '2026-10-18', '2026-10-19'].forEach((d) => {
      expect(lastDueWorkday(at(`${d}T08:00:00Z`), 'Africa/Cairo')).toBe('2026-10-16');
    });
  });
  it('only reminds when the newest call is older than the due day', () => {
    const now = at('2026-10-14T08:00:00Z');
    expect(missingUploadDay('2026-10-12', now, 'Africa/Cairo')).toBe('2026-10-13');
    expect(missingUploadDay('2026-10-13', now, 'Africa/Cairo')).toBeNull();
    expect(missingUploadDay('2026-10-14', now, 'Africa/Cairo')).toBeNull();
    expect(missingUploadDay(undefined, now, 'Africa/Cairo')).toBeNull();
  });
});
