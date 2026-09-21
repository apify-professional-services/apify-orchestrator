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

export class ExtRunClient extends RunClient implements ExtendedRunClient {
    readonly requestId: string;
    private readonly context: ClientContext;

    /**
     * @internal
     */
    constructor(context: ClientContext, requestId: string, runClient: RunClient) {
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
    }

    override async get(options?: RunGetOptions): Promise<ExtendedActorRun | undefined> {
        const run = await super.get(options);
        const extendedRun = run ? this.extendedRun(run) : undefined;
        this.context.trackRunUpdate(this.requestId, extendedRun);
        return extendedRun;
    }

    override async abort(options?: RunAbortOptions | undefined): Promise<ExtendedActorRun> {
        const run = await super.abort(options);
        const extendedRun = this.extendedRun(run);
        this.context.trackRunUpdate(this.requestId, extendedRun);
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
        this.context.trackRunUpdate(this.requestId, extendedRun);
        return extendedRun;
    }

    override async update(newFields: RunUpdateOptions): Promise<ExtendedActorRun> {
        const run = await super.update(newFields);
        const extendedRun = this.extendedRun(run);
        this.context.trackRunUpdate(this.requestId, extendedRun);
        return extendedRun;
    }

    override async resurrect(options?: RunResurrectOptions): Promise<ExtendedActorRun> {
        const run = await super.resurrect(options);
        const extendedRun = this.extendedRun(run);
        this.context.trackRunUpdate(this.requestId, extendedRun);
        return extendedRun;
    }

    override async waitForFinish(options?: RunWaitForFinishOptions): Promise<ExtendedActorRun> {
        const run = await super.waitForFinish(options);
        const extendedRun = this.extendedRun(run);
        this.context.trackRunUpdate(this.requestId, extendedRun);
        if (extendedRun.abortedOnGracefulAbort && !this.context.options.returnAbortedRunsOnGracefulAbort) {
            return this.hangUntilTheProcessIsKilled();
        }
        return extendedRun;
    }

    private extendedRun(run: ActorRun): ExtendedActorRun {
        return this.context.buildExtendedRun(this.requestId, run);
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
