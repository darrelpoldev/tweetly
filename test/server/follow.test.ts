import assert from "node:assert/strict";
import test from "node:test";

import {
  deleteFollow,
  follow,
  FollowConflictError,
  FollowTargetNotFoundError,
  type FollowDependencies,
  unfollow,
} from "../../src/server/social/follow.js";
import type { FollowRecord } from "../../src/server/persistence/model.js";

const actorId = "00000000-0000-4000-8000-000000000001";
const targetId = "00000000-0000-4000-8000-000000000002";

function createFollowDependencies(
  overrides: Partial<FollowDependencies> = {},
): FollowDependencies {
  return {
    userExists: async () => true,
    saveFollow: async () => undefined,
    now: () => new Date("2026-08-18T12:00:00.000Z"),
    ...overrides,
  };
}

test("creates a follow edge for an existing target", async () => {
  let savedFollow: FollowRecord | undefined;
  const dependencies = createFollowDependencies({
    saveFollow: async (followRecord) => {
      savedFollow = followRecord;
    },
  });

  const createdFollow = await follow({ actorId, targetId }, dependencies);

  assert.deepEqual(createdFollow, {
    followerId: actorId,
    followeeId: targetId,
    createdAt: new Date("2026-08-18T12:00:00.000Z"),
  });
  assert.deepEqual(savedFollow, createdFollow);
});

test("rejects a missing follow target", async () => {
  const dependencies = createFollowDependencies({
    userExists: async () => false,
  });

  await assert.rejects(
    follow({ actorId, targetId }, dependencies),
    FollowTargetNotFoundError,
  );
});

test("rejects self-follow without reading or writing", async () => {
  let dependencyCalled = false;
  const dependencies = createFollowDependencies({
    userExists: async () => {
      dependencyCalled = true;
      return true;
    },
    saveFollow: async () => {
      dependencyCalled = true;
    },
  });

  await assert.rejects(
    follow({ actorId, targetId: actorId }, dependencies),
    FollowConflictError,
  );
  assert.equal(dependencyCalled, false);
});

test("surfaces duplicate follow conflicts", async () => {
  const conflict = new FollowConflictError();
  const dependencies = createFollowDependencies({
    saveFollow: async () => {
      throw conflict;
    },
  });

  await assert.rejects(follow({ actorId, targetId }, dependencies), conflict);
});

test("unfollow removes an existing edge", async () => {
  let removedInput: { actorId: string; targetId: string } | undefined;

  await unfollow(
    { actorId, targetId },
    {
      removeFollow: async (input) => {
        removedInput = input;
      },
    },
  );

  assert.deepEqual(removedInput, { actorId, targetId });
});

test("deleteFollow remains successful when no edge exists", async () => {
  await assert.doesNotReject(
    deleteFollow(
      { actorId, targetId },
      { removeFollow: async () => undefined },
    ),
  );
});
