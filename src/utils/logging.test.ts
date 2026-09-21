import { afterEach, describe, expect, it, vi } from 'vitest';

import { getTestOptions } from '../__unit__/context.js';
import { buildLogger } from './logging.js';

const debugMock = vi.hoisted(() => vi.fn());
const infoMock = vi.hoisted(() => vi.fn());
const warningMock = vi.hoisted(() => vi.fn());
const errorMock = vi.hoisted(() => vi.fn());
const childMock = vi.hoisted(() => vi.fn());

vi.mock('apify', async () => ({
    log: {
        debug: debugMock,
        info: infoMock,
        warning: warningMock,
        error: errorMock,
        child: childMock,
    },
}));

describe('logging utils', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Logger', () => {
        describe('prefixed', () => {
            it('creates a child logger with the correct prefix', () => {
                buildLogger(getTestOptions({ enableLogs: true, hideSensitiveInformation: false })).prefixed('test');
                expect(childMock).toHaveBeenLastCalledWith({ prefix: '[test]' });
            });
        });

        describe('debug', () => {
            it('logs debug messages when enabled', () => {
                const logger = buildLogger(getTestOptions({ enableLogs: true, hideSensitiveInformation: false }));
                logger.debug('test');
                expect(debugMock).toHaveBeenLastCalledWith('test', undefined);
            });

            it('does not log debug messages when disabled', () => {
                const logger = buildLogger(getTestOptions({ enableLogs: false, hideSensitiveInformation: false }));
                logger.debug('test');
                expect(debugMock).not.toHaveBeenCalled();
            });

            it('shows sensitive data when not hidden', () => {
                const logger = buildLogger(getTestOptions({ enableLogs: true, hideSensitiveInformation: false }));
                logger.debug('test', undefined, { secret: 'data' });
                expect(debugMock).toHaveBeenLastCalledWith('test', { secret: 'data' });
            });

            it('hides sensitive data when required', () => {
                const logger = buildLogger(getTestOptions({ enableLogs: true, hideSensitiveInformation: true }));
                logger.debug('test', undefined, { secret: 'data' });
                expect(debugMock).toHaveBeenLastCalledWith('test', undefined);
            });

            it('handles null data correctly', () => {
                const logger = buildLogger(getTestOptions({ enableLogs: true, hideSensitiveInformation: false }));
                logger.debug('test', null, { secret: 'data' });
                expect(debugMock).toHaveBeenLastCalledWith('test', { secret: 'data' });
            });

            it('handles null sensitive data correctly', () => {
                const logger = buildLogger(getTestOptions({ enableLogs: true, hideSensitiveInformation: false }));
                logger.debug('test', { info: 'data' }, null);
                expect(debugMock).toHaveBeenLastCalledWith('test', { info: 'data' });
            });

            it('handles both data and sensitive data being null correctly', () => {
                const logger = buildLogger(getTestOptions({ enableLogs: true, hideSensitiveInformation: false }));
                logger.debug('test', null, null);
                expect(debugMock).toHaveBeenLastCalledWith('test', undefined);
            });
        });

        describe('info', () => {
            it('logs info messages when enabled', () => {
                const logger = buildLogger(getTestOptions({ enableLogs: true, hideSensitiveInformation: false }));
                logger.info('test');
                expect(infoMock).toHaveBeenLastCalledWith('test', undefined);
            });

            it('does not log info messages when disabled', () => {
                const logger = buildLogger(getTestOptions({ enableLogs: false, hideSensitiveInformation: false }));
                logger.info('test');
                expect(infoMock).not.toHaveBeenCalled();
            });

            it('shows sensitive data when not hidden', () => {
                const logger = buildLogger(getTestOptions({ enableLogs: true, hideSensitiveInformation: false }));
                logger.info('test', undefined, { secret: 'data' });
                expect(infoMock).toHaveBeenLastCalledWith('test', { secret: 'data' });
            });

            it('hides sensitive data when required', () => {
                const logger = buildLogger(getTestOptions({ enableLogs: true, hideSensitiveInformation: true }));
                logger.info('test', undefined, { secret: 'data' });
                expect(infoMock).toHaveBeenLastCalledWith('test', undefined);
            });
        });

        describe('warning', () => {
            it('logs warning messages when enabled', () => {
                const logger = buildLogger(getTestOptions({ enableLogs: true, hideSensitiveInformation: false }));
                logger.warning('test');
                expect(warningMock).toHaveBeenLastCalledWith('test', undefined);
            });

            it('does not log warning messages when disabled', () => {
                const logger = buildLogger(getTestOptions({ enableLogs: false, hideSensitiveInformation: false }));
                logger.warning('test');
                expect(warningMock).not.toHaveBeenCalled();
            });

            it('shows sensitive data when not hidden', () => {
                const logger = buildLogger(getTestOptions({ enableLogs: true, hideSensitiveInformation: false }));
                logger.warning('test', undefined, { secret: 'data' });
                expect(warningMock).toHaveBeenLastCalledWith('test', { secret: 'data' });
            });

            it('hides sensitive data when required', () => {
                const logger = buildLogger(getTestOptions({ enableLogs: true, hideSensitiveInformation: true }));
                logger.warning('test', undefined, { secret: 'data' });
                expect(warningMock).toHaveBeenLastCalledWith('test', undefined);
            });
        });

        describe('error', () => {
            it('logs error messages when enabled', () => {
                const logger = buildLogger(getTestOptions({ enableLogs: true, hideSensitiveInformation: false }));
                logger.error('test');
                expect(errorMock).toHaveBeenLastCalledWith('test', undefined);
            });

            it('does not log error messages when disabled', () => {
                const logger = buildLogger(getTestOptions({ enableLogs: false, hideSensitiveInformation: false }));
                logger.error('test');
                expect(errorMock).not.toHaveBeenCalled();
            });

            it('shows sensitive data when not hidden', () => {
                const logger = buildLogger(getTestOptions({ enableLogs: true, hideSensitiveInformation: false }));
                logger.error('test', undefined, { secret: 'data' });
                expect(errorMock).toHaveBeenLastCalledWith('test', { secret: 'data' });
            });

            it('hides sensitive data when required', () => {
                const logger = buildLogger(getTestOptions({ enableLogs: true, hideSensitiveInformation: true }));
                logger.error('test', undefined, { secret: 'data' });
                expect(errorMock).toHaveBeenLastCalledWith('test', undefined);
            });
        });
    });
});
