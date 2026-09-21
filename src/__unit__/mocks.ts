import type { ActorRun } from 'apify-client';
import { vi } from 'vitest';

import type { RunSource } from '../entities/run-source.js';
import type { ExtendedActorRun } from '../types.js';
import type { Storage } from '../utils/storage.js';

export function createActorRunMock(params: Partial<ExtendedActorRun> = {}): ExtendedActorRun {
    return {
        id: 'mock-run-id',
        requestId: 'mock-request-id',
        status: 'RUNNING',
        startedAt: new Date('2024-01-01T00:00:00.000Z'),
        ...params,
    } as ExtendedActorRun;
}

export const storageMock = { useState: vi.fn() } as Storage;

export function createMockRunSource(run: ActorRun): RunSource {
    return {
        start: vi.fn().mockResolvedValue(run),
        parseRunStartError: vi.fn().mockImplementation((error) => error),
        getRequestId: vi.fn().mockImplementation((_input, _options, runName) => runName || 'mock-request-id'),
    } as unknown as RunSource;
}
