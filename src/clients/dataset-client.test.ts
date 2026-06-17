import { DatasetClient } from 'apify-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getClientContext } from '../__unit__/context.js';
import type { DatasetItem } from '../types.js';
import { ExtApifyClient } from './apify-client.js';
import type { ExtDatasetClient } from './dataset-client.js';

interface TestItem extends DatasetItem {
    title: string;
}

describe('ExtDatasetClient', () => {
    const testItems: TestItem[] = [{ title: 'test-1' }, { title: 'test-2' }, { title: 'test-3' }];

    let apifyClient: ExtApifyClient;
    let datasetClient: ExtDatasetClient<TestItem>;

    beforeEach(() => {
        const context = getClientContext();
        apifyClient = new ExtApifyClient('test-client', context, {});
        datasetClient = apifyClient.dataset('test-dataset-id');
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('iterate', () => {
        it('iterates the items from the dataset', async () => {
            const listItemsSpy = vi.spyOn(DatasetClient.prototype, 'listItems').mockResolvedValue({
                count: 3,
                items: testItems,
                total: 3,
                offset: 0,
                limit: 1000,
                desc: true,
            });
            const datasetIterator = datasetClient.iterate();
            let index = 0;
            for await (const item of datasetIterator) {
                expect(item).toEqual(testItems[index]);
                index++;
            }
            expect(index).toBe(3);
            expect(listItemsSpy).toHaveBeenCalledTimes(1);
            expect(listItemsSpy).toHaveBeenCalledWith({});
        });

        it('iterates the items from the dataset, using pagination', async () => {
            const listItemsSpy = vi
                .spyOn(DatasetClient.prototype, 'listItems')
                .mockResolvedValueOnce({
                    count: 2,
                    items: testItems.slice(0, 2),
                    total: 3,
                    offset: 0,
                    limit: 2,
                    desc: true,
                })
                .mockResolvedValueOnce({
                    count: 1,
                    items: testItems.slice(2, 3),
                    total: 3,
                    offset: 2,
                    limit: 2,
                    desc: true,
                })
                .mockResolvedValueOnce({
                    count: 0,
                    items: [],
                    total: 3,
                    offset: 3,
                    limit: 2,
                    desc: true,
                });
            const datasetIterator = datasetClient.iterate({ pageSize: 2 });
            let itemCount = 0;
            for await (const item of datasetIterator) {
                expect(item).toEqual(testItems[itemCount]);
                itemCount++;
            }
            expect(itemCount).toBe(3);
            expect(listItemsSpy).toHaveBeenCalledTimes(3);
            expect(listItemsSpy).toHaveBeenNthCalledWith(1, { offset: 0, limit: 2 });
            expect(listItemsSpy).toHaveBeenNthCalledWith(2, { offset: 2, limit: 2 });
            expect(listItemsSpy).toHaveBeenNthCalledWith(3, { offset: 4, limit: 2 });
        });
    });

    describe('iterateBatched', () => {
        it('iterates batches of items from the dataset', async () => {
            const listItemsSpy = vi.spyOn(DatasetClient.prototype, 'listItems').mockResolvedValue({
                count: 3,
                items: testItems,
                total: 3,
                offset: 0,
                limit: 1000,
                desc: true,
            });
            const datasetIterator = datasetClient.iterateBatched();
            let batchCount = 0;
            let totalItems = 0;
            for await (const batch of datasetIterator) {
                expect(batch).toEqual(testItems);
                totalItems += batch.length;
                batchCount++;
            }
            expect(batchCount).toBe(1);
            expect(totalItems).toBe(3);
            expect(listItemsSpy).toHaveBeenCalledTimes(1);
            expect(listItemsSpy).toHaveBeenCalledWith({});
        });

        it('iterates batches of items from the dataset, using pagination', async () => {
            const listItemsSpy = vi
                .spyOn(DatasetClient.prototype, 'listItems')
                .mockResolvedValueOnce({
                    count: 2,
                    items: testItems.slice(0, 2),
                    total: 3,
                    offset: 0,
                    limit: 2,
                    desc: true,
                })
                .mockResolvedValueOnce({
                    count: 1,
                    items: testItems.slice(2, 3),
                    total: 3,
                    offset: 2,
                    limit: 2,
                    desc: true,
                })
                .mockResolvedValueOnce({
                    count: 0,
                    items: [],
                    total: 3,
                    offset: 3,
                    limit: 2,
                    desc: true,
                });
            const datasetIterator = datasetClient.iterateBatched({ pageSize: 2 });
            let batchCount = 0;
            let totalItems = 0;
            const batches: TestItem[][] = [];
            for await (const batch of datasetIterator) {
                batches.push(batch);
                totalItems += batch.length;
                batchCount++;
            }
            expect(batchCount).toBe(2);
            expect(totalItems).toBe(3);
            expect(batches[0]).toEqual(testItems.slice(0, 2));
            expect(batches[1]).toEqual(testItems.slice(2, 3));
            expect(listItemsSpy).toHaveBeenCalledTimes(3);
            expect(listItemsSpy).toHaveBeenNthCalledWith(1, { offset: 0, limit: 2 });
            expect(listItemsSpy).toHaveBeenNthCalledWith(2, { offset: 2, limit: 2 });
            expect(listItemsSpy).toHaveBeenNthCalledWith(3, { offset: 4, limit: 2 });
        });
    });

    describe('greedyIterate', () => {
        it('iterates the items from the dataset as soon as one batch is available, using pagination', () => {
            // TODO: test
        });

        it('iterates the items from the dataset as soon as new items are available, setting pageSize to 0', () => {
            // TODO: test
        });
    });
});
