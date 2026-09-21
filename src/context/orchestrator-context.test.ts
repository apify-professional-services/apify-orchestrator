import { describe, expect, it } from 'vitest';

import { getTestOptions } from '../__unit__/context.js';
import { generateOrchestratorContext } from './orchestrator-context.js';

describe('OrchestratorContext', () => {
    describe('generateRunRequests', () => {
        const inputGenerator = <T>(chunk: T) => ({ items: chunk });

        it('generates a single run request when sources fit in one chunk', () => {
            const context = generateOrchestratorContext(getTestOptions());

            const sources = [{ id: 1 }, { id: 2 }];

            const runRequests = context.generateRunRequests({
                namePrefix: 'test-run',
                sources,
                inputGenerator,
            });

            expect(runRequests).toHaveLength(1);
            expect(runRequests[0].runName).toBe('test-run');
            expect(runRequests[0].input).toEqual({ items: sources });
        });

        it('generates multiple run requests when sources need to be split', () => {
            const context = generateOrchestratorContext(getTestOptions());

            // Generate data large enough to exceed the Apify payload limit (9.4 MB)
            const sources = Array.from({ length: 100 }, (_, i) => ({ id: i, data: 'x'.repeat(100000) })); // size: ~10 MB

            const runRequests = context.generateRunRequests({
                namePrefix: 'test-run',
                sources,
                inputGenerator,
            });

            expect(runRequests.length).toBeGreaterThan(1);
            runRequests.forEach((request, index) => {
                expect(request.runName).toMatch(new RegExp(`test-run-${index + 1}/${runRequests.length}`));
                expect(request.input).toHaveProperty('items');
            });
        });

        it('considers fixed input for size calculation but does not merge it in the result', () => {
            const contextWithFixedInput = generateOrchestratorContext(
                getTestOptions({
                    // Generate a significantly large fixed input
                    fixedInput: { largeProp: 'x'.repeat(5 * 1024 * 1024) }, // size: ~5 MB
                }),
            );
            const contextWithoutFixedInput = generateOrchestratorContext(getTestOptions());

            // Generate data large enough to exceed the Apify payload limit when combined with fixed input
            // Total size: ~7 MB (should fit in one chunk without fixed input, but need splitting with 5 MB fixed input)
            const sources = Array.from({ length: 50 }, (_, i) => ({ id: i, data: 'x'.repeat(140 * 1024) })); // total: ~7 MB

            const runRequestsWithoutFixedInput = contextWithoutFixedInput.generateRunRequests({
                namePrefix: 'test-run',
                sources,
                inputGenerator,
            });
            const runRequestsWithFixedInput = contextWithFixedInput.generateRunRequests({
                namePrefix: 'test-run',
                sources,
                inputGenerator,
            });

            expect(runRequestsWithoutFixedInput.length).toBe(1);
            expect(runRequestsWithFixedInput.length).toBeGreaterThan(1);

            // Fixed input is not merged in generateRunRequests - it's merged later during run start
            expect(runRequestsWithFixedInput[0].input).toHaveProperty('items');
            expect(Array.isArray(runRequestsWithFixedInput?.[0].input?.items)).toBe(true);
        });

        it('passes options to run requests', () => {
            const sources = [{ id: 1 }];
            const options = { memory: 2048, timeout: 300 };
            const context = generateOrchestratorContext(getTestOptions());

            const runRequests = context.generateRunRequests({
                namePrefix: 'test-run',
                sources,
                inputGenerator,
                options,
            });

            expect(runRequests).toHaveLength(1);
            expect(runRequests[0].options).toEqual(options);
        });
    });
});
