import { describe, expect, it } from 'vitest';

import { isDefined } from './typing.js';

describe('typing utils', () => {
    describe('isDefined', () => {
        it('returns true for defined values', () => {
            expect(isDefined(1)).toBe(true);
            expect(isDefined(0)).toBe(true);
            expect(isDefined('test')).toBe(true);
            expect(isDefined('')).toBe(true);
            expect(isDefined(true)).toBe(true);
            expect(isDefined(false)).toBe(true);
            expect(isDefined(['test', 'test2'])).toBe(true);
            expect(isDefined([])).toBe(true);
            expect(isDefined({ key: 'value' })).toBe(true);
            expect(isDefined({})).toBe(true);
        });

        it('returns false for undefined and null', () => {
            expect(isDefined(undefined)).toBe(false);
            expect(isDefined(null)).toBe(false);
        });
    });
});
