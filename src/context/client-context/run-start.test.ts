import { RunClient } from 'apify-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getClientContext } from '../../__unit__/context.js';
import { createActorRunMock } from '../../__unit__/mocks.js';
import { RunSource } from '../../entities/run-source.js';
import { buildRunStartRequest } from '../../entities/run-start-request.js';
import { AmbiguousRunRequestError } from '../../errors.js';
import type { ClientContext } from '../client-context.js';

describe('run start', () => {
    const startRun = vi.fn();
    const defaultMemoryMbytes = vi.fn();
    const runSource = new RunSource({
        type: 'actor',
        id: 'test-actor',
        start: startRun,
        defaultMemoryMbytes,
    });

    let context: ClientContext;

    beforeEach(() => {
        vi.useFakeTimers();
        context = getClientContext();
    });

    afterEach(() => {
        vi.resetAllMocks();
        vi.useRealTimers();
    });

    describe('findOrRequestRunStart', () => {
        it('waits for a Run that is already scheduled to start', async () => {
            const run = createActorRunMock({
                id: 'test-id',
                requestId: 'test-run',
                status: 'RUNNING',
                startedAt: new Date(),
            });
            startRun.mockResolvedValue(run);

            context.runScheduler.requestRunStart(buildRunStartRequest({ runName: 'test-run', source: runSource }));

            const findOrRequestRunStart = context.findOrRequestRunStart(
                buildRunStartRequest({ runName: 'test-run', source: runSource }),
            );
            const resultRunPromise = findOrRequestRunStart();
            await vi.advanceTimersByTimeAsync(1000);
            const resultRun = await resultRunPromise;

            expect(resultRun).toStrictEqual(run);
            expect(startRun).toHaveBeenCalledTimes(1);
        });

        it('returns existing Run if it is in OK status', async () => {
            const existingRun = createActorRunMock({
                id: 'test-id',
                requestId: 'test-run',
                status: 'RUNNING',
                startedAt: new Date(),
            });
            context.runTracker.updateRun('test-run', existingRun);

            const getActorSpy = vi.spyOn(RunClient.prototype, 'get').mockResolvedValue(existingRun);

            const findOrRequestRunStart = context.findOrRequestRunStart(
                buildRunStartRequest({ runName: 'test-run', source: runSource }),
            );
            const resultRun = await findOrRequestRunStart();

            expect(resultRun).toStrictEqual(existingRun);
            expect(getActorSpy).toHaveBeenCalledTimes(1);
            expect(startRun).not.toHaveBeenCalled();
        });

        it('starts a new Run if existing Run is not in OK status', async () => {
            const oldRun = createActorRunMock({ id: 'old-id', status: 'FAILED', startedAt: new Date() });
            const newRun = createActorRunMock({
                id: 'new-id',
                requestId: 'test-run',
                status: 'RUNNING',
                startedAt: new Date(),
            });

            context.runTracker.updateRun('test-run', oldRun);
            startRun.mockResolvedValue(newRun);

            const findOrRequestRunStart = context.findOrRequestRunStart(
                buildRunStartRequest({ runName: 'test-run', source: runSource }),
            );
            const resultRunPromise = findOrRequestRunStart();
            await vi.advanceTimersByTimeAsync(1000);
            const resultRun = await resultRunPromise;

            expect(resultRun).toStrictEqual(newRun);
            expect(startRun).toHaveBeenCalledTimes(1);
        });

        it('starts a new Run if no existing Run is found', async () => {
            const newRun = createActorRunMock({
                id: 'new-id',
                requestId: 'test-run',
                status: 'RUNNING',
                startedAt: new Date(),
            });
            startRun.mockResolvedValue(newRun);

            const findOrRequestRunStart = context.findOrRequestRunStart(
                buildRunStartRequest({ runName: 'test-run', source: runSource }),
            );
            const resultRunPromise = findOrRequestRunStart();
            await vi.advanceTimersByTimeAsync(1000);
            const resultRun = await resultRunPromise;

            expect(resultRun).toStrictEqual(newRun);
            expect(startRun).toHaveBeenCalledTimes(1);
        });

        it('starts a new Run if existing Run object cannot be retrieved', async () => {
            const existingRun = createActorRunMock({ id: 'test-id', status: 'RUNNING', startedAt: new Date() });
            const newRun = createActorRunMock({
                id: 'new-id',
                requestId: 'test-run',
                status: 'RUNNING',
                startedAt: new Date(),
            });

            context.runTracker.updateRun('test-run', existingRun);
            startRun.mockResolvedValue(newRun);

            const getActorSpy = vi.spyOn(RunClient.prototype, 'get').mockResolvedValue(undefined);

            const findOrRequestRunStart = context.findOrRequestRunStart(
                buildRunStartRequest({ runName: 'test-run', source: runSource }),
            );
            const resultRun = await findOrRequestRunStart();

            expect(resultRun).toStrictEqual(newRun);
            expect(getActorSpy).toHaveBeenCalledTimes(1);
            expect(startRun).toHaveBeenCalledTimes(1);
        });

        it('adds the fixed input when starting a new Run', async () => {
            const contextWithFixedInput = getClientContext({
                fixedInput: { propA: 'valueA', propB: 'valueB' },
            });
            const newRun = createActorRunMock({
                id: 'new-id',
                requestId: 'test-run',
                status: 'RUNNING',
                startedAt: new Date(),
            });
            startRun.mockResolvedValue(newRun);

            const findOrRequestRunStart = contextWithFixedInput.findOrRequestRunStart(
                buildRunStartRequest({
                    runName: 'test-run',
                    source: runSource,
                    input: { propB: 'overrideB', propC: 'valueC' },
                }),
            );
            const resultRunPromise = findOrRequestRunStart();
            await vi.advanceTimersByTimeAsync(1000);
            const resultRun = await resultRunPromise;

            expect(resultRun).toStrictEqual(newRun);
            expect(startRun).toHaveBeenCalledWith(
                {
                    propA: 'valueA',
                    propB: 'overrideB', // overrides fixed input
                    propC: 'valueC',
                },
                undefined,
            );
        });
    });

    describe('ambiguous duplicate requests', () => {
        it('throws when a second implicit request is made while the first is still in-flight', () => {
            const input = { key: 'value' };
            context.runScheduler.requestRunStart(buildRunStartRequest({ source: runSource, input }));

            expect(() => context.findOrRequestRunStart(buildRunStartRequest({ source: runSource, input }))).toThrow(
                AmbiguousRunRequestError,
            );
        });

        it('does not throw when the second in-flight request has an explicit runName', async () => {
            const run = createActorRunMock({ id: 'test-id', requestId: 'my-job', status: 'RUNNING' });
            startRun.mockResolvedValue(run);
            context.runScheduler.requestRunStart(buildRunStartRequest({ source: runSource, runName: 'my-job' }));

            const waitForStart = context.findOrRequestRunStart(
                buildRunStartRequest({ source: runSource, runName: 'my-job' }),
            );
            await vi.advanceTimersByTimeAsync(1000);
            await expect(waitForStart()).resolves.toStrictEqual(run);
        });

        it('throws when an implicit request repeats within the same session while the Run is OK', async () => {
            const input = { key: 'value' };
            const run = createActorRunMock({ id: 'test-id', status: 'RUNNING' });
            startRun.mockResolvedValue(run);

            const waitForStart = context.findOrRequestRunStart(buildRunStartRequest({ source: runSource, input }));
            await vi.advanceTimersByTimeAsync(1000);
            await waitForStart();

            expect(() => context.findOrRequestRunStart(buildRunStartRequest({ source: runSource, input }))).toThrow(
                AmbiguousRunRequestError,
            );
        });

        it('reconnects silently on first contact after a resurrection, but throws on a repeat in that same session', async () => {
            const input = { key: 'value' };
            const { requestId } = buildRunStartRequest({ source: runSource, input });
            const existingRun = createActorRunMock({ id: 'existing-id', requestId, status: 'RUNNING' });

            // Simulate a fresh process that loaded persisted tracked-run info from a prior process.
            const resurrectedContext = getClientContext();
            resurrectedContext.runTracker.updateRun(requestId, existingRun);
            vi.spyOn(RunClient.prototype, 'get').mockResolvedValue(existingRun);

            const firstResult = await resurrectedContext.findOrRequestRunStart(
                buildRunStartRequest({ source: runSource, input }),
            )();
            expect(firstResult).toStrictEqual(existingRun);

            expect(() =>
                resurrectedContext.findOrRequestRunStart(buildRunStartRequest({ source: runSource, input })),
            ).toThrow(AmbiguousRunRequestError);
        });

        it('always allows retrying after a failed Run, but throws on a further implicit repeat once it succeeds', async () => {
            const input = { key: 'value' };
            const { requestId } = buildRunStartRequest({ source: runSource, input });
            const failedRun = createActorRunMock({ id: 'failed-id', requestId, status: 'FAILED' });
            context.runTracker.updateRun(requestId, failedRun);

            const retriedRun = createActorRunMock({ id: 'retried-id', requestId, status: 'RUNNING' });
            startRun.mockResolvedValue(retriedRun);

            const retryWaitForStart = context.findOrRequestRunStart(buildRunStartRequest({ source: runSource, input }));
            await vi.advanceTimersByTimeAsync(1000);
            await expect(retryWaitForStart()).resolves.toStrictEqual(retriedRun);

            expect(() => context.findOrRequestRunStart(buildRunStartRequest({ source: runSource, input }))).toThrow(
                AmbiguousRunRequestError,
            );
        });

        it('treats an empty string runName the same as an omitted one', () => {
            context.runScheduler.requestRunStart(
                buildRunStartRequest({ source: runSource, input: { key: 'value' }, runName: '' }),
            );

            expect(() =>
                context.findOrRequestRunStart(buildRunStartRequest({ source: runSource, input: { key: 'value' } })),
            ).toThrow(AmbiguousRunRequestError);
        });

        it('rejects exactly one of two concurrent findOrStartRun calls with identical implicit input', async () => {
            const input = { key: 'value' };
            const run = createActorRunMock({ id: 'new-id', status: 'RUNNING' });
            startRun.mockResolvedValue(run);

            const promise1 = context.findOrStartRun(buildRunStartRequest({ source: runSource, input }));
            const promise2 = context.findOrStartRun(buildRunStartRequest({ source: runSource, input }));
            // Attach handlers synchronously, before any `await`, so the rejected promise is never
            // observed as "unhandled" during the timer advance below.
            const resultsPromise = Promise.allSettled([promise1, promise2]);

            await vi.advanceTimersByTimeAsync(1000);

            const results = await resultsPromise;
            const fulfilled = results.filter((result) => result.status === 'fulfilled');
            const rejected = results.filter((result) => result.status === 'rejected');

            expect(fulfilled).toHaveLength(1);
            expect(rejected).toHaveLength(1);
            expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(AmbiguousRunRequestError);
        });
    });
});
