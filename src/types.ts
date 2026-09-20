// This file contains all the public type definitions for the Apify Orchestrator package.
// Private types should go elsewhere.

import { ACTOR_JOB_STATUSES } from '@apify/consts';
import type {
    ActorCallOptions,
    ActorClient,
    ActorLastRunOptions,
    ActorRun,
    ActorStartOptions,
    ApifyClient,
    ApifyClientOptions,
    DatasetClient,
    DatasetClientListItemOptions,
    Dictionary,
    RunClient,
    RunWaitForFinishOptions,
    TaskCallOptions,
    TaskClient,
    TaskLastRunOptions,
    TaskStartOptions,
} from 'apify-client';

import { FAIL_STATUSES, OK_STATUSES, ORCHESTRATOR_RUN_JOB_STATUSES, TERMINAL_STATUSES } from './constants.js';

export interface OrchestratorOptions {
    /**
     * @default true
     */
    enableLogs: boolean;

    /**
     * Hide sensitive data from logs, such as Run IDs and URLs.
     *
     * **WARNING**: if you enable persistence without an encryption key,
     * the user will be able to retrieve the hidden data from the Key Value Store.
     *
     * @default true
     */
    hideSensitiveInformation: boolean;

    /**
     * A callback which is called every time the Orchestrator's status is updated.
     *
     * The callback takes as input a record having Run request IDs as keys, and Run information as values.
     */
    onUpdate?: UpdateCallback;

    /**
     * Which support to use for persistence:
     *
     * - `kvs`: Key Value Store
     * - `none`: disable persistence
     *
     * **WARNING**: persistence may leak sensitive information to the user, such as external runs' IDs.
     * If you don't want the information in the Key Value Store to be readable to anyone having access to it,
     * set a `persistenceEncryptionKey`.
     *
     * @default none
     */
    persistenceSupport: PersistenceSupport;

    /**
     * Used to persist data in the Key Value Store.
     *
     * @default ORCHESTRATOR-
     */
    persistencePrefix: string;

    /**
     * Define an encryption key if you desire to use persistence, while still hiding sensitive information from the user.
     *
     * **WARNING**: if you want to hide sensitive information, also set `hideSensitiveInformation` to true,
     * otherwise such information will be still visible through logs.
     *
     * To allow persistency to work correctly, the same key should be provided upon resurrection.
     *
     * @default undefined
     */
    persistenceEncryptionKey?: string;

    /**
     * Some fixed input parameters to add to each Run.
     *
     * @default undefined
     */
    fixedInput?: Dictionary;

    /**
     * Abort all Runs started by the Orchestrator on graceful abort.
     *
     * Notice that, if disabled, a function that is waiting for a Run to finish
     * may not notice when the orchestrator is aborted and will be killed abruptly.
     *
     * When enabled, by default the methods waiting for one of those Runs, such as `call` and `waitForFinish`,
     * never return: they hang until the process is killed, to prevent the execution of subsequent code after a Run is
     * aborted by the Orchestrator. Set `returnAbortedRunsOnGracefulAbort` to change this behavior.
     *
     * @default true
     */
    abortAllRunsOnGracefulAbort: boolean;

    /**
     * Return the Runs aborted by the Orchestrator on graceful abort, instead of hanging forever.
     *
     * When the Orchestrator aborts the Runs in progress on a graceful abort (see `abortAllRunsOnGracefulAbort`),
     * the methods waiting for one of those Runs, such as `call` and `waitForFinish`, would resolve with an
     * `ABORTED` Run, which is indistinguishable from a Run aborted by a user.
     *
     * If you enable this option, those methods return the aborted Run, with its `abortedOnGracefulAbort` flag
     * set to `true`, so that you can tell the two cases apart and handle them yourself.
     *
     * **WARNING**: by default, this option is disabled, which means that the methods waiting for a Run aborted
     * by the Orchestrator on a graceful abort **never return**: they hang until the Actor's process is killed,
     * at the end of the graceful abort timeout. This is intended: your code is being shut down anyway, and it
     * avoids executing the logic you would run after a successful Run.
     * Enable this option only if you need to perform some clean-up after your Runs have been aborted.
     *
     * This option has no effect if `abortAllRunsOnGracefulAbort` is disabled.
     *
     * @default false
     */
    returnAbortedRunsOnGracefulAbort: boolean;

