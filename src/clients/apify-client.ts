import { Actor } from 'apify';
import type { ApifyClientOptions, RunClient } from 'apify-client';
import { ApifyClient } from 'apify-client';

import type { ClientContext } from '../context/client-context.js';
import { type RunStartRequest } from '../entities/run-start-request.js';
import type { DatasetItem, ExtendedActorRun, ExtendedApifyClient, RunInfo } from '../types.js';
import { isRunTerminalStatus } from '../utils/apify-client.js';
import { isDefined } from '../utils/typing.js';
import { ExtActorClient } from './actor-client.js';
import { ExtDatasetClient } from './dataset-client.js';
import type { ExtRunClient } from './run-client.js';
import { ExtTaskClient } from './task-client.js';

export class ExtApifyClient extends ApifyClient implements ExtendedApifyClient {
    public readonly clientName: string;
    private readonly context: ClientContext;

    /**
     * @internal
     */
    constructor(clientName: string, context: ClientContext, superClientOptions: ApifyClientOptions) {
        super(superClientOptions);
        this.clientName = clientName;
        this.context = context;

        if (context.options.abortAllRunsOnGracefulAbort) {
            Actor.on('aborting', this.abortAllRunsOnGracefulAbort.bind(this));
        }
    }

    override actor(id: string): ExtActorClient {
        return new ExtActorClient(this.context, this, super.actor(id));
    }

    override task(id: string): ExtTaskClient {
        return new ExtTaskClient(this.context, this, super.task(id));
    }

    override dataset<T extends DatasetItem>(id: string): ExtDatasetClient<T> {
        return new ExtDatasetClient<T>(this.context, super.dataset(id));
    }

    override run(id: string): RunClient {
        const requestId = this.context.runTracker.findRunRequestId(id);
        const runClient = super.run(id);
        return isDefined(requestId) ? this.context.extendRunClient(requestId, runClient) : runClient;
    }

    async runByRequest(requestId: string): Promise<ExtRunClient | undefined> {
        return this.context.searchRunByRequestId(requestId).match({
            promise: async (waitForStart) =>
                waitForStart().then((run) => this.context.extendRunClient(requestId, super.run(run.id))),
            runInfo: async (runInfo) => this.context.extendRunClient(requestId, super.run(runInfo.runId)),
            notFound: () => undefined,
        });
    }

    async actorRunByRequest(requestId: string): Promise<ExtendedActorRun | undefined> {
        return this.context.searchRunByRequestId(requestId).match({
            promise: async (waitForStart) => waitForStart(),
            runInfo: async (runInfo) => this.context.extendRunClient(requestId, super.run(runInfo.runId)).get(),
            notFound: () => undefined,
        });
    }

    async actorRunsByRequest(...requestIds: string[]): Promise<ExtendedActorRun[]> {
        const runs = await Promise.all(requestIds.map(async (requestId) => this.actorRunByRequest(requestId)));
        return runs.filter(isDefined);
    }

    async waitForBatchFinish(batch: ExtendedActorRun[] | string[]): Promise<ExtendedActorRun[]> {
        const runs = isStringArray(batch) ? await this.actorRunsByRequest(...batch) : batch;
        this.context.logger.info('Waiting for batch', { requestIds: runs.map(({ requestId }) => requestId) });

        return Promise.all(
            runs.map(async (run) => this.context.extendRunClient(run.requestId, super.run(run.id)).waitForFinish()),
        );
    }

    async abortAllRuns(): Promise<void> {
        await this.abortRuns(this.context.runTracker.getCurrentRuns());
    }

    private async abortAllRunsOnGracefulAbort(): Promise<void> {
        const currentRuns = this.context.runTracker.getCurrentRuns();
        const abortedRunIds = Object.values(currentRuns)
            // A Run that already finished, in any way, is not being aborted by the Orchestrator.
            .filter((runInfo) => !isRunTerminalStatus(runInfo.status))
            .map((runInfo) => runInfo.runId);
        this.context.gracefulAbortTracker.markRunsAborted(abortedRunIds);
        await this.abortRuns(currentRuns);
    }

    private async abortRuns(currentRuns: { [requestId: string]: RunInfo }): Promise<void> {
        this.context.logger.info('Aborting Runs', { currentRunNames: Object.keys(currentRuns) });
        await Promise.all(
            Object.entries(currentRuns).map(async ([requestId, runInfo]) => {
                const runClient = this.context.extendRunClient(requestId, super.run(runInfo.runId));
                this.context.logger.prefixed(requestId).info('Aborting Run', {}, { url: runInfo.runUrl });
                await runClient.abort().catch((error) => {
                    this.context.logger.prefixed(requestId).error('Error aborting Run', { error });
                });
            }),
        );
    }

    /** @internal */
    extendedRunClient(requestId: string, runId: string): ExtRunClient {
        const runClient = super.run(runId);
        return this.context.extendRunClient(requestId, runClient);
    }

    /**
     * Finds an existing Run by name or requests to start a new one if none exists or the existing one is not in an OK status.
     *
     * @returns a handle to wait for the Run to start.
     *
     * @internal
     */
    findOrRequestRunStart(runRequest: RunStartRequest): () => Promise<ExtendedActorRun> {
        return this.context.searchOkRunMatchingRequest(runRequest).match({
            promise: (waitForStart) => waitForStart,
            runInfo:
                ({ runId }) =>
                async () =>
                    this.getRunObjectOrStartNew(runRequest, runId),
            notFound: () => this.context.runScheduler.requestRunStart(runRequest),
        });
    }

    /**
     * Finds an existing Run by name or starts a new one if none exists or the existing one is not in an OK status.
     *
     * @returns the new or existing Run after it has started.
     *
     * @internal
     */
    async findOrStartRun(runRequest: RunStartRequest): Promise<ExtendedActorRun> {
        return this.context.searchOkRunMatchingRequest(runRequest).match({
            promise: async (waitForStart) => waitForStart(),
            runInfo: async ({ runId }) => this.getRunObjectOrStartNew(runRequest, runId),
            notFound: async () => this.context.runScheduler.startRun(runRequest),
        });
    }

    private async getRunObjectOrStartNew(
        runRequest: RunStartRequest,
        existingRunId: string,
    ): Promise<ExtendedActorRun> {
        const existingRun = await this.context.extendRunClient(runRequest.requestId, super.run(existingRunId)).get();
        if (existingRun) return existingRun;
        // If the Run client could not retrieve the Run object, we proceed to start a new one.
        return this.context.runScheduler.startRun(runRequest);
    }
}

function isStringArray(array: ExtendedActorRun[] | string[]): array is string[] {
    return array.every((item) => typeof item === 'string');
}
