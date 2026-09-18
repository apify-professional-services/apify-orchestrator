import { ApifyClient, RunClient, TaskClient } from 'apify-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isStillPending } from '../__unit__/async.js';
import { getClientContext } from '../__unit__/context.js';
import { createActorRunMock } from '../__unit__/mocks.js';
import type { ClientContext } from '../context/client-context.js';
import type { RunSource } from '../entities/run-source.js';
import { buildRunStartRequest } from '../entities/run-start-request.js';
import type { OrchestratorOptions } from '../types.js';
import type { ExtApifyClient } from './apify-client.js';
import { ExtRunClient } from './run-client.js';
import type { ExtTaskClient } from './task-client.js';

describe('ExtTaskClient', () => {
    let context: ClientContext;
    let apifyClient: ExtApifyClient;
    let taskClient: ExtTaskClient;
    let runSource: RunSource;

    let taskGetSpy: ReturnType<typeof vi.spyOn>;
    let taskStartSpy: ReturnType<typeof vi.spyOn>;

    const mockRun = createActorRunMock({
        id: 'mock-run-id',
        requestId: 'mock-run-requestId',
        status: 'RUNNING',
        startedAt: new Date('2024-01-01T00:00:00.000Z'),
    });

    function setUpClients(overrideOptions?: Partial<OrchestratorOptions>) {
        context = getClientContext(overrideOptions);
        apifyClient = context.client;

        vi.spyOn(context, 'findOrRequestRunStart').mockImplementation((request) => {
            const requestId = request.runName || 'default-request-id';
            return async () => createActorRunMock({ ...mockRun, requestId });
        });
        vi.spyOn(context, 'findOrStartRun').mockImplementation(async (request) => {
            const requestId = request.runName || 'default-request-id';
            return createActorRunMock({ ...mockRun, requestId });
        });

        // We need to create these spies before creating the taskClient
        // to ensure that they are used in the client's constructor.
        taskGetSpy = vi.spyOn(TaskClient.prototype, 'get');
        taskStartSpy = vi.spyOn(TaskClient.prototype, 'start').mockResolvedValue(mockRun);

        taskClient = apifyClient.task('test-task-id');

        // eslint-disable-next-line dot-notation
        runSource = taskClient['runSource'];
    }

    beforeEach(() => {
        setUpClients();
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('enqueue', () => {
        it('enqueues a single Run request', () => {
            const runRequests = [{ runName: 'test-run-1', input: { key: 'value1' } }];

            const result = taskClient.enqueue(...runRequests);

            expect(result).toEqual(['test-run-1']);
            expect(context.findOrRequestRunStart).toHaveBeenCalledWith({
                source: runSource,
                requestId: 'test-run-1',
                runName: 'test-run-1',
                input: { key: 'value1' },
                options: undefined,
            });
        });

        it('enqueues multiple Run requests', () => {
            const runRequests = [
                { runName: 'test-run-1', input: { key: 'value1' } },
                { runName: 'test-run-2', input: { key: 'value2' } },
                { runName: 'test-run-3', input: { key: 'value3' } },
            ];

            const result = taskClient.enqueue(...runRequests);

            expect(result).toEqual(['test-run-1', 'test-run-2', 'test-run-3']);
        });

        it('forwards runName: undefined when it is not provided, instead of the generated request ID', () => {
            const input = { key: 'value1' };

            const result = taskClient.enqueue({ input });

            const expectedRunStartRequest = buildRunStartRequest({ source: runSource, runName: undefined, input });
            expect(context.findOrRequestRunStart).toHaveBeenCalledWith(expectedRunStartRequest);
            expect(result).toEqual([expectedRunStartRequest.requestId]);
        });
    });

    describe('enqueueBatch', () => {
        it('splits the input according to the rules', () => {
            const sources = ['item1', 'item2', 'item3'];
            const inputGenerator = (chunk: string[]) => ({ items: chunk });

            const result = taskClient.enqueueBatch('batch-test', sources, inputGenerator);

            // Verify it returns an array of run names
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBeGreaterThan(0);
            expect(result.every((name) => typeof name === 'string')).toBe(true);
        });
    });

    describe('start', () => {
        it('starts a single Run', async () => {
            const result = await taskClient.start({ key: 'value1' }, { runName: 'test-run-1' });

            expect(context.findOrStartRun).toHaveBeenCalledWith(
                expect.objectContaining({
                    source: runSource,
                    runName: 'test-run-1',
                    input: { key: 'value1' },
                    options: undefined,
                }),
            );
            expect(result).toStrictEqual(
                expect.objectContaining({ id: mockRun.id, status: mockRun.status, requestId: 'test-run-1' }),
            );
        });

        it('generates a request ID if no run name is provided', async () => {
            const result = await taskClient.start({ key: 'value1' });

            expect(context.findOrStartRun).toHaveBeenCalledWith(
                expect.objectContaining({
                    source: runSource,
                    runName: undefined,
                    input: { key: 'value1' },
                    options: undefined,
                }),
            );
            expect(result).toStrictEqual(
                expect.objectContaining({ id: mockRun.id, status: mockRun.status, requestId: 'default-request-id' }),
            );
        });
    });

    describe('call', () => {
        it('starts a single Run and waits for it to finish', async () => {
            // Mock waitForFinish
            const finishedRunMock = createActorRunMock({
                id: 'test-run-id',
                requestId: 'test-run-1',
                status: 'SUCCEEDED',
                startedAt: new Date(),
            });
            const waitForFinishSpy = vi
                .spyOn(RunClient.prototype, 'waitForFinish')
                .mockImplementation(async () => finishedRunMock);

            const result = await taskClient.call({ key: 'value1' }, { runName: 'test-run-1' });

            expect(context.findOrStartRun).toHaveBeenCalledWith({
                source: runSource,
                requestId: 'test-run-1',
                runName: 'test-run-1',
                input: { key: 'value1' },
                options: undefined,
            });
            expect(waitForFinishSpy).toHaveBeenCalled();
            expect(result).toStrictEqual(
                expect.objectContaining({
                    id: finishedRunMock.id,
                    status: finishedRunMock.status,
                    requestId: finishedRunMock.requestId,
                }),
            );
        });

        it('does not forward waitSecs to the Run start request', async () => {
            vi.spyOn(RunClient.prototype, 'waitForFinish').mockImplementation(async () => mockRun);

            await taskClient.call({ key: 'value1' }, { runName: 'test-run-1', waitSecs: 30, memory: 1024 });

            expect(context.findOrStartRun).toHaveBeenCalledWith({
                source: runSource,
                requestId: 'test-run-1',
                runName: 'test-run-1',
                input: { key: 'value1' },
                options: { memory: 1024 },
            });
        });

        it('still passes waitSecs to waitForFinish', async () => {
            const waitForFinishSpy = vi
                .spyOn(RunClient.prototype, 'waitForFinish')
                .mockImplementation(async () => mockRun);

            await taskClient.call({ key: 'value1' }, { runName: 'test-run-1', waitSecs: 30 });

            expect(waitForFinishSpy).toHaveBeenCalledWith({ waitSecs: 30 });
        });

        it('never returns when the Run is aborted by the Orchestrator on graceful abort', async () => {
            const abortedRunMock = createActorRunMock({ ...mockRun, requestId: 'test-run-1', status: 'ABORTED' });
            vi.spyOn(RunClient.prototype, 'waitForFinish').mockResolvedValue(abortedRunMock);
            context.markRunsAbortedOnGracefulAbort(['mock-run-id']);

            await expect(isStillPending(taskClient.call({ key: 'value1' }, { runName: 'test-run-1' }))).resolves.toBe(
                true,
            );
        });

        it('returns a flagged aborted Run if `returnAbortedRunsOnGracefulAbort` is enabled', async () => {
            setUpClients({ returnAbortedRunsOnGracefulAbort: true });
            const abortedRunMock = createActorRunMock({ ...mockRun, requestId: 'test-run-1', status: 'ABORTED' });
            vi.spyOn(RunClient.prototype, 'waitForFinish').mockResolvedValue(abortedRunMock);
            context.markRunsAbortedOnGracefulAbort(['mock-run-id']);

            const run = await taskClient.call({ key: 'value1' }, { runName: 'test-run-1' });

            expect(run).toStrictEqual(expect.objectContaining({ status: 'ABORTED', abortedOnGracefulAbort: true }));
        });

        it('returns a Run aborted by a user', async () => {
            const abortedRunMock = createActorRunMock({ ...mockRun, requestId: 'test-run-1', status: 'ABORTED' });
            vi.spyOn(RunClient.prototype, 'waitForFinish').mockResolvedValue(abortedRunMock);

            const run = await taskClient.call({ key: 'value1' }, { runName: 'test-run-1' });

            expect(run.status).toBe('ABORTED');
            expect(run.abortedOnGracefulAbort).toBeUndefined();
        });
    });

    describe('lastRun', () => {
        it('generates a RunClient if the last Run has an ID', () => {
            const lastRunSpy = vi
                .spyOn(TaskClient.prototype, 'lastRun')
                .mockReturnValue({ id: 'last-run-id' } as RunClient);
            const mockRunClient = {} as RunClient;
            const runSpy = vi.spyOn(ApifyClient.prototype, 'run').mockReturnValue(mockRunClient);

            const runClient = taskClient.lastRun();

            expect(lastRunSpy).toHaveBeenCalled();
            expect(runSpy).toHaveBeenCalledWith('last-run-id');
            expect(runClient).toBe(mockRunClient);
        });

        it('returns the RunClient from the base method if there is no last Run ID', () => {
            const mockRunClient = {} as RunClient;
            const lastRunSpy = vi.spyOn(TaskClient.prototype, 'lastRun').mockReturnValue(mockRunClient);
            const runSpy = vi.spyOn(apifyClient, 'run');

            const runClient = taskClient.lastRun();

            expect(lastRunSpy).toHaveBeenCalled();
            expect(runSpy).not.toHaveBeenCalled();
            expect(runClient).toBe(mockRunClient);
        });
    });

    describe('startRuns', () => {
        it('starts multiple Runs', async () => {
            // Mock the individual start method to return different runs immediately
            const run1 = createActorRunMock({ id: 'run-1-id', requestId: 'test-run-1', status: 'READY' });
            const run2 = createActorRunMock({ id: 'run-2-id', requestId: 'test-run-2', status: 'READY' });
            const startSpy = vi.spyOn(taskClient, 'start');
            startSpy.mockResolvedValueOnce(run1).mockResolvedValueOnce(run2);

            const runRequests = [
                { runName: 'test-run-1', input: { key: 'value1' } },
                { runName: 'test-run-2', input: { key: 'value2' } },
            ];

            const result = await taskClient.startRuns(...runRequests);

            expect(startSpy).toHaveBeenCalledTimes(2);
            expect(startSpy).toHaveBeenCalledWith({ key: 'value1' }, { runName: 'test-run-1' });
            expect(startSpy).toHaveBeenCalledWith({ key: 'value2' }, { runName: 'test-run-2' });
            expect(result).toEqual([run1, run2]);
        });
    });

    describe('startBatch', () => {
        it('starts a single Run if the Apify API limit is not reached', async () => {
            const sources = ['item1', 'item2'];
            const inputGenerator = (chunk: string[]) => ({ items: chunk });

            const result = await taskClient.startBatch('batch-test', sources, inputGenerator);

            expect(context.findOrStartRun).toHaveBeenCalled();
            expect(result).toEqual([createActorRunMock({ ...mockRun, requestId: 'batch-test' })]);
        });

        it('splits the input and starts multiple Runs', async () => {
            const sources = Array.from({ length: 100 }, (_, i) => ({ id: i, data: 'x'.repeat(100000) })); // size: ~10 MB
            const inputGenerator = (chunk: { id: number; data: string }[]) => ({ items: chunk });

            const result = await taskClient.startBatch('batch-test', sources, inputGenerator);

            expect(context.findOrStartRun).toHaveBeenCalled();
            expect(result).toEqual([
                createActorRunMock({ ...mockRun, requestId: 'batch-test-1/2' }),
                createActorRunMock({ ...mockRun, requestId: 'batch-test-2/2' }),
            ]);
        });
    });

    describe('callRuns', () => {
        it('starts multiple Runs and waits for them to finish', async () => {
            // Mock the individual call method to return different finished runs immediately
            const finishedRun1 = createActorRunMock({ id: 'run-1-id', requestId: 'test-run-1', status: 'SUCCEEDED' });
            const finishedRun2 = createActorRunMock({ id: 'run-2-id', requestId: 'test-run-2', status: 'SUCCEEDED' });
            let callCount = 0;
            const callSpy = vi.spyOn(taskClient, 'call').mockImplementation(async (_runName) => {
                callCount++;
                return callCount === 1 ? finishedRun1 : finishedRun2;
            });

            const runRequests = [
                { runName: 'test-run-1', input: { key: 'value1' } },
                { runName: 'test-run-2', input: { key: 'value2' } },
            ];

            const result = await taskClient.callRuns(...runRequests);

            expect(callSpy).toHaveBeenCalledTimes(2);
            expect(callSpy).toHaveBeenCalledWith({ key: 'value1' }, { runName: 'test-run-1' });
            expect(callSpy).toHaveBeenCalledWith({ key: 'value2' }, { runName: 'test-run-2' });
            expect(result).toEqual([finishedRun1, finishedRun2]);
        });
    });

    describe('callBatch', () => {
        it('splits the input, starts multiple Runs and waits for them to finish', async () => {
            // Mock waitForFinish
            const finishedRun = createActorRunMock({
                id: 'batch-run-id',
                requestId: 'batch-test',
                status: 'SUCCEEDED',
            });
            const waitForFinishSpy = vi
                .spyOn(ExtRunClient.prototype, 'waitForFinish')
                .mockImplementation(async () => finishedRun);

            const sources = ['item1', 'item2'];
            const inputGenerator = (chunk: string[]) => ({ items: chunk });

            const result = await taskClient.callBatch('batch-test', sources, inputGenerator);

            expect(context.findOrStartRun).toHaveBeenCalled();
            expect(waitForFinishSpy).toHaveBeenCalled();
            expect(result).toEqual([finishedRun]);
        });
    });

    describe('runSource', () => {
        it('has the correct start method', async () => {
            taskStartSpy.mockResolvedValue(mockRun);

            const input = { key: 'value' };
            const options = { memory: 2048 };

            const result = await runSource.start(input, options);

            expect(taskStartSpy).toHaveBeenCalledWith(input, options);
            expect(result).toStrictEqual(expect.objectContaining({ id: mockRun.id, status: mockRun.status }));
        });

        it('correctly gets the default memory', async () => {
            taskGetSpy.mockResolvedValue({ options: { memoryMbytes: 2048 } });

            // eslint-disable-next-line dot-notation
            const defaultMemory = await runSource['defaultMemoryMbytes']();

            expect(defaultMemory).toBe(2048);
        });
    });
});
