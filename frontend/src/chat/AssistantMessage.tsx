import type { ReactNode } from "react";
import type { Citation, PublicInfo } from "../api/client";
import { Avatar } from "../components/Brand";
import Icon from "../components/Icon";
import { useToast } from "../components/Toast";
import { citationLocation, formatDate, plural } from "../format";
import AnswerText from "./AnswerText";
import SourceChips, { SourceNumber } from "./SourceChips";
import type { Message } from "./types";

interface Props {
  m: Message;
  info: PublicInfo | null;
  activeIndex: number | null; // open source for this message, if any
  onOpenSource: (index: number) => void;
  onRate: (m: Message, rating: 1 | -1) => void;
  onAsk: (question: string) => void;
  related: string[];
}

function BotMark({ size }: { size: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full bg-green text-white" style={{ width: size, height: size }}>
      <Icon name="chat" size={size / 2} />
    </span>
  );
}

function Shell({ children, busy }: { children: ReactNode; busy?: boolean }) {
  return (
    <article aria-busy={busy} className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-3.5">
      <div className="flex items-center gap-2 sm:hidden">
        <BotMark size={24} />
        <span className="text-[13px] font-semibold text-ink-2">AskHR</span>
      </div>
      <span className="hidden sm:block">
        <BotMark size={32} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3.5 sm:pt-0.5">{children}</div>
    </article>
  );
}

const stripMarkers = (text: string) => text.replace(/\s?\[\d+(?:\s*,\s*\d+)*\]/g, "");

async function copy(text: string, toast: ReturnType<typeof useToast>, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${what} copied`);
  } catch {
    toast(`Couldn’t copy the ${what.toLowerCase()}`, { tone: "error" });
  }
}

function Feedback({ m, onRate, canCopy }: { m: Message; onRate: Props["onRate"]; canCopy: boolean }) {
  const toast = useToast();
  if (!m.chatId) return null;
  const btn = (r: 1 | -1) => {
    const pressed = m.rating === r;
    return (
      <button
        type="button"
        aria-label={r === 1 ? "Helpful" : "Not helpful"}
        aria-pressed={pressed}
        onClick={() => onRate(m, r)}
        className={`flex h-11 w-11 items-center justify-center rounded-[10px] border sm:h-10 sm:w-10 sm:rounded-lg ${
          pressed ? "border-green bg-green-100 text-green" : "border-transparent text-ink-2 hover:bg-chip"
        }`}
      >
        <Icon name={r === 1 ? "thumbUp" : "thumbDown"} />
      </button>
    );
  };
  return (
    <div className="flex flex-wrap items-center gap-1">
      {!m.rating && <span className="mr-1.5 hidden text-[13px] text-ink-3 sm:inline">Was this helpful?</span>}
      {btn(1)}
      {btn(-1)}
      {canCopy && (
        <button type="button" aria-label="Copy answer" onClick={() => copy(stripMarkers(m.content), toast, "Answer")} className="icon-btn">
          <Icon name="copy" />
        </button>
      )}
      {m.rating && <span className="ml-1 text-[13px] text-green">Thanks — HR sees this.</span>}
    </div>
  );
}

function Steps({ m }: { m: Message }) {
  const s = m.status ?? {};
  const done = (text: string) => (
    <li className="flex items-center gap-2.5 text-sm text-ink-2">
      <Icon name="check" size={16} strokeWidth={2.4} className="text-green" />
      {text}
    </li>
  );
  const working = (text: string) => (
    <li className="flex items-center gap-2.5 text-sm font-medium text-ink">
      <span className="flex w-4 justify-center gap-[3px]" aria-hidden="true">
        {[0, 0.2, 0.4].map((d) => (
          <span key={d} className="h-1 w-1 animate-pulsedot rounded-full bg-green" style={{ animationDelay: `${d}s` }} />
        ))}
      </span>
      {text}
    </li>
  );
  const found = s.found;
  const titles = found?.documents ?? [];
  const where =
    titles.length === 0 ? "" : titles.length <= 2 ? ` in ${titles.join(" and ")}` : ` in ${titles.length} documents`;
  return (
    <ol role="status" className="flex flex-col gap-2">
      {s.searched === undefined
        ? working("Searching company documents")
        : done(`Searched ${plural(s.searched, "company document")}`)}
      {found &&
        done(
          found.passages
            ? `Found ${plural(found.passages, "relevant passage")}${where}`
            : "No closely matching passages, checking company info and the directory",
        )}
      {found && working("Writing answer")}
    </ol>
  );
}

function ConflictCards({ citations }: { citations: Citation[] }) {
  const perDoc = new Map<string, Citation>();
  citations.forEach((c) => perDoc.has(c.document_id) || perDoc.set(c.document_id, c));
  const cards = [...perDoc.values()].sort(
    (a, b) => new Date(b.document_updated_at ?? 0).getTime() - new Date(a.document_updated_at ?? 0).getTime(),
  );
  if (cards.length < 2) return null;
  return (
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr))]">
      {cards.map((c, i) => (
        <figure key={c.document_id} className="flex flex-col gap-2.5 rounded-xl border border-line bg-white px-[18px] py-4">
          <div className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <SourceNumber n={c.index} size={22} />
              <span className="truncate text-sm font-semibold">{c.document_title}</span>
            </span>
            {c.document_updated_at && (
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                  i === 0 ? "bg-green-100 text-green-900" : "bg-chip text-ink-2"
                }`}
              >
                {i === 0 ? "Newer" : "Older"}
              </span>
            )}
          </div>
          <blockquote className="text-[15px] leading-6 text-ink-body">“{c.snippet}”</blockquote>
          <figcaption className="text-xs text-ink-3">
            {[citationLocation(c.section, c.page), c.document_updated_at && `updated ${formatDate(c.document_updated_at)}`]
              .filter(Boolean)
              .join(" · ")}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

