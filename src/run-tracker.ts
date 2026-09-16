import type { ActorRun } from 'apify-client';

import type { ClientContext } from './context/client-context.js';
import type { ExtendedActorRun, RunInfo } from './types.js';
import { isRunFailStatus } from './utils/apify-client.js';
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
        this.itemsChangedCallback();
    }

    getCurrentRuns(): { [requestId: string]: RunInfo } {
        return cloneRunInfoRecord(this.trackedRuns.current);
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
    return { runId, runUrl, status, startedAt: formattedStartedAt };
}

function hasRunChanged(existingRun: RunInfo | undefined, newRun: RunInfo): boolean {
    return existingRun?.runId !== newRun.runId || existingRun.status !== newRun.status;
}

function cloneRunInfoRecord(record: RunInfoRecord): RunInfoRecord {
    return Object.fromEntries(Object.entries(record).map(([requestId, runInfo]) => [requestId, { ...runInfo }]));
}
