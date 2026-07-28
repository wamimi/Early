import { NextRequest, NextResponse } from "next/server";
import {
  Interface,
  JsonRpcProvider,
  getAddress,
  isHexString,
} from "ethers";
import {
  EARLY_DISCOVERY_REGISTRY_ABI,
  baseChainId,
  baseExplorerTransaction,
  baseRegistryAddress,
} from "@/lib/base-contracts";
import { assertAllowedOrigin } from "@/lib/origins";
import { authenticatePrivyRequest } from "@/lib/privy-server";
import { toPublicReceipt } from "@/lib/proof-model";
import {
  finalizeProofSession,
  getOwnedProofSession,
  recordBaseReceipt,
} from "@/lib/v2-store";

export const runtime = "nodejs";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

export async function POST(request: NextRequest) {
  try {
    assertAllowedOrigin(request.headers.get("origin"));
    const body = (await request.json()) as {
      sessionId?: unknown;
      walletAddress?: unknown;
      transactionHash?: unknown;
    };
    if (
      typeof body.sessionId !== "string" ||
      typeof body.walletAddress !== "string" ||
      typeof body.transactionHash !== "string" ||
      !isHexString(body.transactionHash, 32)
    ) {
      return NextResponse.json(
        {
          error:
            "sessionId, walletAddress, and a valid transactionHash are required.",
        },
        { status: 400 }
      );
    }

    const user = await authenticatePrivyRequest(request, body.walletAddress);
    const session = await getOwnedProofSession(body.sessionId, user.user_id);
    if (!session?.verified_discovery) {
      return NextResponse.json(
        { error: "A verified proof session is required." },
        { status: 409 }
      );
    }

    const provider = new JsonRpcProvider(required("BASE_RPC_URL"));
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== baseChainId()) {
      throw new Error("BASE_RPC_URL is connected to the wrong chain.");
    }

    const receipt = await provider.getTransactionReceipt(body.transactionHash);
    if (!receipt) {
      return NextResponse.json(
        { error: "The Base transaction is still pending." },
        { status: 202 }
      );
    }
    if (receipt.status !== 1) {
      throw new Error("The Base receipt transaction reverted.");
    }
    if (getAddress(receipt.to ?? "") !== getAddress(baseRegistryAddress())) {
      throw new Error("The transaction did not call the Early registry.");
    }

    const expected = toPublicReceipt(session.verified_discovery);
    const registryInterface = new Interface(EARLY_DISCOVERY_REGISTRY_ABI);
    const registeredEvent = receipt.logs
      .map((log) => {
        try {
          return registryInterface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((event) => event?.name === "DiscoveryRegistered");

    if (
      !registeredEvent ||
      registeredEvent.args.commitment.toLowerCase() !==
        expected.commitment.toLowerCase() ||
      getAddress(registeredEvent.args.owner) !== getAddress(expected.owner) ||
      registeredEvent.args.proofId.toLowerCase() !==
        expected.proofId.toLowerCase() ||
      registeredEvent.args.subjectHash.toLowerCase() !==
        expected.subjectHash.toLowerCase() ||
      registeredEvent.args.contentHash.toLowerCase() !==
        expected.contentHash.toLowerCase() ||
      registeredEvent.args.providerHash.toLowerCase() !==
        expected.providerHash.toLowerCase()
    ) {
      throw new Error(
        "The transaction does not contain the expected Early receipt event."
      );
    }

    await recordBaseReceipt({
      sessionId: session.session_id,
      privyUserId: user.user_id,
      chainId: baseChainId(),
      contractAddress: baseRegistryAddress(),
      transactionHash: body.transactionHash,
      commitment: expected.commitment,
      status: "confirmed",
    });
    await finalizeProofSession(session.session_id);

    return NextResponse.json({
      status: "confirmed",
      transactionHash: body.transactionHash,
      commitment: expected.commitment,
      explorerUrl: baseExplorerTransaction(body.transactionHash),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to reconcile the Base receipt.";
    const status = message.includes("access token")
      ? 401
      : message.includes("origin") || message.includes("not linked")
        ? 403
        : 422;
    return NextResponse.json({ error: message }, { status });
  }
}
