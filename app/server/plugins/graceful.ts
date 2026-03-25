import { closePrisma } from "../clients/prismaClient";
import { closeRedis } from "../clients/redisClient";

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook("close", async () => {
    await closePrisma();
    await closeRedis();
  });
});
