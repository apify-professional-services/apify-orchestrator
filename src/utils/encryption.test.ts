import { describe, expect, it } from 'vitest';

import { decryptString, encryptString, processEncryptionKey } from './encryption.js';

describe('utils/encryption', () => {
    describe('processEncryptionKey', () => {
        it('generates a key hash 32-Bytes long', () => {
            const key = processEncryptionKey('test-key');
            expect(key.hashed32Bytes).toHaveLength(32);
        });
    });

    describe('encryptString and decryptString', () => {
        it('encrypts and decrypts a string correctly', () => {
            const key = processEncryptionKey('test-key');
            const originalString = 'Hello, World!';

            const encryptedString = encryptString(originalString, key);
            expect(encryptedString).not.toBe(originalString);

            const decryptedString = decryptString(encryptedString, key);
            expect(decryptedString).toBe(originalString);
        });
    });
});
