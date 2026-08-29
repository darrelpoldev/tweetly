import { z } from "zod";

export const userSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  displayName: z.string(),
});

export const feedItemSchema = z.object({
  id: z.string(),
  userId: z.string().uuid(),
  username: z.string(),
  displayName: z.string(),
  body: z.string(),
  createdAt: z.coerce.date(),
});

export const feedPageSchema = z.object({
  items: z.array(feedItemSchema),
  nextCursor: z.string().nullable(),
});

export const profilePageSchema = z.object({
  user: userSchema,
  followerCount: z.number().int().nonnegative(),
  followingCount: z.number().int().nonnegative(),
  isFollowing: z.boolean(),
  posts: feedPageSchema,
});

export const socialUserSchema = userSchema.extend({
  followedAt: z.coerce.date(),
});

export const userPageSchema = z.object({
  items: z.array(socialUserSchema),
  nextCursor: z.string().nullable(),
});

export const sessionResponseSchema = z.object({ user: userSchema });
export const postResponseSchema = z.object({
  id: z.string(),
  userId: z.string().uuid(),
  body: z.string(),
  createdAt: z.coerce.date(),
});

export type User = z.infer<typeof userSchema>;
export type FeedItem = z.infer<typeof feedItemSchema>;
export type FeedPage = z.infer<typeof feedPageSchema>;
export type ProfilePage = z.infer<typeof profilePageSchema>;
export type SocialUser = z.infer<typeof socialUserSchema>;

export class ApiError extends Error {
  public constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function requestJson<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new ApiError(await readErrorMessage(response), response.status);
  }

  return schema.parse(await response.json());
}

export async function requestVoid(
  path: string,
  init?: RequestInit,
): Promise<void> {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
  });

  if (!response.ok) {
    throw new ApiError(await readErrorMessage(response), response.status);
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  const payload: unknown = await response.json().catch(() => null);
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }
  return `request failed with status ${response.status}`;
}
