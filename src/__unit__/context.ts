import { ExtApifyClient } from '../clients/apify-client.js';
import type { ClientContext } from '../context/client-context.js';
import { generateClientContext } from '../context/client-context.js';
import type { OrchestratorContext } from '../context/orchestrator-context.js';
import { generateOrchestratorContext } from '../context/orchestrator-context.js';
import type { ExtendedClientOptions, OrchestratorOptions } from '../types.js';

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
    clientOptions: ExtendedClientOptions = {},
): ClientContext {
    const orchestratorContext = getTestContext(overrideOptions);
    const { name, maxConcurrentRuns, ...superClientOptions } = clientOptions;

    // Create empty tracked runs for testing
    const trackedRuns = {
        current: {},
        failedHistory: {},
    };

    return generateClientContext(orchestratorContext, {
        clientName: name ?? 'test-client',
        trackedRuns,
        maxConcurrentRuns,
        createClient: (context) => new ExtApifyClient(context, superClientOptions),
    });
}
