import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { createDataSource } from "../../src/server/persistence/data-source.js";
import { migrateAndSeed } from "../../src/server/persistence/migrate-and-seed.js";
import {
  FollowEntity,
  PostEntity,
} from "../../src/server/persistence/model.js";
import {
  profile,
  ProfileNotFoundError,
} from "../../src/server/profile/profile.js";

const actorId = "00000000-0000-4000-8000-000000000001";
const followedId = "00000000-0000-4000-8000-000000000002";
const databaseUrl = process.env.TEST_DATABASE_URL;
const integrationTest = databaseUrl === undefined ? test.skip : test;

integrationTest("returns profile counts, relationship, and posts", async () => {
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
    await dataSource.getRepository(PostEntity).clear();
    await dataSource.getRepository(FollowEntity).clear();
    await dataSource.getRepository(FollowEntity).insert({
      followerId: actorId,
      followeeId: followedId,
      createdAt: new Date("2026-08-18T12:01:00.000Z"),
    });
    await dataSource.getRepository(PostEntity).insert({
      userId: followedId,
      body: "Friend profile post",
      createdAt: new Date("2026-08-18T12:02:00.000Z"),
    });

    const result = await profile(
      { viewerId: actorId, username: " FRIEND " },
      dataSource,
    );

    assert.equal(result.user.username, "friend");
    assert.equal(result.followerCount, 1);
    assert.equal(result.followingCount, 0);
    assert.equal(result.isFollowing, true);
    assert.deepEqual(
      result.posts.items.map(({ body }) => body),
      ["Friend profile post"],
    );
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
});

integrationTest("rejects an unknown profile", async () => {
  assert.ok(databaseUrl);
  const dataSource = createDataSource(databaseUrl);

  try {
    await dataSource.initialize();
    await assert.rejects(
      profile({ viewerId: actorId, username: "missing" }, dataSource),
      ProfileNotFoundError,
    );
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
});
