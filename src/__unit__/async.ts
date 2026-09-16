const PENDING = Symbol('pending');

/**
 * Checks that the given promise does not settle, e.g., because it is waiting for the process to be killed.
 *
 * Since we cannot wait forever, we just check that it is still pending after a short delay.
 */
export async function isStillPending(promise: Promise<unknown>, delayMs = 50): Promise<boolean> {
    const timeout = new Promise((resolve) => {
        setTimeout(() => resolve(PENDING), delayMs);
    });
    return (await Promise.race([promise, timeout])) === PENDING;
}
