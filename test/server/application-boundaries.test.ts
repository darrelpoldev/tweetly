import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import {
  InvalidRequestOriginError,
  verifyRequestOrigin,
} from "../../src/server/http/application.js";
import { readRuntimeConfig } from "../../src/server/runtime-config.js";

test("accepts absent and same-host request origins", () => {
  assert.doesNotThrow(() => verifyRequestOrigin(undefined, "127.0.0.1:3000"));
  assert.doesNotThrow(() =>
    verifyRequestOrigin("http://127.0.0.1:3000", "127.0.0.1:3000"),
  );
});

test("rejects cross-origin and malformed request origins", () => {
  assert.throws(
    () => verifyRequestOrigin("https://example.com", "127.0.0.1:3000"),
    InvalidRequestOriginError,
  );
  assert.throws(
    () => verifyRequestOrigin("not-a-url", "127.0.0.1:3000"),
    InvalidRequestOriginError,
  );
});

test("parses required runtime configuration with safe defaults", () => {
  const config = readRuntimeConfig({
    DATABASE_URL: "postgresql://localhost/tweetly",
    SEED_USER_PASSWORD: randomBytes(24).toString("base64url"),
  });

  assert.equal(config.port, 3_000);
  assert.equal(config.production, false);
});

test("defaults the seeded login password to admin", () => {
  const config = readRuntimeConfig({
    DATABASE_URL: "postgresql://localhost/tweetly",
  });

  assert.equal(config.seedUserPassword, "admin");
});

test("rejects missing runtime configuration", () => {
  assert.throws(() => readRuntimeConfig({}), Error);
});
