import { describe, expect, it } from 'vitest';

import { GracefulAbortTracker } from './graceful-abort-tracker.js';

describe('GracefulAbortTracker', () => {
    it('does not consider any Run as aborted by default', () => {
        const tracker = new GracefulAbortTracker();
        expect(tracker.wasRunAborted('test-run')).toBe(false);
    });

    it('marks the given Runs as aborted', () => {
        const tracker = new GracefulAbortTracker();

        tracker.markRunsAborted(['test-run-1', 'test-run-2']);

        expect(tracker.wasRunAborted('test-run-1')).toBe(true);
        expect(tracker.wasRunAborted('test-run-2')).toBe(true);
        expect(tracker.wasRunAborted('test-run-3')).toBe(false);
    });

    it('keeps the Runs marked in previous calls', () => {
        const tracker = new GracefulAbortTracker();

        tracker.markRunsAborted(['test-run-1']);
        tracker.markRunsAborted(['test-run-2']);

        expect(tracker.wasRunAborted('test-run-1')).toBe(true);
        expect(tracker.wasRunAborted('test-run-2')).toBe(true);
    });
});
