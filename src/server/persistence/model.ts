import { EntitySchema } from "typeorm";

export interface UserRecord {
  id: string;
  username: string;
  displayName: string;
  passwordHash: string | null;
  createdAt: Date;
}

export interface FollowRecord {
  followerId: string;
  followeeId: string;
  createdAt: Date;
}

export interface PostRecord {
  id: string;
  userId: string;
  body: string;
  createdAt: Date;
}

export interface SessionRecord {
  tokenHash: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
}

export const UserEntity = new EntitySchema<UserRecord>({
  name: "User",
  tableName: "users",
  columns: {
    id: { type: "uuid", primary: true },
    username: { type: "varchar", length: 30, unique: true },
    displayName: { name: "display_name", type: "varchar", length: 80 },
    passwordHash: { name: "password_hash", type: "text", nullable: true },
    createdAt: { name: "created_at", type: "timestamptz" },
  },
});

export const FollowEntity = new EntitySchema<FollowRecord>({
  name: "Follow",
  tableName: "follows",
  columns: {
    followerId: { name: "follower_id", type: "uuid", primary: true },
    followeeId: { name: "followee_id", type: "uuid", primary: true },
    createdAt: { name: "created_at", type: "timestamptz" },
  },
});

export const PostEntity = new EntitySchema<PostRecord>({
  name: "Post",
  tableName: "posts",
  columns: {
    id: { type: "bigint", primary: true, generated: "increment" },
    userId: { name: "user_id", type: "uuid" },
    body: { type: "varchar", length: 300 },
    createdAt: { name: "created_at", type: "timestamptz" },
  },
});

export const SessionEntity = new EntitySchema<SessionRecord>({
  name: "Session",
  tableName: "sessions",
  columns: {
    tokenHash: { name: "token_hash", type: "char", length: 64, primary: true },
    userId: { name: "user_id", type: "uuid" },
    expiresAt: { name: "expires_at", type: "timestamptz" },
    createdAt: { name: "created_at", type: "timestamptz" },
  },
});
