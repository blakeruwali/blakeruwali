import type { ChannelId, Collector } from "../types.ts";
import { emptyResult } from "../types.ts";
import { collectInstagram } from "./instagram.ts";
import { collectThreads } from "./threads.ts";
import { collectYouTube } from "./youtube.ts";
import { collectTikTok } from "./tiktok.ts";
import { collectX } from "./x.ts";
import { collectPinterest } from "./pinterest.ts";

// Facebook (profile in professional mode) and LinkedIn (personal profile) have no API path
// Blake can use today, so they come in through the dashboard's CSV import.
const manual = (channel: ChannelId, why: string): Collector => () =>
  Promise.resolve(emptyResult(channel, "skipped", why));

export const COLLECTORS: Record<ChannelId, Collector> = {
  instagram: collectInstagram,
  threads: collectThreads,
  youtube: collectYouTube,
  tiktok: collectTikTok,
  x: collectX,
  pinterest: collectPinterest,
  facebook: manual("facebook", "Manual: import the Professional dashboard export"),
  linkedin: manual("linkedin", "Manual: import the LinkedIn creator analytics export"),
};
