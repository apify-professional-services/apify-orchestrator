import type { RunStartRequest } from '../../entities/run-start-request.js';
import { AmbiguousRunRequestError } from '../../errors.js';
import type { ExtendedActorRun, RunInfo } from '../../types.js';
import { isRunFailStatus } from '../../utils/apify-client.js';
import { Outcome } from '../../utils/outcome.js';
import type { ClientContext } from '../client-context.js';
import type { UnnamedRequestTracker } from './unnamed-request-tracker.js';

/**
 * Represents the outcome of searching internally for an existing Run by request ID.
 * We may be waiting for the Run to start, or we may have tracked information about the Run.
 */
export class RunSearchOutcome extends Outcome<{
    promise: () => Promise<ExtendedActorRun>;
    runInfo: RunInfo;
    notFound: true;
}> {}

export function searchRunByRequestId(context: ClientContext, requestId: string): RunSearchOutcome {
    // First, check if the Run is currently waiting to start.
    const runPromise = context.runScheduler.findRunStartRequest(requestId);
    if (runPromise) {
        return new RunSearchOutcome({ promise: runPromise });
    }

    // Then, check if there is any info about the Run in the tracker.
    const runInfo = context.runTracker.findRunByRequestId(requestId);
    if (runInfo) {
        return new RunSearchOutcome({ runInfo });
    }

    // Otherwise, a run with this request ID does not exist.
    return new RunSearchOutcome({ notFound: true });
}

export function searchOkRunMatchingRequest(
    context: ClientContext,
    unnamedRequestTracker: UnnamedRequestTracker,
    runRequest: RunStartRequest,
): RunSearchOutcome {
    const { requestId, runName } = runRequest;
    const result = context.searchRunByRequestId(requestId);

    const outcome = result.match<RunSearchOutcome>({
        promise: () => result,
        runInfo: (runInfo) => (isRunFailStatus(runInfo.status) ? new RunSearchOutcome({ notFound: true }) : result),
        notFound: () => result,
    });

    if (runName) return outcome; // Explicit runName: always allow silently joining/reconnecting.

    outcome.match({
        promise: () => {
            // A pending start for this exact request ID can only exist within this same
            // process: the pool is never persisted, so this is always a same-session duplicate.
            throw new AmbiguousRunRequestError(requestId);
        },
        runInfo: () => {
            if (unnamedRequestTracker.wasResolved(requestId)) {
                // This process already resolved this exact request before - a resurrection
                // would have reset the tracker, so this is an ambiguous duplicate.
                throw new AmbiguousRunRequestError(requestId);
            }
            unnamedRequestTracker.markResolved(requestId);
        },
        notFound: () => {
            unnamedRequestTracker.markResolved(requestId);
        },
    });
    return outcome;
}
