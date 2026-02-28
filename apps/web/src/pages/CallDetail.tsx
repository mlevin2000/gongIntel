import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiClient } from "../lib/api";
import AnalyzeButton from "../components/AnalyzeButton";
import { analysisToMarkdown } from "../lib/markdown-export";
import { downloadMarkdown } from "../lib/download";
import { marked } from "marked";
import type { CallDetail as CallDetailType, Analysis } from "../lib/types";

const MAX_POLL_ITERATIONS = 90;

export default function CallDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [call, setCall] = useState<CallDetailType | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [markdownContent, setMarkdownContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const fetchData = async () => {
    if (!id) return;
    try {
      const [callData, analysisData] = await Promise.all([
        apiClient.getCall(id),
        apiClient.getAnalysis(id).catch(() => null),
      ]);
      setCall(callData);
      setAnalysis(analysisData);
      if (analysisData && analysisData.status === "completed") {
        const md = analysisToMarkdown(analysisData);
        setMarkdownContent(marked.parse(md));
      } else {
        setMarkdownContent("");
      }
      setError(null);
    } catch (err: any) {
      if (err.status === 401) {
        navigate("/login");
        return;
      }
      setError(err.message || "Failed to load call details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  const handleAnalyze = async () => {
    if (!id) return;
    setAnalyzing(true);
    setError(null);

    try {
      await apiClient.triggerAnalysis(id);

      let iterations = 0;
      pollRef.current = setInterval(async () => {
        iterations++;

        if (iterations >= MAX_POLL_ITERATIONS) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setAnalyzing(false);
          setError("Analysis is taking longer than expected. Please refresh the page.");
          return;
        }

        try {
          const status = await apiClient.getAnalysisStatus(id);
          if (status.status === "completed" || status.status === "failed") {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setAnalyzing(false);

            if (status.status === "failed") {
              setError(status.error || "Analysis failed");
            } else {
              fetchData();
            }
          }
        } catch (pollErr: any) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setAnalyzing(false);
          if (pollErr.status === 401) {
            navigate("/login");
          } else {
            setError(pollErr.message || "Lost connection while checking analysis status");
          }
        }
      }, 2000);
    } catch (triggerErr: any) {
      setAnalyzing(false);
      if (triggerErr.status === 401) {
        navigate("/login");
      } else {
        setError(triggerErr.message || "Failed to start analysis");
      }
    }
  };

  const handleDownload = () => {
    if (!analysis || !call) return;
    const markdown = analysisToMarkdown(analysis);
    const filename = `call-analysis-${call.id}.md`;
    downloadMarkdown(markdown, filename);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  if (!call && !error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Call not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <button
            onClick={() => navigate(-1)}
            className="text-sm text-brand-600 hover:text-brand-700 mb-2"
          >
            &larr; Back to calls
          </button>
          {call && (
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{call.title}</h1>
                <p className="text-sm text-gray-500 mt-1">
                  {call.callDate} &middot; {call.participants.length} participants
                </p>
              </div>
              <div className="flex items-center gap-3">
                <AnalyzeButton
                  onAnalyze={handleAnalyze}
                  analyzing={analyzing}
                  hasExisting={!!analysis}
                />
                {analysis && analysis.status === "completed" && (
                  <button
                    onClick={handleDownload}
                    className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700"
                  >
                    Download as Markdown
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 mb-6">
            {error}
          </div>
        )}

        {!analysis && !analyzing && !error && (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <p className="text-gray-500 mb-4">
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
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600 mx-auto mb-4" />
            <p className="text-gray-600">Analyzing call with Claude...</p>
            <p className="text-sm text-gray-400 mt-1">This may take 15-30 seconds</p>
          </div>
        )}

        {analysis && analysis.status === "completed" && !analyzing && (
          <div className="prose prose-sm max-w-none">
            <div dangerouslySetInnerHTML={{ __html: markdownContent }} />
          </div>
        )}
      </main>
    </div>
  );
}
