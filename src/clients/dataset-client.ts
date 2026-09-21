import { ActorRun, DatasetClient } from 'apify-client';

import type { OrchestratorContext } from '../context/orchestrator-context.js';
import type {
    DatasetClientListSortedItemOptions,
    DatasetItem,
    ExtendedDatasetClient,
    GreedyListItemsOptions,
} from '../types.js';
import { isRunTerminalStatus } from '../utils/apify-client.js';
import { isDefined } from '../utils/typing.js';

const DEFAULT_CHUNK_SIZE = 100;
const DEFAULT_POLL_INTERVAL_SECS = 10;

export class ExtDatasetClient<T extends DatasetItem> extends DatasetClient<T> implements ExtendedDatasetClient<T> {
    private readonly context: OrchestratorContext;

    /**
     * @internal
     */
    constructor(context: OrchestratorContext, datasetClient: DatasetClient) {
        super({
            baseUrl: datasetClient.baseUrl,
            publicBaseUrl: datasetClient.publicBaseUrl,
            apifyClient: datasetClient.apifyClient,
            httpClient: datasetClient.httpClient,
            id: datasetClient.id,
            params: datasetClient.params,
        });
        this.context = context;
    }

    private async getAssociatedRun(): Promise<ActorRun | null> {
        const dataset = await this.get();
        if (!isDefined(dataset?.actRunId)) {
            this.context.logger.error('Error getting Dataset while fetching run status', { id: this.id });
            return null;
        }

        const run = await this.apifyClient.run(dataset.actRunId).get();
        if (!isDefined(run)) {
            this.context.logger.error('Error getting Run while fetching run status', { id: this.id });
            return null;
        }

        return run;
    }

    private async listNextPage(options: DatasetClientListSortedItemOptions, readItemsCount: number) {
        const { offset = 0, limit = 0, chunkSize = DEFAULT_CHUNK_SIZE } = options;
        const pageSize = computeNextPageSize(limit, chunkSize, readItemsCount);
        return super.listItems({
            ...options,
            offset: offset + readItemsCount,
            limit: pageSize,
        });
    }

    async *greedyListItems(options: GreedyListItemsOptions = {}): AsyncGenerator<T, void, void> {
        const { pollIntervalSecs = DEFAULT_POLL_INTERVAL_SECS, ...listOptions } = options;
        const { limit = 0, chunkSize = DEFAULT_CHUNK_SIZE } = listOptions;
        this.context.logger.info('Greedily iterating Dataset', { chunkSize }, { url: this.url });

        let readItemsCount = 0;
        let isRunFinished = false;

        // Poll the run status and fetch newly available items at each interval.
        while (true) {
            if (!isRunFinished) {
                const run = await this.getAssociatedRun();
                if (!isDefined(run)) return;
                isRunFinished = isRunTerminalStatus(run.status);
            }

            const itemList = await this.listNextPage(listOptions, readItemsCount);
            readItemsCount += itemList.count;
            for (const item of itemList.items) {
                yield item;
            }

            const isLimitReached = limit > 0 && readItemsCount >= limit;
            const isDatasetExhausted = isRunFinished && itemList.count === 0;
            if (isDatasetExhausted || isLimitReached) break;

            if (!isRunFinished) {
                await new Promise<void>((resolve) => {
                    setTimeout(resolve, pollIntervalSecs * 1000);
                });
            }
        }
    }
}

function computeNextPageSize(limit: number, chunkSize: number, readItemsCount: number): number {
    if (limit > 0 && readItemsCount >= limit) throw new Error('Read items count has reached the limit.');
    if (limit === 0) return chunkSize;
    const remainingCount = limit - readItemsCount;
    if (chunkSize === 0) return remainingCount;
    return Math.min(chunkSize, remainingCount);
}