    /**
     * Whether to automatically retry failed (due to lack of memory/jobs) operations.
     *
     * When enabled, the orchestrator will attempt to retry if something went wrong.
     *
     * @default true
     */
    retryOnInsufficientResources: boolean;
}

/**
 * The main Apify Orchestrator object, allowing to create clients with an internal scheduler and several more features.
 */
export interface ApifyOrchestrator {
    /**
     * Creates a new client object, with an internal scheduler.
     *
     * You can give each client a custom name. If you don't, an automatic name such as `CLIENT-1` is generated.
     *
     * @param options includes the options from `ApifyClientOptions` and `name`
     * @returns the `ScheduledApifyClient` object
     */
    apifyClient: (options?: ExtendedClientOptions) => Promise<ExtendedApifyClient>;
}

export type ExtendedClientOptions = ApifyClientOptions & {
    /**
     * Used to identify a client, for instance, when storing its Runs in the Key Value Store.
     */
    name?: string;

    /**
     * The maximum number of Runs that this client may have in progress at the same time.
     *
     * @default undefined (no limit)
     */
    maxConcurrentRuns?: number;
};

/**
 * Starts the Runs through a scheduler.
 *
 * @extends ApifyClient
 */
export interface ExtendedApifyClient extends ApifyClient {
    readonly clientName: string;

    /**
     * @override
     */
    actor: (id: string) => ExtendedActorClient;

    /**
     * @override
     */
    task: (id: string) => ExtendedTaskClient;

    /**
     * @override
     */
    dataset: <T extends DatasetItem>(id: string) => ExtendedDatasetClient<T>;

    /**
     * @param requestIdOrRunName the request ID returned by `enqueue`, for example, or the run name of your choice
     * @returns a Run client corresponding to the given request ID or Run name, if it exists
     */
    runByRequest: (requestIdOrRunName: string) => Promise<ExtendedRunClient | undefined>;

    /**
     * @param requestIdOrRunName the request ID returned by `enqueue`, for example, or the run name of your choice
     * @returns an ExtendedActorRun object corresponding to the given request ID or Run name, if it exists
     */
    actorRunByRequest: (requestIdOrRunName: string) => Promise<ExtendedActorRun | undefined>;

    /**
     * Searches for the Runs with the given request IDs or Run names.
     *
     * @param requestIdsOrRunNames the request IDs returned by `enqueue`, for example, or the run names of your choice
     * @returns the `ExtendedActorRun` objects of the Runs that were found
     */
    actorRunsByRequest: (...requestIdsOrRunNames: string[]) => Promise<ExtendedActorRun[]>;

    /**
     * Waits for one or more Runs previously started.
     *
     * **NOTE**: if the Orchestrator aborts one of the Runs because the Actor was gracefully aborted
     * (see the `abortAllRunsOnGracefulAbort` option), this method does not return: it hangs until the process is
     * killed, unless the `returnAbortedRunsOnGracefulAbort` option is enabled, in which case it returns the aborted
     * Runs, with their `abortedOnGracefulAbort` flag set to `true`.
     *
     * @param batch an array of `ExtendedActorRun` objects or a list of request IDs or Run names
     * @returns the updated `ExtendedActorRun` objects
     */
    waitForBatchFinish: (batch: ExtendedActorRun[] | string[]) => Promise<ExtendedActorRun[]>;

    /**
     * Stop all the Runs in progress started from this client.
     *
     * If you are currently waiting for any of the Runs to finish, those methods will return them with their status set
     * to `ABORTED`, but without the `abortedOnGracefulAbort` flag.
     */
    abortAllRuns: () => Promise<void>;
}

