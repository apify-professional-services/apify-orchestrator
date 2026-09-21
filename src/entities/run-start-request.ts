import type { Dictionary } from 'apify-client';

import { hashObject } from '../utils/hash.js';
import type { RunSource, RunStartOptions } from './run-source.js';

export interface RunStartParams {
    source: RunSource;
    runName?: string;
    input?: Dictionary;
    options?: RunStartOptions;
}

export interface RunStartRequest extends RunStartParams {
    requestId: string;
}

export function buildRunStartRequest(params: RunStartParams): RunStartRequest {
    const { source, input, options, runName } = params;
    return {
        source,
        requestId: buildRequestId({ source, input, options, runName }),
        runName,
        input,
        options,
    };
}

function buildRequestId(params: RunStartParams): string {
    const { source, input, options, runName } = params;
    if (runName) return runName;
    return hashObject({ sourceType: source.type, sourceId: source.id, input, options });
}
