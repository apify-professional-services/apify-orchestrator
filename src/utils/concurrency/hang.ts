/**
 * Returns a promise that never settles.
 *
 * Notice that a pending promise does not keep the Node.js event loop alive by itself: the process
 * can still exit normally, and the platform will kill it once the graceful abort period is over.
 */
export async function hangForever(): Promise<never> {
    return new Promise<never>(() => undefined);
}
