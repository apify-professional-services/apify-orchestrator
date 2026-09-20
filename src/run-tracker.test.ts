import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getClientContext } from './__unit__/context.js';
import { createActorRunMock } from './__unit__/mocks.js';
import { NEVER_UPDATED_AT, RUN_STALENESS_THRESHOLD_MS } from './constants.js';
import type { TrackedRuns } from './run-tracker.js';
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
    const runInfo: RunInfo = {
        runId: runMock.id,
        runUrl: `https://test.com/${runMock.id}`,
        status: runMock.status,
        startedAt: runMock.startedAt?.toISOString() ?? new Date().toISOString(),
        lastUpdatedAt: '2024-01-01T00:00:10.000Z',
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

    describe('lastUpdatedAt', () => {
        const now = new Date('2024-06-01T12:00:00.000Z');

        function buildTracker(trackedRuns: TrackedRuns = { current: {}, failedHistory: {} }) {
            return new RunTracker(context, trackedRuns);
        }

        /**
         * Builds the Runs as they were persisted by a version of the Orchestrator which did not track
         * when a Run was last updated.
         */
        function buildLegacyTrackedRuns(): TrackedRuns {
            const { lastUpdatedAt: _lastUpdatedAt, ...legacyRunInfo } = runInfo;
            return {
                current: { [runName]: { ...legacyRunInfo } },
                failedHistory: { 'failed-run': [{ ...legacyRunInfo, status: 'FAILED' }] },
            } as unknown as TrackedRuns;
        }

        beforeEach(() => {
            vi.useFakeTimers();
            vi.setSystemTime(now);
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('records when a Run was last updated', () => {
            const tracker = buildTracker();

            tracker.updateRun(runName, runMock);

            expect(tracker.findRunByRequestId(runName)?.lastUpdatedAt).toBe(now.toISOString());
        });

        it('refreshes the timestamp on every update, even when the Run did not change', () => {
            const tracker = buildTracker();
            tracker.updateRun(runName, runMock);

            const later = new Date(now.getTime() + 5_000);
            vi.setSystemTime(later);
            tracker.updateRun(runName, runMock);

            expect(tracker.findRunByRequestId(runName)?.lastUpdatedAt).toBe(later.toISOString());
        });

        it('assigns the Unix epoch to the Runs restored without it', () => {
            const legacyTrackedRuns = buildLegacyTrackedRuns();

            const tracker = buildTracker(legacyTrackedRuns);

            expect(tracker.findRunByRequestId(runName)?.lastUpdatedAt).toBe(NEVER_UPDATED_AT);
            expect(legacyTrackedRuns.failedHistory['failed-run'][0].lastUpdatedAt).toBe(NEVER_UPDATED_AT);
        });

        it('keeps the timestamp of the Runs restored with it', () => {
            const tracker = buildTracker({ current: { [runName]: { ...runInfo } }, failedHistory: {} });

            expect(tracker.findRunByRequestId(runName)?.lastUpdatedAt).toBe(runInfo.lastUpdatedAt);
        });
    });

    describe('getStaleRuns', () => {
        const now = new Date('2024-06-01T12:00:00.000Z');

        function buildTrackerWithRunningRun() {
            const tracker = new RunTracker(context, { current: {}, failedHistory: {} });
            tracker.updateRun(runName, createActorRunMock({ id: 'test-run-id', status: 'RUNNING' }));
            return tracker;
        }

        function moveForward(ms: number) {
            vi.setSystemTime(new Date(Date.now() + ms));
        }

        beforeEach(() => {
            vi.useFakeTimers();
            vi.setSystemTime(now);
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('finds no Run when they were all updated recently', () => {
            const tracker = buildTrackerWithRunningRun();

            moveForward(RUN_STALENESS_THRESHOLD_MS - 1);

            expect(tracker.getStaleRuns(RUN_STALENESS_THRESHOLD_MS)).toEqual({});
        });

        it('finds the Runs in progress which were not updated recently', () => {
            const tracker = buildTrackerWithRunningRun();

            moveForward(RUN_STALENESS_THRESHOLD_MS);

            expect(tracker.getStaleRuns(RUN_STALENESS_THRESHOLD_MS)).toEqual({
                [runName]: expect.objectContaining({ runId: 'test-run-id', status: 'RUNNING' }),
            });
        });

        it('ignores the Runs in a terminal status', () => {
            const tracker = buildTrackerWithRunningRun();
            tracker.updateRun(runName, createActorRunMock({ id: 'test-run-id', status: 'SUCCEEDED' }));

            moveForward(RUN_STALENESS_THRESHOLD_MS);

            expect(tracker.getStaleRuns(RUN_STALENESS_THRESHOLD_MS)).toEqual({});
        });

        it('finds the Runs in progress restored without a timestamp', () => {
            const { lastUpdatedAt: _lastUpdatedAt, ...legacyRunInfo } = runInfo;
            const legacyTrackedRuns = {
                current: { [runName]: { ...legacyRunInfo, status: 'RUNNING' } },
                failedHistory: {},
            } as unknown as TrackedRuns;

            const tracker = new RunTracker(context, legacyTrackedRuns);

            expect(tracker.getStaleRuns(RUN_STALENESS_THRESHOLD_MS)).toEqual({
                [runName]: expect.objectContaining({ lastUpdatedAt: NEVER_UPDATED_AT }),
            });
        });

        it('returns a copy of the tracked Runs', () => {
            const tracker = buildTrackerWithRunningRun();
            moveForward(RUN_STALENESS_THRESHOLD_MS);

            const staleRuns = tracker.getStaleRuns(RUN_STALENESS_THRESHOLD_MS);
            staleRuns[runName].status = 'SUCCEEDED';

            expect(tracker.findRunByRequestId(runName)?.status).toBe('RUNNING');
        });
    });

    describe('markRunUpdated', () => {
        const now = new Date('2024-06-01T12:00:00.000Z');

        beforeEach(() => {
            vi.useFakeTimers();
            vi.setSystemTime(now);
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('records the update without changing anything else', () => {
            const tracker = new RunTracker(context, { current: {}, failedHistory: {} });
            tracker.updateRun(runName, runMock);

            const later = new Date(now.getTime() + RUN_STALENESS_THRESHOLD_MS);
            vi.setSystemTime(later);
            tracker.markRunUpdated(runName);

            expect(tracker.findRunByRequestId(runName)).toEqual({
                runId: runMock.id,
                runUrl: expect.any(String),
                status: runMock.status,
                startedAt: runMock.startedAt.toISOString(),
                lastUpdatedAt: later.toISOString(),
            });
            expect(tracker.getStaleRuns(RUN_STALENESS_THRESHOLD_MS)).toEqual({});
        });

        it('ignores an unknown request ID', () => {
            const tracker = new RunTracker(context, { current: {}, failedHistory: {} });

            expect(() => tracker.markRunUpdated('unknown-run')).not.toThrow();
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
