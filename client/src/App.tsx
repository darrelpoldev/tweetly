import { useEffect, useState, type FormEvent, type ReactElement } from "react";
import { z } from "zod";

import {
  feedPageSchema,
  postResponseSchema,
  profilePageSchema,
  requestJson,
  requestVoid,
  sessionResponseSchema,
  userPageSchema,
  type FeedItem,
  type ProfilePage,
  type SocialUser,
  type User,
} from "./api.js";

type View =
  | { name: "feed" }
  | { name: "profile"; username: string }
  | { name: "social"; userId: string; kind: "followers" | "following" };

export function App(): ReactElement {
  const [sessionUser, setSessionUser] = useState<User | null | undefined>();
  const [view, setView] = useState<View>({ name: "feed" });

  useEffect(() => {
    requestJson("/api/session", sessionResponseSchema)
      .then(({ user }) => setSessionUser(user))
      .catch(() => setSessionUser(null));
  }, []);

  if (sessionUser === undefined) {
    return <main className="centered-state">Loading…</main>;
  }

  if (sessionUser === null) {
    return <LoginView onAuthenticated={setSessionUser} />;
  }

  const navigateToProfile = (username: string): void => {
    setView({ name: "profile", username });
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setView({ name: "feed" })}>
          T
        </button>
        <button className="nav-button" onClick={() => setView({ name: "feed" })}>
          Home
        </button>
        <button
          className="nav-button"
          onClick={() => navigateToProfile(sessionUser.username)}
        >
          Profile
        </button>
        <button
          className="nav-button secondary"
          onClick={() => {
            requestVoid("/api/session", { method: "DELETE" })
              .then(() => setSessionUser(null))
              .catch(() => setSessionUser(null));
          }}
        >
          Log out
        </button>
      </aside>
      <main className="timeline">
        {view.name === "feed" ? (
          <FeedView user={sessionUser} onNavigateProfile={navigateToProfile} />
        ) : null}
        {view.name === "profile" ? (
          <ProfileView
            username={view.username}
            currentUser={sessionUser}
            onBack={() => setView({ name: "feed" })}
            onNavigateProfile={navigateToProfile}
            onShowSocial={(userId, kind) =>
              setView({ name: "social", userId, kind })
            }
          />
        ) : null}
        {view.name === "social" ? (
          <SocialListView
            userId={view.userId}
            kind={view.kind}
            onBack={() => setView({ name: "feed" })}
            onNavigateProfile={navigateToProfile}
          />
        ) : null}
      </main>
      <aside className="context-panel">
        <h2>Small, social, focused.</h2>
        <p>Text posts, real follows, and a chronological feed.</p>
      </aside>
    </div>
  );
}

interface LoginViewProps {
  onAuthenticated: (user: User) => void;
}

