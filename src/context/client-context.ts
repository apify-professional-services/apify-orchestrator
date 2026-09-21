import type { ActorRun } from 'apify-client';

import type { ExtApifyClient } from '../clients/apify-client.js';
import type { ExtRunClient } from '../clients/run-client.js';
import type { RunStartRequest } from '../entities/run-start-request.js';
import { RunScheduler } from '../run-scheduler.js';
import type { TrackedRuns } from '../run-tracker.js';
import { RunTracker } from '../run-tracker.js';
import type { ExtendedActorRun } from '../types.js';
import { GracefulAbortTracker } from './client-context/graceful-abort-tracker.js';
import * as runAborting from './client-context/run-aborting.js';
import type { RunSearchOutcome } from './client-context/run-search.js';
import * as runSearch from './client-context/run-search.js';
import * as runStart from './client-context/run-start.js';
import * as runUpdates from './client-context/run-updates.js';
import { UnnamedRequestTracker } from './client-context/unnamed-request-tracker.js';
import type { OrchestratorContext } from './orchestrator-context.js';

export type { RunSearchOutcome } from './client-context/run-search.js';

export interface ClientContextOptions {
    /**
     * Identifies the client this context belongs to, for instance, when storing its Runs in the Key Value Store.
     */
    clientName: string;

    /**
     * The maximum number of Runs this client may have in progress at the same time. No limit, if undefined.
     */
    maxConcurrentRuns?: number;

    /**
     * The Run state this context tracks. It may be persisted, and therefore restored after a resurrection.
     */
    trackedRuns: TrackedRuns;

    /**
     * Builds the client this context belongs to. It is called once, at the end of the context generation,
     * when every other member is ready: the client is then available to all the components through `client`.
     */
    createClient: (context: ClientContext) => ExtApifyClient;
}

/**
 * Represents the context available to an Apify Client and all its derived clients.
 *
 * It owns all the state belonging to a single client, and the orchestration built on top of it: any component
 * holding the context can reach any other one, the client included.
 */
export interface ClientContext extends OrchestratorContext {
    readonly clientName: string;

    /**
     * The maximum number of Runs this client may have in progress at the same time. No limit, if undefined.
     */
    readonly maxConcurrentRuns?: number;

    /**
     * The client this context belongs to.
     */
    readonly client: ExtApifyClient;

    /**
     * Tracks the Runs started or joined through this client.
     */
    readonly runTracker: RunTracker;

    /**
     * Schedules the Run start requests issued through this client.
     */
    readonly runScheduler: RunScheduler;

    /**
     * Searches for a Run by the ID of the request that asked to start it.
     */
    searchRunByRequestId(requestId: string): RunSearchOutcome;

    /**
     * Searches for a Run in an OK status matching the given request: a Run that failed is reported as not found,
     * because retrying it is always allowed.
     *
     * @throws an `AmbiguousRunRequestError` if the request is unnamed and this process already resolved it.
     */
    searchOkRunMatchingRequest(runRequest: RunStartRequest): RunSearchOutcome;

    /**
     * Finds an existing Run by request ID, or requests to start a new one if none exists,
     * or if the existing one is not in an OK status.
     *
     * @returns a handle to wait for the Run to start.
     */
    findOrRequestRunStart(runRequest: RunStartRequest): () => Promise<ExtendedActorRun>;

    /**
     * Finds an existing Run by request ID, or starts a new one if none exists,
     * or if the existing one is not in an OK status.
     *
     * @returns the new or existing Run after it has started.
     */
    findOrStartRun(runRequest: RunStartRequest): Promise<ExtendedActorRun>;

    /**
     * @returns an extended Run client for the given Run, which tracks every Run update it observes.
     */
    extendRunClient(requestId: string, runId: string): ExtRunClient;

    /**
     * @returns the Run extended with the request ID that started it, and with the `abortedOnGracefulAbort` flag,
     * if the Orchestrator aborted it on a graceful abort.
     */
    buildExtendedRun(requestId: string, run: ActorRun): ExtendedActorRun;

    /**
     * Records a Run update: it updates the Run tracker and the internal bookkeeping.
     * Pass no Run to record that the Run was lost.
     */
    trackRunUpdate(requestId: string, run?: ExtendedActorRun): void;

