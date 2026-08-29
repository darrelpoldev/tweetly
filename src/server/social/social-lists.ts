import type { DataSource } from "typeorm";

import { FollowEntity } from "../persistence/model.js";

const SOCIAL_PAGE_SIZE = 20;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface SocialListInput {
  userId: string;
  kind: "followers" | "following";
  cursor?: string;
}

export interface SocialCursor {
  createdAt: Date;
  userId: string;
}

export interface SocialUser {
  id: string;
  username: string;
  displayName: string;
  followedAt: Date;
}

export interface UserPage {
  items: SocialUser[];
  nextCursor: string | null;
}

interface RawSocialUser {
  id: string;
  username: string;
  displayName: string;
  followedAt: Date;
}

export class InvalidSocialCursorError extends Error {
  public constructor() {
    super("invalid social-list cursor");
    this.name = "InvalidSocialCursorError";
  }
}

export async function socialLists(
  input: SocialListInput,
  dataSource: DataSource,
): Promise<UserPage> {
  return queryFollowEdges(input, dataSource);
}

export async function queryFollowEdges(
  input: SocialListInput,
  dataSource: DataSource,
): Promise<UserPage> {
  const cursor = decodeSocialCursor(input.cursor);
  const query = dataSource
    .getRepository(FollowEntity)
    .createQueryBuilder("followEdge");
  const direction = getSocialDirection(input.kind);

  query
    .innerJoin("users", "socialUser", direction.joinCondition)
    .where(direction.whereCondition, { userId: input.userId })
    .select("socialUser.id", "id")
    .addSelect("socialUser.username", "username")
    .addSelect("socialUser.displayName", "displayName")
    .addSelect("followEdge.createdAt", "followedAt")
    .orderBy("followEdge.createdAt", "DESC")
    .addOrderBy("socialUser.id", "DESC")
    .take(SOCIAL_PAGE_SIZE + 1);

  if (cursor !== null) {
    query.andWhere(
      "(followEdge.createdAt, socialUser.id) < (:createdAt, :userId)",
      { createdAt: cursor.createdAt, userId: cursor.userId },
    );
  }

  const rawUsers = await query.getRawMany<RawSocialUser>();
  return buildUserPage(
    rawUsers.map((user) => ({
      ...user,
      followedAt: new Date(user.followedAt),
    })),
  );
}

export function getSocialDirection(
  kind: SocialListInput["kind"],
): { joinCondition: string; whereCondition: string } {
  if (kind === "followers") {
    return {
      joinCondition: "socialUser.id = followEdge.followerId",
      whereCondition: "followEdge.followeeId = :userId",
    };
  }

  return {
    joinCondition: "socialUser.id = followEdge.followeeId",
    whereCondition: "followEdge.followerId = :userId",
  };
}

export function encodeSocialCursor(cursor: SocialCursor): string {
  return Buffer.from(
    `${cursor.createdAt.toISOString()}|${cursor.userId}`,
    "utf8",
  ).toString("base64url");
}

export function decodeSocialCursor(
  encodedCursor: string | undefined,
): SocialCursor | null {
  if (encodedCursor === undefined) {
    return null;
  }

  try {
    const decodedCursor = Buffer.from(encodedCursor, "base64url").toString(
      "utf8",
    );
    const separatorIndex = decodedCursor.lastIndexOf("|");
    const createdAt = new Date(decodedCursor.slice(0, separatorIndex));
    const userId = decodedCursor.slice(separatorIndex + 1);

    if (
      separatorIndex < 1 ||
      Number.isNaN(createdAt.getTime()) ||
      !UUID_PATTERN.test(userId)
    ) {
      throw new InvalidSocialCursorError();
    }

    return { createdAt, userId };
  } catch (error: unknown) {
    if (error instanceof InvalidSocialCursorError) {
      throw error;
    }
    throw new InvalidSocialCursorError();
  }
}

export function buildUserPage(users: SocialUser[]): UserPage {
  const pageUsers = users.slice(0, SOCIAL_PAGE_SIZE);
  const lastUser = pageUsers.at(-1);
  const nextCursor =
    users.length > SOCIAL_PAGE_SIZE && lastUser !== undefined
      ? encodeSocialCursor({
          createdAt: lastUser.followedAt,
          userId: lastUser.id,
        })
      : null;

  return { items: pageUsers, nextCursor };
}
