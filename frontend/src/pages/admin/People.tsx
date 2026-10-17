import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { api, type ImportPreview, type Person } from "../../api/client";
import { SearchBox } from "../../components/Badges";
import { Avatar } from "../../components/Brand";
import Icon from "../../components/Icon";
import Modal from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { plural } from "../../format";
import { EmptyState, PageHeader } from "./AdminLayout";

const TEMPLATE = "name,role,email,employee_id,department\nAda Lovelace,Head of Finance,ada.lovelace@example.com,EMP-0001,Finance\n";
const PREVIEW_ROWS = 50;

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([TEMPLATE], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "askhr-employees-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

const EMPTY: Person = { name: "", role: "", department: "", email: "", employee_id: "", has_access: true, bio: null };

function PersonModal({
  person,
  departments,
  onClose,
  onSaved,
}: {
  person: Person;
  departments: string[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [form, setForm] = useState<Person>({ ...person });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isNew = !person.id;
  const set = (k: keyof Person) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function save(body: Person, message: string) {
    setBusy(true);
    setError(null);
    try {
      const payload = JSON.stringify({ ...body, id: undefined });
      if (body.id) await api(`/api/admin/people/${body.id}`, { method: "PUT", body: payload });
      else await api("/api/admin/people", { method: "POST", body: payload });
      onSaved(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setBusy(false);
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save(form, isNew ? `${form.name} added` : `${form.name} updated`);
  };

  return (
    <Modal onClose={onClose}>
      {({ titleId }) => (
        <form onSubmit={submit} className="flex flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-line py-4 pl-6 pr-4">
            <h2 id={titleId} className="text-[19px] font-semibold leading-[27px]">
              {isNew ? "Add person" : "Edit person"}
            </h2>
            <button type="button" aria-label="Close" onClick={onClose} className="icon-btn">
              <Icon name="close" size={20} />
            </button>
          </div>

          <div className="flex flex-col gap-[18px] p-6">
            {error && (
              <div role="alert" className="flex items-start gap-2.5 rounded-[10px] bg-danger-100 px-3.5 py-3 text-sm text-danger-900">
                <Icon name="alert" className="mt-0.5 shrink-0" />
                {error}
              </div>
            )}
            {!form.has_access && !isNew && (
              <div className="flex items-start gap-2.5 rounded-[10px] bg-paper px-3.5 py-3 text-sm text-ink-body">
                <Icon name="lock" className="mt-0.5 shrink-0 text-ink-2" />
                {form.name} can’t sign in, and AskHR doesn’t use them to answer “who is…” questions.
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="pm-name" className="field-label">
                Full name
              </label>
              <input id="pm-name" required maxLength={200} value={form.name} onChange={set("name")} className="input" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="pm-id" className="field-label">
                Employee ID
              </label>
              <input
                id="pm-id"
                maxLength={50}
                value={form.employee_id ?? ""}
                onChange={set("employee_id")}
                aria-describedby="pm-id-hint"
                className="input tracking-[0.02em]"
              />
              <span id="pm-id-hint" className="field-hint">
                Used with their work email to sign in.{!isNew && " Changing it signs them out everywhere."}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="pm-role" className="field-label">
                Role
              </label>
              <input
                id="pm-role"
                required
                maxLength={200}
                value={form.role}
                onChange={set("role")}
                aria-describedby="pm-role-hint"
                className="input"
              />
              <span id="pm-role-hint" className="field-hint">
                Use the title people will ask about, e.g. “Head of Finance”, not an internal grade.
              </span>
            </div>
            <div className="grid gap-[18px] [grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr))]">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="pm-dept" className="field-label">
                  Department
                </label>
                <input
                  id="pm-dept"
                  list="pm-departments"
                  maxLength={200}
                  value={form.department ?? ""}
                  onChange={set("department")}
                  className="input"
                />
                <datalist id="pm-departments">
                  {departments.map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="pm-email" className="field-label">
                  Work email
                </label>
                <input id="pm-email" type="email" maxLength={320} value={form.email ?? ""} onChange={set("email")} className="input" />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 border-t border-line px-6 pb-6 pt-4">
            {!isNew &&
              (person.has_access ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => save({ ...form, has_access: false }, `${form.name} can no longer sign in`)}
                  className="btn mr-auto px-3 font-semibold text-danger hover:bg-danger-100 hover:text-danger-700"
                >
                  Remove access
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => save({ ...form, has_access: true }, `${form.name} can sign in again`)}
                  className="btn-ghost mr-auto"
                >
                  Restore access
                </button>
              ))}
            <button type="button" onClick={onClose} className={`btn-secondary ${isNew ? "ml-auto" : ""}`}>
              Cancel
            </button>
            <button type="submit" disabled={busy || !form.name.trim() || !form.role.trim()} className="btn-primary">
              {isNew ? "Add person" : "Save changes"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: (message: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removeMissing, setRemoveMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function run(f: File, commit: boolean) {
    const form = new FormData();
    form.append("file", f);
    form.append("commit", String(commit));
    form.append("remove_missing", String(commit && removeMissing));
    return api<ImportPreview>("/api/admin/people/import", { method: "POST", body: form });
  }

  async function choose(f: File | undefined) {
    if (!f) return;
    setFile(f);
    setPreview(null);
    setError(null);
    setBusy(true);
    try {
      setPreview(await run(f, false));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t read that file");
    } finally {
      setBusy(false);
    }
  }

  async function commit(e: FormEvent) {
    e.preventDefault();
    if (!file || !preview) return;
    setBusy(true);
    try {
      const r = await run(file, true);
      const parts = [
        r.new_count && `${plural(r.new_count, "new employee")} added`,
        r.update_count && `${plural(r.update_count, "person", "people")} updated`,
        removeMissing && r.missing.length && `${plural(r.missing.length, "person", "people")} lost access`,
      ].filter(Boolean);
      onDone(parts.length ? `Import complete: ${parts.join(", ")}` : "Import complete: nothing to change");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
      setBusy(false);
    }
  }

  const toApply = preview ? preview.new_count + preview.update_count : 0;
  const shown = preview?.rows.filter((r) => r.result !== "unchanged").slice(0, PREVIEW_ROWS) ?? [];
  const hiddenCount = preview ? preview.rows.filter((r) => r.result !== "unchanged").length - shown.length : 0;

  return (
    <Modal onClose={onClose} maxWidth={720} top={56}>
      {({ titleId, descId }) => (
        <form onSubmit={commit} className="flex flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-line pb-[18px] pl-6 pr-4 pt-[22px]">
            <div className="flex flex-col gap-1">
              <h2 id={titleId} className="text-[19px] font-semibold leading-[27px]">
                Import employees from CSV
              </h2>
              <p id={descId} className="text-sm leading-[21px] text-ink-2">
                Columns:{" "}
                <code className="rounded bg-chip px-[5px] py-px font-mono text-[13px]">name, role, email, employee_id</code>{" "}
                · optional <code className="rounded bg-chip px-[5px] py-px font-mono text-[13px]">department</code> ·{" "}
                <button type="button" onClick={downloadTemplate} className="text-ochre underline hover:text-ochre-800">
                  Download template
                </button>
              </p>
            </div>
            <button type="button" aria-label="Close" onClick={onClose} className="icon-btn">
              <Icon name="close" size={20} />
            </button>
          </div>

          <div className="flex flex-col gap-[18px] px-6 py-5">
            <input
              ref={input}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                choose(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            {!file ? (
              <button
                type="button"
                data-autofocus
                onClick={() => input.current?.click()}
                className="flex flex-col items-center gap-3 rounded-[14px] border-2 border-dashed border-line-strong px-6 py-10 text-center hover:border-green hover:bg-green-50"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-100 text-green">
                  <Icon name="spreadsheet" size={24} />
                </span>
                <span className="text-base font-semibold">Choose a CSV file</span>
                <span className="text-sm text-ink-2">
                  Matched by employee ID, so importing the same file twice never duplicates anyone.
                </span>
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-line px-3.5 py-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-100 text-green">
                  <Icon name="spreadsheet" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[15px] font-semibold">{file.name}</span>
                  <span className="text-[13px] text-ink-3">
                    {busy && !preview
                      ? "Checking…"
                      : preview
                        ? `${plural(preview.total_rows, "row")} · ${plural(preview.columns_matched, "column")} matched`
                        : "Couldn’t read this file"}
                  </span>
                </span>
                <button type="button" onClick={() => input.current?.click()} className="btn-secondary btn-sm">
                  Choose another file
                </button>
              </div>
            )}

            {error && (
              <div role="alert" className="flex items-start gap-2.5 rounded-[10px] bg-danger-100 px-3.5 py-3 text-sm text-danger-900">
                <Icon name="alert" className="mt-0.5 shrink-0" />
                {error}
              </div>
            )}

            {preview && (
              <>
                <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(min(180px,100%),1fr))]">
                  <div className="flex flex-col gap-0.5 rounded-[10px] bg-green-50 px-4 py-3.5">
                    <span className="text-[26px] font-semibold leading-8 text-green-900">{preview.new_count}</span>
                    <span className="text-sm font-medium text-green">New employees</span>
                  </div>
                  <div className="flex flex-col gap-0.5 rounded-[10px] bg-paper px-4 py-3.5">
                    <span className="text-[26px] font-semibold leading-8">{preview.update_count}</span>
                    <span className="text-sm font-medium text-ink-2">Updates (matched by employee ID)</span>
                  </div>
                  <div className={`flex flex-col gap-0.5 rounded-[10px] px-4 py-3.5 ${preview.error_count ? "bg-danger-100" : "bg-paper"}`}>
                    <span className={`text-[26px] font-semibold leading-8 ${preview.error_count ? "text-danger-700" : ""}`}>
                      {preview.error_count}
                    </span>
                    <span className={`text-sm font-medium ${preview.error_count ? "text-danger-700" : "text-ink-2"}`}>
                      Rows need fixing
                    </span>
                  </div>
                </div>

                {shown.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <h3 className="text-sm font-semibold">Preview</h3>
                    <div className="max-h-72 overflow-auto rounded-[10px] border border-line">
                      <table className="w-full min-w-[600px] border-collapse text-[13px]">
                        <thead className="sticky top-0">
                          <tr className="bg-subtle text-left">
                            {["Row", "Name", "Role", "Email", "Employee ID", "Result"].map((h) => (
                              <th key={h} scope="col" className="border-b border-line px-3 py-[9px] text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-2">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {shown.map((r) => {
                            const bad = r.result === "error";
                            return (
                              <tr key={r.row} className={`border-b border-line last:border-0 ${bad ? "bg-danger-50" : ""}`}>
                                <td className="px-3 py-2.5 text-ink-3">{r.row}</td>
                                <td className="px-3 py-2.5">{r.name || <em className="text-danger-700">missing</em>}</td>
                                <td className="px-3 py-2.5">{r.role || <em className="text-danger-700">missing</em>}</td>
                                <td className="px-3 py-2.5">{r.email || <em className="text-danger-700">missing</em>}</td>
                                <td className="px-3 py-2.5">{r.employee_id || <em className="text-danger-700">missing</em>}</td>
                                <td
                                  className={`px-3 py-2.5 font-medium ${
                                    bad ? "text-danger-700" : r.result === "new" ? "text-green" : "text-ink-2"
                                  }`}
                                >
                                  {r.result === "new" ? "New" : r.message}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <span className="text-[13px] text-ink-3">
                      {hiddenCount > 0 && `…and ${hiddenCount} more. `}
                      {preview.unchanged_count > 0 && `${plural(preview.unchanged_count, "row")} already match the directory. `}
                      {preview.error_count > 0 &&
                        "Rows that need fixing are skipped. Fix them in the file and import again; nothing is duplicated."}
                    </span>
                  </div>
                )}

                {preview.missing.length > 0 && (
                  <fieldset className="flex flex-col gap-2">
                    <legend className="mb-2 text-sm font-semibold">
                      People already in AskHR but not in this file ({preview.missing.length})
                    </legend>
                    {[
                      { value: false, title: "Keep them", body: "Use this when the file is only new joiners." },
                      {
                        value: true,
                        title: "Remove their access",
                        body: "Use this when the file is the full current staff list. They can no longer sign in.",
                      },
                    ].map((o) => (
                      <label
                        key={o.title}
                        className={`flex min-h-11 cursor-pointer items-start gap-2.5 rounded-[10px] border px-3 py-2.5 ${
                          removeMissing === o.value ? "border-green bg-green-50" : "border-line"
                        }`}
                      >
                        <input
                          type="radio"
                          name="ic-missing"
                          checked={removeMissing === o.value}
                          onChange={() => setRemoveMissing(o.value)}
                          className="mt-0.5 h-[18px] w-[18px] accent-green"
                        />
                        <span className="flex flex-col">
                          <span className="text-sm font-medium">{o.title}</span>
                          <span className="text-[13px] text-ink-2">
                            {o.body}
                            {o.value && ` (${preview.missing.slice(0, 3).map((m) => m.name).join(", ")}${preview.missing.length > 3 ? "…" : ""})`}
                          </span>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                )}
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-line px-6 pb-6 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !preview || (toApply === 0 && !(removeMissing && preview.missing.length))}
              className="btn-primary"
            >
              {busy && preview ? "Importing…" : `Import ${plural(toApply, "employee")}`}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export default function People() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [editing, setEditing] = useState<Person | null>(null);
  const [importing, setImporting] = useState(false);
  const [query, setQuery] = useState("");
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      setPeople(await api<Person[]>("/api/admin/people"));
    } catch (e) {
      setPeople((p) => p ?? []);
      toast(e instanceof Error ? e.message : "Couldn’t load people", { tone: "error" });
    }
  }, [toast]);
  useEffect(() => {
    load();
  }, [load]);

  const departments = useMemo(
    () => [...new Set((people ?? []).map((p) => p.department).filter((d): d is string => !!d))].sort(),
    [people],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people ?? [];
    return (people ?? []).filter((p) =>
      [p.name, p.role, p.department, p.email, p.employee_id].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [people, query]);

  const finished = (message: string) => {
    setEditing(null);
    setImporting(false);
    toast(message);
    load();
  };

  const canSignIn = (people ?? []).filter((p) => p.has_access && p.employee_id && p.email).length;

  return (
    <div className="mx-auto flex max-w-[1120px] flex-col gap-6">
      {people !== null && people.length === 0 ? (
        <>
          <PageHeader title="People directory" intro="AskHR uses this list to answer “who is…” questions." />
          <EmptyState
            icon="personAdd"
            title="No one in the directory yet"
            actions={
              <div className="flex flex-col items-center gap-4">
                <div className="flex flex-wrap justify-center gap-2.5">
                  <button type="button" onClick={() => setImporting(true)} className="btn-primary h-12 px-5 text-base">
                    <Icon name="upload" />
                    Import staff CSV
                  </button>
                  <button type="button" onClick={() => setEditing({ ...EMPTY })} className="btn-secondary h-12 text-base">
                    Add one person
                  </button>
                </div>
                <button type="button" onClick={downloadTemplate} className="text-sm text-ochre underline hover:text-ochre-800">
                  Download the CSV template
                </button>
              </div>
            }
          >
            Employees can’t sign in until they’re on this list. Import your staff list as a CSV with name, role, email and
            employee ID.
          </EmptyState>
        </>
      ) : (
        <>
          <PageHeader
            title="People directory"
            intro="Everyone here with an employee ID and email can sign in to AskHR. AskHR also uses this list to answer “who is…” questions."
            actions={
              <>
                <button type="button" onClick={() => setEditing({ ...EMPTY })} className="btn-secondary">
                  <Icon name="plus" />
                  Add person
                </button>
                <button type="button" onClick={() => setImporting(true)} className="btn-primary">
                  <Icon name="upload" />
                  Import CSV
                </button>
              </>
            }
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <SearchBox
              id="ap-search"
              label="Search people"
              placeholder="Search by name, role or department"
              value={query}
              onChange={setQuery}
              className="w-[300px] max-w-full"
            />
            {people && (
              <span className="text-sm text-ink-2">
                {plural(people.length, "person", "people")} · {canSignIn} can sign in
                {query && ` · showing ${filtered.length}`}
              </span>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-line bg-white">
            <table className="w-full min-w-[880px] border-collapse text-sm">
              <thead>
                <tr className="bg-subtle">
                  <th scope="col" className="th pl-5">Name</th>
                  <th scope="col" className="th">Employee ID</th>
                  <th scope="col" className="th">Role</th>
                  <th scope="col" className="th">Department</th>
                  <th scope="col" className="th">Email</th>
                  <th scope="col" className="th pr-5">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {people === null && (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-ink-3">
                      Loading…
                    </td>
                  </tr>
                )}
                {people !== null && filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-ink-3">
                      No one matches “{query}”.
                    </td>
                  </tr>
                )}
                {filtered.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="py-3 pl-5 pr-3">
                      <span className="flex items-center gap-3">
                        <Avatar name={p.name} className={p.has_access ? "" : "bg-chip text-ink-3"} />
                        <span className="flex flex-col">
                          <span className={`text-[15px] font-semibold ${p.has_access ? "" : "text-ink-2"}`}>{p.name}</span>
                          {!p.has_access && <span className="text-xs text-ink-3">Access removed</span>}
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-3 tabular-nums text-ink-2">{p.employee_id ?? "—"}</td>
                    <td className="px-3 py-3">{p.role}</td>
                    <td className="px-3 py-3 text-ink-2">{p.department ?? "—"}</td>
                    <td className="px-3 py-3 text-ink-2">{p.email ?? "—"}</td>
                    <td className="py-2 pl-3 pr-5 text-right">
                      <button
                        type="button"
                        aria-label={`Edit ${p.name}`}
                        onClick={() => setEditing(p)}
                        className="btn-secondary btn-sm"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {editing && (
        <PersonModal person={editing} departments={departments} onClose={() => setEditing(null)} onSaved={finished} />
      )}
      {importing && <ImportModal onClose={() => setImporting(false)} onDone={finished} />}
    </div>
  );
}
