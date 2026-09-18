import { Actor } from 'apify';

import type { RunInfo } from '../../types.js';
import { isRunOkStatus, isRunTerminalStatus } from '../../utils/apify-client.js';
import type { ClientContext } from '../client-context.js';

/**
 * Aborts all the Runs in progress when the Actor is gracefully aborted,
 * if the `abortAllRunsOnGracefulAbort` option is enabled.
 */
export function registerGracefulAbortHook(context: ClientContext): void {
    if (!context.options.abortAllRunsOnGracefulAbort) return;
    Actor.on('aborting', async () => context.abortAllRunsOnGracefulAbort());
}

export async function abortAllRuns(context: ClientContext): Promise<void> {
    await abortRuns(context, context.runTracker.getCurrentRuns());
}

export async function abortAllRunsOnGracefulAbort(context: ClientContext): Promise<void> {
    const currentRuns = context.runTracker.getCurrentRuns();
    const abortedRuns: { [requestId: string]: RunInfo } = Object.entries(currentRuns)
        // A Run that already finished or is shutting down is not being aborted by the Orchestrator.
        .filter(([_requestId, runInfo]) => !isRunTerminalStatus(runInfo.status) && isRunOkStatus(runInfo.status))
        .reduce((acc, [requestId, runInfo]) => ({ ...acc, [requestId]: runInfo }), {});
    // The Runs must be marked before being aborted, to avoid a race with any `waitForFinish` in progress.
    context.markRunsAbortedOnGracefulAbort(Object.values(abortedRuns).map((runInfo) => runInfo.runId));
    await abortRuns(context, abortedRuns);
}

async function abortRuns(context: ClientContext, runsToAbort: { [requestId: string]: RunInfo }): Promise<void> {
    context.logger.info('Aborting Runs', { currentRunNames: Object.keys(runsToAbort) });
    await Promise.all(
        Object.entries(runsToAbort).map(async ([requestId, runInfo]) => {
            const runClient = context.extendRunClient(requestId, runInfo.runId);
            context.logger.prefixed(requestId).info('Aborting Run', {}, { url: runInfo.runUrl });
            await runClient.abort().catch((error) => {
                context.logger.prefixed(requestId).error('Error aborting Run', { error });
            });
        }),
    );
}
