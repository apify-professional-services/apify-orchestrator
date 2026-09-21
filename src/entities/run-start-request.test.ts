import type { ActorRun } from 'apify-client';
import { describe, expect, it } from 'vitest';

import { RunSource } from './run-source.js';
import { buildRunStartRequest } from './run-start-request.js';

const notImplementedStart = async (): Promise<ActorRun> => {
    throw new Error('Not implemented for this test');
};

describe('buildRunStartRequest', () => {
    const runSource = new RunSource({ type: 'actor', id: 'test-actor-id', start: notImplementedStart });

    it('returns the runName as-is as the request ID when provided, regardless of input/options', () => {
        const { requestId } = buildRunStartRequest({
            source: runSource,
            input: { a: 1 },
            options: { memory: 1024 },
            runName: 'my-run-name',
        });
        expect(requestId).toBe('my-run-name');
    });

    it('generates a stable, deterministic request ID when runName is not provided', () => {
        const first = buildRunStartRequest({ source: runSource, input: { a: 1 }, options: { memory: 1024 } });
        const second = buildRunStartRequest({ source: runSource, input: { a: 1 }, options: { memory: 1024 } });
        expect(first.requestId).toEqual(second.requestId);
    });

    it('generates different request IDs for different input', () => {
        const idA = buildRunStartRequest({ source: runSource, input: { a: 1 } }).requestId;
        const idB = buildRunStartRequest({ source: runSource, input: { a: 2 } }).requestId;
        expect(idA).not.toEqual(idB);
    });

    it('generates different request IDs for different options', () => {
        const idA = buildRunStartRequest({ source: runSource, input: { a: 1 }, options: { memory: 1024 } }).requestId;
        const idB = buildRunStartRequest({ source: runSource, input: { a: 1 }, options: { memory: 2048 } }).requestId;
        expect(idA).not.toEqual(idB);
    });

    it('generates different request IDs for different source IDs', () => {
        const sourceA = new RunSource({ type: 'actor', id: 'actor-a', start: notImplementedStart });
        const sourceB = new RunSource({ type: 'actor', id: 'actor-b', start: notImplementedStart });

        const idA = buildRunStartRequest({ source: sourceA, input: { a: 1 } }).requestId;
        const idB = buildRunStartRequest({ source: sourceB, input: { a: 1 } }).requestId;
        expect(idA).not.toEqual(idB);
    });

    it('generates different request IDs for different source types', () => {
        const actorSource = new RunSource({ type: 'actor', id: 'same-id', start: notImplementedStart });
        const taskSource = new RunSource({ type: 'task', id: 'same-id', start: notImplementedStart });

        const idA = buildRunStartRequest({ source: actorSource, input: { a: 1 } }).requestId;
        const idB = buildRunStartRequest({ source: taskSource, input: { a: 1 } }).requestId;
        expect(idA).not.toEqual(idB);
    });

    it('treats an empty string runName the same as an omitted one', () => {
        const withEmptyName = buildRunStartRequest({ source: runSource, input: { a: 1 }, runName: '' });
        const withoutName = buildRunStartRequest({ source: runSource, input: { a: 1 } });
        expect(withEmptyName.requestId).toEqual(withoutName.requestId);
    });
});
