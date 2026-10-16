import type { Citation } from "../api/client";
import { citationLocation } from "../format";
import Icon from "../components/Icon";

export function SourceNumber({ n, active, size = 24 }: { n: number; active?: boolean; size?: number }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-md text-xs font-semibold ${
        active ? "bg-ochre text-white" : "bg-ochre-100 text-ochre-700"
      }`}
      style={{ width: size, height: size }}
    >
      {n}
    </span>
  );
}

export default function SourceChips({
  citations,
  activeIndex,
  onOpen,
  label = true,
}: {
  citations: Citation[];
  activeIndex: number | null;
  onOpen: (index: number) => void;
  label?: boolean;
}) {
  if (!citations.length) return null;
  return (
    <div className="flex flex-col gap-2 pt-1">
      {label && <span className="eyebrow hidden sm:block">Sources</span>}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {citations.map((c) => {
          const active = c.index === activeIndex;
          return (
            <button
              key={c.index}
              type="button"
              aria-pressed={active}
              onClick={() => onOpen(c.index)}
              className={`flex min-h-12 items-center gap-2.5 rounded-[10px] border py-1.5 pl-2 pr-3 text-left sm:min-h-11 sm:pr-3.5 ${
                active
                  ? "border-ochre bg-ochre-50 shadow-[0_0_0_3px_theme(colors.ochre.100)]"
                  : "border-line bg-white hover:border-line-strong"
              }`}
            >
              <SourceNumber n={c.index} active={active} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold text-ink sm:text-[13px]">{c.document_title}</span>
                {citationLocation(c.section, c.page) && (
                  <span className="truncate text-xs text-ink-3">{citationLocation(c.section, c.page)}</span>
                )}
              </span>
              <Icon name="chevronRight" className="shrink-0 text-ink-3 sm:hidden" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
