import type {
    ActorRun,
    RunAbortOptions,
    RunGetOptions,
    RunMetamorphOptions,
    RunResurrectOptions,
    RunUpdateOptions,
    RunWaitForFinishOptions,
} from 'apify-client';
import { RunClient } from 'apify-client';

import type { ClientContext } from '../context/client-context.js';
import type { ExtendedActorRun, ExtendedRunClient } from '../types.js';
import { hangForever } from '../utils/concurrency/hang.js';

export interface ExtRunClientOptions {
    requestId: string;
    onUpdate: (run?: ExtendedActorRun) => void;
}

export class ExtRunClient extends RunClient implements ExtendedRunClient {
    readonly requestId: string;
    private readonly context: ClientContext;
    private readonly options: ExtRunClientOptions;

    /**
     * @internal
     */
    constructor(context: ClientContext, options: ExtRunClientOptions, runClient: RunClient) {
        const { requestId } = options;
        super({
            baseUrl: runClient.baseUrl,
            publicBaseUrl: runClient.publicBaseUrl,
            resourcePath: runClient.resourcePath,
            apifyClient: runClient.apifyClient,
            httpClient: runClient.httpClient,
            id: runClient.id,
            params: runClient.params,
        });
        this.requestId = requestId;
        this.context = context;
        this.options = options;
    }

    override async get(options?: RunGetOptions): Promise<ExtendedActorRun | undefined> {
        const run = await super.get(options);
        const extendedRun = run ? this.extendedRun(run) : undefined;
        this.options.onUpdate(extendedRun);
        return extendedRun;
    }

    override async abort(options?: RunAbortOptions | undefined): Promise<ExtendedActorRun> {
        const run = await super.abort(options);
        const extendedRun = this.extendedRun(run);
        this.options.onUpdate(extendedRun);
        return extendedRun;
    }

    override async delete(): Promise<void> {
        // TODO: implement
        this.context.logger.prefixed(this.requestId).warning('Delete Run is not supported yet in the Orchestrator.');
        await super.delete();
    }

    override async metamorph(
        targetActorId: string,
        input: unknown,
        options?: RunMetamorphOptions | undefined,
    ): Promise<ActorRun> {
        // TODO: implement
        this.context.logger.prefixed(this.requestId).warning('Metamorph Run is not supported yet in the Orchestrator.');
        return super.metamorph(targetActorId, input, options);
    }

    override async reboot(): Promise<ExtendedActorRun> {
        const run = await super.reboot();
        const extendedRun = this.extendedRun(run);
        this.options.onUpdate(extendedRun);
        return extendedRun;
    }

    override async update(newFields: RunUpdateOptions): Promise<ExtendedActorRun> {
        const run = await super.update(newFields);
        const extendedRun = this.extendedRun(run);
        this.options.onUpdate(extendedRun);
        return extendedRun;
    }

    override async resurrect(options?: RunResurrectOptions): Promise<ExtendedActorRun> {
        const run = await super.resurrect(options);
        const extendedRun = this.extendedRun(run);
        this.options.onUpdate(extendedRun);
        return extendedRun;
    }

    override async waitForFinish(options?: RunWaitForFinishOptions): Promise<ExtendedActorRun> {
        const run = await super.waitForFinish(options);
        const extendedRun = this.extendedRun(run);
        this.options.onUpdate(extendedRun);
        if (extendedRun.abortedOnGracefulAbort && !this.context.options.returnAbortedRunsOnGracefulAbort) {
            return this.hangUntilTheProcessIsKilled();
        }
        return extendedRun;
    }

    private extendedRun(run: ActorRun): ExtendedActorRun {
        const extendedRun: ExtendedActorRun = { ...run, requestId: this.requestId };
        return this.wasAbortedOnGracefulAbort(run) ? { ...extendedRun, abortedOnGracefulAbort: true } : extendedRun;
    }

    /**
     * A Run is considered aborted by the Orchestrator if it is aborted, or being aborted,
     * and the Orchestrator marked it as one of the Runs it aborted on a graceful abort.
     */
    private wasAbortedOnGracefulAbort(run: ActorRun): boolean {
        if (run.status !== 'ABORTED' && run.status !== 'ABORTING') return false;
        return this.context.gracefulAbortTracker.wasRunAborted(this.requestId);
    }

    /**
     * Never settles: the Actor is being gracefully aborted, and the process will be killed
     * at the end of the graceful abort timeout.
     */
    private async hangUntilTheProcessIsKilled(): Promise<never> {
        this.context.logger
            .prefixed(this.requestId)
            .warning(
                'The Run was aborted by the Orchestrator on graceful abort: ' +
                    'waiting for the Actor to be killed instead of returning the aborted Run. ' +
                    'Enable the `returnAbortedRunsOnGracefulAbort` option to return it instead.',
            );
        return hangForever();
    }
}
