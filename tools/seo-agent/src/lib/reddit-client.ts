import { requireEnv } from "../config.js";

export type RedditSearchSort = "relevance" | "hot" | "top" | "new" | "comments";
export type RedditSearchTime = "all" | "year" | "month" | "week" | "day";

export type RedditThreadCandidate = {
  reddit_id: string;
  subreddit: string;
  title: string;
  url: string;
  permalink: string;
  author: string | null;
  selftext: string;
  reddit_score: number;
  comment_count: number;
  created_utc: string | null;
  search_query: string;
  search_subreddit: string;
};

export type RedditComment = {
  id: string;
  author: string | null;
  body: string;
  score: number;
  created_utc: string | null;
};

export type RedditFetchedThread = RedditThreadCandidate & {
  top_comments: RedditComment[];
  thread_content: string;
};

type TokenCache = {
  token: string;
  expiresAt: number;
} | null;

let tokenCache: TokenCache = null;

function userAgent() {
  return process.env.REDDIT_USER_AGENT || "peekaboo/0.1";
}

function cleanSubreddit(subreddit: string) {
  return subreddit.trim().replace(/^r\//i, "").replace(/^\/r\//i, "");
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function utcSecondsToIso(value: unknown) {
  const seconds = asNumber(value, 0);
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

function redditUrl(permalink: string) {
  return permalink.startsWith("http") ? permalink : `https://www.reddit.com${permalink}`;
}

async function getRedditToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token;
  }

  const clientId = requireEnv("REDDIT_CLIENT_ID");
  const clientSecret = requireEnv("REDDIT_CLIENT_SECRET");
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": userAgent()
    },
    body: new URLSearchParams({
      grant_type: "client_credentials"
    })
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Reddit token request failed: ${response.status} ${text}`);
  }

  const data = JSON.parse(text) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("Reddit token response did not include access_token.");

  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + asNumber(data.expires_in, 3600) * 1000
  };
  return tokenCache.token;
}

async function redditGet(pathname: string, params: Record<string, string | number | undefined> = {}, retry = true): Promise<unknown> {
  const token = await getRedditToken();
  const url = new URL(`https://oauth.reddit.com${pathname}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": userAgent()
    }
  });

  if (response.status === 401 && retry) {
    tokenCache = null;
    return redditGet(pathname, params, false);
  }

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Reddit API request failed: ${response.status} ${text}`);
  }

  return JSON.parse(text) as unknown;
}

function listingChildren(value: unknown): unknown[] {
  if (!value || typeof value !== "object" || !("data" in value)) return [];
  const data = (value as { data?: { children?: unknown[] } }).data;
  return Array.isArray(data?.children) ? data.children : [];
}

function childData(child: unknown): Record<string, unknown> {
  if (!child || typeof child !== "object" || !("data" in child)) return {};
  const data = (child as { data?: unknown }).data;
  return data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
}

function normalizeCandidate(data: Record<string, unknown>, searchQuery: string, searchSubreddit: string): RedditThreadCandidate | null {
  const id = asString(data.id);
  const permalink = asString(data.permalink);
  const title = asString(data.title).trim();
  if (!id || !permalink || !title) return null;

  return {
    reddit_id: id,
    subreddit: asString(data.subreddit, cleanSubreddit(searchSubreddit)),
    title,
    url: redditUrl(permalink),
    permalink,
    author: asString(data.author) || null,
    selftext: asString(data.selftext).trim(),
    reddit_score: asNumber(data.score),
    comment_count: asNumber(data.num_comments),
    created_utc: utcSecondsToIso(data.created_utc),
    search_query: searchQuery,
    search_subreddit: searchSubreddit
  };
}

function normalizeComment(data: Record<string, unknown>): RedditComment | null {
  const id = asString(data.id);
  const body = asString(data.body).trim();
  if (!id || !body) return null;

  return {
    id,
    author: asString(data.author) || null,
    body,
    score: asNumber(data.score),
    created_utc: utcSecondsToIso(data.created_utc)
  };
}

function buildThreadContent(thread: RedditThreadCandidate, comments: RedditComment[]) {
  const commentLines = comments
    .slice(0, 8)
    .map((comment) => `- ${comment.body.replace(/\s+/g, " ").slice(0, 600)}`)
    .join("\n");

  return [
    `Title: ${thread.title}`,
    `Subreddit: r/${thread.subreddit}`,
    thread.selftext ? `Post: ${thread.selftext.replace(/\s+/g, " ").slice(0, 1800)}` : "",
    commentLines ? `Top comments:\n${commentLines}` : ""
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function searchRedditThreads({
  subreddit,
  query,
  sort = "relevance",
  time = "year",
  limit = 10
}: {
  subreddit: string;
  query: string;
  sort?: RedditSearchSort;
  time?: RedditSearchTime;
  limit?: number;
}) {
  const clean = cleanSubreddit(subreddit);
  const data = await redditGet(`/r/${encodeURIComponent(clean)}/search`, {
    q: query,
    restrict_sr: "on",
    sort,
    t: time,
    limit: Math.max(1, Math.min(limit, 25))
  });

  return listingChildren(data)
    .map((child) => normalizeCandidate(childData(child), query, `r/${clean}`))
    .filter((candidate): candidate is RedditThreadCandidate => Boolean(candidate));
}

export async function fetchRedditThread(candidate: RedditThreadCandidate) {
  const permalink = candidate.permalink.replace(/\/?$/, "");
  const data = await redditGet(`${permalink}.json`, {
    limit: 12,
    sort: "top"
  });
  const listings = Array.isArray(data) ? data : [];
  const postListing = listings[0];
  const commentListing = listings[1];
  const postData = childData(listingChildren(postListing)[0]);
  const refreshedCandidate = normalizeCandidate(postData, candidate.search_query, candidate.search_subreddit) || candidate;
  const comments = listingChildren(commentListing)
    .map((child) => normalizeComment(childData(child)))
    .filter((comment): comment is RedditComment => Boolean(comment))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  return {
    ...refreshedCandidate,
    top_comments: comments,
    thread_content: buildThreadContent(refreshedCandidate, comments)
  } satisfies RedditFetchedThread;
}
