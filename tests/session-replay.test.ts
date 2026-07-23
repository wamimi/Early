import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimSessionForVerification,
  clearExpiredRawProofs,
} from "@/lib/v2-store";

describe("proof session replay and retention boundaries", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubEnv("SUPABASE_URL", "https://database.example");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role");
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("claims only a pending session for callback verification", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const claimed = await claimSessionForVerification("session-1");

    expect(claimed).toBeNull();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("session_id=eq.session-1");
    expect(url).toContain("status=eq.pending");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({ status: "verifying" });
  });

  it("clears only proof payloads whose retention deadline has elapsed", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    await clearExpiredRawProofs();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("raw_proof_expires_at=lt.");
    expect(url).toContain("proof_ciphertext=not.is.null");
    expect(JSON.parse(String(init.body))).toEqual({
      proof_ciphertext: null,
      raw_proof_expires_at: null,
    });
  });
});
