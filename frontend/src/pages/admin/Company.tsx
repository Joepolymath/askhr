import { useEffect, useState } from "react";
import { api } from "../../api/client";

export default function Company() {
  const [content, setContent] = useState("");
  const [saved, setSaved] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    api<{ content: string }>("/api/admin/company").then((r) => {
      setContent(r.content);
      setSaved(r.content);
    });
  }, []);

  async function save() {
    try {
      const r = await api<{ content: string }>("/api/admin/company", { method: "PUT", body: JSON.stringify({ content }) });
      setSaved(r.content);
      setStatus("Saved");
      setTimeout(() => setStatus(null), 2000);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Save failed");
    }
  }

  return (
    <div className="max-w-3xl space-y-3">
      <div>
        <h2 className="text-lg font-semibold">About the company</h2>
        <p className="text-sm text-slate-500">
          Company name, what it does, mission. This text is included with every question, so keep it short and factual.
        </p>
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={12}
        maxLength={20000}
        className="w-full rounded-2xl border border-slate-300 bg-white p-4 text-sm leading-relaxed outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      />
      <div className="flex items-center justify-end gap-3">
        {status && <span className="text-sm text-slate-500">{status}</span>}
        <button
          onClick={save}
          disabled={content === saved}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>
  );
}
