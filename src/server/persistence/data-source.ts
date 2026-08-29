import { DataSource } from "typeorm";

import { InitialSchema1723982400000 } from "./migrations/1723982400000-initial-schema.js";
import {
  FollowEntity,
  PostEntity,
  SessionEntity,
  UserEntity,
} from "./model.js";

export function createDataSource(databaseUrl: string): DataSource {
  return new DataSource({
    type: "postgres",
    url: databaseUrl,
    entities: [UserEntity, FollowEntity, PostEntity, SessionEntity],
    migrations: [InitialSchema1723982400000],
    migrationsRun: false,
    synchronize: false,
  });
}
