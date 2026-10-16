import { useEffect, useState } from "react";
import { api, type Person } from "../../api/client";
import { useConfirm } from "../../components/ConfirmDialog";

const EMPTY: Person = { name: "", role: "", department: "", email: "", bio: "" };
const FIELDS: { key: keyof Person; label: string; required?: boolean }[] = [
  { key: "name", label: "Name", required: true },
  { key: "role", label: "Role / title", required: true },
  { key: "department", label: "Department" },
  { key: "email", label: "Email" },
];

export default function People() {
  const [people, setPeople] = useState<Person[]>([]);
  const [editing, setEditing] = useState<Person | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  const load = async () => setPeople(await api<Person[]>("/api/admin/people"));
  useEffect(() => {
    load();
  }, []);

  async function save() {
    if (!editing) return;
    try {
      const body = JSON.stringify({ ...editing, id: undefined });
      if (editing.id) await api(`/api/admin/people/${editing.id}`, { method: "PUT", body });
      else await api("/api/admin/people", { method: "POST", body });
      setEditing(null);
      setError(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function remove(p: Person) {
    if (!(await confirm({ title: "Remove person?", body: `${p.name} will be removed from the directory.`, confirmLabel: "Remove", danger: true }))) return;
    await api(`/api/admin/people/${p.id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="space-y-4">
      {dialog}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">People & roles</h2>
          <p className="text-sm text-slate-500">Always included when answering, so "Who is the CTO?" is answered from here.</p>
        </div>
        <button onClick={() => setEditing({ ...EMPTY })} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          Add person
        </button>
      </div>

      {editing && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <label key={f.key} className="text-sm">
                <span className="font-medium text-slate-700">
                  {f.label}
                  {f.required && " *"}
                </span>
                <input
                  value={(editing[f.key] as string) ?? ""}
                  onChange={(e) => setEditing({ ...editing, [f.key]: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5"
                />
              </label>
            ))}
            <label className="text-sm sm:col-span-2">
              <span className="font-medium text-slate-700">Short bio</span>
              <textarea
                value={editing.bio ?? ""}
                onChange={(e) => setEditing({ ...editing, bio: e.target.value })}
                rows={2}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5"
              />
            </label>
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <button onClick={() => setEditing(null)} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={!editing.name.trim() || !editing.role.trim()}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Department</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {people.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  No people yet.
                </td>
              </tr>
            )}
            {people.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3">
                  <div className="font-medium">{p.name}</div>
                  {p.bio && <div className="text-xs text-slate-400">{p.bio}</div>}
                </td>
                <td className="px-4 py-3">{p.role}</td>
                <td className="px-4 py-3">{p.department ?? "—"}</td>
                <td className="px-4 py-3">{p.email ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <button onClick={() => setEditing(p)} className="mr-3 text-brand-600 hover:underline">
                    Edit
                  </button>
                  <button onClick={() => remove(p)} className="text-red-600 hover:underline">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
