import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { describe, expect, test, vi } from "vitest";

const injectionPath = fileURLToPath(
  new URL("../scripts/reclaim/x-provider-v1.0.4-injection.js", import.meta.url)
);
const injectionSource = readFileSync(injectionPath, "utf8");

function createInjectionHarness() {
  let middleware:
    | ((response: unknown, request: unknown) => Promise<unknown>)
    | undefined;
  const requestClaim = vi.fn().mockResolvedValue("viewer-claim");
  const reportProviderError = vi.fn();
  const storage = new Map<string, string>();
  const sessionStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  };
  const browserWindow: Record<string, unknown> = {
    Reclaim: {
      parameters: { tweetId: "100" },
      log: vi.fn(),
      requiresUserInteraction: vi.fn(),
      canExpectManyClaims: vi.fn(),
      reportProviderError,
      requestClaim,
    },
    reclaimInterceptor: {
      addResponseMiddleware: (
        callback: (response: unknown, request: unknown) => Promise<unknown>
      ) => {
        middleware = callback;
      },
    },
    sessionStorage,
    setTimeout,
    clearTimeout,
  };
  browserWindow.window = browserWindow;

  runInNewContext(injectionSource, {
    URL,
    window: browserWindow,
    sessionStorage,
    setTimeout,
    clearTimeout,
  });

  assert.ok(middleware);
  return { middleware, requestClaim, reportProviderError };
}

function replyRequest() {
  const variables = encodeURIComponent(JSON.stringify({ focalTweetId: "200" }));
  return {
    url: `https://x.com/i/api/graphql/current/TweetDetail?variables=${variables}`,
    options: { headers: {} },
  };
}

describe("X provider v1.0.4 injection", () => {
  test("replays only the authenticated X headers captured under request.options", async () => {
    const { middleware, requestClaim, reportProviderError } =
      createInjectionHarness();
    const headers = new Headers({
      Accept: "application/json",
      Authorization: "Bearer private",
      "X-CSRF-Token": "private-csrf",
      "X-Twitter-Auth-Type": "OAuth2Session",
      "X-Unused": "discard-me",
    });

    await middleware(
      {},
      {
        url: "https://api.x.com/1.1/account/settings.json?include_country_code=true",
        options: { headers },
      }
    );
    await middleware({}, replyRequest());
    await Promise.resolve();

    expect(reportProviderError).not.toHaveBeenCalled();
    expect(requestClaim).toHaveBeenCalledOnce();
    const claim = requestClaim.mock.calls[0][0];
    expect(claim.credentials).toBe("include");
    expect(claim.headers.authorization).toBe("Bearer private");
    expect(claim.headers["x-csrf-token"]).toBe("private-csrf");
    expect(claim.headers["x-unused"]).toBeUndefined();
  });

  test("stops before proof generation when authenticated headers are absent", async () => {
    const { middleware, requestClaim, reportProviderError } =
      createInjectionHarness();

    await middleware(
      {},
      {
        url: "https://api.x.com/1.1/account/settings.json?include_country_code=true",
        options: { headers: { Accept: "application/json" } },
      }
    );
    await middleware({}, replyRequest());

    expect(requestClaim).not.toHaveBeenCalled();
    expect(reportProviderError).toHaveBeenCalledWith(
      "Early could not capture the authenticated X session. Please start again."
    );
  });
});
