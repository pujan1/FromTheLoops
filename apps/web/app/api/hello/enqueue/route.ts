import { auth } from "@clerk/nextjs/server";
import { getHelloQueue } from "@/lib/queue";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { message?: unknown };
  const message =
    typeof body.message === "string"
      ? body.message
      : `hello from ${userId} at ${new Date().toISOString()}`;

  const queue = getHelloQueue();
  const job = await queue.add("hello", { message });

  return Response.json({ jobId: job.id, message });
}
