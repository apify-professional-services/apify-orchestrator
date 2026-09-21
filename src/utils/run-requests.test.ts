import { describe, expect, it } from 'vitest';

import { generateRunRequests } from './run-requests.js';

describe('run-requests utils', () => {
    describe('generateRunRequests', () => {
        it('generates run requests with correct run names for multiple inputs', () => {
            const namePrefix = 'my-actor';
            const inputChunks = [{ foo: 1 }, { foo: 2 }, { foo: 3 }];
            const runRequests = generateRunRequests(namePrefix, inputChunks);
            expect(runRequests).toEqual([
                { runName: 'my-actor-1/3', input: { foo: 1 }, options: undefined },
                { runName: 'my-actor-2/3', input: { foo: 2 }, options: undefined },
                { runName: 'my-actor-3/3', input: { foo: 3 }, options: undefined },
            ]);
        });

        it('generates run requests with correct run name for single input', () => {
            const namePrefix = 'single-run';
            const inputChunks = [{ bar: 'baz' }];
            const runRequests = generateRunRequests(namePrefix, inputChunks);
            expect(runRequests).toEqual([{ runName: 'single-run', input: { bar: 'baz' }, options: undefined }]);
        });
    });
});
