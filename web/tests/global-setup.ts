import { Client } from "pg";

// Starts every test run from an empty database
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://postpilot:test@localhost:5432/postpilot_test";
  // Safety net: never wipe a database that is not clearly a test database
  if (!new URL(url).pathname.endsWith("_test")) throw new Error(`Refusing to reset ${url}: the database name must end with _test`);
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await client.end();
}
