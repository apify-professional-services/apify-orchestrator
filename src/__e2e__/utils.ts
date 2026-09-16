import { Actor, log } from 'apify';

import type { ExtendedApifyClient, OrchestratorOptions } from '../index.js';
import { Orchestrator } from '../index.js';
import { TestActorRunner } from './test-actor-runner.js';

const CHILD_MEMORY_MB = 256;
const CHILD_WAIT_SECONDS = 3;

/**
 * A counter to ensure unique test indices for each orchestrator/client pair.
 * The counter is global because tests may create multiple orchestrators/clients,
 * each of which is assigned a unique index.
 */
let testCounter = 0;

export function testLog(testName: string) {
    return log.child({ prefix: `[${testName}]` });
}

export interface OrchestratorAndClient {
    orchestrator: Orchestrator;
    client: ExtendedApifyClient;
    testIndex: number;
}

export async function getOrchestratorAndClient(
    orchestratorOptions: Partial<OrchestratorOptions>,
): Promise<OrchestratorAndClient> {
    const orchestrator = new Orchestrator(orchestratorOptions);
    const client = await orchestrator.apifyClient();
    testCounter++;
    return { orchestrator, client, testIndex: testCounter };
}

export async function generateActorTestRunner(client: ExtendedApifyClient): Promise<TestActorRunner> {
    return TestActorRunner.new(client, { childMemoryMbytes: CHILD_MEMORY_MB, childWaitSeconds: CHILD_WAIT_SECONDS });
}

export async function getOrchestratorTrackedValue(index: number): Promise<unknown> {
    // Ensure Orchestrator state is persisted
    const eventManager = Actor.config.getEventManager();
    eventManager.emit('persistState');
    await eventManager.waitForAllListenersToComplete();

    // Indexing starts at 1; for the first orchestrator we use the default key without indices
    const key = index === 1 ? 'ORCHESTRATOR-CLIENT-RUNS' : `ORCHESTRATOR-${index}-CLIENT-${index}-RUNS`;

    log.info('Fetching orchestrator tracked value', { key });
    const value = await Actor.getValue(key);

    return value;
}

/**
 * Simulates a graceful abort of this Actor, by emitting the same event that the Apify platform emits,
 * and waits for all the listeners, such as the Orchestrator's one, to complete.
 */
export async function simulateGracefulAbort(): Promise<void> {
    const eventManager = Actor.config.getEventManager();
    eventManager.emit('aborting');
    await eventManager.waitForAllListenersToComplete();
}

export async function sleep(seconds: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, seconds * 1000);
    });
}
