import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, type Citation } from "../api/client";
import { streamChat, type ChatTurn } from "../api/sse";
import AnswerText from "../components/AnswerText";
import CitationChips from "../components/CitationChips";
import { PRODUCT_NAME, STARTER_QUESTIONS } from "../config";

const NAME_KEY = "askhr.employeeName";
const HISTORY_TURNS = 6; // last few turns sent for follow-up context
const newId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  chatId?: string;
  unanswered?: boolean;
  rating?: 1 | -1;
  streaming?: boolean;
  error?: boolean;
}

function readName(): string | null {
  try {
    return localStorage.getItem(NAME_KEY);
  } catch {
    return null;
  }
}

function NamePrompt({ onSave }: { onSave: (name: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) onSave(value.trim());
        }}
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="text-lg font-semibold">Welcome to {PRODUCT_NAME}</h2>
        <p className="mt-1 text-sm text-slate-500">Ask questions about company policies, benefits and people.</p>
        <label className="mt-5 block text-sm font-medium text-slate-700" htmlFor="name">
          What's your name?
        </label>
        <input
          id="name"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          placeholder="e.g. Alex Kim"
        />
        <button className="mt-4 w-full rounded-lg bg-brand-600 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-50" disabled={!value.trim()}>
          Start
        </button>
      </form>
    </div>
  );
}

function AssistantMessage({ m, onRate }: { m: Message; onRate: (m: Message, r: 1 | -1) => void }) {
  const [openCite, setOpenCite] = useState<number | null>(null);
  const cited = new Set((m.citations ?? []).map((c) => c.index));
  const toggle = (i: number) => setOpenCite((cur) => (cur === i ? null : i));
  return (
    <div className="flex justify-start">
      <div
        className={`w-full max-w-[85%] rounded-2xl rounded-tl-sm border bg-white px-4 py-3 shadow-sm sm:max-w-[75%] ${
          m.error ? "border-red-200 text-red-700" : m.unanswered ? "border-amber-200" : "border-slate-200"
        }`}
      >
        {m.content ? (
          <AnswerText text={m.content} citedIndices={cited} onCite={toggle} />
        ) : (
          <div className="flex gap-1 py-1" aria-label="Thinking">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-slate-300" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        )}
        <CitationChips citations={m.citations ?? []} openIndex={openCite} onToggle={toggle} />
        {m.chatId && !m.streaming && !m.error && (
          <div className="mt-2 flex items-center gap-1 text-slate-400">
            <span className="mr-1 text-xs">Helpful?</span>
            {([1, -1] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onRate(m, r)}
                aria-pressed={m.rating === r}
                aria-label={r === 1 ? "Helpful" : "Not helpful"}
                className={`rounded p-1 text-base leading-none hover:bg-slate-100 ${m.rating === r ? "text-brand-600" : ""} ${
                  m.rating && m.rating !== r ? "opacity-40" : ""
                }`}
              >
                {r === 1 ? "👍" : "👎"}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Chat() {
  const [name, setName] = useState<string | null>(readName);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const saveName = (n: string) => {
    try {
      localStorage.setItem(NAME_KEY, n);
    } catch {
      /* private mode: keep it in memory */
    }
    setName(n);
  };

  const update = (id: string, patch: Partial<Message> | ((m: Message) => Partial<Message>)) =>
    setMessages((ms) => ms.map((m) => (m.id === id ? { ...m, ...(typeof patch === "function" ? patch(m) : patch) } : m)));

  async function ask(question: string) {
    question = question.trim();
    if (!question || busy) return;
    const history: ChatTurn[] = messages
      .filter((m) => !m.error && !m.streaming && m.content)
      .slice(-HISTORY_TURNS)
      .map((m) => ({ role: m.role, content: m.content }));
    const assistantId = newId();
    setMessages((ms) => [
      ...ms,
      { id: newId(), role: "user", content: question },
      { id: assistantId, role: "assistant", content: "", streaming: true },
    ]);
    setInput("");
    setBusy(true);
    await streamChat(
      { question, history, employee_name: name },
      {
        onMeta: (d) => update(assistantId, { chatId: d.chat_id }),
        onToken: (t) => update(assistantId, (m) => ({ content: m.content + t })),
        onDone: (d) =>
          update(assistantId, {
            content: d.answer,
            citations: d.citations,
            unanswered: d.unanswered,
            chatId: d.chat_id,
            streaming: false,
          }),
        onError: (msg) => update(assistantId, { content: msg, error: true, streaming: false }),
      },
    );
    setBusy(false);
  }

  async function rate(m: Message, rating: 1 | -1) {
    if (!m.chatId) return;
    update(m.id, { rating });
    try {
      await api(`/api/chat/${m.chatId}/feedback`, { method: "POST", body: JSON.stringify({ rating }) });
    } catch {
      update(m.id, { rating: undefined });
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    ask(input);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
              {PRODUCT_NAME.slice(0, 2)}
            </div>
            <span className="text-lg font-semibold">{PRODUCT_NAME}</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-500">
            {name && (
              <button className="hidden hover:text-slate-800 sm:inline" onClick={() => setMessages([])} disabled={busy}>
                New chat
              </button>
            )}
            <Link to="/admin" className="hover:text-slate-800">
              Admin
            </Link>
          </div>
        </div>
      </header>

      {!name ? (
        <NamePrompt onSave={saveName} />
      ) : (
        <>
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
              {messages.length === 0 && (
                <div className="py-10 text-center">
                  <h1 className="text-2xl font-semibold">Hi {name.split(" ")[0]}, how can I help?</h1>
                  <p className="mt-2 text-slate-500">I answer from the company's HR knowledge base and cite my sources.</p>
                  <div className="mx-auto mt-6 flex max-w-xl flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
                    {STARTER_QUESTIONS.map((q) => (
                      <button
                        key={q}
                        onClick={() => ask(q)}
                        className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm hover:border-brand-500 hover:text-brand-700"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-brand-600 px-4 py-2.5 text-white sm:max-w-[75%]">
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <AssistantMessage key={m.id} m={m} onRate={rate} />
                ),
              )}
              <div ref={bottomRef} />
            </div>
          </main>

          <footer className="border-t border-slate-200 bg-white">
            <form onSubmit={submit} className="mx-auto flex max-w-3xl gap-2 px-4 py-3">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    ask(input);
                  }
                }}
                rows={1}
                maxLength={2000}
                placeholder="Ask a question about policies, benefits or people…"
                className="max-h-40 flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="rounded-xl bg-brand-600 px-4 font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                Send
              </button>
            </form>
            <p className="pb-3 text-center text-xs text-slate-400">
              Answers come from HR documents and may be incomplete. For anything important, confirm with HR.
            </p>
          </footer>
        </>
      )}
    </div>
  );
}
