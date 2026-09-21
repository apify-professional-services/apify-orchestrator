import { describe, expect, it } from 'vitest';

import { PlatformRunJobStatus } from '../types.js';
import { isRunFailStatus, isRunOkStatus, isRunTerminalStatus } from './apify-client.js';

describe('utils/apify-client', () => {
    // getStartRunErrorType is tested in run-source.test.ts

    describe('isRunOkStatus', () => {
        it('correctly identifies OK statuses', () => {
            const okStatuses: PlatformRunJobStatus[] = ['READY', 'RUNNING', 'SUCCEEDED'];
            for (const status of okStatuses) {
                expect(isRunOkStatus(status)).toBe(true);
            }
        });

        it('correctly identifies non-OK statuses', () => {
            const nonOkStatuses: PlatformRunJobStatus[] = ['FAILED', 'ABORTING', 'ABORTED', 'TIMING-OUT', 'TIMED-OUT'];
            for (const status of nonOkStatuses) {
                expect(isRunOkStatus(status)).toBe(false);
            }
        });
    });

    describe('isRunFailStatus', () => {
        it('correctly identifies FAIL statuses', () => {
            const failStatuses: PlatformRunJobStatus[] = ['FAILED', 'ABORTING', 'ABORTED', 'TIMING-OUT', 'TIMED-OUT'];
            for (const status of failStatuses) {
                expect(isRunFailStatus(status)).toBe(true);
            }
        });

        it('correctly identifies non-FAIL statuses', () => {
            const nonFailStatuses: PlatformRunJobStatus[] = ['READY', 'RUNNING', 'SUCCEEDED'];
            for (const status of nonFailStatuses) {
                expect(isRunFailStatus(status)).toBe(false);
            }
        });
    });

    describe('isRunTerminalStatus', () => {
        it('correctly identifies terminal statuses', () => {
            const terminalStatuses: PlatformRunJobStatus[] = ['SUCCEEDED', 'FAILED', 'TIMED-OUT', 'ABORTED'];
            for (const status of terminalStatuses) {
                expect(isRunTerminalStatus(status)).toBe(true);
            }
        });

        it('correctly identifies non-terminal statuses', () => {
            const nonTerminalStatuses: PlatformRunJobStatus[] = ['READY', 'RUNNING'];
            for (const status of nonTerminalStatuses) {
                expect(isRunTerminalStatus(status)).toBe(false);
            }
        });
    });
});
