import type { DataSource } from "typeorm";

import { PostEntity } from "../persistence/model.js";

const FEED_PAGE_SIZE = 20;

export interface HomeFeedInput {
  actorId: string;
  cursor?: string;
}

export interface FeedCursor {
  createdAt: Date;
  id: string;
}

export interface FeedItem {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  body: string;
  createdAt: Date;
}

export interface PostPage {
  items: FeedItem[];
  nextCursor: string | null;
}

interface RawFeedItem {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  body: string;
  createdAt: Date;
}

export class InvalidFeedCursorError extends Error {
  public constructor() {
    super("invalid feed cursor");
    this.name = "InvalidFeedCursorError";
  }
}

export async function homeFeed(
  input: HomeFeedInput,
  dataSource: DataSource,
): Promise<PostPage> {
  return queryChronologicalPosts(input, dataSource);
}

export async function queryChronologicalPosts(
  input: HomeFeedInput,
  dataSource: DataSource,
): Promise<PostPage> {
  const cursor = decodeFeedCursor(input.cursor);
  const query = dataSource
    .getRepository(PostEntity)
    .createQueryBuilder("post")
    .innerJoin("users", "author", "author.id = post.userId")
    .select("post.id", "id")
    .addSelect("post.userId", "userId")
    .addSelect("author.username", "username")
    .addSelect("author.displayName", "displayName")
    .addSelect("post.body", "body")
    .addSelect("post.createdAt", "createdAt")
    .where(
      `(post.userId = :actorId OR EXISTS (
        SELECT 1 FROM follows follow_edge
        WHERE follow_edge.follower_id = :actorId
          AND follow_edge.followee_id = post.user_id
      ))`,
      { actorId: input.actorId },
    )
    .orderBy("post.createdAt", "DESC")
    .addOrderBy("post.id", "DESC")
    .take(FEED_PAGE_SIZE + 1);

  if (cursor !== null) {
    query.andWhere("(post.createdAt, post.id) < (:createdAt, :id)", {
      createdAt: cursor.createdAt,
      id: cursor.id,
    });
  }

  const rawItems = await query.getRawMany<RawFeedItem>();
  const items = rawItems.map((item) => ({
    ...item,
    createdAt: new Date(item.createdAt),
  }));
  return buildPostPage(items);
}

export function encodeFeedCursor(cursor: FeedCursor): string {
  return Buffer.from(
    `${cursor.createdAt.toISOString()}|${cursor.id}`,
    "utf8",
  ).toString("base64url");
}

export function decodeFeedCursor(cursor: string | undefined): FeedCursor | null {
  if (cursor === undefined) {
    return null;
  }

  try {
    const decodedCursor = Buffer.from(cursor, "base64url").toString("utf8");
    const separatorIndex = decodedCursor.lastIndexOf("|");
    const createdAt = new Date(decodedCursor.slice(0, separatorIndex));
    const id = decodedCursor.slice(separatorIndex + 1);

    if (
      separatorIndex < 1 ||
      Number.isNaN(createdAt.getTime()) ||
      !/^[1-9]\d*$/.test(id)
    ) {
      throw new InvalidFeedCursorError();
    }

    return { createdAt, id };
  } catch (error: unknown) {
    if (error instanceof InvalidFeedCursorError) {
      throw error;
    }
    throw new InvalidFeedCursorError();
  }
}

export function buildPostPage(items: FeedItem[]): PostPage {
  const pageItems = items.slice(0, FEED_PAGE_SIZE);
  const lastItem = pageItems.at(-1);
  const nextCursor =
    items.length > FEED_PAGE_SIZE && lastItem !== undefined
      ? encodeFeedCursor({ createdAt: lastItem.createdAt, id: lastItem.id })
      : null;

  return { items: pageItems, nextCursor };
}
