import { z } from "zod";

const runtimeConfigSchema = z.object({
  DATABASE_URL: z.string().url(),
  SEED_USER_PASSWORD: z.string().min(1).default("admin"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3_000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export interface RuntimeConfig {
  databaseUrl: string;
  seedUserPassword: string;
  port: number;
  production: boolean;
}

export function readRuntimeConfig(environment: NodeJS.ProcessEnv): RuntimeConfig {
  const parsed = runtimeConfigSchema.parse(environment);
  return {
    databaseUrl: parsed.DATABASE_URL,
    seedUserPassword: parsed.SEED_USER_PASSWORD,
    port: parsed.PORT,
    production: parsed.NODE_ENV === "production",
  };
}
