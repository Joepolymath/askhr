import { useEffect, useRef, useState } from "react";
import { api, openProtectedFile, type Citation, type SourceDetail } from "../api/client";
import Icon from "../components/Icon";
import { useToast } from "../components/Toast";
import { fileKind, formatDate } from "../format";
import { SourceNumber } from "./SourceChips";

interface Props {
  citations: Citation[];
  index: number;
  onNavigate: (index: number) => void;
  onClose: () => void;
  variant: "panel" | "sheet";
}

function useSource(citation: Citation | undefined) {
  const [detail, setDetail] = useState<SourceDetail | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setDetail(null);
    setFailed(false);
    if (!citation?.chunk_id) return;
    let live = true;
    api<SourceDetail>(`/api/sources/${citation.chunk_id}`)
      .then((d) => live && setDetail(d))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [citation?.chunk_id]);
  return { detail, failed };
}

function Passage({ citation, detail, failed }: { citation: Citation; detail: SourceDetail | null; failed: boolean }) {
  // Before the full passage loads (or if it's gone), show the snippet saved with the answer.
  const paragraphs = (detail?.text ?? citation.snippet).split(/\n{2,}/).filter((p) => p.trim());
  return (
    <blockquote className="flex flex-col gap-3.5 rounded-xl border border-line bg-subtle p-4 text-[15px] leading-[25px] text-ink-body sm:px-5 sm:py-[18px]">
      {detail?.before && <p className="text-ink-3">{detail.before}</p>}
      {paragraphs.map((p, i) => (
        <p key={i} className="whitespace-pre-line">
          <mark className="rounded-[3px] bg-ochre-mark px-0.5 py-px text-ink [box-decoration-break:clone]">{p}</mark>
        </p>
      ))}
      {detail?.after && <p className="text-ink-3">{detail.after.length > 220 ? detail.after.slice(0, 220).trimEnd() + "…" : detail.after}</p>}
      {failed && <p className="text-[13px] text-ink-3">This document has since been updated or removed.</p>}
    </blockquote>
  );
}

export default function SourcePanel({ citations, index, onNavigate, onClose, variant }: Props) {
  const toast = useToast();
  const pos = citations.findIndex((c) => c.index === index);
  const citation = citations[pos];
  const { detail, failed } = useSource(citation);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!citation) return null;
  const prev = citations[pos - 1];
  const next = citations[pos + 1];
  const updated = detail?.updated_at ?? citation.document_updated_at;
  const pageText = citation.page ? (detail?.page_count ? `${citation.page} of ${detail.page_count}` : `${citation.page}`) : null;

  const openDocument = () =>
    openProtectedFile(`/api/documents/${citation.document_id}/file`).catch((e) => toast(e.message, { tone: "error" }));

  if (variant === "sheet") {
    return (
      <div className="fixed inset-0 z-40 lg:hidden">
        <div aria-hidden="true" className="absolute inset-0 bg-scrim" onClick={onClose} />
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="source-sheet-title"
          className="absolute inset-x-0 bottom-0 flex max-h-[80vh] flex-col rounded-t-[20px] bg-white shadow-sheet"
        >
          <div className="flex justify-center pt-2">
            <span className="h-[5px] w-10 rounded-full bg-line-strong" />
          </div>
          <div className="flex items-center justify-between py-2 pl-5 pr-2">
            <div className="flex items-center gap-2">
              <SourceNumber n={citation.index} active />
              <span className="text-[13px] font-semibold text-ink-2">
                Source {pos + 1} of {citations.length}
              </span>
            </div>
            <button ref={closeRef} type="button" aria-label="Close source" onClick={onClose} className="icon-btn h-11 w-11">
              <Icon name="close" size={20} />
            </button>
          </div>
          <div className="flex flex-col gap-[18px] overflow-y-auto px-5 pb-8 pt-1">
            <div className="flex flex-col gap-1">
              <h2 id="source-sheet-title" className="text-xl font-semibold leading-7">
                {citation.document_title}
              </h2>
              {(citation.section || pageText) && (
                <span className="text-sm text-ink-2">
                  {[citation.section, pageText && `page ${pageText}`].filter(Boolean).join(" · ")}
                </span>
              )}
              {updated && <span className="text-[13px] text-ink-3">Updated {formatDate(updated)}</span>}
            </div>
            <Passage citation={citation} detail={detail} failed={failed} />
            <div className="flex gap-2.5">
              {detail?.has_file && (
                <button type="button" onClick={openDocument} className="btn-secondary h-12 flex-1 rounded-[10px]">
                  Full document
                  <Icon name="external" size={16} />
                </button>
              )}
              {next && (
                <button type="button" onClick={() => onNavigate(next.index)} className="btn-primary h-12 flex-1 rounded-[10px]">
                  Next source
                  <Icon name="chevronRight" />
                </button>
              )}
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <aside
      aria-label={`Source ${citation.index}: ${citation.document_title}`}
      className="hidden h-full min-w-0 max-w-[460px] flex-[1_1_380px] flex-col overflow-y-auto border-l border-line bg-white lg:flex"
    >
      <div className="flex items-center justify-between gap-3 border-b border-line py-3.5 pl-6 pr-4">
        <div className="flex items-center gap-2.5">
          <SourceNumber n={citation.index} active />
          <span className="text-sm font-semibold text-ink-2">
            Source {pos + 1} of {citations.length}
          </span>
        </div>
        <div className="flex gap-1">
          <button type="button" aria-label="Previous source" disabled={!prev} onClick={() => prev && onNavigate(prev.index)} className="icon-btn">
            <Icon name="chevronLeft" />
          </button>
          <button type="button" aria-label="Next source" disabled={!next} onClick={() => next && onNavigate(next.index)} className="icon-btn">
            <Icon name="chevronRight" />
          </button>
          <button ref={closeRef} type="button" aria-label="Close source" onClick={onClose} className="icon-btn">
            <Icon name="close" />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-[22px] p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-chip text-ink-2">
            <Icon name="document" size={20} />
          </span>
          <div className="flex flex-col gap-0.5">
            <h2 className="text-lg font-semibold leading-[26px]">{citation.document_title}</h2>
            <span className="text-[13px] text-ink-3">
              {[detail && fileKind(detail.mime_type), updated && `updated ${formatDate(updated)}`].filter(Boolean).join(" · ")}
            </span>
          </div>
        </div>

        {(citation.section || pageText) && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5">
            {citation.section && (
              <div className="flex flex-col gap-0.5">
                <dt className="eyebrow text-ink-3">Section</dt>
                <dd className="text-sm font-medium">{citation.section}</dd>
              </div>
            )}
            {pageText && (
              <div className="flex flex-col gap-0.5">
                <dt className="eyebrow text-ink-3">Page</dt>
                <dd className="text-sm font-medium">{pageText}</dd>
              </div>
            )}
          </dl>
        )}

        <figure className="flex flex-col gap-2.5">
          <figcaption className="eyebrow text-ink-3">From the document</figcaption>
          <Passage citation={citation} detail={detail} failed={failed} />
        </figure>

        {detail?.has_file && (
          <div>
            <button type="button" onClick={openDocument} className="btn-secondary">
              Open full document
              <Icon name="external" size={16} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

