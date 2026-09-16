import { RunClient } from 'apify-client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getClientContext } from '../../__unit__/context.js';
import { createActorRunMock } from '../../__unit__/mocks.js';
import { ExtRunClient } from '../../clients/run-client.js';

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
});
