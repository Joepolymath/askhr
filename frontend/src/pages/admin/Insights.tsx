import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Insights as InsightsData, type InsightsPeriod, type RecentQuestion } from "../../api/client";
import { Pill } from "../../components/Badges";
import Icon from "../../components/Icon";
import { useToast } from "../../components/Toast";
import { formatAgo, formatWhen, plural } from "../../format";
import { EmptyState, PageHeader } from "./AdminLayout";

const PERIOD_PHRASE: Record<InsightsPeriod, string> = {
  this_week: "this week",
  last_week: "last week",
  last_30_days: "in the last 30 days",
};
const COMPARE_PHRASE: Record<InsightsPeriod, string> = {
  this_week: "vs last week",
  last_week: "vs the week before",
  last_30_days: "vs the 30 days before",
};

function weekRange(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(new Date(end).getTime() - 1);
  const sameMonth = s.getMonth() === e.getMonth();
  const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric" });
  const month = (d: Date) => d.toLocaleDateString("en-GB", { month: "short" });
  return sameMonth ? `${day(s)}–${day(e)} ${month(e)}` : `${day(s)} ${month(s)} – ${day(e)} ${month(e)}`;
}

function pct(n: number, of: number) {
  return of ? Math.round((n / of) * 100) : 0;
}

function Stat({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[14px] border border-line bg-white px-[22px] py-5">
      <span className="text-sm font-medium text-ink-2">{label}</span>
      <span className="text-4xl font-semibold leading-[44px] tracking-[-0.02em]">{value}</span>
      {children}
    </div>
  );
}

function Meter({ value, label }: { value: number; label: string }) {
  return (
    <div role="img" aria-label={label} className="mt-1 h-1.5 overflow-hidden rounded-full bg-chip">
      <div className="h-full rounded-full bg-green" style={{ width: `${value}%` }} />
    </div>
  );
}

function Result({ r }: { r: RecentQuestion["result"] }) {
  if (r === "answered") return <Pill tone="green">Answered</Pill>;
  if (r === "conflict") return <Pill tone="ochre">Sources disagree</Pill>;
  return <Pill tone="info">Not found</Pill>;
}

function Rating({ rating }: { rating: number | null }) {
  if (rating === 1)
    return (
      <span className="inline-flex items-center gap-1.5 font-medium text-green">
        <Icon name="thumbUp" size={16} />
        Helpful
      </span>
    );
  if (rating === -1)
    return (
      <span className="inline-flex items-center gap-1.5 font-medium text-danger-700">
        <Icon name="thumbDown" size={16} />
        Not helpful
      </span>
    );
  return <span className="text-ink-3">No rating</span>;
}

