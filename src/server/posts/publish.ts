import type { PostRecord } from "../persistence/model.js";

const MAXIMUM_POST_LENGTH = 300;

export interface PublishInput {
  actorId: string;
  body: string;
}

export interface PostDraft {
  userId: string;
  body: string;
  createdAt: Date;
}

export interface PublishDependencies {
  insertPost: (post: PostDraft) => Promise<PostRecord>;
  now: () => Date;
}

export class InvalidPostBodyError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "InvalidPostBodyError";
  }
}

export async function publish(
  input: PublishInput,
  dependencies: PublishDependencies,
): Promise<PostRecord> {
  return validateAndInsertPost(input, dependencies);
}

export async function validateAndInsertPost(
  input: PublishInput,
  dependencies: PublishDependencies,
): Promise<PostRecord> {
  const body = validatePostBody(input.body);
  return dependencies.insertPost({
    userId: input.actorId,
    body,
    createdAt: dependencies.now(),
  });
}

export function validatePostBody(body: string): string {
  const normalizedBody = body.trim();

  if (normalizedBody.length === 0) {
    throw new InvalidPostBodyError("post body cannot be empty");
  }

  if ([...normalizedBody].length > MAXIMUM_POST_LENGTH) {
    throw new InvalidPostBodyError("post body cannot exceed 300 characters");
  }

  return normalizedBody;
}
