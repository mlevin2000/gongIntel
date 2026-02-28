interface Props {
  data: Record<string, number>;
}

const COLORS = [
  "bg-brand-500",
  "bg-green-500",
  "bg-yellow-500",
  "bg-purple-500",
  "bg-red-500",
  "bg-indigo-500",
];

export default function TalkRatio({ data }: Props) {
  if (!data || Object.keys(data).length === 0) {
    return <p className="text-gray-400 text-sm">No talk ratio data</p>;
  }

  const entries = Object.entries(data).sort(([, a], [, b]) => b - a);

  return (
    <div className="space-y-2">
      {entries.map(([speaker, percentage], i) => (
        <div key={speaker}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-600 truncate max-w-[150px]">
              {speaker}
            </span>
            <span className="text-xs font-mono text-gray-500">
              {percentage}%
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className={`h-2 rounded-full ${COLORS[i % COLORS.length]}`}
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
