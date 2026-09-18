import type { ActorRun } from 'apify-client';

import { ExtRunClient } from '../../clients/run-client.js';
import type { ExtendedActorRun } from '../../types.js';
import { isRunFailStatus } from '../../utils/apify-client.js';
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
