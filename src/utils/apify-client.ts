import { ApifyApiError } from 'apify-client';

import { FAIL_STATUSES, OK_STATUSES, TERMINAL_STATUSES } from '../constants.js';
import { RunFailStatus, RunOkStatus, RunTerminalStatus, RunStatus } from '../types.js';

export const MEMORY_LIMIT_EXCEEDED_ERROR_TYPE = 'actor-memory-limit-exceeded';
export const CONCURRENT_RUNS_LIMIT_EXCEEDED_ERROR_TYPE = 'concurrent-runs-limit-exceeded';

export const START_RUN_ERROR_TYPE = {
    MEMORY: Symbol('memory'),
    CONCURRENT_RUNS: Symbol('concurrent-runs'),
    OTHER: Symbol('other'),
} as const;

export type StartRunErrorType = (typeof START_RUN_ERROR_TYPE)[keyof typeof START_RUN_ERROR_TYPE];

/**
 * Identifies known error types, from the Apify client, when starting a run.
 */
export function getStartRunErrorType(error: unknown): StartRunErrorType {
    if (error instanceof ApifyApiError) {
        if (error.type === MEMORY_LIMIT_EXCEEDED_ERROR_TYPE) {
            return START_RUN_ERROR_TYPE.MEMORY;
        }
        if (error.type === CONCURRENT_RUNS_LIMIT_EXCEEDED_ERROR_TYPE) {
            return START_RUN_ERROR_TYPE.CONCURRENT_RUNS;
        }
    }
    return START_RUN_ERROR_TYPE.OTHER;
}

export function isRunOkStatus(status: RunStatus): status is RunOkStatus {
    return OK_STATUSES.includes(status as RunOkStatus);
}

export function isRunFailStatus(status: RunStatus): status is RunFailStatus {
    return FAIL_STATUSES.includes(status as RunFailStatus);
}

export function isRunTerminalStatus(status: RunStatus): status is RunTerminalStatus {
    return TERMINAL_STATUSES.includes(status);
}
