import { useEffect, useState } from "react";
import { api, type ChatLog, type Insights as InsightsData } from "../../api/client";

type Tab = "unanswered" | "rated" | "recent";

const TABS: { key: Tab; label: string; hint: string }[] = [
  { key: "unanswered", label: "Unanswered", hint: "Questions the bot couldn't answer — gaps in the knowledge base." },
  { key: "rated", label: "Feedback", hint: "Answers employees rated." },
  { key: "recent", label: "Recent", hint: "All recent questions." },
];

function Row({ log }: { log: ChatLog }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="px-4 py-3">
      <button onClick={() => setOpen(!open)} className="flex w-full items-start justify-between gap-4 text-left">
        <div className="min-w-0">
          <div className="font-medium text-slate-800">{log.question}</div>
          <div className="mt-0.5 text-xs text-slate-400">
            {log.employee_name ?? "Anonymous"} · {new Date(log.created_at).toLocaleString()}
            {log.top_similarity != null && ` · best match ${log.top_similarity.toFixed(2)}`}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-sm">
          {log.unanswered && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">unanswered</span>}
          {log.rating === 1 && <span title="Helpful">👍</span>}
          {log.rating === -1 && <span title="Not helpful">👎</span>}
        </div>
      </button>
      {open && (
        <div className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
          <p className="whitespace-pre-wrap">{log.answer || "(no answer)"}</p>
          {log.citations.length > 0 && (
            <p className="mt-2 text-xs text-slate-400">
              Sources: {log.citations.map((c) => `[${c.index}] ${c.document_title}${c.section ? ` — ${c.section}` : ""}`).join("; ")}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

export default function Insights() {
  const [data, setData] = useState<InsightsData | null>(null);
  const [tab, setTab] = useState<Tab>("unanswered");

  useEffect(() => {
    api<InsightsData>("/api/admin/insights").then(setData);
  }, []);

  if (!data) return <p className="text-slate-400">Loading…</p>;

  const stats = [
    { label: "Questions", value: data.total_questions },
    { label: "Unanswered", value: data.unanswered_count },
    { label: "👍", value: data.thumbs_up },
    { label: "👎", value: data.thumbs_down },
  ];
  const rows = data[tab];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-2xl font-semibold">{s.value}</div>
            <div className="text-sm text-slate-500">{s.label}</div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${tab === t.key ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="text-sm text-slate-500">{TABS.find((t) => t.key === tab)?.hint}</p>
      <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
        {rows.length === 0 && <li className="px-4 py-8 text-center text-slate-400">Nothing here yet.</li>}
        {rows.map((log) => (
          <Row key={log.id} log={log} />
        ))}
      </ul>
    </div>
  );
}
