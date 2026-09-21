import { RunClient } from 'apify-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isStillPending } from '../__unit__/async.js';
import { getClientContext } from '../__unit__/context.js';
import { createActorRunMock } from '../__unit__/mocks.js';
import type { ClientContext } from '../context/client-context.js';
import type { OrchestratorOptions } from '../types.js';
import type { ExtRunClient } from './run-client.js';

describe('ExtRunClient', () => {
    let context: ClientContext;
    let runClient: ExtRunClient;

    const mockRun = createActorRunMock({
        id: 'test-run-id',
        status: 'RUNNING',
        requestId: 'test-run',
        startedAt: new Date('2024-01-01T00:00:00.000Z'),
    });

    const abortedMockRun = createActorRunMock({
        id: 'test-run-id',
        status: 'ABORTED',
        requestId: 'test-run',
        startedAt: new Date('2024-01-01T00:00:00.000Z'),
    });

    function buildRunClient(overrideOptions?: Partial<OrchestratorOptions>): ExtRunClient {
        context = getClientContext(overrideOptions);
        vi.spyOn(context.runTracker, 'updateRun');
        return context.extendRunClient('test-run', 'test-run-id');
    }

    beforeEach(() => {
        runClient = buildRunClient();
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('get', () => {
        it('updates the tracker when called', async () => {
            const getSpy = vi.spyOn(RunClient.prototype, 'get').mockResolvedValue(mockRun);
            const run = await runClient.get();
            expect(run).toEqual(mockRun);
            expect(getSpy).toHaveBeenCalledTimes(1);
            expect(context.runTracker.updateRun).toHaveBeenCalledWith('test-run', mockRun);
        });

        it('flags a Run aborted by the Orchestrator on graceful abort', async () => {
            context.markRunsAbortedOnGracefulAbort(['test-run-id']);
            vi.spyOn(RunClient.prototype, 'get').mockResolvedValue(abortedMockRun);

            const run = await runClient.get();

            expect(run).toEqual({ ...abortedMockRun, abortedOnGracefulAbort: true });
        });

        it('does not flag a Run aborted by a user', async () => {
            vi.spyOn(RunClient.prototype, 'get').mockResolvedValue(abortedMockRun);

            const run = await runClient.get();

            expect(run).toEqual(abortedMockRun);
            expect(run?.abortedOnGracefulAbort).toBeUndefined();
        });

        it('does not flag a replacement Run started with the same request ID', async () => {
            context.markRunsAbortedOnGracefulAbort(['test-run-id']);
            vi.spyOn(RunClient.prototype, 'get').mockResolvedValue(
                createActorRunMock({ ...abortedMockRun, id: 'replacement-run-id' }),
            );

            const run = await runClient.get();

            expect(run?.abortedOnGracefulAbort).toBeUndefined();
        });

        it('updates the tracker when the run is not found', async () => {
            const getSpy = vi.spyOn(RunClient.prototype, 'get').mockResolvedValue(undefined);
            const run = await runClient.get();
            expect(run).toBeUndefined();
            expect(getSpy).toHaveBeenCalledTimes(1);
            expect(context.runTracker.updateRun).toHaveBeenCalledWith('test-run', undefined);
        });
    });

    describe('abort', () => {
        it('updates the tracker when called', async () => {
            const abortSpy = vi.spyOn(RunClient.prototype, 'abort').mockResolvedValue(mockRun);
            const run = await runClient.abort();
            expect(run).toEqual(mockRun);
            expect(abortSpy).toHaveBeenCalledTimes(1);
            expect(context.runTracker.updateRun).toHaveBeenCalledWith('test-run', mockRun);
        });
    });

    describe('delete', () => {
        it('updates the tracker when called', () => {
            // TODO: test after implementation
        });
    });

    describe('metamorph', () => {
        it('updates the tracker when called', () => {
            // TODO: test after implementation
        });
    });

    describe('reboot', () => {
        it('updates the tracker when called', async () => {
            const rebootSpy = vi.spyOn(RunClient.prototype, 'reboot').mockResolvedValue(mockRun);
            const run = await runClient.reboot();
            expect(run).toEqual(mockRun);
            expect(rebootSpy).toHaveBeenCalledTimes(1);
            expect(context.runTracker.updateRun).toHaveBeenCalledWith('test-run', mockRun);
        });
    });

    describe('update', () => {
        it('updates the tracker when called', async () => {
            const updateSpy = vi.spyOn(RunClient.prototype, 'update').mockResolvedValue(mockRun);
            const run = await runClient.update({ statusMessage: 'test' });
            expect(run).toEqual(mockRun);
            expect(updateSpy).toHaveBeenCalledTimes(1);
            expect(context.runTracker.updateRun).toHaveBeenCalledWith('test-run', mockRun);
        });
    });

    describe('resurrect', () => {
        it('updates the tracker when called', async () => {
            const resurrectSpy = vi.spyOn(RunClient.prototype, 'resurrect').mockResolvedValue(mockRun);
            const run = await runClient.resurrect();
            expect(run).toEqual(mockRun);
            expect(resurrectSpy).toHaveBeenCalledTimes(1);
            expect(context.runTracker.updateRun).toHaveBeenCalledWith('test-run', mockRun);
        });
    });

    describe('waitForFinish', () => {
        it('updates the tracker when called', async () => {
            const waitForFinishSpy = vi.spyOn(RunClient.prototype, 'waitForFinish').mockResolvedValue(mockRun);
            const run = await runClient.waitForFinish();
            expect(run).toEqual(mockRun);
            expect(waitForFinishSpy).toHaveBeenCalledTimes(1);
            expect(context.runTracker.updateRun).toHaveBeenCalledWith('test-run', mockRun);
        });

        it('returns a Run aborted by a user', async () => {
            vi.spyOn(RunClient.prototype, 'waitForFinish').mockResolvedValue(abortedMockRun);

            const run = await runClient.waitForFinish();

            expect(run).toEqual(abortedMockRun);
            expect(run.abortedOnGracefulAbort).toBeUndefined();
        });

        it('never returns when the Run was aborted by the Orchestrator on graceful abort', async () => {
            context.markRunsAbortedOnGracefulAbort(['test-run-id']);
            vi.spyOn(RunClient.prototype, 'waitForFinish').mockResolvedValue(abortedMockRun);

            await expect(isStillPending(runClient.waitForFinish())).resolves.toBe(true);

            // The Run is tracked as aborted, even if the method never returns.
            expect(context.runTracker.updateRun).toHaveBeenCalledWith('test-run', {
                ...abortedMockRun,
                abortedOnGracefulAbort: true,
            });
        });

        it('never returns when the Run is being aborted by the Orchestrator on graceful abort', async () => {
            context.markRunsAbortedOnGracefulAbort(['test-run-id']);
            vi.spyOn(RunClient.prototype, 'waitForFinish').mockResolvedValue(
                createActorRunMock({ ...abortedMockRun, status: 'ABORTING' }),
            );

            await expect(isStillPending(runClient.waitForFinish())).resolves.toBe(true);
        });

        it('returns a flagged Run aborted by the Orchestrator if `returnAbortedRunsOnGracefulAbort` is enabled', async () => {
            runClient = buildRunClient({ returnAbortedRunsOnGracefulAbort: true });
            context.markRunsAbortedOnGracefulAbort(['test-run-id']);
            vi.spyOn(RunClient.prototype, 'waitForFinish').mockResolvedValue(abortedMockRun);

            const run = await runClient.waitForFinish();

            expect(run).toEqual({ ...abortedMockRun, abortedOnGracefulAbort: true });
        });

        it('returns a Run that did not finish yet, even during a graceful abort', async () => {
            context.markRunsAbortedOnGracefulAbort(['test-run-id']);
            vi.spyOn(RunClient.prototype, 'waitForFinish').mockResolvedValue(mockRun);

            const run = await runClient.waitForFinish({ waitSecs: 1 });

            expect(run).toEqual(mockRun);
        });
    });
});
