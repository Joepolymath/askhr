import { useEffect, useId, useRef, type ReactNode } from "react";

interface Props {
  onClose: () => void;
  children: (ids: { titleId: string; descId: string }) => ReactNode;
  maxWidth?: number;
  role?: "dialog" | "alertdialog";
  top?: number;
}

export default function Modal({ onClose, children, maxWidth = 520, role = "dialog", top = 96 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>("[data-autofocus], input, select, textarea, button");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-scrim px-4 pb-8"
      style={{ paddingTop: `min(${top}px, 10vh)` }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="flex w-full flex-col rounded-2xl bg-white shadow-dialog"
        style={{ maxWidth }}
      >
        {children({ titleId, descId })}
      </div>
    </div>
  );
}
