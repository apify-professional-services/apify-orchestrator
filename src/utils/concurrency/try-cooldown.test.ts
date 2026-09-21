import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { TryCooldown } from './try-cooldown.js';

describe('TryCooldown', () => {
    const cooldownMs = 100;
    const fn = vi.fn();
    let cooldown: TryCooldown;

    beforeAll(() => {
        vi.useFakeTimers();
    });

    beforeEach(() => {
        vi.mocked(fn).mockResolvedValue('success');
        cooldown = new TryCooldown(cooldownMs);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    afterAll(() => {
        vi.useRealTimers();
    });

    it('allows execution when cooldown has not been activated', async () => {
        const outcome = await cooldown.attempt(fn);

        expect(outcome.value).toBe('success');
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('blocks execution during cooldown period', async () => {
        cooldown.activate();

        const outcome = await cooldown.attempt(fn);

        expect(outcome.value).toBe('cooldown-period');
        expect(fn).not.toHaveBeenCalled();
    });

    it('allows execution after cooldown period has elapsed', async () => {
        cooldown.activate();

        // Advance time past the cooldown period
        await vi.advanceTimersByTimeAsync(cooldownMs);

        const outcome = await cooldown.attempt(fn);

        expect(outcome.value).toBe('success');
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('blocks execution when cooldown period has not fully elapsed', async () => {
        cooldown.activate();

        // Advance time but not enough to pass the cooldown
        await vi.advanceTimersByTimeAsync(cooldownMs - 10);

        const outcome = await cooldown.attempt(fn);

        expect(outcome.value).toBe('cooldown-period');
        expect(fn).not.toHaveBeenCalled();
    });

    it('can activate cooldown multiple times', async () => {
        // First cooldown period
        cooldown.activate();

        let outcome = await cooldown.attempt(fn);
        expect(outcome.value).toBe('cooldown-period');

        // Wait for cooldown to expire
        await vi.advanceTimersByTimeAsync(cooldownMs);

        outcome = await cooldown.attempt(fn);
        expect(outcome.value).toBe('success');
        expect(fn).toHaveBeenCalledTimes(1);

        // Activate again
        cooldown.activate();

        outcome = await cooldown.attempt(fn);
        expect(outcome.value).toBe('cooldown-period');
        expect(fn).toHaveBeenCalledTimes(1);

        // Wait for second cooldown to expire
        await vi.advanceTimersByTimeAsync(cooldownMs);

        outcome = await cooldown.attempt(fn);
        expect(outcome.value).toBe('success');
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it('resets cooldown timer when activated during cooldown', async () => {
        // Activate cooldown
        cooldown.activate();

        // Advance time partway through cooldown
        await vi.advanceTimersByTimeAsync(cooldownMs / 2);

        // Activate again (resets the timer)
        cooldown.activate();

        // Advance time by the remaining half - should still be in cooldown
        await vi.advanceTimersByTimeAsync(cooldownMs / 2);

        let outcome = await cooldown.attempt(fn);
        expect(outcome.value).toBe('cooldown-period');
        expect(fn).not.toHaveBeenCalled();

        // Advance the rest of the time from the second activation
        await vi.advanceTimersByTimeAsync(cooldownMs / 2);

        outcome = await cooldown.attempt(fn);
        expect(outcome.value).toBe('success');
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('clears cooldown state after period elapses', async () => {
        cooldown.activate();

        // Attempt during cooldown
        let outcome = await cooldown.attempt(fn);
        expect(outcome.value).toBe('cooldown-period');

        // Wait for cooldown to expire
        await vi.advanceTimersByTimeAsync(cooldownMs);

        // First attempt clears the cooldown state
        outcome = await cooldown.attempt(fn);
        expect(outcome.value).toBe('success');
        expect(fn).toHaveBeenCalledTimes(1);

        // Subsequent attempts without reactivation should also succeed
        outcome = await cooldown.attempt(fn);
        expect(outcome.value).toBe('success');
        expect(fn).toHaveBeenCalledTimes(2);
    });
});
