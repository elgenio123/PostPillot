import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { defineConfig } from "vitest/config";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "postpilot-test-"));
const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://postpilot:test@localhost:5432/postpilot_test";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    // One file at a time: all tests share the same database
    fileParallelism: false,
    env: {
      DATABASE_URL: databaseUrl,
      DATA_DIR: dataDir,
      PROMPTS_DIR: path.resolve(__dirname, "../prompts"),
      CONFIG_DIR: path.resolve(__dirname, "../config"),
      POSTPILOT_SECRET: "test-secret",
      N8N_INTERNAL_URL: "http://n8n.test",
      ADMIN_EMAIL: "admin@test.local",
      ADMIN_PASSWORD: "Initial-Pass-123",
    },
  },
});
