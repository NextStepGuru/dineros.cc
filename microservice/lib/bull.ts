import { createBullBoard } from "@bull-board/api";
import { Queue } from "bullmq";
import { sharedRedisConnection } from "../clients/redisClient";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { H3Adapter } from "@bull-board/h3";

const queues: string[] = [
  "daily-backup",
  "recalculate",
  "plaid-sync",
  "plaid-sync-balance",
];

const serverAdapter = new H3Adapter();
serverAdapter.setBasePath("/bull");

// Only create Bull Board if not in test mode
if (process.env.NODE_ENV !== 'test') {
  createBullBoard({
    queues: queues.map(
      (queue) =>
        new BullMQAdapter(
          new Queue(queue, {
            connection: sharedRedisConnection,
          })
        )
    ),
    serverAdapter,
  });
}

// Export H3 event handler for Bull Board (or empty handler in test mode)
export default process.env.NODE_ENV === 'test'
  ? () => ({ statusCode: 404, body: 'Bull Board disabled in test mode' })
  : serverAdapter.registerHandlers();
