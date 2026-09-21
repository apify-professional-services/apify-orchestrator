/**
 * Keeps track of the unnamed Run start requests resolved by this process for a client.
 * Since it's in memory, it will be reset after a resurrection.
 *
 * If the same unnamed request is resolved twice, we get an ambiguous situation, with two possible scenarios:
 *
 * 1. The user wants to start a new Run.
 * 2. The user wants to point at the existing Run that was started by the first request.
 *
 * Since we cannot know which one is the case, the context throws an `AmbiguousRunRequestError` - unless the Run tied
 * to that request has failed/aborted/timed out, in which case retrying is always allowed.
 */
export class UnnamedRequestTracker {
    private readonly resolvedRequestIds = new Set<string>();

    /**
     * Marks the request with the given ID as resolved by this process.
     */
    markResolved(requestId: string): void {
        this.resolvedRequestIds.add(requestId);
    }

    /**
     * @returns `true` if this process already resolved the request with the given ID.
     */
    wasResolved(requestId: string): boolean {
        return this.resolvedRequestIds.has(requestId);
    }

    /**
     * Forgets the request with the given ID: resolving it again will not be considered ambiguous.
     * It is used when the Run tied to the request fails, because retrying it is always allowed.
     */
    forget(requestId: string): void {
        this.resolvedRequestIds.delete(requestId);
    }
}
