import type { Citation } from "../api/client";

interface Props {
  citations: Citation[];
  openIndex: number | null;
  onToggle: (index: number) => void;
}

function location(c: Citation) {
  return [c.section, c.page ? `p. ${c.page}` : null].filter(Boolean).join(" · ");
}

export default function CitationChips({ citations, openIndex, onToggle }: Props) {
  if (!citations.length) return null;
  const open = citations.find((c) => c.index === openIndex);
  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Sources</div>
      <div className="flex flex-wrap gap-2">
        {citations.map((c) => (
          <button
            key={c.index}
            type="button"
            onClick={() => onToggle(c.index)}
            aria-expanded={openIndex === c.index}
            className={`flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
              openIndex === c.index
                ? "border-brand-500 bg-brand-50 text-brand-700"
                : "border-slate-200 bg-white text-slate-600 hover:border-brand-500"
            }`}
          >
            <span className="font-semibold">{c.index}</span>
            <span className="truncate">{c.document_title}</span>
            {location(c) && <span className="hidden truncate text-slate-400 sm:inline">· {location(c)}</span>}
          </button>
        ))}
      </div>
      {open && (
        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="font-medium text-slate-800">{open.document_title}</div>
          {location(open) && <div className="text-xs text-slate-500">{location(open)}</div>}
          <p className="mt-2 text-slate-600">“{open.snippet}”</p>
        </div>
      )}
    </div>
  );
}
