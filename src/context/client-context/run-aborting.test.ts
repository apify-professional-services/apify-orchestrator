import { Actor } from 'apify';
import { RunClient } from 'apify-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getClientContext } from '../../__unit__/context.js';
import { createActorRunMock } from '../../__unit__/mocks.js';
import type { ClientContext } from '../client-context.js';

describe('run aborting on graceful abort', () => {
    let context: ClientContext;

    beforeEach(() => {
        vi.useFakeTimers();
        context = getClientContext({ abortAllRunsOnGracefulAbort: true });
    });

    afterEach(() => {
        vi.resetAllMocks();
        vi.useRealTimers();
    });

    it('aborts the Runs in progress when the Actor is gracefully aborted', async () => {
        const eventManager = Actor.config.getEventManager();
        context.runTracker.updateRun(
            'test-run-1',
            createActorRunMock({ id: 'run-1-id', status: 'RUNNING', startedAt: new Date() }),
        );
        const abortSpy = vi
            .spyOn(RunClient.prototype, 'abort')
            .mockResolvedValue(createActorRunMock({ status: 'ABORTED', startedAt: new Date() }));

        eventManager.emit('aborting');
        await eventManager.waitForAllListenersToComplete();

        expect(abortSpy).toHaveBeenCalledTimes(1);
        expect(context.wasRunAbortedOnGracefulAbort('run-1-id')).toBe(true);
    });

    it('marks the Runs in progress as aborted by the Orchestrator', async () => {
        context.runTracker.updateRun(
            'test-run-1',
            createActorRunMock({ id: 'run-1-id', status: 'RUNNING', startedAt: new Date() }),
        );
        context.runTracker.updateRun(
            'test-run-2',
            createActorRunMock({ id: 'run-2-id', status: 'READY', startedAt: new Date() }),
        );
        vi.spyOn(RunClient.prototype, 'abort').mockResolvedValue(
            createActorRunMock({ status: 'ABORTED', startedAt: new Date() }),
        );

        await context.abortAllRunsOnGracefulAbort();

        expect(context.wasRunAbortedOnGracefulAbort('run-1-id')).toBe(true);
        expect(context.wasRunAbortedOnGracefulAbort('run-2-id')).toBe(true);
    });

    it('only aborts Runs that are in progress and not shutting down', async () => {
        context.runTracker.updateRun(
            'running-run',
            createActorRunMock({ id: 'running-run-id', status: 'RUNNING', startedAt: new Date() }),
        );
        context.runTracker.updateRun(
            'ready-run',
            createActorRunMock({ id: 'ready-run-id', status: 'READY', startedAt: new Date() }),
        );
        context.runTracker.updateRun(
            'succeeded-run',
            createActorRunMock({ id: 'succeeded-run-id', status: 'SUCCEEDED', startedAt: new Date() }),
        );
        context.runTracker.updateRun(
            'aborting-run',
            createActorRunMock({ id: 'aborting-run-id', status: 'ABORTING', startedAt: new Date() }),
        );
        const extendRunClientSpy = vi.spyOn(context, 'extendRunClient');
        const abortSpy = vi
            .spyOn(RunClient.prototype, 'abort')
            .mockResolvedValue(createActorRunMock({ status: 'ABORTED', startedAt: new Date() }));

        await context.abortAllRunsOnGracefulAbort();

        expect(extendRunClientSpy).toHaveBeenCalledTimes(2);
        expect(extendRunClientSpy).toHaveBeenCalledWith('running-run', 'running-run-id');
        expect(extendRunClientSpy).toHaveBeenCalledWith('ready-run', 'ready-run-id');
        expect(abortSpy).toHaveBeenCalledTimes(2);
    });

    it('does not mark the Runs that already finished', async () => {
        context.runTracker.updateRun(
            'succeeded-run',
            createActorRunMock({ id: 'run-1-id', status: 'SUCCEEDED', startedAt: new Date() }),
        );
        context.runTracker.updateRun(
            'aborted-run',
            createActorRunMock({ id: 'run-2-id', status: 'ABORTED', startedAt: new Date() }),
        );
        vi.spyOn(RunClient.prototype, 'abort').mockRejectedValue(new Error('The Run has already finished'));

        await context.abortAllRunsOnGracefulAbort();

        expect(context.wasRunAbortedOnGracefulAbort('run-1-id')).toBe(false);
        expect(context.wasRunAbortedOnGracefulAbort('run-2-id')).toBe(false);
    });
});
