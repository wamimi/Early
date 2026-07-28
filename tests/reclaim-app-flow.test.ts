import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  init: vi.fn(),
  getRequestUrl: vi.fn(),
  setAppCallbackUrl: vi.fn(),
  setRedirectUrl: vi.fn(),
  setCancelRedirectUrl: vi.fn(),
  setContext: vi.fn(),
  setParams: vi.fn(),
}));

vi.mock("@reclaimprotocol/js-sdk", () => ({
  ReclaimProofRequest: { init: mocks.init },
}));

import { createReclaimProofRequest } from "@/lib/reclaim";

describe("Reclaim Verifier app handoff", () => {
  beforeEach(() => {
    vi.stubEnv("RECLAIM_APP_ID", "reclaim-app");
    vi.stubEnv("RECLAIM_APP_SECRET", "reclaim-secret");
    vi.stubEnv("RECLAIM_X_PROVIDER_ID", "x-provider");
    vi.stubEnv("RECLAIM_X_PROVIDER_VERSION", "1.0.0");
    vi.stubEnv(
      "RECLAIM_X_PROVIDER_CONFIGURATION_HASH",
      `0x${"11".repeat(32)}`
    );
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://early.example");

    mocks.getRequestUrl.mockReset();
    mocks.getRequestUrl.mockResolvedValue("https://share.reclaimprotocol.org/app-flow");
    for (const mock of [
      mocks.setAppCallbackUrl,
      mocks.setRedirectUrl,
      mocks.setCancelRedirectUrl,
      mocks.setContext,
      mocks.setParams,
    ]) {
      mock.mockReset();
    }
    mocks.init.mockReset();
    mocks.init.mockResolvedValue({
      getProviderVersion: () => ({ providerVersion: "1.0.0" }),
      getSessionId: () => "session-1",
      getStatusUrl: () => "https://reclaim.example/status/session-1",
      getRequestUrl: mocks.getRequestUrl,
      setAppCallbackUrl: mocks.setAppCallbackUrl,
      setRedirectUrl: mocks.setRedirectUrl,
      setCancelRedirectUrl: mocks.setCancelRedirectUrl,
      setContext: mocks.setContext,
      setParams: mocks.setParams,
    });
  });

  it("uses the Verifier app URL for both the persisted request and phone handoff", async () => {
    const result = await createReclaimProofRequest({
      platform: "x",
      subjectUrl: "https://x.com/early/status/1900000000000000000",
      walletAddress: "0x1111111111111111111111111111111111111111",
    });

    expect(mocks.getRequestUrl).toHaveBeenCalledOnce();
    expect(mocks.getRequestUrl).toHaveBeenCalledWith({
      verificationMode: "app",
      canUseDeferredDeepLinksFlow: true,
    });
    expect(result.requestUrl).toBe("https://share.reclaimprotocol.org/app-flow");
    expect(result.mobileRequestUrl).toBe(result.requestUrl);
  });
});
