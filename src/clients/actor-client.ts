import type { ActorLastRunOptions, ActorStartOptions, Dictionary, RunClient } from 'apify-client';
import { ActorClient } from 'apify-client';

import type { ClientContext } from '../context/client-context.js';
import { RunSource } from '../entities/run-source.js';
import { buildRunStartRequest } from '../entities/run-start-request.js';
import type {
    ActorRunRequest,
    ExtendedActorCallOptions,
    ExtendedActorClient,
    ExtendedActorRun,
    ExtendedActorStartOptions,
    SplitRules,
} from '../types.js';
import { isDefined } from '../utils/typing.js';
import type { ExtApifyClient } from './apify-client.js';
import type { ExtRunClient } from './run-client.js';

export class ExtActorClient extends ActorClient implements ExtendedActorClient {
    private readonly runSource = new RunSource({
        type: 'actor',
        id: this.id,
        start: super.start.bind(this),
        defaultMemoryMbytes: this.defaultMemoryMbytes.bind(this),
    });

    private readonly context: ClientContext;
    override apifyClient: ExtApifyClient;

    /**
     * @internal
     */
    constructor(context: ClientContext, apifyClient: ExtApifyClient, actorClient: ActorClient) {
        super({
            baseUrl: actorClient.baseUrl,
            publicBaseUrl: actorClient.publicBaseUrl,
            apifyClient,
            httpClient: actorClient.httpClient,
            id: actorClient.id,
            params: actorClient.params,
        });
        this.context = context;
        this.apifyClient = apifyClient;
    }

    enqueue(...runRequests: ActorRunRequest[]): string[] {
        return runRequests.map((runRequest) => {
            const runStartRequest = buildRunStartRequest({
                source: this.runSource,
                runName: runRequest.runName,
                input: runRequest.input,
                options: runRequest.options,
            });
            this.apifyClient.findOrRequestRunStart(runStartRequest);
            return runStartRequest.requestId;
        });
    }

    enqueueBatch<T>(
        namePrefix: string,
        sources: T[],
        inputGenerator: (chunk: T[]) => Dictionary,
        overrideSplitRules?: Partial<SplitRules>,
        options?: ActorStartOptions,
    ): string[] {
        return this.enqueue(
            ...this.context.generateRunRequests({
                namePrefix,
                sources,
                inputGenerator,
                overrideSplitRules,
                options,
            }),
        );
    }

    /**
     * FIXME: change the `input` parameter type from `object` to `Dictionary` after the `apify-client-js` issue is resolved:
     * https://github.com/apify/apify-client-js/issues/818.
     */
    override async start(input?: object, options?: ExtendedActorStartOptions): Promise<ExtendedActorRun> {
        const { runName, ...startOptions } = options ?? {};
        return this.apifyClient.findOrStartRun(
            buildRunStartRequest({
                source: this.runSource,
                runName,
                input: input as Dictionary,
                options: Object.keys(startOptions).length === 0 ? undefined : startOptions,
            }),
        );
    }

    /**
     * If the Orchestrator aborts the Run because the Actor was gracefully aborted
     * (see the `abortAllRunsOnGracefulAbort` option), this method does not return: it hangs until the process is
     * killed, unless the `returnAbortedRunsOnGracefulAbort` option is enabled, in which case it returns the aborted
     * Run, with its `abortedOnGracefulAbort` flag set to `true`.
     *
     * FIXME: change the `input` parameter type from `object` to `Dictionary` after the `apify-client-js` issue is resolved:
     * https://github.com/apify/apify-client-js/issues/818.
     */
    override async call(input?: object, options?: ExtendedActorCallOptions): Promise<ExtendedActorRun> {
        const { waitSecs, log, ...startOptions } = options ?? {};
        // FIXME: the `log` option is not supported because we are not using `super.call()`.
        if (log) this.context.logger.warning('The `log` option is not supported yet in the Orchestrator.');
        const startedRun = await this.start(input, startOptions);
        return this.apifyClient.extendedRunClient(startedRun.requestId, startedRun.id).waitForFinish({ waitSecs });
    }

    override lastRun(options?: ActorLastRunOptions): RunClient | ExtRunClient {
        const runClient = super.lastRun(options);
        return isDefined(runClient.id) ? this.apifyClient.run(runClient.id) : runClient;
    }

    async startRuns(...runRequests: ActorRunRequest[]): Promise<ExtendedActorRun[]> {
        return Promise.all(
            runRequests.map(async ({ runName, input, options }) => this.start(input, { ...options, runName })),
        );
    }

    async startBatch<T>(
        namePrefix: string,
        sources: T[],
        inputGenerator: (chunk: T[]) => Dictionary,
        overrideSplitRules?: Partial<SplitRules>,
        options?: ActorStartOptions,
    ): Promise<ExtendedActorRun[]> {
        return this.startRuns(
            ...this.context.generateRunRequests({
                namePrefix,
                sources,
                inputGenerator,
                overrideSplitRules,
                options,
            }),
        );
    }

    async callRuns(...runRequests: ActorRunRequest[]): Promise<ExtendedActorRun[]> {
        return Promise.all(
            runRequests.map(async ({ runName, input, options }) => this.call(input, { ...options, runName })),
        );
    }

    async callBatch<T>(
        namePrefix: string,
        sources: T[],
        inputGenerator: (chunk: T[]) => Dictionary,
        overrideSplitRules?: Partial<SplitRules>,
        options?: ActorStartOptions,
    ): Promise<ExtendedActorRun[]> {
        return this.callRuns(
            ...this.context.generateRunRequests({
                namePrefix,
                sources,
                inputGenerator,
                overrideSplitRules,
                options,
            }),
        );
    }

    private async defaultMemoryMbytes(): Promise<number | undefined> {
        const actor = await this.get();
        return actor?.defaultRunOptions.memoryMbytes;
    }
}
