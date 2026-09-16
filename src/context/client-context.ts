import type { RunClient } from 'apify-client';

import { ExtRunClient } from '../clients/run-client.js';
import type { RunStartRequest } from '../entities/run-start-request.js';
import { AmbiguousRunRequestError } from '../errors.js';
import { GracefulAbortTracker } from '../graceful-abort-tracker.js';
import { RunScheduler } from '../run-scheduler.js';
import type { TrackedRuns } from '../run-tracker.js';
import { RunTracker } from '../run-tracker.js';
import type { ExtendedActorRun, RunInfo } from '../types.js';
import { isRunFailStatus } from '../utils/apify-client.js';
import { mergeDictionaries } from '../utils/dictionaries.js';
import { Outcome } from '../utils/outcome.js';
import type { OrchestratorContext } from './orchestrator-context.js';

/**
 * Represents the outcome of searching internally for an existing Run by request ID.
 * We may be waiting for the Run to start, or we may have tracked information about the Run.
 */
export class RunSearchOutcome extends Outcome<{
    promise: () => Promise<ExtendedActorRun>;
    runInfo: RunInfo;
    notFound: true;
}> {}

/**
 * Represents the context available to an Apify Client and other derived clients.
 */
export interface ClientContext extends OrchestratorContext {
    readonly runTracker: RunTracker;
    readonly runScheduler: RunScheduler;
    readonly gracefulAbortTracker: GracefulAbortTracker;
    searchRunByRequestId(requestId: string): RunSearchOutcome;
    searchOkRunMatchingRequest(runRequest: RunStartRequest): RunSearchOutcome;
    extendRunClient(requestId: string, runClient: RunClient): ExtRunClient;
}

export function generateClientContext(
    orchestratorContext: OrchestratorContext,
    trackedRuns: TrackedRuns,
): ClientContext {
    const runTracker = new RunTracker(orchestratorContext, trackedRuns);
    const gracefulAbortTracker = new GracefulAbortTracker();
    const runScheduler = new RunScheduler(orchestratorContext, {
        runRequestAdapter: (request) => ({
            ...request,
            input: mergeDictionaries(orchestratorContext.options.fixedInput, request.input),
        }),
        onRunStarted: (requestId, run) => runTracker.updateRun(requestId, run),
    });

    /**
     * Keeps track of unnamed Run start requests resolved by this process for this client.
     * Since it's in memory, it will be reset after a resurrection.
     *
     * If the same unnamed request is resolved twice, we get an ambiguous situation, with two possible scenarios:
     *
     * 1. The user wants to start a new Run.
     * 2. The user wants to point at the existing Run that was started by the first request.
     *
     * Since we cannot know which one is the case, we throw an AmbiguousRunRequestError - unless the Run tied to that
     * request has failed/aborted/timed out, in which case retrying is always allowed.
     */
    const okUnnamedRequestIds = new Set<string>();

    function onRunUpdated(requestId: string, run: ExtendedActorRun | undefined): void {
        runTracker.updateRun(requestId, run);
        if (run?.status && isRunFailStatus(run.status)) {
            okUnnamedRequestIds.delete(requestId);
        }
    }

    return {
        ...orchestratorContext,
        runTracker,
        runScheduler,
        gracefulAbortTracker,

        searchRunByRequestId(requestId: string): RunSearchOutcome {
            // First, check if the Run is currently waiting to start.
            const runPromise = this.runScheduler.findRunStartRequest(requestId);
            if (runPromise) {
                return new RunSearchOutcome({ promise: runPromise });
            }

            // Then, check if there is any info about the Run in the tracker.
            const runInfo = this.runTracker.findRunByRequestId(requestId);
            if (runInfo) {
                return new RunSearchOutcome({ runInfo });
            }

            // Otherwise, a run with this request ID does not exist.
            return new RunSearchOutcome({ notFound: true });
        },

        searchOkRunMatchingRequest(runRequest: RunStartRequest): RunSearchOutcome {
            const { requestId, runName } = runRequest;
            const result = this.searchRunByRequestId(requestId);

            const outcome = result.match<RunSearchOutcome>({
                promise: () => result,
                runInfo: (runInfo) =>
                    isRunFailStatus(runInfo.status) ? new RunSearchOutcome({ notFound: true }) : result,
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
                    if (okUnnamedRequestIds.has(requestId)) {
                        // This process already resolved this exact request before - a resurrection
                        // would have reset this set, so this is an ambiguous duplicate.
                        throw new AmbiguousRunRequestError(requestId);
                    }
                    okUnnamedRequestIds.add(requestId);
                },
                notFound: () => {
                    okUnnamedRequestIds.add(requestId);
                },
            });
            return outcome;
        },

        extendRunClient(requestId: string, runClient: RunClient): ExtRunClient {
            return new ExtRunClient(
                this,
                // Track every Run update.
                { requestId, onUpdate: (run) => onRunUpdated(requestId, run) },
                runClient,
            );
        },
    };
}
