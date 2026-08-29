import argon2 from "argon2";
import type { DataSource, EntityManager } from "typeorm";

import { UserEntity, type UserRecord } from "./model.js";

export interface SeedUserInput {
  id: string;
  username: string;
  displayName: string;
}

export interface SeedUsersInput {
  loginUser: SeedUserInput & { password: string };
  followableUser: SeedUserInput;
  createdAt: Date;
}

export interface MigrateAndSeedInput {
  dataSource: DataSource;
  seedUsersInput: SeedUsersInput;
}

export async function migrateAndSeed(
  input: MigrateAndSeedInput,
): Promise<void> {
  if (!input.dataSource.isInitialized) {
    await input.dataSource.initialize();
  }

  await input.dataSource.runMigrations({ transaction: "all" });
  await seedUsers(input.dataSource.manager, input.seedUsersInput);
}

export async function seedUsers(
  entityManager: EntityManager,
  input: SeedUsersInput,
): Promise<void> {
  const passwordHash = await argon2.hash(input.loginUser.password, {
    type: argon2.argon2id,
  });
  const users: UserRecord[] = [
    {
      id: input.loginUser.id,
      username: input.loginUser.username,
      displayName: input.loginUser.displayName,
      passwordHash,
      createdAt: input.createdAt,
    },
    {
      id: input.followableUser.id,
      username: input.followableUser.username,
      displayName: input.followableUser.displayName,
      passwordHash: null,
      createdAt: input.createdAt,
    },
  ];

  await entityManager.getRepository(UserEntity).upsert(users, ["id"]);
}
