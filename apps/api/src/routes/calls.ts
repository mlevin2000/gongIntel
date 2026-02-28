import { Hono } from "hono";
import { authMiddleware } from "../lib/auth";
import { NotFoundError, AuthError } from "../lib/errors";
import { logger } from "../lib/logger";
import { listTranscriptFiles, readFileContent } from "../services/google-drive";
import { parseTranscript, hashTranscript } from "../services/transcript";
import { isUserParticipant } from "../services/matcher";
import {
  upsertCall,
  getCall,
  getCallsForUser,
  getCallByDriveFileId,
  getLatestAnalysis,
} from "../services/firestore";
import type { CallDoc, CallSummaryResponse } from "../lib/types";
import type { AppEnv } from "../lib/hono-types";

export const callRoutes = new Hono<AppEnv>();

// All routes require authentication
callRoutes.use("*", authMiddleware);



/**
 * GET /api/calls?from=YYYY-MM-DD&to=YYYY-MM-DD
 * List calls where the authenticated user is a participant, filtered by date range.
 * Defaults: from = today-7d, to = today.
 * If only one param is provided the other is filled in automatically.
 */
callRoutes.get("/", async (c) => {
  const userEmail = c.get("userEmail");
  const userId = c.get("userId");
  const requestId = c.get("requestId");

  // --- Parse & default date params ---
  let from = c.req.query("from");
  let to = c.req.query("to");

  // Define date helpers inline (removed from top-level to avoid referencing removed functions)
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  
  function isValidDateString(val: string): boolean {
    if (!DATE_RE.test(val)) return false;
    const d = new Date(`${val}T00:00:00Z`);
    return !isNaN(d.getTime()) && d.toISOString().startsWith(val);
  }

  function todayStr(): string {
    return new Date().toISOString().slice(0, 10);
  }

  function daysAgoStr(days: number, baseDate?: string): string {
    const base = baseDate ? new Date(`${baseDate}T00:00:00Z`) : new Date();
    base.setUTCDate(base.getUTCDate() - days);
    return base.toISOString().slice(0, 10);
  }

  if (!from && !to) {
    to = todayStr();
    from = daysAgoStr(7);
  } else if (from && !to) {
    to = todayStr();
  } else if (!from && to) {
    if (!isValidDateString(to)) {
      return c.json(
        { error: "Invalid date format for 'to'. Expected YYYY-MM-DD." },
        400
      );
    }
    from = daysAgoStr(7, to);
  }

  // --- Validate ---
  if (!isValidDateString(from!)) {
    return c.json(
      { error: "Invalid date format for 'from'. Expected YYYY-MM-DD." },
      400
    );
  }
  if (!isValidDateString(to!)) {
    return c.json(
      { error: "Invalid date format for 'to'. Expected YYYY-MM-DD." },
      400
    );
  }
  if (from! > to!) {
    return c.json(
      { error: "'from' must not be after 'to'." },
      400
    );
  }

  logger.debug("listed calls with date range", {
    service: "calls",
    operation: "listCalls",
    from,
    to,
    requestId,
  });

  // --- Fetch from Drive with email-only filter ---
  const driveFiles = await listTranscriptFiles({ userEmail });

  // Process each file: parse header to check participants, sync to Firestore
  const userCalls: CallSummaryResponse[] = [];

  for (const file of driveFiles) {
    // Quick skip: extract date from filename (e.g., "2026-02-20_Title-12345.txt")
    const filenameDateMatch = file.name.match(/^(\d{4}-\d{2}-\d{2})_/);
    if (filenameDateMatch) {
      const filenameDate = filenameDateMatch[1];
      if (filenameDate < from! || filenameDate > to!) {
        continue;
      }
    }

    // Check if we already have this call in Firestore
    let callDoc = await getCallByDriveFileId(file.id);

    if (!callDoc) {
      // Read and parse the transcript to extract metadata
      const content = await readFileContent(file.id);
      const parsed = parseTranscript(content, file.name);
      const hash = await hashTranscript(content);

      // Create a deterministic call ID from drive file ID
      const callId = Buffer.from(file.id)
        .toString("base64url")
        .replace(/[^a-zA-Z0-9]/g, "")
        .slice(0, 20);

      callDoc = {
        id: callId,
        driveFileId: file.id,
        filename: file.name,
        title: parsed.metadata.title || file.name,
        callDate: parsed.metadata.date || file.modifiedTime.slice(0, 10),
        gongCallId: parsed.metadata.callId,
        participants: parsed.participants,
        transcriptHash: hash,
        createdAt: Date.now(),
      };

      await upsertCall(callDoc);

      logger.debug("synced new call from Drive", {
        service: "calls",
        operation: "listCalls",
        callId: callDoc.id,
        filename: file.name,
        requestId,
      });
    }

    // Precise date filter on the actual call date (may differ from Drive modifiedTime)
    if (callDoc.callDate < from! || callDoc.callDate > to!) {
      continue;
    }

    // Filter: only include calls where user is a participant
    if (!isUserParticipant(callDoc.participants, userEmail)) {
      continue;
    }

    // Check if analysis exists for this user
    const analysis = await getLatestAnalysis(callDoc.id, userId);

    userCalls.push({
      id: callDoc.id,
      title: callDoc.title,
      callDate: callDoc.callDate,
      participants: callDoc.participants,
      hasAnalysis: !!analysis && analysis.status === "completed",
      call_type:
        analysis?.status === "completed" && analysis.result?.call_type
          ? analysis.result.call_type
          : undefined,
      deal_stage:
        analysis?.status === "completed" && analysis.result?.deal_stage
          ? analysis.result.deal_stage
          : undefined,
      gongCallId: callDoc.gongCallId,
    });
  }

  logger.info("listed calls for user", {
    service: "calls",
    operation: "listCalls",
    userId,
    from,
    to,
    totalFilesFetched: driveFiles.length,
    userCallCount: userCalls.length,
    requestId,
  });

  return c.json(userCalls);
});

/**
 * GET /api/calls/:id
 * Get call detail by ID.
 */
callRoutes.get("/:id", async (c) => {
  const callId = c.req.param("id");
  const userEmail = c.get("userEmail");

  const callDoc = await getCall(callId);
  if (!callDoc) {
    throw new NotFoundError("Call", callId);
  }

  // Security: verify user is a participant
  if (!isUserParticipant(callDoc.participants, userEmail)) {
    throw new AuthError("Access denied", 403);
  }

  return c.json({
    id: callDoc.id,
    driveFileId: callDoc.driveFileId,
    filename: callDoc.filename,
    title: callDoc.title,
    callDate: callDoc.callDate,
    gongCallId: callDoc.gongCallId,
    participants: callDoc.participants,
  });
});
