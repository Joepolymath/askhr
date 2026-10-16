import type { Citation } from "./client";

// POST /api/chat streams Server-Sent Events. EventSource only supports GET,
// so we read the response body stream and parse the SSE frames ourselves.

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface StreamHandlers {
  onMeta?: (d: { chat_id: string }) => void;
  onToken: (text: string) => void;
  onDone: (d: { chat_id: string; answer: string; citations: Citation[]; unanswered: boolean }) => void;
  onError: (message: string) => void;
}

export async function streamChat(
  body: { question: string; history: ChatTurn[]; employee_name: string | null },
  h: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    h.onError("Couldn't reach the server. Please try again.");
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
    else if (event === "token") h.onToken(payload.text);
    else if (event === "done") {
      finished = true;
      h.onDone(payload);
    } else if (event === "error") {
      finished = true;
      h.onError(payload.message);
    }
  };

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
  if (!finished) h.onError("The answer was interrupted. Please try again.");
}
