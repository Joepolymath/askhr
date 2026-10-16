// Thin fetch wrapper. The admin JWT lives in sessionStorage (cleared when the
// tab closes); a 401 anywhere sends the admin back to the login page.

const TOKEN_KEY = "askhr.adminToken";

export const auth = {
  get: () => sessionStorage.getItem(TOKEN_KEY),
  set: (t: string) => sessionStorage.setItem(TOKEN_KEY, t),
  clear: () => sessionStorage.removeItem(TOKEN_KEY),
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

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = auth.get();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");

  const res = await fetch(path, { ...init, headers });
  if (res.status === 401 && path.startsWith("/api/admin") && path !== "/api/admin/login") {
    auth.clear();
    window.location.assign("/admin/login");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = (body as { detail?: unknown } | null)?.detail;
    throw new ApiError(res.status, typeof detail === "string" ? detail : `Request failed (${res.status})`, body);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
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
  supersedes_id: string | null;
  uploaded_at: string;
  processed_at: string | null;
}

export interface Person {
  id?: string;
  name: string;
  role: string;
  department: string | null;
  email: string | null;
  bio: string | null;
}

export interface Citation {
  index: number;
  document_id: string;
  document_title: string;
  section: string | null;
  page: number | null;
  snippet: string;
  similarity: number;
}

export interface ChatLog {
  id: string;
  employee_name: string | null;
  question: string;
  answer: string;
  citations: Citation[];
  unanswered: boolean;
  top_similarity: number | null;
  rating: number | null;
  created_at: string;
}

export interface Insights {
  total_questions: number;
  unanswered_count: number;
  thumbs_up: number;
  thumbs_down: number;
  recent: ChatLog[];
  unanswered: ChatLog[];
  rated: ChatLog[];
}
