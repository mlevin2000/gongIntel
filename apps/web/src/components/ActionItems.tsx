import type { ActionItem } from "../lib/types";

interface Props {
  items: ActionItem[];
}

export default function ActionItems({ items }: Props) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div
          key={i}
          className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg"
        >
          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-medium">
            {i + 1}
          </div>
          <div className="flex-1">
            <p className="text-sm text-gray-900">{item.item}</p>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs text-gray-500">
                Owner: <span className="font-medium">{item.owner}</span>
              </span>
              {item.deadline && (
                <span className="text-xs text-gray-500">
                  Due: {item.deadline}
                </span>
              )}
              <span className="text-xs text-gray-400">{item.timestamp}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
