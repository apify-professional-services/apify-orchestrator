import { Actor, log } from 'apify';

import type { DatasetItem, OrchestratorOptions } from '../index.js';
import { Orchestrator } from '../index.js';
import { TestActorRunner } from './test-actor-runner.js';

const ABORTED_FLAG_KEY = 'ABORTED';
const CHILD_MEMORY_MB = 256;
const CHILD_WAIT_SECONDS = 3;

export interface RunOutput extends DatasetItem {
    runName: string;
    runId: string;
    status: string;
    resurrected: boolean;
}

export async function handleResurrectionTest(orchestratorOptions?: Partial<OrchestratorOptions>) {
    const abortedFlag = await Actor.getValue<boolean>(ABORTED_FLAG_KEY);
    if (abortedFlag) {
        log.info('Resuming resurrection test after shutdown');
        await completeRunsAfterResurrection(orchestratorOptions);
    } else {
        log.info('Starting resurrection test and shutting down');
        await startRunsAndShutdownBeforeResurrection(orchestratorOptions);
    }
}

async function startRunsAndShutdownBeforeResurrection(
    orchestratorOptions?: Partial<OrchestratorOptions>,
): Promise<void> {
    const runner = await getRunner(orchestratorOptions);
    const runs = await Promise.all(
        Array.from({ length: 3 }).map(async (_, index) => {
            const childNumber = index + 1;
            // Start but do not wait for completion
            return await runner.start(childNumber);
        }),
    );
    for (const run of runs) {
        if (!run) continue;
        const {
            runName,
            run: { id, status },
        } = run;
        await Actor.pushData<RunOutput>({ runName, runId: id, status, resurrected: false });
    }
    await Actor.setValue(ABORTED_FLAG_KEY, true);
    await Actor.exit('Graceful shutdown for resurrection test');
}

async function completeRunsAfterResurrection(orchestratorOptions?: Partial<OrchestratorOptions>): Promise<void> {
    const runner = await getRunner(orchestratorOptions);
    const runs = await Promise.all(
        Array.from({ length: 3 }).map(async (_, index) => {
            const childNumber = index + 1;
            // Start and wait for completion
            return await runner.call(childNumber);
        }),
    );
    for (const run of runs) {
        if (!run) continue;
        const {
            runName,
            run: { id, status },
        } = run;
        await Actor.pushData<RunOutput>({ runName, runId: id, status, resurrected: true });
    }
}

async function getRunner(orchestratorOptions?: Partial<OrchestratorOptions>): Promise<TestActorRunner> {
    const orchestrator = new Orchestrator(orchestratorOptions);
    const client = await orchestrator.apifyClient();
    const runner = await TestActorRunner.new(client, {
        childWaitSeconds: CHILD_WAIT_SECONDS,
        childMemoryMbytes: CHILD_MEMORY_MB,
    });
    return runner;
}
