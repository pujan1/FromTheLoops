# BullMQ

## Role In FromTheLoop

BullMQ moves work from Vercel-hosted web routes to the long-running worker on Hetzner. The current queue is a Sprint 0 `hello` demo; planned queues include aggregation, search indexing, and notifications.

## Where It Lives

- Producer singleton: `apps/web/lib/queue.ts`
- Producer route: `apps/web/app/api/hello/enqueue/route.ts`
- Worker entrypoint: `apps/worker/src/index.ts`
- Job handler: `apps/worker/src/jobs/hello.ts`

## Workflow Integration

The web app enqueues:

```ts
const queue = getHelloQueue();
const job = await queue.add("hello", { message });
```

The worker consumes:

```ts
// apps/worker/src/index.ts
const helloWorker = new Worker(HELLO_QUEUE, processHello, {
  connection: redisConnection,
  concurrency: Number(process.env.WORKER_CONCURRENCY ?? 4),
});

helloWorker.on("failed", (job, err) => {
  Sentry.captureException(err, {
    tags: { queue: HELLO_QUEUE },
    extra: { jobId: job?.id, jobName: job?.name },
  });
});
```

## Tradeoffs And Gotchas

- BullMQ gives durable queues and worker concurrency without introducing a separate platform.
- Redis is a dependency for both web producers and worker consumers.
- Queue producers are cached per Vercel function instance to avoid reconnecting on every call.
- Do not add direct `ioredis` dependencies. BullMQ pulls it transitively and duplicate versions can cause TypeScript identity issues.
- Worker connections must use `maxRetriesPerRequest: null`.

## Common Workflow

1. Define queue name and job data type.
2. Add producer helper in the web app or a shared package.
3. Add worker handler under `apps/worker/src/jobs`.
4. Register the worker in `apps/worker/src/index.ts`.
5. Add Sentry context for failed jobs.
