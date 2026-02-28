import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { apiClient } from "../lib/api";
import CallList from "../components/CallList";
import AnalyzeButton from "../components/AnalyzeButton";
import { analysisToMarkdown } from "../lib/markdown-export";
import { downloadMarkdown } from "../lib/download";
import { marked } from "marked";
import type { CallSummary, Analysis } from "../lib/types";

const MAX_POLL_ITERATIONS = 90;
const GONG_BASE_URL = import.meta.env.VITE_GONG_BASE_URL || "https://us-3800.app.gong.io/call?id=";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function Dashboard() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [calls, setCalls] = useState<CallSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [selectedCallIds, setSelectedCallIds] = useState<Set<string>>(new Set());
  const [fromDate, setFromDate] = useState(searchParams.get("from") || daysAgoStr(7));
  const [toDate, setToDate] = useState(searchParams.get("to") || todayStr());

  const [activeCall, setActiveCall] = useState<CallSummary | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [markdownContent, setMarkdownContent] = useState<string>("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analysisPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const fetchCalls = () => {
    setLoading(true);
    setError(null);
    setSelectedCallIds(new Set());
    apiClient
      .getCalls({ from: fromDate, to: toDate })
      .then((fetchedCalls) => {
        setCalls(fetchedCalls);
        setSearched(true);
      })
      .catch((err) => {
        if (err.status === 401) {
          window.location.href = "/login";
          return;
        }
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    if (searchParams.has("from") && searchParams.has("to")) {
      fetchCalls();
    }
  }, []);

  const handleSearchClick = () => {
    setSearchParams({ from: fromDate, to: toDate });
    fetchCalls();
  };

  const handleCallClick = (call: CallSummary) => {
    setActiveCall(call);
    setSelectedCallIds(new Set());
    
    fetchAnalysis(call.id);
  };

  const fetchAnalysis = async (callId: string) => {
    setAnalysis(null);
    setMarkdownContent("");
    setAnalysisError(null);
    
    const analysisData = await apiClient.getAnalysis(callId).catch(() => null);
    
    if (analysisData) {
      setAnalysis(analysisData);
      if (analysisData.status === "completed") {
        const md = analysisToMarkdown(analysisData);
        setMarkdownContent(marked.parse(md));
      } else if (analysisPanelRef.current) {
        analysisPanelRef.current.scrollIntoView({ behavior: "smooth" });
      }
    }
  };

  const handleAnalyze = async () => {
    if (!activeCall) return;
    
    setAnalyzing(true);
    setAnalysisError(null);

    try {
      await apiClient.triggerAnalysis(activeCall.id);

      let iterations = 0;
      pollRef.current = setInterval(async () => {
        iterations++;

        if (iterations >= MAX_POLL_ITERATIONS) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setAnalyzing(false);
          setAnalysisError("Analysis is taking longer than expected. Please refresh the page.");
          return;
        }

        try {
          const status = await apiClient.getAnalysisStatus(activeCall.id);
          if (status.status === "completed" || status.status === "failed") {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setAnalyzing(false);

            if (status.status === "failed") {
              setAnalysisError(status.error || "Analysis failed");
            } else {
              fetchAnalysis(activeCall.id);
              if (analysisPanelRef.current) {
                analysisPanelRef.current.scrollIntoView({ behavior: "smooth" });
              }
            }
          }
        } catch (pollErr: any) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setAnalyzing(false);
          if (pollErr.status === 401) {
            window.location.href = "/login";
          } else {
            setAnalysisError(pollErr.message || "Lost connection while checking analysis status");
          }
        }
      }, 2000);
    } catch (triggerErr: any) {
      setAnalyzing(false);
      if (triggerErr.status === 401) {
        window.location.href = "/login";
      } else {
        setAnalysisError(triggerErr.message || "Failed to start analysis");
      }
    }
  };

  const handleDownload = () => {
    if (!analysis || !activeCall) return;
    const markdown = analysisToMarkdown(analysis);
    const filename = `call-analysis-${activeCall.id}.md`;
    downloadMarkdown(markdown, filename);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedCallIds(new Set(calls.map((c) => c.id)));
    } else {
      setSelectedCallIds(new Set());
    }
  };

  const handleSelectChange = (callId: string, checked: boolean) => {
    const newSelected = new Set(selectedCallIds);
    if (checked) {
      newSelected.add(callId);
    } else {
      newSelected.delete(callId);
    }
    setSelectedCallIds(newSelected);
  };

  const handleBulkAnalyze = async () => {
    setLoading(true);
    for (const callId of selectedCallIds) {
      try {
        await apiClient.triggerAnalysis(callId);
      } catch (err) {
        console.error(`Failed to trigger analysis for ${callId}:`, err);
      }
    }
    setLoading(false);
    setSelectedCallIds(new Set());
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b-2 border-brand-600 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Gong Call Intelligence (Sales Call Assistant)</h1>
          <button
            onClick={() => (window.location.href = "/auth/logout")}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Sign out
          </button>
        </div>
      </header>
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-4 mb-8 bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center gap-2">
            <label htmlFor="from" className="text-sm font-medium text-gray-700">
              From
            </label>
            <input
              id="from"
              type="date"
              value={fromDate}
              max={toDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="to" className="text-sm font-medium text-gray-700">
              To
            </label>
            <input
              id="to"
              type="date"
              value={toDate}
              min={fromDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <button
            onClick={handleSearchClick}
            disabled={loading}
            className="bg-brand-600 text-white px-6 py-2 rounded-md hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-1 font-medium"
          >
            {loading ? "Searching..." : "Search My Calls"}
          </button>
        </div>

        {selectedCallIds.size > 0 && (
          <div className="bg-brand-50 border border-brand-200 rounded-lg p-3 mb-6 flex items-center justify-between">
            <span className="text-brand-700 font-medium">
              {selectedCallIds.size} call(s) selected
            </span>
            <button
              onClick={handleBulkAnalyze}
              disabled={loading}
              className="bg-brand-600 text-white px-4 py-2 rounded-md hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Analyze Selected ({selectedCallIds.size})
            </button>
          </div>
        )}

        {!searched && !loading && (
          <div className="text-center py-16">
            <p className="text-gray-600 text-lg">Select a date range and click Search My Calls to see your calls.</p>
          </div>
        )}

        {searched && !loading && calls.length === 0 && (
          <div className="text-center py-16">
            <p className="text-gray-600 text-lg">No calls found for your account in this date range.</p>
          </div>
        )}

        {loading && !searched && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
          </div>
        )}

        {error && !searched && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 mb-6 shadow-sm">
            {error}
          </div>
        )}

        {searched && !loading && calls.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Calls</h2>
            <CallList
              calls={calls}
              selectedCallIds={selectedCallIds}
              setSelectedCallIds={setSelectedCallIds}
              activeCallId={activeCall?.id || null}
              onCallClick={handleCallClick}
            />
          </div>
        )}

        {activeCall && (
          <div ref={analysisPanelRef} className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">{activeCall.title}</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {activeCall.callDate} &middot; {activeCall.participants.length} participants
                </p>
              </div>
              <div className="flex items-center gap-3">
                {analysis && analysis.status === "completed" ? (
                  <button
                    onClick={handleDownload}
                    className="bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700 transition-colors"
                  >
                    Download as Markdown
                  </button>
                ) : null}
                <AnalyzeButton
                  onAnalyze={handleAnalyze}
                  analyzing={analyzing}
                  hasExisting={!!analysis}
                />
              </div>
            </div>

            <div className="p-8">
              {analysisError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 mb-6">
                  {analysisError}
                </div>
              )}

              {!analysis && !analyzing && (
                <div className="text-center py-12">
                  <p className="text-gray-600 mb-4">
                    This call hasn't been analyzed yet.
                  </p>
                  <AnalyzeButton
                    onAnalyze={handleAnalyze}
                    analyzing={analyzing}
                    hasExisting={false}
                  />
                </div>
              )}

              {analyzing && (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600 mx-auto mb-4" />
                  <p className="text-gray-600">Analyzing call with Claude...</p>
                  <p className="text-sm text-gray-400 mt-2">This may take 15-30 seconds</p>
                </div>
              )}

              {analysis && analysis.status === "completed" && !analyzing && (
                <div className="prose prose-sm max-w-none">
                  <div dangerouslySetInnerHTML={{ __html: markdownContent }} />
                </div>
              )}

              {analysis && analysis.status === "failed" && !analyzing && (
                <div className="text-center py-12">
                  <div className="text-red-600 mb-4">Analysis failed</div>
                  <p className="text-gray-600">{analysis.error}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
