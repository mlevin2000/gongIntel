import { logger } from "./logger";

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

export const env = {
  get GOOGLE_CLIENT_ID() {
    return requireEnv("GOOGLE_CLIENT_ID");
  },
  get GOOGLE_CLIENT_SECRET() {
    return requireEnv("GOOGLE_CLIENT_SECRET");
  },
  get GOOGLE_REDIRECT_URI() {
    return optionalEnv("GOOGLE_REDIRECT_URI", "http://localhost:3000/api/auth/callback");
  },
  get GOOGLE_SERVICE_ACCOUNT_KEY() {
    return requireEnv("GOOGLE_SERVICE_ACCOUNT_KEY");
  },
  get GONG_DRIVE_FOLDER_ID() {
    return requireEnv("GONG_DRIVE_FOLDER_ID");
  },
  get ANTHROPIC_API_KEY() {
    return requireEnv("ANTHROPIC_API_KEY");
  },
  get JWT_SECRET() {
    return requireEnv("JWT_SECRET");
  },
  get ALLOWED_DOMAIN() {
    return optionalEnv("ALLOWED_DOMAIN", "cast.ai");
  },
  get GCP_PROJECT_ID() {
    return requireEnv("GCP_PROJECT_ID");
  },
  get PORT() {
    return parseInt(optionalEnv("PORT", "3000"));
  },
  get FRONTEND_URL() {
    return optionalEnv("FRONTEND_URL", "http://localhost:5173");
  },
};

/**
 * Eagerly validate all required env vars at startup.
 * Call this BEFORE the server starts listening.
 * Throws on the first problem found so the process exits fast.
 */
export function validateAtStartup(): void {
  const required = [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_SERVICE_ACCOUNT_KEY",
    "GONG_DRIVE_FOLDER_ID",
    "ANTHROPIC_API_KEY",
    "JWT_SECRET",
    "GCP_PROJECT_ID",
  ];

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }

  // Validate GOOGLE_SERVICE_ACCOUNT_KEY is parseable JSON
  try {
    JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!);
  } catch {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON. Ensure the value is a properly escaped JSON string."
    );
  }

  // Validate PORT is a number
  const port = process.env.PORT;
  if (port && (isNaN(Number(port)) || Number(port) < 1 || Number(port) > 65535)) {
    throw new Error(`PORT must be a number between 1 and 65535, got: ${port}`);
  }

  logger.info("environment validated", {
    service: "startup",
    operation: "validateAtStartup",
  });
}
