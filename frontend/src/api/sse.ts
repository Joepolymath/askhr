import { authHeaders, handleUnauthorized, type Citation } from "./client";

// POST /api/chat streams Server-Sent Events. EventSource only supports GET,
// so we read the response body stream and parse the SSE frames ourselves.

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export type StatusEvent =
  | { step: "searched"; documents: number }
  | { step: "found"; passages: number; documents: string[] }
  | { step: "conflict" };

export interface DoneEvent {
  chat_id: string;
  answer: string;
  citations: Citation[];
  unanswered: boolean;
  conflict: boolean;
}

export interface StreamHandlers {
  onMeta?: (d: { chat_id: string }) => void;
  onStatus?: (d: StatusEvent) => void;
  onToken: (text: string) => void;
  onDone: (d: DoneEvent) => void;
  onError: (message: string) => void;
}

export async function streamChat(
  body: { question: string; history: ChatTurn[] },
  h: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  const headers = authHeaders("/api/chat");
  headers.set("Content-Type", "application/json");
  try {
    res = await fetch("/api/chat", { method: "POST", headers, body: JSON.stringify(body), signal });
  } catch {
    if (!signal?.aborted) h.onError("Couldn't reach the server. Please try again.");
    return;
  }
  if (res.status === 401) {
    handleUnauthorized("/api/chat");
    return;
  }
  if (!res.ok || !res.body) {
    h.onError(`Something went wrong (${res.status}). Please try again.`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;

  const handle = (frame: string) => {
    let event = "message";
    let data = "";
    for (const line of frame.split("\n")) {
      if (line.startsWith("event: ")) event = line.slice(7);
      else if (line.startsWith("data: ")) data += line.slice(6);
    }
    if (!data) return;
    const payload = JSON.parse(data);
    if (event === "meta") h.onMeta?.(payload);
    else if (event === "status") h.onStatus?.(payload);
    else if (event === "token") h.onToken(payload.text);
    else if (event === "done") {
      finished = true;
      h.onDone(payload);
    } else if (event === "error") {
      finished = true;
      h.onError(payload.message);
    }
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        handle(buffer.slice(0, idx));
        buffer = buffer.slice(idx + 2);
      }
    }
  } catch {
    if (signal?.aborted) return; // "Stop generating"
  }
  if (!finished && !signal?.aborted) h.onError("The answer was interrupted. Please try again.");
}
