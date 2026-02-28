import { google } from "googleapis";
import { env } from "../lib/env";
import { ExternalServiceError } from "../lib/errors";
import { logger } from "../lib/logger";

export interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string;
  md5Checksum?: string;
  size?: string;
}

const SERVICE = "google-drive";

// ---------------------------------------------------------------------------
// Retry helper — retries on 429, 500, 502, 503, 504 with exponential backoff
// ---------------------------------------------------------------------------
async function withRetry<T>(
  operation: string,
  fn: () => Promise<T>,
  maxAttempts = 3
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const status = err?.response?.status ?? err?.code;
      const isRetryable =
        status === 429 ||
        status === 500 ||
        status === 502 ||
        status === 503 ||
        status === 504 ||
        err?.code === "ECONNRESET" ||
        err?.code === "ETIMEDOUT";

      if (!isRetryable || attempt === maxAttempts) {
        break;
      }

      const delayMs = Math.min(1000 * 2 ** (attempt - 1), 8000);
      logger.warn(`retrying ${operation} (attempt ${attempt + 1}/${maxAttempts})`, {
        service: SERVICE,
        operation,
        error: err,
        delayMs,
      });
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  throw new ExternalServiceError(
    SERVICE,
    `${operation} failed after ${maxAttempts} attempts: ${lastError?.message}`,
    lastError
  );
}

// ---------------------------------------------------------------------------
// Drive client
// ---------------------------------------------------------------------------
function getDriveClient() {
  let serviceAccount: any;
  try {
    serviceAccount = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_KEY);
  } catch (err) {
    throw new ExternalServiceError(
      SERVICE,
      "Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY as JSON",
      err as Error
    );
  }

  logger.debug("Drive client initialized", {
    service: SERVICE,
    operation: "getDriveClient",
    serviceAccountEmail: serviceAccount.client_email,
    projectId: serviceAccount.project_id,
  });

  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });

  return google.drive({ version: "v3", auth });
}

export interface ListTranscriptOptions {
  /** User email to search for in transcript content */
  userEmail: string;
}

/**
 * List transcript files in the configured Gong Drive folder.
 * Filters files by fullText search for the user email.
 * Handles pagination to get all matching files.
 */
export async function listTranscriptFiles(
  options: ListTranscriptOptions
): Promise<DriveFile[]> {
  return withRetry("listTranscriptFiles", async () => {
    const drive = getDriveClient();
    const files: DriveFile[] = [];
    let pageToken: string | undefined;

    // Query files containing the user's email in their content
    const q = `'${env.GONG_DRIVE_FOLDER_ID}' in parents and mimeType='text/plain' and trashed=false and fullText contains '${options.userEmail}'`;

    logger.debug("listing transcript files from Drive", {
      service: SERVICE,
      operation: "listTranscriptFiles",
      folderId: env.GONG_DRIVE_FOLDER_ID,
      userEmail: options.userEmail,
    });

    do {
      const response = await drive.files.list({
        q,
        fields:
          "nextPageToken, files(id, name, modifiedTime, md5Checksum, size)",
        pageSize: 100,
        pageToken,
        orderBy: "modifiedTime desc",
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
      });

      logger.debug(`Drive API response: ${response.data.files?.length || 0} files`, {
        service: SERVICE,
        operation: "listTranscriptFiles",
      });

      if (response.data.files) {
        for (const file of response.data.files) {
          if (file.id && file.name) {
            files.push({
              id: file.id,
              name: file.name,
              modifiedTime: file.modifiedTime || "",
              md5Checksum: file.md5Checksum || undefined,
              size: file.size || undefined,
            });
          }
        }
      } else {
        logger.warn("Drive API returned no files array", {
          service: SERVICE,
          operation: "listTranscriptFiles",
          responseKeys: Object.keys(response.data || {}),
        });
      }

      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);

    logger.debug(`listed ${files.length} transcript files`, {
      service: SERVICE,
      operation: "listTranscriptFiles",
    });

    return files;
  });
}

/**
 * Read the content of a file from Google Drive.
 */
export async function readFileContent(fileId: string): Promise<string> {
  return withRetry("readFileContent", async () => {
    const drive = getDriveClient();

    const response = await drive.files.get(
      { fileId, alt: "media", supportsAllDrives: true },
      { responseType: "text" }
    );

    return response.data as string;
  });
}

/**
 * Get file metadata from Google Drive.
 */
export async function getFileMetadata(fileId: string): Promise<DriveFile> {
  return withRetry("getFileMetadata", async () => {
    const drive = getDriveClient();

    const response = await drive.files.get({
      fileId,
      fields: "id, name, modifiedTime, md5Checksum, size",
      supportsAllDrives: true,
    });

    if (!response.data.id || !response.data.name) {
      throw new ExternalServiceError(
        SERVICE,
        `getFileMetadata returned incomplete data for file ${fileId}`
      );
    }

    return {
      id: response.data.id,
      name: response.data.name,
      modifiedTime: response.data.modifiedTime || "",
      md5Checksum: response.data.md5Checksum || undefined,
      size: response.data.size || undefined,
    };
  });
}
