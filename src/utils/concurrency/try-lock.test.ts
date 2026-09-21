import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TryLock } from './try-lock.js';
import type { TrySyncOutcome } from './try-sync.js';

describe('TryLock', () => {
    const fn = vi.fn();
    let lock: TryLock;

    beforeEach(() => {
        vi.mocked(fn).mockResolvedValue('success');
        lock = new TryLock();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('allows execution when the lock is free', async () => {
        const outcome = await lock.attempt(fn);

        expect(outcome.value).toBe('success');
        expect(fn).toHaveBeenCalled();
    });

    it('blocks execution when the lock is already held', async () => {
        const blockingOp = vi.fn();
        let resolveOp: (value: string) => void;
        vi.mocked(blockingOp).mockImplementation(async () => {
            return new Promise<string>((resolve) => {
                resolveOp = resolve;
            });
        });

        let secondOutcome: TrySyncOutcome<string>;

        // After a short delay, attempt to acquire the lock again, which should be blocked.
        // Then, release the first lock.
        setTimeout(async () => {
            secondOutcome = await lock.attempt(fn);
            resolveOp('success');
        }, 10);

        // Acquire the lock
        const firstOutcome = await lock.attempt(blockingOp);

        expect(firstOutcome.value).toBe('success');
        expect(secondOutcome!.value).toBe('lock-held');
        expect(blockingOp).toHaveBeenCalledTimes(1);
    });
});
