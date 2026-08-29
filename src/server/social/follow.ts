import type { FollowRecord } from "../persistence/model.js";

export interface FollowInput {
  actorId: string;
  targetId: string;
}

export interface FollowDependencies {
  userExists: (userId: string) => Promise<boolean>;
  saveFollow: (follow: FollowRecord) => Promise<void>;
  now: () => Date;
}

export interface UnfollowDependencies {
  removeFollow: (input: FollowInput) => Promise<void>;
}

export class FollowTargetNotFoundError extends Error {
  public constructor() {
    super("follow target not found");
    this.name = "FollowTargetNotFoundError";
  }
}

export class FollowConflictError extends Error {
  public constructor(message = "follow already exists") {
    super(message);
    this.name = "FollowConflictError";
  }
}

export async function follow(
  input: FollowInput,
  dependencies: FollowDependencies,
): Promise<FollowRecord> {
  return insertFollow(input, dependencies);
}

export async function insertFollow(
  input: FollowInput,
  dependencies: FollowDependencies,
): Promise<FollowRecord> {
  if (input.actorId === input.targetId) {
    throw new FollowConflictError("users cannot follow themselves");
  }

  if (!(await dependencies.userExists(input.targetId))) {
    throw new FollowTargetNotFoundError();
  }

  const followRecord: FollowRecord = {
    followerId: input.actorId,
    followeeId: input.targetId,
    createdAt: dependencies.now(),
  };
  await dependencies.saveFollow(followRecord);
  return followRecord;
}

export async function unfollow(
  input: FollowInput,
  dependencies: UnfollowDependencies,
): Promise<void> {
  await deleteFollow(input, dependencies);
}

export async function deleteFollow(
  input: FollowInput,
  dependencies: UnfollowDependencies,
): Promise<void> {
  await dependencies.removeFollow(input);
}
