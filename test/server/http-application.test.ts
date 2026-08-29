import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import type { FastifyInstance } from "fastify";
import type { DataSource } from "typeorm";
import { z } from "zod";

import { createApplication } from "../../src/server/http/application.js";
import { createDataSource } from "../../src/server/persistence/data-source.js";
import { migrateAndSeed } from "../../src/server/persistence/migrate-and-seed.js";
import {
  FollowEntity,
  PostEntity,
  SessionEntity,
} from "../../src/server/persistence/model.js";

const actorId = "00000000-0000-4000-8000-000000000001";
const followedId = "00000000-0000-4000-8000-000000000002";
const databaseUrl = process.env.TEST_DATABASE_URL;
const integrationTest = databaseUrl === undefined ? test.skip : test;
const userSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  displayName: z.string(),
});
const feedSchema = z.object({
  items: z.array(z.object({ body: z.string() })),
  nextCursor: z.string().nullable(),
});
const profileSchema = z.object({
  user: userSchema,
  followerCount: z.number(),
  followingCount: z.number(),
  isFollowing: z.boolean(),
  posts: feedSchema,
});
const userPageSchema = z.object({
  items: z.array(userSchema.extend({ followedAt: z.string() })),
  nextCursor: z.string().nullable(),
});

interface HttpFixture {
  application: FastifyInstance;
  dataSource: DataSource;
  loginPassword: string;
}

async function createHttpFixture(databaseUrlValue: string): Promise<HttpFixture> {
  const dataSource = createDataSource(databaseUrlValue);
  const loginPassword = randomBytes(24).toString("base64url");
  await migrateAndSeed({
    dataSource,
    seedUsersInput: {
      loginUser: {
        id: actorId,
        username: "demo",
        displayName: "Demo User",
        password: loginPassword,
      },
      followableUser: {
        id: followedId,
        username: "friend",
        displayName: "Friend User",
      },
      createdAt: new Date("2026-08-18T12:00:00.000Z"),
    },
  });
  await dataSource.getRepository(SessionEntity).clear();
  await dataSource.getRepository(PostEntity).clear();
  await dataSource.getRepository(FollowEntity).clear();

  const application = await createApplication({
    dataSource,
    now: () => new Date("2026-08-18T12:00:00.000Z"),
    createToken: () => randomBytes(32).toString("base64url"),
    secureCookies: false,
  });
  return { application, dataSource, loginPassword };
}

function extractSessionCookie(setCookieHeader: string | string[] | undefined): string {
  const header = Array.isArray(setCookieHeader)
    ? setCookieHeader[0]
    : setCookieHeader;
  assert.ok(header);
  const cookie = header.split(";", 1)[0];
  assert.ok(cookie);
  return cookie;
}

integrationTest("supports the complete authenticated social loop", async () => {
  assert.ok(databaseUrl);
  const fixture = await createHttpFixture(databaseUrl);

  try {
    const loginResponse = await fixture.application.inject({
      method: "POST",
      url: "/api/session",
      payload: { username: "demo", password: fixture.loginPassword },
    });
    assert.equal(loginResponse.statusCode, 200);
    const cookieHeader = extractSessionCookie(loginResponse.headers["set-cookie"]);

    const sessionResponse = await fixture.application.inject({
      method: "GET",
      url: "/api/session",
      headers: { cookie: cookieHeader },
    });
    assert.equal(sessionResponse.statusCode, 200);

    const followResponse = await fixture.application.inject({
      method: "PUT",
      url: `/api/users/${followedId}/follow`,
      headers: { cookie: cookieHeader },
    });
    assert.equal(followResponse.statusCode, 201);

    const postResponse = await fixture.application.inject({
      method: "POST",
      url: "/api/posts",
      headers: { cookie: cookieHeader },
      payload: { body: "Demo post" },
    });
    assert.equal(postResponse.statusCode, 201);
    await fixture.dataSource.getRepository(PostEntity).insert({
      userId: followedId,
      body: "Friend post",
      createdAt: new Date("2026-08-18T12:01:00.000Z"),
    });

    const feedResponse = await fixture.application.inject({
      method: "GET",
      url: "/api/feed",
      headers: { cookie: cookieHeader },
    });
    assert.equal(feedResponse.statusCode, 200);
    const feed = feedSchema.parse(JSON.parse(feedResponse.body));
    assert.deepEqual(
      feed.items.map(({ body }) => body),
      ["Friend post", "Demo post"],
    );

    const profileResponse = await fixture.application.inject({
      method: "GET",
      url: "/api/users/friend",
      headers: { cookie: cookieHeader },
    });
    assert.equal(profileResponse.statusCode, 200);
    const friendProfile = profileSchema.parse(JSON.parse(profileResponse.body));
    assert.equal(friendProfile.isFollowing, true);
    assert.equal(friendProfile.followerCount, 1);

    const followingResponse = await fixture.application.inject({
      method: "GET",
      url: `/api/users/${actorId}/following`,
      headers: { cookie: cookieHeader },
    });
    assert.equal(followingResponse.statusCode, 200);
    const following = userPageSchema.parse(JSON.parse(followingResponse.body));
    assert.deepEqual(
      following.items.map(({ username }) => username),
      ["friend"],
    );

    const logoutResponse = await fixture.application.inject({
      method: "DELETE",
      url: "/api/session",
      headers: { cookie: cookieHeader },
    });
    assert.equal(logoutResponse.statusCode, 204);

    const expiredSessionResponse = await fixture.application.inject({
      method: "GET",
      url: "/api/session",
      headers: { cookie: cookieHeader },
    });
    assert.equal(expiredSessionResponse.statusCode, 401);
  } finally {
    await fixture.application.close();
    if (fixture.dataSource.isInitialized) {
      await fixture.dataSource.destroy();
    }
  }
});

integrationTest("rejects protected routes without a session", async () => {
  assert.ok(databaseUrl);
  const fixture = await createHttpFixture(databaseUrl);

  try {
    const response = await fixture.application.inject({
      method: "GET",
      url: "/api/feed",
    });
    assert.equal(response.statusCode, 401);
  } finally {
    await fixture.application.close();
    if (fixture.dataSource.isInitialized) {
      await fixture.dataSource.destroy();
    }
  }
});