    /**
     * Checks the status of the Runs which are supposedly in progress, but were not observed recently.
     *
     * The Orchestrator only notices that a Run finished when it observes its status, which normally happens
     * while waiting for it: if nobody waits for a Run, a Run which already finished would hold its slot
     * in the concurrent Runs limit forever, preventing the pending Runs from ever starting.
     */
    refreshStaleRuns(): Promise<void>;

    /**
     * Aborts all the Runs currently tracked by this client, without marking them as aborted on a graceful abort.
     */
    abortAllRuns(): Promise<void>;

    /**
     * Marks all the Runs in progress as aborted by the Orchestrator, then aborts them.
     * It is registered on the Actor's `aborting` event when the `abortAllRunsOnGracefulAbort` option is enabled.
     *
     * @internal
     */
    abortAllRunsOnGracefulAbort(): Promise<void>;

    /**
     * Marks the Runs with the given Run IDs as aborted by the Orchestrator on a graceful abort.
     *
     * It must be called *before* aborting the Runs, to avoid a race with any `waitForFinish` in progress,
     * which could otherwise see the Run as aborted before it is marked here.
     */
    markRunsAbortedOnGracefulAbort(runIds: string[]): void;

    /**
     * @returns `true` if the Run with the given Run ID was aborted by the Orchestrator on a graceful abort.
     */
    wasRunAbortedOnGracefulAbort(runId: string): boolean;
}

export function generateClientContext(
    orchestratorContext: OrchestratorContext,
    { clientName, trackedRuns, maxConcurrentRuns, createClient }: ClientContextOptions,
): ClientContext {
    // These members are built after the context itself, and exposed through the getters below.
    let runTracker: RunTracker | undefined;
    let runScheduler: RunScheduler | undefined;
    let client: ExtApifyClient | undefined;

    // The in-memory bookkeeping is private to the context: it is only reachable through the methods below.
    const gracefulAbortTracker = new GracefulAbortTracker();
    const unnamedRequestTracker = new UnnamedRequestTracker();

    // The type annotation is required: the methods below reference `context` inside its own initializer.
    // Each one delegates to the module implementing it, so that this literal maps the whole context at a glance.
    const context: ClientContext = {
        ...orchestratorContext,
        clientName,
        maxConcurrentRuns,

        get client(): ExtApifyClient {
            return requireInitialized(client, 'client');
        },

        get runTracker(): RunTracker {
            return requireInitialized(runTracker, 'runTracker');
        },

        get runScheduler(): RunScheduler {
            return requireInitialized(runScheduler, 'runScheduler');
        },

        searchRunByRequestId: (requestId) => runSearch.searchRunByRequestId(context, requestId),
        searchOkRunMatchingRequest: (runRequest) =>
            runSearch.searchOkRunMatchingRequest(context, unnamedRequestTracker, runRequest),

        findOrRequestRunStart: (runRequest) => runStart.findOrRequestRunStart(context, runRequest),
        findOrStartRun: async (runRequest) => runStart.findOrStartRun(context, runRequest),

        extendRunClient: (requestId, runId) => runUpdates.extendRunClient(context, requestId, runId),
        buildExtendedRun: (requestId, run) => runUpdates.buildExtendedRun(gracefulAbortTracker, requestId, run),
        trackRunUpdate: (requestId, run) => runUpdates.trackRunUpdate(context, unnamedRequestTracker, requestId, run),
        refreshStaleRuns: async () => runUpdates.refreshStaleRuns(context),

        abortAllRuns: async () => runAborting.abortAllRuns(context),
        abortAllRunsOnGracefulAbort: async () => runAborting.abortAllRunsOnGracefulAbort(context),
        markRunsAbortedOnGracefulAbort: (runIds) => gracefulAbortTracker.markRunsAborted(runIds),
        wasRunAbortedOnGracefulAbort: (runId) => gracefulAbortTracker.wasRunAborted(runId),
    };

    // The construction order matters: these components receive the whole context, but they only use,
    // at construction time, the members inherited from the orchestrator context, which are already available.
    runTracker = new RunTracker(context, trackedRuns);
    runScheduler = new RunScheduler(context);

    runAborting.registerGracefulAbortHook(context);

    // The client is built last: it can use every other member of the context right away.
    client = createClient(context);

    return context;
}

function requireInitialized<T>(member: T | undefined, name: string): T {
    if (!member) {
        throw new Error(`The client context is not fully initialized yet: \`${name}\` is not available.`);
    }
    return member;
}
