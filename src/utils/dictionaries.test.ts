import { describe, expect, it } from 'vitest';

import { mergeDictionaries } from './dictionaries.js';

describe('dictionaries utils', () => {
    describe('mergeDictionaries', () => {
        it('merges two dictionaries correctly', () => {
            const dict1 = { a: 1, b: 2 };
            const dict2 = { b: 3, c: 4 };
            const merged = mergeDictionaries(dict1, dict2);
            expect(merged).toEqual({ a: 1, b: 3, c: 4 });
        });

        it('returns the first dictionary if the second is undefined', () => {
            const dict1 = { a: 1, b: 2 };
            const merged = mergeDictionaries(dict1, undefined);
            expect(merged).toEqual(dict1);
        });

        it('returns the second dictionary if the first is undefined', () => {
            const dict2 = { b: 3, c: 4 };
            const merged = mergeDictionaries(undefined, dict2);
            expect(merged).toEqual(dict2);
        });

        it('returns undefined if both dictionaries are undefined', () => {
            const merged = mergeDictionaries(undefined, undefined);
            expect(merged).toBeUndefined();
        });
    });
});
