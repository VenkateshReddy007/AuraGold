/**
 * LoanIntakeForm.tsx
 * Customer-facing gold loan application form.
 */

import { useState, useEffect } from "react";
import { CheckCircle, AlertCircle, Loader2 } from "lucide-react";

interface LoanScheme {
  id: string;
  name: string;
  interestRatePa: string;
  maxLtvPercent: string;
  tenureMonths: number;
  description: string;
}

interface FormState {
  fullName: string;
  mobileNumber: string;
  grossWeightGrams: string;
  netWeightGrams: string;
  karat: "18" | "22" | "24";
  planId: string;
}

const INITIAL_FORM: FormState = {
  fullName: "",
  mobileNumber: "",
  grossWeightGrams: "",
  netWeightGrams: "",
  karat: "22",
  planId: "",
};

export default function LoanIntakeForm() {
  const [schemes, setSchemes] = useState<LoanScheme[]>([]);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; appId?: string } | null>(null);

  useEffect(() => {
    fetch("/api/v1/schemes")
      .then((r) => r.json())
      .then((body) => {
        if (body.success) {
          setSchemes(body.data);
          if (body.data.length > 0) {
            setForm((f) => ({ ...f, planId: body.data[0].id }));
          }
        }
      })
      .catch(() => {/* API not yet running */});
  }, []);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);

    try {
      const payload = {
        fullName: form.fullName.trim(),
        mobileNumber: form.mobileNumber.trim(),
        grossWeightGrams: parseFloat(form.grossWeightGrams),
        netWeightGrams: parseFloat(form.netWeightGrams),
        karat: parseInt(form.karat, 10),
        planId: form.planId,
        source: "WEB_FORM",
      };

      const res = await fetch("/api/v1/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = await res.json();

      if (res.ok && body.success) {
        setResult({
          success: true,
          message: "Application submitted successfully!",
          appId: body.data.applicationId,
        });
        setForm(INITIAL_FORM);
      } else {
        setResult({ success: false, message: body.error ?? "Submission failed." });
      }
    } catch {
      setResult({ success: false, message: "Network error. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  const selectedScheme = schemes.find((s) => s.id === form.planId);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="card">
        <h2 className="text-2xl font-bold text-gray-800 mb-1">Gold Loan Application</h2>
        <p className="text-gray-500 text-sm mb-6">
          Fill in the details below to check your eligibility instantly.
        </p>

        {result && (
          <div
            className={[
              "flex items-start gap-3 rounded-xl p-4 mb-6 text-sm",
              result.success
                ? "bg-green-50 text-green-800 border border-green-200"
                : "bg-red-50 text-red-800 border border-red-200",
            ].join(" ")}
            role="alert"
          >
            {result.success ? (
              <CheckCircle size={18} className="mt-0.5 shrink-0" />
            ) : (
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
            )}
            <div>
              <p className="font-medium">{result.message}</p>
              {result.appId && (
                <p className="mt-1">
                  Your application ID:{" "}
                  <span className="font-mono font-bold">{result.appId}</span>
                </p>
              )}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          {/* Personal info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="fullName">
                Full Name
              </label>
              <input
                id="fullName"
                name="fullName"
                type="text"
                required
                className="input-field"
                placeholder="e.g. Ananya Krishnamurthy"
                value={form.fullName}
                onChange={handleChange}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="mobileNumber">
                Mobile Number
              </label>
              <input
                id="mobileNumber"
                name="mobileNumber"
                type="tel"
                required
                maxLength={10}
                className="input-field"
                placeholder="10-digit mobile number"
                value={form.mobileNumber}
                onChange={handleChange}
              />
            </div>
          </div>

          {/* Gold details */}
          <fieldset className="border border-gray-200 rounded-xl p-4">
            <legend className="text-sm font-semibold text-gray-700 px-1">Gold Details</legend>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="grossWeightGrams">
                  Gross Weight (g)
                </label>
                <input
                  id="grossWeightGrams"
                  name="grossWeightGrams"
                  type="number"
                  step="0.001"
                  min="0.001"
                  required
                  className="input-field"
                  placeholder="e.g. 25.5"
                  value={form.grossWeightGrams}
                  onChange={handleChange}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="netWeightGrams">
                  Net Weight (g)
                </label>
                <input
                  id="netWeightGrams"
                  name="netWeightGrams"
                  type="number"
                  step="0.001"
                  min="0.001"
                  required
                  className="input-field"
                  placeholder="e.g. 24.0"
                  value={form.netWeightGrams}
                  onChange={handleChange}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="karat">
                  Gold Purity
                </label>
                <select
                  id="karat"
                  name="karat"
                  required
                  className="input-field"
                  value={form.karat}
                  onChange={handleChange}
                >
                  <option value="24">24k (99.9%)</option>
                  <option value="22">22k (91.6%)</option>
                  <option value="18">18k (75.0%)</option>
                </select>
              </div>
            </div>
          </fieldset>

          {/* Plan selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Loan Plan
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {schemes.map((scheme) => (
                <label
                  key={scheme.id}
                  className={[
                    "flex flex-col gap-1 rounded-xl border-2 p-4 cursor-pointer transition-all",
                    form.planId === scheme.id
                      ? "border-brand bg-gold-50"
                      : "border-gray-200 hover:border-gray-300",
                  ].join(" ")}
                >
                  <input
                    type="radio"
                    name="planId"
                    value={scheme.id}
                    checked={form.planId === scheme.id}
                    onChange={handleChange}
                    className="sr-only"
                  />
                  <span className="font-semibold text-gray-800">{scheme.name}</span>
                  <span className="text-xs text-gray-500">{scheme.description}</span>
                  <span className="text-xs font-medium text-brand mt-1">
                    {scheme.interestRatePa}% p.a. · Max LTV {scheme.maxLtvPercent}%
                  </span>
                </label>
              ))}
              {schemes.length === 0 && (
                <p className="text-sm text-gray-400 col-span-2">Loading plans…</p>
              )}
            </div>
          </div>

          {/* Eligibility preview */}
          {selectedScheme && (
            <div className="bg-gold-50 border border-gold-200 rounded-xl p-4 text-sm">
              <p className="font-medium text-gold-800 mb-1">Plan Summary</p>
              <ul className="text-gold-700 space-y-0.5">
                <li>Tenure: {selectedScheme.tenureMonths} months</li>
                <li>Interest: {selectedScheme.interestRatePa}% per annum</li>
                <li>Max loan-to-value: {selectedScheme.maxLtvPercent}%</li>
              </ul>
            </div>
          )}

          <button
            type="submit"
            className="btn-primary w-full flex items-center justify-center gap-2"
            disabled={submitting || !form.planId}
          >
            {submitting ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Submitting…
              </>
            ) : (
              "Submit Application"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
