import { buildApp } from "./app.js";
import { config } from "./config.js";
import { pool } from "./db/index.js";

const app = await buildApp();

const shutdown = async () => {
  await app.close();
  await pool.end();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({
  host: "0.0.0.0",
  port: config.port,
});
