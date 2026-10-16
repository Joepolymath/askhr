import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import Icon from "./Icon";

interface ToastOptions {
  tone?: "success" | "error";
  action?: { label: string; onClick: () => void };
  duration?: number;
}
interface ToastItem extends ToastOptions {
  id: number;
  message: string;
}

const ToastContext = createContext<(message: string, options?: ToastOptions) => void>(() => {});

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);

  const show = useCallback(
    (message: string, options: ToastOptions = {}) => {
      const id = nextId.current++;
      setItems((xs) => [...xs.slice(-2), { id, message, ...options }]);
      setTimeout(() => dismiss(id), options.duration ?? (options.action ? 8000 : 5000));
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-center gap-2 sm:left-auto sm:right-6 sm:items-end">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-[10px] bg-ink px-4 py-3.5 text-[15px] text-white shadow-toast"
          >
            <Icon
              name={t.tone === "error" ? "alert" : "check"}
              size={20}
              strokeWidth={2.2}
              className={t.tone === "error" ? "text-danger-toast" : "text-[#9FD3B0]"}
            />
            <span className="flex-1">{t.message}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action!.onClick();
                  dismiss(t.id);
                }}
                className="h-8 rounded px-2 text-sm font-semibold text-ochre-toast hover:bg-white/10"
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