export interface ExtendedActorStartOptions extends ActorStartOptions {
    runName?: string;
}

export interface ExtendedActorCallOptions extends ActorCallOptions {
    runName?: string;
}

/**
 * An Actor client which enqueues the requests for new Runs, instead of starting them directly.
 *
 * @extends ActorClient
 */
export interface ExtendedActorClient extends ActorClient {
    /**
     * Enqueues one or more requests for new Runs, and return immediately.
     *
     * @param runRequests the requests
     * @returns the future request IDs of the Runs
     */
    enqueue: (...runRequests: ActorRunRequest[]) => string[];

    /**
     * Enqueues one or more requests for new Runs, given the parameters to generate input batches.
     *
     * WARNING: with the current implementation, input splitting may be quite slow.
     *
     * @param namePrefix the prefix for each Run's name; if just one Run is enqueued, it is the full name
     * @param sources an array used to generate the input batches
     * @param inputGenerator the function used to generate the input batches
     * @param overrideSplitRules the rules for splitting
     * @param options the options for starting the Runs
     * @returns the future names of the Runs
     */
    enqueueBatch: <T>(
        namePrefix: string,
        sources: T[],
        inputGenerator: (chunk: T[]) => Dictionary,
        overrideSplitRules?: Partial<SplitRules>,
        options?: ActorStartOptions,
    ) => string[];

    /**
     * @override
     */
    start: (input?: object, options?: ExtendedActorStartOptions) => Promise<ExtendedActorRun>;

    /**
     * Starts one or more Runs, based on an array of requests.
     */
    startRuns: (...runRequests: ActorRunRequest[]) => Promise<ExtendedActorRun[]>;

    /**
     * Starts one or more requests for new Runs, given the parameters to generate input batches.
     *
     * WARNING: with the current implementation, input splitting may be quite slow.
     *
     * @param namePrefix the prefix for each Run's name; if just one Run is started, it is the full name
     * @param sources an array used to generate the input batches
     * @param inputGenerator the function used to generate the input batches
     * @param overrideSplitRules the rules for splitting
     * @param options the options for starting the Runs
     * @returns the started Runs
     */
    startBatch: <T>(
        namePrefix: string,
        sources: T[],
        inputGenerator: (chunk: T[]) => Dictionary,
        overrideSplitRules?: Partial<SplitRules>,
        options?: ActorStartOptions,
    ) => Promise<ExtendedActorRun[]>;

    /**
     * **NOTE**: if the Orchestrator aborts the Run because the Actor was gracefully aborted
     * (see the `abortAllRunsOnGracefulAbort` option), this method does not return: it hangs until the process is
     * killed, unless the `returnAbortedRunsOnGracefulAbort` option is enabled, in which case it returns the aborted
     * Run, with its `abortedOnGracefulAbort` flag set to `true`.
     *
     * @override
     */
    call: (input?: object, options?: ExtendedActorCallOptions) => Promise<ExtendedActorRun>;

    /**
     * Starts and waits for one or more Runs, based on an array of requests.
     *
     * **NOTE**: if the Orchestrator aborts one of the Runs because the Actor was gracefully aborted
     * (see the `abortAllRunsOnGracefulAbort` option), this method does not return: it hangs until the process is
     * killed, unless the `returnAbortedRunsOnGracefulAbort` option is enabled, in which case it returns the aborted
     * Runs, with their `abortedOnGracefulAbort` flag set to `true`.
     */
    callRuns: (...runRequests: ActorRunRequest[]) => Promise<ExtendedActorRun[]>;

