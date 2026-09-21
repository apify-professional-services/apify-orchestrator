import { describe, expect, it } from 'vitest';

import { stringifyError } from './errors.js';

describe('errors utils', () => {
    describe('stringifyError', () => {
        it('returns the message of an Error instance', () => {
            const error = new Error('Test error message');
            const result = stringifyError(error);
            expect(result).toBe('Test error message');
        });

        it('stringifies a plain object', () => {
            const error = { code: 500, detail: 'Internal Server Error' };
            const result = stringifyError(error);
            expect(result).toBe(JSON.stringify(error));
        });

        it('returns a string as is', () => {
            const error = 'A simple string error';
            const result = stringifyError(error);
            expect(result).toBe('A simple string error');
        });

        it('handles undefined gracefully', () => {
            const result = stringifyError(undefined);
            expect(result).toBe('undefined');
        });

        it('handles null gracefully', () => {
            const result = stringifyError(null);
            expect(result).toBe('null');
        });

        it('handles non-stringifiable objects gracefully', () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const circularObj: any = {};
            circularObj.self = circularObj;
            const result = stringifyError(circularObj);
            expect(result).toBe('[object Object]');
        });
    });
});
