import { Actor } from 'apify';
import { describe, expect, it, vi } from 'vitest';

import { getTestOptions } from '../__unit__/context.js';
import { generateOrchestratorContext } from '../context/orchestrator-context.js';
import { buildStorage } from './storage.js';

vi.mock('apify');

const encryptedKeyValueStoreMock = {
    useState: vi.fn(),
};

vi.mock('./key-value-store.js', () => {
    return {
        // eslint-disable-next-line prefer-arrow-callback
        EncryptedKeyValueStore: vi.fn(function () {
            return encryptedKeyValueStoreMock;
        }),
    };
});

describe('buildStorage', () => {
    it('returns undefined when persistenceSupport is none', () => {
        const options = getTestOptions({ persistenceSupport: 'none' });
        const context = generateOrchestratorContext(options);
        const storage = buildStorage(context);
        expect(storage).toBeUndefined();
    });

    it('returns unencrypted storage when no encryption key is provided', async () => {
        const options = getTestOptions({
            persistenceSupport: 'kvs',
            persistenceEncryptionKey: undefined,
        });
        const context = generateOrchestratorContext(options);
        const storage = buildStorage(context);
        expect(storage).toBeDefined();
        await storage!.useState('test-key', { foo: 'bar' });
        expect(Actor.useState).toHaveBeenCalledWith('test-key', { foo: 'bar' });
    });

    it('returns encrypted storage when encryption key is provided', async () => {
        const options = getTestOptions({
            persistenceSupport: 'kvs',
            persistenceEncryptionKey: 'my-secret-key',
        });
        const context = generateOrchestratorContext(options);
        const storage = buildStorage(context);
        expect(storage).toBeDefined();
        await storage!.useState('test-key', { foo: 'bar' });
        expect(encryptedKeyValueStoreMock.useState).toHaveBeenCalledWith('test-key', { foo: 'bar' });
    });
});