export default function Insights({ onChange }: { onChange?: () => void }) {
  const [period, setPeriod] = useState<InsightsPeriod>("this_week");
  const [data, setData] = useState<InsightsData | null>(null);
  const [thisWeekLabel, setThisWeekLabel] = useState("This week");
  const [expanded, setExpanded] = useState<string | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const d = await api<InsightsData>(`/api/admin/insights?period=${period}`);
      setData(d);
      if (period === "this_week") setThisWeekLabel(`This week (${weekRange(d.start, d.end)})`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn’t load insights", { tone: "error" });
    }
  }, [period, toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function dismiss(key: string) {
    try {
      await api("/api/admin/insights/gaps/dismiss", { method: "POST", body: JSON.stringify({ key }) });
      await load();
      onChange?.();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn’t dismiss", { tone: "error" });
    }
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      toast("Link copied — share it with staff");
    } catch {
      toast(window.location.origin);
    }
  };

  const periodPicker = (
    <div className="flex items-center gap-2">
      <label htmlFor="ai-range" className="text-sm text-ink-2">
        Period
      </label>
      <select
        id="ai-range"
        value={period}
        onChange={(e) => setPeriod(e.target.value as InsightsPeriod)}
        className="select h-10 w-auto text-sm"
      >
        <option value="this_week">{thisWeekLabel}</option>
        <option value="last_week">Last week</option>
        <option value="last_30_days">Last 30 days</option>
      </select>
    </div>
  );

  const intro = "What employees are asking, and where the documents fall short.";

  if (data && data.total_questions === 0 && data.previous_total === 0 && period === "this_week") {
    return (
      <div className="mx-auto flex max-w-[1120px] flex-col gap-7">
        <PageHeader title="Insights" intro={intro} actions={periodPicker} />
        <EmptyState
          icon="chart"
          title="No questions yet"
          actions={
            <div className="flex flex-wrap justify-center gap-2.5">
              <button type="button" onClick={copyLink} className="btn-primary h-12 px-5 text-base">
                <Icon name="copy" />
                Copy link to share with staff
              </button>
              <Link to="/" className="btn-secondary h-12 text-base">
                Try it yourself
              </Link>
            </div>
          }
        >
          Once employees start asking, you’ll see what they ask most, how often AskHR finds an answer, and the gaps worth
          filling with a new document.
        </EmptyState>
      </div>
    );
  }

  const delta = data ? data.total_questions - data.previous_total : 0;
  const answeredPct = data ? pct(data.answered_count, data.total_questions) : 0;
  const upPct = data ? pct(data.thumbs_up, data.rated_count) : 0;

  return (
    <div className="mx-auto flex max-w-[1120px] flex-col gap-7">
      <PageHeader title="Insights" intro={intro} actions={periodPicker} />

      {!data ? (
        <p className="text-ink-3">Loading…</p>
      ) : (
        <>
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr))]">
            <Stat label="Questions asked" value={String(data.total_questions)}>
              <span className="text-[13px] text-ink-2">
                <span className={`font-semibold ${delta >= 0 ? "text-green" : "text-ink"}`}>
                  {delta >= 0 ? `+${delta}` : `−${Math.abs(delta)}`}
                </span>{" "}
                {COMPARE_PHRASE[period]}
              </span>
            </Stat>
            <Stat label="Answered from documents" value={data.total_questions ? `${answeredPct}%` : "—"}>
              <Meter value={answeredPct} label={`${data.answered_count} of ${data.total_questions} answered`} />
              <span className="text-[13px] text-ink-2">
                {data.answered_count} of {data.total_questions} · {data.not_found_count} not found
              </span>
            </Stat>
            <Stat label="Thumbs up" value={data.rated_count ? `${upPct}%` : "—"}>
              <Meter value={upPct} label={`${data.thumbs_up} of ${data.rated_count} rated answers were thumbs up`} />
              <span className="text-[13px] text-ink-2">
                {data.rated_count ? `${data.thumbs_up} of ${plural(data.rated_count, "rated answer")}` : "No ratings yet"}
              </span>
            </Stat>
          </div>

          {(data.gaps.length > 0 || data.conflicts.length > 0) && (
            <section aria-labelledby="ai-gaps" className="flex flex-col gap-[18px] rounded-2xl border border-ochre-line bg-ochre-50 p-6">
              <div className="flex items-start gap-3.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-ochre-100 text-ochre-700">
                  <Icon name="searchGap" size={20} />
                </span>
                <div className="flex flex-col gap-1">
                  <h2 id="ai-gaps" className="text-xl font-semibold leading-7">
                    Gaps in your knowledge base
                  </h2>
                  <p className="max-w-[620px] text-[15px] leading-6 text-ink-body">
                    {data.gaps.length
                      ? `${plural(data.gaps.length, "question")} AskHR couldn’t answer ${PERIOD_PHRASE[period]}, most-asked first. Adding or updating a document usually closes the gap.`
                      : `Every question ${PERIOD_PHRASE[period]} was found in the documents, but some documents disagree.`}
                  </p>
                </div>
              </div>

              {data.gaps.length > 0 && (
                <ol className="flex flex-col rounded-xl border border-ochre-line bg-white">
                  {data.gaps.map((g) => (
                    <li
                      key={g.key}
                      className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-ochre-divider px-[18px] py-4 last:border-0"
                    >
                      <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-[3px]">
                        <span className="text-base font-semibold">“{g.question}”</span>
                        <span className="text-[13px] text-ink-2">
                          Asked <strong className="font-semibold text-ink">{plural(g.count, "time")}</strong> · last asked{" "}
                          {formatAgo(g.last_asked)} ·{" "}
                          {g.closest_document_title ? (
                            <>
                              <em>{g.closest_document_title}</em> may only partly cover it
                            </>
                          ) : (
                            "no matching document"
                          )}
                        </span>
                      </div>
                      <div className="flex gap-1.5">
                        {g.closest_document_title ? (
                          <Link
                            to={`/admin/documents?q=${encodeURIComponent(g.closest_document_title)}`}
                            className="btn-primary h-10 px-3.5 text-sm"
                          >
                            <Icon name="refresh" size={16} />
                            Update policy
                          </Link>
                        ) : (
                          <Link to="/admin/documents" className="btn-primary h-10 px-3.5 text-sm">
                            <Icon name="upload" size={16} />
                            Add document
                          </Link>
                        )}
                        <button
                          type="button"
                          onClick={() => dismiss(g.key)}
                          aria-label={`Dismiss “${g.question}”`}
                          className="btn h-10 px-3 text-sm text-ink-2 hover:bg-chip hover:text-ink"
                        >
                          Dismiss
                        </button>
                      </div>
                    </li>
                  ))}
                </ol>
              )}

              {data.conflicts.map((c) => (
                <div
                  key={c.documents.join("|")}
                  className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-ochre-line bg-white px-[18px] py-3.5"
                >
                  <Icon name="split" size={20} className="shrink-0 text-ochre-700" />
                  <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-0.5">
                    <span className="text-[15px] font-semibold">Documents disagree: {c.documents.join(" and ")}</span>
                    <span className="text-[13px] text-ink-2">
                      Came up in {plural(c.count, "answer")}, most recently “{c.last_question}”.
                    </span>
                  </div>
                  <Link to="/admin/documents" className="btn-secondary h-10 px-3.5 text-sm">
                    Review documents
                  </Link>
                </div>
              ))}
            </section>
          )}

          <section aria-labelledby="ai-recent" className="flex flex-col gap-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="ai-recent" className="text-lg font-semibold leading-[26px]">
                Recent questions
              </h2>
              <span className="text-[13px] text-ink-3">Employee names are never shown</span>
            </div>
            <div className="overflow-x-auto rounded-xl border border-line bg-white">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="bg-subtle">
                    <th scope="col" className="th pl-5">Question</th>
                    <th scope="col" className="th">Result</th>
                    <th scope="col" className="th">Feedback</th>
                    <th scope="col" className="th pr-5 text-right">Asked</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-5 py-8 text-center text-ink-3">
                        No questions {PERIOD_PHRASE[period]}.
                      </td>
                    </tr>
                  )}
                  {data.recent.map((r) => (
                    <tr key={r.id} className="border-b border-line align-top last:border-0">
                      <td className="py-3.5 pl-5 pr-3 text-[15px]">
                        <button
                          type="button"
                          aria-expanded={expanded === r.id}
                          onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                          className="text-left hover:underline"
                        >
                          {r.question}
                        </button>
                        {expanded === r.id && (
                          <p className="mt-2 whitespace-pre-wrap rounded-lg bg-subtle p-3 text-sm leading-[21px] text-ink-body">
                            {r.answer || "(no answer)"}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3.5">
                        <Result r={r.result} />
                      </td>
                      <td className="px-3 py-3.5">
                        <Rating rating={r.rating} />
                      </td>
                      <td className="whitespace-nowrap py-3.5 pl-3 pr-5 text-right text-ink-2">{formatWhen(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
