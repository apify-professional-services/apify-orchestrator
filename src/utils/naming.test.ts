import { describe, expect, it } from 'vitest';

import { makeNameUnique } from './naming.js';

describe('naming-utils', () => {
    describe('makeNameUnique', () => {
        it('does not change the name if it is already unique', () => {
            const takenNames = new Set(['A', 'B', 'C']);
            expect(makeNameUnique('D', takenNames)).toEqual('D');
        });

        it('adds a counter to repeated names, starting from 2', () => {
            const takenNames = new Set(['test']);
            expect(makeNameUnique('test', takenNames)).toEqual('test-2');
            takenNames.add('test-2');
            expect(makeNameUnique('test', takenNames)).toEqual('test-3');
            takenNames.add('test-3');
            expect(makeNameUnique('test', takenNames)).toEqual('test-4');
        });
    });
});
