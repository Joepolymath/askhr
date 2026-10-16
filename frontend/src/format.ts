// Display formatting shared across pages.

const DAY = 24 * 60 * 60 * 1000;

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

const time = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

/** "12 Jan 2026" */
export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** "Today, 10:38" · "Yesterday, 16:12" · "12 Jan 2026" */
export function formatWhen(iso: string) {
  const d = new Date(iso);
  const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / DAY);
  if (days === 0) return `Today, ${time(d)}`;
  if (days === 1) return `Yesterday, ${time(d)}`;
  return formatDate(iso);
}

/** "today" · "yesterday" · "3 days ago" · "12 Jan 2026" */
export function formatAgo(iso: string) {
  const days = Math.round((startOfDay(new Date()) - startOfDay(new Date(iso))) / DAY);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return formatDate(iso);
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** "Good morning" etc. by local time. */
export function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function fileKind(mime: string) {
  if (mime === "application/pdf") return "PDF";
  if (mime.includes("wordprocessingml")) return "Word document";
  if (mime === "text/markdown") return "Markdown";
  return "Text";
}

/** "§2 Annual leave · p. 3" style location for a citation. */
export function citationLocation(section: string | null, page: number | null) {
  return [section, page ? `p. ${page}` : null].filter(Boolean).join(" · ");
}
