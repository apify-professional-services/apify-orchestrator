import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TryLimit } from './try-limit.js';

describe('TryLimit', () => {
    const fn = vi.fn();
    let value: number;

    const getCurrentValue = () => value;

    beforeEach(() => {
        vi.mocked(fn).mockResolvedValue('success');
        value = 0;
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('allows execution when the value is below the limit', async () => {
        const tryLimit = new TryLimit(2, getCurrentValue);
        value = 1;

        const outcome = await tryLimit.attempt(fn);

        expect(outcome.value).toBe('success');
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('blocks execution when the value reached the limit', async () => {
        const tryLimit = new TryLimit(2, getCurrentValue);
        value = 2;

        const outcome = await tryLimit.attempt(fn);

        expect(outcome.value).toBe('limit-reached');
        expect(fn).not.toHaveBeenCalled();
    });

    it('blocks execution when the value exceeds the limit', async () => {
        const tryLimit = new TryLimit(2, getCurrentValue);
        value = 3;

        const outcome = await tryLimit.attempt(fn);

        expect(outcome.value).toBe('limit-reached');
        expect(fn).not.toHaveBeenCalled();
    });

    it('blocks any execution when the limit is zero', async () => {
        const tryLimit = new TryLimit(0, getCurrentValue);

        const outcome = await tryLimit.attempt(fn);

        expect(outcome.value).toBe('limit-reached');
        expect(fn).not.toHaveBeenCalled();
    });

    it('never blocks when the limit is infinite', async () => {
        const tryLimit = new TryLimit(Number.POSITIVE_INFINITY, getCurrentValue);
        value = 1_000;

        const outcome = await tryLimit.attempt(fn);

        expect(outcome.value).toBe('success');
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('reads the value at every attempt', async () => {
        const tryLimit = new TryLimit(1, getCurrentValue);

        let outcome = await tryLimit.attempt(fn);
        expect(outcome.value).toBe('success');

        // The value is now at the limit: the next attempt is blocked.
        value = 1;

        outcome = await tryLimit.attempt(fn);
        expect(outcome.value).toBe('limit-reached');

        // The value went down again: the execution is allowed once more.
        value = 0;

        outcome = await tryLimit.attempt(fn);
        expect(outcome.value).toBe('success');

        expect(fn).toHaveBeenCalledTimes(2);
    });

    it('checks the value before executing the function', async () => {
        const tryLimit = new TryLimit(1, getCurrentValue);
        // The function itself increases the value, as a Run start would.
        vi.mocked(fn).mockImplementation(async () => {
            value++;
            return 'success';
        });

        let outcome = await tryLimit.attempt(fn);
        expect(outcome.value).toBe('success');
        expect(value).toBe(1);

        outcome = await tryLimit.attempt(fn);
        expect(outcome.value).toBe('limit-reached');
        expect(value).toBe(1);

        expect(fn).toHaveBeenCalledTimes(1);
    });
});
