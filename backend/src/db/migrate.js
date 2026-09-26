import "dotenv/config";
import { fileURLToPath } from "node:url";
import { runner } from "node-pg-migrate";

const requiredVariables = ["DB_HOST", "DB_PORT", "DB_NAME", "DB_USER"];
const missingVariables = requiredVariables.filter((name) => !process.env[name]);

if (missingVariables.length > 0) {
  throw new Error(`Missing database configuration: ${missingVariables.join(", ")}`);
}

const port = Number(process.env.DB_PORT);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("DB_PORT must be an integer between 1 and 65535");
}

await runner({
  databaseUrl: {
    host: process.env.DB_HOST,
    port,
    database: process.env.DB_NAME,
    user: process.env.DB_USER
  },
  dir: fileURLToPath(new URL("./migrations/", import.meta.url)),
  direction: "up",
  migrationsSchema: "public",
  migrationsTable: "schema_migrations",
  schema: "public",
  singleTransaction: true,
  verbose: false
});