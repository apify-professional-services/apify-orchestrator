import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getClientContext } from '../../__unit__/context.js';
import { createActorRunMock } from '../../__unit__/mocks.js';
import { RunSource } from '../../entities/run-source.js';
import { buildRunStartRequest } from '../../entities/run-start-request.js';
import { AmbiguousRunRequestError } from '../../errors.js';

describe('run search', () => {
    const startRun = vi.fn();
    const defaultMemoryMbytes = vi.fn();
    const runSource = new RunSource({
        type: 'actor',
        id: 'test-actor',
        start: startRun,
        defaultMemoryMbytes,
    });

    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.resetAllMocks();
        vi.useRealTimers();
    });

    describe('searchRunByRequestId', () => {
        it('returns a promise if the Run is scheduled to start', () => {
            const context = getClientContext();

            context.runScheduler.requestRunStart(buildRunStartRequest({ runName: 'scheduled-run', source: runSource }));

            const outcome = context.searchRunByRequestId('scheduled-run');
            expect(outcome.variant).toBe('promise');
            expect(outcome.value).toBeInstanceOf(Function);
        });

        it('returns run info if the Run is tracked', () => {
            const context = getClientContext();

            const existingRun = createActorRunMock({ id: 'tracked-run-id', startedAt: new Date() });
            context.runTracker.updateRun('tracked-run', existingRun);

            const outcome = context.searchRunByRequestId('tracked-run');
            expect(outcome.variant).toBe('runInfo');
            expect(outcome.value).toEqual(expect.objectContaining({ runId: 'tracked-run-id' }));
        });

        it('returns notFound if the Run does not exist', () => {
            const context = getClientContext();

            const outcome = context.searchRunByRequestId('nonexistent-run');
            expect(outcome.variant).toBe('notFound');
            expect(outcome.value).toBe(true);
        });
    });

    describe('searchOkRunMatchingRequest', () => {
        it('returns a promise if the Run is scheduled to start', () => {
            const context = getClientContext();
            const runRequest = buildRunStartRequest({ runName: 'scheduled-run', source: runSource });
            context.runScheduler.requestRunStart(runRequest);

            const outcome = context.searchOkRunMatchingRequest(runRequest);
            expect(outcome.variant).toBe('promise');
            expect(outcome.value).toBeInstanceOf(Function);
        });

        it('returns run info if the Run is tracked in an OK status', () => {
            const context = getClientContext();
            const runRequest = buildRunStartRequest({ runName: 'tracked-run', source: runSource });

            const existingRun = createActorRunMock({ id: 'tracked-run-id', status: 'RUNNING', startedAt: new Date() });
            context.runTracker.updateRun(runRequest.requestId, existingRun);

            const outcome = context.searchOkRunMatchingRequest(runRequest);
            expect(outcome.variant).toBe('runInfo');
            expect(outcome.value).toEqual(expect.objectContaining({ runId: 'tracked-run-id' }));
        });

        it('returns notFound if a tracked Run has failed, so a retry is always allowed', () => {
            const context = getClientContext();
            const runRequest = buildRunStartRequest({ runName: 'tracked-run', source: runSource });

            const failedRun = createActorRunMock({ id: 'tracked-run-id', status: 'FAILED', startedAt: new Date() });
            context.runTracker.updateRun(runRequest.requestId, failedRun);

            const outcome = context.searchOkRunMatchingRequest(runRequest);
            expect(outcome.variant).toBe('notFound');
        });

        it('returns notFound if the Run does not exist', () => {
            const context = getClientContext();
            const runRequest = buildRunStartRequest({ runName: 'nonexistent-run', source: runSource });

            const outcome = context.searchOkRunMatchingRequest(runRequest);
            expect(outcome.variant).toBe('notFound');
            expect(outcome.value).toBe(true);
        });

        it('throws for a repeated unnamed request in the same session, but not for a repeated named one', () => {
            const context = getClientContext();
            const namedRequest = buildRunStartRequest({ runName: 'named-run', source: runSource });
            const unnamedRequest = buildRunStartRequest({ source: runSource, input: { key: 'value' } });

            const run = createActorRunMock({ id: 'run-id', status: 'RUNNING', startedAt: new Date() });
            context.runTracker.updateRun(namedRequest.requestId, run);
            context.runTracker.updateRun(unnamedRequest.requestId, run);

            expect(() => context.searchOkRunMatchingRequest(namedRequest)).not.toThrow();
            expect(() => context.searchOkRunMatchingRequest(unnamedRequest)).not.toThrow();
            expect(() => context.searchOkRunMatchingRequest(unnamedRequest)).toThrow(AmbiguousRunRequestError);
        });
    });
});
