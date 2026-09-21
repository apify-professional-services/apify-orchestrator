import { log } from 'apify';
import type { ActorCallOptions } from 'apify-client';

import type { ExtendedActorClient, ExtendedApifyClient } from '../types.js';
import { getActorId } from './actor-id.js';
import { TestRun } from './test-run.js';
import type { Input } from './types.js';

export interface TestActorRunnerOptions {
    childWaitSeconds?: number;
    childMemoryMbytes?: number;
}

export class TestActorRunner {
    private readonly apifyClient: ExtendedApifyClient;
    private readonly actorId: string;
    private readonly options: TestActorRunnerOptions;
    private readonly actorClient: ExtendedActorClient;

    private constructor(apifyClient: ExtendedApifyClient, actorId: string, options: TestActorRunnerOptions) {
        this.apifyClient = apifyClient;
        this.actorId = actorId;
        this.options = options;
        this.actorClient = apifyClient.actor(actorId);
    }

    static async new(client: ExtendedApifyClient, options: TestActorRunnerOptions): Promise<TestActorRunner> {
        const actorId = await getActorId();
        return new TestActorRunner(client, actorId, options);
    }

    async start(index: number, numberToOutput?: number): Promise<TestRun | null> {
        const childInput: Input = { role: 'child', waitSeconds: this.options.childWaitSeconds, numberToOutput };
        const childOptions: ActorCallOptions = { memory: this.options.childMemoryMbytes };
        const runName = `child-${index}`;
        try {
            const run = await this.actorClient.start(childInput, { ...childOptions, runName });
            return new TestRun(this.apifyClient, run, runName);
        } catch (error) {
            log.exception(error as Error, `Error starting child actor ${index}`, {
                actorId: this.actorId,
                input: childInput,
                options: childOptions,
            });
            return null;
        }
    }

    async call(index: number, numberToOutput?: number): Promise<TestRun | null> {
        const startedRun = await this.start(index, numberToOutput);
        if (!startedRun) return null;
        const finishedRun = await this.apifyClient.run(startedRun.run.id).waitForFinish();
        return new TestRun(this.apifyClient, finishedRun, startedRun.runName);
    }
}
