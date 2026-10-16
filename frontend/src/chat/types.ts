import type { Citation } from "../api/client";

export interface StreamStatus {
  searched?: number;
  found?: { passages: number; documents: string[] };
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  question?: string; // assistant: the question it answers
  citations?: Citation[];
  chatId?: string;
  unanswered?: boolean;
  conflict?: boolean;
  rating?: 1 | -1;
  streaming?: boolean;
  stopped?: boolean;
  error?: boolean;
  status?: StreamStatus;
}
