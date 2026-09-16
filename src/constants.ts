import { ACTOR_JOB_TERMINAL_STATUSES } from '@apify/consts';

import type { OrchestratorOptions, PlatformRunJobStatus, RunStatus, SplitRules } from './types.js';

/**
 * @internal the polling interval for the Orchestrator's main loop.
 */
export const MAIN_LOOP_INTERVAL_MS = 1_000;
/**
 * @internal the cooldown interval for the Orchestrator's main loop.
 */
export const MAIN_LOOP_COOLDOWN_MS = 10_000;

/**
 * @internal the default options for the Orchestrator, that can be overriden by the user.
 */
export const DEFAULT_ORCHESTRATOR_OPTIONS: OrchestratorOptions = {
    enableLogs: true,
    hideSensitiveInformation: true,
    persistenceSupport: 'none',
    persistencePrefix: 'ORCHESTRATOR-',
    abortAllRunsOnGracefulAbort: true,
    returnAbortedRunsOnGracefulAbort: false,
    retryOnInsufficientResources: true,
};

/**
 * The size limit for the Apify payload in bytes.
 */
export const APIFY_PAYLOAD_BYTES_LIMIT = 9_437_184;

/**
 * @internal the default split rules for the Orchestrator for splitting input objects.
 */
export const DEFAULT_SPLIT_RULES: SplitRules = {
    respectApifyMaxPayloadSize: true,
};

/**
 * Represents run job statuses that can exist only within the orchestrator context.
 */
export const ORCHESTRATOR_RUN_JOB_STATUSES = {
    LOST: 'LOST',
} as const;

/**
 * Represents the run job statuses that are considered not failed.
 */
export const OK_STATUSES = ['READY', 'RUNNING', 'SUCCEEDED'] as const satisfies readonly RunStatus[];
/**
 * Represents the run job statuses that are considered failed.
 * Notice that `LOST` is included in the failed statuses, because a lost run cannot succeed.
 */
export const FAIL_STATUSES = [
    'FAILED',
    'ABORTING',
    'ABORTED',
    'TIMING-OUT',
    'TIMED-OUT',
    'LOST',
] as const satisfies readonly RunStatus[];
/**
 * Represents the run job statuses that are considered terminal.
 * Notice that `LOST` is included in the terminal statuses, because we cannot track a lost run's progress.
 */
export const TERMINAL_STATUSES = [
    ...(ACTOR_JOB_TERMINAL_STATUSES as readonly PlatformRunJobStatus[]),
    'LOST',
] as const satisfies readonly RunStatus[];
