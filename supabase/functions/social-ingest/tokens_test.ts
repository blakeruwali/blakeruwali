import { assertEquals } from "jsr:@std/assert@1";
import { needsRefresh, resolveTokens, sha256Hex } from "./tokens.ts";

const now = new Date("2026-11-20T12:00:00Z");
const day = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

Deno.test("needsRefresh: never stored or a week old", () => {
  assertEquals(needsRefresh(undefined, now), true);
  assertEquals(needsRefresh({ env_name: "IG_ACCESS_TOKEN", access_token: "a", expires_at: null, refreshed_at: day(2), source_hash: null }, now), false);
  assertEquals(needsRefresh({ env_name: "IG_ACCESS_TOKEN", access_token: "a", expires_at: null, refreshed_at: day(7), source_hash: null }, now), true);
});

function fakeDb(rows: unknown[]) {
  const saved: Record<string, unknown>[] = [];
  const db = {
    rpc: (name: string, args?: Record<string, unknown>) => {
      if (name === "get_platform_tokens") return Promise.resolve({ data: rows, error: null });
      saved.push(args!);
      return Promise.resolve({ data: null, error: null });
    },
  };
  // deno-lint-ignore no-explicit-any
  return { db: db as any, saved };
}

const okFetch = (token: string) => () =>
  Promise.resolve(new Response(JSON.stringify({ access_token: token, expires_in: 5_184_000 }), { status: 200 }));

Deno.test("renews the env token on first run and stores it", async () => {
  const { db, saved } = fakeDb([]);
  const env = (n: string) => (n === "IG_ACCESS_TOKEN" ? "env-ig" : undefined);
  const { overrides, notes } = await resolveTokens(db, env, okFetch("fresh-ig") as typeof fetch, now);
  assertEquals(overrides.IG_ACCESS_TOKEN, "fresh-ig");
  assertEquals(overrides.THREADS_ACCESS_TOKEN, undefined);
  assertEquals(saved.length, 1);
  assertEquals(saved[0].p_env_name, "IG_ACCESS_TOKEN");
  assertEquals(saved[0].p_source_hash, await sha256Hex("env-ig"));
  assertEquals(notes, {});
});

Deno.test("uses the stored token and skips renewal when recent", async () => {
  const source_hash = await sha256Hex("env-old");
  const { db, saved } = fakeDb([{ env_name: "THREADS_ACCESS_TOKEN", access_token: "stored-th", expires_at: null, refreshed_at: day(1), source_hash }]);
  const { overrides } = await resolveTokens(db, () => "env-old", okFetch("x") as typeof fetch, now);
  assertEquals(overrides.THREADS_ACCESS_TOKEN, "stored-th");
  assertEquals(saved.filter((s) => s.p_env_name === "THREADS_ACCESS_TOKEN").length, 0);
});

Deno.test("failed renewal keeps the current token and notes why, without leaking it", async () => {
  const { db } = fakeDb([]);
  const bad = () => Promise.resolve(new Response('{"error":{"message":"token too new"}}', { status: 400 }));
  const { overrides, notes } = await resolveTokens(db, (n) => (n === "IG_ACCESS_TOKEN" ? "secret-ig" : undefined), bad as typeof fetch, now);
  assertEquals(overrides.IG_ACCESS_TOKEN, "secret-ig");
  assertEquals(notes.IG_ACCESS_TOKEN.includes("secret-ig"), false);
});

Deno.test("system-user Instagram token (IG_USER_ID set) is never renewed", async () => {
  const { db, saved } = fakeDb([]);
  const env = (n: string) => ({ IG_ACCESS_TOKEN: "suat", IG_USER_ID: "1784" } as Record<string, string>)[n];
  const { overrides, notes } = await resolveTokens(db, env, okFetch("x") as typeof fetch, now);
  assertEquals(overrides.IG_ACCESS_TOKEN, "suat");
  assertEquals(saved.length, 0);
  assertEquals(notes, {});
});

Deno.test("a newly set secret replaces the saved token", async () => {
  const source_hash = await sha256Hex("old-secret");
  const { db, saved } = fakeDb([{ env_name: "IG_ACCESS_TOKEN", access_token: "stored-ig", expires_at: null, refreshed_at: day(1), source_hash }]);
  const env = (n: string) => (n === "IG_ACCESS_TOKEN" ? "new-secret" : undefined);
  const { overrides } = await resolveTokens(db, env, okFetch("fresh-from-new") as typeof fetch, now);
  assertEquals(overrides.IG_ACCESS_TOKEN, "fresh-from-new");
  assertEquals(saved[0].p_source_hash, await sha256Hex("new-secret"));
});

Deno.test("with no secret set, the saved token is still used", async () => {
  const { db } = fakeDb([{ env_name: "IG_ACCESS_TOKEN", access_token: "stored-ig", expires_at: null, refreshed_at: day(1), source_hash: "abc" }]);
  const { overrides } = await resolveTokens(db, () => undefined, okFetch("x") as typeof fetch, now);
  assertEquals(overrides.IG_ACCESS_TOKEN, "stored-ig");
});