    /**
     * Starts and waits for one or more requests for new Runs, given the parameters to generate input batches.
     *
     * WARNING: with the current implementation, input splitting may be quite slow.
     *
     * @param namePrefix the prefix for each Run's name; if just one Run is started, it is the full name
     * @param sources an array used to generate the input batches
     * @param inputGenerator the function used to generate the input batches
     * @param overrideSplitRules the rules for splitting
     * @param options the options for starting the Runs
     * @returns the finished Runs
     *
     * **NOTE**: if the Orchestrator aborts one of the Runs because the Actor was gracefully aborted
     * (see the `abortAllRunsOnGracefulAbort` option), this method does not return: it hangs until the process is
     * killed, unless the `returnAbortedRunsOnGracefulAbort` option is enabled, in which case it returns the aborted
     * Runs, with their `abortedOnGracefulAbort` flag set to `true`.
     */
    callBatch: <T>(
        namePrefix: string,
        sources: T[],
        inputGenerator: (chunk: T[]) => Dictionary,
        overrideSplitRules?: Partial<SplitRules>,
        options?: ActorStartOptions,
    ) => Promise<ExtendedActorRun[]>;

    /**
     * If it finds the Run it in the Runs records, it returns a `TrackedRunClient` instead of a `RunClient`,
     * allowing for tracking an logging Run operations.
     *
     * @override
     */
    lastRun: (options?: ActorLastRunOptions) => RunClient | ExtendedRunClient;
}

export interface ExtendedTaskStartOptions extends TaskStartOptions {
    runName?: string;
}

export interface ExtendedTaskCallOptions extends TaskCallOptions {
    runName?: string;
}

/**
 * A Task client which enqueues the requests for new Runs, instead of starting them directly.
 *
 * @extends TaskClient
 */
export interface ExtendedTaskClient extends TaskClient {
    /**
     * Enqueues one or more requests for new Runs, and return immediately.
     *
     * @param runRequests the requests
     * @returns the future names of the Runs
     */
    enqueue: (...runRequests: ActorRunRequest[]) => string[];

    /**
     * Enqueues one or more requests for new Runs, given the parameters to generate input batches.
     *
     * WARNING: with the current implementation, input splitting may be quite slow.
     *
     * @param namePrefix the prefix for each Run's name; if just one Run is enqueued, it is the full name
     * @param sources an array used to generate the input batches
     * @param inputGenerator the function used to generate the input batches
     * @param overrideSplitRules the rules for splitting
     * @param options the options for starting the Runs
     * @returns the future names of the Runs
     */
    enqueueBatch: <T>(
        namePrefix: string,
        sources: T[],
        inputGenerator: (chunk: T[]) => Dictionary,
        overrideSplitRules?: Partial<SplitRules>,
        options?: TaskStartOptions,
    ) => string[];

    /**
     * @override
     */
    start: (input?: Dictionary, options?: ExtendedTaskStartOptions) => Promise<ExtendedActorRun>;

    /**
     * Starts one or more Runs, based on an array of requests.
     */
    startRuns: (...runRequests: TaskRunRequest[]) => Promise<ExtendedActorRun[]>;

    /**
     * Starts one or more requests for new Runs, given the parameters to generate input batches.
     *
     * WARNING: with the current implementation, input splitting may be quite slow.
     *
     * @param namePrefix the prefix for each Run's name; if just one Run is started, it is the full name
     * @param sources an array used to generate the input batches
     * @param inputGenerator the function used to generate the input batches
     * @param overrideSplitRules the rules for splitting
     * @param options the options for starting the Runs
     * @returns the started Runs
     */
    startBatch: <T>(
        namePrefix: string,
        sources: T[],
        inputGenerator: (chunk: T[]) => Dictionary,
        overrideSplitRules?: Partial<SplitRules>,
        options?: TaskStartOptions,
    ) => Promise<ExtendedActorRun[]>;

    /**
     * **NOTE**: if the Orchestrator aborts the Run because the Actor was gracefully aborted
     * (see the `abortAllRunsOnGracefulAbort` option), this method does not return: it hangs until the process is
     * killed, unless the `returnAbortedRunsOnGracefulAbort` option is enabled, in which case it returns the aborted
     * Run, with its `abortedOnGracefulAbort` flag set to `true`.
     *
     * @override
     */
    call: (input?: Dictionary, options?: ExtendedTaskCallOptions) => Promise<ExtendedActorRun>;

