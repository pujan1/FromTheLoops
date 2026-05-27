import type { Job } from "bullmq";

export const HELLO_QUEUE = "hello";

export interface HelloJobData {
  message: string;
}

export async function processHello(job: Job<HelloJobData>): Promise<void> {
  console.log(`[hello] job ${job.id}: ${job.data.message}`);
}
