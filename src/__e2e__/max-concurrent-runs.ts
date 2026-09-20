import type { TestResult } from './types.js';
import { generateActorTestRunner, getOrchestratorAndClient, testLog } from './utils.js';

const TEST_NAME = 'max-concurrent-runs';

/**
 * Checks that a client with `maxConcurrentRuns: 1` never keeps more than one Run in progress:
 * even though both Runs are requested at the same time, the second one must be started
 * only after the first one has finished.
 */
export async function childRunsLimitedByMaxConcurrentRuns(): Promise<TestResult> {
    const { client } = await getOrchestratorAndClient(
        {
            persistenceSupport: 'none',
            hideSensitiveInformation: false,
        },
        { maxConcurrentRuns: 1 },
    );

    const runner = await generateActorTestRunner(client);

    const [runA, runB] = await Promise.all([runner.call(1, 11), runner.call(2, 22)]);

    if (!runA || !runB) {
        return { success: false, details: 'One of the runs was not started successfully.' };
    }

    const outputA = await runA.getTotalOutput();
    const outputB = await runB.getTotalOutput();

    if (outputA !== 11 || outputB !== 22) {
        return { success: false, details: `Unexpected outputs: ${outputA}, ${outputB}` };
    }

    // Do not assume which Run was scheduled first: just check that the two Runs did not overlap.
    const [firstRun, secondRun] = [runA, runB].sort(
        (left, right) => left.run.startedAt.getTime() - right.run.startedAt.getTime(),
    );

    testLog(TEST_NAME).info('Both child Runs finished', {
        firstRun: { startedAt: firstRun.run.startedAt, finishedAt: firstRun.run.finishedAt },
        secondRun: { startedAt: secondRun.run.startedAt, finishedAt: secondRun.run.finishedAt },
    });

    if (secondRun.run.startedAt.getTime() < firstRun.run.finishedAt.getTime()) {
        return {
            success: false,
            details:
                `The Runs were in progress at the same time: ${secondRun.runName} started at ` +
                `${secondRun.run.startedAt.toISOString()}, before ${firstRun.runName} finished at ` +
                `${firstRun.run.finishedAt.toISOString()}`,
        };
    }

    return { success: true };
}
