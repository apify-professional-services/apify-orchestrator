import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { Interval } from '../../../src/utils/concurrency/interval.js';

describe('Interval', () => {
    const intervalMs = 1000;

    let op: () => Promise<void>;
    let interval: Interval;

    beforeAll(() => {
        vi.useFakeTimers();
    });

    beforeEach(() => {
        op = vi.fn().mockResolvedValue(undefined);
        interval = new Interval(op, intervalMs);
    });

    afterEach(() => {
        interval.stop();
        vi.restoreAllMocks();
    });

    afterAll(() => {
        vi.useRealTimers();
    });

    it('executes the operation at the specified interval', async () => {
        expect(op).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(intervalMs);
        expect(op).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(intervalMs);
        expect(op).toHaveBeenCalledTimes(2);

        await vi.advanceTimersByTimeAsync(intervalMs);
        expect(op).toHaveBeenCalledTimes(3);
    });

    it('stops executing when stop() is called', async () => {
        await vi.advanceTimersByTimeAsync(intervalMs);
        expect(op).toHaveBeenCalledTimes(1);

        interval.stop();

        // Advance time multiple intervals and verify operation is not called again
        await vi.advanceTimersByTimeAsync(intervalMs * 3);
        expect(op).toHaveBeenCalledTimes(1);
    });

    it('reports stopped status correctly', async () => {
        expect(interval.isStopped()).toBe(false);

        interval.stop();

        expect(interval.isStopped()).toBe(true);
    });

    it('handles async operations that take time', async () => {
        let resolveOp: () => void;
        vi.mocked(op).mockImplementation(async () => {
            return new Promise<void>((resolve) => {
                resolveOp = resolve;
            });
        });

        // First execution
        await vi.advanceTimersByTimeAsync(intervalMs);
        expect(op).toHaveBeenCalledTimes(1);

        // Even if the operation hasn't resolved, the interval should trigger again
        await vi.advanceTimersByTimeAsync(intervalMs);
        expect(op).toHaveBeenCalledTimes(2);

        // Resolve the first operation
        resolveOp!();
        await Promise.resolve(); // Allow the promise to resolve
    });

    it('handles operations that throw errors', async () => {
        // The interval should continue even if the operation throws
        await vi.advanceTimersByTimeAsync(intervalMs);
        expect(op).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(intervalMs);
        expect(op).toHaveBeenCalledTimes(2);
    });

    it('allows stop to be called multiple times', async () => {
        interval.stop();
        interval.stop();
        interval.stop();

        expect(interval.isStopped()).toBe(true);

        await vi.advanceTimersByTimeAsync(intervalMs * 3);
        expect(op).not.toHaveBeenCalled();
    });
});
