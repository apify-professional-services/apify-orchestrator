import type { Dictionary } from 'apify-client';
import { describe, expect, it } from 'vitest';

import { splitIntoChunksWithMaxSize, strBytes } from './bytes.js';

describe('bytes utils', () => {
    describe('splitIntoChunksWithMaxSize', () => {
        it('correctly generates input batches', () => {
            const sources = Array.from({ length: 1000 }, (_, i) => i); // [0, 1, 2, ..., 999]
            interface Input extends Dictionary {
                startUrls: { url: string }[];
            }
            const inputGenerator = (numbers: number[]): Input => ({
                startUrls: numbers.map(makeUrlFromNumber),
            });
            const sizeLimit = 128;
            const inputBatches = splitIntoChunksWithMaxSize(sources, inputGenerator, sizeLimit);
            const urls = new Set<string>();
            for (const input of inputBatches) {
                for (const { url } of (input as Input).startUrls) {
                    expect(urls).not.toContain(url);
                    urls.add(url);
                }
                expect(strBytes(JSON.stringify(input))).toBeLessThanOrEqual(sizeLimit);
                expect('startUrls' in input).toBeTruthy();
            }
        });
    });
});

function makeUrlFromNumber(n: number): { url: string } {
    return { url: `https://num.com/${n.toString().padStart(5, '0')}` };
}
