import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

import { bootstrap } from "./bootstrap.js";
import { createApplication, startServer } from "./http/application.js";
import { createDataSource } from "./persistence/data-source.js";
import { migrateAndSeed } from "./persistence/migrate-and-seed.js";
import { readRuntimeConfig } from "./runtime-config.js";

const config = readRuntimeConfig(process.env);
const dataSource = createDataSource(config.databaseUrl);

await bootstrap({
  migrateAndSeed: () =>
    migrateAndSeed({
      dataSource,
      seedUsersInput: {
        loginUser: {
          id: "00000000-0000-4000-8000-000000000001",
          username: "admin",
          displayName: "Admin User",
          password: config.seedUserPassword,
        },
        followableUser: {
          id: "00000000-0000-4000-8000-000000000002",
          username: "friend",
          displayName: "Friend User",
        },
        createdAt: new Date(),
      },
    }),
  startServer: async () => {
    const application = await createApplication({
      dataSource,
      now: () => new Date(),
      createToken: () => randomBytes(32).toString("base64url"),
      secureCookies: config.production,
      clientDirectory: resolve(process.cwd(), "dist/client"),
    });
    await startServer(application, config.port);
  },
});
