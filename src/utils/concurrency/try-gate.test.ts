import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TryGate } from './try-gate.js';

describe('TryGate', () => {
    const fn = vi.fn();
    let gate: TryGate;

    beforeEach(() => {
        vi.mocked(fn).mockResolvedValue('success');
        gate = new TryGate();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('allows execution when the gate is open', async () => {
        const outcome = await gate.attempt(fn);

        expect(outcome.value).toBe('success');
        expect(fn).toHaveBeenCalled();
    });

    it('blocks execution when the gate is closed', async () => {
        gate.close();
        const outcome = await gate.attempt(fn);

        expect(outcome.value).toBe('gate-closed');
        expect(fn).not.toHaveBeenCalled();
    });
});
