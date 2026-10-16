import { Link, Navigate, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { auth } from "../../api/client";
import { PRODUCT_NAME } from "../../config";
import Company from "./Company";
import Documents from "./Documents";
import Insights from "./Insights";
import People from "./People";

const TABS = [
  { to: "documents", label: "Documents" },
  { to: "people", label: "People" },
  { to: "company", label: "Company info" },
  { to: "insights", label: "Insights" },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  if (!auth.get()) return <Navigate to="/admin/login" replace />;

  return (
    <div className="min-h-full">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Link to="/" className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
              {PRODUCT_NAME.slice(0, 2)}
            </Link>
            <span className="text-lg font-semibold">{PRODUCT_NAME}</span>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Admin</span>
          </div>
          <button
            className="text-sm text-slate-500 hover:text-slate-800"
            onClick={() => {
              auth.clear();
              navigate("/admin/login");
            }}
          >
            Sign out
          </button>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) =>
                `whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
                  isActive ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"
                }`
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Routes>
          <Route path="documents" element={<Documents />} />
          <Route path="people" element={<People />} />
          <Route path="company" element={<Company />} />
          <Route path="insights" element={<Insights />} />
          <Route path="*" element={<Navigate to="documents" replace />} />
        </Routes>
      </main>
    </div>
  );
}
