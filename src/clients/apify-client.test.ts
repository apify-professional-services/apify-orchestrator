import { Actor } from 'apify';
import { RunClient } from 'apify-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getClientContext } from '../__unit__/context.js';
import { createActorRunMock } from '../__unit__/mocks.js';
import type { ClientContext } from '../context/client-context.js';
import { RunSource } from '../entities/run-source.js';
import { buildRunStartRequest } from '../entities/run-start-request.js';
import { AmbiguousRunRequestError } from '../errors.js';
import { ExtActorClient } from './actor-client.js';
import { ExtApifyClient } from './apify-client.js';
import { ExtDatasetClient } from './dataset-client.js';
import { ExtRunClient } from './run-client.js';

vi.mock('../utils/apify-client.js', async (importActual) => {
    return {
        ...(await importActual()),
        parseStartRunError: vi.fn(),
    };
});

describe('ExtApifyClient', () => {
    const startRun = vi.fn();
    const defaultMemoryMbytes = vi.fn();
    const runSource = new RunSource({
        type: 'actor',
        id: 'test-actor-id',
        start: startRun,
        defaultMemoryMbytes,
    });

    const mockDate = new Date('2024-09-11T06:00:00.000Z');

    let context: ClientContext;
    let client: ExtApifyClient;

    beforeEach(() => {
        vi.useFakeTimers();
        context = getClientContext();
        client = new ExtApifyClient('test-client', context, {});
    });

    afterEach(() => {
        vi.resetAllMocks();
        vi.useRealTimers();
    });

    describe('actor', () => {
        it('generates an extended ActorClient', () => {
            const actorClient = client.actor('test-actor-id');
            expect(actorClient).toBeInstanceOf(ExtActorClient);
        });
    });

    describe('dataset', () => {
        it('generates an extended DatasetClient', () => {
            const datasetClient = client.dataset('test-dataset-id');
            expect(datasetClient).toBeInstanceOf(ExtDatasetClient);
        });
    });

    describe('run', () => {
        it('generates a regular RunClient if the run has not been tracked already', async () => {
            const runClient = client.run('test-id');
            expect(runClient).toBeInstanceOf(RunClient);
            expect(runClient).not.toBeInstanceOf(ExtRunClient);
        });

        it('generates an extended RunClient if a run with the same ID has been tracked', async () => {
            context.runTracker.updateRun(
                'test-run',
                createActorRunMock({ id: 'test-id', status: 'READY', startedAt: new Date() }),
            );
            const runClient = client.run('test-id');
            expect(runClient).toBeInstanceOf(ExtRunClient);
        });
    });

    describe('runByRequest', () => {
        it('waits for a Run to start and then generates an extended RunClient', async () => {
            const run = createActorRunMock({ id: 'test-id', status: 'READY', startedAt: new Date() });
            startRun.mockResolvedValue(run);
            context.runScheduler.requestRunStart(buildRunStartRequest({ runName: 'test-run', source: runSource }));
            expect(startRun).not.toHaveBeenCalled();
            const runClientPromise = client.runByRequest('test-run');
            await vi.advanceTimersByTimeAsync(1000);
            const runClient = await runClientPromise;
            expect(startRun).toHaveBeenCalledTimes(1);
            expect(runClient?.id).toBe(run.id);
        });

        it('generates an extended RunClient if a Run with the specified name exists', async () => {
            context.runTracker.updateRun(
                'test-run',
                createActorRunMock({ id: 'test-id', status: 'READY', startedAt: new Date() }),
            );
            const runClient = await client.runByRequest('test-run');
            expect(runClient).toBeInstanceOf(ExtRunClient);
        });

        it('returns undefined if a Run with the specified name does not exists', async () => {
            const runClient = await client.runByRequest('test-run');
            expect(runClient).toBe(undefined);
        });
    });

    describe('actorRunByRequest', () => {
        it('waits for a Run to start and then returns the ActorRun', async () => {
            const run = createActorRunMock({
                id: 'test-id',
                requestId: 'test-run',
                status: 'READY',
                startedAt: new Date(),
            });
            startRun.mockResolvedValue(run);
            context.runScheduler.requestRunStart(buildRunStartRequest({ runName: 'test-run', source: runSource }));
            expect(startRun).not.toHaveBeenCalled();
            const foundRunPromise = client.actorRunByRequest('test-run');
            await vi.advanceTimersByTimeAsync(1000);
            const foundRun = await foundRunPromise;
            expect(startRun).toHaveBeenCalledTimes(1);
            expect(foundRun).toStrictEqual(run);
        });

        it('generates an ActorRun if a Run with the specified name exists', async () => {
            context.runTracker.updateRun(
                'test-run',
                createActorRunMock({ id: 'test-id', status: 'READY', startedAt: new Date() }),
            );
            const getActorSpy = vi.spyOn(RunClient.prototype, 'get').mockImplementationOnce(async () => {
                return createActorRunMock({ id: 'test-id', startedAt: new Date() });
            });
            const actorRun = await client.actorRunByRequest('test-run');
            expect(getActorSpy).toHaveBeenCalledTimes(1);
            expect(actorRun?.id).toBe('test-id');
        });

        it('returns undefined if a Run with the specified name exists but the Run cannot be created', async () => {
            context.runTracker.updateRun(
                'test-run',
                createActorRunMock({ id: 'test-id', status: 'READY', startedAt: new Date() }),
            );
            const getActorSpy = vi.spyOn(RunClient.prototype, 'get').mockImplementation(async () => {
                return undefined;
            });
            const actorRun = await client.actorRunByRequest('test-run');
            expect(getActorSpy).toHaveBeenCalledTimes(1);
            expect(actorRun).toBeUndefined();
        });

        it('returns undefined if a Run with the specified name does not exists', async () => {
            const getActorSpy = vi.spyOn(RunClient.prototype, 'get');
            const actorRun = await client.actorRunByRequest('test-run');
            expect(getActorSpy).not.toHaveBeenCalled();
            expect(actorRun).toBeUndefined();
        });
    });

    describe('actorRunsByRequest', () => {
        it('generates an array with all the existing Runs when calling `actorRunsByRequest`', async () => {
            const getActorSpy = vi.spyOn(RunClient.prototype, 'get');

            context.runTracker.updateRun(
                'test-run-1',
                createActorRunMock({ id: 'test-id-1', status: 'READY', startedAt: mockDate }),
            );
            context.runTracker.updateRun(
                'test-run-2',
                createActorRunMock({ id: 'test-id-2', status: 'READY', startedAt: mockDate }),
            );
            context.runTracker.updateRun(
                'test-run-3',
                createActorRunMock({ id: 'test-id-3', status: 'READY', startedAt: mockDate }),
            );

            getActorSpy
                .mockResolvedValueOnce(createActorRunMock({ id: 'test-id-1', status: 'READY', startedAt: mockDate }))
                .mockResolvedValueOnce(createActorRunMock({ id: 'test-id-2', status: 'READY', startedAt: mockDate }))
                .mockResolvedValueOnce(createActorRunMock({ id: 'test-id-3', status: 'READY', startedAt: mockDate }));

            expect(await client.actorRunsByRequest('test-run-1', 'test-run-2', 'test-run-3')).toEqual([
                createActorRunMock({
                    id: 'test-id-1',
                    requestId: 'test-run-1',
                    status: 'READY',
                    startedAt: mockDate,
                }),
                createActorRunMock({
                    id: 'test-id-2',
                    requestId: 'test-run-2',
                    status: 'READY',
                    startedAt: mockDate,
                }),
                createActorRunMock({
                    id: 'test-id-3',
                    requestId: 'test-run-3',
                    status: 'READY',
                    startedAt: mockDate,
                }),
            ]);
            expect(getActorSpy).toHaveBeenCalledTimes(3);

            context.runTracker.updateRun('test-run-2'); // track lost run by not providing a run object

            getActorSpy
                .mockResolvedValueOnce(createActorRunMock({ id: 'test-id-1', status: 'READY', startedAt: mockDate }))
                .mockResolvedValueOnce(createActorRunMock({ id: 'test-id-3', status: 'READY', startedAt: mockDate }));

            expect(await client.actorRunsByRequest('test-run-1', 'test-run-2', 'test-run-3')).toEqual([
                createActorRunMock({
                    id: 'test-id-1',
                    requestId: 'test-run-1',
                    status: 'READY',
                    startedAt: mockDate,
                }),
                createActorRunMock({
                    id: 'test-id-3',
                    requestId: 'test-run-3',
                    status: 'READY',
                    startedAt: mockDate,
                }),
            ]);
            expect(getActorSpy).toHaveBeenCalledTimes(5);

            expect(await client.actorRunsByRequest('test-run-4', 'test-run-5', 'test-run-6')).toEqual([]);
        });
    });

    describe('waitForBatchFinish', () => {
        it('waits for all the Runs to finish when calling `waitForBatchFinish`', async () => {
            const mockRunIds = ['test-id-1', 'test-id-2', 'test-id-3'];
            let waitCounter = 0;
            const waitForFinishSpy = vi.spyOn(RunClient.prototype, 'waitForFinish').mockImplementation(async () => {
                const run = createActorRunMock({
                    id: mockRunIds[waitCounter],
                    status: 'SUCCEEDED',
                    startedAt: mockDate,
                });
                waitCounter++;
                if (waitCounter === mockRunIds.length) {
                    waitCounter = 0;
                }
                return run;
            });
            let getCounter = 0;
            const getActorSpy = vi.spyOn(RunClient.prototype, 'get').mockImplementation(async () => {
                const run = createActorRunMock({ id: mockRunIds[getCounter], status: 'READY', startedAt: mockDate });
                getCounter++;
                if (getCounter === mockRunIds.length) {
                    getCounter = 0;
                }
                return run;
            });

            const runs = await client.waitForBatchFinish([
                createActorRunMock({
                    id: mockRunIds[0],
                    requestId: 'test-run-1',
                    status: 'READY',
                    startedAt: mockDate,
                }),
                createActorRunMock({
                    id: mockRunIds[1],
                    requestId: 'test-run-2',
                    status: 'READY',
                    startedAt: mockDate,
                }),
                createActorRunMock({
                    id: mockRunIds[2],
                    requestId: 'test-run-3',
                    status: 'READY',
                    startedAt: mockDate,
                }),
            ]);

            const expectedRuns = [
                createActorRunMock({
                    id: mockRunIds[0],
                    requestId: 'test-run-1',
                    status: 'SUCCEEDED',
                    startedAt: mockDate,
                }),
                createActorRunMock({
                    id: mockRunIds[1],
                    requestId: 'test-run-2',
                    status: 'SUCCEEDED',
                    startedAt: mockDate,
                }),
                createActorRunMock({
                    id: mockRunIds[2],
                    requestId: 'test-run-3',
                    status: 'SUCCEEDED',
                    startedAt: mockDate,
                }),
            ];

            expect(waitForFinishSpy).toHaveBeenCalledTimes(3);
            expect(runs).toEqual(expectedRuns);
            expect(context.runTracker.getCurrentRuns()).toEqual({
                'test-run-1': {
                    runId: 'test-id-1',
                    runUrl: 'https://console.apify.com/actors/runs/test-id-1',
                    status: 'SUCCEEDED',
                    startedAt: mockDate.toISOString(),
                },
                'test-run-2': {
                    runId: 'test-id-2',
                    runUrl: 'https://console.apify.com/actors/runs/test-id-2',
                    status: 'SUCCEEDED',
                    startedAt: mockDate.toISOString(),
                },
                'test-run-3': {
                    runId: 'test-id-3',
                    runUrl: 'https://console.apify.com/actors/runs/test-id-3',
                    status: 'SUCCEEDED',
                    startedAt: mockDate.toISOString(),
                },
            });

            await client.waitForBatchFinish(['test-run-1', 'test-run-2', 'test-run-3']);

            expect(getActorSpy).toHaveBeenCalledTimes(3);
            expect(waitForFinishSpy).toHaveBeenCalledTimes(6);
            expect(runs).toEqual(expectedRuns);
        });
    });

    describe('abortAllRuns', () => {
        it('aborts all tracked runs', async () => {
            const run1 = createActorRunMock({ id: 'run-1-id', status: 'RUNNING', startedAt: new Date() });
            const run2 = createActorRunMock({ id: 'run-2-id', status: 'RUNNING', startedAt: new Date() });

            context.runTracker.updateRun('test-run-1', run1);
            context.runTracker.updateRun('test-run-2', run2);

            const abortSpy = vi
                .spyOn(RunClient.prototype, 'abort')
                .mockResolvedValue(createActorRunMock({ status: 'ABORTED', startedAt: new Date() }));

            await client.abortAllRuns();

            expect(abortSpy).toHaveBeenCalledTimes(2);
        });

        it('does not mark the Runs as aborted on graceful abort', async () => {
            const run1 = createActorRunMock({ id: 'run-1-id', status: 'RUNNING', startedAt: new Date() });

            context.runTracker.updateRun('test-run-1', run1);

            vi.spyOn(RunClient.prototype, 'abort').mockResolvedValue(
                createActorRunMock({ status: 'ABORTED', startedAt: new Date() }),
            );

            await client.abortAllRuns();

            expect(context.gracefulAbortTracker.wasRunAborted('test-run-1')).toBe(false);
        });

        it('handles errors when aborting runs', async () => {
            const run1 = createActorRunMock({ id: 'run-1-id', status: 'RUNNING', startedAt: new Date() });

            context.runTracker.updateRun('test-run-1', run1);

            const abortSpy = vi.spyOn(RunClient.prototype, 'abort').mockRejectedValue(new Error('Abort failed'));

            // Should not throw
            await expect(client.abortAllRuns()).resolves.not.toThrow();

            expect(abortSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe('graceful abort', () => {
        beforeEach(() => {
            context = getClientContext({ abortAllRunsOnGracefulAbort: true });
            client = new ExtApifyClient('test-client', context, {});
        });

        function gracefullyAbort(): Promise<void> {
            // eslint-disable-next-line dot-notation
            return client['abortAllRunsOnGracefulAbort']();
        }

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
            expect(context.gracefulAbortTracker.wasRunAborted('test-run-1')).toBe(true);
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

            await gracefullyAbort();

            expect(context.gracefulAbortTracker.wasRunAborted('test-run-1')).toBe(true);
            expect(context.gracefulAbortTracker.wasRunAborted('test-run-2')).toBe(true);
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

            await gracefullyAbort();

            expect(context.gracefulAbortTracker.wasRunAborted('succeeded-run')).toBe(false);
            expect(context.gracefulAbortTracker.wasRunAborted('aborted-run')).toBe(false);
        });
    });

    describe('extendedRunClient', () => {
        it('creates an ExtRunClient instance', () => {
            const extRunClient = client.extendedRunClient('test-run', 'test-id');

            expect(extRunClient).toBeInstanceOf(ExtRunClient);
            expect(extRunClient.id).toBe('test-id');
        });
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

            const findOrRequestRunStart = client.findOrRequestRunStart(
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

            const findOrRequestRunStart = client.findOrRequestRunStart(
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

            const findOrRequestRunStart = client.findOrRequestRunStart(
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

            const findOrRequestRunStart = client.findOrRequestRunStart(
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

            const findOrRequestRunStart = client.findOrRequestRunStart(
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
            const clientWithFixedInput = new ExtApifyClient('test-client', contextWithFixedInput, {});
            const newRun = createActorRunMock({
                id: 'new-id',
                requestId: 'test-run',
                status: 'RUNNING',
                startedAt: new Date(),
            });
            startRun.mockResolvedValue(newRun);

            const findOrRequestRunStart = clientWithFixedInput.findOrRequestRunStart(
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

            expect(() => client.findOrRequestRunStart(buildRunStartRequest({ source: runSource, input }))).toThrow(
                AmbiguousRunRequestError,
            );
        });

        it('does not throw when the second in-flight request has an explicit runName', async () => {
            const run = createActorRunMock({ id: 'test-id', requestId: 'my-job', status: 'RUNNING' });
            startRun.mockResolvedValue(run);
            context.runScheduler.requestRunStart(buildRunStartRequest({ source: runSource, runName: 'my-job' }));

            const waitForStart = client.findOrRequestRunStart(
                buildRunStartRequest({ source: runSource, runName: 'my-job' }),
            );
            await vi.advanceTimersByTimeAsync(1000);
            await expect(waitForStart()).resolves.toStrictEqual(run);
        });

        it('throws when an implicit request repeats within the same session while the Run is OK', async () => {
            const input = { key: 'value' };
            const run = createActorRunMock({ id: 'test-id', status: 'RUNNING' });
            startRun.mockResolvedValue(run);

            const waitForStart = client.findOrRequestRunStart(buildRunStartRequest({ source: runSource, input }));
            await vi.advanceTimersByTimeAsync(1000);
            await waitForStart();

            expect(() => client.findOrRequestRunStart(buildRunStartRequest({ source: runSource, input }))).toThrow(
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
            const resurrectedClient = new ExtApifyClient('resurrected-client', resurrectedContext, {});
            vi.spyOn(RunClient.prototype, 'get').mockResolvedValue(existingRun);

            const firstResult = await resurrectedClient.findOrRequestRunStart(
                buildRunStartRequest({ source: runSource, input }),
            )();
            expect(firstResult).toStrictEqual(existingRun);

            expect(() =>
                resurrectedClient.findOrRequestRunStart(buildRunStartRequest({ source: runSource, input })),
            ).toThrow(AmbiguousRunRequestError);
        });

        it('always allows retrying after a failed Run, but throws on a further implicit repeat once it succeeds', async () => {
            const input = { key: 'value' };
            const { requestId } = buildRunStartRequest({ source: runSource, input });
            const failedRun = createActorRunMock({ id: 'failed-id', requestId, status: 'FAILED' });
            context.runTracker.updateRun(requestId, failedRun);

            const retriedRun = createActorRunMock({ id: 'retried-id', requestId, status: 'RUNNING' });
            startRun.mockResolvedValue(retriedRun);

            const retryWaitForStart = client.findOrRequestRunStart(buildRunStartRequest({ source: runSource, input }));
            await vi.advanceTimersByTimeAsync(1000);
            await expect(retryWaitForStart()).resolves.toStrictEqual(retriedRun);

            expect(() => client.findOrRequestRunStart(buildRunStartRequest({ source: runSource, input }))).toThrow(
                AmbiguousRunRequestError,
            );
        });

        it('treats an empty string runName the same as an omitted one', () => {
            context.runScheduler.requestRunStart(
                buildRunStartRequest({ source: runSource, input: { key: 'value' }, runName: '' }),
            );

            expect(() =>
                client.findOrRequestRunStart(buildRunStartRequest({ source: runSource, input: { key: 'value' } })),
            ).toThrow(AmbiguousRunRequestError);
        });

        it('rejects exactly one of two concurrent findOrStartRun calls with identical implicit input', async () => {
            const input = { key: 'value' };
            const run = createActorRunMock({ id: 'new-id', status: 'RUNNING' });
            startRun.mockResolvedValue(run);

            const promise1 = client.findOrStartRun(buildRunStartRequest({ source: runSource, input }));
            const promise2 = client.findOrStartRun(buildRunStartRequest({ source: runSource, input }));
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
