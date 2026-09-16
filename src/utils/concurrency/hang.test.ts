import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { hangForever } from './hang.js';

describe('hangForever', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns a promise that never settles', async () => {
        const settled = vi.fn();

        // The promise never settles, so neither handler is ever called.
        void hangForever().then(settled, settled);

        const race = Promise.race([
            hangForever().then(() => 'settled'),
            new Promise((resolve) => {
                setTimeout(() => resolve('still-pending'), 60_000);
            }),
        ]);

        await vi.advanceTimersByTimeAsync(60_000);

        expect(await race).toBe('still-pending');
        expect(settled).not.toHaveBeenCalled();
    });
});
