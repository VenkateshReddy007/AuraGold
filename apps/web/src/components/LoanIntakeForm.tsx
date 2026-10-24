import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, BadgeCheck, Check, CheckCircle2, ClipboardCheck, Coins, Copy, FileImage, Loader2, RefreshCw, ShieldCheck, Sparkles, UploadCloud } from "lucide-react";

type Plan = { id: string; name: string; interestRatePa: string | number; maxLtvPercent: string | number; tenureMonths: number; description: string };
type Quote = { planId: string; planName: string; pureGoldGrams: string; rate24kPerGram: number; goldValue: number; eligibleLoan: number; effectiveLtvPercent: number };
type FormState = { fullName: string; mobileNumber: string; grossWeightGrams: string; netWeightGrams: string; karat: "18" | "22" | "24"; planId: string };
type ApiFieldError = { field: string; message: string };

const initialForm: FormState = { fullName: "", mobileNumber: "", grossWeightGrams: "", netWeightGrams: "", karat: "22", planId: "PLAN_EMI_01" };
const money = (value: number) => `₹${Math.floor(value).toLocaleString("en-IN")}`;
const grams = (value: string | number) => `${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })} g`;

export default function LoanIntakeForm() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [step, setStep] = useState(1);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [verifiedSlip, setVerifiedSlip] = useState(false);
  const [slipName, setSlipName] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [apiError, setApiError] = useState("");
  const [duplicate, setDuplicate] = useState<{ applicationId?: string; appliedAt?: string } | null>(null);
  const [submitted, setSubmitted] = useState<{ applicationId: string; quote: Quote } | null>(null);
  const [compliance, setCompliance] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/v1/loan-schemes").then((response) => response.json()).then((payload) => {
      if (payload.success) {
        setPlans(payload.data);
        if (!payload.data.some((plan: Plan) => plan.id === form.planId) && payload.data[0]) setForm((current) => ({ ...current, planId: payload.data[0].id }));
      }
    }).catch(() => setApiError("Could not load loan plans. Please refresh and try again."));
  }, []);

  const gross = Number(form.grossWeightGrams);
  const net = Number(form.netWeightGrams);
  const validation = useMemo(() => {
    const errors: Record<string, string> = {};
    if (form.fullName && !/^[A-Za-z\s]{2,60}$/.test(form.fullName.trim())) errors.fullName = "Use 2–60 letters and spaces.";
    if (form.mobileNumber && !/^[6-9]\d{9}$/.test(form.mobileNumber)) errors.mobileNumber = "Enter a valid 10-digit Indian mobile number.";
    if (form.grossWeightGrams && (!(gross > 0) || gross > 1000)) errors.grossWeightGrams = "Gross weight must be above 0 and no more than 1,000 g.";
    if (form.netWeightGrams && (!(net > 0) || net > 1000)) errors.netWeightGrams = "Net weight must be above 0 and no more than 1,000 g.";
    else if (form.netWeightGrams && form.grossWeightGrams && net > gross) errors.netWeightGrams = "Net weight cannot exceed gross weight";
    return errors;
  }, [form.fullName, form.mobileNumber, form.grossWeightGrams, form.netWeightGrams, gross, net]);

  useEffect(() => {
    if (!(gross > 0 && gross <= 1000 && net > 0 && net <= gross && net <= 1000)) return;
    const timer = window.setTimeout(async () => {
      setLoadingQuote(true);
      try {
        const results = await Promise.all(plans.map(async (plan) => {
          const response = await fetch("/api/v1/quotes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grossWeightGrams: gross, netWeightGrams: net, karat: Number(form.karat), planId: plan.id }) });
          const payload = await response.json();
          if (!response.ok || !payload.success) throw new Error(payload.error?.message ?? "Quote could not be calculated.");
          return payload.data as Quote;
        }));
        setQuotes(Object.fromEntries(results.map((quote) => [quote.planId, quote])));
        setApiError("");
      } catch (error) {
        setApiError(error instanceof Error ? error.message : "Quote could not be calculated.");
      } finally { setLoadingQuote(false); }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [gross, net, form.karat, plans]);

  const selectedQuote = quotes[form.planId];
  const update = (key: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setApiError("");
    setDuplicate(null);
    setSubmitted(null);
    setFieldErrors((current) => ({ ...current, [key]: "" }));
  };

  const applySlip = async (presetSlipType?: "sample-22k" | "sample-18k", file?: File) => {
    setScanLoading(true);
    setVerifiedSlip(false);
    setApiError("");
    try {
      let body: Record<string, string>;
      if (presetSlipType) body = { presetSlipType };
      else if (file) {
        const imageBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
          reader.onerror = () => reject(new Error("Could not read this image."));
          reader.readAsDataURL(file);
        });
        body = { imageBase64, mimeType: file.type };
      } else return;
      const response = await fetch("/api/v1/agent/extract-slip", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error?.message ?? "Could not read this appraisal slip.");
      const result = payload.data;
      setForm((current) => ({ ...current, grossWeightGrams: String(result.grossWeightGrams), netWeightGrams: String(result.netWeightGrams), karat: String(result.karat) as FormState["karat"] }));
      setVerifiedSlip(true);
      setSlipName(file?.name ?? result.jewellerName ?? "Demo jeweller appraisal slip");
      setTouched({ grossWeightGrams: true, netWeightGrams: true });
    } catch (error) { setApiError(error instanceof Error ? error.message : "Could not read this appraisal slip."); }
    finally { setScanLoading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const validStepOne = Boolean(form.fullName.trim() && /^[A-Za-z\s]{2,60}$/.test(form.fullName.trim()) && /^[6-9]\d{9}$/.test(form.mobileNumber) && gross > 0 && gross <= 1000 && net > 0 && net <= gross && net <= 1000);
  const next = () => {
    setTouched({ fullName: true, mobileNumber: true, grossWeightGrams: true, netWeightGrams: true });
    const nextErrors = { ...validation };
    if (!form.fullName.trim()) nextErrors.fullName = "Please enter the borrower’s full name.";
    if (!form.mobileNumber) nextErrors.mobileNumber = "Please enter a mobile number.";
    if (!form.grossWeightGrams) nextErrors.grossWeightGrams = "Please enter the gross weight.";
    if (!form.netWeightGrams) nextErrors.netWeightGrams = "Please enter the net weight.";
    setFieldErrors(nextErrors);
    if (step === 1 && validStepOne) setStep(2);
    if (step === 2 && selectedQuote) setStep(3);
  };

  const submit = async () => {
    if (!selectedQuote || !compliance) return;
    setSubmitting(true); setApiError(""); setDuplicate(null); setFieldErrors({});
    try {
      const idempotencyKey = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const response = await fetch("/api/v1/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ fullName: form.fullName.trim(), mobileNumber: form.mobileNumber, grossWeightGrams: gross, netWeightGrams: net, karat: Number(form.karat), planId: form.planId }),
      });
      const payload = await response.json();
      if (response.status === 409) {
        setDuplicate({ applicationId: payload.error?.applicationId, appliedAt: payload.error?.appliedAt });
      } else if (response.status === 400 && payload.error?.fields) {
        setFieldErrors(Object.fromEntries((payload.error.fields as ApiFieldError[]).map((error) => [error.field, error.message])));
        setApiError("Please review the highlighted fields and try again.");
      } else if (!response.ok || !payload.success) throw new Error(payload.error?.message ?? "Your application could not be submitted.");
      else setSubmitted({ applicationId: payload.data.applicationId, quote: selectedQuote });
    } catch (error) { setApiError(error instanceof Error ? error.message : "Your application could not be submitted."); }
    finally { setSubmitting(false); }
  };

  const showError = (key: string) => fieldErrors[key] || (touched[key] || Boolean(form[key as keyof FormState]) ? validation[key] : "");

  if (submitted) return <div className="mx-auto max-w-2xl py-8 sm:py-14">
    <div className="overflow-hidden rounded-3xl border border-emerald-200 bg-white shadow-xl shadow-emerald-900/5">
      <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 px-6 py-8 text-center text-white sm:px-10"><span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15"><CheckCircle2 size={34} /></span><p className="mt-4 text-xs font-bold uppercase tracking-[0.2em] text-emerald-100">Application received</p><h2 className="mt-2 text-2xl font-bold sm:text-3xl">You’re one step closer.</h2><p className="mt-2 text-sm text-emerald-100">Our team will review your details and contact you.</p></div>
      <div className="p-6 sm:p-9"><p className="text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Your application ID</p><div className="mt-2 flex items-center justify-center gap-2"><span className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{submitted.applicationId}</span><button onClick={() => void navigator.clipboard?.writeText(submitted.applicationId)} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" aria-label="Copy application ID"><Copy size={16} /></button></div><div className="my-6 grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-4"><div><p className="text-xs text-slate-500">Eligible estimate</p><p className="mt-1 font-bold text-slate-900">{money(submitted.quote.eligibleLoan)}</p></div><div><p className="text-xs text-slate-500">Selected plan</p><p className="mt-1 font-bold text-slate-900">{submitted.quote.planName}</p></div></div><p className="mb-6 text-center text-xs leading-5 text-slate-500">Your eligibility is an estimate and remains subject to physical appraisal at the branch.</p><div className="flex flex-col gap-3 sm:flex-row"><button onClick={() => { setSubmitted(null); setStep(1); }} className="min-h-12 flex-1 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50">Start another application</button><button onClick={() => window.dispatchEvent(new CustomEvent("aura:open-admin"))} className="min-h-12 flex-1 rounded-xl bg-[#0F172A] px-4 text-sm font-bold text-white hover:bg-slate-800">Inspect in Admin Console <ArrowRight size={16} className="ml-2 inline" /></button></div></div>
    </div>
  </div>;

  return <div>
    <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div><div className="mb-2 inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-amber-800"><Sparkles size={13} /> Secure digital intake</div><h2 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Gold Loan Application</h2><p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500">A clear, guided application with an instant estimate based on verified gold details.</p></div>
      <div className="flex items-center gap-2 self-start rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 md:self-auto"><ShieldCheck size={16} /> RBI-aligned maximum LTV: 75%</div>
    </div>

    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_330px] xl:gap-7">
      <section className="min-w-0">
        <div className="mb-5 grid grid-cols-3 gap-2" aria-label="Application progress">
          {["Borrower & gold", "Choose a plan", "Review & submit"].map((label, index) => { const itemStep = index + 1; const active = step === itemStep; const complete = step > itemStep; return <div key={label} className="flex min-w-0 items-center gap-2"><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${active ? "bg-[#0F172A] text-white ring-4 ring-slate-200" : complete ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-500"}`}>{complete ? <Check size={15} /> : `0${itemStep}`}</span><span className={`hidden truncate text-xs font-semibold sm:block ${active ? "text-slate-900" : "text-slate-500"}`}>{label}</span><span className="h-px flex-1 bg-slate-200 last:hidden" /></div>; })}
        </div>

        {step === 1 && <div className="space-y-5">
          <div className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-white p-4 sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700"><FileImage size={20} /></span><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-bold text-slate-900">Upload / Scan Jeweller Appraisal Slip</h3><span className="rounded-full bg-amber-200/70 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-900">AI Vision</span></div><p className="mt-1 text-xs leading-5 text-slate-500">Quick-fill weights and purity from your appraisal slip.</p></div></div><button onClick={() => fileRef.current?.click()} disabled={scanLoading} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-sm hover:border-amber-400 disabled:opacity-60"><UploadCloud size={15} /> Upload slip</button><input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void applySlip(undefined, file); }} /></div>
            <div className="mt-4 flex flex-col gap-2 border-t border-amber-100 pt-4 sm:flex-row"><button onClick={() => void applySlip("sample-22k")} disabled={scanLoading} className="min-h-10 flex-1 rounded-xl border border-amber-200 bg-white px-3 text-left text-xs font-semibold text-slate-700 hover:bg-amber-50"><span className="block text-[10px] font-bold uppercase tracking-wider text-amber-700">Sample slip 01</span>48g Gross / 45g Net · 22K</button><button onClick={() => void applySlip("sample-18k")} disabled={scanLoading} className="min-h-10 flex-1 rounded-xl border border-amber-200 bg-white px-3 text-left text-xs font-semibold text-slate-700 hover:bg-amber-50"><span className="block text-[10px] font-bold uppercase tracking-wider text-amber-700">Sample slip 02</span>12g Gross / 10g Net · 18K</button></div>
            {scanLoading && <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-amber-800"><Loader2 size={15} className="animate-spin" /> Reading the appraisal slip…</div>}
            {verifiedSlip && !scanLoading && <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-emerald-700"><BadgeCheck size={16} /> Verified from Appraisal Slip <span className="font-normal text-slate-500">· {slipName}</span></div>}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="mb-5"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700">Step 01</p><h3 className="mt-1 text-lg font-bold text-slate-950">Borrower &amp; gold details</h3><p className="mt-1 text-xs text-slate-500">Tell us who’s applying and what you’re pledging.</p></div>
            <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
              <Field label="Full name" error={showError("fullName")}><input className={inputClass(showError("fullName"))} placeholder="e.g. Aarav Sharma" autoComplete="name" value={form.fullName} onBlur={() => setTouched((current) => ({ ...current, fullName: true }))} onChange={(event) => update("fullName", event.target.value)} /></Field>
              <Field label="Mobile number" error={showError("mobileNumber")}><div className={`flex overflow-hidden rounded-xl border bg-white focus-within:ring-2 focus-within:ring-amber-200 ${showError("mobileNumber") ? "border-rose-400" : "border-slate-200 focus-within:border-amber-400"}`}><span className="flex items-center border-r border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-500">+91</span><input className="min-h-12 min-w-0 flex-1 px-3 text-sm outline-none" placeholder="98765 43210" inputMode="numeric" autoComplete="tel-national" maxLength={10} value={form.mobileNumber} onBlur={() => setTouched((current) => ({ ...current, mobileNumber: true }))} onChange={(event) => update("mobileNumber", event.target.value.replace(/\D/g, "").slice(0, 10))} /></div></Field>
              <Field label="Gross weight" suffix="grams" error={showError("grossWeightGrams")}><input className={inputClass(showError("grossWeightGrams"))} placeholder="48" type="number" inputMode="decimal" min="0.01" max="1000" step="0.01" value={form.grossWeightGrams} onBlur={() => setTouched((current) => ({ ...current, grossWeightGrams: true }))} onChange={(event) => update("grossWeightGrams", event.target.value)} /></Field>
              <Field label="Net gold weight" suffix="grams" error={showError("netWeightGrams")}><input className={inputClass(showError("netWeightGrams"))} placeholder="45" type="number" inputMode="decimal" min="0.01" max="1000" step="0.01" value={form.netWeightGrams} onBlur={() => setTouched((current) => ({ ...current, netWeightGrams: true }))} onChange={(event) => update("netWeightGrams", event.target.value)} /></Field>
              <div className="sm:col-span-2"><span className="mb-2 block text-xs font-bold text-slate-700">Gold purity (karat)</span><div className="grid grid-cols-3 gap-2">{(["18", "22", "24"] as const).map((karat) => <button key={karat} onClick={() => update("karat", karat)} className={`rounded-xl border px-2 py-3 text-left transition sm:px-4 ${form.karat === karat ? "border-amber-500 bg-amber-50 ring-2 ring-amber-100" : "border-slate-200 hover:border-slate-300"}`}><span className="flex items-center justify-between text-sm font-bold text-slate-900">{karat}K{form.karat === karat && <Check size={14} className="text-amber-700" />}</span><span className="mt-1 block text-[10px] text-slate-500">{karat === "18" ? "75%" : karat === "22" ? "91.67%" : "99.9%"} pure</span></button>)}</div></div>
            </div>
            {apiError && <InlineAlert message={apiError} />}
            <div className="mt-6 flex justify-end"><button onClick={next} disabled={!validStepOne} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0F172A] px-5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto">Continue to plans <ArrowRight size={16} /></button></div>
          </div>
        </div>}

        {step === 2 && <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700">Step 02</p><h3 className="mt-1 text-lg font-bold text-slate-950">Live quote &amp; plan selection</h3><p className="mt-1 text-xs text-slate-500">Choose the repayment structure that works for you.</p></div>{loadingQuote && <span className="inline-flex items-center gap-2 text-xs font-semibold text-amber-700"><Loader2 size={15} className="animate-spin" /> Updating estimate</span>}</div>
          {selectedQuote && <div className="mb-5 grid grid-cols-1 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 sm:grid-cols-3"><Metric label="Pure gold weight" value={grams(selectedQuote.pureGoldGrams)} /><Metric label="24K benchmark rate" value={`${money(selectedQuote.rate24kPerGram)} / g`} /><Metric label="Total gold value" value={money(selectedQuote.goldValue)} emphasis /></div>}
          <div className="grid gap-3">{plans.map((plan) => { const quote = quotes[plan.id]; const isSelected = form.planId === plan.id; const rate = Number(plan.interestRatePa); const amount = quote?.eligibleLoan ?? 0; return <button key={plan.id} onClick={() => update("planId", plan.id)} className={`relative w-full rounded-2xl border p-4 text-left transition sm:p-5 ${isSelected ? "border-amber-500 bg-amber-50/60 ring-2 ring-amber-100" : "border-slate-200 hover:border-slate-300"}`}><span className={`absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full ${isSelected ? "bg-amber-500 text-white" : "border border-slate-300 bg-white text-transparent"}`}><Check size={14} /></span><div className="pr-8"><div className="flex flex-wrap items-center gap-2"><h4 className="font-bold text-slate-900">{plan.name}</h4><span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold text-emerald-800">{Math.min(Number(plan.maxLtvPercent), 75)}% LTV CAP</span></div><p className="mt-1 text-xs text-slate-500">{rate.toFixed(1)}% p.a. <span className="mx-1 text-slate-300">·</span> {plan.tenureMonths} months</p></div><div className="mt-4 flex flex-col justify-between gap-3 border-t border-slate-200/80 pt-3 sm:flex-row sm:items-end"><div><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Eligible loan amount</p><p className="mt-0.5 text-xl font-extrabold tracking-tight text-slate-950">{quote ? money(amount) : loadingQuote ? "Calculating…" : "—"}</p></div><p className="text-xs font-medium text-slate-600">{plan.id === "PLAN_EMI_01" ? `Est. monthly instalment ${quote ? money(monthlyEmi(amount, rate, plan.tenureMonths)) : "—"}` : `At maturity ${quote ? money(amount + amount * rate * plan.tenureMonths / 1200) : "—"}`}</p></div></button>; })}</div>
          {apiError && <InlineAlert message={apiError} />}
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between"><button onClick={() => setStep(1)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600 hover:bg-slate-50"><ArrowLeft size={15} /> Back to details</button><button onClick={next} disabled={!selectedQuote} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#0F172A] px-5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-40">Review application <ArrowRight size={15} /></button></div>
        </div>}

        {step === 3 && <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-5"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700">Step 03</p><h3 className="mt-1 text-lg font-bold text-slate-950">Review &amp; confirm</h3><p className="mt-1 text-xs text-slate-500">Check your application details before secure submission.</p></div>
          <div className="overflow-hidden rounded-2xl border border-slate-200"><div className="flex items-center justify-between bg-slate-50 px-4 py-3"><span className="text-xs font-bold text-slate-700">Borrower &amp; gold details</span><button onClick={() => setStep(1)} className="text-xs font-bold text-amber-700 hover:text-amber-800">Edit</button></div><ReviewRow label="Borrower" value={form.fullName} /><ReviewRow label="Mobile number" value={`+91 ${form.mobileNumber}`} /><ReviewRow label="Gold details" value={`${grams(gross)} gross · ${grams(net)} net · ${form.karat}K`} /><ReviewRow label="Repayment plan" value={`${plans.find((plan) => plan.id === form.planId)?.name ?? form.planId} · ${Number(plans.find((plan) => plan.id === form.planId)?.interestRatePa ?? 0).toFixed(1)}% p.a.`} /><ReviewRow label="Estimated gold value" value={selectedQuote ? money(selectedQuote.goldValue) : "—"} /><ReviewRow label="Eligible loan estimate" value={selectedQuote ? money(selectedQuote.eligibleLoan) : "—"} strong /></div>
          <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><input type="checkbox" checked={compliance} onChange={(event) => setCompliance(event.target.checked)} className="mt-0.5 h-4 w-4 accent-emerald-600" /><span className="text-xs leading-5 text-emerald-900"><span className="font-bold">RBI LTV compliance.</span> I understand the estimate is capped at a maximum 75% LTV and final loan eligibility depends on physical appraisal at the branch.</span></label>
          {duplicate && <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4"><div className="flex gap-3"><span className="mt-0.5 text-amber-700"><AlertCircle size={19} /></span><div className="min-w-0"><p className="text-sm font-bold text-amber-950">You already applied{duplicate.appliedAt ? ` on ${new Date(duplicate.appliedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}` : ""}{duplicate.applicationId ? `, application ${duplicate.applicationId}` : ""}.</p><p className="mt-1 text-xs leading-5 text-amber-900">An application from this mobile number was received within the last 7 days.</p>{duplicate.applicationId && <button onClick={() => window.dispatchEvent(new CustomEvent("aura:open-admin", { detail: duplicate.applicationId }))} className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-lg bg-amber-700 px-3 text-xs font-bold text-white hover:bg-amber-800">View application status <ArrowRight size={14} /></button>}</div></div></div>}
          {apiError && <InlineAlert message={apiError} />}
          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between"><button onClick={() => setStep(2)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600 hover:bg-slate-50"><ArrowLeft size={15} /> Back to plans</button><button onClick={() => void submit()} disabled={!compliance || !selectedQuote || submitting} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#0F172A] px-5 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40">{submitting ? <><Loader2 size={16} className="animate-spin" /> Submitting securely…</> : <><ClipboardCheck size={16} /> Submit application</>}</button></div>
        </div>}
      </section>

      <aside className="lg:sticky lg:top-[78px]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="bg-[#0F172A] px-5 py-4 text-white"><div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-300">Your estimate</p><p className="mt-1 text-sm font-bold">Live gold valuation</p></div><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-amber-300"><RefreshCw size={17} className={loadingQuote ? "animate-spin" : ""} /></span></div></div><div className="space-y-4 p-5">{selectedQuote ? <><div><p className="text-xs text-slate-500">Estimated eligible amount</p><p className="mt-1 text-3xl font-extrabold tracking-tight text-slate-950">{money(selectedQuote.eligibleLoan)}</p><p className="mt-1 text-xs font-semibold text-emerald-700">Up to {selectedQuote.effectiveLtvPercent}% LTV · RBI cap compliant</p></div><div className="space-y-3 border-t border-slate-100 pt-4"><SummaryLine label="Purity-adjusted gold" value={grams(selectedQuote.pureGoldGrams)} /><SummaryLine label="24K benchmark" value={`${money(selectedQuote.rate24kPerGram)} / g`} /><SummaryLine label="Total gold value" value={money(selectedQuote.goldValue)} /><SummaryLine label="Selected plan" value={plans.find((plan) => plan.id === form.planId)?.name ?? "Monthly EMI"} /></div></> : <div className="rounded-xl bg-slate-50 px-4 py-5 text-center"><span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-400 shadow-sm"><Coins size={19} /></span><p className="mt-3 text-sm font-semibold text-slate-700">Your estimate appears here</p><p className="mt-1 text-xs leading-5 text-slate-500">Add your gold weight to see a live valuation.</p></div>}<div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3"><div className="flex gap-2"><ShieldCheck size={16} className="shrink-0 text-emerald-700" /><p className="text-[11px] leading-4 text-emerald-900"><span className="font-bold">RBI protection:</span> Loan-to-value is capped at 75% of assessed gold value.</p></div></div><p className="text-[10px] leading-4 text-slate-400">Estimate only. Final loan amount is subject to physical appraisal and verification.</p></div></div>
      </aside>
    </div>
  </div>;
}

function inputClass(error?: string) { return `min-h-12 w-full rounded-xl border bg-white px-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-amber-100 ${error ? "border-rose-400 focus:border-rose-400" : "border-slate-200 focus:border-amber-400"}`; }
function Field({ label, suffix, error, children }: { label: string; suffix?: string; error?: string; children: React.ReactNode }) { return <label className="block min-w-0"><span className="mb-2 flex items-center justify-between text-xs font-bold text-slate-700">{label}{suffix && <span className="font-medium text-slate-400">{suffix}</span>}</span>{children}{error && <span className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-rose-600"><AlertCircle size={12} />{error}</span>}</label>; }
function InlineAlert({ message }: { message: string }) { return <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-800"><AlertCircle size={15} className="mt-0.5 shrink-0" />{message}</div>; }
function Metric({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) { return <div className={`px-4 py-3 ${emphasis ? "border-t border-slate-200 sm:border-l sm:border-t-0" : "border-b border-slate-200 last:border-b-0 sm:border-b-0 sm:border-r"}`}><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p><p className={`mt-1 text-base font-bold ${emphasis ? "text-amber-800" : "text-slate-900"}`}>{value}</p></div>; }
function SummaryLine({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-3 text-xs"><span className="text-slate-500">{label}</span><span className="text-right font-bold text-slate-800">{value}</span></div>; }
function ReviewRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) { return <div className="flex items-center justify-between gap-4 border-t border-slate-100 px-4 py-3"><span className="text-xs text-slate-500">{label}</span><span className={`text-right text-xs ${strong ? "font-extrabold text-slate-950" : "font-semibold text-slate-800"}`}>{value}</span></div>; }
function monthlyEmi(principal: number, annualRatePercent: number, months: number) { const monthlyRate = annualRatePercent / 1200; return monthlyRate ? principal * monthlyRate / (1 - Math.pow(1 + monthlyRate, -months)) : principal / months; }
