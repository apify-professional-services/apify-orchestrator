import { describe, expect, it } from 'vitest';

import { createActorRunMock } from '../../__unit__/mocks.js';
import { GracefulAbortTracker } from './graceful-abort-tracker.js';

describe('GracefulAbortTracker', () => {
    it('does not consider a Run aborted by default', () => {
        const tracker = new GracefulAbortTracker();

        expect(tracker.wasRunAborted('test-run-id')).toBe(false);
    });

    it('marks Runs as aborted', () => {
        const tracker = new GracefulAbortTracker();

        tracker.markRunsAborted(['test-run-1-id', 'test-run-2-id']);

        expect(tracker.wasRunAborted('test-run-1-id')).toBe(true);
        expect(tracker.wasRunAborted('test-run-2-id')).toBe(true);
        expect(tracker.wasRunAborted('test-run-3-id')).toBe(false);
    });

    it('accumulates the Runs marked in separate calls', () => {
        const tracker = new GracefulAbortTracker();

        tracker.markRunsAborted(['test-run-1-id']);
        tracker.markRunsAborted(['test-run-2-id']);

        expect(tracker.wasRunAborted('test-run-1-id')).toBe(true);
        expect(tracker.wasRunAborted('test-run-2-id')).toBe(true);
    });

    describe('wasAbortedOnGracefulAbort', () => {
        it('recognizes a marked Run that is aborted or being aborted', () => {
            const tracker = new GracefulAbortTracker();
            tracker.markRunsAborted(['test-run-id']);

            for (const status of ['ABORTED', 'ABORTING'] as const) {
                const run = createActorRunMock({ id: 'test-run-id', status, startedAt: new Date() });
                expect(tracker.wasAbortedOnGracefulAbort(run)).toBe(true);
            }
        });

        it('ignores a marked Run that is not aborted', () => {
            const tracker = new GracefulAbortTracker();
            tracker.markRunsAborted(['test-run-id']);

            const run = createActorRunMock({ id: 'test-run-id', status: 'RUNNING', startedAt: new Date() });

            expect(tracker.wasAbortedOnGracefulAbort(run)).toBe(false);
        });

        it('ignores an aborted Run that was not marked', () => {
            const tracker = new GracefulAbortTracker();

            const run = createActorRunMock({ id: 'test-run-id', status: 'ABORTED', startedAt: new Date() });

            expect(tracker.wasAbortedOnGracefulAbort(run)).toBe(false);
        });
    });
});
