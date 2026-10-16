import Icon from "./Icon";

export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-lg bg-green text-white"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Icon name="chat" size={Math.round(size * 0.57)} />
    </span>
  );
}

export function Logo({ size = 30, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} />
      <span className="text-lg font-semibold tracking-[-0.01em] text-ink">
        Ask<span className="text-green">HR</span>
      </span>
    </span>
  );
}

export function AdminPill() {
  return (
    <span className="rounded-[5px] bg-green-100 px-[7px] py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-green-900">
      Admin
    </span>
  );
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function Avatar({ name, size = 34, className = "" }: { name: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-green-100 font-semibold text-green-900 ${className}`}
      style={{ width: size, height: size, fontSize: size <= 34 ? 13 : 14 }}
    >
      {initials(name)}
    </span>
  );
}
