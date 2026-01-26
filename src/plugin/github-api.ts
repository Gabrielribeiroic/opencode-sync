/**
 * GitHub API utilities for plugin initialization.
 * Handles user authentication and repository operations.
 */

/** Fetch authenticated user's GitHub username */
export async function getGitHubUsername(token: string): Promise<string> {
  const res = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to get GitHub user: ${String(res.status)}`);
  }

  const user = (await res.json()) as { login: string };
  return user.login;
}

/** Check if repo exists */
export async function repoExists(token: string, owner: string, repo: string): Promise<boolean> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });
  return res.ok;
}

/** Create a new private repo */
export async function createRepo(token: string, name: string): Promise<void> {
  const res = await fetch('https://api.github.com/user/repos', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      description: 'OpenCode Sync Storage',
      private: true,
      auto_init: true,
    }),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(`Failed to create repo: ${err.message ?? String(res.status)}`);
  }
}
