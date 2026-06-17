import type { PaginatedList } from 'apify-client';
import { DatasetClient } from 'apify-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getTestOptions } from '../__unit__/context.js';
import type { DatasetItem, ExtendedApifyClient } from '../index.js';
import { Orchestrator } from '../index.js';

describe('DatasetGroupClass', () => {
    let orchestrator: Orchestrator;
    let client: ExtendedApifyClient;

    beforeEach(async () => {
        const options = getTestOptions();
        orchestrator = new Orchestrator(options);
        client = await orchestrator.apifyClient({ name: 'test-client' });
    });

    it('can iterate over items from all the datasets, in order', async () => {
        interface Item extends DatasetItem {
            title: string;
        }
        const dataset1: PaginatedList<Item> = {
            count: 1,
            desc: true,
            items: [{ title: 'A' }],
            limit: 0,
            offset: 0,
            total: 1,
        };
        const dataset2: PaginatedList<Item> = {
            count: 1,
            desc: true,
            items: [{ title: 'B' }],
            limit: 0,
            offset: 0,
            total: 1,
        };
        const dataset3: PaginatedList<Item> = {
            count: 1,
            desc: true,
            items: [{ title: 'C' }],
            limit: 0,
            offset: 0,
            total: 1,
        };

        vi.spyOn(DatasetClient.prototype, 'listItems')
            .mockResolvedValueOnce(dataset1)
            .mockResolvedValueOnce(dataset2)
            .mockResolvedValueOnce(dataset3);

        const mergedDatasets = orchestrator.mergeDatasets(
            client.dataset<Item>('test-id1'),
            client.dataset<Item>('test-id2'),
            client.dataset<Item>('test-id3'),
        );

        const datasetIterator = mergedDatasets.iterate({});
        const readItems: Item[] = [];
        for await (const item of datasetIterator) {
            readItems.push(item);
        }

        expect(readItems).toEqual([{ title: 'A' }, { title: 'B' }, { title: 'C' }]);
    });

    it('can iterate over batches from all the datasets, in order', async () => {
        interface Item extends DatasetItem {
            title: string;
        }
        const dataset1: PaginatedList<Item> = {
            count: 2,
            desc: true,
            items: [{ title: 'A1' }, { title: 'A2' }],
            limit: 0,
            offset: 0,
            total: 2,
        };
        const dataset2: PaginatedList<Item> = {
            count: 2,
            desc: true,
            items: [{ title: 'B1' }, { title: 'B2' }],
            limit: 0,
            offset: 0,
            total: 2,
        };
        const dataset3: PaginatedList<Item> = {
            count: 2,
            desc: true,
            items: [{ title: 'C1' }, { title: 'C2' }],
            limit: 0,
            offset: 0,
            total: 2,
        };

        vi.spyOn(DatasetClient.prototype, 'listItems')
            .mockResolvedValueOnce(dataset1)
            .mockResolvedValueOnce(dataset2)
            .mockResolvedValueOnce(dataset3);

        const mergedDatasets = orchestrator.mergeDatasets(
            client.dataset<Item>('test-id1'),
            client.dataset<Item>('test-id2'),
            client.dataset<Item>('test-id3'),
        );

        const datasetIterator = mergedDatasets.iterateBatched({});
        const readBatches: Item[][] = [];
        for await (const batch of datasetIterator) {
            readBatches.push(batch);
        }

        expect(readBatches).toEqual([
            [{ title: 'A1' }, { title: 'A2' }],
            [{ title: 'B1' }, { title: 'B2' }],
            [{ title: 'C1' }, { title: 'C2' }],
        ]);
    });
});
