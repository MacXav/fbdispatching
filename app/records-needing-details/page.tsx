"use client";

import { useEffect, useMemo, useState } from "react";
import MainLayout from "@/components/MainLayout";
import Header from "@/components/Header";
import { supabase } from "@/lib/supabase";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Save,
} from "lucide-react";

type RecordType = "Customer" | "Carrier" | "Customs Broker" | "Location";
type TableName =
  | "billing_customers"
  | "carriers"
  | "customs_brokers"
  | "companies";

type ReferenceRecord = {
  id: string;
  tableName: TableName;
  type: RecordType;
  name: string;
  contact_name: string;
  contact_phone: string;
  email: string;
  address: string;
  city: string;
  postal_code: string;
  notes: string;
  profile_status: string;
  missing_details_note: string;
};

const tableConfigs: Array<{
  tableName: TableName;
  type: RecordType;
  label: string;
}> = [
  {
    tableName: "billing_customers",
    type: "Customer",
    label: "Customers / Bill To",
  },
  { tableName: "carriers", type: "Carrier", label: "Carriers" },
  { tableName: "companies", type: "Location", label: "Shippers / Receivers" },
];

export default function RecordsNeedingDetailsPage() {
  const [records, setRecords] = useState<ReferenceRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [draft, setDraft] = useState<ReferenceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"all" | RecordType>("all");

  useEffect(() => {
    loadRecords();
  }, []);

  const selectedRecord = useMemo(() => {
    return records.find((record) => record.id === selectedId) || null;
  }, [records, selectedId]);

  const filteredRecords = useMemo(() => {
    if (filter === "all") return records;
    return records.filter((record) => record.type === filter);
  }, [filter, records]);

  const counts = useMemo(() => {
    return tableConfigs.map((config) => ({
      ...config,
      count: records.filter((record) => record.type === config.type).length,
    }));
  }, [records]);

  const loadRecords = async () => {
    try {
      setLoading(true);

      const results = await Promise.all(
        tableConfigs.map(async (config) => {
          const { data, error } = await supabase
            .from(config.tableName)
            .select(
              "id,name,contact_name,contact_phone,email,address,city,postal_code,notes,profile_status,missing_details_note",
            )
            .or("profile_status.eq.needs_details,profile_status.is.null")
            .order("name", { ascending: true });

          if (error) {
            console.error(`Error loading ${config.tableName}:`, error);
            return [] as ReferenceRecord[];
          }

          return ((data || []) as any[]).map((row) =>
            normalizeRecord(row, config.tableName, config.type),
          );
        }),
      );

      const nextRecords = results.flat();
      setRecords(nextRecords);

      if (nextRecords.length > 0) {
        const requestedRecord = findRequestedRecordFromUrl(nextRecords);

        if (requestedRecord) {
          setFilter(requestedRecord.type);
          setSelectedId(requestedRecord.id);
          setDraft({ ...requestedRecord });
        } else {
          const existingStillPresent = nextRecords.some(
            (record) => record.id === selectedId,
          );
          const nextSelected = existingStillPresent
            ? selectedId
            : nextRecords[0].id;
          const nextRecord =
            nextRecords.find((record) => record.id === nextSelected) ||
            nextRecords[0];
          setSelectedId(nextRecord.id);
          setDraft({ ...nextRecord });
        }
      } else {
        setSelectedId("");
        setDraft(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const selectRecord = (record: ReferenceRecord) => {
    setSelectedId(record.id);
    setDraft({ ...record });
  };

  const updateDraft = (field: keyof ReferenceRecord, value: string) => {
    setDraft((current) => (current ? { ...current, [field]: value } : current));
  };

  const saveDraft = async (markComplete: boolean) => {
    if (!draft) return;

    if (!draft.name.trim()) {
      alert("Name is required.");
      return;
    }

    const completion = getCompletionStatus(draft);

    if (markComplete && !completion.complete) {
      alert(`This record is still missing: ${completion.missing.join(", ")}.`);
      return;
    }

    const shouldMarkComplete = markComplete || completion.complete;

    try {
      setSaving(true);

      const payload = {
        name: draft.name.trim(),
        contact_name: cleanOrNull(draft.contact_name),
        contact_phone: cleanOrNull(draft.contact_phone),
        email: cleanOrNull(draft.email),
        address: cleanOrNull(draft.address),
        city: cleanOrNull(draft.city),
        postal_code: cleanOrNull(draft.postal_code),
        notes:
          shouldMarkComplete && isAutoDetailsNote(draft.notes)
            ? null
            : cleanOrNull(draft.notes),
        profile_status: shouldMarkComplete ? "complete" : "needs_details",
        missing_details_note: shouldMarkComplete
          ? null
          : cleanOrNull(draft.missing_details_note) ||
            `Missing ${completion.missing.join(", ") || "details"}`,
        updated_at: new Date().toISOString(),
      } as Record<string, string | null>;

      const { error } = await supabase
        .from(draft.tableName)
        .update(payload)
        .eq("id", draft.id);

      if (error) throw error;

      await loadRecords();
    } catch (error) {
      console.error("Error saving record:", error);
      alert(error instanceof Error ? error.message : "Could not save record.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <MainLayout>
      <Header
        title="Records Needing Details"
        subtitle="Complete customers, carriers, brokers, shippers, and receivers before accounting invoices."
      />

      <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-700 dark:text-amber-300" />
          <div>
            <p className="font-black text-amber-950 dark:text-amber-100">
              These records are important.
            </p>
            <p className="mt-1 text-sm font-semibold text-amber-900 dark:text-amber-200">
              Work orders can still be created quickly, but anything marked here
              should be completed before accounting invoices or sends anything
              to QuickBooks.
            </p>
          </div>
        </div>
      </div>

      <div className="grid min-h-[calc(100vh-220px)] grid-cols-12 gap-4">
        <section className="col-span-12 rounded-2xl border border-slate-300 bg-white shadow-soft dark:border-dark-border dark:bg-dark-card lg:col-span-4">
          <div className="flex items-center justify-between gap-3 border-b border-slate-300 p-4 dark:border-dark-border">
            <div>
              <h2 className="text-lg font-black text-slate-950 dark:text-white">
                Needs Details
              </h2>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                {records.length} incomplete record
                {records.length === 1 ? "" : "s"}
              </p>
            </div>

            <button
              type="button"
              onClick={loadRecords}
              className="btn-secondary h-9 gap-2 px-3 text-sm"
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Refresh
            </button>
          </div>

          <div className="flex flex-wrap gap-2 border-b border-slate-200 p-3 dark:border-dark-border">
            <FilterButton
              active={filter === "all"}
              onClick={() => setFilter("all")}
            >
              All {records.length}
            </FilterButton>
            {counts.map((count) => (
              <FilterButton
                key={count.tableName}
                active={filter === count.type}
                onClick={() => setFilter(count.type)}
              >
                {count.label} {count.count}
              </FilterButton>
            ))}
          </div>

          <div className="custom-board-scrollbar max-h-[calc(100vh-370px)] overflow-y-auto p-3">
            {loading ? (
              <div className="py-10 text-center">
                <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-blue-700 dark:text-blue-300" />
                <p className="font-semibold text-slate-700 dark:text-slate-300">
                  Loading...
                </p>
              </div>
            ) : filteredRecords.length === 0 ? (
              <div className="rounded-xl border border-green-300 bg-green-50 p-5 text-center dark:border-green-800 dark:bg-green-950/30">
                <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-green-700 dark:text-green-300" />
                <p className="font-black text-green-900 dark:text-green-100">
                  Nothing needs details here.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredRecords.map((record) => (
                  <button
                    key={`${record.tableName}-${record.id}`}
                    type="button"
                    onClick={() => selectRecord(record)}
                    className={`w-full rounded-xl border-2 p-3 text-left transition ${
                      selectedId === record.id
                        ? "border-blue-500 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/40"
                        : "border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60 dark:hover:bg-slate-800"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-black text-slate-950 dark:text-white">
                          {record.name}
                        </p>
                        <p className="mt-1 text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                          {record.type} • Needs Details
                        </p>
                      </div>
                    </div>
                    <p className="mt-2 truncate text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {missingSummary(record)}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="col-span-12 rounded-2xl border border-slate-300 bg-white p-4 shadow-soft dark:border-dark-border dark:bg-dark-card lg:col-span-8">
          {!draft ? (
            <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center dark:border-slate-700 dark:bg-slate-900/50">
              <div>
                <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-green-700 dark:text-green-300" />
                <p className="text-xl font-black text-slate-950 dark:text-white">
                  All caught up
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
                  No records currently need details.
                </p>
              </div>
            </div>
          ) : (
            <div className="h-full">
              <div className="mb-4 flex items-start justify-between gap-3 border-b border-slate-300 pb-4 dark:border-dark-border">
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-amber-700 dark:text-amber-300">
                    {draft.type} needs details
                  </p>
                  <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">
                    {draft.name || "Unnamed record"}
                  </h2>
                  <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Fields marked with{" "}
                    <span className="text-red-600 dark:text-red-300">*</span>{" "}
                    are required before this can be marked complete.
                  </p>
                </div>

                <div className="flex flex-shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => saveDraft(false)}
                    className="btn-secondary h-9 gap-2 px-3 text-sm"
                    disabled={saving}
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => saveDraft(true)}
                    className="btn-primary h-9 gap-2 px-3 text-sm"
                    disabled={saving}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Mark Complete
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <EditField
                  label="Name"
                  value={draft.name}
                  onChange={(value) => updateDraft("name", value)}
                  required
                />
                <EditField
                  label="Contact Name"
                  value={draft.contact_name}
                  onChange={(value) => updateDraft("contact_name", value)}
                />
                <EditField
                  label="Phone"
                  value={draft.contact_phone}
                  onChange={(value) => updateDraft("contact_phone", value)}
                />
                <EditField
                  label="Email"
                  value={draft.email}
                  onChange={(value) => updateDraft("email", value)}
                />
                <EditField
                  label="Address"
                  value={draft.address}
                  onChange={(value) => updateDraft("address", value)}
                  required={
                    draft.type === "Customer" || draft.type === "Location"
                  }
                />
                <EditField
                  label="City"
                  value={draft.city}
                  onChange={(value) => updateDraft("city", value)}
                  required={
                    draft.type === "Customer" || draft.type === "Location"
                  }
                />
                <EditField
                  label="Postal Code"
                  value={draft.postal_code}
                  onChange={(value) => updateDraft("postal_code", value)}
                />
                <EditField
                  label="Reason / Missing Details Note"
                  value={draft.missing_details_note}
                  onChange={(value) =>
                    updateDraft("missing_details_note", value)
                  }
                />
                <div className="md:col-span-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-300">
                      Notes
                    </span>
                    <textarea
                      value={draft.notes}
                      onChange={(event) =>
                        updateDraft("notes", event.target.value)
                      }
                      rows={4}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-950 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  </label>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-slate-300 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/60">
                <p className="text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-300">
                  Suggested minimum before marking complete
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Red asterisks show what is still needed. Customers and
                  shipper/receiver locations need address and city. Phone,
                  email, and contact names are helpful but optional. Customs
                  broker info is not required to proceed. When the required
                  details are filled, Save will clear this record from the list
                  automatically.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </MainLayout>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-black transition ${
        active
          ? "border-blue-500 bg-blue-600 text-white"
          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
      }`}
    >
      {children}
    </button>
  );
}

function EditField({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-300">
        {label}
        {required ? " *" : ""}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
      />
    </label>
  );
}

function normalizeRecord(
  row: any,
  tableName: TableName,
  type: RecordType,
): ReferenceRecord {
  return {
    id: String(row.id || ""),
    tableName,
    type,
    name: safeString(row.name),
    contact_name: safeString(row.contact_name),
    contact_phone: safeString(row.contact_phone),
    email: safeString(row.email),
    address: safeString(row.address),
    city: safeString(row.city),
    postal_code: safeString(row.postal_code),
    notes: safeString(row.notes),
    profile_status: safeString(row.profile_status || "needs_details"),
    missing_details_note: safeString(row.missing_details_note),
  };
}

function getCompletionStatus(record: ReferenceRecord) {
  const missing: string[] = [];

  if (!record.name.trim()) missing.push("name");

  if (record.type === "Customer" || record.type === "Location") {
    if (!record.address.trim()) missing.push("address");
    if (!record.city.trim()) missing.push("city");
  }

  return {
    complete: missing.length === 0,
    missing,
  };
}

function findRequestedRecordFromUrl(records: ReferenceRecord[]) {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const requestedId = params.get("id") || "";
  const requestedType = params.get("type") as RecordType | null;
  const requestedName = params.get("name") || "";
  const normalizedRequestedName = normalizeLookup(requestedName);

  if (requestedId) {
    const byId = records.find((record) => record.id === requestedId);
    if (byId) return byId;
  }

  if (!normalizedRequestedName) {
    return null;
  }

  return (
    records.find((record) => {
      const typeMatches = !requestedType || record.type === requestedType;
      return (
        typeMatches && normalizeLookup(record.name) === normalizedRequestedName
      );
    }) ||
    records.find((record) => {
      const typeMatches = !requestedType || record.type === requestedType;
      return (
        typeMatches &&
        normalizeLookup(record.name).includes(normalizedRequestedName)
      );
    }) ||
    null
  );
}

function normalizeLookup(value?: string | null) {
  return safeString(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function missingSummary(record: ReferenceRecord) {
  const completion = getCompletionStatus(record);

  return completion.missing.length > 0
    ? `Missing ${completion.missing.join(", ")}`
    : "Required details filled. Save to clear.";
}

function isAutoDetailsNote(value?: string | null) {
  if (!value) return false;

  const cleaned = value.trim().toLowerCase();

  return (
    cleaned ===
      "created from pickup/dispatch task form. address/details need to be completed later." ||
    cleaned ===
      "created from work order form. address/details need to be completed later." ||
    cleaned ===
      "created from work order. details need to be completed later." ||
    cleaned === "needs_location_contact_details" ||
    cleaned === "needs_location_details" ||
    cleaned === "missing_location_details" ||
    cleaned.includes("needs details") ||
    cleaned.includes("need details") ||
    cleaned.includes("missing details") ||
    cleaned.includes("missing location") ||
    cleaned.includes("address/details need")
  );
}

function cleanOrNull(value: string) {
  const cleaned = value.trim();
  return cleaned === "" ? null : cleaned;
}

function safeString(value?: string | number | null) {
  if (value === null || value === undefined) return "";
  return String(value);
}
