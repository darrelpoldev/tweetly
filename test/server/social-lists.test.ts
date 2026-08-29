import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { createDataSource } from "../../src/server/persistence/data-source.js";
import { migrateAndSeed } from "../../src/server/persistence/migrate-and-seed.js";
import { FollowEntity } from "../../src/server/persistence/model.js";
import {
  decodeSocialCursor,
  encodeSocialCursor,
  InvalidSocialCursorError,
  socialLists,
} from "../../src/server/social/social-lists.js";

const actorId = "00000000-0000-4000-8000-000000000001";
const followedId = "00000000-0000-4000-8000-000000000002";

test("round-trips a stable social cursor", () => {
  const cursor = {
    createdAt: new Date("2026-08-18T12:00:00.000Z"),
    userId: followedId,
  };

  assert.deepEqual(decodeSocialCursor(encodeSocialCursor(cursor)), cursor);
});

test("rejects malformed social cursors", () => {
  assert.throws(
    () =>
      decodeSocialCursor(Buffer.from("not-a-cursor").toString("base64url")),
    InvalidSocialCursorError,
  );
});

const databaseUrl = process.env.TEST_DATABASE_URL;
const integrationTest = databaseUrl === undefined ? test.skip : test;

integrationTest("returns follower and following lists", async () => {
  assert.ok(databaseUrl);
  const dataSource = createDataSource(databaseUrl);

  try {
    await migrateAndSeed({
      dataSource,
      seedUsersInput: {
        loginUser: {
          id: actorId,
          username: "demo",
          displayName: "Demo User",
          password: randomBytes(24).toString("base64url"),
        },
        followableUser: {
          id: followedId,
          username: "friend",
          displayName: "Friend User",
        },
        createdAt: new Date("2026-08-18T12:00:00.000Z"),
      },
    });
    await dataSource.getRepository(FollowEntity).clear();
    await dataSource.getRepository(FollowEntity).insert({
      followerId: actorId,
      followeeId: followedId,
      createdAt: new Date("2026-08-18T12:01:00.000Z"),
    });

    const following = await socialLists(
      { userId: actorId, kind: "following" },
      dataSource,
    );
    const followers = await socialLists(
      { userId: followedId, kind: "followers" },
      dataSource,
    );

    assert.deepEqual(
      following.items.map(({ username }) => username),
      ["friend"],
    );
    assert.deepEqual(
      followers.items.map(({ username }) => username),
      ["demo"],
    );
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
});
