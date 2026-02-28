import { apiClient } from "../lib/api";

interface Props {
  callId: string;
}

export default function ExportButton({ callId }: Props) {
  return (
    <div className="relative group">
      <button className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors">
        Export
      </button>
      <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
        <a
          href={apiClient.getExportUrl(callId, "md")}
          className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-t-lg"
          download
        >
          Markdown (.md)
        </a>
        <a
          href={apiClient.getExportUrl(callId, "pdf")}
          className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-b-lg"
          download
        >
          PDF
        </a>
      </div>
    </div>
  );
}
