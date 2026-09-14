import { ActorRun, DatasetClient } from 'apify-client';

import type { OrchestratorContext } from '../context/orchestrator-context.js';
import type {
    DatasetClientListSortedItemOptions,
    DatasetItem,
    ExtendedDatasetClient,
    GreedyListItemsBatchedOptions,
    GreedyListItemsOptions,
    ListItemsBatchedOptions,
} from '../types.js';
import { isRunTerminalStatus } from '../utils/apify-client.js';
import { iterateBatches } from '../utils/iterators.js';
import { isDefined } from '../utils/typing.js';

const GREEDY_DEFAULT_OPTIONS = {
    CHUNK_SIZE: 100,
    POLL_INTERVAL_SECS: 10,
} as const;

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
        const { offset = 0, limit, chunkSize, ...otherOptions } = options;
        const pageSize = computeNextPageSize(readItemsCount, limit, chunkSize);
        return super.listItems({
            ...otherOptions,
            offset: offset + readItemsCount,
            limit: pageSize,
        });
    }

    async *greedyListItems(greedyOptions: GreedyListItemsOptions = {}): AsyncGenerator<T, void, void> {
        const { pollIntervalSecs = GREEDY_DEFAULT_OPTIONS.POLL_INTERVAL_SECS, ...userListOptions } = greedyOptions;
        const listOptions = { ...userListOptions, chunkSize: computeGreedyChunkSize(userListOptions.chunkSize) };
        this.context.logger.info('Greedily iterating Dataset', { chunkSize: listOptions.chunkSize }, { url: this.url });

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

            const isLimitReached = isDefined(listOptions.limit) && readItemsCount >= listOptions.limit;
            const isDatasetExhausted = isRunFinished && itemList.count === 0;
            if (isDatasetExhausted || isLimitReached) break;

            if (!isRunFinished) {
                await new Promise<void>((resolve) => {
                    setTimeout(resolve, pollIntervalSecs * 1000);
                });
            }
        }
    }

    async *listItemsBatched(options: ListItemsBatchedOptions = {}): AsyncGenerator<T[], void, void> {
        const { batchSize, ...listOptions } = options;
        const itemsPerBatch = computeBatchSize(batchSize, listOptions.chunkSize);
        this.context.logger.info('Iterating Dataset in batches', { batchSize: itemsPerBatch }, { url: this.url });

        for await (const batch of iterateBatches(super.listItems(listOptions), itemsPerBatch)) {
            yield batch;
        }
    }

    async *greedyListItemsBatched(options: GreedyListItemsBatchedOptions = {}): AsyncGenerator<T[], void, void> {
        const { batchSize, ...greedyOptions } = options;
        // Pass chunkSize as undefined if it is 0, since it's used to indicate no pagination.
        const itemsPerBatch = computeBatchSize(batchSize, greedyOptions.chunkSize || undefined);
        this.context.logger.info(
            'Greedily iterating Dataset in batches',
            { batchSize: itemsPerBatch },
            { url: this.url },
        );

        for await (const batch of iterateBatches(this.greedyListItems(greedyOptions), itemsPerBatch)) {
            yield batch;
        }
    }
}

function computeGreedyChunkSize(chunkSize: number | undefined): number | undefined {
    // apify-client treats chunkSize === undefined as no pagination.
    // On the other hand, apify-client forbids chunkSize = 0.
    // We set a default chunk size for greedy operations, so we allow setting chunkSize = 0 to indicate no pagination.
    if (chunkSize === 0) return undefined;
    return chunkSize ?? GREEDY_DEFAULT_OPTIONS.CHUNK_SIZE;
}

function computeNextPageSize(
    readItemsCount: number,
    limit: number | undefined,
    chunkSize: number | undefined,
): number | undefined {
    if (!isDefined(limit) && !isDefined(chunkSize)) return undefined;
    if (!isDefined(limit)) return chunkSize;
    if (limit > 0 && readItemsCount >= limit) throw new Error('Read items count has reached the limit.');
    const remainingCount = limit - readItemsCount;
    if (!isDefined(chunkSize)) return remainingCount;
    return Math.min(chunkSize, remainingCount);
}

function computeBatchSize(batchSize: number | undefined, chunkSize: number | undefined): number {
    // We fallback to chunkSize only if it is greater than 0.
    const size = batchSize ?? (chunkSize || GREEDY_DEFAULT_OPTIONS.CHUNK_SIZE);
    if (!Number.isInteger(size) || size <= 0) throw new Error('The batch size must be a positive integer.');
    return size;
}
