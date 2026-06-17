import type { DatasetGroup, DatasetItem, ExtendedDatasetClient, IterateOptions } from '../types.js';

export class DatasetGroupClass<T extends DatasetItem> implements DatasetGroup<T> {
    readonly datasets: ExtendedDatasetClient<T>[];

    constructor(...datasets: ExtendedDatasetClient<T>[]) {
        this.datasets = datasets;
    }

    async *iterate(options: IterateOptions): AsyncGenerator<T, void, void> {
        for (const dataset of this.datasets) {
            const datasetIterator = dataset.iterate(options);
            for await (const item of datasetIterator) {
                yield item;
            }
        }
    }

    async *iterateBatched(options: IterateOptions): AsyncGenerator<T[], void, void> {
        for (const dataset of this.datasets) {
            const datasetIterator = dataset.iterateBatched(options);
            for await (const batch of datasetIterator) {
                yield batch;
            }
        }
    }
}
