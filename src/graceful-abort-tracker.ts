/**
 * Keeps track of the Runs that the Orchestrator itself aborted, because the Actor was gracefully aborted
 * and the `abortAllRunsOnGracefulAbort` option was enabled.
 *
 * It allows telling apart a Run aborted by the library from a Run aborted by the user.
 *
 * Runs are tracked by their immutable Run ID, and not by their request ID, which is reusable:
 * a replacement Run started with the same request ID is a different Run, and it is not considered aborted here.
 *
 * The information is kept in memory only, and it is never persisted: after a resurrection, the Orchestrator
 * starts from scratch, and the Runs aborted in a previous session are not considered aborted by the library anymore.
 */
export class GracefulAbortTracker {
    private readonly abortedRunIds = new Set<string>();

    /**
     * Marks the Runs with the given Run IDs as aborted by the Orchestrator on a graceful abort.
     *
     * It must be called *before* aborting the Runs, to avoid a race with any `waitForFinish` in progress,
     * which could otherwise see the Run as aborted before it is marked here.
     */
    markRunsAborted(runIds: string[]): void {
        for (const runId of runIds) {
            this.abortedRunIds.add(runId);
        }
    }

    /**
     * @returns `true` if the Run with the given Run ID was aborted by the Orchestrator on a graceful abort.
     */
    wasRunAborted(runId: string): boolean {
        return this.abortedRunIds.has(runId);
    }
}
