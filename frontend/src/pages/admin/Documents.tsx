import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type Category, type DocumentOut } from "../../api/client";
import { useConfirm } from "../../components/ConfirmDialog";
import StatusBadge from "../../components/StatusBadge";

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "policy", label: "Policy" },
  { value: "handbook", label: "Handbook" },
  { value: "org_info", label: "Org info" },
  { value: "other", label: "Other" },
];
const ACCEPT = ".pdf,.docx,.txt,.md";
const MAX_BYTES = 20 * 1024 * 1024;
const POLL_MS = 2000;

interface Pending {
  key: string;
  file: File;
  title: string;
  category: Category;
  error?: string;
}

function titleFromFilename(name: string) {
  const base = name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return base.replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function Documents() {
  const [docs, setDocs] = useState<DocumentOut[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<DocumentOut | null>(null);
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async () => {
    try {
      setDocs(await api<DocumentOut[]>("/api/admin/documents"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load documents");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while anything is still processing.
  const anyProcessing = docs.some((d) => d.status === "processing");
  useEffect(() => {
    if (!anyProcessing) return;
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [anyProcessing, load]);

  function addFiles(files: FileList | File[]) {
    const items: Pending[] = Array.from(files).map((file) => ({
      key: `${file.name}-${file.size}-${Math.random()}`,
      file,
      title: titleFromFilename(file.name),
      category: "policy",
      error: file.size > MAX_BYTES ? "Larger than 20 MB" : !/\.(pdf|docx|txt|md)$/i.test(file.name) ? "Unsupported type" : undefined,
    }));
    setPending((p) => [...p, ...items]);
  }

  async function send(file: File, title: string, category: Category, replace: boolean) {
    const form = new FormData();
    form.append("file", file);
    form.append("title", title);
    form.append("category", category);
    form.append("replace", String(replace));
    return api<DocumentOut>("/api/admin/documents", { method: "POST", body: form });
  }

  async function uploadOne(p: Pending): Promise<string | null> {
    try {
      await send(p.file, p.title, p.category, false);
      return null;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const existing = (e.body as { existing: DocumentOut }).existing;
        const ok = await confirm({
          title: "Replace the existing version?",
          body: (
            <>
              An active document titled <strong>{existing.title}</strong> ({existing.original_filename}, uploaded{" "}
              {formatDate(existing.uploaded_at)}) already exists. The old version will be marked inactive once the new one
              finishes processing.
            </>
          ),
          confirmLabel: "Replace",
        });
        if (!ok) return "Skipped — kept existing version";
        try {
          await send(p.file, p.title, p.category, true);
          return null;
        } catch (e2) {
          return e2 instanceof Error ? e2.message : "Upload failed";
        }
      }
      return e instanceof Error ? e.message : "Upload failed";
    }
  }

  async function uploadAll() {
    setUploading(true);
    const remaining: Pending[] = [];
    for (const p of pending) {
      if (p.error || !p.title.trim()) {
        remaining.push({ ...p, error: p.error ?? "Title is required" });
        continue;
      }
      const err = await uploadOne(p);
      if (err) remaining.push({ ...p, error: err });
      await load();
    }
    setPending(remaining.filter((p) => !p.error?.startsWith("Skipped")));
    setUploading(false);
  }

  async function onReplaceFile(file: File | undefined) {
    const target = replaceTarget.current;
    if (!file || !target) return;
    try {
      await send(file, target.title, target.category, true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    }
    replaceTarget.current = null;
    await load();
  }

  async function toggleActive(d: DocumentOut) {
    try {
      await api(`/api/admin/documents/${d.id}`, { method: "PATCH", body: JSON.stringify({ is_active: !d.is_active }) });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
    await load();
  }

  async function remove(d: DocumentOut) {
    const ok = await confirm({
      title: "Delete document?",
      body: (
        <>
          <strong>{d.title}</strong> and all of its indexed content will be permanently removed.
        </>
      ),
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    await api(`/api/admin/documents/${d.id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="space-y-6">
      {dialog}
      <section>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer.files);
          }}
          onClick={() => fileInput.current?.click()}
          className={`cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition ${
            dragging ? "border-brand-500 bg-brand-50" : "border-slate-300 bg-white hover:border-brand-500"
          }`}
        >
          <p className="font-medium text-slate-700">Drop files here or click to browse</p>
          <p className="mt-1 text-sm text-slate-500">PDF, DOCX, TXT or MD · up to 20 MB each</p>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {pending.length > 0 && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="space-y-3">
              {pending.map((p) => (
                <div key={p.key} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="truncate text-sm text-slate-500 sm:w-48" title={p.file.name}>
                    {p.file.name}
                  </div>
                  <input
                    value={p.title}
                    onChange={(e) => setPending((ps) => ps.map((x) => (x.key === p.key ? { ...x, title: e.target.value, error: undefined } : x)))}
                    placeholder="Title"
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                  />
                  <select
                    value={p.category}
                    onChange={(e) => setPending((ps) => ps.map((x) => (x.key === p.key ? { ...x, category: e.target.value as Category } : x)))}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <button onClick={() => setPending((ps) => ps.filter((x) => x.key !== p.key))} className="text-sm text-slate-400 hover:text-slate-700">
                    Remove
                  </button>
                  {p.error && <div className="text-sm text-red-600 sm:w-48">{p.error}</div>}
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={uploadAll}
                disabled={uploading}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {uploading ? "Uploading…" : `Upload ${pending.length} file${pending.length > 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        )}
      </section>

      {error && (
        <div className="flex items-start justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-4 text-red-500">
            ✕
          </button>
        </div>
      )}

      <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <input
          ref={replaceInput}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            onReplaceFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Chunks</th>
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3">Uploaded</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {docs.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  No documents yet. Upload your first policy above.
                </td>
              </tr>
            )}
            {docs.map((d) => (
              <tr key={d.id} className={d.is_active ? "" : "bg-slate-50/60 text-slate-400"}>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-800">{d.title}</div>
                  <div className="text-xs text-slate-400">{d.original_filename}</div>
                  {d.error_message && <div className="mt-1 text-xs text-red-600">{d.error_message}</div>}
                </td>
                <td className="px-4 py-3">{CATEGORIES.find((c) => c.value === d.category)?.label}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={d.status} />
                </td>
                <td className="px-4 py-3">{d.status === "ready" ? d.chunk_count : "—"}</td>
                <td className="px-4 py-3">
                  <button
                    role="switch"
                    aria-checked={d.is_active}
                    onClick={() => toggleActive(d)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${d.is_active ? "bg-brand-600" : "bg-slate-300"}`}
                  >
                    <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition ${d.is_active ? "translate-x-4" : "translate-x-0.5"}`} />
                  </button>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatDate(d.uploaded_at)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <button
                    onClick={() => {
                      replaceTarget.current = d;
                      replaceInput.current?.click();
                    }}
                    className="mr-3 text-brand-600 hover:underline"
                  >
                    Replace
                  </button>
                  <button onClick={() => remove(d)} className="text-red-600 hover:underline">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
