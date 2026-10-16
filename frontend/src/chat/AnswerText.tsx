import { Fragment, type ReactNode } from "react";

// Minimal, safe rendering of the model's plain-text answer: paragraphs,
// "- " bullets, **bold**, and [n] citation markers. No HTML is injected.

interface Props {
  text: string;
  /** Citation numbers that have a source; others are dropped once the answer is done. */
  citedIndices: Set<number>;
  activeIndex: number | null;
  onCite: (index: number) => void;
  streaming?: boolean;
}

const MARKER =
  "ml-[3px] inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] px-[5px] align-[2px] text-xs font-semibold leading-none";

function inline(text: string, props: Props, keyPrefix: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\[\d+(?:\s*,\s*\d+)*\])/g);
  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4)
      return (
        <strong key={key} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    const cite = part.match(/^\[(\d+(?:\s*,\s*\d+)*)\]$/);
    if (cite) {
      const nums = cite[1].split(",").map((n) => parseInt(n.trim(), 10));
      return (
        <Fragment key={key}>
          {nums.map((n) => {
            if (props.citedIndices.has(n)) {
              const active = props.activeIndex === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => props.onCite(n)}
                  aria-label={active ? `Source ${n}, open` : `Source ${n}`}
                  className={`${MARKER} ${active ? "bg-ochre text-white" : "bg-ochre-100 text-ochre-700 hover:bg-ochre hover:text-white"}`}
                >
                  {n}
                </button>
              );
            }
            // While streaming, sources aren't known yet: show the marker, inert.
            return props.streaming ? (
              <span key={n} className={`${MARKER} bg-ochre-100 text-ochre-700`}>
                {n}
              </span>
            ) : null;
          })}
        </Fragment>
      );
    }
    return <Fragment key={key}>{part}</Fragment>;
  });
}

const CURSOR = (
  <span
    aria-hidden="true"
    className="ml-[3px] inline-block h-5 w-[9px] animate-blink rounded-sm bg-green align-[-3px]"
  />
);

export default function AnswerText(props: Props) {
  const blocks = props.text.trim().split(/\n{2,}/);
  const last = blocks.length - 1;
  return (
    <div className="flex flex-col gap-3.5 text-base leading-[26px] sm:text-[17px] sm:leading-7">
      {blocks.map((block, bi) => {
        const lines = block.split("\n").filter((l) => l.trim());
        const isList = lines.length > 0 && lines.every((l) => /^\s*([-*•]|\d+\.)\s+/.test(l));
        const cursor = props.streaming && bi === last ? CURSOR : null;
        if (isList) {
          const ordered = /^\s*\d+\./.test(lines[0]);
          const ListTag = ordered ? "ol" : "ul";
          return (
            <ListTag key={bi} className={`flex flex-col gap-2 pl-[22px] ${ordered ? "list-decimal" : "list-disc"}`}>
              {lines.map((l, li) => (
                <li key={li}>
                  {inline(l.replace(/^\s*([-*•]|\d+\.)\s+/, ""), props, `${bi}-${li}`)}
                  {li === lines.length - 1 && cursor}
                </li>
              ))}
            </ListTag>
          );
        }
        return (
          <p key={bi} className="whitespace-pre-wrap">
            {inline(block, props, `${bi}`)}
            {cursor}
          </p>
        );
      })}
    </div>
  );
}
