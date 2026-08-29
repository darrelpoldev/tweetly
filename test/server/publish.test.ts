import assert from "node:assert/strict";
import test from "node:test";

import {
  InvalidPostBodyError,
  publish,
  type PostDraft,
  type PublishDependencies,
} from "../../src/server/posts/publish.js";

const actorId = "00000000-0000-4000-8000-000000000001";
const createdAt = new Date("2026-08-18T12:00:00.000Z");

function createPublishDependencies(
  overrides: Partial<PublishDependencies> = {},
): PublishDependencies {
  return {
    insertPost: async (draft) => ({ id: "1", ...draft }),
    now: () => createdAt,
    ...overrides,
  };
}

test("trims and publishes a valid post", async () => {
  let insertedDraft: PostDraft | undefined;
  const dependencies = createPublishDependencies({
    insertPost: async (draft) => {
      insertedDraft = draft;
      return { id: "1", ...draft };
    },
  });

  const post = await publish(
    { actorId, body: "  My first post  " },
    dependencies,
  );

  assert.deepEqual(insertedDraft, {
    userId: actorId,
    body: "My first post",
    createdAt,
  });
  assert.deepEqual(post, { id: "1", ...insertedDraft });
});

test("accepts exactly 300 Unicode characters", async () => {
  const body = "🙂".repeat(300);
  const post = await publish(
    { actorId, body },
    createPublishDependencies(),
  );

  assert.equal(post.body, body);
});

test("rejects an empty post", async () => {
  await assert.rejects(
    publish({ actorId, body: "   " }, createPublishDependencies()),
    InvalidPostBodyError,
  );
});

test("rejects a post over 300 Unicode characters without writing", async () => {
  let postInserted = false;
  const dependencies = createPublishDependencies({
    insertPost: async () => {
      postInserted = true;
      throw new Error("unexpected insert");
    },
  });

  await assert.rejects(
    publish({ actorId, body: "a".repeat(301) }, dependencies),
    InvalidPostBodyError,
  );
  assert.equal(postInserted, false);
});
