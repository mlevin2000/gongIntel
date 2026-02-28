import type { Topic } from "../lib/types";

interface Props {
  topics: Topic[];
}

export default function TopicBadges({ topics }: Props) {
  if (!topics || topics.length === 0) {
    return <p className="text-gray-400 text-sm">No topics detected</p>;
  }

  const sorted = [...topics].sort((a, b) => b.relevance - a.relevance);

  return (
    <div className="flex flex-wrap gap-2">
      {sorted.map((topic) => (
        <span
          key={topic.topic}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-brand-50 text-brand-700"
        >
          {topic.topic}
          <span className="text-brand-400">{topic.relevance}/10</span>
        </span>
      ))}
    </div>
  );
}
