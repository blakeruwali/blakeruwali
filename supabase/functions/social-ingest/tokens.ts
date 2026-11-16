// Keeps Instagram and Threads long-lived tokens alive. Both last 60 days and can be renewed once they
// are at least 24 hours old. The newest token is stored through service-role-only RPCs; the secret
// set with `supabase secrets set` is only the starting point.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import { getJson } from "./http.ts";

type FetchFn = typeof fetch;
export interface StoredToken { env_name: string; access_token: string; expires_at: string | null; refreshed_at: string }

export const REFRESHABLE: Record<string, string> = {
  IG_ACCESS_TOKEN: "https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token",
  THREADS_ACCESS_TOKEN: "https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token",
};
const DAY = 86_400_000;
const REFRESH_EVERY_DAYS = 7;

// Renew when never renewed by us, or when the last renewal is a week old.
export function needsRefresh(stored: StoredToken | undefined, now: Date): boolean {
  if (!stored) return true;
  return now.getTime() - new Date(stored.refreshed_at).getTime() >= REFRESH_EVERY_DAYS * DAY;
}

export async function refreshToken(fetchFn: FetchFn, envName: string, token: string, now: Date) {
  // These two endpoints only accept the token as a query parameter; errors are redacted by getJson.
  const url = `${REFRESHABLE[envName]}&access_token=${encodeURIComponent(token)}`;
  const res = await getJson<{ access_token: string; expires_in?: number }>(fetchFn, url);
  if (!res.access_token) throw new Error(`${envName} refresh returned no token`);
  const expiresAt = res.expires_in ? new Date(now.getTime() + res.expires_in * 1000).toISOString() : null;
  return { access_token: res.access_token, expires_at: expiresAt };
}

// Returns env-name → token overrides, renewing tokens that are due. A failed renewal keeps the current
// token and reports the reason, so a pull still runs on the old token until it truly expires.
export async function resolveTokens(
  db: SupabaseClient, env: (n: string) => string | undefined, fetchFn: FetchFn, now: Date,
): Promise<{ overrides: Record<string, string>; notes: Record<string, string> }> {
  const overrides: Record<string, string> = {};
  const notes: Record<string, string> = {};
  const { data, error } = await db.rpc("get_platform_tokens");
  if (error) {
    for (const n of Object.keys(REFRESHABLE)) notes[n] = `token store unavailable: ${error.message}`;
    return { overrides, notes };
  }
  const stored = new Map((data as StoredToken[] ?? []).map((t) => [t.env_name, t]));
  for (const name of Object.keys(REFRESHABLE)) {
    const s = stored.get(name);
    const current = s?.access_token ?? env(name);
    if (!current) continue;
    overrides[name] = current;
    if (!needsRefresh(s, now)) continue;
    try {
      const fresh = await refreshToken(fetchFn, name, current, now);
      const { error: saveErr } = await db.rpc("save_platform_token", {
        p_env_name: name, p_access_token: fresh.access_token, p_expires_at: fresh.expires_at,
      });
      if (saveErr) throw new Error(`could not save renewed token: ${saveErr.message}`);
      overrides[name] = fresh.access_token;
    } catch (e) {
      // A brand-new token (< 24 h old) cannot be renewed yet; that is expected on day one.
      notes[name] = `token renewal skipped: ${(e as Error).message}`;
    }
  }
  return { overrides, notes };
}
