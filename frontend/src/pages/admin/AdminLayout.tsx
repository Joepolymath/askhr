import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { api, auth, type Insights as InsightsData } from "../../api/client";
import { AdminPill, Avatar, Logo } from "../../components/Brand";
import Icon, { type IconName } from "../../components/Icon";
import Company from "./Company";
import Documents from "./Documents";
import Insights from "./Insights";
import People from "./People";

const TABS: { to: string; label: string; icon: IconName }[] = [
  { to: "documents", label: "Documents", icon: "document" },
  { to: "people", label: "People", icon: "people" },
  { to: "company", label: "Company info", icon: "building" },
  { to: "insights", label: "Insights", icon: "chart" },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const [gapCount, setGapCount] = useState(0);

  const refreshBadge = useCallback(() => {
    api<InsightsData>("/api/admin/insights?period=this_week")
      .then((d) => setGapCount(d.gaps.length))
      .catch(() => {});
  }, []);
  useEffect(refreshBadge, [refreshBadge]);

  if (!auth.get()) return <Navigate to="/admin/login" replace />;

  const signOut = () => {
    auth.clear();
    navigate("/admin/login");
  };

  return (
    <div className="flex min-h-full flex-col bg-paper md:flex-row">
      <nav
        aria-label="Admin sections"
        className="flex shrink-0 flex-col gap-3 border-b border-line bg-white px-3 py-3 md:sticky md:top-0 md:h-screen md:w-60 md:gap-7 md:border-b-0 md:border-r md:py-5"
      >
        <div className="flex items-center justify-between gap-2.5 px-2">
          <span className="flex items-center gap-2.5">
            <Logo />
            <AdminPill />
          </span>
          <button type="button" aria-label="Sign out" onClick={signOut} className="icon-btn md:hidden">
            <Icon name="signOut" />
          </button>
        </div>
        <div className="-mx-1 flex gap-0.5 overflow-x-auto px-1 md:mx-0 md:flex-col md:px-0">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) =>
                `flex h-11 shrink-0 items-center gap-3 whitespace-nowrap rounded-lg px-3 text-[15px] no-underline ${
                  isActive
                    ? "bg-green-100 font-semibold text-green-900 hover:text-green-900"
                    : "font-medium text-ink-body hover:bg-subtle hover:text-ink"
                }`
              }
            >
              <Icon name={t.icon} />
              {t.label}
              {t.to === "insights" && gapCount > 0 && (
                <span
                  aria-label={`${gapCount} open gaps`}
                  className="ml-auto flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-ochre-100 px-1.5 text-xs font-semibold text-ochre-800"
                >
                  {gapCount}
                </span>
              )}
            </NavLink>
          ))}
        </div>
        <div className="hidden flex-1 md:block" />
        <div className="hidden flex-col gap-3 border-t border-line pt-4 md:flex">
          <Link
            to="/"
            className="flex h-10 items-center gap-2.5 rounded-lg px-3 text-sm font-medium text-ink-body no-underline hover:bg-subtle hover:text-ink"
          >
            <Icon name="external" size={16} />
            Open employee chat
          </Link>
          <div className="flex items-center gap-2.5 px-2">
            <Avatar name="H R" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-semibold">HR admin</span>
              <span className="text-xs text-ink-3">People &amp; Culture</span>
            </span>
            <button type="button" aria-label="Sign out" onClick={signOut} className="icon-btn">
              <Icon name="signOut" />
            </button>
          </div>
        </div>
      </nav>

      <main className="min-w-0 flex-1 px-4 pb-12 pt-6 sm:px-10 sm:pt-8">
        <Routes>
          <Route path="documents" element={<Documents />} />
          <Route path="people" element={<People />} />
          <Route path="company" element={<Company />} />
          <Route path="insights" element={<Insights onChange={refreshBadge} />} />
          <Route path="*" element={<Navigate to="documents" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export function PageHeader({ title, intro, actions }: { title: string; intro?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[28px] font-semibold leading-9 tracking-[-0.01em]">{title}</h1>
        {intro && <p className="max-w-[620px] text-[15px] leading-6 text-ink-2">{intro}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2.5">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  actions,
  dashed,
}: {
  icon: IconName;
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  dashed?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center gap-5 rounded-2xl bg-white px-6 py-16 text-center ${
        dashed ? "border-2 border-dashed border-line-strong" : "border border-line"
      }`}
    >
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-green-100 text-green">
        <Icon name={icon} size={30} strokeWidth={1.8} />
      </span>
      <div className="flex max-w-[540px] flex-col gap-2">
        <h2 className="text-[22px] font-semibold leading-[30px]">{title}</h2>
        <p className="text-base leading-[26px] text-ink-2">{children}</p>
      </div>
      {actions}
    </div>
  );
}
