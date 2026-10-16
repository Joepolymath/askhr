import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError, auth } from "../api/client";
import { AdminPill, LogoMark } from "../components/Brand";
import Icon from "../components/Icon";

export default function AdminLogin() {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { token } = await api<{ token: string }>("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      auth.set(token);
      navigate("/admin/documents");
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? "That password isn’t right." : "Couldn’t sign in. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-6 bg-paper px-4 py-12">
      <form
        onSubmit={submit}
        className="flex w-full max-w-[420px] flex-col gap-6 rounded-2xl border border-line bg-white px-6 pb-8 pt-9 shadow-card sm:px-8"
      >
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-2.5">
            <LogoMark size={32} />
            <span className="text-[19px] font-semibold tracking-[-0.01em]">
              Ask<span className="text-green">HR</span>
            </span>
            <AdminPill />
          </div>
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-semibold leading-8 tracking-[-0.01em]">Sign in to manage AskHR</h1>
            <p className="text-[15px] leading-6 text-ink-2">
              For the People &amp; Culture team. Manage documents, the people directory and company info.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="al-pw" className="field-label">
            Admin password
          </label>
          <div
            className={`flex h-12 items-center gap-2 rounded-lg border bg-white pl-3.5 pr-1 focus-within:border-ochre focus-within:shadow-[0_0_0_3px_theme(colors.ochre.100)] ${
              error ? "border-danger" : "border-line-strong"
            }`}
          >
            <input
              id="al-pw"
              type={show ? "text" : "password"}
              autoFocus
              autoComplete="current-password"
              value={password}
              aria-invalid={!!error}
              aria-describedby={error ? "al-err" : undefined}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 min-w-0 flex-1 bg-transparent text-base text-ink outline-none focus-visible:outline-none"
            />
            <button
              type="button"
              onClick={() => setShow(!show)}
              aria-pressed={show}
              className="h-10 rounded-md px-2.5 text-sm font-medium text-ink-2 hover:bg-chip"
            >
              {show ? "Hide" : "Show"}
            </button>
          </div>
          {error && (
            <span id="al-err" className="flex items-center gap-1.5 text-[13px] text-danger">
              <Icon name="alert" size={14} strokeWidth={2.2} />
              {error}
            </span>
          )}
        </div>

        <button type="submit" disabled={busy || !password} className="btn-primary h-12 text-base">
          <Icon name="lock" />
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <p className="text-[13px] leading-5 text-ink-3">Forgot the password? Ask your IT administrator to reset it.</p>
      </form>

      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
        <Icon name="arrowLeft" size={16} />
        Back to AskHR chat
      </Link>
    </div>
  );
}
