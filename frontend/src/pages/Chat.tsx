import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "../api/client";
import { streamChat, type ChatTurn } from "../api/sse";
import AssistantMessage from "../chat/AssistantMessage";
import SourcePanel from "../chat/SourcePanel";
import type { Message } from "../chat/types";
import { Avatar, Logo } from "../components/Brand";
import Icon from "../components/Icon";
import { starterQuestions } from "../config";
import { greeting } from "../format";
import { useSession } from "../session";
import { CompanyName } from "./Welcome";

const HISTORY_TURNS = 6; // last few turns sent for follow-up context
const newId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

function useIsDesktop() {
  const query = "(min-width: 1024px)";
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return match;
}

const WORD = /[a-z]{4,}/g;
/** Up to two starter questions that share words with an unanswered question. */
function relatedQuestions(question: string, pool: string[]): string[] {
  const words = new Set(question.toLowerCase().match(WORD) ?? []);
  const scored = pool
    .filter((q) => q.toLowerCase() !== question.toLowerCase())
    .map((q) => ({ q, score: (q.toLowerCase().match(WORD) ?? []).filter((w) => words.has(w)).length }));
  const hits = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
  return (hits.length ? hits : scored).slice(0, 2).map((s) => s.q);
}

function UserMenu() {
  const { employee, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  if (!employee) return null;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={`Signed in as ${employee.name}`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="rounded-full"
      >
        <Avatar name={employee.name} size={36} />
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-30 w-64 rounded-xl border border-line bg-white p-2 shadow-card">
          <div className="flex flex-col px-3 py-2">
            <span className="text-sm font-semibold">{employee.name}</span>
            <span className="truncate text-[13px] text-ink-3">{employee.email}</span>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="flex h-10 w-full items-center gap-2.5 rounded-lg px-3 text-sm font-medium text-ink-body hover:bg-chip"
          >
            <Icon name="signOut" size={16} />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export default function Chat() {
  const { employee, info } = useSession();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [openSource, setOpenSource] = useState<{ messageId: string; index: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isDesktop = useIsDesktop();

  const company = info?.company_name ?? "";
  const starters = starterQuestions(company);
  const firstName = employee?.name.split(/\s+/)[0] ?? "";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  // Grow the composer with its content, up to a limit.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const update = (id: string, patch: Partial<Message> | ((m: Message) => Partial<Message>)) =>
    setMessages((ms) => ms.map((m) => (m.id === id ? { ...m, ...(typeof patch === "function" ? patch(m) : patch) } : m)));

  const ask = useCallback(
    async (raw: string) => {
      const question = raw.trim();
      if (!question || busy) return;
      const history: ChatTurn[] = messages
        .filter((m) => !m.error && !m.streaming && m.content && !m.unanswered)
        .slice(-HISTORY_TURNS)
        .map((m) => ({ role: m.role, content: m.content }));
      const assistantId = newId();
      setMessages((ms) => [
        ...ms,
        { id: newId(), role: "user", content: question },
        { id: assistantId, role: "assistant", content: "", question, streaming: true, status: {} },
      ]);
      setInput("");
      setOpenSource(null);
      setBusy(true);
      const controller = new AbortController();
      abortRef.current = controller;
      await streamChat(
        { question, history },
        {
          onMeta: (d) => update(assistantId, { chatId: d.chat_id }),
          onStatus: (s) =>
            update(assistantId, (m) =>
              s.step === "searched"
                ? { status: { ...m.status, searched: s.documents } }
                : s.step === "found"
                  ? { status: { ...m.status, found: { passages: s.passages, documents: s.documents } } }
                  : {},
            ),
          onToken: (t) => update(assistantId, (m) => ({ content: m.content + t })),
          onDone: (d) =>
            update(assistantId, {
              content: d.answer,
              citations: d.citations,
              unanswered: d.unanswered,
              conflict: d.conflict,
              chatId: d.chat_id,
              streaming: false,
            }),
          onError: (msg) => update(assistantId, { content: msg, error: true, streaming: false }),
        },
        controller.signal,
      );
      if (controller.signal.aborted) update(assistantId, { streaming: false, stopped: true });
      abortRef.current = null;
      setBusy(false);
      inputRef.current?.focus();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busy, messages],
  );

  const stop = () => abortRef.current?.abort();

  const newConversation = () => {
    abortRef.current?.abort();
    setMessages([]);
    setOpenSource(null);
    setInput("");
    inputRef.current?.focus();
  };

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

  const openMessage = openSource ? messages.find((m) => m.id === openSource.messageId) : undefined;
  const closeSource = useCallback(() => setOpenSource(null), []);
  const empty = messages.length === 0;

  const composer = (
    <div
      className={`px-3 pb-[30px] pt-2.5 sm:px-6 sm:pb-5 sm:pt-3 ${
        empty ? "sm:bg-[linear-gradient(rgba(247,245,240,0),theme(colors.paper)_24px)]" : ""
      } ${!empty ? "border-t border-line sm:border-0" : ""}`}
    >
      <form onSubmit={submit} className="mx-auto flex max-w-[760px] flex-col gap-2">
        {busy && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={stop}
              className="flex h-10 items-center gap-2 rounded-full border border-line-strong bg-white px-4 text-sm font-medium text-ink hover:bg-subtle"
            >
              <span className="h-2.5 w-2.5 rounded-sm bg-ink" />
              Stop generating
            </button>
          </div>
        )}
        <label htmlFor="chat-q" className="sr-only">
          Your question
        </label>
        <div
          className={`flex items-end gap-2 rounded-[14px] border bg-white py-1.5 pl-3.5 pr-1.5 sm:py-2 sm:pl-4 sm:pr-2 ${
            busy ? "border-line" : "border-line-strong sm:shadow-composer"
          } focus-within:border-ochre`}
        >
          <textarea
            id="chat-q"
            ref={inputRef}
            rows={1}
            value={input}
            disabled={busy}
            maxLength={2000}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                ask(input);
              }
            }}
            placeholder={
              busy
                ? "Wait for the answer to finish…"
                : empty
                  ? isDesktop
                    ? "Ask a question about policies, leave or people…"
                    : "Ask a question…"
                  : "Ask a follow-up…"
            }
            className="max-h-40 flex-1 resize-none bg-transparent py-2.5 text-base leading-6 text-ink outline-none placeholder:text-ink-3 focus-visible:outline-none disabled:text-ink-3"
          />
          <button
            type="submit"
            aria-label="Send question"
            disabled={busy || !input.trim()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-green text-white hover:bg-green-900 disabled:bg-line disabled:text-ink-3"
          >
            <Icon name="arrowUp" size={20} />
          </button>
        </div>
        <p className="hidden text-center text-xs leading-[18px] text-ink-3 sm:block">
          AskHR answers only from company documents. For anything important, check the cited source.
        </p>
      </form>
    </div>
  );

  return (
    <div className="flex h-full flex-col bg-paper">
      <header className="flex items-center justify-between gap-4 border-b border-line bg-white py-2 pl-4 pr-2 sm:px-6 sm:py-3">
        <div className="flex items-center gap-2.5">
          <Logo />
          <CompanyName name={company} />
        </div>
        <div className="flex items-center gap-1 sm:gap-3">
          <button
            type="button"
            onClick={newConversation}
            aria-label="New conversation"
            className="flex h-11 w-11 items-center justify-center rounded-[10px] text-ink hover:bg-chip sm:hidden"
          >
            <Icon name="compose" size={22} />
          </button>
          <button type="button" onClick={newConversation} className="btn-secondary hidden h-10 px-3.5 text-sm sm:inline-flex">
            <Icon name="plus" size={16} />
            New conversation
          </button>
          <UserMenu />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex h-full min-w-0 flex-[999_1_560px] flex-col">
          <main
            className={`flex-1 overflow-y-auto ${
              empty ? "flex flex-col px-4 pb-3 pt-7 sm:items-center sm:justify-center sm:px-6 sm:pb-6 sm:pt-12" : "px-4 pb-2 pt-5 sm:px-6 sm:pb-4 sm:pt-8"
            }`}
          >
            {empty ? (
              <div className="flex w-full max-w-[760px] flex-col gap-6 sm:gap-8">
                <div className="flex flex-col gap-2 sm:gap-2.5">
                  <h1 className="text-[26px] font-semibold leading-[34px] tracking-[-0.02em] sm:text-[32px] sm:leading-10">
                    {greeting()}
                    {firstName && `, ${firstName}`}
                  </h1>
                  <p className="text-base leading-[25px] text-ink-2 sm:text-[17px] sm:leading-7">
                    Ask about leave, policies, people or how things work{company ? ` at ${company}` : ""}. Answers come
                    from documents published by HR.
                  </p>
                </div>
                <div className="flex flex-col gap-2.5 sm:gap-3">
                  <h2 className="eyebrow sm:text-[13px]">Try asking</h2>
                  <div className="hidden gap-3 sm:grid sm:[grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr))]">
                    {starters.map((s) => (
                      <button
                        key={s.question}
                        type="button"
                        onClick={() => ask(s.question)}
                        className="flex min-h-[92px] flex-col justify-between gap-3 rounded-xl border border-line bg-white p-4 text-left text-ink hover:border-line-strong hover:shadow-composer"
                      >
                        <span className="text-[15px] font-medium leading-[22px]">{s.question}</span>
                        <span className="text-xs font-medium text-ink-3">{s.topic}</span>
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-col gap-2.5 sm:hidden">
                    {starters.slice(0, 4).map((s) => (
                      <button
                        key={s.question}
                        type="button"
                        onClick={() => ask(s.question)}
                        className="flex min-h-[52px] items-center justify-between gap-3 rounded-xl border border-line bg-white px-3.5 py-3 text-left text-[15px] font-medium text-ink"
                      >
                        {s.question}
                        <Icon name="chevronRight" className="shrink-0 text-ink-3" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mx-auto flex max-w-[760px] flex-col gap-5 sm:gap-7">
                {messages.map((m) =>
                  m.role === "user" ? (
                    <div key={m.id} className="flex justify-end">
                      <p className="max-w-[280px] whitespace-pre-wrap rounded-[16px_16px_4px_16px] bg-green-100 px-3.5 py-2.5 text-base leading-6 sm:max-w-[520px] sm:px-4 sm:py-3">
                        {m.content}
                      </p>
                    </div>
                  ) : (
                    <AssistantMessage
                      key={m.id}
                      m={m}
                      info={info}
                      activeIndex={openSource?.messageId === m.id ? openSource.index : null}
                      onOpenSource={(index) =>
                        setOpenSource((cur) =>
                          cur?.messageId === m.id && cur.index === index ? null : { messageId: m.id, index },
                        )
                      }
                      onRate={rate}
                      onAsk={ask}
                      related={m.unanswered ? relatedQuestions(m.question ?? "", starters.map((s) => s.question)) : []}
                    />
                  ),
                )}
                <div ref={bottomRef} />
              </div>
            )}
          </main>
          {composer}
        </div>

        {openMessage && openSource && (
          <SourcePanel
            variant={isDesktop ? "panel" : "sheet"}
            citations={openMessage.citations ?? []}
            index={openSource.index}
            onNavigate={(index) => setOpenSource({ messageId: openMessage.id, index })}
            onClose={closeSource}
          />
        )}
      </div>
    </div>
  );
}
