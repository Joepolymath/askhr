import { Fragment, type ReactNode } from "react";

// Minimal, safe rendering of the model's plain-text answer: paragraphs,
// "- " bullets, **bold**, and [n] citation markers. No HTML is injected.

interface Props {
  text: string;
  citedIndices: Set<number>;
  onCite: (index: number) => void;
}

function inline(text: string, props: Props, keyPrefix: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\[\d+(?:\s*,\s*\d+)*\])/g);
  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={key}>{part.slice(2, -2)}</strong>;
    const cite = part.match(/^\[(\d+(?:\s*,\s*\d+)*)\]$/);
    if (cite) {
      const nums = cite[1].split(",").map((n) => parseInt(n.trim(), 10));
      return (
        <Fragment key={key}>
          {nums.map((n) =>
            props.citedIndices.has(n) ? (
              <button
                key={n}
                type="button"
                onClick={() => props.onCite(n)}
                className="mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded bg-brand-100 px-1 align-super text-[10px] font-semibold text-brand-700 hover:bg-brand-500 hover:text-white"
                aria-label={`Show source ${n}`}
              >
                {n}
              </button>
            ) : null,
          )}
        </Fragment>
      );
    }
    return <Fragment key={key}>{part}</Fragment>;
  });
}

export default function AnswerText(props: Props) {
  const blocks = props.text.split(/\n{2,}/);
  return (
    <div className="space-y-2 leading-relaxed">
      {blocks.map((block, bi) => {
        const lines = block.split("\n");
        const isList = lines.every((l) => /^\s*([-*•]|\d+\.)\s+/.test(l));
        if (isList) {
          return (
            <ul key={bi} className="list-disc space-y-1 pl-5">
              {lines.map((l, li) => (
                <li key={li}>{inline(l.replace(/^\s*([-*•]|\d+\.)\s+/, ""), props, `${bi}-${li}`)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={bi} className="whitespace-pre-wrap">
            {inline(block, props, `${bi}`)}
          </p>
        );
      })}
    </div>
  );
}
