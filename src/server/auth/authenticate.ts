import { createHash } from "node:crypto";

import type { SessionRecord, UserRecord } from "../persistence/model.js";

const SESSION_DURATION_MILLISECONDS = 30 * 24 * 60 * 60 * 1_000;

export interface AuthenticateInput {
  username: string;
  password: string;
}

export interface AuthenticatedSession {
  token: string;
  expiresAt: Date;
  user: Pick<UserRecord, "id" | "username" | "displayName">;
}

export interface AuthenticationDependencies {
  findUserByUsername: (username: string) => Promise<UserRecord | null>;
  verifyPassword: (passwordHash: string, password: string) => Promise<boolean>;
  createToken: () => string;
  createSession: (session: SessionRecord) => Promise<void>;
  now: () => Date;
}

export class InvalidCredentialsError extends Error {
  public constructor() {
    super("invalid username or password");
    this.name = "InvalidCredentialsError";
  }
}

export async function authenticate(
  input: AuthenticateInput,
  dependencies: AuthenticationDependencies,
): Promise<AuthenticatedSession> {
  return verifyPasswordAndCreateSession(
    { username: input.username.trim().toLowerCase(), password: input.password },
    dependencies,
  );
}

export async function verifyPasswordAndCreateSession(
  input: AuthenticateInput,
  dependencies: AuthenticationDependencies,
): Promise<AuthenticatedSession> {
  const user = await dependencies.findUserByUsername(input.username);

  if (user?.passwordHash === null || user === null) {
    throw new InvalidCredentialsError();
  }

  const passwordIsValid = await dependencies.verifyPassword(
    user.passwordHash,
    input.password,
  );

  if (!passwordIsValid) {
    throw new InvalidCredentialsError();
  }

  const createdAt = dependencies.now();
  const expiresAt = new Date(
    createdAt.getTime() + SESSION_DURATION_MILLISECONDS,
  );
  const token = dependencies.createToken();

  await dependencies.createSession({
    tokenHash: hashSessionToken(token),
    userId: user.id,
    expiresAt,
    createdAt,
  });

  return {
    token,
    expiresAt,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
    },
  };
}

export function hashSessionToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}
