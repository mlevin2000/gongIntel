import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { env } from "../lib/env";
import { ExternalServiceError } from "../lib/errors";
import { logger } from "../lib/logger";
import type { UserDoc, CallDoc, AnalysisDoc } from "../lib/types";

const SERVICE = "firestore";

// Initialize Firebase Admin SDK
function getDb() {
  if (getApps().length === 0) {
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
    initializeApp({
      credential: cert(serviceAccount),
      projectId: env.GCP_PROJECT_ID,
    });
  }
  return getFirestore();
}

/**
 * Wraps a Firestore operation in try/catch and throws ExternalServiceError.
 */
async function withFirestore<T>(
  operation: string,
  fn: (db: FirebaseFirestore.Firestore) => Promise<T>
): Promise<T> {
  try {
    const db = getDb();
    return await fn(db);
  } catch (err: any) {
    // Don't double-wrap ExternalServiceError
    if (err instanceof ExternalServiceError) throw err;

    logger.error(`${operation} failed`, {
      service: SERVICE,
      operation,
      error: err,
    });
    throw new ExternalServiceError(
      SERVICE,
      `${operation} failed: ${err.message}`,
      err
    );
  }
}

// ===== Users =====

export async function upsertUser(user: UserDoc): Promise<void> {
  return withFirestore("upsertUser", async (db) => {
    await db.collection("users").doc(user.id).set(user, { merge: true });
  });
}

export async function getUser(userId: string): Promise<UserDoc | null> {
  return withFirestore("getUser", async (db) => {
    const doc = await db.collection("users").doc(userId).get();
    return doc.exists ? (doc.data() as UserDoc) : null;
  });
}

export async function getUserByEmail(
  email: string
): Promise<UserDoc | null> {
  return withFirestore("getUserByEmail", async (db) => {
    const snapshot = await db
      .collection("users")
      .where("email", "==", email.toLowerCase())
      .limit(1)
      .get();
    return snapshot.empty ? null : (snapshot.docs[0].data() as UserDoc);
  });
}

// ===== Calls =====

export async function upsertCall(call: CallDoc): Promise<void> {
  return withFirestore("upsertCall", async (db) => {
    await db.collection("calls").doc(call.id).set(call, { merge: true });
  });
}

export async function getCall(callId: string): Promise<CallDoc | null> {
  return withFirestore("getCall", async (db) => {
    const doc = await db.collection("calls").doc(callId).get();
    return doc.exists ? (doc.data() as CallDoc) : null;
  });
}

export async function getCallByDriveFileId(
  driveFileId: string
): Promise<CallDoc | null> {
  return withFirestore("getCallByDriveFileId", async (db) => {
    const snapshot = await db
      .collection("calls")
      .where("driveFileId", "==", driveFileId)
      .limit(1)
      .get();
    return snapshot.empty ? null : (snapshot.docs[0].data() as CallDoc);
  });
}

export async function getCallsForUser(
  userEmail: string
): Promise<CallDoc[]> {
  return withFirestore("getCallsForUser", async (db) => {
    const snapshot = await db
      .collection("calls")
      .orderBy("callDate", "desc")
      .get();

    const normalizedEmail = userEmail.toLowerCase().trim();
    return snapshot.docs
      .map((doc) => doc.data() as CallDoc)
      .filter((call) =>
        call.participants.some(
          (p) => p.email.toLowerCase().trim() === normalizedEmail
        )
      );
  });
}

export async function getAllCalls(): Promise<CallDoc[]> {
  return withFirestore("getAllCalls", async (db) => {
    const snapshot = await db
      .collection("calls")
      .orderBy("callDate", "desc")
      .get();
    return snapshot.docs.map((doc) => doc.data() as CallDoc);
  });
}

// ===== Analyses =====

export async function createAnalysis(
  analysis: AnalysisDoc
): Promise<void> {
  return withFirestore("createAnalysis", async (db) => {
    await db.collection("analyses").doc(analysis.id).set(analysis);
  });
}

export async function updateAnalysis(
  analysisId: string,
  updates: Partial<AnalysisDoc>
): Promise<void> {
  return withFirestore("updateAnalysis", async (db) => {
    await db.collection("analyses").doc(analysisId).update(updates);
  });
}

export async function getLatestAnalysis(
  callId: string,
  userId: string
): Promise<AnalysisDoc | null> {
  return withFirestore("getLatestAnalysis", async (db) => {
    const snapshot = await db
      .collection("analyses")
      .where("callId", "==", callId)
      .where("userId", "==", userId)
      .orderBy("version", "desc")
      .limit(1)
      .get();
    return snapshot.empty ? null : (snapshot.docs[0].data() as AnalysisDoc);
  });
}

export async function getAnalysis(
  analysisId: string
): Promise<AnalysisDoc | null> {
  return withFirestore("getAnalysis", async (db) => {
    const doc = await db.collection("analyses").doc(analysisId).get();
    return doc.exists ? (doc.data() as AnalysisDoc) : null;
  });
}

export async function getAnalysisCountForCall(
  callId: string,
  userId: string
): Promise<number> {
  return withFirestore("getAnalysisCountForCall", async (db) => {
    const snapshot = await db
      .collection("analyses")
      .where("callId", "==", callId)
      .where("userId", "==", userId)
      .count()
      .get();
    return snapshot.data().count;
  });
}
