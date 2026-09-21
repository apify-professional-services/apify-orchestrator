import { afterEach, describe, expect, it, vi } from 'vitest';

import { RequestPool } from './request-pool.js';
import { RequestOutcome } from './request.js';

async function requestProcessor(data: string): Promise<RequestOutcome<number>> {
    const num = Number.parseInt(data, 10);
    if (Number.isNaN(num)) {
        return new RequestOutcome({ failure: 'Invalid number' });
    }
    return new RequestOutcome({ success: num });
}

describe('RequestPool', () => {
    const onRequestAdded = vi.fn();
    const onRequestSuccess = vi.fn();
    const onRequestFailure = vi.fn();
    const onRequestRetried = vi.fn();

    function getPool(): RequestPool<string, number> {
        return new RequestPool<string, number>({
            onRequestAdded,
            onRequestSuccess,
            onRequestFailure,
            onRequestRetried,
        });
    }

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('adds, finds, and resolves requests correctly', async () => {
        const requestKey = 'test-request';
        const requestData = '4';

        const pool = getPool();

        const request1 = pool.findOrAddRequest(requestKey, requestData);

        // Adding the same request again should return the same request.
        const request2 = pool.findOrAddRequest(requestKey, requestData);

        expect(request1).toBe(request2);

        // We'll get the same request we just added.
        const foundRequest = pool.findRequest(requestKey);
        expect(foundRequest).toBe(request1);

        // Process the request
        await request1.process(requestProcessor);

        const result = await request1.wait();

        expect(result).toBe(4);
        expect(onRequestAdded).toHaveBeenCalledTimes(1);
        expect(onRequestSuccess).toHaveBeenCalledTimes(1);
        expect(onRequestSuccess).toHaveBeenCalledWith(requestKey, 4);
        expect(onRequestFailure).not.toHaveBeenCalled();
        expect(onRequestRetried).not.toHaveBeenCalled();
    });

    it('handles request failures', async () => {
        const requestKey = 'failing-request';
        const requestData = 'not-a-number';

        const pool = getPool();

        const request = pool.findOrAddRequest(requestKey, requestData);

        await request.process(requestProcessor);

        await expect(request.wait()).rejects.toBe('Invalid number');

        expect(onRequestAdded).toHaveBeenCalledTimes(1);
        expect(onRequestFailure).toHaveBeenCalledTimes(1);
        expect(onRequestFailure).toHaveBeenCalledWith(requestKey, 'Invalid number');
        expect(onRequestSuccess).not.toHaveBeenCalled();
        expect(onRequestRetried).not.toHaveBeenCalled();
    });

    it('handles request retries', async () => {
        const requestKey = 'retrying-request';
        const requestData = 'still-not-a-number';

        const pool = getPool();

        const request = pool.findOrAddRequest(requestKey, requestData);

        await request.process(async () => new RequestOutcome({ retry: 'first-retry' })); // first attempt
        expect(onRequestRetried).toHaveBeenCalledTimes(1);
        expect(pool.findRequest(requestKey)).toBeDefined(); // still in pool for retry
        expect(request.isPending()).toBe(true); // marked as pending again

        await request.process(async () => new RequestOutcome({ retry: 'second-retry' })); // second attempt
        expect(onRequestRetried).toHaveBeenCalledTimes(2);
        expect(pool.findRequest(requestKey)).toBeDefined(); // still in pool for retry
        expect(request.isPending()).toBe(true); // marked as pending again

        await request.process(async () => new RequestOutcome({ failure: 'Not a number' })); // third attempt
        await expect(request.wait()).rejects.toBe('Not a number');
        expect(onRequestFailure).toHaveBeenCalledTimes(1);
        expect(onRequestFailure).toHaveBeenCalledWith(requestKey, 'Not a number');
        expect(pool.findRequest(requestKey)).toBeUndefined(); // removed from pool after failure
    });

    it('processes pending requests using getPendingRequests', async () => {
        const pool = getPool();

        const request1 = pool.findOrAddRequest('request-1', '10');
        const request2 = pool.findOrAddRequest('request-2', '20');
        const request3 = pool.findOrAddRequest('request-3', '30');

        expect(onRequestAdded).toHaveBeenCalledTimes(3);

        const pendingRequests = pool.getPendingRequests();
        expect(pendingRequests).toHaveLength(3);
        expect(pendingRequests).toContain(request1);
        expect(pendingRequests).toContain(request2);
        expect(pendingRequests).toContain(request3);

        // Process all pending requests
        await request1.process(requestProcessor);
        await request2.process(requestProcessor);
        await request3.process(requestProcessor);

        const [result1, result2, result3] = await Promise.all([request1.wait(), request2.wait(), request3.wait()]);

        expect(result1).toBe(10);
        expect(result2).toBe(20);
        expect(result3).toBe(30);
        expect(onRequestSuccess).toHaveBeenCalledTimes(3);

        // After processing, no pending requests should remain
        expect(pool.getPendingRequests()).toHaveLength(0);
    });
});
