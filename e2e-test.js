#!/usr/bin/env node

import { ApifyClient } from 'apify-client';
import { execSync } from 'node:child_process';
import { cpSync, existsSync, renameSync, rmSync } from 'node:fs';
import { exit } from 'node:process';

console.log('Starting end-to-end tests for Apify Orchestrator.\n');

const apifyToken = process.env.APIFY_TOKEN;
if (!apifyToken) {
    console.error('APIFY_TOKEN environment variable is not set. Please set it to run the end-to-end tests.');
    exit(1);
}

console.log('Installing the Apify CLI.\n');

try {
    execSync('npm install -g apify-cli', { stdio: 'inherit' });
} catch {
    console.error('\nFailed to install the Apify CLI. Exiting.');
    exit(1);
}

console.log('Logging in to Apify CLI with the provided token.\n');

try {
    execSync(`apify login --token "${apifyToken}"`, { stdio: 'inherit' });
} catch {
    console.error('\nFailed to login to Apify CLI. Exiting.');
    exit(1);
}

const actorName = `apify-orchestrator-e2e-test-${Date.now()}`;
const actorTemplate = 'ts_empty';

console.log(`\nCreating actor: ${actorName}. Using template: ${actorTemplate}\n`);

try {
    execSync(`apify create "${actorName}" --template "${actorTemplate}" --skip-dependency-install --source apify`, {
        stdio: 'inherit',
    });
} catch {
    console.error('\nFailed to create actor. Exiting.');
    exit(1);
}

console.log('\nActor created. Copying test files to the actor directory.\n');

const actorSrcPath = `${actorName}/src`;
if (existsSync(actorSrcPath)) {
    rmSync(actorSrcPath, { recursive: true, force: true });
}

cpSync('src', actorSrcPath, {
    recursive: true,
    filter: (source) => !source.endsWith('.test.ts') && !source.endsWith('.bench.ts'),
});
renameSync(`${actorSrcPath}/e2e-test.ts`, `${actorSrcPath}/main.ts`);

console.log('\nInstalling dependencies.\n');

try {
    // Add the dependencies to package.json and package-lock.json, but avoid installing them locally.
    const dependencies = ['apify-client'];
    execSync(`npm install ${dependencies.join(' ')} --package-lock-only`, { cwd: actorName, stdio: 'inherit' });
} catch {
    console.error('\nFailed to install dependencies. Exiting.');
    exit(1);
}

console.log('\nCreating the Actor on the Apify Platform.\n');

const apifyClient = new ApifyClient({ token: apifyToken });
const actor = await apifyClient.actors().create({ name: actorName, title: actorName });
const deleteActor = async () => {
    console.log('\nDeleting the Actor from the Apify Platform.\n');
    try {
        await apifyClient.actor(actor.id).delete();
    } catch {
        console.error(
            `\nFailed to delete the Actor from the Apify Platform. Actor URL: https://console.apify.com/actors/${actor.id}`,
        );
    }
};

console.log('\nPushing the actor to Apify Platform.\n');

try {
    // Since the Actor was created through the client, we need to force the push.
    execSync(`apify push "${actor.id}" --dir "${actorName}" --force`, { stdio: 'inherit' });
} catch {
    console.error('\nFailed to push the actor to Apify Platform. Exiting.');
    await deleteActor();
    exit(1);
}

console.log('\nActor pushed. Starting the actor run.\n');

const run = await apifyClient.actor(actor.id).call({ role: 'e2e-test' }, { forcePermissionLevel: 'FULL_PERMISSIONS' });

await apifyClient
    .dataset(run.defaultDatasetId)
    .listItems()
    .then(({ items }) => {
        console.log(`\nTest results: ${JSON.stringify(items, null, 2)}\n`);
    })
    .catch(() => {
        console.error('\nFailed to retrieve test results.\n');
        return null;
    });

await deleteActor();

if (run.status === 'SUCCEEDED') {
    console.log('\nEnd-to-end test completed successfully.');
} else {
    console.error(`\nEnd-to-end tests failed. Run URL: https://console.apify.com/actors/runs/${run.id}.`);
    exit(1);
}
