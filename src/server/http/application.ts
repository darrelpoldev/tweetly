import { randomBytes } from "node:crypto";

import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import argon2 from "argon2";
import Fastify, {
  type FastifyInstance,
  type FastifyRequest,
} from "fastify";
import {
  MoreThan,
  QueryFailedError,
  type DataSource,
} from "typeorm";
import { z, ZodError } from "zod";

import {
  authenticate,
  hashSessionToken,
  InvalidCredentialsError,
} from "../auth/authenticate.js";
import { logout } from "../auth/logout.js";
import {
  homeFeed,
  InvalidFeedCursorError,
} from "../feed/home-feed.js";
import {
  FollowEntity,
  PostEntity,
  SessionEntity,
  UserEntity,
} from "../persistence/model.js";
import { InvalidPostBodyError, publish } from "../posts/publish.js";
import {
  profile,
  ProfileNotFoundError,
} from "../profile/profile.js";
import {
  follow,
  FollowConflictError,
  FollowTargetNotFoundError,
  unfollow,
} from "../social/follow.js";
import {
  InvalidSocialCursorError,
  socialLists,
} from "../social/social-lists.js";

const SESSION_COOKIE_NAME = "tweetly_session";

const loginSchema = z.object({
  username: z.string().min(1).max(30),
  password: z.string().min(1).max(1_024),
});
const postSchema = z.object({ body: z.string() });
const userIdParametersSchema = z.object({ userId: z.string().uuid() });
const usernameParametersSchema = z.object({ username: z.string().min(1).max(30) });
const cursorQuerySchema = z.object({ cursor: z.string().optional() });

export interface ApplicationDependencies {
  dataSource: DataSource;
  now: () => Date;
  createToken?: () => string;
  secureCookies: boolean;
  clientDirectory?: string;
}

export interface AuthenticatedActor {
  id: string;
  username: string;
  displayName: string;
}

export class UnauthorizedError extends Error {
  public constructor() {
    super("authentication required");
    this.name = "UnauthorizedError";
  }
}

export class InvalidRequestOriginError extends Error {
  public constructor() {
    super("invalid request origin");
    this.name = "InvalidRequestOriginError";
  }
}

export async function createApplication(
  dependencies: ApplicationDependencies,
): Promise<FastifyInstance> {
  const application = Fastify({ logger: false });
  await application.register(cookie);
  application.addHook("onRequest", async (request) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      verifyRequestOrigin(request.headers.origin, request.headers.host);
    }
  });

  registerSessionRoutes(application, dependencies);
  registerPostRoutes(application, dependencies);
  registerProfileRoutes(application, dependencies);
  registerSocialRoutes(application, dependencies);
  registerErrorHandler(application);

  if (dependencies.clientDirectory !== undefined) {
    await application.register(fastifyStatic, {
      root: dependencies.clientDirectory,
      wildcard: false,
    });
    application.get("/*", async (_request, reply) => reply.sendFile("index.html"));
  }

  return application;
}

export async function requireActor(
  rawSessionToken: string | undefined,
  dataSource: DataSource,
  now: Date,
): Promise<AuthenticatedActor> {
  if (rawSessionToken === undefined) {
    throw new UnauthorizedError();
  }

  const session = await dataSource.getRepository(SessionEntity).findOneBy({
    tokenHash: hashSessionToken(rawSessionToken),
    expiresAt: MoreThan(now),
  });

  if (session === null) {
    throw new UnauthorizedError();
  }

  const user = await dataSource.getRepository(UserEntity).findOneBy({
    id: session.userId,
  });

  if (user === null) {
    throw new UnauthorizedError();
  }

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
  };
}

export function verifyRequestOrigin(
  origin: string | undefined,
  host: string | undefined,
): void {
  if (origin === undefined) {
    return;
  }

  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    throw new InvalidRequestOriginError();
  }
  if (host === undefined || originUrl.host !== host) {
    throw new InvalidRequestOriginError();
  }
}

export function hasPostgresCode(error: unknown, code: string): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }

  const driverError: unknown = error.driverError;
  return (
    typeof driverError === "object" &&
    driverError !== null &&
    "code" in driverError &&
    driverError.code === code
  );
}

function registerSessionRoutes(
  application: FastifyInstance,
  dependencies: ApplicationDependencies,
): void {
  application.post("/api/session", async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const session = await authenticate(input, {
      findUserByUsername: (username) =>
        dependencies.dataSource.getRepository(UserEntity).findOneBy({ username }),
      verifyPassword: argon2.verify,
      createToken:
        dependencies.createToken ??
        (() => randomBytes(32).toString("base64url")),
      createSession: async (sessionRecord) => {
        await dependencies.dataSource
          .getRepository(SessionEntity)
          .insert(sessionRecord);
      },
      now: dependencies.now,
    });
    reply.setCookie(SESSION_COOKIE_NAME, session.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: dependencies.secureCookies,
      path: "/",
      expires: session.expiresAt,
    });
    return { user: session.user, expiresAt: session.expiresAt };
  });

  application.get("/api/session", async (request) => ({
    user: await requireActor(
      request.cookies[SESSION_COOKIE_NAME],
      dependencies.dataSource,
      dependencies.now(),
    ),
  }));

  application.delete("/api/session", async (request, reply) => {
    const rawSessionToken = request.cookies[SESSION_COOKIE_NAME];
    if (rawSessionToken !== undefined) {
      await logout(rawSessionToken, {
        deleteSession: async (tokenHash) => {
          await dependencies.dataSource
            .getRepository(SessionEntity)
            .delete({ tokenHash });
        },
      });
    }
    reply.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    return reply.status(204).send();
  });
}

