import { hashSessionToken } from "./authenticate.js";

export interface LogoutDependencies {
  deleteSession: (tokenHash: string) => Promise<void>;
}

export async function logout(
  rawSessionToken: string,
  dependencies: LogoutDependencies,
): Promise<void> {
  await revokeSession(rawSessionToken, dependencies);
}

export async function revokeSession(
  rawSessionToken: string,
  dependencies: LogoutDependencies,
): Promise<void> {
  await dependencies.deleteSession(hashSessionToken(rawSessionToken));
}
