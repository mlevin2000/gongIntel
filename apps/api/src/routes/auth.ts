import { Hono } from "hono";
import { google } from "googleapis";
import { env } from "../lib/env";
import { logger } from "../lib/logger";
import {
  createSessionToken,
  setSessionCookie,
  clearSessionCookie,
  isAllowedDomain,
} from "../lib/auth";
import { upsertUser } from "../services/firestore";
import type { UserDoc } from "../lib/types";

export const authRoutes = new Hono();

/**
 * GET /auth/login
 * Redirects user to Google OAuth consent screen.
 */
authRoutes.get("/login", (c) => {
  const oauth2Client = new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["openid", "email", "profile"],
    prompt: "select_account",
  });

  return c.redirect(authUrl);
});

/**
 * GET /auth/callback
 * Handles the OAuth callback from Google.
 */
authRoutes.get("/callback", async (c) => {
  const code = c.req.query("code");
  const error = c.req.query("error");

  if (error) {
    logger.warn("OAuth callback received error from Google", {
      service: "auth",
      operation: "callback",
      error,
    });
    return c.redirect(
      `${env.FRONTEND_URL}/login?error=${encodeURIComponent(error)}`
    );
  }

  if (!code) {
    logger.warn("OAuth callback missing authorization code", {
      service: "auth",
      operation: "callback",
    });
    return c.redirect(
      `${env.FRONTEND_URL}/login?error=${encodeURIComponent("No authorization code received")}`
    );
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
      env.GOOGLE_REDIRECT_URI
    );

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user info
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();

    if (!userInfo.email) {
      logger.warn("OAuth: could not retrieve email from Google", {
        service: "auth",
        operation: "callback",
      });
      return c.redirect(
        `${env.FRONTEND_URL}/login?error=${encodeURIComponent("Could not retrieve email from Google")}`
      );
    }

    // Domain check
    if (!isAllowedDomain(userInfo.email)) {
      logger.warn("OAuth: domain not allowed", {
        service: "auth",
        operation: "callback",
        email: userInfo.email,
      });
      return c.redirect(
        `${env.FRONTEND_URL}/login?error=${encodeURIComponent(`Only @${env.ALLOWED_DOMAIN} accounts are allowed`)}`
      );
    }

    // Generate a unique user ID from email (deterministic)
    const userId = Buffer.from(userInfo.email.toLowerCase())
      .toString("base64url")
      .replace(/[^a-zA-Z0-9]/g, "");

    // Upsert user in Firestore
    const userDoc: UserDoc = {
      id: userId,
      email: userInfo.email.toLowerCase(),
      name: userInfo.name || userInfo.email.split("@")[0],
      avatarUrl: userInfo.picture || undefined,
      createdAt: Date.now(),
      lastLogin: Date.now(),
    };
    await upsertUser(userDoc);

    // Create session token
    const token = await createSessionToken({
      userId,
      email: userDoc.email,
      name: userDoc.name,
    });

    setSessionCookie(c, token);

    logger.info("user authenticated", {
      service: "auth",
      operation: "callback",
      userId,
      email: userDoc.email,
    });

    return c.redirect(env.FRONTEND_URL);
  } catch (err: any) {
    logger.error("auth callback failed", {
      service: "auth",
      operation: "callback",
      error: err,
    });
    return c.redirect(
      `${env.FRONTEND_URL}/login?error=${encodeURIComponent("Authentication failed")}`
    );
  }
});

/**
 * GET /auth/logout
 * Clears session and redirects to login.
 */
authRoutes.get("/logout", (c) => {
  clearSessionCookie(c);
  return c.redirect(`${env.FRONTEND_URL}/login`);
});

/**
 * GET /auth/me
 * Returns the current authenticated user info.
 */
authRoutes.get("/me", async (c) => {
  const { getCookie } = await import("hono/cookie");
  const { verifySessionToken } = await import("../lib/auth");

  const token = getCookie(c, "gong_intel_session");
  if (!token) {
    return c.json({ error: "Not authenticated" }, 401);
  }

  const payload = await verifySessionToken(token);
  if (!payload) {
    return c.json({ error: "Invalid session" }, 401);
  }

  return c.json({
    userId: payload.userId,
    email: payload.email,
    name: payload.name,
  });
});
