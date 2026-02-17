import {describe, it, expect, vi} from 'vitest';

// Mock fs module before importing spreadsheet
vi.mock('fs', () => ({
  readFileSync: vi.fn().mockReturnValue(
    JSON.stringify({
      testOrg: {sheetId: 'test-sheet-id'},
    }),
  ),
}));

// Mock googleapis
vi.mock('googleapis', () => ({
  google: {
    auth: {
      GoogleAuth: class MockGoogleAuth {
        constructor() {}
      },
    },
    sheets: () => ({}),
  },
}));

// Import after mocks are set up
import {
  deriveState,
  startWorkRow,
  suspendWorkRow,
  resumeWorkRow,
  endWorkRow,
} from './spreadsheet';

// Infer SheetRow type from startWorkRow return type
type SheetRow = ReturnType<typeof startWorkRow>;

describe('spreadsheet', () => {
  describe('deriveState', () => {
    it('should return working when endTime is not set and no break records', () => {
      const row = {
        threadId: 'thread-123',
        startTime: new Date(),
        endTime: undefined,
        breakTimeRecords: [],
        breakTime: 0,
        workingTime: 0,
      };

      expect(deriveState(row)).toBe('working');
    });

    it('should return working when last break record is closed', () => {
      const row = {
        threadId: 'thread-123',
        startTime: new Date(),
        endTime: undefined,
        breakTimeRecords: [{startTime: new Date(), endTime: new Date()}],
        breakTime: 0,
        workingTime: 0,
      };

      expect(deriveState(row)).toBe('working');
    });

    it('should return break when last break record is open', () => {
      const row = {
        threadId: 'thread-123',
        startTime: new Date(),
        endTime: undefined,
        breakTimeRecords: [{startTime: new Date(), endTime: undefined}],
        breakTime: 0,
        workingTime: 0,
      };

      expect(deriveState(row)).toBe('break');
    });

    it('should return completed when endTime is set', () => {
      const row = {
        threadId: 'thread-123',
        startTime: new Date(),
        endTime: new Date(),
        breakTimeRecords: [],
        breakTime: 0,
        workingTime: 0,
      };

      expect(deriveState(row)).toBe('completed');
    });

    it('should return completed even if break record is open when endTime is set', () => {
      const row = {
        threadId: 'thread-123',
        startTime: new Date(),
        endTime: new Date(),
        breakTimeRecords: [{startTime: new Date(), endTime: undefined}],
        breakTime: 0,
        workingTime: 0,
      };

      expect(deriveState(row)).toBe('completed');
    });

    it('should treat Invalid Date as not having endTime', () => {
      const row = {
        threadId: 'thread-123',
        startTime: new Date(),
        endTime: new Date(undefined as unknown as string), // Invalid Date
        breakTimeRecords: [],
        breakTime: 0,
        workingTime: 0,
      };

      // Invalid Date should not be treated as 'completed'
      expect(deriveState(row)).toBe('working');
    });

    it('should treat Invalid Date in break record as not closed', () => {
      const row = {
        threadId: 'thread-123',
        startTime: new Date(),
        endTime: undefined,
        breakTimeRecords: [
          {
            startTime: new Date(),
            endTime: new Date(undefined as unknown as string), // Invalid Date
          },
        ],
        breakTime: 0,
        workingTime: 0,
      };

      // Invalid Date endTime on break record should be treated as still on break
      expect(deriveState(row)).toBe('break');
    });
  });

  describe('startWorkRow', () => {
    it('should create a new row with threadId and startTime', () => {
      const row = startWorkRow('thread-123');

      expect(row.threadId).toBe('thread-123');
      expect(row.startTime).toBeInstanceOf(Date);
      expect(row.endTime).toBeUndefined();
      expect(row.breakTimeRecords).toEqual([]);
      expect(row.breakTime).toBe(0);
      expect(row.workingTime).toBe(0);
      expect(row.state).toBe('working');
    });
  });

  describe('suspendWorkRow', () => {
    it('should add a break time record with startTime', () => {
      const row = startWorkRow('thread-123');

      const suspended = suspendWorkRow(row);

      expect(suspended.threadId).toBe('thread-123');
      expect(suspended.startTime).toBeInstanceOf(Date);
      expect(suspended.endTime).toBeUndefined();
      expect(suspended.breakTimeRecords).toHaveLength(1);
      expect(suspended.breakTimeRecords[0].startTime).toBeInstanceOf(Date);
      expect(suspended.breakTimeRecords[0].endTime).toBeUndefined();
      expect(row.breakTime).toBe(0);
      expect(row.workingTime).toBe(0);
      expect(suspended.state).toBe('break');
    });

    it('should accumulate breakTime from previous closed break records', () => {
      vi.useFakeTimers();

      const row = startWorkRow('thread-123');
      const suspended1 = suspendWorkRow(row);
      vi.advanceTimersByTime(1000 * 60);
      const resumed = resumeWorkRow(suspended1);
      const suspended2 = suspendWorkRow(resumed);

      expect(suspended2.threadId).toBe('thread-123');
      expect(suspended2.startTime).toBeInstanceOf(Date);
      expect(suspended2.endTime).toBeUndefined();
      expect(suspended2.breakTimeRecords).toHaveLength(2);
      expect(suspended2.breakTimeRecords[0].startTime).toBeInstanceOf(Date);
      expect(suspended2.breakTimeRecords[0].endTime).toBeInstanceOf(Date);
      expect(suspended2.breakTimeRecords[1].startTime).toBeInstanceOf(Date);
      expect(suspended2.breakTimeRecords[1].endTime).toBeUndefined();
      expect(suspended2.breakTime).toBeGreaterThan(0);
      expect(suspended2.workingTime).toBe(0);
      expect(suspended2.state).toBe('break');

      vi.useRealTimers();
    });

    it('should not modify original row', () => {
      const row = startWorkRow('thread-123');
      const originalLength = row.breakTimeRecords.length;

      const suspended = suspendWorkRow(row);

      // Verify the row object is cloned
      expect(suspended).not.toBe(row);
      // Verify the original breakTimeRecords array is not modified
      expect(row.breakTimeRecords).toHaveLength(originalLength);
      // Verify the breakTimeRecords array is a new reference
      expect(suspended.breakTimeRecords).not.toBe(row.breakTimeRecords);
    });
  });

  describe('resumeWorkRow', () => {
    it('should close the last break time record', () => {
      vi.useFakeTimers();

      const row = startWorkRow('thread-123');
      const suspended = suspendWorkRow(row);
      vi.advanceTimersByTime(1000 * 60);

      const resumed = resumeWorkRow(suspended);

      expect(resumed.threadId).toBe('thread-123');
      expect(resumed.startTime).toBeInstanceOf(Date);
      expect(resumed.endTime).toBeUndefined();
      expect(resumed.breakTimeRecords).toHaveLength(1);
      expect(resumed.breakTimeRecords[0].startTime).toBeInstanceOf(Date);
      expect(resumed.breakTimeRecords[0].endTime).toBeInstanceOf(Date);
      expect(resumed.breakTime).toBeGreaterThan(0);
      expect(resumed.workingTime).toBe(0);
      expect(resumed.state).toBe('working');

      vi.useRealTimers();
    });

    it('should return original row if no break records', () => {
      const row = startWorkRow('thread-123');

      const result = resumeWorkRow(row);

      expect(result).toBe(row);
    });

    it('should not modify original row', () => {
      const row = startWorkRow('thread-123');
      const suspended = suspendWorkRow(row);
      const originalEndTime = suspended.breakTimeRecords[0].endTime;

      const resumed = resumeWorkRow(suspended);

      // Verify the row object is cloned
      expect(resumed).not.toBe(suspended);
      // Verify the original break record is not modified
      expect(suspended.breakTimeRecords[0].endTime).toBe(originalEndTime);
      // Verify the breakTimeRecords array is a new reference
      expect(resumed.breakTimeRecords).not.toBe(suspended.breakTimeRecords);
    });
  });

  describe('endWorkRow', () => {
    it('should set endTime on the row', () => {
      vi.useFakeTimers();

      const row = startWorkRow('thread-123');
      vi.advanceTimersByTime(1000 * 60);

      const ended = endWorkRow(row);

      expect(ended.threadId).toBe('thread-123');
      expect(ended.startTime).toBeInstanceOf(Date);
      expect(ended.endTime).toBeInstanceOf(Date);
      expect(ended.breakTimeRecords).toEqual([]);
      expect(ended.breakTime).toBe(0);
      expect(ended.workingTime).toBeGreaterThan(0);
      expect(ended.state).toBe('completed');

      vi.useRealTimers();
    });

    it('should work correctly after suspend and resume', () => {
      vi.useFakeTimers();

      const row = startWorkRow('thread-123');
      vi.advanceTimersByTime(1000 * 60);
      const suspended = suspendWorkRow(row);
      vi.advanceTimersByTime(1000 * 60);
      const resumed = resumeWorkRow(suspended);
      vi.advanceTimersByTime(1000 * 60);

      const ended = endWorkRow(resumed);

      expect(ended.threadId).toBe('thread-123');
      expect(ended.startTime).toBeInstanceOf(Date);
      expect(ended.endTime).toBeInstanceOf(Date);
      expect(ended.breakTimeRecords).toHaveLength(1);
      expect(ended.breakTimeRecords[0].startTime).toBeInstanceOf(Date);
      expect(ended.breakTimeRecords[0].endTime).toBeInstanceOf(Date);
      expect(ended.breakTime).toBeGreaterThan(0);
      expect(ended.workingTime).toBeGreaterThan(0);
      expect(ended.state).toBe('completed');

      vi.useRealTimers();
    });

    it('should close multiple open break records when ending directly after suspend', () => {
      vi.useFakeTimers();

      const row = startWorkRow('thread-123');
      vi.advanceTimersByTime(1000 * 60);
      const suspended1 = suspendWorkRow(row);
      vi.advanceTimersByTime(1000 * 60);
      const resumed = resumeWorkRow(suspended1);
      vi.advanceTimersByTime(1000 * 60);
      // Second break: suspend -> end without resume (should be closed with endTime)
      const suspended2 = suspendWorkRow(resumed);
      vi.advanceTimersByTime(1000 * 60);

      const ended = endWorkRow(suspended2);

      expect(ended.threadId).toBe('thread-123');
      expect(ended.startTime).toBeInstanceOf(Date);
      expect(ended.endTime).toBeInstanceOf(Date);
      // Should have 2 break records (both closed - one via resume, one via end)
      expect(ended.breakTimeRecords).toHaveLength(2);
      expect(ended.breakTimeRecords[0].startTime).toBeInstanceOf(Date);
      expect(ended.breakTimeRecords[0].endTime).toBeInstanceOf(Date);
      expect(ended.breakTimeRecords[1].startTime).toBeInstanceOf(Date);
      expect(ended.breakTimeRecords[1].endTime).toBeInstanceOf(Date);
      expect(ended.breakTimeRecords[1].endTime).toEqual(ended.endTime);
      expect(ended.breakTime).toBeGreaterThan(0);
      expect(ended.workingTime).toBeGreaterThanOrEqual(0);
      expect(ended.state).toBe('completed');

      // Explicit NaN check - breakTime should be a valid number
      expect(Number.isNaN(ended.breakTime)).toBe(false);
      expect(Number.isNaN(ended.workingTime)).toBe(false);
      expect(typeof ended.breakTime).toBe('number');
      expect(typeof ended.workingTime).toBe('number');

      vi.useRealTimers();
    });

    it('should not modify original row', () => {
      const row = startWorkRow('thread-123');
      const originalLength = row.breakTimeRecords.length;

      const ended = endWorkRow(row);

      // Verify the row object is cloned
      expect(ended).not.toBe(row);
      // Verify the original breakTimeRecords array is not modified
      expect(row.breakTimeRecords).toHaveLength(originalLength);
      // Verify the breakTimeRecords array is a new reference
      expect(ended.breakTimeRecords).not.toBe(row.breakTimeRecords);
    });

    it('should handle Invalid Date objects in breakTimeRecords (from JSON parsing)', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-02-17T03:00:00.000Z'));

      // Simulate data that was read from Google Sheets and parsed from JSON
      // When JSON has {"endTime": null} or missing endTime key, new Date(undefined) creates Invalid Date
      const rowWithInvalidDate: SheetRow = {
        threadId: 'thread-123',
        startTime: new Date('2026-02-17T01:00:00.000Z'),
        endTime: undefined,
        breakTimeRecords: [
          // First break: properly closed
          {
            startTime: new Date('2026-02-17T01:20:48.292Z'),
            endTime: new Date('2026-02-17T02:34:32.886Z'),
          },
          // Second break: Invalid Date (simulates new Date(undefined) from JSON parsing)
          {
            startTime: new Date('2026-02-17T02:55:42.695Z'),
            endTime: new Date(undefined as unknown as string), // Creates Invalid Date
          },
        ],
        breakTime: 0,
        workingTime: 0,
        state: 'break',
      };

      // Verify the Invalid Date is indeed invalid
      expect(
        Number.isNaN(rowWithInvalidDate.breakTimeRecords[1].endTime?.getTime()),
      ).toBe(true);

      const ended = endWorkRow(rowWithInvalidDate);

      // Should only have 1 break record (the closed one), Invalid Date record should be filtered
      expect(ended.breakTimeRecords).toHaveLength(1);
      expect(ended.breakTimeRecords[0].startTime).toEqual(
        new Date('2026-02-17T01:20:48.292Z'),
      );
      expect(ended.breakTimeRecords[0].endTime).toEqual(
        new Date('2026-02-17T02:34:32.886Z'),
      );

      // breakTime should be a valid number, not NaN
      expect(Number.isNaN(ended.breakTime)).toBe(false);
      expect(ended.breakTime).toBeGreaterThan(0);

      // workingTime should be a valid number, not NaN
      expect(Number.isNaN(ended.workingTime)).toBe(false);

      vi.useRealTimers();
    });
  });
});
