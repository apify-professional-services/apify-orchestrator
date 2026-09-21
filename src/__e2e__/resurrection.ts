import { log } from 'apify';

import type { ExtendedApifyClient, OrchestratorOptions } from '../types.js';
import { getActorId } from './actor-id.js';
import type { RunOutput } from './resurrection-test.js';
import type { TestResult } from './types.js';

export interface ResurrectionTestOutput {
    runsBeforeResurrection: { [runName: string]: RunOutput };
    runsAfterResurrection: { [runName: string]: RunOutput };
}

export async function runResurrectionTest(
    client: ExtendedApifyClient,
    runName: string,
    orchestratorOptions: Partial<OrchestratorOptions>,
): Promise<ResurrectionTestOutput> {
    const actorId = await getActorId();
    const testRun = await client.actor(actorId).call({ role: 'resurrection-test', orchestratorOptions }, { runName });

    // During the first execution, the child run shut itself down, and now we are resurrecting it.
    const resurrectedRun = await client.run(testRun.id).resurrect();
    await client.run(resurrectedRun.id).waitForFinish();

    const runsBeforeResurrection: { [runName: string]: RunOutput } = {};
    const runsAfterResurrection: { [runName: string]: RunOutput } = {};

    const outputIterator = client.dataset<RunOutput>(resurrectedRun.defaultDatasetId).listItems({ chunkSize: 100 });
    for await (const runOutput of outputIterator) {
        if (runOutput.resurrected) {
            runsAfterResurrection[runOutput.runName] = runOutput;
        } else {
            runsBeforeResurrection[runOutput.runName] = runOutput;
        }
    }

    return { runsBeforeResurrection, runsAfterResurrection };
}

export function checkResurrectionTestOutputCompleteness(
    runsBeforeResurrection: { [runName: string]: RunOutput },
    runsAfterResurrection: { [runName: string]: RunOutput },
): TestResult | null {
    if (Object.keys(runsBeforeResurrection).length === 0) {
        log.error('No runs found before resurrection');
        return { success: false, details: 'No runs found before resurrection' };
    }
    if (Object.keys(runsAfterResurrection).length !== Object.keys(runsBeforeResurrection).length) {
        log.error('Number of runs after resurrection does not match number before resurrection');
        return {
            success: false,
            details: 'Number of runs after resurrection does not match number before resurrection',
        };
    }

    for (const [runName, runOutput] of Object.entries(runsAfterResurrection)) {
        if (runOutput.status !== 'SUCCEEDED') {
            log.error(`Resurrected run ${runName} has unexpected status: ${runOutput.status}`);
            return { success: false, details: `Resurrected run ${runName} has unexpected status: ${runOutput.status}` };
        }
        const runOutputBeforeResurrection = runsBeforeResurrection[runName];
        if (!runOutputBeforeResurrection) {
            log.error(`No output found for run ${runName} before resurrection`);
            return { success: false, details: `No output found for run ${runName} before resurrection` };
        }
    }

    return null;
}
