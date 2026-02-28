interface Props {
  onAnalyze: () => void;
  analyzing: boolean;
  hasExisting: boolean;
}

export default function AnalyzeButton({
  onAnalyze,
  analyzing,
  hasExisting,
}: Props) {
  return (
    <button
      onClick={onAnalyze}
      disabled={analyzing}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        analyzing
          ? "bg-gray-100 text-gray-400 cursor-not-allowed"
          : "bg-brand-600 text-white hover:bg-brand-700"
      }`}
    >
      {analyzing
        ? "Analyzing..."
        : hasExisting
        ? "Re-analyze"
        : "Analyze Call"}
    </button>
  );
}
