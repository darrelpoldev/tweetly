import type { DataSource } from "typeorm";

import {
  buildPostPage,
  decodeFeedCursor,
  type PostPage,
} from "../feed/home-feed.js";
import {
  FollowEntity,
  PostEntity,
  UserEntity,
  type UserRecord,
} from "../persistence/model.js";

const PROFILE_POST_PAGE_SIZE = 20;

export interface ProfileInput {
  viewerId: string;
  username: string;
  cursor?: string;
}

export interface ProfilePage {
  user: Pick<UserRecord, "id" | "username" | "displayName">;
  followerCount: number;
  followingCount: number;
  isFollowing: boolean;
  posts: PostPage;
}

export class ProfileNotFoundError extends Error {
  public constructor() {
    super("profile not found");
    this.name = "ProfileNotFoundError";
  }
}

export async function profile(
  input: ProfileInput,
  dataSource: DataSource,
): Promise<ProfilePage> {
  return queryProfileAndPosts(
    { ...input, username: input.username.trim().toLowerCase() },
    dataSource,
  );
}

export async function queryProfileAndPosts(
  input: ProfileInput,
  dataSource: DataSource,
): Promise<ProfilePage> {
  const user = await dataSource
    .getRepository(UserEntity)
    .findOneBy({ username: input.username });

  if (user === null) {
    throw new ProfileNotFoundError();
  }

  const followRepository = dataSource.getRepository(FollowEntity);
  const [followerCount, followingCount, isFollowing, posts] = await Promise.all([
    followRepository.countBy({ followeeId: user.id }),
    followRepository.countBy({ followerId: user.id }),
    followRepository.existsBy({
      followerId: input.viewerId,
      followeeId: user.id,
    }),
    queryProfilePosts(user, input.cursor, dataSource),
  ]);

  return {
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
    },
    followerCount,
    followingCount,
    isFollowing,
    posts,
  };
}

export async function queryProfilePosts(
  user: UserRecord,
  encodedCursor: string | undefined,
  dataSource: DataSource,
): Promise<PostPage> {
  const cursor = decodeFeedCursor(encodedCursor);
  const query = dataSource
    .getRepository(PostEntity)
    .createQueryBuilder("post")
    .where("post.userId = :userId", { userId: user.id })
    .orderBy("post.createdAt", "DESC")
    .addOrderBy("post.id", "DESC")
    .take(PROFILE_POST_PAGE_SIZE + 1);

  if (cursor !== null) {
    query.andWhere("(post.createdAt, post.id) < (:createdAt, :id)", {
      createdAt: cursor.createdAt,
      id: cursor.id,
    });
  }

  const posts = await query.getMany();
  return buildPostPage(
    posts.map((post) => ({
      id: post.id,
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      body: post.body,
      createdAt: post.createdAt,
    })),
  );
}
