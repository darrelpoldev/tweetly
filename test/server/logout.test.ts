import assert from "node:assert/strict";
import test from "node:test";

import { hashSessionToken } from "../../src/server/auth/authenticate.js";
import { logout, revokeSession } from "../../src/server/auth/logout.js";

test("deletes only the hash of the supplied session token", async () => {
  let deletedTokenHash = "";

  await logout("raw-session-token", {
    deleteSession: async (tokenHash) => {
      deletedTokenHash = tokenHash;
    },
  });

  assert.equal(deletedTokenHash, hashSessionToken("raw-session-token"));
});

test("revocation remains successful when the session is absent", async () => {
  await assert.doesNotReject(
    revokeSession("missing-session-token", {
      deleteSession: async () => undefined,
    }),
  );
});
