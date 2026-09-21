import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Request, RequestOutcome } from './request.js';

async function processorRetry(data: number): Promise<RequestOutcome<number>> {
    return new RequestOutcome({ retry: `Need to retry ${data}` });
}

async function processorSuccess(data: number): Promise<RequestOutcome<number>> {
    return new RequestOutcome({ success: data * 2 });
}

async function processorFailure(data: number): Promise<RequestOutcome<number>> {
    return new RequestOutcome({ failure: `Failed processing ${data}` });
}

describe('Request', () => {
    const onSuccess = vi.fn();
    const onFailure = vi.fn();
    const onRetry = vi.fn();

    let scheduledRequest: Request<number, number>;

    beforeEach(() => {
        scheduledRequest = new Request<number, number>(42, {
            onSuccess,
            onFailure,
            onRetry,
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('will set the "pending" status to true after retrying', async () => {
        expect(scheduledRequest.isPending()).toBe(true);
        await scheduledRequest.process(processorRetry);
        expect(scheduledRequest.isPending()).toBe(true);
        expect(onRetry).toHaveBeenCalledWith('Need to retry 42');
    });

    it('will set the "pending" status to false after success', async () => {
        expect(scheduledRequest.isPending()).toBe(true);
        await scheduledRequest.process(processorSuccess);
        expect(scheduledRequest.isPending()).toBe(false);
        expect(onSuccess).toHaveBeenCalledWith(84);
    });

    it('will set the "pending" status to false after failure', async () => {
        expect(scheduledRequest.isPending()).toBe(true);
        await scheduledRequest.process(processorFailure);
        expect(scheduledRequest.isPending()).toBe(false);
        expect(onFailure).toHaveBeenCalledWith('Failed processing 42');
    });

    it('will set the "pending" status to false when starting processing', async () => {
        let resolveProcessor: (value: RequestOutcome<number>) => void;
        async function blockingProcessor() {
            return new Promise<RequestOutcome<number>>((resolve) => {
                resolveProcessor = resolve;
            });
        }

        expect(scheduledRequest.isPending()).toBe(true);
        const processingPromise = scheduledRequest.process(blockingProcessor);
        expect(scheduledRequest.isPending()).toBe(false);

        // Finish processing
        resolveProcessor!(new RequestOutcome({ success: 100 }));
        await processingPromise;
        expect(scheduledRequest.isPending()).toBe(false);
        expect(onSuccess).toHaveBeenCalledWith(100);
    });

    it('will not process an already processing or processed request', async () => {
        const processor = vi.fn().mockResolvedValue(new RequestOutcome({ success: 123 }));

        expect(scheduledRequest.isPending()).toBe(true);
        const firstProcessing = scheduledRequest.process(processor);
        const secondProcessing = scheduledRequest.process(processor);
        await Promise.all([firstProcessing, secondProcessing]);

        expect(processor).toHaveBeenCalledTimes(1);
        expect(scheduledRequest.isPending()).toBe(false);
        expect(onSuccess).toHaveBeenCalledWith(123);
    });
});
