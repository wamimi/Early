function configuredOrigins() {
  const values = [
    process.env.NEXT_PUBLIC_APP_URL,
    ...(process.env.ALLOWED_APP_ORIGINS ?? "").split(","),
  ].filter((value): value is string => Boolean(value?.trim()));
  if (process.env.NODE_ENV !== "production") values.push("http://localhost:3000");
  return new Set(values.map((value) => new URL(value.trim()).origin));
}

export function assertAllowedOrigin(origin: string | null) {
  if (!origin || !configuredOrigins().has(new URL(origin).origin)) {
    throw new Error("This request origin is not allowed.");
  }
}

export function applicationUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return new URL(configured).origin;
  if (process.env.NODE_ENV !== "production") return "http://localhost:3000";
  throw new Error("Missing NEXT_PUBLIC_APP_URL.");
}
