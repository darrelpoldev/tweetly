import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import argon2 from "argon2";
import { In } from "typeorm";

import { createDataSource } from "../../src/server/persistence/data-source.js";
import { migrateAndSeed } from "../../src/server/persistence/migrate-and-seed.js";
import { UserEntity } from "../../src/server/persistence/model.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const integrationTest = databaseUrl === undefined ? test.skip : test;

integrationTest("migrates and seeds both users idempotently", async () => {
  assert.ok(databaseUrl);
  const dataSource = createDataSource(databaseUrl);
  const loginPassword = randomBytes(24).toString("base64url");
  const seedUsersInput = {
    loginUser: {
      id: "00000000-0000-4000-8000-000000000001",
      username: "admin",
      displayName: "Admin User",
      password: loginPassword,
    },
    followableUser: {
      id: "00000000-0000-4000-8000-000000000002",
      username: "friend",
      displayName: "Friend User",
    },
    createdAt: new Date("2026-08-18T12:00:00.000Z"),
  };

  try {
    await migrateAndSeed({ dataSource, seedUsersInput });
    await migrateAndSeed({ dataSource, seedUsersInput });

    const users = await dataSource.getRepository(UserEntity).find({
      where: { username: In(["admin", "friend"]) },
      order: { username: "ASC" },
    });

    assert.equal(users.length, 2);
    assert.deepEqual(
      users.map(({ username }) => username),
      ["admin", "friend"],
    );
    assert.ok(users[0]?.passwordHash);
    assert.equal(
      await argon2.verify(
        users[0]?.passwordHash ?? "",
        seedUsersInput.loginUser.password,
      ),
      true,
    );
    assert.equal(users[1]?.passwordHash, null);
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
});
