import { SignJWT, jwtVerify, errors as joseErrors } from "jose";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Context, MiddlewareHandler } from "hono";
import type { JWTPayload } from "./types";
import { env } from "./env";
import { logger } from "./logger";

const COOKIE_NAME = "gong_intel_session";
const TOKEN_EXPIRY = "7d";

function getSecretKey(): Uint8Array {
  return new TextEncoder().encode(env.JWT_SECRET);
}

/**
 * Create a signed JWT session token.
 */
export async function createSessionToken(
  payload: JWTPayload
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(getSecretKey());
}

/**
 * Verify and decode a session token.
 * Now logs the specific failure reason instead of silently returning null.
 */
export async function verifySessionToken(
  token: string
): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload as unknown as JWTPayload;
  } catch (err) {
    let reason = "unknown";
    if (err instanceof joseErrors.JWTExpired) {
      reason = "expired";
    } else if (err instanceof joseErrors.JWTClaimValidationFailed) {
      reason = "claim_validation_failed";
    } else if (err instanceof joseErrors.JWSSignatureVerificationFailed) {
      reason = "invalid_signature";
    } else if (err instanceof joseErrors.JWTInvalid) {
      reason = "malformed";
    }

    logger.warn("JWT verification failed", {
      service: "auth",
      operation: "verifySessionToken",
      reason,
      error: err instanceof Error ? err : String(err),
    });

    return null;
  }
}

/**
 * Set session cookie on the response.
 */
export function setSessionCookie(c: Context, token: string): void {
  setCookie(c, COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
  });
}

/**
 * Clear session cookie.
 */
export function clearSessionCookie(c: Context): void {
  deleteCookie(c, COOKIE_NAME, { path: "/" });
}

/**
 * Auth middleware — validates JWT from cookie and sets user info on context.
 */
export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const token = getCookie(c, COOKIE_NAME);

  if (!token) {
    logger.debug("auth: no session cookie present", {
      service: "auth",
      operation: "authMiddleware",
    });
    return c.json({ error: "Unauthorized" }, 401);
  }

  const payload = await verifySessionToken(token);
  if (!payload) {
    clearSessionCookie(c);
    return c.json({ error: "Invalid or expired session" }, 401);
  }

  // Attach user info to context for downstream handlers
  c.set("userId", payload.userId);
  c.set("userEmail", payload.email);
  c.set("userName", payload.name);

  await next();
};

/**
 * Validate that an email belongs to the allowed domain.
 */
export function isAllowedDomain(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  return domain === env.ALLOWED_DOMAIN.toLowerCase();
}
