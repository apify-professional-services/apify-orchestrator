import { describe, expect, it } from 'vitest';

import { getClientContext } from '../__unit__/context.js';
import { ExtApifyClient } from '../clients/apify-client.js';
import { RunScheduler } from '../run-scheduler.js';
import { RunTracker } from '../run-tracker.js';

describe('generateClientContext', () => {
    it('owns the client it generated', () => {
        const context = getClientContext();

        expect(context.client).toBeInstanceOf(ExtApifyClient);
        expect(context.clientName).toBe('test-client');
        // The client sees the very same context it belongs to.
        // eslint-disable-next-line dot-notation
        expect(context.client['context']).toBe(context);
    });

    it('builds all the context members', () => {
        const context = getClientContext();

        expect(context.runTracker).toBeInstanceOf(RunTracker);
        expect(context.runScheduler).toBeInstanceOf(RunScheduler);
    });

    it('keeps the graceful abort bookkeeping', () => {
        const context = getClientContext();

        expect(context.wasRunAbortedOnGracefulAbort('test-run-id')).toBe(false);

        context.markRunsAbortedOnGracefulAbort(['test-run-id']);

        expect(context.wasRunAbortedOnGracefulAbort('test-run-id')).toBe(true);
    });
});
