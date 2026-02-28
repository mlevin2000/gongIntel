import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import { authRoutes } from "./routes/auth";
import { callRoutes } from "./routes/calls";
import { analysisRoutes } from "./routes/analysis";
import { exportRoutes } from "./routes/export";
import { logger } from "./lib/logger";
import { AppError } from "./lib/errors";
import { validateAtStartup } from "./lib/env";
import type { AppEnv } from "./lib/hono-types";

// ---------------------------------------------------------------------------
// Validate environment before anything else
// ---------------------------------------------------------------------------
try {
  validateAtStartup();
} catch (err) {
  logger.error("startup validation failed", {
    service: "startup",
    error: err as Error,
  });
  process.exit(1);
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
const app = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// Request ID middleware — generates a unique ID per request for log correlation
// ---------------------------------------------------------------------------
app.use("*", async (c, next) => {
  const requestId = crypto.randomUUID();
  c.header("X-Request-Id", requestId);
  c.set("requestId", requestId);
  await next();
});

// Middleware
app.use("*", honoLogger());
app.use(
  "*",
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  })
);

// ---------------------------------------------------------------------------
// Global 404 handler
// ---------------------------------------------------------------------------
app.notFound((c) => {
  return c.json(
    {
      error: "Not found",
      path: c.req.path,
      requestId: c.get("requestId") || undefined,
    },
    404
  );
});

// ---------------------------------------------------------------------------
// Global error handler — catches anything thrown from routes/middleware
// ---------------------------------------------------------------------------
app.onError((err, c) => {
  const requestId = c.get("requestId");

  if (err instanceof AppError) {
    // Operational error — expected, log at warn level
    logger.warn(err.message, {
      service: "http",
      operation: c.req.method + " " + c.req.path,
      requestId,
      error: err,
    });

    return c.json(
      {
        error: err.message,
        code: err.code,
        requestId,
      },
      err.statusCode as any
    );
  }

  // Unexpected error — programmer bug or unknown failure
  logger.error("unhandled error", {
    service: "http",
    operation: c.req.method + " " + c.req.path,
    requestId,
    error: err,
  });

  return c.json(
    {
      error: "Internal server error",
      requestId,
    },
    500
  );
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get("/health", (c) => c.json({ status: "ok" }));

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.route("/auth", authRoutes);
app.route("/api/calls", callRoutes);
app.route("/api", analysisRoutes);
app.route("/api", exportRoutes);

// ---------------------------------------------------------------------------
// Process-level handlers — last resort
// ---------------------------------------------------------------------------
process.on("uncaughtException", (err) => {
  logger.error("uncaught exception — shutting down", {
    service: "process",
    error: err,
  });
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error("unhandled promise rejection", {
    service: "process",
    error: reason instanceof Error ? reason : String(reason),
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const port = parseInt(process.env.PORT || "3000");

logger.info(`GongIntel API starting on port ${port}`, {
  service: "startup",
  port,
});

export default {
  port,
  fetch: app.fetch,
  idleTimeout: 120,
};
