// Thin fetch wrapper. Two separate sessions:
// - admin: JWT in sessionStorage (cleared when the tab closes);
// - employee: JWT in localStorage when "Keep me signed in" is ticked, else sessionStorage.
// A 401 sends the admin back to the admin login, and the employee back to the
// sign-in page.

const ADMIN_KEY = "askhr.adminToken";
const EMPLOYEE_KEY = "askhr.employeeToken";
export const EMPLOYEE_SIGNED_OUT = "askhr:employee-signed-out";

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback; // storage blocked (private mode etc.)
  }
}

export const auth = {
  get: () => safe(() => sessionStorage.getItem(ADMIN_KEY), null),
  set: (t: string) => safe(() => sessionStorage.setItem(ADMIN_KEY, t), undefined),
  clear: () => safe(() => sessionStorage.removeItem(ADMIN_KEY), undefined),
};

export const employeeAuth = {
  get: () => safe(() => localStorage.getItem(EMPLOYEE_KEY) ?? sessionStorage.getItem(EMPLOYEE_KEY), null),
  set: (t: string, remember: boolean) =>
    safe(() => (remember ? localStorage : sessionStorage).setItem(EMPLOYEE_KEY, t), undefined),
  clear: () =>
    safe(() => {
      localStorage.removeItem(EMPLOYEE_KEY);
      sessionStorage.removeItem(EMPLOYEE_KEY);
    }, undefined),
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body: unknown,
  ) {
    super(message);
  }
}

const isAdminPath = (path: string) => path.startsWith("/api/admin");

export function authHeaders(path: string): Headers {
  const headers = new Headers();
  const token = isAdminPath(path) ? auth.get() : employeeAuth.get();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return headers;
}

export function handleUnauthorized(path: string) {
  if (isAdminPath(path)) {
    if (path !== "/api/admin/login") {
      auth.clear();
      window.location.assign("/admin/login");
    }
  } else if (path !== "/api/auth/login") {
    employeeAuth.clear();
    window.dispatchEvent(new Event(EMPLOYEE_SIGNED_OUT));
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = authHeaders(path);
  new Headers(init.headers).forEach((v, k) => headers.set(k, v));
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");

  const res = await fetch(path, { ...init, headers });
  if (res.status === 401) handleUnauthorized(path);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = (body as { detail?: unknown } | null)?.detail;
    throw new ApiError(res.status, typeof detail === "string" ? detail : `Request failed (${res.status})`, body);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export async function openProtectedFile(path: string) {
  // Open the tab synchronously so popup blockers allow it, then point it at the blob.
  const tab = window.open("", "_blank");
  const res = await fetch(path, { headers: authHeaders(path) });
  if (!res.ok) {
    tab?.close();
    if (res.status === 401) handleUnauthorized(path);
    throw new ApiError(res.status, "This document is no longer available", null);
  }
  const url = URL.createObjectURL(await res.blob());
  if (tab) tab.location.href = url;
  else window.location.assign(url);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// ---- types mirroring backend/app/schemas.py

export type Category = "policy" | "handbook" | "org_info" | "other";
export type DocStatus = "processing" | "ready" | "failed";

export interface DocumentOut {
  id: string;
  title: string;
  original_filename: string;
  category: Category;
  status: DocStatus;
  is_active: boolean;
  error_message: string | null;
  chunk_count: number;
  size_bytes: number;
  page_count: number | null;
  supersedes_id: string | null;
  uploaded_at: string;
  processed_at: string | null;
  version: number;
  replaced_by_title: string | null;
}

export interface Person {
  id?: string;
  name: string;
  role: string;
  department: string | null;
  email: string | null;
  employee_id: string | null;
  has_access: boolean;
  bio: string | null;
}

export interface Employee {
  id: string;
  name: string;
  role: string;
  department: string | null;
  email: string | null;
}

export interface PublicInfo {
  company_name: string;
  hr_contact_name: string;
  hr_contact_role: string | null;
  hr_contact_email: string;
  document_count: number;
}

export interface CompanyInfo {
  name: string;
  content: string;
  mission: string;
  hr_contact_name: string;
  hr_contact_email: string;
  updated_at?: string | null;
}

export interface Citation {
  index: number;
  document_id: string;
  document_title: string;
  section: string | null;
  page: number | null;
  snippet: string;
  similarity: number;
  chunk_id: string | null;
  document_updated_at: string | null;
}

export interface SourceDetail {
  document_id: string;
  document_title: string;
  mime_type: string;
  updated_at: string;
  section: string | null;
  page: number | null;
  page_count: number | null;
  before: string | null;
  text: string;
  after: string | null;
  has_file: boolean;
}

export type ImportResult = "new" | "update" | "unchanged" | "error";

export interface ImportRow {
  row: number;
  name: string;
  role: string;
  email: string;
  employee_id: string;
  department: string | null;
  result: ImportResult;
  message: string | null;
}

export interface ImportPreview {
  filename: string;
  total_rows: number;
  columns_matched: number;
  rows: ImportRow[];
  new_count: number;
  update_count: number;
  unchanged_count: number;
  error_count: number;
  missing: { id: string; name: string; employee_id: string | null }[];
  committed: boolean;
}

export type InsightsPeriod = "this_week" | "last_week" | "last_30_days";

export interface RecentQuestion {
  id: string;
  question: string;
  answer: string;
  citations: Citation[];
  result: "answered" | "not_found" | "conflict";
  rating: number | null;
  created_at: string;
}

export interface Gap {
  key: string;
  question: string;
  count: number;
  last_asked: string;
  closest_document_title: string | null;
}

export interface ConflictGroup {
  documents: string[];
  count: number;
  last_question: string;
  last_asked: string;
}

export interface Insights {
  period: InsightsPeriod;
  start: string;
  end: string;
  total_questions: number;
  previous_total: number;
  answered_count: number;
  not_found_count: number;
  rated_count: number;
  thumbs_up: number;
  gaps: Gap[];
  conflicts: ConflictGroup[];
  recent: RecentQuestion[];
}
