import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { api, ApiError, type Category, type DocumentOut } from "../../api/client";
import { CATEGORY_LABELS, SearchBox, StatusBadge, Switch } from "../../components/Badges";
import Icon from "../../components/Icon";
import Modal from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { formatDate, formatSize, formatWhen, plural } from "../../format";
import { EmptyState, PageHeader } from "./AdminLayout";

const ACCEPT = ".pdf,.docx,.txt,.md";
const MAX_BYTES = 20 * 1024 * 1024;
const POLL_MS = 2000;
const SCANNED = "scanned PDFs aren't supported yet";

function titleFromFilename(name: string) {
  const base = name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return base.replace(/\b\w/g, (c) => c.toUpperCase());
}

function guessCategory(name: string): Category {
  const n = name.toLowerCase();
  if (n.includes("handbook")) return "handbook";
  if (/org|structure|overview|leadership|about/.test(n)) return "org_info";
  return "policy";
}

function fileProblem(file: File) {
  if (!/\.(pdf|docx|txt|md|markdown)$/i.test(file.name)) return "only PDF, DOCX, TXT or MD files are supported";
  if (file.size > MAX_BYTES) return "file is larger than 20 MB";
  return null;
}

interface ReplaceRequest {
  file: File;
  title: string;
  category: Category;
  existing: DocumentOut;
  allowKeepBoth: boolean;
}

