import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, ApiError, type Employee } from "../api/client";
import { Logo } from "../components/Brand";
import Icon, { type IconName } from "../components/Icon";
import { plural } from "../format";
import { useSession } from "../session";

const PROMISES: { icon: IconName; title: string; body: string }[] = [
  { icon: "documentText", title: "Every answer shows its source", body: "Tap a citation to see the exact policy text it came from." },
  { icon: "help", title: "It won’t guess", body: "If the answer isn’t in the documents, it says so and points you to HR." },
  { icon: "refresh", title: "Always the current version", body: "When HR updates a policy, answers update with it." },
];

export function CompanyName({ name }: { name: string }) {
  if (!name) return null;
  return <span className="hidden border-l border-line-strong pl-3 text-sm text-ink-3 sm:inline">{name}</span>;
}

export default function Welcome() {
  const { info, signIn } = useSession();
  const [email, setEmail] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hrEmail = info?.hr_contact_email;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !employeeId.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ token: string; employee: Employee }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, employee_id: employeeId, remember }),
      });
      signIn(r.token, r.employee, remember);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? "mismatch" : "network");
    } finally {
      setBusy(false);
    }
  }

  const invalid = error === "mismatch";

  return (
    <div className="flex min-h-full flex-col bg-paper">
      <header className="flex items-center justify-between gap-4 px-4 py-[18px] sm:px-8">
        <div className="flex items-center gap-2.5">
          <Logo />
          <CompanyName name={info?.company_name ?? ""} />
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 pb-16 pt-8 sm:px-6">
        <div className="flex w-full max-w-[1040px] flex-wrap items-center gap-12">
          <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-7">
            <div className="flex flex-col gap-3.5">
              <span className="text-[13px] font-semibold uppercase tracking-[0.06em] text-green">
                Your company’s HR, on hand
              </span>
              <h1 className="text-[32px] font-semibold leading-10 tracking-[-0.02em] [text-wrap:balance] sm:text-[40px] sm:leading-[48px]">
                Ask HR questions. Get answers straight from company documents.
              </h1>
              <p className="max-w-[520px] text-[17px] leading-7 text-ink-2">
                Leave, policies, who’s who, how things work. AskHR reads the documents HR has published and answers in
                plain language.
              </p>
            </div>
            <ul className="flex flex-col gap-4">
              {PROMISES.map((p) => (
                <li key={p.title} className="flex items-start gap-3.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-green-100 text-green">
                    <Icon name={p.icon} />
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="text-[15px] font-semibold">{p.title}</span>
                    <span className="text-[15px] leading-[22px] text-ink-2">{p.body}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <form
            onSubmit={submit}
            className="flex min-w-0 max-w-[460px] flex-[1_1_380px] flex-col gap-6 rounded-2xl border border-line bg-white p-6 shadow-card sm:p-8"
          >
            <div className="flex flex-col gap-1.5">
              <h2 className="text-[22px] font-semibold leading-[30px]">Sign in</h2>
              <p className="text-[15px] leading-6 text-ink-2">
                Use your work email and the employee ID on your staff card or payslip.
              </p>
            </div>

            {error && (
              <div role="alert" className="flex items-start gap-3 rounded-[10px] bg-danger-100 px-4 py-3.5 text-danger-900">
                <Icon name="alert" size={20} strokeWidth={2.2} className="mt-0.5 shrink-0" />
                <div className="flex flex-col gap-1">
                  <span className="text-[15px] font-semibold">
                    {invalid ? "That email and employee ID don’t match" : "We couldn’t sign you in"}
                  </span>
                  <span className="text-sm leading-[21px]">
                    {invalid
                      ? "Check both and try again. If you joined recently, HR may not have added you yet."
                      : "Check your connection and try again."}
                  </span>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-[18px]">
              <div className="flex flex-col gap-2">
                <label htmlFor="w-email" className="field-label">
                  Work email
                </label>
                <input
                  id="w-email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={invalid}
                  className="input h-12 text-base"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="w-id" className="field-label">
                  Employee ID
                </label>
                <input
                  id="w-id"
                  type="text"
                  autoComplete="off"
                  required
                  placeholder="e.g. EMP-0142"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  aria-invalid={invalid}
                  className="input h-12 text-base tracking-[0.02em]"
                />
              </div>
              {!error && (
                <label className="flex min-h-11 items-center gap-2.5 text-sm text-ink-body">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="h-[18px] w-[18px] accent-green"
                  />
                  Keep me signed in on this device
                </label>
              )}
            </div>

            <button type="submit" disabled={busy} className="btn-primary h-12 text-base">
              {busy ? "Signing in…" : error ? "Try again" : "Sign in and start asking"}
              {!busy && !error && <Icon name="arrowRight" />}
            </button>

            <p className="border-t border-line pt-4 text-[13px] leading-5 text-ink-3">
              {error ? (
                <>
                  Still stuck?{" "}
                  {hrEmail ? (
                    <>
                      Email <a href={`mailto:${hrEmail}`}>{hrEmail}</a>
                    </>
                  ) : (
                    "Contact HR"
                  )}{" "}
                  with your full name and start date.
                </>
              ) : (
                <>
                  Can’t sign in? Your details may not have been added yet.{" "}
                  {hrEmail ? (
                    <>
                      Email <a href={`mailto:${hrEmail}`}>{hrEmail}</a>.
                    </>
                  ) : (
                    "Contact HR."
                  )}{" "}
                  HR sees which questions get asked, but not who asked them.
                </>
              )}
            </p>
          </form>
        </div>
      </main>

      <footer className="flex flex-wrap justify-between gap-3 px-4 py-5 text-[13px] text-ink-3 sm:px-8">
        <span>
          {info && info.document_count > 0
            ? `Answers come from ${plural(info.document_count, "document")} published by HR.`
            : "Answers come from documents published by HR."}
        </span>
        <Link to="/admin/login" className="text-ink-2 hover:text-ink">
          HR admin sign-in
        </Link>
      </footer>
    </div>
  );
}
