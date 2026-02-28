import { Hono } from "hono";
import { authMiddleware } from "../lib/auth";
import { NotFoundError, AuthError } from "../lib/errors";
import { logger } from "../lib/logger";
import {
  getCall,
  createAnalysis,
  updateAnalysis,
  getLatestAnalysis,
  getAnalysisCountForCall,
} from "../services/firestore";
import { readFileContent } from "../services/google-drive";
import { parseTranscript } from "../services/transcript";
import { analyzeTranscript, ANALYSIS_MODEL } from "../services/analyzer";
import { isUserParticipant } from "../services/matcher";
import type { AnalysisDoc } from "../lib/types";
import type { AppEnv } from "../lib/hono-types";

export const analysisRoutes = new Hono<AppEnv>();

analysisRoutes.use("*", authMiddleware);

/** Maximum time (ms) a background analysis is allowed to run. */
const BACKGROUND_ANALYSIS_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

/**
 * POST /api/calls/:callId/analyze
 * Trigger analysis (or re-analysis) for a call.
 * Returns immediately with analysis ID; processing happens in background.
 */
analysisRoutes.post("/calls/:callId/analyze", async (c) => {
  const callId = c.req.param("callId");
  const userId = c.get("userId");
  const userEmail = c.get("userEmail");
  const requestId = c.get("requestId");

  const callDoc = await getCall(callId);
  if (!callDoc) {
    throw new NotFoundError("Call", callId);
  }

  if (!isUserParticipant(callDoc.participants, userEmail)) {
    throw new AuthError("Access denied", 403);
  }

  const existingCount = await getAnalysisCountForCall(callId, userId);
  const version = existingCount + 1;
  const analysisId = `${callId}_${userId}_v${version}`;

  const analysisDoc: AnalysisDoc = {
    id: analysisId,
    callId,
    userId,
    version,
    status: "pending",
    modelUsed: ANALYSIS_MODEL,
    createdAt: Date.now(),
  };

  await createAnalysis(analysisDoc);

  logger.info("analysis triggered", {
    service: "analysis",
    operation: "triggerAnalysis",
    analysisId,
    callId,
    userId,
    requestId,
  });

  // Run analysis in background — attach .catch() so rejection is never unhandled
  runAnalysisInBackground(analysisId, callDoc.driveFileId, callDoc.filename).catch(
    (err) => {
      logger.error("background analysis unhandled rejection", {
        service: "analysis",
        analysisId,
        error: err,
      });
    }
  );

  return c.json({ analysisId });
});

/**
 * GET /api/calls/:callId/analysis
 * Get the latest completed analysis for a call.
 */
analysisRoutes.get("/calls/:callId/analysis", async (c) => {
  const callId = c.req.param("callId");
  const userId = c.get("userId");
  const userEmail = c.get("userEmail");

  const callDoc = await getCall(callId);
  if (!callDoc) {
    throw new NotFoundError("Call", callId);
  }

  if (!isUserParticipant(callDoc.participants, userEmail)) {
    throw new AuthError("Access denied", 403);
  }

  const analysis = await getLatestAnalysis(callId, userId);
  if (!analysis) {
    throw new NotFoundError("Analysis");
  }

  return c.json(analysis);
});

/**
 * GET /api/calls/:callId/analysis/status
 * Poll the status of the latest analysis.
 */
analysisRoutes.get("/calls/:callId/analysis/status", async (c) => {
  const callId = c.req.param("callId");
  const userId = c.get("userId");

  const analysis = await getLatestAnalysis(callId, userId);
  if (!analysis) {
    return c.json({ status: "none" });
  }

  return c.json({
    status: analysis.status,
    error: analysis.error,
  });
});

/**
 * Background analysis runner.
 * Reads transcript from Drive, sends to Claude, stores results.
 * Has an overall timeout of BACKGROUND_ANALYSIS_TIMEOUT_MS.
 */
async function runAnalysisInBackground(
  analysisId: string,
  driveFileId: string,
  filename: string
): Promise<void> {
  // Wrap in a timeout so it doesn't run forever
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error(`Background analysis timed out after ${BACKGROUND_ANALYSIS_TIMEOUT_MS}ms`)),
      BACKGROUND_ANALYSIS_TIMEOUT_MS
    )
  );

  const analysisPromise = (async () => {
    // Mark as processing
    await updateAnalysis(analysisId, { status: "processing" });

    // Read transcript from Drive
    const content = await readFileContent(driveFileId);
    const parsed = parseTranscript(content, filename);

    // Run Claude analysis
    const result = await analyzeTranscript(parsed);

    // Store completed analysis
    await updateAnalysis(analysisId, {
      status: "completed",
      result: result,
    });

    logger.info("analysis completed", {
      service: "analysis",
      operation: "runAnalysisInBackground",
      analysisId,
    });
  })();

  try {
    await Promise.race([analysisPromise, timeoutPromise]);
  } catch (err: any) {
    logger.error("background analysis failed", {
      service: "analysis",
      operation: "runAnalysisInBackground",
      analysisId,
      error: err,
    });
    await updateAnalysis(analysisId, {
      status: "failed",
      error: err.message || "Unknown error",
    }).catch((updateErr) => {
      logger.error("failed to update analysis status to failed", {
        service: "analysis",
        analysisId,
        error: updateErr,
      });
    });
  }
}
