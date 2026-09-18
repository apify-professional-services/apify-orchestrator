import { describe, expect, it } from 'vitest';

import { UnnamedRequestTracker } from './unnamed-request-tracker.js';

describe('UnnamedRequestTracker', () => {
    it('does not consider a request resolved by default', () => {
        const tracker = new UnnamedRequestTracker();

        expect(tracker.wasResolved('test-request-id')).toBe(false);
    });

    it('marks requests as resolved', () => {
        const tracker = new UnnamedRequestTracker();

        tracker.markResolved('test-request-1-id');

        expect(tracker.wasResolved('test-request-1-id')).toBe(true);
        expect(tracker.wasResolved('test-request-2-id')).toBe(false);
    });

    it('forgets a resolved request, so that it can be resolved again', () => {
        const tracker = new UnnamedRequestTracker();

        tracker.markResolved('test-request-id');
        tracker.forget('test-request-id');

        expect(tracker.wasResolved('test-request-id')).toBe(false);
    });
});