function registerPostRoutes(
  application: FastifyInstance,
  dependencies: ApplicationDependencies,
): void {
  application.post("/api/posts", async (request, reply) => {
    const actor = await requireActor(
      request.cookies[SESSION_COOKIE_NAME],
      dependencies.dataSource,
      dependencies.now(),
    );
    const input = postSchema.parse(request.body);
    const post = await publish(
      { actorId: actor.id, body: input.body },
      {
        insertPost: (draft) =>
          dependencies.dataSource.getRepository(PostEntity).save(draft),
        now: dependencies.now,
      },
    );
    return reply.status(201).send(post);
  });

  application.get("/api/feed", async (request) => {
    const actor = await requireActor(
      request.cookies[SESSION_COOKIE_NAME],
      dependencies.dataSource,
      dependencies.now(),
    );
    const query = cursorQuerySchema.parse(request.query);
    return homeFeed(
      query.cursor === undefined
        ? { actorId: actor.id }
        : { actorId: actor.id, cursor: query.cursor },
      dependencies.dataSource,
    );
  });
}

function registerProfileRoutes(
  application: FastifyInstance,
  dependencies: ApplicationDependencies,
): void {
  application.get("/api/users/:username", async (request) => {
    const actor = await requireActor(
      request.cookies[SESSION_COOKIE_NAME],
      dependencies.dataSource,
      dependencies.now(),
    );
    const parameters = usernameParametersSchema.parse(request.params);
    const query = cursorQuerySchema.parse(request.query);
    return profile(
      query.cursor === undefined
        ? { viewerId: actor.id, username: parameters.username }
        : {
            viewerId: actor.id,
            username: parameters.username,
            cursor: query.cursor,
          },
      dependencies.dataSource,
    );
  });
}

function registerSocialRoutes(
  application: FastifyInstance,
  dependencies: ApplicationDependencies,
): void {
  application.put("/api/users/:userId/follow", async (request, reply) => {
    const actor = await requireActor(
      request.cookies[SESSION_COOKIE_NAME],
      dependencies.dataSource,
      dependencies.now(),
    );
    const parameters = userIdParametersSchema.parse(request.params);
    try {
      const followRecord = await follow(
        { actorId: actor.id, targetId: parameters.userId },
        {
          userExists: (userId) =>
            dependencies.dataSource.getRepository(UserEntity).existsBy({
              id: userId,
            }),
          saveFollow: async (record) => {
            await dependencies.dataSource
              .getRepository(FollowEntity)
              .insert(record);
          },
          now: dependencies.now,
        },
      );
      return reply.status(201).send(followRecord);
    } catch (error: unknown) {
      if (hasPostgresCode(error, "23505")) {
        throw new FollowConflictError();
      }
      throw error;
    }
  });

  application.delete("/api/users/:userId/follow", async (request, reply) => {
    const actor = await requireActor(
      request.cookies[SESSION_COOKIE_NAME],
      dependencies.dataSource,
      dependencies.now(),
    );
    const parameters = userIdParametersSchema.parse(request.params);
    await unfollow(
      { actorId: actor.id, targetId: parameters.userId },
      {
        removeFollow: async ({ actorId, targetId }) => {
          await dependencies.dataSource.getRepository(FollowEntity).delete({
            followerId: actorId,
            followeeId: targetId,
          });
        },
      },
    );
    return reply.status(204).send();
  });

  for (const kind of ["followers", "following"] as const) {
    application.get(`/api/users/:userId/${kind}`, async (request) => {
      await requireActor(
        request.cookies[SESSION_COOKIE_NAME],
        dependencies.dataSource,
        dependencies.now(),
      );
      const parameters = userIdParametersSchema.parse(request.params);
      const query = cursorQuerySchema.parse(request.query);
      return socialLists(
        query.cursor === undefined
          ? { userId: parameters.userId, kind }
          : { userId: parameters.userId, kind, cursor: query.cursor },
        dependencies.dataSource,
      );
    });
  }
}

function registerErrorHandler(application: FastifyInstance): void {
  application.setErrorHandler((error, _request, reply) => {
    if (
      error instanceof ZodError ||
      error instanceof InvalidPostBodyError ||
      error instanceof InvalidFeedCursorError ||
      error instanceof InvalidSocialCursorError ||
      error instanceof InvalidRequestOriginError
    ) {
      return reply.status(400).send({ error: error.message });
    }
    if (
      error instanceof InvalidCredentialsError ||
      error instanceof UnauthorizedError
    ) {
      return reply.status(401).send({ error: error.message });
    }
    if (
      error instanceof ProfileNotFoundError ||
      error instanceof FollowTargetNotFoundError
    ) {
      return reply.status(404).send({ error: error.message });
    }
    if (error instanceof FollowConflictError) {
      return reply.status(409).send({ error: error.message });
    }
    return reply.status(500).send({ error: "internal server error" });
  });
}

export async function startServer(
  application: FastifyInstance,
  port: number,
): Promise<void> {
  await application.listen({ host: "127.0.0.1", port });
}
