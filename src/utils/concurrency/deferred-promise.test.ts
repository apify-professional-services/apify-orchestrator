import { describe, expect, it } from 'vitest';

import { DeferredPromise } from './deferred-promise.js';

function delay(fn: () => void): void {
    setTimeout(fn, 10);
}

describe('DeferredPromise', () => {
    it('resolves correctly when waited before resolution', async () => {
        const deferred = new DeferredPromise<number>();

        const waitPromise = deferred.wait();

        delay(() => deferred.resolve(42));

        const result = await waitPromise;
        expect(result).toBe(42);
    });

    it('rejects correctly when waited before rejection', async () => {
        const deferred = new DeferredPromise<number>();

        const waitPromise = deferred.wait();

        delay(() => deferred.reject(new Error('Test error')));

        await expect(waitPromise).rejects.toThrow('Test error');
    });

    it('resolves correctly when waited after resolution', async () => {
        const deferred = new DeferredPromise<number>();
        deferred.resolve(99);

        const result = await deferred.wait();
        expect(result).toBe(99);
    });

    it('rejects correctly when waited after rejection', async () => {
        const deferred = new DeferredPromise<number>();
        deferred.reject(new Error('Another test error'));

        await expect(deferred.wait()).rejects.toThrow('Another test error');
    });

    it('supports multiple waiters before resolution', async () => {
        const deferred = new DeferredPromise<string>();

        const waiter1 = deferred.wait();
        const waiter2 = deferred.wait();

        delay(() => deferred.resolve('multi-waiter'));

        const [result1, result2] = await Promise.all([waiter1, waiter2]);
        expect(result1).toBe('multi-waiter');
        expect(result2).toBe('multi-waiter');
    });

    it('supports multiple waiters after resolution', async () => {
        const deferred = new DeferredPromise<string>();
        deferred.resolve('post-resolution');

        const result1 = await deferred.wait();
        const result2 = await deferred.wait();

        expect(result1).toBe('post-resolution');
        expect(result2).toBe('post-resolution');
    });

    it('supports multiple waiters around resolution', async () => {
        const deferred = new DeferredPromise<string>();

        const waiter1 = deferred.wait();

        delay(() => deferred.resolve('mixed-timing'));

        expect(await waiter1).toBe('mixed-timing');

        const waiter2 = deferred.wait();
        expect(await waiter2).toBe('mixed-timing');
    });

    it('supports multiple waiters before rejection', async () => {
        const deferred = new DeferredPromise<string>();

        const waiter1 = deferred.wait();
        const waiter2 = deferred.wait();

        delay(() => deferred.reject(new Error('multi-waiter error')));

        await expect(waiter1).rejects.toThrow('multi-waiter error');
        await expect(waiter2).rejects.toThrow('multi-waiter error');
    });

    it('supports multiple waiters after rejection', async () => {
        const deferred = new DeferredPromise<string>();
        deferred.reject(new Error('post-rejection error'));

        const waiter1 = deferred.wait();
        const waiter2 = deferred.wait();

        await expect(waiter1).rejects.toThrow('post-rejection error');
        await expect(waiter2).rejects.toThrow('post-rejection error');
    });

    it('supports multiple waiters around rejection', async () => {
        const deferred = new DeferredPromise<string>();

        const waiter1 = deferred.wait();

        delay(() => deferred.reject(new Error('mixed-timing error')));

        await expect(waiter1).rejects.toThrow('mixed-timing error');

        const waiter2 = deferred.wait();
        await expect(waiter2).rejects.toThrow('mixed-timing error');
    });

    it('throws when resolving an already resolved promise', async () => {
        const deferred = new DeferredPromise<number>();
        deferred.resolve(1);
        expect(() => deferred.resolve(2)).toThrow();

        const result = await deferred.wait();
        expect(result).toBe(1);
    });

    it('throws when rejecting an already rejected promise', async () => {
        const deferred = new DeferredPromise<number>();
        deferred.reject(new Error('First error'));
        expect(() => deferred.reject(new Error('Second error'))).toThrow();

        await expect(deferred.wait()).rejects.toThrow('First error');
    });

    it('throws when resolving an already rejected promise', async () => {
        const deferred = new DeferredPromise<number>();
        deferred.reject(new Error('Rejected error'));
        expect(() => deferred.resolve(100)).toThrow();

        await expect(deferred.wait()).rejects.toThrow('Rejected error');
    });

    it('throws when rejecting an already resolved promise', async () => {
        const deferred = new DeferredPromise<number>();
        deferred.resolve(200);
        expect(() => deferred.reject(new Error('Should not affect'))).toThrow();

        const result = await deferred.wait();
        expect(result).toBe(200);
    });

    it('works chaining synchronous calls', async () => {
        const deferred = new DeferredPromise<number>();

        function getPromise1(): () => Promise<number> {
            return async () => deferred.wait();
        }

        function getPromise2(): () => Promise<number> {
            return getPromise1();
        }

        delay(() => deferred.resolve(1234));

        const promise = getPromise2()();
        expect(await promise).toBe(1234);
    });
});
