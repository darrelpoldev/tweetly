import assert from "node:assert/strict";
import test from "node:test";

import {
  authenticate,
  hashSessionToken,
  InvalidCredentialsError,
  type AuthenticationDependencies,
} from "../../src/server/auth/authenticate.js";
import type { SessionRecord, UserRecord } from "../../src/server/persistence/model.js";

const loginUser: UserRecord = {
  id: "00000000-0000-4000-8000-000000000001",
  username: "demo",
  displayName: "Demo User",
  passwordHash: "stored-password-hash",
  createdAt: new Date("2026-08-18T12:00:00.000Z"),
};

function createAuthenticationDependencies(
  overrides: Partial<AuthenticationDependencies> = {},
): AuthenticationDependencies {
  return {
    findUserByUsername: async () => loginUser,
    verifyPassword: async () => true,
    createToken: () => "raw-session-token",
    createSession: async () => undefined,
    now: () => new Date("2026-08-18T12:00:00.000Z"),
    ...overrides,
  };
}

test("normalizes the username and persists only the token hash", async () => {
  let lookedUpUsername = "";
  let persistedSession: SessionRecord | undefined;
  const dependencies = createAuthenticationDependencies({
    findUserByUsername: async (username) => {
      lookedUpUsername = username;
      return loginUser;
    },
    createSession: async (session) => {
      persistedSession = session;
    },
  });

  const session = await authenticate(
    { username: "  DEMO ", password: "supplied-password" },
    dependencies,
  );

  assert.equal(lookedUpUsername, "demo");
  assert.equal(session.token, "raw-session-token");
  assert.equal(
    persistedSession?.tokenHash,
    hashSessionToken("raw-session-token"),
  );
  assert.equal(
    session.expiresAt.toISOString(),
    "2026-09-17T12:00:00.000Z",
  );
});

test("rejects an unknown username", async () => {
  const dependencies = createAuthenticationDependencies({
    findUserByUsername: async () => null,
  });

  await assert.rejects(
    authenticate({ username: "missing", password: "password" }, dependencies),
    InvalidCredentialsError,
  );
});

test("rejects a user without password credentials", async () => {
  const dependencies = createAuthenticationDependencies({
    findUserByUsername: async () => ({ ...loginUser, passwordHash: null }),
  });

  await assert.rejects(
    authenticate({ username: "friend", password: "password" }, dependencies),
    InvalidCredentialsError,
  );
});

test("rejects an invalid password without creating a session", async () => {
  let sessionCreated = false;
  const dependencies = createAuthenticationDependencies({
    verifyPassword: async () => false,
    createSession: async () => {
      sessionCreated = true;
    },
  });

  await assert.rejects(
    authenticate({ username: "demo", password: "wrong" }, dependencies),
    InvalidCredentialsError,
  );
  assert.equal(sessionCreated, false);
});
