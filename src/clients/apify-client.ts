import type { ApifyClientOptions, RunClient } from 'apify-client';
import { ApifyClient } from 'apify-client';

import type { ClientContext } from '../context/client-context.js';
import type { DatasetItem, ExtendedActorRun, ExtendedApifyClient } from '../types.js';
import { isDefined } from '../utils/typing.js';
import { ExtActorClient } from './actor-client.js';
import { ExtDatasetClient } from './dataset-client.js';
import type { ExtRunClient } from './run-client.js';
import { ExtTaskClient } from './task-client.js';

export class ExtApifyClient extends ApifyClient implements ExtendedApifyClient {
    private readonly context: ClientContext;

    /**
     * @internal
     */
    constructor(context: ClientContext, superClientOptions: ApifyClientOptions) {
        super(superClientOptions);
        this.context = context;
    }

    get clientName(): string {
        return this.context.clientName;
    }

    override actor(id: string): ExtActorClient {
        return new ExtActorClient(this.context, super.actor(id));
    }

    override task(id: string): ExtTaskClient {
        return new ExtTaskClient(this.context, super.task(id));
    }

    override dataset<T extends DatasetItem>(id: string): ExtDatasetClient<T> {
        return new ExtDatasetClient<T>(this.context, super.dataset(id));
    }

    override run(id: string): RunClient {
        const requestId = this.context.runTracker.findRunRequestId(id);
        return isDefined(requestId) ? this.context.extendRunClient(requestId, id) : super.run(id);
    }

    /**
     * Builds a plain Run client, bypassing the `run` override: it is how the context obtains the Run clients
     * it extends, since `ApifyClient` offers no other way to build one.
     *
     * @internal
     */
    baseRun(id: string): RunClient {
        return super.run(id);
    }

    async runByRequest(requestId: string): Promise<ExtRunClient | undefined> {
        return this.context.searchRunByRequestId(requestId).match({
            promise: async (waitForStart) =>
                waitForStart().then((run) => this.context.extendRunClient(requestId, run.id)),
            runInfo: async (runInfo) => this.context.extendRunClient(requestId, runInfo.runId),
            notFound: () => undefined,
        });
    }

    async actorRunByRequest(requestId: string): Promise<ExtendedActorRun | undefined> {
        return this.context.searchRunByRequestId(requestId).match({
            promise: async (waitForStart) => waitForStart(),
            runInfo: async (runInfo) => this.context.extendRunClient(requestId, runInfo.runId).get(),
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
            runs.map(async (run) => this.context.extendRunClient(run.requestId, run.id).waitForFinish()),
        );
    }

    async abortAllRuns(): Promise<void> {
        await this.context.abortAllRuns();
    }
}

function isStringArray(array: ExtendedActorRun[] | string[]): array is string[] {
    return array.every((item) => typeof item === 'string');
}
