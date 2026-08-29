import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import {
  buildPostPage,
  decodeFeedCursor,
  encodeFeedCursor,
  homeFeed,
  InvalidFeedCursorError,
  type FeedItem,
} from "../../src/server/feed/home-feed.js";
import { createDataSource } from "../../src/server/persistence/data-source.js";
import { migrateAndSeed } from "../../src/server/persistence/migrate-and-seed.js";
import {
  FollowEntity,
  PostEntity,
  UserEntity,
} from "../../src/server/persistence/model.js";

const actorId = "00000000-0000-4000-8000-000000000001";
const followedId = "00000000-0000-4000-8000-000000000002";
const strangerId = "00000000-0000-4000-8000-000000000003";

test("round-trips a stable feed cursor", () => {
  const feedCursor = {
    createdAt: new Date("2026-08-18T12:00:00.000Z"),
    id: "42",
  };

  assert.deepEqual(decodeFeedCursor(encodeFeedCursor(feedCursor)), feedCursor);
});

test("rejects malformed feed cursors", () => {
  assert.throws(
    () => decodeFeedCursor(Buffer.from("not-a-cursor").toString("base64url")),
    InvalidFeedCursorError,
  );
});

test("builds a 20-post page with a continuation cursor", () => {
  const items: FeedItem[] = Array.from({ length: 21 }, (_, index) => ({
    id: String(21 - index),
    userId: actorId,
    username: "demo",
    displayName: "Demo User",
    body: `Post ${index}`,
    createdAt: new Date(`2026-08-18T12:${String(59 - index).padStart(2, "0")}:00.000Z`),
  }));

  const page = buildPostPage(items);
  const lastItem = page.items.at(-1);

  assert.equal(page.items.length, 20);
  assert.ok(lastItem);
  assert.equal(page.nextCursor, encodeFeedCursor(lastItem));
});

const databaseUrl = process.env.TEST_DATABASE_URL;
const integrationTest = databaseUrl === undefined ? test.skip : test;

integrationTest(
  "returns only actor and followed posts in reverse chronological order",
  async () => {
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
      await dataSource.getRepository(UserEntity).upsert(
        {
          id: strangerId,
          username: "stranger",
          displayName: "Stranger User",
          passwordHash: null,
          createdAt: new Date("2026-08-18T12:00:00.000Z"),
        },
        ["username"],
      );
      await dataSource.getRepository(FollowEntity).insert({
        followerId: actorId,
        followeeId: followedId,
        createdAt: new Date("2026-08-18T12:01:00.000Z"),
      });
      await dataSource.getRepository(PostEntity).insert([
        {
          userId: actorId,
          body: "Actor post",
          createdAt: new Date("2026-08-18T12:03:00.000Z"),
        },
        {
          userId: followedId,
          body: "Followed post",
          createdAt: new Date("2026-08-18T12:04:00.000Z"),
        },
        {
          userId: strangerId,
          body: "Stranger post",
          createdAt: new Date("2026-08-18T12:05:00.000Z"),
        },
      ]);

      const page = await homeFeed({ actorId }, dataSource);

      assert.deepEqual(
        page.items.map(({ body }) => body),
        ["Followed post", "Actor post"],
      );
    } finally {
      if (dataSource.isInitialized) {
        await dataSource.destroy();
      }
    }
  },
);
