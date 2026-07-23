import { PrivyClient, type VerifyAccessTokenResponse } from "@privy-io/node";
import { getAddress } from "ethers";
import type { NextRequest } from "next/server";

let client: PrivyClient | null = null;

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function privyClient() {
  if (!client) {
    client = new PrivyClient({
      appId: required("PRIVY_APP_ID"),
      appSecret: required("PRIVY_APP_SECRET"),
      jwtVerificationKey: process.env.PRIVY_JWT_VERIFICATION_KEY,
    });
  }
  return client;
}

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("A Privy access token is required.");
  }
  return authorization.slice("Bearer ".length).trim();
}

function linkedWalletAddresses(user: { linked_accounts: Array<Record<string, unknown>> }) {
  return user.linked_accounts.flatMap((account) => {
    if (
      (account.type === "wallet" || account.type === "smart_wallet") &&
      typeof account.address === "string"
    ) {
      return [account.address.toLowerCase()];
    }
    return [];
  });
}

export type AuthenticatedPrivyUser = VerifyAccessTokenResponse & {
  wallet: `0x${string}`;
};

export async function authenticatePrivyRequest(
  request: NextRequest,
  requestedWallet: string
): Promise<AuthenticatedPrivyUser> {
  const sdk = privyClient();
  const claims = await sdk.utils().auth().verifyAccessToken(bearerToken(request));
  const user = await sdk.users()._get(claims.user_id);
  const wallet = getAddress(requestedWallet) as `0x${string}`;
  if (!linkedWalletAddresses(user as unknown as { linked_accounts: Array<Record<string, unknown>> })
    .includes(wallet.toLowerCase())) {
    throw new Error("The requested wallet is not linked to this Privy account.");
  }
  return { ...claims, wallet };
}
