import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ToastProvider } from "./components/Toast";
import { PRODUCT_NAME } from "./config";
import "./index.css";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminLogin from "./pages/AdminLogin";
import Chat from "./pages/Chat";
import Welcome from "./pages/Welcome";
import { SessionProvider, useSession } from "./session";

document.title = PRODUCT_NAME;

function EmployeeHome() {
  const { employee } = useSession();
  return employee ? <Chat /> : <Welcome />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={<SessionProvider>{(ready) => (ready ? <EmployeeHome /> : <div className="h-full bg-paper" />)}</SessionProvider>}
          />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin/*" element={<AdminLayout />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  </React.StrictMode>,
);
