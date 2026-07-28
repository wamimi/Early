import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const hopByHopHeaders = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);

function getUpstreamRelayerUrl() {
  return (process.env.ZAMA_RELAYER_UPSTREAM_URL || "https://relayer.testnet.zama.org").replace(/\/$/, "");
}

function buildUpstreamUrl(request: NextRequest, _chainId: string, path: string[]) {
  const suffix = path.join("/");
  const url = new URL(`${getUpstreamRelayerUrl()}${suffix ? `/${suffix}` : ""}`);
  request.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });
  return url;
}

function buildForwardHeaders(request: NextRequest) {
  const headers = new Headers();

  request.headers.forEach((value, key) => {
    if (!hopByHopHeaders.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });

  const apiKey = process.env.ZAMA_RELAYER_API_KEY?.trim();

  if (apiKey) {
    headers.set("authorization", `Bearer ${apiKey}`);
    headers.set("x-api-key", apiKey);
  }

  return headers;
}

async function forward(request: NextRequest, context: { params: Promise<{ chainId: string; path?: string[] }> }) {
  const { chainId, path = [] } = await context.params;
  const upstreamUrl = buildUpstreamUrl(request, chainId, path);
  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();

  const response = await fetch(upstreamUrl, {
    method: request.method,
    headers: buildForwardHeaders(request),
    body,
    redirect: "manual"
  });
  const responseHeaders = new Headers();

  response.headers.forEach((value, key) => {
    if (!hopByHopHeaders.has(key.toLowerCase())) {
      responseHeaders.set(key, value);
    }
  });

  return new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders
  });
}

export async function GET(request: NextRequest, context: { params: Promise<{ chainId: string; path?: string[] }> }) {
  return forward(request, context);
}

export async function POST(request: NextRequest, context: { params: Promise<{ chainId: string; path?: string[] }> }) {
  return forward(request, context);
}

export async function PUT(request: NextRequest, context: { params: Promise<{ chainId: string; path?: string[] }> }) {
  return forward(request, context);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ chainId: string; path?: string[] }> }) {
  return forward(request, context);
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ chainId: string; path?: string[] }> }) {
  return forward(request, context);
}
