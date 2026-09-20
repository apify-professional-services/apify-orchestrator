import { MAIN_LOOP_COOLDOWN_MS, MAIN_LOOP_INTERVAL_MS } from './constants.js';
import type { ClientContext } from './context/client-context.js';
import type { RunStartRequest } from './entities/run-start-request.js';
import { isInsufficientResourcesError } from './errors.js';
import type { ExtendedActorRun } from './types.js';
import { Interval } from './utils/concurrency/interval.js';
import { TryCooldown } from './utils/concurrency/try-cooldown.js';
import { TryGate } from './utils/concurrency/try-gate.js';
import { TryLimit } from './utils/concurrency/try-limit.js';
import { TryLock } from './utils/concurrency/try-lock.js';
import { synchronizedAttempt } from './utils/concurrency/try-sync.js';
import { mergeDictionaries } from './utils/dictionaries.js';
import { stringifyError } from './utils/errors.js';
import { RequestPool } from './utils/request-management/request-pool.js';
import { RequestOutcome } from './utils/request-management/request.js';
import { onActorShuttingDown } from './utils/run-lifecycle.js';
import { isDefined } from './utils/typing.js';

/**
 * Schedules Run start requests.
 *
 * The scheduler runs for the lifetime of the orchestrator and is stopped when the Actor is shutting down.
 */
export class RunScheduler {
    private readonly pool: RequestPool<RunStartRequest, ExtendedActorRun>;

    private readonly exclusiveLock = new TryLock(); // ensures only one request is processed at a time
    private readonly shutdownGate = new TryGate(); // prevents starting new runs during shutdown
    private readonly retryCooldown = new TryCooldown(MAIN_LOOP_COOLDOWN_MS); // cooldown between retries
    private readonly runCountLimit: TryLimit; // limits the number of Runs in progress

    private readonly interval = new Interval(this.attemptProcessingAllRequests.bind(this), MAIN_LOOP_INTERVAL_MS);

    private readonly context: ClientContext;

    constructor(context: ClientContext) {
        this.context = context;
        this.runCountLimit = new TryLimit(context.maxConcurrentRuns ?? Number.POSITIVE_INFINITY, () =>
            context.runTracker.getActiveRunCount(),
        );
        this.pool = new RequestPool<RunStartRequest, ExtendedActorRun>({
            onRequestAdded: (requestId) => this.context.logger.prefixed(requestId).info('Run start scheduled.'),
            onRequestSuccess: (requestId, run) => this.context.trackRunUpdate(requestId, run),
            onRequestFailure: (requestId, error) => {
                this.context.logger.prefixed(requestId).error('Run start failed.', { error: stringifyError(error) });
            },
            onRequestRetried: (requestId, reason) => {
                this.context.logger.prefixed(requestId).warning('Run start will be retried.', {
                    reason: stringifyError(reason),
                    cooldownMs: MAIN_LOOP_COOLDOWN_MS,
                });
            },
        });

        onActorShuttingDown(() => {
            this.interval.stop();
            this.shutdownGate.close();
        });
    }

    /**
     * @returns the promise to wait for the Run to start, or `undefined` if no such Run was requested.
     */
    findRunStartRequest(requestId: string): (() => Promise<ExtendedActorRun>) | undefined {
        const request = this.pool.findRequest(requestId);
        // Prefer `async () => request.wait()` to `request.wait` to avoid unbound method reference.
        return isDefined(request) ? async () => request.wait() : undefined;
    }

    /**
     * Requests starting a Run if one with the given name is not already being started.
     *
     * @returns the promise to wait for the Run to start.
     */
    requestRunStart(runRequest: RunStartRequest): () => Promise<ExtendedActorRun> {
        const request = this.pool.findOrAddRequest(runRequest.requestId, runRequest);
        // Prefer `async () => request.wait()` to `request.wait` to avoid unbound method reference.
        return async () => request.wait();
    }

    /**
     * Starts a new Run if one with the given name is not already being started.
     *
     * @returns the started Run.
     */
    async startRun(runRequest: RunStartRequest): Promise<ExtendedActorRun> {
        const request = this.pool.findOrAddRequest(runRequest.requestId, runRequest);

        // Attempt to process the request immediately, without waiting for the next interval tick.
        // If the attempt fails, the scheduler will try again on the next tick, as usual.
        await synchronizedAttempt(
            async () => request.process(this.processRunRequest.bind(this)),
            [this.exclusiveLock, this.shutdownGate, this.retryCooldown, this.runCountLimit],
        );

        return request.wait();
    }

    /**
     * Try processing all pending requests, one by one.
     */
    private async attemptProcessingAllRequests(): Promise<void> {
        // Lock the processing once at the beginning, to ensure only one attempt is running at a time.
        await this.exclusiveLock.attempt(async () => {
            for (const request of this.pool.getPendingRequests()) {
                const syncOutcome = await synchronizedAttempt(
                    async () => request.process(this.processRunRequest.bind(this)),
                    // Check for shutdown, retry cooldown, and Run count limit between each request.
                    [this.shutdownGate, this.retryCooldown, this.runCountLimit],
                );
                const requestProcessed = syncOutcome.match({ executed: () => true, blocked: () => false });
                // If we get blocked by a synchronizer, we stop processing further requests in this attempt.
                if (!requestProcessed) break;
            }
        });
    }

    private async processRunRequest(request: RunStartRequest): Promise<RequestOutcome<ExtendedActorRun>> {
        const adaptedRequest: RunStartRequest = {
            ...request,
            input: mergeDictionaries(this.context.options.fixedInput, request.input),
        };
        const { requestId } = adaptedRequest;
        try {
            const run = await adaptedRequest.source.start(adaptedRequest.input, adaptedRequest.options);
            return new RequestOutcome({ success: this.context.buildExtendedRun(requestId, run) });
        } catch (error) {
            const parsedError = await adaptedRequest.source.parseRunStartError(
                error,
                requestId,
                adaptedRequest.options,
            );
            const { retryOnInsufficientResources } = this.context.options;
            const shouldRetry = retryOnInsufficientResources && isInsufficientResourcesError(parsedError);
            if (shouldRetry) {
                this.retryCooldown.activate();
                return new RequestOutcome({ retry: parsedError });
            }
            return new RequestOutcome({ failure: parsedError });
        }
    }
}
