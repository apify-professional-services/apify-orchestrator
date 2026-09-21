import { createHash } from 'node:crypto';
import { afterAll, test } from 'vitest';

// Shared sink that every benchmark callback writes its result into. Without this, a pure function
// call whose return value is discarded is a candidate for dead-code elimination by the JIT, which
// would make the "hashing" benchmarks measure an empty loop instead of the actual hash computation.
// Reading `sink` in `afterAll` keeps the assignments observable.
let sink = '';

function md5(str: string): string {
    return createHash('md5').update(str).digest('hex');
}

function sha1(str: string): string {
    return createHash('sha1').update(str).digest('hex');
}

function sha256(str: string): string {
    return createHash('sha256').update(str).digest('hex');
}

const smallPayload = JSON.stringify({
    url: 'https://example.com',
    maxItems: 100,
    proxy: { useApifyProxy: true },
});

const largePayload = JSON.stringify({
    startUrls: Array.from({ length: 200 }, (_, i) => ({ url: `https://example.com/page/${i}` })),
    maxItems: 10_000,
    proxy: { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] },
    customData: { nested: { deeply: { value: 'x'.repeat(500) } } },
});

test('hash algorithms - small payload (~80 bytes)', async ({ bench }) => {
    await bench('md5 (128-bit)', () => {
        sink = md5(smallPayload);
    }).run();
    await bench('sha1 (160-bit)', () => {
        sink = sha1(smallPayload);
    }).run();
    await bench('sha256 (256-bit)', () => {
        sink = sha256(smallPayload);
    }).run();
});

test('hash algorithms - large payload (~10 KB)', async ({ bench }) => {
    await bench('md5 (128-bit)', () => {
        sink = md5(largePayload);
    }).run();
    await bench('sha1 (160-bit)', () => {
        sink = sha1(largePayload);
    }).run();
    await bench('sha256 (256-bit)', () => {
        sink = sha256(largePayload);
    }).run();
});

afterAll(() => {
    // Force a read of `sink` after all benchmarks have run, so the compiler cannot treat the
    // assignments above as dead stores.
    if (!sink) {
        throw new Error('Benchmarks produced no output - hashing may have been eliminated as dead code.');
    }
});
