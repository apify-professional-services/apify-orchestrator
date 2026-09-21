import type { ApifyEnv } from 'apify';
import { Actor } from 'apify';
import { ActorClient } from 'apify-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MAIN_LOOP_INTERVAL_MS } from './constants.js';
import { Orchestrator } from './index.js';

describe('Apify Orchestrator', () => {
    let orchestrator: Orchestrator;

    beforeEach(async () => {
        vi.useFakeTimers();
        orchestrator = new Orchestrator({
            enableLogs: false,
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.resetAllMocks();
    });

    it('makes persist prefixes unique', () => {
        const orchestrator1 = new Orchestrator({ persistencePrefix: 'TEST-' });
        const orchestrator2 = new Orchestrator({ persistencePrefix: 'TEST-' });

        expect(orchestrator1.options.persistencePrefix).toEqual('TEST-');
        expect(orchestrator2.options.persistencePrefix).toEqual('TEST-2-');
    });

    it('takes the token from the environment if not provided', async () => {
        const getEnvSpy = vi.spyOn(Actor, 'getEnv').mockReturnValue({ token: 'my-env-token' } as ApifyEnv);
        const client = await orchestrator.apifyClient({ name: 'client-without-token' });
        expect(getEnvSpy).toHaveBeenCalled();
        expect(client.token).toEqual('my-env-token');
    });

    it.each([0, -1])('rejects maxConcurrentRuns of %i', async (maxConcurrentRuns) => {
        await expect(orchestrator.apifyClient({ maxConcurrentRuns })).rejects.toThrow(
            'maxConcurrentRuns must be a positive number',
        );
    });

    it('creates a client with a valid maxConcurrentRuns', async () => {
        await expect(
            orchestrator.apifyClient({ name: 'client-with-max', maxConcurrentRuns: 5 }),
        ).resolves.toBeDefined();
    });

    it('starts the scheduler upon client creation', async () => {
        const startSpy = vi.spyOn(ActorClient.prototype, 'start');
        const client = await orchestrator.apifyClient({ name: 'client-going-to-start' });
        client.actor('test').enqueue({ runName: 'test' });
        vi.advanceTimersByTime(MAIN_LOOP_INTERVAL_MS);
        expect(startSpy).toHaveBeenCalledTimes(1);
    });

    it('makes client names unique', async () => {
        const client1 = await orchestrator.apifyClient({ name: 'test' });
        const client2 = await orchestrator.apifyClient({ name: 'test' });

        expect(client1.clientName).toEqual('test');
        expect(client2.clientName).toEqual('test-2');
    });

    it('gives clients a default unique name', async () => {
        const client1 = await orchestrator.apifyClient();
        const client2 = await orchestrator.apifyClient();

        expect(client1.clientName).toEqual('CLIENT');
        expect(client2.clientName).toEqual('CLIENT-2');
    });

    // TODO: test different configurations?
});
