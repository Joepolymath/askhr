import type { DocStatus } from "../api/client";

const STYLES: Record<DocStatus, string> = {
  processing: "bg-amber-50 text-amber-700 ring-amber-200",
  ready: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  failed: "bg-red-50 text-red-700 ring-red-200",
};

export default function StatusBadge({ status }: { status: DocStatus }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STYLES[status]}`}>
      {status === "processing" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />}
      {status}
    </span>
  );
}
