import { log } from 'apify';

import type { ExtendedApifyClient, ExtendedTaskClient } from '../types.js';
import { TestRun } from './test-run.js';

export class TestTaskRunner {
    private readonly apifyClient: ExtendedApifyClient;
    protected readonly taskId: string;
    protected readonly taskClient: ExtendedTaskClient;

    constructor(apifyClient: ExtendedApifyClient, taskId: string) {
        this.apifyClient = apifyClient;
        this.taskId = taskId;
        this.taskClient = apifyClient.task(taskId);
    }

    async call(index: number): Promise<TestRun | null> {
        const runName = `child-task-${index}`;
        try {
            const run = await this.taskClient.call(undefined, { runName });
            return new TestRun(this.apifyClient, run, runName);
        } catch (error) {
            log.exception(error as Error, `Error calling child task for child actor ${index}`, {
                taskId: this.taskId,
            });
            return null;
        }
    }
}
