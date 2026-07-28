import { NextRequest, NextResponse } from "next/server";
import {
  Interface,
  JsonRpcProvider,
  getAddress,
  isHexString,
} from "ethers";
import {
  CAMPAIGN_CLAIMS_ABI,
  baseCampaignClaimsAddress,
  baseChainId,
  baseExplorerTransaction,
} from "@/lib/base-contracts";
import { assertAllowedOrigin } from "@/lib/origins";
import { authenticatePrivyRequest } from "@/lib/privy-server";
import {
  confirmEvaluationClaim,
  getOwnedEvaluation,
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
      evaluationId?: unknown;
      walletAddress?: unknown;
      transactionHash?: unknown;
    };
    if (
      typeof body.evaluationId !== "string" ||
      typeof body.walletAddress !== "string" ||
      typeof body.transactionHash !== "string" ||
      !isHexString(body.transactionHash, 32)
    ) {
      return NextResponse.json(
        { error: "A valid evaluation and transaction are required." },
        { status: 400 }
      );
    }

    const user = await authenticatePrivyRequest(request, body.walletAddress);
    const evaluation = await getOwnedEvaluation(
      body.evaluationId,
      user.user_id
    );
    if (
      !evaluation ||
      evaluation.status !== "authorized" ||
      !evaluation.authorization_nullifier
    ) {
      return NextResponse.json(
        { error: "This evaluation is not claimable." },
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
        { error: "The Base claim transaction is still pending." },
        { status: 202 }
      );
    }
    if (
      receipt.status !== 1 ||
      getAddress(receipt.to ?? "") !== getAddress(baseCampaignClaimsAddress())
    ) {
      throw new Error("The Base claim transaction is invalid.");
    }

    const contractInterface = new Interface(CAMPAIGN_CLAIMS_ABI);
    const event = receipt.logs
      .map((log) => {
        try {
          return contractInterface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((candidate) => candidate?.name === "EligibilityClaimed");
    if (
      !event ||
      getAddress(event.args.claimant) !== getAddress(user.wallet) ||
      event.args.nullifier.toLowerCase() !==
        evaluation.authorization_nullifier.toLowerCase() ||
      event.args.evaluationTxHash.toLowerCase() !==
        evaluation.zama_transaction_hash.toLowerCase()
    ) {
      throw new Error("The Base claim event does not match this evaluation.");
    }

    await confirmEvaluationClaim(
      body.evaluationId,
      user.user_id,
      body.transactionHash
    );
    return NextResponse.json({
      status: "claimed",
      explorerUrl: baseExplorerTransaction(body.transactionHash),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to confirm the claim.";
    const status = message.includes("access token")
      ? 401
      : message.includes("origin") || message.includes("not linked")
        ? 403
        : 422;
    return NextResponse.json({ error: message }, { status });
  }
}