    /**
     * Starts and waits for one or more Runs, based on an array of requests.
     *
     * **NOTE**: if the Orchestrator aborts one of the Runs because the Actor was gracefully aborted
     * (see the `abortAllRunsOnGracefulAbort` option), this method does not return: it hangs until the process is
     * killed, unless the `returnAbortedRunsOnGracefulAbort` option is enabled, in which case it returns the aborted
     * Runs, with their `abortedOnGracefulAbort` flag set to `true`.
     */
    callRuns: (...runRequests: TaskRunRequest[]) => Promise<ExtendedActorRun[]>;

    /**
     * Starts and waits for one or more requests for new Runs, given the parameters to generate input batches.
     *
     * WARNING: with the current implementation, input splitting may be quite slow.
     *
     * @param namePrefix the prefix for each Run's name; if just one Run is started, it is the full name
     * @param sources an array used to generate the input batches
     * @param inputGenerator the function used to generate the input batches
     * @param overrideSplitRules the rules for splitting
     * @param options the options for starting the Runs
     * @returns the finished Runs
     *
     * **NOTE**: if the Orchestrator aborts one of the Runs because the Actor was gracefully aborted
     * (see the `abortAllRunsOnGracefulAbort` option), this method does not return: it hangs until the process is
     * killed, unless the `returnAbortedRunsOnGracefulAbort` option is enabled, in which case it returns the aborted
     * Runs, with their `abortedOnGracefulAbort` flag set to `true`.
     */
    callBatch: <T>(
        namePrefix: string,
        sources: T[],
        inputGenerator: (chunk: T[]) => Dictionary,
        overrideSplitRules?: Partial<SplitRules>,
        options?: TaskStartOptions,
    ) => Promise<ExtendedActorRun[]>;

    /**
     * If it finds the Run it in the Runs records, it returns a `TrackedRunClient` instead of a `RunClient`,
     * allowing for tracking an logging Run operations.
     *
     * @override
     */
    lastRun: (options?: TaskLastRunOptions) => RunClient | ExtendedRunClient;
}

/**
 * A Run Client which tracks and logs any operation regarding the Run.
 *
 * @extends RunClient
 */
export interface ExtendedRunClient extends RunClient {
    /**
     * Waits for the Run to finish.
     *
     * **NOTE**: if the Orchestrator aborts the Run because the Actor was gracefully aborted
     * (see the `abortAllRunsOnGracefulAbort` option), this method does not return: it hangs until the process is
     * killed, unless the `returnAbortedRunsOnGracefulAbort` option is enabled, in which case it returns the aborted
     * Run, with its `abortedOnGracefulAbort` flag set to `true`.
     *
     * @override
     */
    waitForFinish: (options?: RunWaitForFinishOptions) => Promise<ExtendedActorRun>;
}

/**
 * A Dataset client allowing to iterate over the items in the dataset, automatically paginated.
 *
 * @extends DatasetClient
 */
export interface ExtendedDatasetClient<T extends DatasetItem> extends DatasetClient<T> {
    /**
     * Iterates over the items in the dataset as they become available, polling the run status
     * at a regular interval and yielding any new items found at each poll.
     *
     * The option `chunkSize` will help avoiding the JavaScript's string limit when deserializing the content.
     * The default value is 100 items.
     *
     * The option `pollIntervalSecs` allows customizing how frequently to call the API to check for new items.
     * The default value is 10 seconds.
     *
     * Once the run reaches a terminal status, any remaining items are drained page-by-page until
     * no more are returned.
     *
     * The dataset can only be traversed in ascending order, from oldest to newest items.
     *
     * @param options the greedy listing options, including `chunkSize` and `pollIntervalSecs`
     * @returns an `AsyncGenerator` which iterates the items in the dataset
     *
     * @example
     * const datasetIterator = datasetClient.greedyListItems({ chunkSize: 100 });
     * for await (const item of datasetIterator) {
     *     console.log(item.title);
     * }
     */
    greedyListItems: (options?: GreedyListItemsOptions) => AsyncGenerator<T, void, void>;
}

