import { DatasetClient, RunClient } from 'apify-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getClientContext } from '../__unit__/context.js';
import { createActorRunMock } from '../__unit__/mocks.js';
import type { DatasetItem } from '../types.js';
import type { ExtApifyClient } from './apify-client.js';
import type { ExtDatasetClient } from './dataset-client.js';

interface TestItem extends DatasetItem {
    title: string;
}

describe('ExtDatasetClient', () => {
    let apifyClient: ExtApifyClient;
    let datasetClient: ExtDatasetClient<TestItem>;

    beforeEach(() => {
        const context = getClientContext();
        apifyClient = context.client;
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
            expect(listItemsSpy).toHaveBeenNthCalledWith(1, expect.objectContaining({ offset: 0, limit: 0 }));
            expect(listItemsSpy).toHaveBeenNthCalledWith(2, expect.objectContaining({ offset: 1, limit: 0 }));
            expect(listItemsSpy).toHaveBeenNthCalledWith(3, expect.objectContaining({ offset: 2, limit: 0 }));
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
});
