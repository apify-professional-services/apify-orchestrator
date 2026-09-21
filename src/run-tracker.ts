import type { ActorRun } from 'apify-client';

import { NEVER_UPDATED_AT } from './constants.js';
import type { ClientContext } from './context/client-context.js';
import type { ExtendedActorRun, RunInfo } from './types.js';
import { isRunFailStatus, isRunTerminalStatus } from './utils/apify-client.js';
import { getRunUrl } from './utils/apify-console.js';

type RunInfoRecord = { [requestId: string]: RunInfo };

export interface TrackedRuns {
    current: RunInfoRecord;
    failedHistory: { [requestId: string]: RunInfo[] };
}

export class RunTracker {
    private readonly context: ClientContext;
    private readonly trackedRuns: TrackedRuns;

    constructor(context: ClientContext, trackedRuns: TrackedRuns) {
        this.context = context;
        this.trackedRuns = trackedRuns;
        assignMissinglastUpdatedAt(trackedRuns);
        this.itemsChangedCallback();
    }

    getCurrentRuns(): { [requestId: string]: RunInfo } {
        return cloneRunInfoRecord(this.trackedRuns.current);
    }

    /**
     * @returns the number of Runs which are currently in progress, including the ones that are shutting down,
     * such as the Runs in an `ABORTING` or `TIMING-OUT` status: they still occupy the account's resources.
     */
    getActiveRunCount(): number {
        return Object.values(this.trackedRuns.current).filter(({ status }) => !isRunTerminalStatus(status)).length;
    }

    /**
     * @param stalenessThresholdMs how long a Run's observed status is considered up-to-date.
     * @returns the Runs which are supposedly still in progress, but whose status was not updated recently:
     * they may have finished without the Orchestrator noticing it.
     */
    getStaleRuns(stalenessThresholdMs: number): RunInfoRecord {
        const oldestAcceptableUpdate = Date.now() - stalenessThresholdMs;
        const staleRuns = Object.entries(this.trackedRuns.current).filter(
            ([_requestId, { status, lastUpdatedAt }]) =>
                !isRunTerminalStatus(status) && new Date(lastUpdatedAt).getTime() <= oldestAcceptableUpdate,
        );
        return cloneRunInfoRecord(Object.fromEntries(staleRuns));
    }

    /**
     * Records that a Run's status was just updated, without changing anything else about it.
     *
     * It is used when an update could not be completed, to avoid polling the same Run over and over again.
     */
    markRunUpdated(requestId: string): void {
        const runInfo = this.trackedRuns.current[requestId];
        if (!runInfo) return;
        runInfo.lastUpdatedAt = new Date().toISOString();
    }

    findRunByRequestId(requestId: string): RunInfo | undefined {
        const runInfo = this.trackedRuns.current[requestId];
        if (!runInfo) {
            return undefined;
        }
        this.context.logger.prefixed(requestId).info('Found existing tracked Run', {}, { url: runInfo.runUrl });
        return runInfo;
    }

    findRunRequestId(runId: string): string | undefined {
        for (const [requestId, runInfo] of Object.entries(this.trackedRuns.current)) {
            if (runInfo.runId === runId) {
                return requestId;
            }
        }
        return undefined;
    }

    updateRun(requestId: string, run?: ExtendedActorRun): void {
        if (!run) {
            this.trackLostRun(requestId);
            return;
        }

        const runInfo = buildRunInfo(run);

        const hasChanged = hasRunChanged(this.trackedRuns.current[requestId], runInfo);

        this.trackedRuns.current[requestId] = runInfo;

        if (hasChanged) {
            const { startedAt, status } = runInfo;
            this.context.logger
                .prefixed(requestId)
                .info('Run status update', { startedAt, status }, { url: runInfo.runUrl });
            this.itemsChangedCallback(requestId, run);
        }

        if (isRunFailStatus(runInfo.status)) {
            this.addOrUpdateFailedRun(requestId, runInfo);
        }
    }

    private trackLostRun(requestId: string): void {
        const runInfo = this.findAndDeleteRun(requestId);
        if (!runInfo) return;
        this.context.logger.prefixed(requestId).info('Lost Run', undefined, { url: runInfo.runUrl });
        this.addOrUpdateFailedRun(requestId, { ...runInfo, status: 'LOST' });
    }

    private findAndDeleteRun(requestId: string): RunInfo | undefined {
        const runInfo = this.trackedRuns.current[requestId];
        if (!runInfo) return undefined;
        delete this.trackedRuns.current[requestId];
        return runInfo;
    }

    private addOrUpdateFailedRun(requestId: string, runInfo: RunInfo) {
        const { runId, status } = runInfo;
        const failedRunInfos: RunInfo[] = this.trackedRuns.failedHistory[requestId] ?? [];
        const existingFailedRunInfo = failedRunInfos.find((existingRun) => existingRun.runId === runId);
        if (existingFailedRunInfo) {
            existingFailedRunInfo.status = status;
        } else {
            failedRunInfos.push(runInfo);
        }
        this.trackedRuns.failedHistory[requestId] = failedRunInfos;
    }

    private itemsChangedCallback(lastChangedRunRequestId?: string, lastChangedRun?: ExtendedActorRun): void {
        if (this.context.options.onUpdate) {
            this.context.options.onUpdate(
                // Pass a copy to avoid allowing direct changes to the tracker's data
                cloneRunInfoRecord(this.trackedRuns.current),
                lastChangedRunRequestId,
                lastChangedRun,
            );
        }
    }
}

function buildRunInfo(run: ActorRun): RunInfo {
    const { id: runId, status, startedAt } = run;
    const runUrl = getRunUrl(runId);
    const formattedStartedAt = startedAt.toISOString();
    // The Run information comes from the platform: it is up-to-date, by definition.
    const lastUpdatedAt = new Date().toISOString();
    return { runId, runUrl, status, startedAt: formattedStartedAt, lastUpdatedAt };
}

/**
 * The Runs persisted by a previous version of the Orchestrator have no `lastUpdatedAt`:
 * they are treated as never updated, so that their status is refreshed as soon as it matters.
 */
function assignMissinglastUpdatedAt(trackedRuns: TrackedRuns): void {
    const allRunInfos: Partial<RunInfo>[] = [
        ...Object.values(trackedRuns.current),
        ...Object.values(trackedRuns.failedHistory).flat(),
    ];
    for (const runInfo of allRunInfos) {
        runInfo.lastUpdatedAt ??= NEVER_UPDATED_AT;
    }
}

function hasRunChanged(existingRun: RunInfo | undefined, newRun: RunInfo): boolean {
    return existingRun?.runId !== newRun.runId || existingRun.status !== newRun.status;
}

function cloneRunInfoRecord(record: RunInfoRecord): RunInfoRecord {
    return Object.fromEntries(Object.entries(record).map(([requestId, runInfo]) => [requestId, { ...runInfo }]));
}
