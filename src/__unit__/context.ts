import type { ApifyClientOptions } from 'apify-client';

import { ExtApifyClient } from '../clients/apify-client.js';
import type { ClientContext } from '../context/client-context.js';
import { generateClientContext } from '../context/client-context.js';
import type { OrchestratorContext } from '../context/orchestrator-context.js';
import { generateOrchestratorContext } from '../context/orchestrator-context.js';
import type { OrchestratorOptions } from '../types.js';

const DEFAULT_TEST_OPTIONS: OrchestratorOptions = {
    enableLogs: false,
    hideSensitiveInformation: false,
    persistenceSupport: 'none',
    persistencePrefix: 'TEST-',
    abortAllRunsOnGracefulAbort: false,
    returnAbortedRunsOnGracefulAbort: false,
    retryOnInsufficientResources: false,
};

export function getTestOptions(overrides?: Partial<OrchestratorOptions>): OrchestratorOptions {
    return { ...DEFAULT_TEST_OPTIONS, ...overrides };
}

export function getTestContext(overrideOptions?: Partial<OrchestratorOptions>): OrchestratorContext {
    const options = getTestOptions(overrideOptions);
    return generateOrchestratorContext(options);
}

/**
 * Generates a client context, which already owns its own `ExtApifyClient`, available as `context.client`.
 */
export function getClientContext(
    overrideOptions?: Partial<OrchestratorOptions>,
    clientOptions: ApifyClientOptions = {},
): ClientContext {
    const orchestratorContext = getTestContext(overrideOptions);

    // Create empty tracked runs for testing
    const trackedRuns = {
        current: {},
        failedHistory: {},
    };

    return generateClientContext(orchestratorContext, {
        clientName: 'test-client',
        trackedRuns,
        createClient: (context) => new ExtApifyClient(context, clientOptions),
    });
}