/**
 * - `kvs`: will store the values in the Key Value Store
 * - `none`: will keep the values in memory
 */
export type PersistenceSupport = 'kvs' | 'none';

/**
 * A request to be enqueued by the `QueuedActorClient`.
 */
export interface ActorRunRequest {
    runName?: string;
    input?: Dictionary;
    options?: ActorStartOptions;
}

/**
 * A request to be enqueued by the `ExtTaskClient`.
 */
export interface TaskRunRequest {
    runName?: string;
    input?: Dictionary;
    options?: TaskStartOptions;
}

export interface ExtendedActorRun extends ActorRun {
    /**
     * The ID of the request that started this Run: the `runName` provided by the user, or a generated hash.
     */
    requestId: string;

    /**
     * `true` if this Run was aborted by the Orchestrator because the Actor was gracefully aborted
     * (see the `abortAllRunsOnGracefulAbort` option); `undefined` in any other case, including when the Run
     * was aborted by a user.
     *
     * Notice that the methods waiting for a Run to finish, such as `call` and `waitForFinish`, return an
     * `ExtendedActorRun` with this flag only if the `returnAbortedRunsOnGracefulAbort` option is enabled:
     * otherwise, they never return.
     */
    abortedOnGracefulAbort?: true;
}

/**
 * A generic definition of a dataset item.
 *
 * When defining a custom item interface in TypeScript, you should extend this type:
 *
 * ```js
 * interface MyItem extends DatasetItem {
 *     value: number
 *     timestamp: string
 * }
 * ```
 */
export type DatasetItem = Record<string | number, unknown>;

/**
 * Options for listing items from a dataset in ascending order, omitting the `desc` option.
 */
export type DatasetClientListSortedItemOptions = Omit<DatasetClientListItemOptions, 'desc'>;

/**
 * Options for to greedily list items from a dataset, with automatic pagination and polling for new items.
 * The dataset can only be traversed in ascending order, from oldest to newest items.
 */
export type GreedyListItemsOptions = DatasetClientListSortedItemOptions & {
    /**
     * Check the run's status regularly at the specified interval, in seconds.
     *
     * @default 10
     */
    pollIntervalSecs?: number;
};

export interface SplitRules {
    /**
     * Make so that each input, when serialized, is lower in size than 9,437,184 bytes.
     */
    respectApifyMaxPayloadSize?: boolean;
}

export type UpdateCallback = (
    report: Record<string, RunInfo>,
    lastChangedRunRequestId?: string,
    lastChangedRun?: ExtendedActorRun,
) => unknown;

/**
 * Represents the status of a Run job on the Apify platform (`act2Builds` and `act2Runs`).
 */
export type PlatformRunJobStatus = (typeof ACTOR_JOB_STATUSES)[keyof typeof ACTOR_JOB_STATUSES];
/**
 * Represents the status of a Run job that exists only within the orchestrator context.
 */
export type OrchestratorRunStatus = (typeof ORCHESTRATOR_RUN_JOB_STATUSES)[keyof typeof ORCHESTRATOR_RUN_JOB_STATUSES];
/**
 * Represents any kind of Run job status, whether it belongs to the Apify platform or exists only within the orchestrator context.
 */
export type RunStatus = PlatformRunJobStatus | OrchestratorRunStatus;

export type RunOkStatus = (typeof OK_STATUSES)[number];
export type RunFailStatus = (typeof FAIL_STATUSES)[number];
export type RunTerminalStatus = (typeof TERMINAL_STATUSES)[number];

export interface RunInfo {
    runId: string;
    runUrl: string;
    status: RunStatus;
    startedAt: string;
}
