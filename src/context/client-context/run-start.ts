import type { RunStartRequest } from '../../entities/run-start-request.js';
import type { ExtendedActorRun } from '../../types.js';
import type { ClientContext } from '../client-context.js';

export function findOrRequestRunStart(
    context: ClientContext,
    runRequest: RunStartRequest,
): () => Promise<ExtendedActorRun> {
    return context.searchOkRunMatchingRequest(runRequest).match({
        promise: (waitForStart) => waitForStart,
        runInfo:
            ({ runId }) =>
            async () =>
                getRunObjectOrStartNew(context, runRequest, runId),
        notFound: () => context.runScheduler.requestRunStart(runRequest),
    });
}

export async function findOrStartRun(context: ClientContext, runRequest: RunStartRequest): Promise<ExtendedActorRun> {
    return context.searchOkRunMatchingRequest(runRequest).match({
        promise: async (waitForStart) => waitForStart(),
        runInfo: async ({ runId }) => getRunObjectOrStartNew(context, runRequest, runId),
        notFound: async () => context.runScheduler.startRun(runRequest),
    });
}

async function getRunObjectOrStartNew(
    context: ClientContext,
    runRequest: RunStartRequest,
    existingRunId: string,
): Promise<ExtendedActorRun> {
    const existingRun = await context.extendRunClient(runRequest.requestId, existingRunId).get();
    if (existingRun) return existingRun;
    // If the Run client could not retrieve the Run object, we proceed to start a new one.
    return context.runScheduler.startRun(runRequest);
}
