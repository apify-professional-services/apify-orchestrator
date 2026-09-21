import { Actor } from 'apify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getTestOptions } from '../__unit__/context.js';
import { encryptString, processEncryptionKey } from './encryption.js';
import { EncryptedKeyValueStore } from './key-value-store.js';
import { buildLogger } from './logging.js';

vi.mock('apify', async (importActual) => ({
    ...(await importActual()),
    Actor: {
        getValue: vi.fn(),
        setValue: vi.fn(),
        on: vi.fn(),
        config: {
            get: vi.fn(),
        },
    },
}));

describe('EncryptedKeyValueStore', () => {
    const options = getTestOptions();
    const logger = buildLogger(options);

    const secret = 'test-encryption-key';
    const encryptionKey = processEncryptionKey(secret);

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('useState', () => {
        it('restores state correctly', async () => {
            const testValue = { counter: 42 };

            vi.mocked(Actor.getValue).mockResolvedValue(encryptString(JSON.stringify(testValue), encryptionKey));

            const kvs = new EncryptedKeyValueStore(logger, encryptionKey);
            const testKey = 'TEST_KEY';

            const state = await kvs.useState<{ counter: number }>(testKey, { counter: 0 });
            expect(Actor.getValue).toHaveBeenCalledWith(testKey);
            expect(state).toEqual(testValue);
        });

        it('returns default value when key does not exist', async () => {
            vi.mocked(Actor.getValue).mockResolvedValueOnce(null);

            const kvs = new EncryptedKeyValueStore(logger, encryptionKey);
            const testKey = 'NON_EXISTENT_KEY';
            const defaultValue = { message: 'Hello, World!' };

            const state = await kvs.useState<typeof defaultValue>(testKey, defaultValue);
            expect(Actor.getValue).toHaveBeenCalledWith(testKey);
            expect(state).toEqual(defaultValue);
        });

        it('returns the default value if the decryption fails', async () => {
            const anotherEncryptionKey = processEncryptionKey('another-encryption-key');
            const invalidEncryptedData = encryptString(JSON.stringify({ data: 'test' }), anotherEncryptionKey);

            vi.mocked(Actor.getValue).mockResolvedValueOnce(invalidEncryptedData);

            const kvs = new EncryptedKeyValueStore(logger, encryptionKey);
            const testKey = 'INVALID_ENCRYPTED_KEY';
            const defaultValue = { message: 'Hello, World!' };

            const state = await kvs.useState<typeof defaultValue>(testKey, defaultValue);
            expect(Actor.getValue).toHaveBeenCalledWith(testKey);
            expect(state).toEqual(defaultValue);
        });

        it('clears the pending operation and returns the cached value on subsequent calls', async () => {
            const testValue = { counter: 100 };
            const testKey = 'CACHED_KEY';

            vi.mocked(Actor.getValue).mockResolvedValue(encryptString(JSON.stringify(testValue), encryptionKey));

            const kvs = new EncryptedKeyValueStore(logger, encryptionKey);

            const state1 = await kvs.useState(testKey, testValue);

            state1.counter += 1;

            const state2 = await kvs.useState(testKey, { counter: 0 });
            expect(state2).toEqual({ counter: 101 });
            expect(Actor.getValue).toHaveBeenCalledTimes(1);
        });

        it('persists state on corresponding event', async () => {
            const testValue = { counter: 7 };
            const testKey = 'PERSIST_KEY';

            let persistCallback: () => Promise<void>;

            vi.mocked(Actor.on).mockImplementationOnce((_event, callback) => {
                persistCallback = callback as () => Promise<void>;
            });
            vi.mocked(Actor.config.get).mockReturnValue(10_000);

            const kvs = new EncryptedKeyValueStore(logger, encryptionKey);

            expect(Actor.on).toHaveBeenCalledWith('persistState', expect.any(Function));

            await kvs.useState(testKey, testValue);

            await persistCallback!();

            expect(Actor.setValue).toHaveBeenCalledWith(
                testKey,
                expect.any(String),
                expect.objectContaining({
                    timeoutSecs: 5,
                }),
            );
        });

        it('handles concurrent useState calls for the same key correctly', async () => {
            const testValue = { counter: 50 };
            const testKey = 'CONCURRENT_KEY';

            let resolveGetValue: (value: string) => void;
            const getValuePromise = new Promise<string>((resolve) => {
                resolveGetValue = resolve;
            });

            vi.mocked(Actor.getValue).mockReturnValue(getValuePromise);

            const kvs = new EncryptedKeyValueStore(logger, encryptionKey);

            const promise1 = kvs.useState(testKey, { counter: 0 });
            const promise2 = kvs.useState(testKey, { counter: 0 });
            const promise3 = kvs.useState(testKey, { counter: 0 });

            // With the lock mechanism, getValue should only be called once
            expect(Actor.getValue).toHaveBeenCalledTimes(1);

            resolveGetValue!(encryptString(JSON.stringify(testValue), encryptionKey));

            const [state1, state2, state3] = await Promise.all([promise1, promise2, promise3]);

            expect(state1).toBe(state2);
            expect(state2).toBe(state3);
            expect(state1).toEqual(testValue);

            state1.counter += 1;

            expect(state2.counter).toEqual(51);
            expect(state3.counter).toEqual(51);
        });

        it('clears pending operation after error', async () => {
            const testKey = 'ERROR_KEY';
            const error = new Error('Test error');

            vi.mocked(Actor.getValue).mockRejectedValueOnce(error);

            const kvs = new EncryptedKeyValueStore(logger, encryptionKey);

            await expect(kvs.useState(testKey, { data: '' })).rejects.toThrow('Test error');

            // After error, the pending operation should be cleared
            // Next call should create a new operation
            vi.mocked(Actor.getValue).mockResolvedValueOnce(
                encryptString(JSON.stringify({ data: 'success' }), encryptionKey),
            );

            const state = await kvs.useState(testKey, { data: '' });
            expect(state).toEqual({ data: 'success' });
            expect(Actor.getValue).toHaveBeenCalledTimes(2);
        });

        it('handles interleaved calls for different keys correctly', async () => {
            const kvs = new EncryptedKeyValueStore(logger, encryptionKey);

            let resolveKey1: (value: string) => void;
            let resolveKey2: (value: string) => void;

            const promise1 = new Promise<string>((resolve) => {
                resolveKey1 = resolve;
            });
            const promise2 = new Promise<string>((resolve) => {
                resolveKey2 = resolve;
            });

            vi.mocked(Actor.getValue).mockReturnValueOnce(promise1).mockReturnValueOnce(promise2);

            const state1Promise = kvs.useState('KEY1', { value: 0 });
            const state2Promise = kvs.useState('KEY2', { value: 0 });

            expect(Actor.getValue).toHaveBeenCalledTimes(2);

            resolveKey2!(encryptString(JSON.stringify({ value: 2 }), encryptionKey));
            resolveKey1!(encryptString(JSON.stringify({ value: 1 }), encryptionKey));

            const [state1, state2] = await Promise.all([state1Promise, state2Promise]);

            expect(state1).toEqual({ value: 1 });
            expect(state2).toEqual({ value: 2 });
        });
    });
});
