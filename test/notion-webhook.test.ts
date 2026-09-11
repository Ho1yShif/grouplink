// The handler takes a request object and a dispatch function, so these run with
// no server, no Render API key, and no real clock.
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createNotionWebhook, type NotionWebhookOptions } from "../src/notion-webhook.js";

const SECRET = "verification-token";
const TASK = "grouplink.rebuild";
const DEBOUNCE_MS = 60_000;

const sign = (rawBody: string, secret = SECRET) =>
  `sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`;

/** Signed and secret by default; pass `{ secret: undefined }` for the handshake case. */
function setup(overrides: Partial<NotionWebhookOptions> = {}) {
  const dispatch = vi.fn(async () => ({ runId: "run-1" }));
  const handle = createNotionWebhook({
    dispatch,
    task: TASK,
    debounceMs: DEBOUNCE_MS,
    secret: SECRET,
    ...overrides,
  });
  const rawPost = (rawBody: string, headers: Record<string, string> = {}) =>
    handle({ headers, rawBody });
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    rawPost(JSON.stringify(body), headers);
  const signedPost = (body: unknown) => {
    const rawBody = JSON.stringify(body);
    return handle({ headers: { "x-notion-signature": sign(rawBody) }, rawBody });
  };
  return { dispatch, post, rawPost, signedPost };
}

const event = (type: string) => ({ id: "evt-1", type, data: { parent: { id: "ds-1" } } });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createNotionWebhook", () => {
  it("schedules one dispatch for a signed event", async () => {
    const { dispatch, signedPost } = setup();

    expect(signedPost(event("page.properties_updated"))).toEqual({
      status: 202,
      body: { scheduled: true },
    });
    expect(dispatch).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(dispatch).toHaveBeenCalledExactlyOnceWith(TASK, [{}]);
  });

  it("rejects a wrong signature without scheduling anything", async () => {
    const { dispatch, post } = setup();
    const body = event("page.created");

    const wrong = { "x-notion-signature": sign(JSON.stringify(body), "wrong") };
    expect(post(body, wrong).status).toBe(401);
    expect(post(body).status).toBe(401);

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("accepts the unsigned handshake only while the secret is unset", () => {
    const handshake = { verification_token: "secret-from-notion" };

    expect(setup({ secret: undefined }).post(handshake).status).toBe(200);
    expect(setup().post(handshake).status).toBe(401);
  });

  it("rejects a body that is not JSON", () => {
    const { rawPost } = setup({ secret: undefined });
    expect(rawPost("{").status).toBe(400);
  });

  it("ignores an event type outside the rebuild list", async () => {
    const { dispatch, signedPost } = setup();

    expect(signedPost(event("comment.created"))).toEqual({ status: 204 });

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("collapses a burst of edits into one run", async () => {
    const { dispatch, signedPost } = setup();

    for (const _ of [1, 2, 3]) {
      signedPost(event("page.content_updated"));
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS / 2);
    }
    expect(dispatch).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(dispatch).toHaveBeenCalledOnce();
  });
});
