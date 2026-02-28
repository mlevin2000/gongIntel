/**
 * Structured JSON logger for GongIntel API.
 *
 * Outputs one JSON object per line to stdout/stderr.
 * In production Cloud Run captures these automatically.
 *
 * Usage:
 *   import { logger } from "./logger";
 *   logger.info("call synced", { service: "google-drive", callId: "abc" });
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  service?: string;
  operation?: string;
  requestId?: string;
  userId?: string;
  callId?: string;
  analysisId?: string;
  error?: Error | string;
  [key: string]: unknown;
}

const LEVEL_SEVERITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

// Default to "info" in production, "debug" in development
const MIN_LEVEL: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) ||
  (process.env.NODE_ENV === "production" ? "info" : "debug");

function shouldLog(level: LogLevel): boolean {
  return LEVEL_SEVERITY[level] >= LEVEL_SEVERITY[MIN_LEVEL];
}

function serializeError(err: Error | string): Record<string, unknown> {
  if (typeof err === "string") return { message: err };
  return {
    message: err.message,
    name: err.name,
    stack: err.stack,
    ...(err as any).code && { code: (err as any).code },
    ...(err as any).statusCode && { statusCode: (err as any).statusCode },
    ...(err as any).service && { service: (err as any).service },
  };
}

function emit(level: LogLevel, message: string, ctx?: LogContext): void {
  if (!shouldLog(level)) return;

  const entry: Record<string, unknown> = {
    level,
    msg: message,
    ts: new Date().toISOString(),
  };

  if (ctx) {
    const { error, ...rest } = ctx;
    Object.assign(entry, rest);
    if (error) {
      entry.error = serializeError(error);
    }
  }

  const output = JSON.stringify(entry);
  if (level === "error" || level === "warn") {
    process.stderr.write(output + "\n");
  } else {
    process.stdout.write(output + "\n");
  }
}

export const logger = {
  debug(message: string, ctx?: LogContext) {
    emit("debug", message, ctx);
  },
  info(message: string, ctx?: LogContext) {
    emit("info", message, ctx);
  },
  warn(message: string, ctx?: LogContext) {
    emit("warn", message, ctx);
  },
  error(message: string, ctx?: LogContext) {
    emit("error", message, ctx);
  },
};
