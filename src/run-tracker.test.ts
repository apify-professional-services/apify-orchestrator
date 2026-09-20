import { afterEach, describe, expect, it, vi } from 'vitest';

import { getClientContext } from './__unit__/context.js';
import { createActorRunMock } from './__unit__/mocks.js';
import { RunTracker } from './run-tracker.js';
import type { ExtendedActorRun, RunInfo } from './types.js';

describe('RunTracker', async () => {
    const context = getClientContext();

    const runMock = createActorRunMock({
        id: 'test-run-id',
        status: 'READY',
        startedAt: new Date('2024-01-01T00:00:00.000Z'),
        requestId: 'test-run-1',
    });

    const runName = 'test-run-1';
    const runInfo = {
        runId: runMock.id,
        runUrl: `https://test.com/${runMock.id}`,
        status: runMock.status,
        startedAt: runMock.startedAt?.toISOString() ?? new Date().toISOString(),
    };

    const initialTrackedRuns = {
        current: {
            [runName]: runInfo,
        },
        failedHistory: {},
    };

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('initializes tracked runs from storage correctly', async () => {
        const tracker = new RunTracker(context, initialTrackedRuns);

        expect(tracker.findRunByRequestId(runName)).toEqual(runInfo);
    });

    it('initializes tracked runs to empty state if no runs are found', async () => {
        const emptyTrackedRuns = {
            current: {},
            failedHistory: {},
        };

        const tracker = new RunTracker(context, emptyTrackedRuns);

        expect(tracker.findRunByRequestId(runName)).toBeUndefined();
    });

    it('tracks and retrieves current runs correctly', async () => {
        const expectedRunInfo: Partial<RunInfo> = {
            runId: runMock.id,
            status: runMock.status,
            startedAt: runMock.startedAt.toISOString(),
        };

        const emptyTrackedRuns = {
            current: {},
            failedHistory: {},
        };

        const tracker = new RunTracker(context, emptyTrackedRuns);

        tracker.updateRun(runName, runMock);

        const storedRun = tracker.findRunByRequestId(runName);
        expect(storedRun).toEqual(expect.objectContaining(expectedRunInfo));

        const foundRunName = tracker.findRunRequestId(runMock.id);
        expect(foundRunName).toBe(runName);
        expect(tracker.getCurrentRuns()).toEqual({ [runName]: expect.objectContaining(expectedRunInfo) });
    });

    it('calls the callback on updates', async () => {
        const onUpdateMock = vi.fn();
        const contextWithCallback = { ...context, options: { ...context.options, onUpdate: onUpdateMock } };

        const tracker = new RunTracker(contextWithCallback, initialTrackedRuns);

        expect(onUpdateMock).toHaveBeenCalledWith(initialTrackedRuns.current, undefined, undefined);

        tracker.updateRun('test-run-2', runMock);

        expect(onUpdateMock).toHaveBeenCalledWith(
            expect.objectContaining({
                [runName]: runInfo,
                'test-run-2': expect.objectContaining({
                    runId: runMock.id,
                    status: runMock.status,
                    startedAt: runMock.startedAt.toISOString(),
                }),
            }),
            'test-run-2',
            runMock,
        );
    });

    it('does not call the callback if there are no changes', async () => {
        const onUpdateMock = vi.fn();
        const contextWithCallback = { ...context, options: { ...context.options, onUpdate: onUpdateMock } };

        const emptyTrackedRuns = {
            current: {},
            failedHistory: {},
        };

        const tracker = new RunTracker(contextWithCallback, emptyTrackedRuns);

        expect(tracker.findRunByRequestId(runName)).toBeUndefined();
        expect(onUpdateMock).toHaveBeenCalledTimes(1);

        tracker.updateRun('test-run-1', runMock);

        expect(onUpdateMock).toHaveBeenCalledTimes(2);

        tracker.updateRun('test-run-1', runMock); // same run data

        expect(onUpdateMock).toHaveBeenCalledTimes(2); // no changes, no new call
    });

    it('updates failed runs correctly', async () => {
        const failedRunMock = {
            requestId: 'test-run',
            id: runMock.id,
            status: 'FAILED',
            startedAt: new Date(),
        } as ExtendedActorRun;

        const emptyTrackedRuns = {
            current: {},
            failedHistory: {},
        };

        const tracker = new RunTracker(context, emptyTrackedRuns);

        tracker.updateRun(runName, failedRunMock);
        const updatedRunInfo = tracker.findRunByRequestId(runName);

        expect(updatedRunInfo?.status).toBe('FAILED');
        expect(tracker.findRunByRequestId(runName)).toEqual(
            expect.objectContaining({
                runId: runMock.id,
                status: 'FAILED',
            }),
        );

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((tracker as any).trackedRuns.failedHistory).toEqual({
            [runName]: [
                {
                    ...updatedRunInfo,
                    status: 'FAILED',
                },
            ],
        });
    });

    it('declares lost runs correctly', async () => {
        const emptyTrackedRuns = {
            current: {},
            failedHistory: {},
        };

        const tracker = new RunTracker(context, emptyTrackedRuns);

        tracker.updateRun(runName, runMock); // first track the run
        tracker.updateRun(runName); // then declare it lost

        const lostRunInfo = tracker.findRunByRequestId(runName);
        expect(lostRunInfo).toBeUndefined();

        // eslint-disable-next-line dot-notation
        expect(tracker['trackedRuns'].failedHistory).toEqual({
            [runName]: [
                expect.objectContaining({
                    runId: runMock.id,
                    status: 'LOST',
                }),
            ],
        });
    });

    describe('getActiveRunCount', () => {
        function buildTracker() {
            return new RunTracker(context, { current: {}, failedHistory: {} });
        }

        it('counts no Run when none is tracked', () => {
            const tracker = buildTracker();

            expect(tracker.getActiveRunCount()).toBe(0);
        });

        it('counts the Runs in progress', () => {
            const tracker = buildTracker();

            tracker.updateRun('ready-run', createActorRunMock({ id: 'ready-run-id', status: 'READY' }));
            tracker.updateRun('running-run', createActorRunMock({ id: 'running-run-id', status: 'RUNNING' }));

            expect(tracker.getActiveRunCount()).toBe(2);
        });

        it('counts the Runs which are shutting down', () => {
            const tracker = buildTracker();

            tracker.updateRun('aborting-run', createActorRunMock({ id: 'aborting-run-id', status: 'ABORTING' }));
            tracker.updateRun('timing-out-run', createActorRunMock({ id: 'timing-out-run-id', status: 'TIMING-OUT' }));

            expect(tracker.getActiveRunCount()).toBe(2);
        });

        it('does not count the Runs in a terminal status', () => {
            const tracker = buildTracker();

            for (const status of ['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'] as const) {
                tracker.updateRun(`${status}-run`, createActorRunMock({ id: `${status}-run-id`, status }));
            }
            tracker.updateRun('running-run', createActorRunMock({ id: 'running-run-id', status: 'RUNNING' }));

            expect(tracker.getActiveRunCount()).toBe(1);
        });

        it('stops counting a Run once it finishes', () => {
            const tracker = buildTracker();

            tracker.updateRun('test-run', createActorRunMock({ id: 'test-run-id', status: 'RUNNING' }));
            expect(tracker.getActiveRunCount()).toBe(1);

            tracker.updateRun('test-run', createActorRunMock({ id: 'test-run-id', status: 'SUCCEEDED' }));
            expect(tracker.getActiveRunCount()).toBe(0);
        });

        it('stops counting a Run which was lost', () => {
            const tracker = buildTracker();

            tracker.updateRun('lost-run', createActorRunMock({ id: 'lost-run-id', status: 'RUNNING' }));
            expect(tracker.getActiveRunCount()).toBe(1);

            tracker.updateRun('lost-run', undefined);
            expect(tracker.getActiveRunCount()).toBe(0);
        });
    });
});
