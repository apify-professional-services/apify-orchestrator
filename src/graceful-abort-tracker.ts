/**
 * Keeps track of the Runs that the Orchestrator itself aborted, because the Actor was gracefully aborted
 * and the `abortAllRunsOnGracefulAbort` option was enabled.
 *
 * It allows telling apart a Run aborted by the library from a Run aborted by the user.
 *
 * The information is kept in memory only, and it is never persisted: after a resurrection, the Orchestrator
 * starts from scratch, and the Runs aborted in a previous session are not considered aborted by the library anymore.
 */
export class GracefulAbortTracker {
    private readonly abortedRequestIds = new Set<string>();

    /**
     * Marks the Runs matching the given requests as aborted by the Orchestrator on a graceful abort.
     *
     * It must be called *before* aborting the Runs, to avoid a race with any `waitForFinish` in progress,
     * which could otherwise see the Run as aborted before it is marked here.
     */
    markRunsAborted(requestIds: string[]): void {
        for (const requestId of requestIds) {
            this.abortedRequestIds.add(requestId);
        }
    }

    /**
     * @returns `true` if the Run matching the given request was aborted by the Orchestrator on a graceful abort.
     */
    wasRunAborted(requestId: string): boolean {
        return this.abortedRequestIds.has(requestId);
    }
}
