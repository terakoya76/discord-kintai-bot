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
      expect(ended.breakTimeRecords[0].endTime).toBeInstanceOf(Date);
      expect(ended.breakTime).toBeGreaterThan(0);
      expect(ended.workingTime).toBeGreaterThan(0);
      expect(ended.state).toBe('completed');

      vi.useRealTimers();
    });

    it('should delete open break time record when ending directly after suspend', () => {
      vi.useFakeTimers();

      const row = startWorkRow('thread-123');
      vi.advanceTimersByTime(1000 * 60);
      const suspended = suspendWorkRow(row);
      vi.advanceTimersByTime(1000 * 60);

      const ended = endWorkRow(suspended);

      expect(ended.threadId).toBe('thread-123');
      expect(ended.startTime).toBeInstanceOf(Date);
      expect(ended.endTime).toBeInstanceOf(Date);
      expect(ended.breakTimeRecords).toHaveLength(1);
      expect(ended.breakTime).toBeGreaterThan(0);
      expect(ended.workingTime).toBeGreaterThan(0);
      expect(ended.state).toBe('completed');

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
  });
});
