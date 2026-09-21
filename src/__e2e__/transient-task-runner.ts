import { log } from 'apify';

import type { ExtendedApifyClient } from '../types.js';
import { getActorId } from './actor-id.js';
import { TestTaskRunner } from './test-task-runner.js';

export class TestTransientTaskRunner extends TestTaskRunner {
    private readonly taskName: string;

    private constructor(apifyClient: ExtendedApifyClient, taskId: string, taskName: string) {
        super(apifyClient, taskId);
        this.taskName = taskName;
    }

    static async new(
        client: ExtendedApifyClient,
        taskName: string,
        numberToOutput?: number,
    ): Promise<TestTransientTaskRunner> {
        const actorId = await getActorId();
        const task = await client
            .tasks()
            .create({ name: taskName, actId: actorId, input: { role: 'child', waitSeconds: 2, numberToOutput } });
        return new TestTransientTaskRunner(client, task.id, taskName);
    }

    async [Symbol.dispose]() {
        try {
            log.info('Deleting test task', { taskName: this.taskName, taskId: this.taskId });
            await this.taskClient.delete();
        } catch (err) {
            log.warning('Failed to delete test task', { taskName: this.taskName, taskId: this.taskId, error: err });
        }
    }
}
