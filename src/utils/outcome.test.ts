import { describe, expect, it } from 'vitest';

import { Outcome } from './outcome.js';

class TestOutcome extends Outcome<{ success: number; failure: string }> {}

function testMatcher(outcome: TestOutcome) {
    return outcome.match({
        success: (value) => `success: ${value}`,
        failure: (error) => `failure: ${error}`,
    });
}

async function testAsyncMatcher(outcome: TestOutcome) {
    return outcome.match({
        success: async (value) => `success: ${value}`,
        failure: async (error) => `failure: ${error}`,
    });
}

describe('Outcome', () => {
    it('matches success variant correctly', () => {
        const outcome = new TestOutcome({ success: 42 });
        const result = testMatcher(outcome);
        expect(result).toBe('success: 42');
    });

    it('matches failure variant correctly', () => {
        const outcome = new TestOutcome({ failure: 'Something went wrong' });
        const result = testMatcher(outcome);
        expect(result).toBe('failure: Something went wrong');
    });

    it('async matches success variant correctly', async () => {
        const outcome = new TestOutcome({ success: 100 });
        const result = await testAsyncMatcher(outcome);
        expect(result).toBe('success: 100');
    });

    it('async matches failure variant correctly', async () => {
        const outcome = new TestOutcome({ failure: 'Async error occurred' });
        const result = await testAsyncMatcher(outcome);
        expect(result).toBe('failure: Async error occurred');
    });

    it('allows throwing in match handlers', () => {
        const outcome = new TestOutcome({ failure: 'Critical failure' });
        expect(() =>
            outcome.match({
                success: (value) => `success: ${value}`,
                failure: (error) => {
                    throw new Error(`Handled error: ${error}`);
                },
            }),
        ).toThrow('Handled error: Critical failure');
    });

    it('allows throwing in async match handlers', async () => {
        const outcome = new TestOutcome({ failure: 'Async critical failure' });
        await expect(
            outcome.match({
                success: async (value) => `success: ${value}`,
                failure: async (error) => {
                    throw new Error(`Handled async error: ${error}`);
                },
            }),
        ).rejects.toThrow('Handled async error: Async critical failure');
    });
});