export default function Documents() {
  const [docs, setDocs] = useState<DocumentOut[] | null>(null);
  const [dragging, setDragging] = useState(false);
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [category, setCategory] = useState<Category | "all">("all");
  const [replaceReq, setReplaceReq] = useState<ReplaceRequest | null>(null);
  const [deleting, setDeleting] = useState<DocumentOut | null>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<DocumentOut | null>(null);
  // Several dropped files can clash with existing titles: ask about them one at a time.
  const queue = useRef<ReplaceRequest[]>([]);
  const showingReplace = useRef(false);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      setDocs(await api<DocumentOut[]>("/api/admin/documents"));
    } catch (e) {
      setDocs((d) => d ?? []);
      toast(e instanceof Error ? e.message : "Couldn’t load documents", { tone: "error" });
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const anyProcessing = docs?.some((d) => d.status === "processing");
  useEffect(() => {
    if (!anyProcessing) return;
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [anyProcessing, load]);

  async function send(file: File, title: string, cat: Category, replace: boolean) {
    const form = new FormData();
    form.append("file", file);
    form.append("title", title);
    form.append("category", cat);
    form.append("replace", String(replace));
    return api<DocumentOut>("/api/admin/documents", { method: "POST", body: form });
  }

  const docsRef = useRef<DocumentOut[]>([]);
  docsRef.current = docs ?? [];

  const askReplace = (req: ReplaceRequest) => {
    if (showingReplace.current) return void queue.current.push(req);
    showingReplace.current = true;
    setReplaceReq(req);
  };

  const nextReplace = () => {
    const next = queue.current.shift() ?? null;
    showingReplace.current = next !== null;
    setReplaceReq(next);
  };

  async function upload(file: File, title: string, cat: Category, replace: boolean, allowKeepBoth = true) {
    try {
      const doc = await send(file, title, cat, replace);
      toast(`“${doc.title}” uploaded — processing`, {
        action: {
          label: "Undo",
          onClick: async () => {
            await api(`/api/admin/documents/${doc.id}`, { method: "DELETE" }).catch(() => {});
            load();
          },
        },
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const reported = (e.body as { existing: DocumentOut }).existing;
        // The list has the computed version number; the 409 body doesn't.
        const existing = docsRef.current.find((d) => d.id === reported.id) ?? reported;
        askReplace({ file, title, category: cat, existing, allowKeepBoth });
        return;
      }
      toast(`Upload failed — ${e instanceof Error ? e.message : "please try again"}`, { tone: "error" });
    }
    await load();
  }

  async function addFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      const problem = fileProblem(file);
      if (problem) {
        toast(`Upload failed — ${problem}`, { tone: "error" });
        continue;
      }
      await upload(file, titleFromFilename(file.name), guessCategory(file.name), false);
    }
  }

  async function confirmReplace(mode: "replace" | "keepBoth") {
    const req = replaceReq;
    if (!req) return;
    nextReplace();
    if (mode === "replace") return upload(req.file, req.title, req.category, true);
    // Keep both: the new file needs its own title, since only one version per title is live.
    const titles = new Set((docs ?? []).map((d) => d.title.toLowerCase()));
    let n = 2;
    while (titles.has(`${req.title} (${n})`.toLowerCase())) n++;
    return upload(req.file, `${req.title} (${n})`, req.category, false);
  }

  async function patch(d: DocumentOut, body: Partial<Pick<DocumentOut, "is_active" | "category">>) {
    try {
      await api(`/api/admin/documents/${d.id}`, { method: "PATCH", body: JSON.stringify(body) });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Update failed", { tone: "error" });
    }
    await load();
  }

  async function remove(d: DocumentOut) {
    setDeleting(null);
    try {
      await api(`/api/admin/documents/${d.id}`, { method: "DELETE" });
      toast(`“${d.title}” deleted`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Delete failed", { tone: "error" });
    }
    await load();
  }

  const dropHandlers = {
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      addFiles(e.dataTransfer.files);
    },
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (docs ?? []).filter(
      (d) =>
        (category === "all" || d.category === category) &&
        (!q || d.title.toLowerCase().includes(q) || d.original_filename.toLowerCase().includes(q)),
    );
  }, [docs, query, category]);

  const answering = (docs ?? []).filter((d) => d.is_active && d.status === "ready").length;

  const fileInput = (
    <input
      type="file"
      accept={ACCEPT}
      multiple
      className="sr-only"
      onChange={(e) => {
        if (e.target.files) addFiles(e.target.files);
        e.target.value = "";
      }}
    />
  );

  return (
    <div className="mx-auto flex max-w-[1120px] flex-col gap-7">
      <PageHeader
        title="Documents"
        intro={
          <>
            AskHR answers only from documents that are <strong className="font-semibold text-ink">Ready</strong> and{" "}
            <strong className="font-semibold text-ink">Active</strong>.
          </>
        }
      />

      <input
        ref={replaceInput}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const target = replaceTarget.current;
          e.target.value = "";
          if (!file || !target) return;
          const problem = fileProblem(file);
          if (problem) return toast(`Upload failed — ${problem}`, { tone: "error" });
          if (target.status === "failed") return upload(file, target.title, target.category, false);
          askReplace({ file, title: target.title, category: target.category, existing: target, allowKeepBoth: false });
        }}
      />

      {docs !== null && docs.length === 0 ? (
        <div {...dropHandlers} className={dragging ? "rounded-2xl ring-4 ring-green-100" : ""}>
          <EmptyState
            icon="documentUpload"
            title="Add your first policy document"
            dashed
            actions={
              <div className="flex flex-col items-center gap-3">
                <label className="btn-primary relative h-12 cursor-pointer px-5 text-base focus-within:outline focus-within:outline-[3px] focus-within:outline-offset-2 focus-within:outline-ochre">
                  <Icon name="upload" />
                  Upload documents
                  {fileInput}
                </label>
                <span className="text-sm text-ink-3">or drag files here · PDF, DOCX, TXT or MD · up to 20 MB each</span>
              </div>
            }
          >
            AskHR can’t answer anything until it has documents to read. Start with the Employee Handbook and Leave Policy —
            they cover most of what people ask.
          </EmptyState>
        </div>
      ) : (
        <>
          <div
            {...dropHandlers}
            className={`flex flex-wrap items-center justify-center gap-5 rounded-[14px] border-2 border-dashed bg-white px-6 py-7 text-center transition-colors ${
              dragging ? "border-green bg-green-50" : "border-line-strong"
            }`}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-100 text-green">
              <Icon name="upload" size={24} />
            </span>
            <div className="flex flex-col gap-0.5 text-left">
              <span className="text-base font-semibold">Drag policy files here to upload</span>
              <span className="text-sm text-ink-2">PDF, DOCX, TXT or MD · up to 20 MB each · usually ready in under a minute</span>
            </div>
            <label className="btn-primary relative cursor-pointer focus-within:outline focus-within:outline-[3px] focus-within:outline-offset-2 focus-within:outline-ochre">
              Browse files
              {fileInput}
            </label>
          </div>

          <div className="flex flex-col gap-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <SearchBox
                  id="ad-search"
                  label="Search documents"
                  placeholder="Search documents"
                  value={query}
                  onChange={(v) => {
                    setQuery(v);
                    if (params.has("q")) setParams({}, { replace: true });
                  }}
                  className="w-[260px] max-w-full"
                />
                <label htmlFor="ad-cat" className="sr-only">
                  Filter by category
                </label>
                <select
                  id="ad-cat"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as Category | "all")}
                  className="select h-10 w-auto text-sm"
                >
                  <option value="all">All categories</option>
                  {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              {docs && (
                <span className="text-sm text-ink-2">
                  {plural(docs.length, "document")} · {answering} active and answering
                </span>
              )}
            </div>

            <div className="overflow-x-auto rounded-xl border border-line bg-white">
              <table className="w-full min-w-[860px] border-collapse text-sm">
                <thead>
                  <tr className="bg-subtle">
                    <th scope="col" className="th pl-5">Document</th>
                    <th scope="col" className="th">Category</th>
                    <th scope="col" className="th">Status</th>
                    <th scope="col" className="th">Active</th>
                    <th scope="col" className="th">Uploaded</th>
                    <th scope="col" className="th pr-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {docs === null && (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-ink-3">
                        Loading…
                      </td>
                    </tr>
                  )}
                  {docs !== null && filtered.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-ink-3">
                        No documents match.
                      </td>
                    </tr>
                  )}
                  {filtered.map((d) => {
                    const failed = d.status === "failed";
                    const processing = d.status === "processing";
                    const meta = [
                      d.original_filename,
                      formatSize(d.size_bytes),
                      d.replaced_by_title ? `replaced by ${d.replaced_by_title}` : d.version > 1 ? `version ${d.version}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <tr key={d.id} className={`border-b border-line last:border-0 ${failed ? "bg-danger-50" : ""}`}>
                        <td className="py-4 pl-5 pr-3 align-top">
                          <div className="flex flex-col gap-0.5">
                            <span className={`text-[15px] font-semibold ${!d.is_active && !failed ? "text-ink-2" : ""}`}>{d.title}</span>
                            <span className="text-[13px] text-ink-3">{meta}</span>
                            {failed && d.error_message && (
                              <span className="flex items-start gap-1.5 pt-1 text-[13px] leading-[19px] text-danger-700">
                                <Icon name="alert" size={14} strokeWidth={2.2} className="mt-0.5 shrink-0" />
                                {d.error_message}
                                {d.error_message.replace("’", "'").includes(SCANNED) && " Upload a Word or text version instead."}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-4 align-top">
                          <label className="sr-only" htmlFor={`cat-${d.id}`}>
                            Category for {d.title}
                          </label>
                          <select
                            id={`cat-${d.id}`}
                            value={d.category}
                            onChange={(e) => patch(d, { category: e.target.value as Category })}
                            className="h-[26px] cursor-pointer rounded-md border-0 bg-chip py-0 pl-2.5 pr-7 text-[13px] font-medium text-ink-2 hover:bg-line"
                          >
                            {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                              <option key={v} value={v}>
                                {l}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-4 align-top">
                          <StatusBadge status={d.status} />
                        </td>
                        <td className="px-3 py-4 align-top">
                          {failed ? (
                            <span className="text-ink-3">—</span>
                          ) : (
                            <Switch
                              checked={d.is_active}
                              disabled={processing}
                              label={`${d.title} active`}
                              onChange={() => patch(d, { is_active: !d.is_active })}
                            />
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 align-top text-ink-2">{formatWhen(d.uploaded_at)}</td>
                        <td className="py-3 pl-3 pr-5 align-top">
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              disabled={processing}
                              onClick={() => {
                                replaceTarget.current = d;
                                replaceInput.current?.click();
                              }}
                              className="btn-secondary btn-sm"
                            >
                              {failed ? "Replace file" : "Replace"}
                            </button>
                            <button type="button" aria-label={`Delete ${d.title}`} onClick={() => setDeleting(d)} className="icon-btn h-9 w-9">
                              <Icon name="trash" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {replaceReq && (
        <Modal
          top={160}
          onClose={() => {
            nextReplace();
            load();
          }}
        >
          {({ titleId, descId }) => (
            <>
              <div className="flex items-start gap-4 px-6 pt-6">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-ochre-100 text-ochre-700">
                  <Icon name="refresh" size={20} />
                </span>
                <div className="flex flex-1 flex-col gap-2">
                  <h2 id={titleId} className="text-[19px] font-semibold leading-[27px]">
                    Replace “{replaceReq.existing.title}”?
                  </h2>
                  <p id={descId} className="text-[15px] leading-6 text-ink-2">
                    {replaceReq.allowKeepBoth ? `A document titled “${replaceReq.existing.title}” already exists. ` : ""}
                    If you replace it, AskHR will answer from the new file and the old version will be deactivated.
                  </p>
                </div>
                <button type="button" aria-label="Close" onClick={nextReplace} className="icon-btn -mr-2 -mt-2">
                  <Icon name="close" size={20} />
                </button>
              </div>
              <div className="mx-6 mt-5 flex flex-col rounded-xl border border-line">
                <div className="flex items-center gap-3 border-b border-line px-4 py-3.5">
                  <span className="eyebrow w-16 shrink-0 text-ink-3">Current</span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-semibold text-ink-2">{replaceReq.existing.original_filename}</span>
                    <span className="text-[13px] text-ink-3">
                      Version {replaceReq.existing.version ?? 1} · uploaded {formatDate(replaceReq.existing.uploaded_at)} · will be
                      deactivated
                    </span>
                  </span>
                </div>
                <div className="flex items-center gap-3 rounded-b-xl bg-green-50 px-4 py-3.5">
                  <span className="eyebrow w-16 shrink-0 text-green-900">New</span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-semibold">{replaceReq.file.name}</span>
                    <span className="text-[13px] text-ink-2">
                      {formatSize(replaceReq.file.size)} · becomes version {(replaceReq.existing.version ?? 1) + 1}
                    </span>
                  </span>
                </div>
              </div>
              <p className="mx-6 mt-3.5 text-[13px] leading-5 text-ink-3">
                The new version goes live once it finishes processing. You can reactivate the old version from the Documents
                table at any time.
              </p>
              <div className="flex flex-wrap justify-end gap-2.5 p-6">
                {replaceReq.allowKeepBoth && (
                  <button type="button" onClick={() => confirmReplace("keepBoth")} className="btn-ghost mr-auto">
                    Keep both
                  </button>
                )}
                <button type="button" onClick={nextReplace} className="btn-secondary">
                  Cancel
                </button>
                <button type="button" data-autofocus onClick={() => confirmReplace("replace")} className="btn-primary">
                  Replace document
                </button>
              </div>
            </>
          )}
        </Modal>
      )}

      {deleting && (
        <Modal role="alertdialog" maxWidth={460} top={180} onClose={() => setDeleting(null)}>
          {({ titleId, descId }) => (
            <>
              <div className="flex items-start gap-4 px-6 pt-6">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-danger-100 text-danger">
                  <Icon name="trash" size={20} />
                </span>
                <div className="flex flex-1 flex-col gap-2">
                  <h2 id={titleId} className="text-[19px] font-semibold leading-[27px]">
                    Delete “{deleting.title}”?
                  </h2>
                  <p id={descId} className="text-[15px] leading-6 text-ink-2">
                    AskHR will stop using it straight away, and past answers will no longer link to it. This can’t be undone.
                  </p>
                </div>
              </div>
              {deleting.is_active && deleting.status === "ready" && (
                <div className="mx-6 mt-[18px] flex items-start gap-2.5 rounded-[10px] bg-paper px-3.5 py-3 text-sm leading-[21px] text-ink-body">
                  <Icon name="info" className="mt-0.5 shrink-0 text-ink-2" />
                  <span>
                    Only want to pause it? <strong className="font-semibold">Turn off Active</strong> instead. You can switch it
                    back on later.
                  </span>
                </div>
              )}
              <div className="flex flex-wrap justify-end gap-2.5 p-6">
                <button type="button" data-autofocus onClick={() => setDeleting(null)} className="btn-secondary">
                  Cancel
                </button>
                <button type="button" onClick={() => remove(deleting)} className="btn-danger">
                  Delete document
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
