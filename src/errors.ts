import { isDefined } from './utils/typing.js';

/**
 * Base class for all Apify Orchestrator errors
 */
export abstract class OrchestratorError extends Error {
    abstract readonly code: string;
    readonly requestId?: string;

    protected constructor(message: string, requestId?: string) {
        super(message);
        this.name = this.constructor.name;
        this.requestId = requestId;
    }
}

/**
 * Error thrown when there's insufficient memory to start a run
 */
export class InsufficientMemoryError extends OrchestratorError {
    readonly code = 'INSUFFICIENT_MEMORY';
    readonly requiredMemoryMBs?: number;

    constructor(requestId: string, requiredMemoryMBs?: number) {
        const requiredMemoryText = isDefined(requiredMemoryMBs) ? `${requiredMemoryMBs / 1024}GB` : 'unknown';
        super(`Insufficient memory to start run '${requestId}'. Required memory: ${requiredMemoryText}.`, requestId);
        this.requiredMemoryMBs = requiredMemoryMBs;
    }
}

/**
 * Error thrown when there are not enough actor jobs available to start a run
 */
export class InsufficientActorJobsError extends OrchestratorError {
    readonly code = 'INSUFFICIENT_ACTOR_JOBS';

    constructor(requestId: string) {
        super(`Insufficient actor jobs to start run '${requestId}'.`, requestId);
    }
}

/**
 * Error thrown when the same request (implicit, hash-based request ID) is resolved more than once
 * in the same process, with no resurrection in between, and the previous Run is still active or
 * succeeded. Provide an explicit `runName` if you intend to start multiple Runs with the same input
 * and options.
 */
export class AmbiguousRunRequestError extends OrchestratorError {
    readonly code = 'AMBIGUOUS_RUN_REQUEST';

    constructor(requestId: string) {
        super(
            `A Run for request '${requestId}' was already started or is in progress in this session. ` +
                `If you intend to start multiple Runs with the same input and options, provide an explicit 'runName' for each.`,
            requestId,
        );
    }
}

export function isInsufficientResourcesError(
    error: unknown,
): error is InsufficientMemoryError | InsufficientActorJobsError {
    return error instanceof InsufficientMemoryError || error instanceof InsufficientActorJobsError;
}
