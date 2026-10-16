import type { ReactNode } from "react";
import type { Category, DocStatus } from "../api/client";

export const CATEGORY_LABELS: Record<Category, string> = {
  policy: "Policy",
  handbook: "Handbook",
  org_info: "Org info",
  other: "Other",
};

export function StatusBadge({ status }: { status: DocStatus }) {
  if (status === "ready")
    return (
      <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-green-100 px-2.5 text-[13px] font-medium text-green-900">
        <span className="h-[7px] w-[7px] rounded-full bg-green" />
        Ready
      </span>
    );
  if (status === "failed")
    return (
      <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-danger-100 px-2.5 text-[13px] font-medium text-danger-700">
        <span className="h-[7px] w-[7px] rounded-full bg-danger" />
        Failed
      </span>
    );
  return (
    <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-info-100 px-2.5 text-[13px] font-medium text-info">
      <span className="h-[9px] w-[9px] animate-spin rounded-full border-2 border-info-dot border-r-transparent" />
      Processing
    </span>
  );
}

export function Pill({ tone, children }: { tone: "green" | "info" | "ochre" | "neutral"; children: ReactNode }) {
  const tones = {
    green: "bg-green-100 text-green-900",
    info: "bg-info-100 text-info",
    ochre: "bg-ochre-100 text-ochre-800",
    neutral: "bg-chip text-ink-2",
  };
  return (
    <span className={`inline-flex h-6 items-center whitespace-nowrap rounded-full px-[9px] text-[13px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange?: () => void;
  label: string;
  disabled?: boolean;
}) {
  const bg = disabled ? (checked ? "bg-green-300" : "bg-line") : checked ? "bg-green" : "bg-line-strong";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`flex h-[26px] w-11 shrink-0 rounded-full p-[3px] transition-colors disabled:cursor-not-allowed ${bg} ${
        checked ? "justify-end" : "justify-start"
      }`}
    >
      <span className="block h-5 w-5 rounded-full bg-white" />
    </button>
  );
}

export function SearchBox({
  id,
  label,
  value,
  onChange,
  placeholder,
  className = "",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div
      className={`flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-white px-3 focus-within:border-ochre focus-within:shadow-[0_0_0_3px_theme(colors.ochre.100)] ${className}`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="shrink-0 text-ink-3">
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3 focus-visible:outline-none"
      />
    </div>
  );
}
