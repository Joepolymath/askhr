import { useEffect, useState, type FormEvent } from "react";
import { api, type CompanyInfo } from "../../api/client";
import Icon from "../../components/Icon";
import { useToast } from "../../components/Toast";
import { formatDate } from "../../format";
import { PageHeader } from "./AdminLayout";

const EMPTY: CompanyInfo = { name: "", content: "", mission: "", hr_contact_name: "", hr_contact_email: "" };
const FIELDS = ["name", "content", "mission", "hr_contact_name", "hr_contact_email"] as const;

export default function Company() {
  const [form, setForm] = useState<CompanyInfo>(EMPTY);
  const [saved, setSaved] = useState<CompanyInfo>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    api<CompanyInfo>("/api/admin/company")
      .then((r) => {
        setForm(r);
        setSaved(r);
      })
      .catch((e) => toast(e instanceof Error ? e.message : "Couldn’t load company info", { tone: "error" }))
      .finally(() => setLoading(false));
  }, [toast]);

  const dirty = FIELDS.some((f) => form[f] !== saved[f]);
  const set = (k: (typeof FIELDS)[number]) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api<CompanyInfo>("/api/admin/company", { method: "PUT", body: JSON.stringify(form) });
      setForm(r);
      setSaved(r);
      toast("Company info saved");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Save failed", { tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-6">
      <PageHeader title="Company info" intro="The basics every employee should be able to ask about." />

      <div className="flex items-start gap-3 rounded-xl bg-green-100 px-4 py-3.5 text-green-900">
        <Icon name="info" size={20} className="mt-0.5 shrink-0" />
        <p className="text-[15px] leading-6">
          AskHR <strong className="font-semibold">always</strong> has this information, on top of your documents. It’s how it
          answers “What does the company do?” and how it knows who employees should contact when an answer isn’t in the
          documents.
        </p>
      </div>

      <form onSubmit={save} onReset={() => setForm(saved)} className="flex flex-col rounded-[14px] border border-line bg-white">
        <fieldset disabled={loading} className="flex flex-col gap-[22px] p-6">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="co-name" className="field-label">
              Company name
            </label>
            <input id="co-name" maxLength={200} value={form.name} onChange={set("name")} className="input" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="co-what" className="field-label">
              What the company does
            </label>
            <textarea
              id="co-what"
              rows={4}
              maxLength={20000}
              value={form.content}
              onChange={set("content")}
              aria-describedby="co-what-hint"
              className="textarea"
            />
            <span id="co-what-hint" className="field-hint">
              Two or three plain sentences work best.
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="co-mission" className="field-label">
              Mission
            </label>
            <textarea id="co-mission" rows={2} maxLength={5000} value={form.mission} onChange={set("mission")} className="textarea" />
          </div>
        </fieldset>

        <fieldset disabled={loading} className="flex flex-col gap-[18px] border-t border-line p-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-[17px] font-semibold leading-[25px]">HR contact</h2>
            <p className="text-sm leading-[21px] text-ink-2">Shown to employees when AskHR can’t find an answer.</p>
          </div>
          <div className="grid gap-[18px] [grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr))]">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="co-hrname" className="field-label">
                Name or team
              </label>
              <input id="co-hrname" maxLength={200} value={form.hr_contact_name} onChange={set("hr_contact_name")} className="input" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="co-hremail" className="field-label">
                Email
              </label>
              <input
                id="co-hremail"
                type="email"
                maxLength={320}
                value={form.hr_contact_email}
                onChange={set("hr_contact_email")}
                className="input"
              />
            </div>
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-b-[14px] border-t border-line bg-subtle px-6 py-4">
          <span className="text-[13px] text-ink-3">
            {dirty ? "Unsaved changes" : saved.updated_at ? `Last saved ${formatDate(saved.updated_at)}` : ""}
          </span>
          <div className="flex gap-2.5">
            <button type="reset" disabled={!dirty || busy} className="btn-secondary">
              Discard
            </button>
            <button type="submit" disabled={!dirty || busy} className="btn-primary">
              {busy ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
