import { DatasetClient } from 'apify-client';

import { ACTOR_JOB_TERMINAL_STATUSES } from '@apify/consts';

import type { OrchestratorContext } from '../context/orchestrator-context.js';
import type { DatasetItem, ExtendedDatasetClient, GreedyIterateOptions, IterateOptions } from '../types.js';
import { isDefined } from '../utils/typing.js';

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

    private async *fetchBatches(options: IterateOptions = {}): AsyncGenerator<T[], void, void> {
        const { pageSize, ...listItemOptions } = options;

        if (pageSize) {
            let offset = 0;
            let currentPage = await super.listItems({ ...listItemOptions, offset, limit: pageSize });
            while (currentPage.items.length > 0) {
                yield currentPage.items;

                offset += pageSize;
                currentPage = await super.listItems({ offset, limit: pageSize });
            }
        } else {
            const itemList = await super.listItems(listItemOptions);
            yield itemList.items;
        }
    }

    async *iterate(options: IterateOptions = {}): AsyncGenerator<T, void, void> {
        const { pageSize } = options;
        this.context.logger.info('Iterating Dataset', { pageSize }, { url: this.url });

        let totalItems = 0;

        for await (const batch of this.fetchBatches(options)) {
            totalItems += batch.length;
            for (const item of batch) {
                yield item;
            }
        }

        this.context.logger.info('Finished reading dataset', { totalItems }, { url: this.url });
    }

    async *iterateBatched(options: IterateOptions = {}): AsyncGenerator<T[], void, void> {
        const { pageSize } = options;
        this.context.logger.info('Iterating Dataset in batches', { pageSize }, { url: this.url });

        let totalItems = 0;

        for await (const batch of this.fetchBatches(options)) {
            totalItems += batch.length;
            if (batch.length > 0) {
                yield batch;
            }
        }

        this.context.logger.info('Finished reading dataset in batches', { totalItems }, { url: this.url });
    }

    /**
     * Polls the associated run and yields pages of newly available items until the run reaches a
     * terminal status, then drains any remaining pages.
     */
    private async *greedyFetchBatches(options: GreedyIterateOptions = {}): AsyncGenerator<T[], void, void> {
        const { pageSize = 100, pollIntervalSecs = 10, ...listItemOptions } = options;

        let readItemsCount = 0;

        // Poll the run status and fetch newly available items at each interval.
        while (true) {
            const dataset = await this.get();
            if (!isDefined(dataset?.actRunId)) {
                this.context.logger.error('Error getting Dataset while iterating greedily', { id: this.id });
                return;
            }

            const run = await this.apifyClient.run(dataset.actRunId).get();
            if (!isDefined(run)) {
                this.context.logger.error('Error getting Run while iterating Dataset greedily', { id: this.id });
                return;
            }

            const itemList = await super.listItems({
                ...listItemOptions,
                offset: readItemsCount,
                limit: pageSize,
            });
            readItemsCount += itemList.count;
            yield itemList.items;

            const isTerminal = (ACTOR_JOB_TERMINAL_STATUSES as readonly string[]).includes(run.status);
            if (isTerminal) {
                break;
            }

            await new Promise<void>((resolve) => {
                setTimeout(resolve, pollIntervalSecs * 1000);
            });
        }

        // Drain any remaining items. We cannot rely on dataset.itemCount here because it is
        // eventually consistent — instead we keep fetching pages until we receive an empty one.
        while (true) {
            const itemList = await super.listItems({
                ...listItemOptions,
                offset: readItemsCount,
                limit: pageSize,
            });
            if (itemList.count === 0) {
                break;
            }
            readItemsCount += itemList.count;
            yield itemList.items;
        }
    }

    async *greedyIterate(options: GreedyIterateOptions = {}): AsyncGenerator<T, void, void> {
        const { pageSize = 100 } = options;
        this.context.logger.info('Greedily iterating Dataset', { pageSize }, { url: this.url });

        for await (const batch of this.greedyFetchBatches(options)) {
            for (const item of batch) {
                yield item;
            }
        }
    }

    async *greedyIterateBatched(options: GreedyIterateOptions = {}): AsyncGenerator<T[], void, void> {
        const { pageSize = 100 } = options;
        this.context.logger.info('Greedily iterating Dataset in batches', { pageSize }, { url: this.url });

        for await (const batch of this.greedyFetchBatches(options)) {
            if (batch.length > 0) {
                yield batch;
            }
        }
    }
}
