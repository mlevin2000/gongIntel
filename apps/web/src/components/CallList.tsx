import type { CallSummary } from "../lib/types";

const GONG_BASE_URL = import.meta.env.VITE_GONG_BASE_URL || "https://us-3800.app.gong.io/call?id=";

interface Props {
  calls: CallSummary[];
  selectedCallIds: Set<string>;
  setSelectedCallIds: (ids: Set<string>) => void;
  activeCallId: string | null;
  onCallClick: (call: CallSummary) => void;
}

export default function CallList({ calls, selectedCallIds, setSelectedCallIds, activeCallId, onCallClick }: Props) {
  const handleSelectChange = (callId: string, checked: boolean) => {
    const newSelected = new Set(selectedCallIds);
    if (checked) {
      newSelected.add(callId);
    } else {
      newSelected.delete(callId);
    }
    setSelectedCallIds(newSelected);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedCallIds(new Set(calls.map((c) => c.id)));
    } else {
      setSelectedCallIds(new Set());
    }
  };

  if (calls.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No calls found for your account.</p>
      </div>
    );
  }

  const allSelected = calls.length > 0 && selectedCallIds.size === calls.length;
  const someSelected = selectedCallIds.size > 0 && selectedCallIds.size < calls.length;

   return (
     <div className="bg-white rounded-lg border border-gray-200 shadow-sm max-h-[360px] overflow-y-auto">
       <table className="min-w-full divide-y divide-gray-200">
         <thead className="bg-gray-50 sticky top-0 z-10">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) => handleSelectAll(e.target.checked)}
                className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Date
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Title
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Gong Call
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Call Type
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Deal Stage
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {calls.map((call) => {
            const isSelected = selectedCallIds.has(call.id);
            const isActive = activeCallId === call.id;
            return (
              <tr
                key={call.id}
                onClick={() => onCallClick(call)}
                className={`cursor-pointer transition-colors ${
                  isActive
                    ? "bg-brand-50 border-l-4 border-l-brand-600"
                    : "hover:bg-gray-50"
                }`}
                onMouseDown={(e) => {
                  if (e.target instanceof HTMLElement && e.target.tagName === "INPUT") {
                    e.stopPropagation();
                  }
                }}
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => handleSelectChange(call.id, e.target.checked)}
                    className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    onClick={(e) => e.stopPropagation()}
                  />
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {call.callDate}
                </td>
                <td className="px-6 py-4 text-sm font-medium text-gray-900">
                  {call.title}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <a
                    href={`${GONG_BASE_URL}${call.gongCallId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-sm text-brand-600 hover:text-brand-700 hover:underline"
                  >
                    View in Gong
                  </a>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {call.call_type && (
                    <span className="inline-block px-2.5 py-1 rounded-full text-xs font-medium bg-brand-50 text-brand-700">
                      {call.call_type}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {call.deal_stage && (
                    <span className="inline-block px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                      {call.deal_stage}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {call.hasAnalysis ? (
                    <span className="inline-flex items-center gap-1.5 text-sm">
                      <span className="w-2 h-2 bg-green-600 rounded-full"></span>
                      <span className="text-green-700 font-medium">Analyzed</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-sm">
                      <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
                      <span className="text-gray-500">Not analyzed</span>
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
