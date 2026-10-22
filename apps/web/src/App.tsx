import { useState } from "react";
import { Landmark, ClipboardList, MessageCircle } from "lucide-react";
import LoanIntakeForm from "./components/LoanIntakeForm.tsx";
import AdminDashboard from "./components/AdminDashboard.tsx";
import AgentChat from "./components/AgentChat.tsx";

type View = "intake" | "admin" | "agent";

export default function App() {
  const [view, setView] = useState<View>("intake");

  const navItems: { id: View; label: string; icon: React.ReactNode }[] = [
    { id: "intake",  label: "Apply for Loan",   icon: <Landmark size={18} /> },
    { id: "agent",   label: "AI Assistant",      icon: <MessageCircle size={18} /> },
    { id: "admin",   label: "Admin Dashboard",   icon: <ClipboardList size={18} /> },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-brand shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <div className="w-8 h-8 bg-gold-400 rounded-full flex items-center justify-center">
            <span className="text-brand-dark font-bold text-sm">T</span>
          </div>
          <div>
            <h1 className="text-white font-bold text-xl leading-none">TGlobal</h1>
            <p className="text-gold-200 text-xs">Gold Loan Portal</p>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex gap-0">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={[
                  "flex items-center gap-2 px-5 py-3.5 text-sm font-medium border-b-2 transition-colors",
                  view === item.id
                    ? "border-brand text-brand"
                    : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300",
                ].join(" ")}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-8">
        {view === "intake" && <LoanIntakeForm />}
        {view === "agent"  && <AgentChat />}
        {view === "admin"  && <AdminDashboard />}
      </main>

      <footer className="bg-white border-t border-gray-100 text-center text-xs text-gray-400 py-4">
        © 2026 TGlobal Financial Services · Gold Loan Intake Portal
      </footer>
    </div>
  );
}
