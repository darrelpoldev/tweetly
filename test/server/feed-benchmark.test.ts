import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import test from "node:test";

import { homeFeed } from "../../src/server/feed/home-feed.js";
import { createDataSource } from "../../src/server/persistence/data-source.js";
import { migrateAndSeed } from "../../src/server/persistence/migrate-and-seed.js";
import {
  FollowEntity,
  PostEntity,
  SessionEntity,
  UserEntity,
  type FollowRecord,
  type UserRecord,
} from "../../src/server/persistence/model.js";

const actorId = "00000000-0000-4000-8000-000000000001";
const followedId = "00000000-0000-4000-8000-000000000002";
const databaseUrl = process.env.TEST_DATABASE_URL;
const integrationTest = databaseUrl === undefined ? test.skip : test;

integrationTest("keeps a 1,000-followee feed below 500 ms p95", async () => {
  assert.ok(databaseUrl);
  const dataSource = createDataSource(databaseUrl);
  const createdAt = new Date("2026-08-18T12:00:00.000Z");

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
        createdAt,
      },
    });
    await dataSource.getRepository(SessionEntity).clear();
    await dataSource.getRepository(PostEntity).clear();
    await dataSource.getRepository(FollowEntity).clear();

    const users: UserRecord[] = Array.from({ length: 1_000 }, (_, index) => ({
      id: randomUUID(),
      username: `benchmark-${String(index).padStart(4, "0")}`,
      displayName: `Benchmark User ${index}`,
      passwordHash: null,
      createdAt,
    }));
    await dataSource.getRepository(UserEntity).upsert(users, ["username"]);

    const follows: FollowRecord[] = users.map((user) => ({
      followerId: actorId,
      followeeId: user.id,
      createdAt,
    }));
    await dataSource.getRepository(FollowEntity).insert(follows);

    const posts = users.flatMap((user, userIndex) =>
      Array.from({ length: 5 }, (_, postIndex) => ({
        userId: user.id,
        body: `Benchmark post ${postIndex}`,
        createdAt: new Date(createdAt.getTime() + userIndex * 10 + postIndex),
      })),
    );
    await dataSource.getRepository(PostEntity).insert(posts);

    await homeFeed({ actorId }, dataSource);
    const durations: number[] = [];
    for (let iteration = 0; iteration < 20; iteration += 1) {
      const startedAt = performance.now();
      const page = await homeFeed({ actorId }, dataSource);
      durations.push(performance.now() - startedAt);
      assert.equal(page.items.length, 20);
    }
    durations.sort((left, right) => left - right);
    const p95Index = Math.ceil(durations.length * 0.95) - 1;
    const p95 = durations[p95Index];
    assert.ok(p95 !== undefined);
    assert.ok(p95 <= 500, `expected p95 <= 500 ms, received ${p95.toFixed(2)} ms`);
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
});
