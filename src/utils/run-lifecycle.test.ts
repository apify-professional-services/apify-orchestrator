import { Actor } from 'apify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { onActorShuttingDown } from './run-lifecycle.js';

describe('run-lifecycle utils', () => {
    describe('onActorShuttingDown', () => {
        const eventManager = Actor.config.getEventManager();
        const mockCallback = vi.fn();

        onActorShuttingDown(mockCallback);

        afterEach(() => {
            vi.clearAllMocks();
        });

        it('runs the callback after the "migrating" event', () => {
            expect(mockCallback).toHaveBeenCalledTimes(0);
            eventManager.emit('migrating');
            expect(mockCallback).toHaveBeenCalledTimes(1);
        });

        it('runs the callback after the "exit" event', () => {
            expect(mockCallback).toHaveBeenCalledTimes(0);
            eventManager.emit('exit');
            expect(mockCallback).toHaveBeenCalledTimes(1);
        });

        it('runs the callback after the "aborting" event', () => {
            expect(mockCallback).toHaveBeenCalledTimes(0);
            eventManager.emit('aborting');
            expect(mockCallback).toHaveBeenCalledTimes(1);
        });
    });
});
