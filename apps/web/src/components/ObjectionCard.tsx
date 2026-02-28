import type { Objection, ObjectionHandling } from "../lib/types";

interface Props {
  objection: Objection;
  handling?: ObjectionHandling;
}

export default function ObjectionCard({ objection, handling }: Props) {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="bg-red-50 p-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-red-600 uppercase">
            Objection
          </span>
          <span className="text-xs text-gray-400">{objection.timestamp}</span>
        </div>
        <p className="text-sm text-gray-900 font-medium">{objection.text}</p>
        <p className="text-xs text-gray-500 mt-1">
          By {objection.speaker} &middot; {objection.context}
        </p>
      </div>
      {handling && (
        <div className="bg-green-50 p-4 border-t border-gray-200">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-green-600 uppercase">
              Response
            </span>
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-500">Quality:</span>
              {Array.from({ length: 5 }).map((_, i) => (
                <span
                  key={i}
                  className={`text-sm ${
                    i < handling.qualityScore
                      ? "text-yellow-400"
                      : "text-gray-300"
                  }`}
                >
                  *
                </span>
              ))}
            </div>
          </div>
          <p className="text-sm text-gray-900">{handling.response}</p>
          <p className="text-xs text-gray-500 mt-1">
            Technique: {handling.technique}
          </p>
        </div>
      )}
    </div>
  );
}
