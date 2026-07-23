import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  createRequest: vi.fn(),
  createSession: vi.fn(),
}));

vi.mock("@/lib/privy-server", () => ({
  authenticatePrivyRequest: mocks.authenticate,
}));
vi.mock("@/lib/reclaim", () => ({
  createReclaimProofRequest: mocks.createRequest,
}));
vi.mock("@/lib/v2-store", () => ({
  createProofSession: mocks.createSession,
}));

import { POST } from "@/app/api/reclaim/start/route";

const wallet = "0x1111111111111111111111111111111111111111";

function request(
  body: Record<string, unknown>,
  origin = "https://early.example"
) {
  return new NextRequest("https://early.example/api/reclaim/start", {
    method: "POST",
    headers: {
      authorization: "Bearer privy-token",
      "content-type": "application/json",
      origin,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/reclaim/start", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://early.example");
    mocks.authenticate.mockReset();
    mocks.createRequest.mockReset();
    mocks.createSession.mockReset();
    mocks.authenticate.mockResolvedValue({
      user_id: "did:privy:user-1",
      wallet,
    });
    mocks.createRequest.mockResolvedValue({
      sessionId: "session-1",
      requestUrl: "https://reclaim.example/request",
      mobileRequestUrl: "reclaim://request",
      statusUrl: "https://reclaim.example/status",
      subjectId: "1900000000000000000",
      subjectUrl: "https://x.com/early/status/1900000000000000000",
      provider: {
        id: "early-x-v2",
        version: "2.0.0",
        hash: `0x${"11".repeat(32)}`,
        schemaVersion: 2,
      },
      sessionNullifier: `0x${"22".repeat(32)}`,
    });
  });

  it("authenticates the linked wallet before creating a proof session", async () => {
    const response = await POST(
      request({
        platform: "x",
        subjectUrl: "https://x.com/early/status/1900000000000000000",
        walletAddress: wallet,
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.authenticate).toHaveBeenCalledOnce();
    expect(mocks.createRequest).toHaveBeenCalledWith({
      platform: "x",
      subjectUrl: "https://x.com/early/status/1900000000000000000",
      walletAddress: wallet,
    });
    expect(mocks.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        privyUserId: "did:privy:user-1",
        sessionId: "session-1",
        walletAddress: wallet,
      })
    );
  });

  it("rejects an unconfigured origin before authentication", async () => {
    const response = await POST(
      request(
        {
          platform: "x",
          subjectUrl: "https://x.com/early/status/1900000000000000000",
          walletAddress: wallet,
        },
        "https://early.example.attacker.test"
      )
    );

    expect(response.status).toBe(403);
    expect(mocks.authenticate).not.toHaveBeenCalled();
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("rejects unsupported provider paths", async () => {
    const response = await POST(
      request({
        platform: "instagram",
        subjectUrl: "https://instagram.com/p/example",
        walletAddress: wallet,
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.createRequest).not.toHaveBeenCalled();
  });
});
