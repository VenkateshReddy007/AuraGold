/**
 * AdminDashboard.tsx
 * Read-only leads list for the admin view.
 */

import { useState, useEffect } from "react";
import { RefreshCw, Loader2 } from "lucide-react";

interface Lead {
  applicationId: string;
  fullName: string;
  mobileNumber: string;
  karat: number;
  netWeightGrams: string;
  eligibleLoanPaise: string;
  status: string;
  source: string;
  createdAt: string;
  plan?: { name: string };
}

const STATUS_COLORS: Record<string, string> = {
  SUBMITTED:    "bg-blue-100 text-blue-700",
  UNDER_REVIEW: "bg-yellow-100 text-yellow-700",
  APPROVED:     "bg-green-100 text-green-700",
  REJECTED:     "bg-red-100 text-red-700",
};

function paiseToRupees(paise: string): string {
  const num = BigInt(paise);
  const r = num / 100n;
  return `₹${r.toLocaleString("en-IN")}`;
}

export default function AdminDashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLeads = () => {
    setLoading(true);
    setError(null);
    fetch("/api/v1/leads")
      .then((r) => r.json())
      .then((body) => {
        if (body.success) setLeads(body.data);
        else setError(body.error ?? "Failed to load leads.");
      })
      .catch(() => setError("Cannot reach API. Is the server running?"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchLeads(); }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Applications</h2>
          <p className="text-gray-500 text-sm">{leads.length} total</p>
        </div>
        <button
          onClick={fetchLeads}
          className="btn-secondary flex items-center gap-2"
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-40 text-gray-400">
          <Loader2 size={28} className="animate-spin mr-2" /> Loading…
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">
          {error}
        </div>
      )}

      {!loading && !error && leads.length === 0 && (
        <div className="text-center text-gray-400 py-16">No applications yet.</div>
      )}

      {!loading && leads.length > 0 && (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {["App ID", "Name", "Mobile", "Gold", "Plan", "Eligible Loan", "Status", "Source", "Date"].map(
                    (h) => (
                      <th
                        key={h}
                        className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {leads.map((lead) => (
                  <tr key={lead.applicationId} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-brand">
                      {lead.applicationId}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800">{lead.fullName}</td>
                    <td className="px-4 py-3 text-gray-600">{lead.mobileNumber}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {lead.netWeightGrams}g / {lead.karat}k
                    </td>
                    <td className="px-4 py-3 text-gray-600">{lead.plan?.name ?? lead.plan}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">
                      {paiseToRupees(lead.eligibleLoanPaise)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          STATUS_COLORS[lead.status] ?? "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {lead.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{lead.source}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {new Date(lead.createdAt).toLocaleDateString("en-IN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
