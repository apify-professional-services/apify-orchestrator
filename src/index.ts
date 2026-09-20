import { Actor } from 'apify';

import { ExtApifyClient } from './clients/apify-client.js';
import { DEFAULT_ORCHESTRATOR_OPTIONS } from './constants.js';
import { generateClientContext } from './context/client-context.js';
import type { OrchestratorContext } from './context/orchestrator-context.js';
import { generateOrchestratorContext } from './context/orchestrator-context.js';
import type { TrackedRuns } from './run-tracker.js';
import type { ApifyOrchestrator, ExtendedApifyClient, ExtendedClientOptions, OrchestratorOptions } from './types.js';
import { makeNameUnique, makePrefixUnique } from './utils/naming.js';
import type { Storage } from './utils/storage.js';
import { buildStorage } from './utils/storage.js';

export * from './constants.js';
export * from './types.js';
export * from './errors.js';

const takenPersistPrefixes = new Set<string>();
const takenClientNames = new Set<string>();

const TRACKED_RUNS_KEY = 'RUNS';

export class Orchestrator implements ApifyOrchestrator {
    readonly options: OrchestratorOptions;

    protected readonly context: OrchestratorContext;
    protected readonly storage?: Storage;

    constructor(options: Partial<OrchestratorOptions> = {}) {
        const fullOptions = { ...DEFAULT_ORCHESTRATOR_OPTIONS, ...options };
        fullOptions.persistencePrefix = makePrefixUnique(fullOptions.persistencePrefix, takenPersistPrefixes);
        takenPersistPrefixes.add(fullOptions.persistencePrefix);
        this.options = fullOptions;

        this.context = generateOrchestratorContext(this.options);
        this.storage = buildStorage(this.context);
    }

    async apifyClient(options: ExtendedClientOptions = {}): Promise<ExtendedApifyClient> {
        const { name, maxConcurrentRuns, ...superClientOptions } = options;

        const clientName = makeNameUnique(name ?? 'CLIENT', takenClientNames);
        takenClientNames.add(clientName);

        superClientOptions.token ??= Actor.getEnv().token ?? undefined;

        // Create the default object here to avoid shared references.
        const defaultTrackedRuns = {
            current: {},
            failedHistory: {},
        };

        const storagePrefix = `${this.options.persistencePrefix}${clientName}-`;
        const storageKey = `${storagePrefix}${TRACKED_RUNS_KEY}`;
        const trackedRuns =
            (await this.storage?.useState<TrackedRuns>(storageKey, defaultTrackedRuns)) ?? defaultTrackedRuns;

        const clientContext = generateClientContext(this.context, {
            clientName,
            trackedRuns,
            maxConcurrentRuns,
            createClient: (context) => new ExtApifyClient(context, superClientOptions),
        });

        return clientContext.client;
    }
}
