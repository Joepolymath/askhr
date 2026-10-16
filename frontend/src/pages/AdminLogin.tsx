import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, auth } from "../api/client";
import { PRODUCT_NAME } from "../config";

export default function AdminLogin() {
  const [password, setPassword] = useState("");
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
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold">{PRODUCT_NAME} admin</h1>
        <p className="mt-1 text-sm text-slate-500">Sign in to manage the knowledge base.</p>
        <label htmlFor="pw" className="mt-5 block text-sm font-medium text-slate-700">
          Password
        </label>
        <input
          id="pw"
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <button disabled={busy || !password} className="mt-4 w-full rounded-lg bg-brand-600 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-50">
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <Link to="/" className="mt-4 block text-center text-sm text-slate-500 hover:text-slate-800">
          ← Back to chat
        </Link>
      </form>
    </div>
  );
}
