import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { SentimentPoint } from "../lib/types";

interface Props {
  data: SentimentPoint[];
}

export default function SentimentChart({ data }: Props) {
  if (!data || data.length === 0) {
    return <p className="text-gray-400 text-sm">No sentiment data available</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="timestamp"
          tick={{ fontSize: 12, fill: "#6b7280" }}
        />
        <YAxis
          domain={[-1, 1]}
          ticks={[-1, -0.5, 0, 0.5, 1]}
          tick={{ fontSize: 12, fill: "#6b7280" }}
        />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const point = payload[0].payload as SentimentPoint;
            return (
              <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg">
                <p className="text-sm font-medium">{point.timestamp}</p>
                <p className="text-sm text-gray-600">{point.label}</p>
                <p className="text-sm font-mono">
                  Score: {point.score.toFixed(2)}
                </p>
              </div>
            );
          }}
        />
        <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="3 3" />
        <Line
          type="monotone"
          dataKey="score"
          stroke="#0c93e7"
          strokeWidth={2}
          dot={{ r: 4, fill: "#0c93e7" }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
