import assert from "node:assert/strict";
import test from "node:test";

import { bootstrap } from "../../src/server/bootstrap.js";

test("initializes persistence before starting the server", async () => {
  const calls: string[] = [];

  await bootstrap({
    migrateAndSeed: async () => {
      calls.push("migrateAndSeed");
    },
    startServer: async () => {
      calls.push("startServer");
    },
  });

  assert.deepEqual(calls, ["migrateAndSeed", "startServer"]);
});

test("does not start the server when persistence initialization fails", async () => {
  const persistenceFailure = new Error("persistence initialization failed");
  let serverStarted = false;

  await assert.rejects(
    bootstrap({
      migrateAndSeed: async () => {
        throw persistenceFailure;
      },
      startServer: async () => {
        serverStarted = true;
      },
    }),
    persistenceFailure,
  );

  assert.equal(serverStarted, false);
});
