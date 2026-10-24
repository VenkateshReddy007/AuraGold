import { useEffect, useState } from "react";
import { ArrowUpRight, Bot, Coins, Landmark, ShieldCheck, X } from "lucide-react";
import LoanIntakeForm from "./components/LoanIntakeForm.tsx";
import AdminDashboard from "./components/AdminDashboard.tsx";
import AgentChat from "./components/AgentChat.tsx";

type View = "intake" | "agent" | "admin";

export default function App() {
  const [view, setView] = useState<View>("intake");
  const [goldRate, setGoldRate] = useState<number | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    const refresh = () => fetch("/api/v1/gold-rate")
      .then((response) => response.json())
      .then((payload) => { if (alive && payload.success) setGoldRate(Number(payload.data.rate24kPerGram)); })
      .catch(() => { if (alive) setGoldRate(7000); });
    void refresh();
    const timer = window.setInterval(refresh, 5 * 60 * 1000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    const openAdmin = () => { setAssistantOpen(false); setView("admin"); };
    window.addEventListener("aura:open-admin", openAdmin);
    return () => window.removeEventListener("aura:open-admin", openAdmin);
  }, []);

  const tabs: Array<{ id: View; label: string; icon: typeof Landmark }> = [
    { id: "intake", label: "Apply for Loan", icon: Landmark },
    { id: "agent", label: "AI Loan Assist", icon: Bot },
    { id: "admin", label: "Admin & Ops Console", icon: Coins },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900">
      <header className="bg-[#0F172A] text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-300 to-amber-600 text-slate-950 shadow-lg shadow-amber-950/20"><Coins size={23} /></div>
              <div className="min-w-0">
                <div className="flex items-center gap-2"><h1 className="truncate text-lg font-bold tracking-tight sm:text-xl">AuraGold</h1><span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300">by TGlobal</span></div>
                <p className="hidden text-xs text-slate-400 sm:block">Field &amp; Borrower Intake Portal</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 lg:hidden">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_#34d399]" />
              <span className="whitespace-nowrap text-xs font-semibold">₹{(goldRate ?? 7000).toLocaleString("en-IN")} / g</span>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="hidden items-center gap-3 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2.5 lg:flex">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-400/15 text-amber-300"><Coins size={17} /></div>
              <div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Live 24K Gold</p><p className="text-sm font-bold">₹{(goldRate ?? 7000).toLocaleString("en-IN")} <span className="font-medium text-slate-400">/ g</span></p></div>
              <span className="ml-2 rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] font-bold text-emerald-300">RBI MAX LTV 75%</span>
            </div>
            <button onClick={() => setAssistantOpen(true)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-amber-400 px-3.5 text-xs font-bold text-slate-950 transition hover:bg-amber-300 sm:px-4 sm:text-sm"><Bot size={17} /> Ask Aura <ArrowUpRight size={14} /></button>
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-4 pb-4 sm:px-6 lg:hidden">
          <div className="flex items-center gap-2 text-[11px] text-slate-400"><ShieldCheck size={14} className="text-emerald-400" /> Live 24K Gold rate <span className="font-semibold text-slate-200">₹{(goldRate ?? 7000).toLocaleString("en-IN")} / g</span><span className="text-slate-600">·</span><span className="text-emerald-300">RBI Max LTV Cap: 75%</span></div>
        </div>
      </header>

      <nav className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-3 sm:px-6">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setView(id)} className={`relative flex min-h-[54px] shrink-0 items-center gap-2 px-3 text-xs font-semibold transition sm:px-5 sm:text-sm ${view === id ? "text-slate-950" : "text-slate-500 hover:text-slate-900"}`}>
              <Icon size={17} className={view === id ? "text-amber-600" : "text-slate-400"} />{label}
              {view === id && <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-full bg-amber-500 sm:inset-x-5" />}
            </button>
          ))}
        </div>
      </nav>

      <main className="mx-auto min-h-[calc(100vh-190px)] w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-9">
        {view === "intake" && <LoanIntakeForm />}
        {view === "agent" && <AgentChat />}
        {view === "admin" && <AdminDashboard />}
      </main>

      <footer className="border-t border-slate-200 bg-white px-4 py-5 text-center text-[11px] text-slate-400">
        AuraGold by TGlobal <span className="mx-2 text-slate-300">·</span> Secure gold-loan intake <span className="mx-2 text-slate-300">·</span> Final eligibility subject to physical appraisal
      </footer>

      {assistantOpen && <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35" onMouseDown={(event) => { if (event.target === event.currentTarget) setAssistantOpen(false); }}>
        <section className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl sm:m-3 sm:h-[calc(100%-24px)] sm:rounded-2xl" aria-label="Aura AI Loan Assist">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700"><Bot size={21} /></span><div><p className="font-bold text-slate-900">Aura AI Loan Assist</p><p className="text-xs text-slate-500">Gold loans, explained clearly</p></div></div><button onClick={() => setAssistantOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close assistant"><X size={18} /></button></div>
          <div className="min-h-0 flex-1"><AgentChat compact /></div>
          <div className="border-t border-slate-100 px-4 py-3 text-center text-[10px] text-slate-400">Quotes are estimates. Final approval follows branch appraisal.</div>
        </section>
      </div>}
    </div>
  );
}
