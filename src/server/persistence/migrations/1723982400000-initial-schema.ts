import type { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1723982400000 implements MigrationInterface {
  public readonly name = "InitialSchema1723982400000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE users (
        id uuid PRIMARY KEY,
        username varchar(30) NOT NULL UNIQUE,
        display_name varchar(80) NOT NULL,
        password_hash text,
        created_at timestamptz NOT NULL
      )
    `);
    await queryRunner.query(`
      CREATE TABLE follows (
        follower_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        followee_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL,
        PRIMARY KEY (follower_id, followee_id),
        CONSTRAINT follows_no_self CHECK (follower_id <> followee_id)
      )
    `);
    await queryRunner.query(
      "CREATE INDEX follows_followee_follower_idx ON follows (followee_id, follower_id)",
    );
    await queryRunner.query(`
      CREATE TABLE posts (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        body varchar(300) NOT NULL,
        created_at timestamptz NOT NULL,
        CONSTRAINT posts_body_not_blank CHECK (length(trim(body)) > 0)
      )
    `);
    await queryRunner.query(
      "CREATE INDEX posts_user_created_id_idx ON posts (user_id, created_at DESC, id DESC)",
    );
    await queryRunner.query(`
      CREATE TABLE sessions (
        token_hash char(64) PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL
      )
    `);
    await queryRunner.query(
      "CREATE INDEX sessions_expires_at_idx ON sessions (expires_at)",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE sessions");
    await queryRunner.query("DROP TABLE posts");
    await queryRunner.query("DROP TABLE follows");
    await queryRunner.query("DROP TABLE users");
  }
}
