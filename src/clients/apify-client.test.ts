import { RunClient } from 'apify-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getClientContext } from '../__unit__/context.js';
import { createActorRunMock } from '../__unit__/mocks.js';
import type { ClientContext } from '../context/client-context.js';
import { RunSource } from '../entities/run-source.js';
import { buildRunStartRequest } from '../entities/run-start-request.js';
import { ExtActorClient } from './actor-client.js';
import type { ExtApifyClient } from './apify-client.js';
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
        client = context.client;
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

            expect(context.wasRunAbortedOnGracefulAbort('run-1-id')).toBe(false);
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
});
