import { RunClient } from 'apify-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getClientContext } from '../../__unit__/context.js';
import { createActorRunMock } from '../../__unit__/mocks.js';
import { ExtRunClient } from '../../clients/run-client.js';
import { RUN_STALENESS_THRESHOLD_MS } from '../../constants.js';
import type { ClientContext } from '../client-context.js';

describe('run updates', () => {
    afterEach(() => {
        vi.resetAllMocks();
        vi.useRealTimers();
    });

    describe('extendRunClient', () => {
        it('returns an extended RunClient', async () => {
            const context = getClientContext();

            const extRunClient = context.extendRunClient('test-run', 'test-run-id');
            expect(extRunClient).toBeInstanceOf(ExtRunClient);
            expect(extRunClient.requestId).toBe('test-run');

            const updateRunSpy = vi.spyOn(context.runTracker, 'updateRun');
            const getRunSpy = vi
                .spyOn(RunClient.prototype, 'get')
                .mockResolvedValue(createActorRunMock({ id: 'test-run-id', startedAt: new Date() }));

            const run = await extRunClient.get();
            expect(run).toBeDefined();
            expect(getRunSpy).toHaveBeenCalled();
            expect(updateRunSpy).toHaveBeenCalledWith('test-run', run);
        });
    });

    describe('buildExtendedRun', () => {
        it('flags the Runs it aborted when building extended Runs', () => {
            const context = getClientContext();
            const run = createActorRunMock({ id: 'test-run-id', status: 'ABORTED', startedAt: new Date() });

            expect(context.buildExtendedRun('test-run', run).abortedOnGracefulAbort).toBeUndefined();

            context.markRunsAbortedOnGracefulAbort(['test-run-id']);

            expect(context.buildExtendedRun('test-run', run)).toEqual(
                expect.objectContaining({ requestId: 'test-run', abortedOnGracefulAbort: true }),
            );
        });
    });

    describe('refreshStaleRuns', () => {
        const now = new Date('2024-06-01T12:00:00.000Z');

        /**
         * Tracks a Run nobody is waiting for, whose status was updated long ago.
         */
        function trackStaleRun(context: ClientContext, requestId: string, runId: string) {
            context.trackRunUpdate(requestId, createActorRunMock({ id: runId, status: 'RUNNING' }));
            vi.setSystemTime(new Date(Date.now() + RUN_STALENESS_THRESHOLD_MS));
        }

        beforeEach(() => {
            vi.useFakeTimers();
            vi.setSystemTime(now);
        });

        it('checks the Runs which were not updated recently', async () => {
            const context = getClientContext();
            trackStaleRun(context, 'stale-run', 'stale-run-id');

            const getRunSpy = vi
                .spyOn(RunClient.prototype, 'get')
                .mockResolvedValue(createActorRunMock({ id: 'stale-run-id', status: 'SUCCEEDED' }));

            await context.refreshStaleRuns();

            expect(getRunSpy).toHaveBeenCalledTimes(1);
            expect(context.runTracker.findRunByRequestId('stale-run')?.status).toBe('SUCCEEDED');
        });

        it('does not check the Runs which were updated recently', async () => {
            const context = getClientContext();
            context.trackRunUpdate('fresh-run', createActorRunMock({ id: 'fresh-run-id', status: 'RUNNING' }));

            const getRunSpy = vi.spyOn(RunClient.prototype, 'get');

            await context.refreshStaleRuns();

            expect(getRunSpy).not.toHaveBeenCalled();
        });

        it('does not check the Runs which already finished', async () => {
            const context = getClientContext();
            trackStaleRun(context, 'stale-run', 'stale-run-id');
            context.trackRunUpdate('stale-run', createActorRunMock({ id: 'stale-run-id', status: 'SUCCEEDED' }));
            vi.setSystemTime(new Date(Date.now() + RUN_STALENESS_THRESHOLD_MS));

            const getRunSpy = vi.spyOn(RunClient.prototype, 'get');

            await context.refreshStaleRuns();

            expect(getRunSpy).not.toHaveBeenCalled();
        });

        it('marks a Run as updated when the check fails, and does not check it again right away', async () => {
            const context = getClientContext();
            trackStaleRun(context, 'stale-run', 'stale-run-id');

            const getRunSpy = vi
                .spyOn(RunClient.prototype, 'get')
                .mockRejectedValue(new Error('The Apify API is not reachable'));

            await expect(context.refreshStaleRuns()).resolves.not.toThrow();

            // The Run is still tracked as in progress, but it is not stale anymore.
            expect(getRunSpy).toHaveBeenCalledTimes(1);
            expect(context.runTracker.findRunByRequestId('stale-run')?.status).toBe('RUNNING');

            await context.refreshStaleRuns();

            expect(getRunSpy).toHaveBeenCalledTimes(1);
        });

        it('declares a Run lost when the platform does not know it anymore', async () => {
            const context = getClientContext();
            trackStaleRun(context, 'stale-run', 'stale-run-id');

            vi.spyOn(RunClient.prototype, 'get').mockResolvedValue(undefined);

            await context.refreshStaleRuns();

            expect(context.runTracker.findRunByRequestId('stale-run')).toBeUndefined();
        });

        it('checks nothing when no Run is tracked', async () => {
            const context = getClientContext();

            const getRunSpy = vi.spyOn(RunClient.prototype, 'get');

            await context.refreshStaleRuns();

            expect(getRunSpy).not.toHaveBeenCalled();
        });
    });
});
