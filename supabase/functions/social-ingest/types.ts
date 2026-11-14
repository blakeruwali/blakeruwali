// Shared shapes for the social-ingest collectors.

export type ChannelId =
  | "facebook" | "instagram" | "tiktok" | "youtube" | "x" | "threads" | "linkedin" | "pinterest";

export type PostFormat =
  | "reel" | "short" | "video" | "long_video" | "carousel" | "image" | "text" | "story" | "pin" | "thread";

export interface PostMetricRow {
  post_key: string;
  title: string;
  format: PostFormat;
  posted_at?: string;
  url?: string;
  duration_sec?: number;
  views?: number;
  reach?: number;
  avg_watch_sec?: number;
  three_sec_views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  follows?: number;
  profile_visits?: number;
  raw?: unknown;
}

export interface AiCommentRow {
  platform_comment_id: string;
  platform_post_id?: string;
  author_handle?: string;
  body: string;
  commented_at: string;
}

export type RunStatus = "ok" | "partial" | "needs_token" | "error" | "skipped";

export interface CollectResult {
  channel: ChannelId;
  status: RunStatus;
  message?: string;
  followers?: number;
  posts: PostMetricRow[];
  aiComments: AiCommentRow[];
}

export type Env = (name: string) => string | undefined;
export type Fetch = typeof fetch;

export interface CollectorContext {
  env: Env;
  fetch: Fetch;
  now: Date;
  maxPosts: number;
}

export type Collector = (ctx: CollectorContext) => Promise<CollectResult>;

export function emptyResult(channel: ChannelId, status: RunStatus, message?: string): CollectResult {
  return { channel, status, message, posts: [], aiComments: [] };
}
