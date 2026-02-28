import type {
  CallSummary,
  CallDetail,
  Analysis,
  AnalysisStatus,
} from "./types";

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Extract a human-readable error message from the response body.
 * Handles both JSON `{ error: "msg" }` and plain text bodies.
 */
function parseErrorBody(body: string): string {
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed.error === "string") return parsed.error;
  } catch {
    // Not JSON — use raw text
  }
  return body || "Unknown error";
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    ...options,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "Unknown error");
    throw new ApiError(parseErrorBody(body), res.status);
  }

  return res.json();
}

export const apiClient = {
  getCalls(params?: { from?: string; to?: string }): Promise<CallSummary[]> {
    const search = new URLSearchParams();
    if (params?.from) search.set("from", params.from);
    if (params?.to) search.set("to", params.to);
    const qs = search.toString();
    return request(`/api/calls${qs ? `?${qs}` : ""}`);
  },

  getCall(id: string): Promise<CallDetail> {
    return request(`/api/calls/${id}`);
  },

  triggerAnalysis(callId: string): Promise<{ analysisId: string }> {
    return request(`/api/calls/${callId}/analyze`, { method: "POST" });
  },

  getAnalysis(callId: string): Promise<Analysis> {
    return request(`/api/calls/${callId}/analysis`);
  },

  getAnalysisStatus(callId: string): Promise<AnalysisStatus> {
    return request(`/api/calls/${callId}/analysis/status`);
  },

  getExportUrl(callId: string, format: "md" | "pdf"): string {
    return `/api/calls/${callId}/export?format=${format}`;
  },
};
