import { type TrySync, TrySyncOutcome } from './try-sync.js';

/**
 * The reason reported by a `TryLimit` when it blocks the execution.
 */
export const LIMIT_REACHED_MESSAGE = 'limit-reached';

/**
 * A synchronization primitive that allows executing a function only while some measured value
 * stays below a given limit, for instance, the number of Runs in progress, or the memory they use.
 *
 * It does not keep track of the value itself: it reads it through the provided function
 * every time it is evaluated, so that the limit is always checked against the current state.
 */
export class TryLimit implements TrySync {
    private readonly limit: number;
    private readonly getCurrentValue: () => number;

    /**
     * @param limit the maximum value allowed for the function to be executed:
     * pass `Number.POSITIVE_INFINITY` to never block the execution.
     * @param getCurrentValue returns the current value to check against the limit, measured in the same unit.
     */
    constructor(limit: number, getCurrentValue: () => number) {
        this.limit = limit;
        this.getCurrentValue = getCurrentValue;
    }

    /**
     * Runs the provided function only if the current value is below the limit.
     */
    async attempt<T>(fn: () => Promise<T>): Promise<TrySyncOutcome<T>> {
        if (this.getCurrentValue() >= this.limit) return new TrySyncOutcome({ blocked: LIMIT_REACHED_MESSAGE });
        const result = await fn();
        return new TrySyncOutcome({ executed: result });
    }
}
