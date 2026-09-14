import type { PaginatedList } from 'apify-client';
import { DatasetClient, RunClient } from 'apify-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getClientContext } from '../__unit__/context.js';
import { createActorRunMock } from '../__unit__/mocks.js';
import type { DatasetItem } from '../types.js';
import { ExtApifyClient } from './apify-client.js';
import type { ExtDatasetClient } from './dataset-client.js';

interface TestItem extends DatasetItem {
    title: string;
}

/**
 * Mocks the value returned by `DatasetClient.listItems`, which is both a `Promise` of a
 * `PaginatedList` and an `AsyncIterable` yielding the items one by one.
 */
function mockListItemsResult(items: TestItem[]) {
    const paginatedList: PaginatedList<TestItem> = {
        items,
        count: items.length,
        total: items.length,
        offset: 0,
        limit: items.length,
        desc: false,
    };
    const result = Promise.resolve(paginatedList) as Promise<PaginatedList<TestItem>> & AsyncIterable<TestItem>;
    result[Symbol.asyncIterator] = async function* asyncIterator() {
        yield* items;
    };
    return result;
}

describe('ExtDatasetClient', () => {
    let apifyClient: ExtApifyClient;
    let datasetClient: ExtDatasetClient<TestItem>;

    beforeEach(() => {
        const context = getClientContext();
        apifyClient = new ExtApifyClient('test-client', context, {});
        datasetClient = apifyClient.dataset('test-dataset-id');
    });

    afterEach(() => {
        vi.resetAllMocks();
        vi.useRealTimers();
    });

    describe('greedyListItems', () => {
        it('iterates the items from the dataset as soon as one batch is available, using pagination', async () => {
            vi.useFakeTimers();
            vi.spyOn(DatasetClient.prototype, 'get').mockResolvedValue({ actRunId: 'test-run-id' } as never);
            vi.spyOn(RunClient.prototype, 'get')
                .mockResolvedValueOnce(createActorRunMock({ status: 'RUNNING' }))
                .mockResolvedValueOnce(createActorRunMock({ status: 'SUCCEEDED' }));

            const firstPage = [{ title: 'first' }, { title: 'second' }];
            const secondPage = [{ title: 'third' }];
            const listItemsSpy = vi
                .spyOn(DatasetClient.prototype, 'listItems')
                .mockResolvedValueOnce({ items: firstPage, count: 2, total: 3, offset: 0, limit: 2, desc: false })
                .mockResolvedValueOnce({ items: secondPage, count: 1, total: 3, offset: 2, limit: 2, desc: false })
                .mockResolvedValueOnce({ items: [], count: 0, total: 3, offset: 3, limit: 2, desc: false });

            const iterator = datasetClient.greedyListItems({ chunkSize: 2, pollIntervalSecs: 1 });

            await expect(iterator.next()).resolves.toEqual({ value: firstPage[0], done: false });
            await expect(iterator.next()).resolves.toEqual({ value: firstPage[1], done: false });
            expect(listItemsSpy).toHaveBeenCalledTimes(1);

            const nextItem = iterator.next();
            await vi.advanceTimersByTimeAsync(1000);
            await expect(nextItem).resolves.toEqual({ value: secondPage[0], done: false });
            await expect(iterator.next()).resolves.toEqual({ value: undefined, done: true });

            expect(listItemsSpy).toHaveBeenNthCalledWith(1, expect.objectContaining({ offset: 0, limit: 2 }));
            expect(listItemsSpy).toHaveBeenNthCalledWith(2, expect.objectContaining({ offset: 2, limit: 2 }));
            expect(listItemsSpy).toHaveBeenNthCalledWith(3, expect.objectContaining({ offset: 3, limit: 2 }));
        });

        it('iterates the items from the dataset as soon as new items are available, setting chunkSize to 0', async () => {
            vi.spyOn(DatasetClient.prototype, 'get').mockResolvedValue({ actRunId: 'test-run-id' } as never);
            vi.spyOn(RunClient.prototype, 'get')
                .mockResolvedValueOnce(createActorRunMock({ status: 'RUNNING' }))
                .mockResolvedValueOnce(createActorRunMock({ status: 'SUCCEEDED' }));

            const listItemsSpy = vi
                .spyOn(DatasetClient.prototype, 'listItems')
                .mockResolvedValueOnce({
                    items: [{ title: 'available' }],
                    count: 1,
                    total: 1,
                    offset: 0,
                    limit: 0,
                    desc: false,
                })
                .mockResolvedValueOnce({
                    items: [{ title: 'new' }],
                    count: 1,
                    total: 2,
                    offset: 1,
                    limit: 0,
                    desc: false,
                })
                .mockResolvedValueOnce({ items: [], count: 0, total: 2, offset: 2, limit: 0, desc: false });

            const items: TestItem[] = [];
            for await (const item of datasetClient.greedyListItems({ chunkSize: 0, pollIntervalSecs: 0 })) {
                items.push(item);
            }

            expect(items).toEqual([{ title: 'available' }, { title: 'new' }]);
            expect(listItemsSpy).toHaveBeenNthCalledWith(1, expect.objectContaining({ offset: 0, limit: undefined }));
            expect(listItemsSpy).toHaveBeenNthCalledWith(2, expect.objectContaining({ offset: 1, limit: undefined }));
            expect(listItemsSpy).toHaveBeenNthCalledWith(3, expect.objectContaining({ offset: 2, limit: undefined }));
        });

        it('respects the initial offset', async () => {
            vi.spyOn(DatasetClient.prototype, 'get').mockResolvedValue({ actRunId: 'test-run-id' } as never);
            vi.spyOn(RunClient.prototype, 'get').mockResolvedValue(createActorRunMock({ status: 'SUCCEEDED' }));

            const listItemsSpy = vi
                .spyOn(DatasetClient.prototype, 'listItems')
                .mockResolvedValueOnce({
                    items: [{ title: 'item-3' }],
                    count: 1,
                    total: 3,
                    offset: 3,
                    limit: 2,
                    desc: false,
                })
                .mockResolvedValueOnce({ items: [], count: 0, total: 3, offset: 4, limit: 2, desc: false });

            const items: TestItem[] = [];
            for await (const item of datasetClient.greedyListItems({ offset: 3, chunkSize: 2, pollIntervalSecs: 0 })) {
                items.push(item);
            }

            expect(items).toEqual([{ title: 'item-3' }]);
            expect(listItemsSpy).toHaveBeenNthCalledWith(1, expect.objectContaining({ offset: 3, limit: 2 }));
            expect(listItemsSpy).toHaveBeenNthCalledWith(2, expect.objectContaining({ offset: 4, limit: 2 }));
        });

        it('does not fetch more than the requested limit', async () => {
            vi.spyOn(DatasetClient.prototype, 'get').mockResolvedValue({ actRunId: 'test-run-id' } as never);
            vi.spyOn(RunClient.prototype, 'get').mockResolvedValue(createActorRunMock({ status: 'RUNNING' }));

            const page = [{ title: 'first' }, { title: 'second' }];
            const listItemsSpy = vi.spyOn(DatasetClient.prototype, 'listItems').mockResolvedValueOnce({
                items: page,
                count: 2,
                total: 5,
                offset: 0,
                limit: 2,
                desc: false,
            });

            const items: TestItem[] = [];
            for await (const item of datasetClient.greedyListItems({ limit: 2, chunkSize: 5 })) {
                items.push(item);
            }

            expect(items).toEqual(page);
            expect(listItemsSpy).toHaveBeenCalledOnce();
            expect(listItemsSpy).toHaveBeenCalledWith(expect.objectContaining({ offset: 0, limit: 2 }));
        });

        it('applies the limit relative to the initial offset across pages', async () => {
            vi.spyOn(DatasetClient.prototype, 'get').mockResolvedValue({ actRunId: 'test-run-id' } as never);
            vi.spyOn(RunClient.prototype, 'get').mockResolvedValue(createActorRunMock({ status: 'RUNNING' }));

            const firstPage = [{ title: 'item-2' }, { title: 'item-3' }];
            const secondPage = [{ title: 'item-4' }];
            const listItemsSpy = vi
                .spyOn(DatasetClient.prototype, 'listItems')
                .mockResolvedValueOnce({ items: firstPage, count: 2, total: 6, offset: 1, limit: 2, desc: false })
                .mockResolvedValueOnce({ items: secondPage, count: 1, total: 6, offset: 3, limit: 1, desc: false });

            const items: TestItem[] = [];
            for await (const item of datasetClient.greedyListItems({
                offset: 1,
                limit: 3,
                chunkSize: 2,
                pollIntervalSecs: 0,
            })) {
                items.push(item);
            }

            expect(items).toEqual([...firstPage, ...secondPage]);
            expect(listItemsSpy).toHaveBeenNthCalledWith(1, expect.objectContaining({ offset: 1, limit: 2 }));
            expect(listItemsSpy).toHaveBeenNthCalledWith(2, expect.objectContaining({ offset: 3, limit: 1 }));
        });

        it('uses the limit as page size when chunkSize is 0', async () => {
            vi.spyOn(DatasetClient.prototype, 'get').mockResolvedValue({ actRunId: 'test-run-id' } as never);
            vi.spyOn(RunClient.prototype, 'get').mockResolvedValue(createActorRunMock({ status: 'RUNNING' }));

            const page = [{ title: 'item-4' }, { title: 'item-5' }];
            const listItemsSpy = vi.spyOn(DatasetClient.prototype, 'listItems').mockResolvedValueOnce({
                items: page,
                count: 2,
                total: 6,
                offset: 3,
                limit: 2,
                desc: false,
            });

            const items: TestItem[] = [];
            for await (const item of datasetClient.greedyListItems({
                offset: 3,
                limit: 2,
                chunkSize: 0,
            })) {
                items.push(item);
            }

            expect(items).toEqual(page);
            expect(listItemsSpy).toHaveBeenCalledOnce();
            expect(listItemsSpy).toHaveBeenCalledWith(expect.objectContaining({ offset: 3, limit: 2 }));
        });
    });

    describe('listItemsBatched', () => {
        it('yields the items in batches of the requested size, ending with a smaller batch', async () => {
            const items = [
                { title: 'first' },
                { title: 'second' },
                { title: 'third' },
                { title: 'fourth' },
                { title: 'fifth' },
            ];
            const listItemsSpy = vi
                .spyOn(DatasetClient.prototype, 'listItems')
                .mockReturnValue(mockListItemsResult(items) as never);

            const batches: TestItem[][] = [];
            for await (const batch of datasetClient.listItemsBatched({ batchSize: 2, chunkSize: 100 })) {
                batches.push(batch);
            }

            expect(batches).toEqual([[items[0], items[1]], [items[2], items[3]], [items[4]]]);
            expect(listItemsSpy).toHaveBeenCalledExactlyOnceWith({ chunkSize: 100 });
        });

        it('uses the chunk size as the default batch size', async () => {
            const items = [{ title: 'first' }, { title: 'second' }, { title: 'third' }];
            vi.spyOn(DatasetClient.prototype, 'listItems').mockReturnValue(mockListItemsResult(items) as never);

            const batches: TestItem[][] = [];
            for await (const batch of datasetClient.listItemsBatched({ chunkSize: 2 })) {
                batches.push(batch);
            }

            expect(batches).toEqual([[items[0], items[1]], [items[2]]]);
        });

        it('yields nothing if the dataset is empty', async () => {
            vi.spyOn(DatasetClient.prototype, 'listItems').mockReturnValue(mockListItemsResult([]) as never);

            const batches: TestItem[][] = [];
            for await (const batch of datasetClient.listItemsBatched({ batchSize: 2 })) {
                batches.push(batch);
            }

            expect(batches).toEqual([]);
        });

        it('falls back to the default batch size when the chunk size is undefined', async () => {
            const items = Array.from({ length: 101 }, (_, index) => ({ title: `item-${index}` }));
            vi.spyOn(DatasetClient.prototype, 'listItems').mockReturnValue(mockListItemsResult(items) as never);

            const batches: TestItem[][] = [];
            for await (const batch of datasetClient.listItemsBatched({ chunkSize: undefined })) {
                batches.push(batch);
            }

            expect(batches.map((batch) => batch.length)).toEqual([100, 1]);
        });

        it('throws if the batch size is not a positive integer', async () => {
            const iterator = datasetClient.listItemsBatched({ batchSize: 0 });
            await expect(iterator.next()).rejects.toThrow('The batch size must be a positive integer.');
        });

        it('treats batchSize the same way as chunkSize', async () => {
            // An explicit, invalid batchSize is rejected by our own validation.
            const negativeBatchSize = datasetClient.listItemsBatched({ batchSize: -1 });
            await expect(negativeBatchSize.next()).rejects.toThrow('The batch size must be a positive integer.');

            // We compute the batch size falling back to the default value,
            // but `listItems` still rejects a chunkSize of 0.
            const zeroChunkSize = datasetClient.listItemsBatched({ chunkSize: 0 });
            await expect(zeroChunkSize.next()).rejects.toThrow('chunkSize');

            await expect(async () => datasetClient.listItems({ chunkSize: 0 })).rejects.toThrow('chunkSize');
        });
    });

    describe('greedyListItemsBatched', () => {
        it('yields batches of the requested size, buffering the items across pages', async () => {
            vi.spyOn(DatasetClient.prototype, 'get').mockResolvedValue({ actRunId: 'test-run-id' } as never);
            vi.spyOn(RunClient.prototype, 'get')
                .mockResolvedValueOnce(createActorRunMock({ status: 'RUNNING' }))
                .mockResolvedValueOnce(createActorRunMock({ status: 'RUNNING' }))
                .mockResolvedValueOnce(createActorRunMock({ status: 'SUCCEEDED' }));

            const firstPage = [{ title: 'first' }];
            const secondPage = [{ title: 'second' }, { title: 'third' }];
            const listItemsSpy = vi
                .spyOn(DatasetClient.prototype, 'listItems')
                .mockResolvedValueOnce({ items: firstPage, count: 1, total: 3, offset: 0, limit: 2, desc: false })
                .mockResolvedValueOnce({ items: secondPage, count: 2, total: 3, offset: 1, limit: 2, desc: false })
                .mockResolvedValueOnce({ items: [], count: 0, total: 3, offset: 3, limit: 2, desc: false });

            const batches: TestItem[][] = [];
            for await (const batch of datasetClient.greedyListItemsBatched({
                batchSize: 2,
                chunkSize: 2,
                pollIntervalSecs: 0,
            })) {
                batches.push(batch);
            }

            expect(batches).toEqual([[firstPage[0], secondPage[0]], [secondPage[1]]]);
            expect(listItemsSpy).toHaveBeenNthCalledWith(1, expect.objectContaining({ offset: 0, limit: 2 }));
            expect(listItemsSpy).toHaveBeenNthCalledWith(2, expect.objectContaining({ offset: 1, limit: 2 }));
            expect(listItemsSpy).toHaveBeenNthCalledWith(3, expect.objectContaining({ offset: 3, limit: 2 }));
            expect(listItemsSpy).not.toHaveBeenCalledWith(expect.objectContaining({ batchSize: expect.anything() }));
        });

        it('yields a batch as soon as it is complete, without waiting for the run to finish', async () => {
            vi.useFakeTimers();
            vi.spyOn(DatasetClient.prototype, 'get').mockResolvedValue({ actRunId: 'test-run-id' } as never);
            vi.spyOn(RunClient.prototype, 'get').mockResolvedValue(createActorRunMock({ status: 'RUNNING' }));

            const firstPage = [{ title: 'first' }, { title: 'second' }];
            const secondPage = [{ title: 'third' }, { title: 'fourth' }];
            vi.spyOn(DatasetClient.prototype, 'listItems')
                .mockResolvedValueOnce({ items: firstPage, count: 2, total: 4, offset: 0, limit: 2, desc: false })
                .mockResolvedValueOnce({ items: secondPage, count: 2, total: 4, offset: 2, limit: 2, desc: false });

            const iterator = datasetClient.greedyListItemsBatched({
                batchSize: 2,
                chunkSize: 2,
                pollIntervalSecs: 1,
            });

            await expect(iterator.next()).resolves.toEqual({ value: firstPage, done: false });

            const nextBatch = iterator.next();
            await vi.advanceTimersByTimeAsync(1000);
            await expect(nextBatch).resolves.toEqual({ value: secondPage, done: false });
        });

        it('does not fetch more than the requested limit', async () => {
            vi.spyOn(DatasetClient.prototype, 'get').mockResolvedValue({ actRunId: 'test-run-id' } as never);
            vi.spyOn(RunClient.prototype, 'get').mockResolvedValue(createActorRunMock({ status: 'RUNNING' }));

            const firstPage = [{ title: 'first' }, { title: 'second' }];
            const secondPage = [{ title: 'third' }];
            const listItemsSpy = vi
                .spyOn(DatasetClient.prototype, 'listItems')
                .mockResolvedValueOnce({ items: firstPage, count: 2, total: 5, offset: 0, limit: 2, desc: false })
                .mockResolvedValueOnce({ items: secondPage, count: 1, total: 5, offset: 2, limit: 1, desc: false });

            const batches: TestItem[][] = [];
            for await (const batch of datasetClient.greedyListItemsBatched({
                batchSize: 2,
                chunkSize: 2,
                limit: 3,
                pollIntervalSecs: 0,
            })) {
                batches.push(batch);
            }

            expect(batches).toEqual([firstPage, secondPage]);
            expect(listItemsSpy).toHaveBeenCalledTimes(2);
            expect(listItemsSpy).toHaveBeenNthCalledWith(2, expect.objectContaining({ offset: 2, limit: 1 }));
        });

        it('uses the chunk size as the default batch size', async () => {
            vi.spyOn(DatasetClient.prototype, 'get').mockResolvedValue({ actRunId: 'test-run-id' } as never);
            vi.spyOn(RunClient.prototype, 'get').mockResolvedValue(createActorRunMock({ status: 'SUCCEEDED' }));

            const page = [{ title: 'first' }, { title: 'second' }, { title: 'third' }];
            vi.spyOn(DatasetClient.prototype, 'listItems')
                .mockResolvedValueOnce({ items: page, count: 3, total: 3, offset: 0, limit: 3, desc: false })
                .mockResolvedValueOnce({ items: [], count: 0, total: 3, offset: 3, limit: 3, desc: false });

            const batches: TestItem[][] = [];
            for await (const batch of datasetClient.greedyListItemsBatched({ chunkSize: 2, pollIntervalSecs: 0 })) {
                batches.push(batch);
            }

            expect(batches).toEqual([[page[0], page[1]], [page[2]]]);
        });

        it('throws if the batch size is not a positive integer', async () => {
            const iterator = datasetClient.greedyListItemsBatched({ batchSize: -1 });
            await expect(iterator.next()).rejects.toThrow('The batch size must be a positive integer.');
        });

        it('falls back to the default batch size when the chunk size is 0, unlike listItemsBatched', async () => {
            vi.spyOn(DatasetClient.prototype, 'get').mockResolvedValue({ actRunId: 'test-run-id' } as never);
            vi.spyOn(RunClient.prototype, 'get').mockResolvedValue(createActorRunMock({ status: 'SUCCEEDED' }));

            const items = Array.from({ length: 101 }, (_, index) => ({ title: `item-${index}` }));
            vi.spyOn(DatasetClient.prototype, 'listItems')
                .mockResolvedValueOnce({ items, count: 101, total: 101, offset: 0, limit: 101, desc: false })
                .mockResolvedValueOnce({ items: [], count: 0, total: 101, offset: 101, limit: 0, desc: false });

            const batches: TestItem[][] = [];
            for await (const batch of datasetClient.greedyListItemsBatched({ chunkSize: 0, pollIntervalSecs: 0 })) {
                batches.push(batch);
            }

            expect(batches.map((batch) => batch.length)).toEqual([100, 1]);
        });

        it('treats an explicit negative chunkSize the same way as a negative batchSize', async () => {
            const iterator = datasetClient.greedyListItemsBatched({ chunkSize: -1 });
            await expect(iterator.next()).rejects.toThrow('The batch size must be a positive integer.');
        });
    });
});
