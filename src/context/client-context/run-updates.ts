import type { ActorRun } from 'apify-client';

import { ExtRunClient } from '../../clients/run-client.js';
import { RUN_STALENESS_THRESHOLD_MS } from '../../constants.js';
import type { ExtendedActorRun } from '../../types.js';
import { isRunFailStatus } from '../../utils/apify-client.js';
import { stringifyError } from '../../utils/errors.js';
import type { ClientContext } from '../client-context.js';
import type { GracefulAbortTracker } from './graceful-abort-tracker.js';
import type { UnnamedRequestTracker } from './unnamed-request-tracker.js';

export function extendRunClient(context: ClientContext, requestId: string, runId: string): ExtRunClient {
    return new ExtRunClient(context, requestId, context.client.baseRun(runId));
}

export function buildExtendedRun(
    gracefulAbortTracker: GracefulAbortTracker,
    requestId: string,
    run: ActorRun,
): ExtendedActorRun {
    const extendedRun: ExtendedActorRun = { ...run, requestId };
    return gracefulAbortTracker.wasAbortedOnGracefulAbort(run)
        ? { ...extendedRun, abortedOnGracefulAbort: true }
        : extendedRun;
}

export function trackRunUpdate(
    context: ClientContext,
    unnamedRequestTracker: UnnamedRequestTracker,
    requestId: string,
    run?: ExtendedActorRun,
): void {
    context.runTracker.updateRun(requestId, run);
    if (run?.status && isRunFailStatus(run.status)) {
        // The request can be resolved again: retrying a failed Run is always allowed.
        unnamedRequestTracker.forget(requestId);
    }
}

export async function refreshStaleRuns(context: ClientContext): Promise<void> {
    const staleRuns = Object.entries(context.runTracker.getStaleRuns(RUN_STALENESS_THRESHOLD_MS));
    if (staleRuns.length === 0) return;

    context.logger.info('Checking the Runs in progress which were not updated recently', {
        requestIds: staleRuns.map(([requestId]) => requestId),
    });

    await Promise.all(
        staleRuns.map(async ([requestId, runInfo]) => {
            try {
                // Getting the Run tracks its update, which refreshes both its status and its `lastUpdatedAt`.
                await context.extendRunClient(requestId, runInfo.runId).get();
            } catch (error) {
                // Mark the Run as updated anyway, to avoid retrying a failing update over and over again.
                context.runTracker.markRunUpdated(requestId);
                context.logger
                    .prefixed(requestId)
                    .error('Error updating the Run status.', { error: stringifyError(error) });
            }
        }),
    );
}
