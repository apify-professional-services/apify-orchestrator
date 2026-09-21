import type { ExtendedActorRun } from '../types.js';
import { getActorId } from './actor-id.js';
import type { Input, TestResult } from './types.js';
import { getOrchestratorAndClient, simulateGracefulAbort, sleep, testLog } from './utils.js';

const CHILD_MEMORY_MB = 256;

/** The child Run must stay in progress long enough to be aborted while the parent is waiting for it. */
const CHILD_WAIT_SECONDS = 120;

/** How long to wait before concluding that a method which should never return, actually never returns. */
const HANGING_CHECK_SECONDS = 30;

type CallOutcome = { run: ExtendedActorRun } | { error: Error };

/**
 * Checks that, when the Orchestrator aborts a child Run because the Actor was gracefully aborted,
 * `call` returns the aborted Run, flagged with `abortedOnGracefulAbort`,
 * if the `returnAbortedRunsOnGracefulAbort` option is enabled.
 */
export async function childRunReturnedOnGracefulAbort(): Promise<TestResult> {
    const { call } = await callChildAndGracefullyAbort('graceful-abort-returned-child', {
        returnAbortedRunsOnGracefulAbort: true,
    });

    const outcome = await call;

    if ('error' in outcome) {
        return { success: false, details: `\`call\` threw an error: ${outcome.error.message}` };
    }
    if (outcome.run.status !== 'ABORTED') {
        return { success: false, details: `Unexpected status of the aborted Run: ${outcome.run.status}` };
    }
    if (!outcome.run.abortedOnGracefulAbort) {
        return { success: false, details: 'The aborted Run is not flagged with `abortedOnGracefulAbort`' };
    }

    return { success: true };
}

/**
 * Checks that, when the Orchestrator aborts a child Run because the Actor was gracefully aborted,
 * `call` never returns, which is the default behavior.
 */
export async function childRunNeverReturnedOnGracefulAbort(): Promise<TestResult> {
    const { call } = await callChildAndGracefullyAbort('graceful-abort-hanging-child', {});

    const outcome = await Promise.race<CallOutcome | { pending: true }>([
        call,
        sleep(HANGING_CHECK_SECONDS).then(() => ({ pending: true as const })),
    ]);

    if ('pending' in outcome) return { success: true };

    return {
        success: false,
        details:
            'error' in outcome
                ? `\`call\` threw an error instead of hanging: ${outcome.error.message}`
                : `\`call\` returned a Run with status ${outcome.run.status} instead of hanging`,
    };
}

/**
 * Calls a child Actor, then simulates a graceful abort of this Actor while waiting for the child Run to finish.
 *
 * @returns the pending `call`, which the caller is expected to await, or to check that it never settles
 */
async function callChildAndGracefullyAbort(
    runName: string,
    orchestratorOptions: { returnAbortedRunsOnGracefulAbort?: boolean },
): Promise<{ call: Promise<CallOutcome> }> {
    const { client } = await getOrchestratorAndClient({
        persistenceSupport: 'none',
        hideSensitiveInformation: false,
        abortAllRunsOnGracefulAbort: true,
        ...orchestratorOptions,
    });

    const actorId = await getActorId();
    const childInput: Input = { role: 'child', waitSeconds: CHILD_WAIT_SECONDS };

    // The `call` is not awaited here: it is expected to be in progress when the graceful abort occurs.
    const call: Promise<CallOutcome> = client
        .actor(actorId)
        .call(childInput, { memory: CHILD_MEMORY_MB, runName })
        .then(
            (run) => ({ run }),
            (error: Error) => ({ error }),
        );

    // Make sure the child Run has started, and it is tracked by the Orchestrator, before aborting it.
    await client.actorRunByRequest(runName);

    testLog(runName).info('The child Run started: simulating a graceful abort');
    await simulateGracefulAbort();

    return { call };
}
