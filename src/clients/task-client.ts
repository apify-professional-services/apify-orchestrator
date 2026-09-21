import type { Dictionary, RunClient, TaskLastRunOptions, TaskStartOptions } from 'apify-client';
import { TaskClient } from 'apify-client';

import type { ClientContext } from '../context/client-context.js';
import { RunSource } from '../entities/run-source.js';
import { buildRunStartRequest } from '../entities/run-start-request.js';
import type {
    ExtendedActorRun,
    ExtendedTaskCallOptions,
    ExtendedTaskClient,
    ExtendedTaskStartOptions,
    SplitRules,
    TaskRunRequest,
} from '../types.js';
import { isDefined } from '../utils/typing.js';
import type { ExtRunClient } from './run-client.js';

export class ExtTaskClient extends TaskClient implements ExtendedTaskClient {
    private readonly runSource = new RunSource({
        type: 'task',
        id: this.id,
        start: super.start.bind(this),
        defaultMemoryMbytes: this.defaultMemoryMbytes.bind(this),
    });

    private readonly context: ClientContext;

    constructor(context: ClientContext, taskClient: TaskClient) {
        super({
            baseUrl: taskClient.baseUrl,
            publicBaseUrl: taskClient.publicBaseUrl,
            apifyClient: context.client,
            httpClient: taskClient.httpClient,
            id: taskClient.id,
            params: taskClient.params,
        });
        this.context = context;
    }

    enqueue(...runRequests: TaskRunRequest[]): string[] {
        return runRequests.map((runRequest) => {
            const { runName, input, options } = runRequest;
            const runStartRequest = buildRunStartRequest({
                source: this.runSource,
                runName,
                input,
                options,
            });
            this.context.findOrRequestRunStart(runStartRequest);
            return runStartRequest.requestId;
        });
    }

    enqueueBatch<T>(
        namePrefix: string,
        sources: T[],
        inputGenerator: (chunk: T[]) => Dictionary,
        overrideSplitRules?: Partial<SplitRules>,
        options?: TaskStartOptions,
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

    override async start(input?: Dictionary, options: ExtendedTaskStartOptions = {}): Promise<ExtendedActorRun> {
        const { runName, ...runOptions } = options;
        return this.context.findOrStartRun(
            buildRunStartRequest({
                source: this.runSource,
                runName,
                input,
                options: Object.keys(runOptions).length === 0 ? undefined : runOptions,
            }),
        );
    }

    /**
     * If the Orchestrator aborts the Run because the Actor was gracefully aborted
     * (see the `abortAllRunsOnGracefulAbort` option), this method does not return: it hangs until the process is
     * killed, unless the `returnAbortedRunsOnGracefulAbort` option is enabled, in which case it returns the aborted
     * Run, with its `abortedOnGracefulAbort` flag set to `true`.
     */
    override async call(input?: Dictionary, options?: ExtendedTaskCallOptions): Promise<ExtendedActorRun> {
        const { waitSecs, ...startOptions } = options ?? {};
        const startedRun = await this.start(input, startOptions);
        return this.context.extendRunClient(startedRun.requestId, startedRun.id).waitForFinish({ waitSecs });
    }

    override lastRun(options?: TaskLastRunOptions): RunClient | ExtRunClient {
        const runClient = super.lastRun(options);
        return isDefined(runClient.id) ? this.context.client.run(runClient.id) : runClient;
    }

    async startRuns(...runRequests: TaskRunRequest[]): Promise<ExtendedActorRun[]> {
        return Promise.all(
            runRequests.map(async ({ runName, input, options }) => this.start(input, { ...options, runName })),
        );
    }

    async startBatch<T>(
        namePrefix: string,
        sources: T[],
        inputGenerator: (chunk: T[]) => Dictionary,
        overrideSplitRules?: Partial<SplitRules>,
        options?: TaskStartOptions,
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

    async callRuns(...runRequests: TaskRunRequest[]): Promise<ExtendedActorRun[]> {
        return Promise.all(
            runRequests.map(async ({ runName, input, options }) => this.call(input, { ...options, runName })),
        );
    }

    async callBatch<T>(
        namePrefix: string,
        sources: T[],
        inputGenerator: (chunk: T[]) => Dictionary,
        overrideSplitRules?: Partial<SplitRules>,
        options?: TaskStartOptions,
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
        const task = await this.get();
        return task?.options?.memoryMbytes;
    }
}
