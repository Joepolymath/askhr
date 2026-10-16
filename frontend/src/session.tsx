import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, EMPLOYEE_SIGNED_OUT, employeeAuth, type Employee, type PublicInfo } from "./api/client";

interface Session {
  employee: Employee | null;
  info: PublicInfo | null;
  signIn: (token: string, employee: Employee, remember: boolean) => void;
  signOut: () => void;
}

const SessionContext = createContext<Session | null>(null);

export function useSession() {
  const s = useContext(SessionContext);
  if (!s) throw new Error("useSession outside SessionProvider");
  return s;
}

const EMPTY_INFO: PublicInfo = {
  company_name: "",
  hr_contact_name: "",
  hr_contact_role: null,
  hr_contact_email: "",
  document_count: 0,
};

/** Loads company info and, if a token is stored, the signed-in employee. */
export function SessionProvider({ children }: { children: (ready: boolean) => ReactNode }) {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [info, setInfo] = useState<PublicInfo | null>(null);
  const [checked, setChecked] = useState(!employeeAuth.get());

  useEffect(() => {
    api<PublicInfo>("/api/info")
      .then(setInfo)
      .catch(() => setInfo(EMPTY_INFO));
    if (employeeAuth.get()) {
      api<Employee>("/api/auth/me")
        .then(setEmployee)
        .catch(() => employeeAuth.clear())
        .finally(() => setChecked(true));
    }
    const onSignedOut = () => setEmployee(null);
    window.addEventListener(EMPLOYEE_SIGNED_OUT, onSignedOut);
    return () => window.removeEventListener(EMPLOYEE_SIGNED_OUT, onSignedOut);
  }, []);

  const signIn = useCallback((token: string, e: Employee, remember: boolean) => {
    employeeAuth.set(token, remember);
    setEmployee(e);
  }, []);

  const signOut = useCallback(() => {
    employeeAuth.clear();
    setEmployee(null);
  }, []);

  return (
    <SessionContext.Provider value={{ employee, info, signIn, signOut }}>
      {children(checked && info !== null)}
    </SessionContext.Provider>
  );
}
