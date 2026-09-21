import { beforeEach, describe, expect, it, vi } from 'vitest';

import { synchronizedAttempt, type TrySync, TrySyncOutcome } from './try-sync.js';

class TestTrySync implements TrySync {
    shouldExecute: boolean;

    constructor(shouldExecute: boolean) {
        this.shouldExecute = shouldExecute;
    }

    async attempt<T>(fn: () => Promise<T>): Promise<TrySyncOutcome<T>> {
        if (this.shouldExecute) {
            const result = await fn();
            return new TrySyncOutcome({ executed: result });
        }
        return new TrySyncOutcome({ blocked: 'blocked' });
    }
}

describe('synchronizedAttempt', () => {
    let op: () => Promise<string>;

    beforeEach(() => {
        op = vi.fn().mockResolvedValue('executed');
    });

    it('executes the critical section when all synchronizers allow it', async () => {
        const sync1 = new TestTrySync(true);
        const sync2 = new TestTrySync(true);

        const result = await synchronizedAttempt(op, [sync1, sync2]);

        expect(result.value).toBe('executed');
    });

    it('blocks the critical section when any synchronizer blocks it', async () => {
        const sync1 = new TestTrySync(true);
        const sync2 = new TestTrySync(false);

        const result = await synchronizedAttempt(op, [sync1, sync2]);

        expect(result.value).toBe('blocked');
    });

    it('blocks the critical section when the first synchronizer blocks it', async () => {
        const sync1 = new TestTrySync(false);
        const sync2 = new TestTrySync(true);

        const result = await synchronizedAttempt(op, [sync1, sync2]);

        expect(result.value).toBe('blocked');
    });

    it('executes the critical section when there are no synchronizers', async () => {
        const result = await synchronizedAttempt(op, []);

        expect(result.value).toBe('executed');
    });
});