function mailto(email: string, subject: string, body: string) {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function NotFound({ m, info, onAsk, related }: Pick<Props, "m" | "info" | "onAsk" | "related">) {
  const toast = useToast();
  const docs = info?.document_count ?? 0;
  const name = info?.hr_contact_name || "People & Culture";
  const email = info?.hr_contact_email;
  const question = m.question ?? "";
  return (
    <>
      <section className="flex flex-col gap-4 rounded-[14px] border border-info-line bg-info-100 px-[22px] py-5">
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-info">
            <Icon name="searchGap" />
          </span>
          <div className="flex flex-col gap-1.5">
            <h2 className="text-[17px] font-semibold leading-[26px] text-info-ink">I couldn’t find this in the company documents</h2>
            <p className="text-base leading-[26px] text-info">
              {docs
                ? `None of the ${plural(docs, "document")} HR has published answer this.`
                : "HR hasn’t published any documents that answer this yet."}{" "}
              Rather than guess, I’d suggest asking HR directly.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-[10px] bg-white px-4 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={name} size={40} />
            <div className="flex min-w-0 flex-col">
              <span className="text-[15px] font-semibold">{name}</span>
              <span className="truncate text-[13px] text-ink-2">
                {[info?.hr_contact_role, email].filter(Boolean).join(" · ")}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {email && (
              <a
                href={mailto(email, `Question: ${question}`, `Hi,\n\nI asked AskHR this and it couldn't find the answer in the published documents:\n\n"${question}"\n\nCould you help?\n`)}
                className="btn-primary"
              >
                <Icon name="mail" />
                Contact HR
              </a>
            )}
            <button type="button" className="btn-secondary px-3.5" onClick={() => copy(question, toast, "Question")}>
              <Icon name="copy" />
              Copy question
            </button>
          </div>
        </div>
        <p className="text-[13px] leading-5 text-info">
          HR sees unanswered questions (without your name) so they can add the missing information.
        </p>
      </section>
      {related.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[13px] text-ink-2">Related things I can answer</span>
          <div className="flex flex-wrap gap-2">
            {related.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => onAsk(q)}
                className="min-h-10 rounded-full border border-line bg-white px-3.5 text-left text-sm text-ink hover:border-line-strong"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export default function AssistantMessage({ m, info, activeIndex, onOpenSource, onRate, onAsk, related }: Props) {
  const citations = m.citations ?? [];
  const cited = new Set(citations.map((c) => c.index));
  const text = (
    <AnswerText text={m.content} citedIndices={cited} activeIndex={activeIndex} onCite={onOpenSource} streaming={m.streaming} />
  );

  if (m.streaming) {
    return (
      <Shell busy>
        <Steps m={m} />
        {m.content && text}
      </Shell>
    );
  }

  if (m.error) {
    return (
      <Shell>
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[10px] bg-danger-100 px-4 py-3 text-[15px] text-danger-900">
          <Icon name="alert" size={20} strokeWidth={2.2} />
          <span className="flex-1">{m.content}</span>
          {m.question && (
            <button type="button" onClick={() => onAsk(m.question!)} className="btn-ghost h-9 text-danger-900 hover:bg-white/60">
              Try again
            </button>
          )}
        </div>
      </Shell>
    );
  }

  if (m.unanswered) {
    return (
      <Shell>
        <NotFound m={m} info={info} onAsk={onAsk} related={related} />
        <Feedback m={m} onRate={onRate} canCopy={false} />
      </Shell>
    );
  }

  const email = info?.hr_contact_email;
  return (
    <Shell>
      {m.conflict && (
        <div className="inline-flex h-[30px] items-center gap-2 self-start rounded-full bg-ochre-100 px-3 text-[13px] font-semibold text-ochre-800">
          <Icon name="split" size={16} />
          Two documents give different answers
        </div>
      )}
      {m.content ? text : m.stopped ? null : <p className="text-ink-3">No answer.</p>}
      {m.stopped && <p className="text-[13px] text-ink-3">You stopped this answer.</p>}
      {m.conflict && (
        <>
          <ConflictCards citations={citations} />
          <div className="flex flex-wrap items-center gap-2.5">
            {email && (
              <a
                href={mailto(email, `Documents disagree: ${m.question ?? ""}`, `Hi,\n\nI asked AskHR "${m.question ?? ""}" and two documents gave different answers. Which one is current?\n`)}
                className="btn-primary px-4"
              >
                <Icon name="mail" />
                Confirm with HR
              </a>
            )}
            <span className="text-[13px] text-ink-2">HR has been notified that these documents disagree.</span>
          </div>
        </>
      )}
      <SourceChips citations={citations} activeIndex={activeIndex} onOpen={onOpenSource} />
      {!m.stopped && <Feedback m={m} onRate={onRate} canCopy />}
    </Shell>
  );
}
