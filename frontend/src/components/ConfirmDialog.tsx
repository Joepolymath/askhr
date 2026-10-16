import { useCallback, useRef, useState, type ReactNode } from "react";

interface DialogState {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
}

// Promise-based confirm modal: `const ok = await confirm({...})`.
export function useConfirm() {
  const [state, setState] = useState<DialogState | null>(null);
  const resolver = useRef<(ok: boolean) => void>();

  const confirm = useCallback(
    (s: DialogState) =>
      new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        setState(s);
      }),
    [],
  );

  const close = (ok: boolean) => {
    resolver.current?.(ok);
    setState(null);
  };

  const dialog = state ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold">{state.title}</h2>
        <div className="mt-2 text-sm text-slate-600">{state.body}</div>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={() => close(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
            Cancel
          </button>
          <button
            autoFocus
            onClick={() => close(true)}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${
              state.danger ? "bg-red-600 hover:bg-red-700" : "bg-brand-600 hover:bg-brand-700"
            }`}
          >
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, dialog };
}
