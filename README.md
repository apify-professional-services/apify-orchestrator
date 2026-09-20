# Apify Orchestrator

An opinionated library built around `apify` and `apify-client`, aiming at providing a nice tool for calling several external Actors in the same Run and gathering their results.

Differently from other solutions, this library does not force you to run a fixed bunch of Actors in parallel:
instead, it allows you to trigger one or more new Runs from everywhere in your code, at any moment, giving you maximum flexibility.

## Contributing

1. Please, take a look at existing issues and submit your pull requests to: https://github.com/apify-professional-services/apify-orchestrator.
2. Before starting to work on some topic, make sure to create/assign the corresponding issue to yourself.
3. Remember to bump the patch/minor/major version number, using `npm version major/minor/path`.
4. This project is still to be considered in _alpha_ state, and it follows the [semantic versioning](https://semver.org/) rules. This means that:
    - the major version number is `0`;
    - breaking changes are allowed on different minor versions.
5. Remember to add/fix **unit tests**:
    - [`vitest`](https://vitest.dev/) is used;
    - take a look at existing tests in the `test` folder and follow the same organization/naming conventions;
    - the `package.json` includes scripts for testing.
6. After every change, run the end-to-end test suite. For more details, check `test-actor`'s readme.
7. Create a **Pull Request** for every change, and merge it to `main`.
8. Update `CHANGELOG.md` before publishing a new version.

### About the codebase

- All public objects are exported from the `index.ts` file. This includes all the types in `types.ts`:
    - if you want to create a new public interface, put it in `types.ts`, give it a meaningful name and add some `js-doc` to it, if necessary;
    - no internal interface should be in `types.ts`, because it would be exported to the user.
- The components share their state and their behavior through two layered contexts, in the `context` folder:
    - the `OrchestratorContext` carries what is common to the whole Orchestrator: the options and the logger;
    - the `ClientContext` extends it with everything that belongs to a single client and which may differ from one client to another.

Thanks for your contributions!

## Main features

Most of the following features are opt-in: you can use just the ones you need.

- Automatic **resources' management**: start a Run when there is enough memory and Actor jobs available on the selected account.

- Limit **how many Runs** a client keeps in progress at the same time _(opt-in)_.

- Store the Runs in progress in the Key Value Store and **resume** them after a resurrection, avoiding starting a new, redundant Run.

- Abort all the Runs in progress, triggered by the orchestrator, when the latter is gracefully aborted _(opt-in)_.\
  In this way, you have at your disposal a **kill switch** to stop all the Runs at once, for instance, to keep scraping costs under control.\
  The code waiting for those Runs hangs until the process is killed, so you never have to tell a Run aborted by the
  library from a Run aborted by a user.

- Avoid to incur in errors due to **too large strings**, e.g., due to JavaScript or Apify API limits.

- Log all the events that occur (a Run starts, finishes, fails...) in a format that is **easy to read and debug**.

## Installation

```sh
npm install apify-orchestrator
```

## Quick-start

Normally, to call an Actor you would use the Apify client.
This is one way to do it **without** the Orchestrator library:

```js
import { Actor } from 'apify';

// Create a client
const client = Actor.newClient({ token });

// Generate the Actor's input
const urls = ['...', '...', ...];
const actorInput = { startUrls: urls.map((url) => ({ url })) };

// Call an Actor, creating a new Run, an wait for it to finish
const run = await client.actor(actorId).call(actorInput);

// Read the default dataset
const itemList = await client.dataset(run.defaultDatasetId).listItems();

// Process the items
for (const item of itemList.items) {
    console.log(item.value);
}
```

With the Orchestrator library:

```js
import { Orchestrator } from './orchestrator/index.js'

// Create the main orchestrator object and pass some options
const orchestrator = new Orchestrator({
    enableLogs: true,
    statsIntervalSec: 300,
    persistenceSupport: 'kvs',
    persistencePrefix: 'ORCHESTRATOR-',
    abortAllRunsOnGracefulAbort: true,
});

// Create a new client: you can optionally give it a name
const client = await orchestrator.apifyClient({ name: 'MY-CLIENT', token });

// Generate the Actor's input
const urls = ['...', '...', ...];
const actorInput = { startUrls: urls.map((url) => ({ url })) };

// Call an Actor, creating a new Run, an wait for it to finish
// Here you can give this Run a name, which will be used wether a resurrection takes place
const run = await client.actor(actorId).call(actorInput, { runName: 'my-job' });

// Read the default dataset
const itemList = await client.dataset(run.defaultDatasetId).listItems({ skipEmpty: true });

// Process the items
for (const item of itemList.items) {
    console.log(item.value);
}
```

The two codes are very similar, but there are already a few advantages to using the Orchestrator:
you can benefit from logs and regular reports, and the status of the Run is saved into the Key Value Store under the key
`ORCHESTRATOR-MY-CLIENT-RUNS` with the name `my-job`, so if the Orchestrator times out, you can resurrect it, and it
will wait for the same Run you started initially.
Moreover, if you gracefully abort the orchestrator while the external Run is in progress, the latter will also be
aborted, and `call` will never return: see [the next section](#aborting-the-external-runs-on-graceful-abort).

## Aborting the external Runs on graceful abort

By default (`abortAllRunsOnGracefulAbort: true`), when your Actor is **gracefully aborted**, the Orchestrator aborts all
the Runs it started and that are still in progress.

The methods that are waiting for one of those Runs - `call`, `callRuns`, `callBatch`, `waitForFinish`, and
`waitForBatchFinish` - **never return**: they hang until the Apify platform kills the process, at the end of the
graceful abort timeout.

This is intentional. If they returned the aborted Run, you would receive a regular `ABORTED` Run, and you would have to
tell two very different situations apart in each and every place where you wait for a Run:

1. the Run was aborted by the library, because your own Actor is shutting down;
2. the Run was aborted by a user.

Since your Actor is being shut down anyway, hanging makes sure that the code you would normally run after a successful
Run - pushing results, computing statistics, starting other Runs - is not executed with an aborted Run:

```js
const orchestrator = new Orchestrator({ abortAllRunsOnGracefulAbort: true });
const client = await orchestrator.apifyClient();

// If the Actor is gracefully aborted while this Run is in progress, this line never returns,
// and the code below is never executed.
const run = await client.actor(actorId).call(actorInput, { runName: 'my-job' });
await processResults(run);
```

If you need to perform some clean-up after your Runs have been aborted, you can enable
`returnAbortedRunsOnGracefulAbort`: the same methods return the aborted Runs, which carry the additional flag
`abortedOnGracefulAbort`, set to `true`, so you can still tell them apart from the Runs aborted by a user:

```js
const orchestrator = new Orchestrator({
    abortAllRunsOnGracefulAbort: true,
    returnAbortedRunsOnGracefulAbort: true,
});
const client = await orchestrator.apifyClient();

const run = await client.actor(actorId).call(actorInput, { runName: 'my-job' });

if (run.abortedOnGracefulAbort) {
    // The Orchestrator aborted this Run because our Actor is being gracefully aborted.
    await cleanUp();
} else if (run.status === 'ABORTED') {
    // A user aborted this Run.
    log.warning('The Run was aborted by a user');
}
```

If you disable `abortAllRunsOnGracefulAbort`, none of this applies: the external Runs keep going, and the methods
waiting for them are killed abruptly, together with your Actor.

## Limiting the number of concurrent Runs

By default, a client starts a Run as soon as the account it uses has enough resources for it.
If you want to keep the number of Runs in progress under a fixed threshold, set `maxConcurrentRuns` on the client:

```js
const orchestrator = new Orchestrator();
const client = await orchestrator.apifyClient({ maxConcurrentRuns: 2 });

// Only two of these Runs are in progress at any given time: the others are started as the first ones finish.
const runs = await client
    .actor(actorId)
    .callRuns(
        { runName: 'job-a', input: inputA },
        { runName: 'job-b', input: inputB },
        { runName: 'job-c', input: inputC },
        { runName: 'job-d', input: inputD },
    );
```

A Run counts towards the limit from the moment it is started until it reaches a terminal status, whether it succeeded
or not. When the limit is reached, the requests to start new Runs simply stay in the scheduler's queue, and the
scheduler starts them as soon as some of the Runs in progress finish: `enqueue` still returns immediately, while the
methods that wait for a Run, such as `start` and `call`, wait longer, until their Run can be started.

## Avoiding ambiguous Run requests

Every `start`/`call`/`enqueue` request is identified by a request ID: either the `runName` you provide, or, if you omit
it, a hash generated from the Actor/Task, input, and options. This is what makes resurrection work: reconnecting to a
Run started before a restart, instead of starting a redundant one.

If you call `start`/`call`/`enqueue` twice **in the same process**, with the same input/options and no `runName`, the
second call throws `AmbiguousRunRequestError` instead of silently reconnecting to the first Run - there would be no way
to tell "you asked for one Run and got it back twice" from "you wanted two independent Runs but forgot to name them".
If you do want to start multiple Runs with identical input, give each one an explicit `runName`:

```js
// Throws AmbiguousRunRequestError on the second call:
const run1 = await client.actor(actorId).call(actorInput);
const run2 = await client.actor(actorId).call(actorInput);

// Works as expected:
const run1 = await client.actor(actorId).call(actorInput, { runName: 'run-a' });
const run2 = await client.actor(actorId).call(actorInput, { runName: 'run-b' });
```

This only applies within the same process, with no resurrection in between, and it never applies if:

- you provide an explicit `runName` and reuse it yourself - for the orchestrator, that means that you want the same run;
- the previous Run for that request failed, aborted, or timed out - retrying is always allowed;
- the Orchestrator has actually been resurrected - reconnecting to a previously started Run is a core feature.

## Avoiding size limits

There are two occasions when you could exceed some limit:

1. when starting a Run and providing an input that is too large, exceeding the API limit:

```
Status code 413: the POST payload is too large (limit: 9437184 bytes, actual length: 9453568 bytes)
```

2. when you try to read a dataset that is too large all at once, exceeding the JavaScript string limit.

```
Error: Cannot create a string longer than 0x1fffffe8 characters
```

To avoid both those cases, you can fix the previous code in this way:

```js
import { Orchestrator } from './orchestrator/index.js'

// Create the main orchestrator object and pass some options
const orchestrator = new Orchestrator({
    enableLogs: true,
    persistenceSupport: 'kvs',
    persistencePrefix: 'ORCHESTRATOR-',
    abortAllRunsOnGracefulAbort: true,
});

// Create a new client: you can optionally give it a name
const client = await orchestrator.apifyClient({ name: 'MY-CLIENT', token });

// These are the sources for the Actor's input
const sourceUrls = ['...', '...', ...];

// A function to generate the input, from the sources
const inputGenerator = (urls) => ({ startUrls: urls.map((url) => ({ url }))});

// Automatically split the input in multiple parts, if necessary, and start multiple Runs
const runs = await client.actor(actorId).callBatch(
    'my-job',                             // the Run/batch name (if multiple Runs are triggered, it will become a prefix)
    sourceUrls,                           // an array used to generate the input
    inputGenerator,                       // a function to generate the input
    { respectApifyMaxPayloadSize: true }, // tell the Orchestrator to split the input respecting the API limit
);

// Read the default dataset of each Run in order
for (const run of runs) {
    const datasetIterator = client.dataset(run.defaultDatasetId).listItems({
        chunkSize: 100,  // define a chunk size to use pagination and avoid exceeding the string limit
        skipEmpty: true, // you can use the same options accepted by dataset.listItems
    });

    // Process the items
    for await (const item of datasetIterator) {
        console.log(item.value);
    }
}
```

Notice that `runs` is an array of `ExtendedActorRun` objects: regular `ActorRun` objects extended with a `requestId`
property, which contains the name of the Run, e.g., `my-job-1/2`, or a hash generated from the Run's request.

Also, notice the `for await` at the end: it is due to the fact that `datasetIterator`, returned by `apify-client`'s
`listItems`, is an [async iterable](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for-await...of)
which fetches items in chunks of `chunkSize`, yielding them one by one, then fetches the next chunk, and so on.

Be aware that, with the current implementation, input splitting may be quite slow.
If you preferred to split the input yourself, you can do it like this:

```js
const input1 = { ... }
const input2 = { ... }

// Use callRuns instead of callBatch, and provide the names and the inputs yourself
const runs = await client.actor(actorId).callRuns(
    { runName: 'my-job-a', input: input1 },
    { runName: 'my-job-b', input: input2 },
);
```

## How to abort all the external Runs on timeout or normal abort

You can use the [Children Run Killer](https://github.com/apify-projects/triangle/tree/master/children-run-killer).

You will need to set it up on your Organization or personal account.
Then, you can create an Orchestrator with the following settings:

```js
import { Actor } from 'apify';

import { Orchestrator } from './orchestrator/index.js';

const CHILDREN_RUN_KILLER_INPUT_PARAMS = {
    __watched: {
        parentRunId: Actor.getEnv().actorRunId,
        apifyUserId: Actor.getEnv().userId,
    },
};

const orchestrator = new Orchestrator({
    fixedInput: CHILDREN_RUN_KILLER_INPUT_PARAMS,
});
```

The parameters defined in `fixedInput` will be added to _all_ the Runs triggered using the orchestrator object.

## How to hide sensitive information from the user

Sensitive information, such as Run IDs, can be logged or stored into the Key Value Store,
depending on the Orchestrator's configuration.
If you would like to keep using logs and persistence, but you want to hide such information, set these options:

```js
import { Orchestrator } from './orchestrator/index.js';

const orchestrator = new Orchestrator({
    enableLogs: true,
    hideSensitiveInformation: true, // will hide information such as Run IDs from logs
    persistenceSupport: 'kvs', // will enable persistence-related features, such as managing resurrections
    persistenceEncryptionKey: 'my-secret-key', // will make data written by the Orchestrator into the Key Value Store encrypted
});
```

## Orchestrator API

Each client provided by this library extends its corresponding client from `apify-client`, e.g., `ExtendedApifyClient`
extends `ApifyClient`, and you can use any method from its super-class.

For additional information, see [this file](./src/types.ts).

## Future improvements

See [issues](https://github.com/apify-professional-services/apify-orchestrator/issues).