function LoginView({ onAuthenticated }: LoginViewProps): ReactElement {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { user } = await requestJson("/api/session", sessionResponseSchema, {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      onAuthenticated(user);
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-mark">T</div>
        <p className="eyebrow">TWEETLY</p>
        <h1>See what’s happening.</h1>
        <p className="muted">Sign in with admin / admin.</p>
        <form onSubmit={submit}>
          <label>
            Username
            <input
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error === null ? null : <p className="error">{error}</p>}
          <button className="primary-button" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}

interface FeedViewProps {
  user: User;
  onNavigateProfile: (username: string) => void;
}

function FeedView({ user, onNavigateProfile }: FeedViewProps): ReactElement {
  const [posts, setPosts] = useState<FeedItem[]>([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadFeed = (): void => {
    requestJson("/api/feed", feedPageSchema)
      .then(({ items }) => setPosts(items))
      .catch((requestError: unknown) =>
        setError(requestError instanceof Error ? requestError.message : "Feed failed"),
      );
  };

  useEffect(loadFeed, []);

  const submitPost = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    try {
      await requestJson(
        "/api/posts",
        postResponseSchema,
        { method: "POST", body: JSON.stringify({ body }) },
      );
      setBody("");
      loadFeed();
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Post failed");
    }
  };

  return (
    <section>
      <header className="sticky-header">
        <h1>Home</h1>
        <span>Latest posts</span>
      </header>
      <form className="composer" onSubmit={submitPost}>
        <Avatar name={user.displayName} />
        <div className="composer-body">
          <textarea
            aria-label="Post text"
            maxLength={300}
            placeholder="What is happening?!"
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
          <div className="composer-actions">
            <span>{[...body].length}/300</span>
            <button className="primary-button compact" disabled={body.trim() === ""}>
              Post
            </button>
          </div>
          {error === null ? null : <p className="error">{error}</p>}
        </div>
      </form>
      <PostList posts={posts} onNavigateProfile={onNavigateProfile} />
    </section>
  );
}

interface ProfileViewProps {
  username: string;
  currentUser: User;
  onBack: () => void;
  onNavigateProfile: (username: string) => void;
  onShowSocial: (userId: string, kind: "followers" | "following") => void;
}

function ProfileView(props: ProfileViewProps): ReactElement {
  const [profilePage, setProfilePage] = useState<ProfilePage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = (): void => {
    requestJson(`/api/users/${encodeURIComponent(props.username)}`, profilePageSchema)
      .then(setProfilePage)
      .catch((requestError: unknown) =>
        setError(requestError instanceof Error ? requestError.message : "Profile failed"),
      );
  };

  useEffect(loadProfile, [props.username]);

  if (error !== null) {
    return <p className="centered-state error">{error}</p>;
  }
  if (profilePage === null) {
    return <p className="centered-state">Loading profile…</p>;
  }

  const toggleFollow = async (): Promise<void> => {
    const method = profilePage.isFollowing ? "DELETE" : "PUT";
    try {
      if (method === "DELETE") {
        await requestVoid(`/api/users/${profilePage.user.id}/follow`, { method });
      } else {
        await requestJson(
          `/api/users/${profilePage.user.id}/follow`,
          zFollowResponse,
          { method },
        );
      }
      loadProfile();
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Follow failed");
    }
  };

  return (
    <section>
      <header className="sticky-header row-header">
        <button className="icon-button" onClick={props.onBack} aria-label="Back">
          ←
        </button>
        <div>
          <h1>{profilePage.user.displayName}</h1>
          <span>{profilePage.posts.items.length} posts</span>
        </div>
      </header>
      <div className="profile-hero">
        <div className="cover" />
        <div className="profile-row">
          <Avatar name={profilePage.user.displayName} large />
          {props.currentUser.id === profilePage.user.id ? null : (
            <button className="outline-button" onClick={toggleFollow}>
              {profilePage.isFollowing ? "Following" : "Follow"}
            </button>
          )}
        </div>
        <h2>{profilePage.user.displayName}</h2>
        <p className="muted">@{profilePage.user.username}</p>
        <div className="social-counts">
          <button
            onClick={() => props.onShowSocial(profilePage.user.id, "following")}
          >
            <strong>{profilePage.followingCount}</strong> Following
          </button>
          <button
            onClick={() => props.onShowSocial(profilePage.user.id, "followers")}
          >
            <strong>{profilePage.followerCount}</strong> Followers
          </button>
        </div>
      </div>
      <PostList
        posts={profilePage.posts.items}
        onNavigateProfile={props.onNavigateProfile}
      />
    </section>
  );
}

const zFollowResponse = z.object({
  followerId: z.string().uuid(),
  followeeId: z.string().uuid(),
  createdAt: z.coerce.date(),
});

interface SocialListViewProps {
  userId: string;
  kind: "followers" | "following";
  onBack: () => void;
  onNavigateProfile: (username: string) => void;
}

function SocialListView(props: SocialListViewProps): ReactElement {
  const [users, setUsers] = useState<SocialUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    requestJson(`/api/users/${props.userId}/${props.kind}`, userPageSchema)
      .then(({ items }) => setUsers(items))
      .catch((requestError: unknown) =>
        setError(requestError instanceof Error ? requestError.message : "List failed"),
      );
  }, [props.userId, props.kind]);

  return (
    <section>
      <header className="sticky-header row-header">
        <button className="icon-button" onClick={props.onBack} aria-label="Back">
          ←
        </button>
        <h1>{props.kind === "followers" ? "Followers" : "Following"}</h1>
      </header>
      {error === null ? null : <p className="centered-state error">{error}</p>}
      {users.map((user) => (
        <button
          className="user-row"
          key={user.id}
          onClick={() => props.onNavigateProfile(user.username)}
        >
          <Avatar name={user.displayName} />
          <span>
            <strong>{user.displayName}</strong>
            <small>@{user.username}</small>
          </span>
        </button>
      ))}
    </section>
  );
}

function PostList(props: {
  posts: FeedItem[];
  onNavigateProfile: (username: string) => void;
}): ReactElement {
  if (props.posts.length === 0) {
    return <p className="centered-state muted">No posts yet.</p>;
  }

  return (
    <div>
      {props.posts.map((post) => (
        <article className="post" key={post.id}>
          <Avatar name={post.displayName} />
          <div>
            <button
              className="author-button"
              onClick={() => props.onNavigateProfile(post.username)}
            >
              <strong>{post.displayName}</strong>
              <span>@{post.username}</span>
            </button>
            <p>{post.body}</p>
            <time>{post.createdAt.toLocaleString()}</time>
          </div>
        </article>
      ))}
    </div>
  );
}

function Avatar(props: { name: string; large?: boolean }): ReactElement {
  return (
    <span className={props.large === true ? "avatar large" : "avatar"}>
      {props.name.slice(0, 1).toUpperCase()}
    </span>
  );
}
