"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import MainLayout from "@/components/MainLayout";
import { supabase } from "@/lib/supabase";
import {
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  FileText,
  Loader2,
  Plus,
  Printer,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";

type Currency = "CAD" | "USD";
type BillingStatus =
  | "not_ready"
  | "price_entered"
  | "ready_for_accounting"
  | "accounting_reviewing"
  | "ready_to_invoice"
  | "sent_to_quickbooks"
  | "invoiced"
  | "paid"
  | "do_not_bill";

type WorkOrderRecord = {
  id: string;
  work_order_number: string | null;
  customer_company_name?: string | null;
  bill_to_company_name?: string | null;
  carrier_company_name?: string | null;
  customs_broker_company_name?: string | null;
  customer_reference?: string | null;
  pickup_date?: string | null;
  delivery_date?: string | null;
  pickup_company_name?: string | null;
  delivery_company_name?: string | null;
  number_of_skids?: number | string | null;
  weight_lbs?: number | string | null;
  dispatch_base_price?: number | string | null;
  dispatch_price_currency?: Currency | string | null;
  billing_status?: BillingStatus | string | null;
  accounting_notes?: string | null;
  quickbooks_invoice_number?: string | null;
  status?: string | null;
};

type ProfileStatus = "complete" | "needs_details";

type CompanyOption = {
  id?: string | null;
  name: string;
  normalized_name?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  email?: string | null;
  profile_status?: ProfileStatus | string | null;
};

type NamedOption = {
  id?: string | null;
  name: string;
  normalized_name?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  profile_status?: ProfileStatus | string | null;
};

type BrokerUsageRecord = {
  id: string;
  bill_to_company_name: string | null;
  shipper_company_name: string | null;
  receiver_company_name: string | null;
  customs_broker_company_name: string | null;
  normalized_bill_to: string | null;
  normalized_shipper: string | null;
  normalized_receiver: string | null;
  normalized_customs_broker: string | null;
  usage_count: number | null;
  last_used_at: string | null;
};

type BaseForm = {
  bill_to_company_name: string;
  carrier_company_name: string;
  customs_broker_company_name: string;
  customer_reference: string;
  pickup_date: string;
  delivery_date: string;
  currency: Currency;
  billing_status: BillingStatus;
  quickbooks_invoice_number: string;
  accounting_notes: string;
};

type LineDraft = {
  id?: string;
  line_number: number;
  shipper: string;
  shipper_city: string;
  receiver: string;
  receiver_city: string;
  piece_count: string;
  piece_type: string;
  commodity: string;
  weight_lbs: string;
  price: string;
  notes: string;
};

type LineRecord = {
  id: string;
  line_number: number | null;
  pickup_company_name: string | null;
  pickup_city: string | null;
  delivery_company_name: string | null;
  delivery_city: string | null;
  quantity: number | string | null;
  unit: string | null;
  commodity?: string | null;
  weight_lbs: number | string | null;
  amount: number | string | null;
  notes: string | null;
};

type IncompleteReference = {
  id?: string | null;
  type: "Customer" | "Carrier" | "Customs Broker" | "Shipper" | "Receiver";
  name: string;
  reason: string;
};

const emptyBaseForm: BaseForm = {
  bill_to_company_name: "",
  carrier_company_name: "",
  customs_broker_company_name: "",
  customer_reference: "",
  pickup_date: "",
  delivery_date: "",
  currency: "CAD",
  billing_status: "not_ready",
  quickbooks_invoice_number: "",
  accounting_notes: "",
};

function createBlankLine(lineNumber = 1): LineDraft {
  return {
    line_number: lineNumber,
    shipper: "",
    shipper_city: "",
    receiver: "",
    receiver_city: "",
    piece_count: "",
    piece_type: "skid",
    commodity: "",
    weight_lbs: "",
    price: "",
    notes: "",
  };
}

export default function WorkOrderBuilderPage() {
  const params = useParams<{ workOrderNumber?: string | string[] }>();
  const router = useRouter();

  const rawWorkOrderNumber = Array.isArray(params.workOrderNumber)
    ? params.workOrderNumber[0]
    : params.workOrderNumber;

  const workOrderNumber = useMemo(() => {
    if (!rawWorkOrderNumber) return "";
    try {
      return decodeURIComponent(rawWorkOrderNumber);
    } catch {
      return rawWorkOrderNumber;
    }
  }, [rawWorkOrderNumber]);

  const isNew = workOrderNumber === "new";

  const [workOrder, setWorkOrder] = useState<WorkOrderRecord | null>(null);
  const [baseForm, setBaseForm] = useState<BaseForm>(emptyBaseForm);
  const [lines, setLines] = useState<LineDraft[]>([createBlankLine(1)]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [customers, setCustomers] = useState<NamedOption[]>([]);
  const [carriers, setCarriers] = useState<NamedOption[]>([]);
  const [customsBrokers, setCustomsBrokers] = useState<NamedOption[]>([]);
  const [brokerUsage, setBrokerUsage] = useState<BrokerUsageRecord[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(isNew);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    loadReferenceLists();

    if (isNew) {
      setWorkOrder(null);
      setBaseForm(emptyBaseForm);
      setLines([createBlankLine(1)]);
      setLoading(false);
      setEditing(true);
      return;
    }

    loadExistingWorkOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workOrderNumber]);

  useEffect(() => {
    const refreshReferenceData = () => {
      loadReferenceLists();
      if (!isNew) {
        loadExistingWorkOrder();
      }
    };

    window.addEventListener("focus", refreshReferenceData);
    return () => window.removeEventListener("focus", refreshReferenceData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, workOrderNumber]);

  const loadReferenceLists = async () => {
    const [
      companyResult,
      customerResult,
      carrierResult,
      brokerResult,
      brokerUsageResult,
    ] = await Promise.all([
      supabase
        .from("companies")
        .select(
          "id,name,normalized_name,address,city,postal_code,contact_name,contact_phone,email,profile_status,missing_details_note",
        )
        .order("name", { ascending: true }),
      supabase
        .from("billing_customers")
        .select(
          "id,name,normalized_name,contact_name,contact_phone,email,address,city,postal_code,profile_status",
        )
        .order("name", { ascending: true }),
      supabase
        .from("carriers")
        .select(
          "id,name,normalized_name,contact_name,contact_phone,email,address,city,postal_code,profile_status",
        )
        .order("name", { ascending: true }),
      supabase
        .from("customs_brokers")
        .select(
          "id,name,normalized_name,contact_name,contact_phone,email,address,city,postal_code,profile_status",
        )
        .order("name", { ascending: true }),
      supabase
        .from("work_order_customs_broker_usage")
        .select("*")
        .order("usage_count", { ascending: false })
        .order("last_used_at", { ascending: false }),
    ]);

    if (companyResult.error) {
      console.error(
        "Error loading pickup/delivery companies:",
        companyResult.error,
      );
    }

    if (customerResult.error) {
      console.error("Error loading billing customers:", customerResult.error);
    }

    if (carrierResult.error) {
      console.error("Error loading carriers:", carrierResult.error);
    }

    if (brokerResult.error) {
      console.error("Error loading customs brokers:", brokerResult.error);
    }

    if (brokerUsageResult.error) {
      console.error(
        "Error loading customs broker history:",
        brokerUsageResult.error,
      );
    }

    setCompanies(
      ((companyResult.data || []) as CompanyOption[]).filter(
        (company) => company.name,
      ),
    );

    setCustomers(
      ((customerResult.data || []) as NamedOption[]).filter(
        (customer) => customer.name,
      ),
    );

    setCarriers(
      ((carrierResult.data || []) as NamedOption[]).filter(
        (carrier) => carrier.name,
      ),
    );

    setCustomsBrokers(
      ((brokerResult.data || []) as NamedOption[]).filter(
        (broker) => broker.name,
      ),
    );

    setBrokerUsage((brokerUsageResult.data || []) as BrokerUsageRecord[]);
  };

  const loadExistingWorkOrder = async () => {
    if (!workOrderNumber) return;

    try {
      setLoading(true);
      setNotFound(false);

      const { data, error } = await supabase
        .from("work_orders")
        .select("*")
        .eq("work_order_number", workOrderNumber)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        setNotFound(true);
        setWorkOrder(null);
        return;
      }

      const loadedWorkOrder = data as WorkOrderRecord;
      setWorkOrder(loadedWorkOrder);
      setBaseForm(buildBaseForm(loadedWorkOrder));

      const { data: lineData, error: lineError } = await supabase
        .from("work_order_line_items")
        .select("*")
        .eq("work_order_id", loadedWorkOrder.id)
        .order("line_number", { ascending: true });

      if (lineError) {
        console.error("Error loading line items:", lineError);
      }

      const loadedLines = ((lineData || []) as LineRecord[]).map(
        lineRecordToDraft,
      );
      setLines(
        loadedLines.length > 0
          ? loadedLines
          : [lineFromWorkOrder(loadedWorkOrder)],
      );
      setEditing(false);
    } catch (error) {
      console.error("Error loading work order:", error);
      alert("Could not load work order.");
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  const totals = useMemo(() => calculateTotals(lines), [lines]);

  const rankedCustomsBrokers = useMemo(() => {
    const firstLine = lines[0] || createBlankLine(1);

    return rankCustomsBrokersForShipment({
      customsBrokers,
      brokerUsage,
      billTo: baseForm.bill_to_company_name,
      shipper: firstLine.shipper,
      receiver: firstLine.receiver,
    });
  }, [baseForm.bill_to_company_name, brokerUsage, customsBrokers, lines]);

  const incompleteReferences = useMemo(() => {
    return findIncompleteReferences({
      baseForm,
      lines,
      customers,
      carriers,
      customsBrokers,
      companies,
    });
  }, [baseForm, carriers, companies, customsBrokers, customers, lines]);

  const displayedIncompleteReferences = editing ? [] : incompleteReferences;

  const updateBase = (field: keyof BaseForm, value: string) => {
    setBaseForm((current) => ({ ...current, [field]: value }) as BaseForm);
  };

  const updateLine = (index: number, field: keyof LineDraft, value: string) => {
    setLines((current) =>
      current.map((line, lineIndex) => {
        if (lineIndex !== index) return line;
        return { ...line, [field]: value };
      }),
    );
  };

  const addLine = () => {
    setLines((current) => [...current, createBlankLine(current.length + 1)]);
  };

  const removeLine = (index: number) => {
    if (lines.length <= 1) {
      alert("A work order needs at least one line.");
      return;
    }

    setLines((current) =>
      current
        .filter((_, lineIndex) => lineIndex !== index)
        .map((line, lineIndex) => ({ ...line, line_number: lineIndex + 1 })),
    );
  };

  const applyCompanyToLine = (
    index: number,
    side: "shipper" | "receiver",
    companyName: string,
  ) => {
    const company = findCompany(companies, companyName);

    setLines((current) =>
      current.map((line, lineIndex) => {
        if (lineIndex !== index) return line;

        if (side === "shipper") {
          return {
            ...line,
            shipper: companyName,
            shipper_city: company?.city || line.shipper_city,
          };
        }

        return {
          ...line,
          receiver: companyName,
          receiver_city: company?.city || line.receiver_city,
        };
      }),
    );
  };

  const validateBeforeSave = () => {
    const missingBase: string[] = [];

    if (!baseForm.bill_to_company_name.trim())
      missingBase.push("Bill To / Customer");
    if (!baseForm.carrier_company_name.trim()) missingBase.push("Carrier");

    if (missingBase.length > 0) {
      alert(`Missing required base information:\n\n${missingBase.join("\n")}`);
      return false;
    }

    for (const [index, line] of lines.entries()) {
      const missingLine: string[] = [];

      if (!line.shipper.trim()) missingLine.push("Shipper");
      if (!line.receiver.trim()) missingLine.push("Receiver");

      if (missingLine.length > 0) {
        alert(`Line ${index + 1} is missing:\n\n${missingLine.join("\n")}`);
        return false;
      }
    }

    const lockedBillingStatuses: BillingStatus[] = [
      "ready_to_invoice",
      "sent_to_quickbooks",
      "invoiced",
      "paid",
    ];

    if (
      lockedBillingStatuses.includes(baseForm.billing_status) &&
      incompleteReferences.length > 0
    ) {
      alert(
        `This work order cannot move to ${formatStatus(baseForm.billing_status)} until these records are completed:\n\n${incompleteReferences
          .map(
            (reference) =>
              `${reference.type}: ${reference.name} — ${reference.reason}`,
          )
          .join("\n")}`,
      );
      return false;
    }

    if (
      baseForm.pickup_date &&
      baseForm.delivery_date &&
      baseForm.delivery_date < baseForm.pickup_date
    ) {
      return confirm(
        "The estimated delivery date is before the pickup date. Save anyway?",
      );
    }

    return true;
  };

  const saveWorkOrder = async () => {
    if (!validateBeforeSave()) return;

    try {
      setSaving(true);

      await saveReferenceNames({
        billTo: baseForm.bill_to_company_name,
        carrier: baseForm.carrier_company_name,
        customsBroker: baseForm.customs_broker_company_name,
        lines,
        companies,
      });

      const firstLine = lines[0];
      const workOrderPayload = {
        customer_company_name: cleanText(baseForm.bill_to_company_name),
        bill_to_company_name: cleanText(baseForm.bill_to_company_name),
        carrier_company_name: cleanText(baseForm.carrier_company_name),
        customs_broker_company_name: cleanText(
          baseForm.customs_broker_company_name,
        ),
        customer_reference: cleanText(baseForm.customer_reference),
        pickup_date: cleanText(baseForm.pickup_date),
        delivery_date: cleanText(baseForm.delivery_date),
        pickup_company_name: cleanText(firstLine.shipper),
        pickup_city: cleanText(firstLine.shipper_city),
        delivery_company_name: cleanText(firstLine.receiver),
        delivery_city: cleanText(firstLine.receiver_city),
        number_of_skids: totals.totalPieces || null,
        weight_lbs: totals.totalWeight || null,
        dispatch_base_price: totals.totalPrice || null,
        dispatch_price_currency: baseForm.currency,
        billing_status: baseForm.billing_status,
        quickbooks_invoice_number: cleanText(
          baseForm.quickbooks_invoice_number,
        ),
        accounting_notes: cleanText(baseForm.accounting_notes),
        service_type: "ltl",
        priority_level: "normal",
        status: "draft",
        invoice_status: "not_invoiced",
        ready_to_invoice: false,
        pod_received: false,
      };

      let workOrderId = workOrder?.id || "";
      let savedNumber = workOrder?.work_order_number || "";

      if (isNew || !workOrderId) {
        const { data, error } = await supabase
          .from("work_orders")
          .insert([{ ...workOrderPayload, work_order_number: "" }])
          .select("*")
          .single();

        if (error) throw error;

        const inserted = data as WorkOrderRecord;
        workOrderId = inserted.id;
        savedNumber = inserted.work_order_number || "";
        setWorkOrder(inserted);
      } else {
        const { data, error } = await supabase
          .from("work_orders")
          .update(workOrderPayload)
          .eq("id", workOrderId)
          .select("*")
          .single();

        if (error) throw error;
        const updated = data as WorkOrderRecord;
        savedNumber = updated.work_order_number || savedNumber;
        setWorkOrder(updated);
      }

      const { error: deleteError } = await supabase
        .from("work_order_line_items")
        .delete()
        .eq("work_order_id", workOrderId);

      if (deleteError) throw deleteError;

      const { data: savedLines, error: lineError } = await supabase
        .from("work_order_line_items")
        .insert(
          lines.map((line, index) => ({
            work_order_id: workOrderId,
            line_number: index + 1,
            description: `${line.shipper.trim()} → ${line.receiver.trim()}`,
            quantity: numberOrNull(line.piece_count),
            unit: cleanText(line.piece_type),
            commodity: cleanText(line.commodity),
            weight_lbs: numberOrNull(line.weight_lbs),
            amount: numberOrNull(line.price),
            notes: cleanText(line.notes),
            pickup_company_name: cleanText(line.shipper),
            pickup_city: cleanText(line.shipper_city),
            pickup_date: cleanText(baseForm.pickup_date),
            delivery_company_name: cleanText(line.receiver),
            delivery_city: cleanText(line.receiver_city),
            delivery_date: cleanText(baseForm.delivery_date),
          })),
        )
        .select("*")
        .order("line_number", { ascending: true });

      if (lineError) throw lineError;

      await saveCustomsBrokerUsage({
        billTo: baseForm.bill_to_company_name,
        shipper: firstLine.shipper,
        receiver: firstLine.receiver,
        customsBroker: baseForm.customs_broker_company_name,
      });

      await loadReferenceLists();

      setLines(((savedLines || []) as LineRecord[]).map(lineRecordToDraft));
      setEditing(false);

      window.localStorage.setItem(
        "dispatch_pro_work_orders_refresh",
        String(Date.now()),
      );

      if (isNew && savedNumber) {
        router.replace(`/wo/${encodeURIComponent(savedNumber)}`);
      }
    } catch (error) {
      console.error("Error saving work order:", error);
      alert(
        error instanceof Error ? error.message : "Could not save work order.",
      );
    } finally {
      setSaving(false);
    }
  };

  const closeTab = () => {
    if (typeof window === "undefined") return;
    window.close();
    window.setTimeout(() => {
      if (!window.closed) router.push("/work-orders");
    }, 150);
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex h-full items-center justify-center">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-soft dark:border-dark-border dark:bg-dark-card">
            <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-blue-700 dark:text-blue-300" />
            <p className="font-semibold text-slate-700 dark:text-slate-300">
              Loading work order...
            </p>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (notFound) {
    return (
      <MainLayout>
        <div className="flex h-full items-center justify-center">
          <div className="max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-soft dark:border-dark-border dark:bg-dark-card">
            <h1 className="text-2xl font-black text-slate-950 dark:text-white">
              Work order not found
            </h1>
            <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              Could not find {workOrderNumber}.
            </p>
            <button
              type="button"
              onClick={closeTab}
              className="btn-secondary mt-5 inline-flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to List
            </button>
          </div>
        </div>
      </MainLayout>
    );
  }

  const titleNumber = isNew
    ? "New Work Order"
    : workOrder?.work_order_number || workOrderNumber;

  return (
    <MainLayout>
      <style jsx global>{`
        @media print {
          body {
            background: white !important;
          }
          aside,
          nav,
          .no-print,
          .screen-area {
            display: none !important;
          }
          main {
            overflow: visible !important;
            background: white !important;
          }
          .print-area {
            display: block !important;
          }
          .wo-bol-page {
            page-break-after: always;
            break-after: page;
          }
        }

        @page {
          size: letter;
          margin: 0.25in;
        }
      `}</style>

      <div className="screen-area flex h-full min-h-0 flex-col overflow-hidden bg-slate-100 text-slate-950 dark:bg-dark-bg dark:text-slate-100">
        <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-slate-300 bg-white px-4 py-2 shadow-sm dark:border-dark-border dark:bg-dark-card">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-black text-slate-950 dark:text-white">
                {titleNumber}
              </h1>
              <Badge>
                {isNew ? "Creating" : editing ? "Editing" : "Viewing"}
              </Badge>
              <Badge>{formatStatus(baseForm.billing_status)}</Badge>
            </div>
            <p className="mt-1 truncate text-xs font-semibold text-slate-700 dark:text-slate-300">
              Bill To: {displayValue(baseForm.bill_to_company_name)} • Carrier:{" "}
              {displayValue(baseForm.carrier_company_name)} • Broker:{" "}
              {displayValue(baseForm.customs_broker_company_name)}
            </p>
          </div>

          <div className="flex flex-shrink-0 items-center gap-2">
            {!editing && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="btn-secondary h-9 px-3 text-sm"
              >
                Edit
              </button>
            )}

            {editing && !isNew && (
              <button
                type="button"
                onClick={() => loadExistingWorkOrder()}
                className="btn-secondary h-9 px-3 text-sm"
                disabled={saving}
              >
                Cancel
              </button>
            )}

            {editing && (
              <button
                type="button"
                onClick={saveWorkOrder}
                className="btn-primary h-9 gap-2 px-3 text-sm"
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save
              </button>
            )}

            <button
              type="button"
              onClick={() => window.print()}
              className="btn-secondary h-9 gap-2 px-3 text-sm"
            >
              <Printer className="h-4 w-4" />
              BOL
            </button>

            <button
              type="button"
              onClick={closeTab}
              className="btn-secondary h-9 px-3 text-sm"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {displayedIncompleteReferences.length > 0 && (
          <IncompleteReferencesBanner references={displayedIncompleteReferences} />
        )}

        <div className="grid min-h-0 flex-1 grid-cols-12 gap-3 overflow-hidden p-3">
          <section className="col-span-12 min-h-0 rounded-2xl border border-slate-300 bg-white p-3 shadow-soft dark:border-dark-border dark:bg-dark-card xl:col-span-4">
            <div className="mb-2 flex items-start justify-between gap-2">
              <SectionTitle
                title="Base Information"
                subtitle="Only Bill To and Carrier are required here"
              />
              {displayedIncompleteReferences.length > 0 && (
                <a
                  href={buildRecordsNeedingDetailsUrl(displayedIncompleteReferences[0])}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                >
                  <ExternalLink className="h-3 w-3" />
                  Fix Details
                </a>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <EntityField
                label="Bill To / Customer *"
                value={baseForm.bill_to_company_name}
                disabled={!editing}
                options={customers}
                placeholder="Billing customer"
                onChange={(value) => updateBase("bill_to_company_name", value)}
              />
              <EntityField
                label="Carrier *"
                value={baseForm.carrier_company_name}
                disabled={!editing}
                options={carriers}
                placeholder="Carrier"
                onChange={(value) => updateBase("carrier_company_name", value)}
              />
              <EntityField
                label="Customs Broker"
                value={baseForm.customs_broker_company_name}
                disabled={!editing}
                options={rankedCustomsBrokers}
                placeholder="Optional customs broker"
                onChange={(value) =>
                  updateBase("customs_broker_company_name", value)
                }
                helper={
                  rankedCustomsBrokers[0]?.isLikely
                    ? `Likely: ${rankedCustomsBrokers[0].name}`
                    : undefined
                }
              />
              <CompactInput
                label="Customer Ref"
                value={baseForm.customer_reference}
                disabled={!editing}
                onChange={(value) => updateBase("customer_reference", value)}
              />
              <CompactInput
                label="Pickup Date"
                value={baseForm.pickup_date}
                type="date"
                disabled={!editing}
                onChange={(value) => updateBase("pickup_date", value)}
              />
              <CompactInput
                label="Est. Delivery"
                value={baseForm.delivery_date}
                type="date"
                disabled={!editing}
                onChange={(value) => updateBase("delivery_date", value)}
              />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-200 pt-3 dark:border-dark-border">
              <CompactSelect
                label="Currency"
                value={baseForm.currency}
                disabled={!editing}
                onChange={(value) => updateBase("currency", value)}
                options={["CAD", "USD"]}
              />
              <CompactSelect
                label="Billing Status"
                value={baseForm.billing_status}
                disabled={!editing}
                onChange={(value) => updateBase("billing_status", value)}
                options={[
                  "not_ready",
                  "price_entered",
                  "ready_for_accounting",
                  "accounting_reviewing",
                  "ready_to_invoice",
                  "sent_to_quickbooks",
                  "invoiced",
                  "paid",
                  "do_not_bill",
                ]}
              />
              <CompactInput
                label="QB Invoice #"
                value={baseForm.quickbooks_invoice_number}
                disabled={!editing}
                onChange={(value) =>
                  updateBase("quickbooks_invoice_number", value)
                }
              />
              <CompactInput
                label="Accounting Notes"
                value={baseForm.accounting_notes}
                disabled={!editing}
                onChange={(value) => updateBase("accounting_notes", value)}
              />
            </div>

            <div className="mt-3 rounded-xl border border-slate-300 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/60">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-900 dark:text-white">
                    <FileText className="h-4 w-4 text-blue-700 dark:text-blue-300" />
                    BOL / Documents
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
                    Create/print the BOL directly from this work order.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="btn-secondary h-8 gap-2 px-3 text-xs"
                >
                  <Printer className="h-4 w-4" />
                  Print BOL
                </button>
              </div>
            </div>
          </section>

          <section className="col-span-12 flex min-h-0 flex-col rounded-2xl border border-slate-300 bg-white shadow-soft dark:border-dark-border dark:bg-dark-card xl:col-span-8">
            <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-slate-200 p-3 dark:border-dark-border">
              <SectionTitle
                title="Freight Lines"
                subtitle="Line 1 is required. Shipper and receiver are required. Price can be added later by accounting."
              />
              {editing && (
                <button
                  type="button"
                  onClick={addLine}
                  className="btn-primary h-8 gap-1 px-3 text-xs"
                >
                  <Plus className="h-4 w-4" />
                  Line
                </button>
              )}
            </div>

            <div className="custom-board-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
              <div className="space-y-2">
                {lines.map((line, index) => (
                  <LineEditor
                    key={line.id || `line-${index}`}
                    index={index}
                    line={line}
                    editing={editing}
                    companies={companies}
                    onUpdate={(field, value) => updateLine(index, field, value)}
                    onCompany={(side, value) =>
                      applyCompanyToLine(index, side, value)
                    }
                    onRemove={() => removeLine(index)}
                    canRemove={lines.length > 1}
                    currency={baseForm.currency}
                  />
                ))}
              </div>
            </div>

            <div className="grid flex-shrink-0 grid-cols-4 gap-2 border-t border-slate-200 bg-slate-50 p-3 dark:border-dark-border dark:bg-slate-900/70">
              <SummaryCell label="Lines" value={String(lines.length)} />
              <SummaryCell
                label="Pieces"
                value={formatNumber(totals.totalPieces)}
              />
              <SummaryCell
                label="Weight"
                value={`${formatNumber(totals.totalWeight)} lb`}
              />
              <SummaryCell
                label="Total Price"
                value={formatMoney(totals.totalPrice, baseForm.currency)}
                strong
              />
            </div>
          </section>
        </div>
      </div>

      <div className="print-area hidden">
        <PrintableWorkOrderBol
          workOrderNumber={titleNumber}
          baseForm={baseForm}
          lines={lines}
          totals={totals}
        />
      </div>
    </MainLayout>
  );
}

function PrintableWorkOrderBol({
  workOrderNumber,
  baseForm,
  lines,
  totals,
}: {
  workOrderNumber: string;
  baseForm: BaseForm;
  lines: LineDraft[];
  totals: { totalPieces: number; totalWeight: number; totalPrice: number };
}) {
  const today = new Date().toLocaleDateString();

  return (
    <div className="wo-bol-page bg-white p-4 text-black">
      <div className="mb-3 flex items-start justify-between border-b-2 border-black pb-2">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-wide">
            Bill of Lading
          </h1>
          <p className="text-xs font-bold uppercase">
            Freightboy Work Order BOL
          </p>
        </div>
        <div className="text-right text-xs font-bold">
          <p>WO: {workOrderNumber}</p>
          <p>Date: {today}</p>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2 text-xs">
        <PrintBox
          title="Bill To / Customer"
          value={baseForm.bill_to_company_name}
        />
        <PrintBox title="Carrier" value={baseForm.carrier_company_name} />
        <PrintBox
          title="Customs Broker"
          value={baseForm.customs_broker_company_name || "N/A"}
        />
        <PrintBox
          title="Customer Reference"
          value={baseForm.customer_reference || "N/A"}
        />
        <PrintBox title="Pickup Date" value={baseForm.pickup_date || "N/A"} />
        <PrintBox
          title="Estimated Delivery"
          value={baseForm.delivery_date || "N/A"}
        />
      </div>

      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-slate-100">
            <th className="border border-black px-1 py-1 text-left">Line</th>
            <th className="border border-black px-1 py-1 text-left">Shipper</th>
            <th className="border border-black px-1 py-1 text-left">
              Receiver
            </th>
            <th className="border border-black px-1 py-1 text-left">Pieces</th>
            <th className="border border-black px-1 py-1 text-left">
              Commodity
            </th>
            <th className="border border-black px-1 py-1 text-right">Weight</th>
            <th className="border border-black px-1 py-1 text-right">Price</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={line.id || index}>
              <td className="border border-black px-1 py-1 font-bold">
                {index + 1}
              </td>
              <td className="border border-black px-1 py-1">
                <p className="font-bold">{displayValue(line.shipper)}</p>
                <p>{displayValue(line.shipper_city, "")}</p>
              </td>
              <td className="border border-black px-1 py-1">
                <p className="font-bold">{displayValue(line.receiver)}</p>
                <p>{displayValue(line.receiver_city, "")}</p>
              </td>
              <td className="border border-black px-1 py-1">
                {displayValue(line.piece_count, "0")}{" "}
                {displayValue(line.piece_type, "pcs")}
              </td>
              <td className="border border-black px-1 py-1">
                {displayValue(line.commodity, "")}
              </td>
              <td className="border border-black px-1 py-1 text-right">
                {formatNumber(numberOrZero(line.weight_lbs))} lb
              </td>
              <td className="border border-black px-1 py-1 text-right">
                {formatMoney(numberOrZero(line.price), baseForm.currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs font-bold">
        <PrintBox
          title="Total Pieces"
          value={formatNumber(totals.totalPieces)}
        />
        <PrintBox
          title="Total Weight"
          value={`${formatNumber(totals.totalWeight)} lb`}
        />
        <PrintBox
          title="Total Price"
          value={formatMoney(totals.totalPrice, baseForm.currency)}
        />
      </div>

      <div className="mt-8 grid grid-cols-2 gap-8 text-xs font-bold">
        <div className="border-t border-black pt-1">Shipper Signature</div>
        <div className="border-t border-black pt-1">Carrier Signature</div>
      </div>
    </div>
  );
}

function PrintBox({ title, value }: { title: string; value: string | number }) {
  return (
    <div className="border border-black p-2">
      <p className="text-[9px] font-black uppercase tracking-wide">{title}</p>
      <p className="mt-1 font-bold">{displayValue(value)}</p>
    </div>
  );
}

function LineEditor({
  index,
  line,
  editing,
  companies,
  onUpdate,
  onCompany,
  onRemove,
  canRemove,
  currency,
}: {
  index: number;
  line: LineDraft;
  editing: boolean;
  companies: CompanyOption[];
  onUpdate: (field: keyof LineDraft, value: string) => void;
  onCompany: (side: "shipper" | "receiver", value: string) => void;
  onRemove: () => void;
  canRemove: boolean;
  currency: Currency;
}) {
  const lineTitle =
    line.shipper || line.receiver
      ? `${displayValue(line.shipper)} → ${displayValue(line.receiver)}`
      : `Line ${index + 1}`;

  return (
    <div className="rounded-xl border-2 border-slate-300 bg-white p-2 dark:border-slate-700 dark:bg-slate-900/70">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-slate-950 dark:text-white">
            Line {index + 1}: {lineTitle}
          </p>
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
            {formatMoney(numberOrZero(line.price), currency)} •{" "}
            {displayValue(line.piece_count, "0")}{" "}
            {displayValue(line.piece_type, "pieces")} •{" "}
            {displayValue(line.commodity, "Commodity required")}
          </p>
        </div>

        {editing && canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-lg border border-red-300 bg-red-50 p-2 text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-12 gap-2">
        <div className="col-span-12 md:col-span-3">
          <CompanyField
            label="Shipper *"
            value={line.shipper}
            disabled={!editing}
            companies={companies}
            onChange={(value) => onCompany("shipper", value)}
          />
        </div>
        <div className="col-span-6 md:col-span-2">
          <CompactInput
            label="PU City"
            value={line.shipper_city}
            disabled={!editing}
            onChange={(value) => onUpdate("shipper_city", value)}
          />
        </div>
        <div className="col-span-12 md:col-span-3">
          <CompanyField
            label="Receiver *"
            value={line.receiver}
            disabled={!editing}
            companies={companies}
            onChange={(value) => onCompany("receiver", value)}
          />
        </div>
        <div className="col-span-6 md:col-span-2">
          <CompactInput
            label="DEL City"
            value={line.receiver_city}
            disabled={!editing}
            onChange={(value) => onUpdate("receiver_city", value)}
          />
        </div>
        <div className="col-span-6 md:col-span-1">
          <CompactInput
            label="Pieces"
            value={line.piece_count}
            type="number"
            disabled={!editing}
            onChange={(value) => onUpdate("piece_count", value)}
          />
        </div>
        <div className="col-span-6 md:col-span-1">
          <CompactSelect
            label="Type"
            value={line.piece_type}
            disabled={!editing}
            onChange={(value) => onUpdate("piece_type", value)}
            options={[
              "skid",
              "box",
              "crate",
              "pallet",
              "bundle",
              "carton",
              "piece",
              "other",
            ]}
          />
        </div>
        <div className="col-span-12 md:col-span-4">
          <CompactInput
            label="Commodity"
            value={line.commodity}
            disabled={!editing}
            onChange={(value) => onUpdate("commodity", value)}
          />
        </div>
        <div className="col-span-6 md:col-span-2">
          <CompactInput
            label="Weight lb"
            value={line.weight_lbs}
            type="number"
            disabled={!editing}
            onChange={(value) => onUpdate("weight_lbs", value)}
          />
        </div>
        <div className="col-span-6 md:col-span-2">
          <CompactInput
            label={`Price ${currency}`}
            value={line.price}
            type="number"
            disabled={!editing}
            onChange={(value) => onUpdate("price", value)}
          />
        </div>
        <div className="col-span-12 md:col-span-4">
          <CompactInput
            label="Line Notes"
            value={line.notes}
            disabled={!editing}
            onChange={(value) => onUpdate("notes", value)}
          />
        </div>
      </div>
    </div>
  );
}

function SectionTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-2">
      <h2 className="text-sm font-black uppercase tracking-wide text-slate-950 dark:text-white">
        {title}
      </h2>
      <p className="mt-0.5 text-xs font-semibold text-slate-600 dark:text-slate-400">
        {subtitle}
      </p>
    </div>
  );
}

function CompactInput({
  label,
  value,
  onChange,
  disabled,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-600 dark:text-slate-400">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-950 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-100 disabled:text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:disabled:bg-slate-900 dark:disabled:text-slate-300"
      />
    </label>
  );
}

function CompactSelect({
  label,
  value,
  onChange,
  disabled,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  options: string[];
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-600 dark:text-slate-400">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-950 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-100 disabled:text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:disabled:bg-slate-900 dark:disabled:text-slate-300"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {formatStatus(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function CompanyField({
  label,
  value,
  onChange,
  disabled,
  companies,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  companies: CompanyOption[];
}) {
  const options = companies.map((company) => ({
    name: company.name,
    meta: [company.city, company.address].filter(Boolean).join(" • "),
    needsDetails: needsCompanyDetails(company),
  }));

  return (
    <SearchPickerField
      label={label}
      value={value}
      disabled={disabled}
      options={options}
      placeholder={label.replace(" *", "")}
      emptyMessage="No matching companies"
      onChange={onChange}
    />
  );
}

function EntityField({
  label,
  value,
  onChange,
  disabled,
  options,
  placeholder,
  helper,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  options: Array<NamedOption & { isLikely?: boolean }>;
  placeholder?: string;
  helper?: string;
}) {
  const pickerOptions = options.map((option) => ({
    name: option.name,
    meta: option.isLikely
      ? "Likely match from previous work orders"
      : buildReferenceMeta(option),
    isLikely: option.isLikely,
    needsDetails: needsNamedDetails(option),
  }));

  return (
    <SearchPickerField
      label={label}
      value={value}
      disabled={disabled}
      options={pickerOptions}
      placeholder={placeholder}
      helper={helper}
      emptyMessage="No matching results"
      onChange={onChange}
    />
  );
}

type SearchPickerOption = {
  name: string;
  meta?: string;
  isLikely?: boolean;
  needsDetails?: boolean;
};

function SearchPickerField({
  label,
  value,
  onChange,
  disabled,
  options,
  placeholder,
  helper,
  emptyMessage,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  options: SearchPickerOption[];
  placeholder?: string;
  helper?: string;
  emptyMessage: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);

  useEffect(() => {
    if (!open) setQuery(value);
  }, [open, value]);

  const filteredOptions = useMemo(() => {
    const normalizedQuery = normalizeKey(query || value);

    const ranked = options
      .map((option) => {
        const optionKey = normalizeKey(option.name);
        const metaKey = normalizeKey(option.meta || "");

        let score = option.isLikely ? 100 : 0;

        if (!normalizedQuery) {
          return { option, score };
        }

        if (optionKey === normalizedQuery) score += 80;
        else if (optionKey.startsWith(normalizedQuery)) score += 60;
        else if (optionKey.includes(normalizedQuery)) score += 40;
        else if (metaKey.includes(normalizedQuery)) score += 20;
        else return null;

        return { option, score };
      })
      .filter(Boolean) as Array<{ option: SearchPickerOption; score: number }>;

    return ranked
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.option.name.localeCompare(b.option.name);
      })
      .slice(0, 12)
      .map((item) => item.option);
  }, [options, query, value]);

  const selectValue = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
  };

  return (
    <div className="relative">
      <label className="block">
        <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-600 dark:text-slate-400">
          {label}
        </span>

        <div className="flex h-9 overflow-hidden rounded-lg border border-slate-300 bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950">
          <input
            value={value}
            placeholder={placeholder}
            onChange={(event) => onChange(event.target.value)}
            disabled={disabled}
            className="min-w-0 flex-1 bg-transparent px-2 text-sm font-semibold text-slate-950 outline-none disabled:bg-slate-100 disabled:text-slate-700 dark:text-white dark:disabled:bg-slate-900 dark:disabled:text-slate-300"
          />

          <button
            type="button"
            onClick={() => {
              if (!disabled) setOpen(true);
            }}
            disabled={disabled}
            className="flex w-9 flex-shrink-0 items-center justify-center border-l border-slate-300 bg-slate-50 text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            title={`Search ${label.replace(" *", "")}`}
          >
            <Search className="h-4 w-4" />
          </button>
        </div>
      </label>

      {helper && !disabled && (
        <button
          type="button"
          onClick={() => {
            const likely = options.find((option) => option.isLikely);
            if (likely) selectValue(likely.name);
          }}
          className="mt-1 block max-w-full truncate text-left text-[10px] font-bold text-blue-700 hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-200"
        >
          {helper}
        </button>
      )}

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[min(420px,90vw)] rounded-xl border border-slate-300 bg-white p-2 shadow-2xl dark:border-slate-700 dark:bg-slate-950">
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-2 dark:border-slate-700 dark:bg-slate-900">
            <Search className="h-4 w-4 flex-shrink-0 text-slate-500 dark:text-slate-400" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setOpen(false);
                if (event.key === "Enter" && query.trim())
                  selectValue(query.trim());
              }}
              placeholder={`Search or type new ${label.replace(" *", "").toLowerCase()}`}
              className="h-9 min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-950 outline-none dark:text-white"
            />

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="custom-board-scrollbar max-h-56 overflow-y-auto">
            {filteredOptions.length > 0 ? (
              <div className="space-y-1">
                {filteredOptions.map((option) => (
                  <button
                    key={`${label}-${option.name}`}
                    type="button"
                    onClick={() => selectValue(option.name)}
                    className={`w-full rounded-lg border px-3 py-2 text-left transition hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 ${
                      option.isLikely
                        ? "border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/50"
                        : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-slate-950 dark:text-white">
                          {option.name}
                        </p>
                        {option.meta && (
                          <p className="mt-0.5 truncate text-xs font-medium text-slate-600 dark:text-slate-400">
                            {option.meta}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-shrink-0 flex-col items-end gap-1">
                        {option.isLikely && (
                          <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">
                            Likely
                          </span>
                        )}

                        {option.needsDetails && (
                          <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">
                            Needs Details
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => query.trim() && selectValue(query.trim())}
                className="w-full rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-left text-sm font-semibold text-slate-700 hover:border-blue-400 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-blue-950/30"
              >
                {query.trim() ? `Use “${query.trim()}”` : emptyMessage}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function IncompleteReferencesBanner({
  references,
}: {
  references: IncompleteReference[];
}) {
  const firstRecordUrl = buildRecordsNeedingDetailsUrl(references[0]);

  return (
    <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-amber-300 bg-amber-50 px-4 py-2 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
      <div className="flex min-w-0 items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-wide">
            Records need details before accounting can invoice
          </p>
          <p className="truncate text-xs font-semibold">
            {references
              .slice(0, 5)
              .map((reference) => `${reference.type}: ${reference.name}`)
              .join(" • ")}
            {references.length > 5 ? ` • +${references.length - 5} more` : ""}
          </p>
        </div>
      </div>

      <div className="flex flex-shrink-0 items-center gap-2">
        <a
          href={firstRecordUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-amber-400 bg-white px-3 py-1 text-xs font-black uppercase tracking-wide text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100 dark:hover:bg-amber-900"
        >
          Fix First
        </a>
        <a
          href="/records-needing-details"
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-amber-300 bg-amber-100 px-3 py-1 text-xs font-black uppercase tracking-wide text-amber-900 hover:bg-amber-200 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-100 dark:hover:bg-amber-900"
        >
          All
        </a>
      </div>
    </div>
  );
}

function buildRecordsNeedingDetailsUrl(reference?: IncompleteReference) {
  if (!reference) return "/records-needing-details";

  const params = new URLSearchParams();
  if (reference.id) params.set("id", reference.id);
  params.set(
    "type",
    reference.type === "Shipper" || reference.type === "Receiver"
      ? "Location"
      : reference.type,
  );
  params.set("name", reference.name);

  return `/records-needing-details?${params.toString()}`;
}

function SummaryCell({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950">
      <p className="text-[10px] font-black uppercase tracking-wide text-slate-600 dark:text-slate-400">
        {label}
      </p>
      <p
        className={`${strong ? "text-lg" : "text-base"} font-black text-slate-950 dark:text-white`}
      >
        {value}
      </p>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
      {children}
    </span>
  );
}

async function saveReferenceNames({
  billTo,
  carrier,
  customsBroker,
  lines,
  companies,
}: {
  billTo: string;
  carrier: string;
  customsBroker: string;
  lines: LineDraft[];
  companies: CompanyOption[];
}) {
  await Promise.all([
    upsertNamedReference("billing_customers", billTo, "needs_billing_details"),
    upsertNamedReference("carriers", carrier, "", true),
    upsertNamedReference("customs_brokers", customsBroker, "", true),
    saveLineCompanies(lines, companies),
  ]);
}

async function upsertNamedReference(
  tableName: string,
  name: string,
  detailsNote: string,
  markComplete = false,
) {
  const cleanedName = name.trim();
  if (!cleanedName) return;

  const normalizedName = normalizeKey(cleanedName);

  const { data: existing, error: findError } = await supabase
    .from(tableName)
    .select("id,profile_status")
    .eq("normalized_name", normalizedName)
    .maybeSingle();

  if (findError) {
    console.error(`Error checking ${tableName}:`, findError);
    return;
  }

  if (existing?.id) {
    const { error } = await supabase
      .from(tableName)
      .update({ updated_at: new Date().toISOString() })
      .eq("id", existing.id);

    if (error) console.error(`Error updating ${tableName}:`, error);
    return;
  }

  const { error } = await supabase.from(tableName).insert([
    {
      name: cleanedName,
      normalized_name: normalizedName,
      profile_status: markComplete ? "complete" : "needs_details",
      missing_details_note: markComplete ? null : detailsNote,
      updated_at: new Date().toISOString(),
    },
  ]);

  if (error) {
    console.error(`Error saving ${tableName}:`, error);
  }
}

async function saveLineCompanies(
  lines: LineDraft[],
  companies: CompanyOption[],
) {
  const existingCompanyKeys = new Set(
    companies
      .flatMap((company) => [
        company.normalized_name,
        normalizeKey(company.name),
      ])
      .filter(Boolean) as string[],
  );

  const pendingCompanies = new Map<string, { name: string; city: string }>();

  lines.forEach((line) => {
    [
      { name: line.shipper, city: line.shipper_city },
      { name: line.receiver, city: line.receiver_city },
    ].forEach((entry) => {
      const cleanedName = entry.name.trim();
      const key = normalizeKey(cleanedName);

      if (
        !cleanedName ||
        !key ||
        existingCompanyKeys.has(key) ||
        pendingCompanies.has(key)
      ) {
        return;
      }

      pendingCompanies.set(key, { name: cleanedName, city: entry.city.trim() });
    });
  });

  if (pendingCompanies.size === 0) return;

  const { error } = await supabase.from("companies").insert(
    Array.from(pendingCompanies.entries()).map(([normalizedName, company]) => ({
      name: company.name,
      city: company.city || null,
      type: "both",
      profile_status: "needs_details",
      missing_details_note: "needs_location_contact_details",
      normalized_name: normalizedName,
    })),
  );

  if (error) {
    console.error("Error saving quick-created shippers/receivers:", error);
  }
}

async function saveCustomsBrokerUsage({
  billTo,
  shipper,
  receiver,
  customsBroker,
}: {
  billTo: string;
  shipper: string;
  receiver: string;
  customsBroker: string;
}) {
  const normalizedBillTo = normalizeKey(billTo);
  const normalizedShipper = normalizeKey(shipper);
  const normalizedReceiver = normalizeKey(receiver);
  const normalizedCustomsBroker = normalizeKey(customsBroker);

  if (
    !normalizedBillTo ||
    !normalizedShipper ||
    !normalizedReceiver ||
    !normalizedCustomsBroker
  ) {
    return;
  }

  const { data: existing, error: findError } = await supabase
    .from("work_order_customs_broker_usage")
    .select("id,usage_count")
    .eq("normalized_bill_to", normalizedBillTo)
    .eq("normalized_shipper", normalizedShipper)
    .eq("normalized_receiver", normalizedReceiver)
    .eq("normalized_customs_broker", normalizedCustomsBroker)
    .maybeSingle();

  if (findError) {
    console.error("Error checking customs broker usage:", findError);
    return;
  }

  if (existing?.id) {
    const { error } = await supabase
      .from("work_order_customs_broker_usage")
      .update({
        bill_to_company_name: billTo.trim(),
        shipper_company_name: shipper.trim(),
        receiver_company_name: receiver.trim(),
        customs_broker_company_name: customsBroker.trim(),
        usage_count: Number(existing.usage_count || 0) + 1,
        last_used_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (error) console.error("Error updating customs broker usage:", error);
    return;
  }

  const { error } = await supabase
    .from("work_order_customs_broker_usage")
    .insert([
      {
        bill_to_company_name: billTo.trim(),
        shipper_company_name: shipper.trim(),
        receiver_company_name: receiver.trim(),
        customs_broker_company_name: customsBroker.trim(),
        normalized_bill_to: normalizedBillTo,
        normalized_shipper: normalizedShipper,
        normalized_receiver: normalizedReceiver,
        normalized_customs_broker: normalizedCustomsBroker,
        usage_count: 1,
        last_used_at: new Date().toISOString(),
      },
    ]);

  if (error) console.error("Error saving customs broker usage:", error);
}

function rankCustomsBrokersForShipment({
  customsBrokers,
  brokerUsage,
  billTo,
  shipper,
  receiver,
}: {
  customsBrokers: NamedOption[];
  brokerUsage: BrokerUsageRecord[];
  billTo: string;
  shipper: string;
  receiver: string;
}): Array<NamedOption & { isLikely?: boolean }> {
  const normalizedBillTo = normalizeKey(billTo);
  const normalizedShipper = normalizeKey(shipper);
  const normalizedReceiver = normalizeKey(receiver);

  const likelyNames = brokerUsage
    .filter((usage) => {
      return (
        usage.normalized_bill_to === normalizedBillTo &&
        usage.normalized_shipper === normalizedShipper &&
        usage.normalized_receiver === normalizedReceiver &&
        Boolean(usage.customs_broker_company_name)
      );
    })
    .sort((a, b) => {
      const countDifference =
        Number(b.usage_count || 0) - Number(a.usage_count || 0);
      if (countDifference !== 0) return countDifference;
      return safeString(b.last_used_at).localeCompare(
        safeString(a.last_used_at),
      );
    })
    .map((usage) => safeString(usage.customs_broker_company_name))
    .filter(Boolean);

  const used = new Set<string>();

  const likelyOptions = likelyNames.map((name) => {
    used.add(normalizeKey(name));
    return { name, normalized_name: normalizeKey(name), isLikely: true };
  });

  const normalOptions = customsBrokers.filter((broker) => {
    const key = normalizeKey(broker.name);
    if (!key || used.has(key)) return false;
    used.add(key);
    return true;
  });

  return [...likelyOptions, ...normalOptions];
}

function findIncompleteReferences({
  baseForm,
  lines,
  customers,
  carriers,
  customsBrokers,
  companies,
}: {
  baseForm: BaseForm;
  lines: LineDraft[];
  customers: NamedOption[];
  carriers: NamedOption[];
  customsBrokers: NamedOption[];
  companies: CompanyOption[];
}) {
  const references: IncompleteReference[] = [];

  addNamedIncomplete(
    references,
    "Customer",
    baseForm.bill_to_company_name,
    customers,
  );
  lines.forEach((line) => {
    addCompanyIncomplete(references, "Shipper", line.shipper, companies);
    addCompanyIncomplete(references, "Receiver", line.receiver, companies);
  });

  const seen = new Set<string>();
  return references.filter((reference) => {
    const key = `${reference.type}:${normalizeKey(reference.name)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function addNamedIncomplete(
  references: IncompleteReference[],
  type: IncompleteReference["type"],
  name: string,
  options: NamedOption[],
) {
  const cleanedName = name.trim();
  if (!cleanedName) return;

  const match = options.find((option) =>
    referenceNameMatches(option, cleanedName),
  );

  if (!match) {
    references.push({
      type,
      name: cleanedName,
      reason: "new record will need details",
    });
    return;
  }

  if (needsNamedDetails(match)) {
    references.push({
      id: match.id,
      type,
      name: match.name,
      reason: "missing address/city details",
    });
  }
}

function addCompanyIncomplete(
  references: IncompleteReference[],
  type: "Shipper" | "Receiver",
  name: string,
  companies: CompanyOption[],
) {
  const cleanedName = name.trim();
  if (!cleanedName) return;

  const match = companies.find((company) =>
    companyNameMatches(company, cleanedName),
  );

  if (!match) {
    references.push({
      type,
      name: cleanedName,
      reason: "new location will need address/city",
    });
    return;
  }

  if (needsCompanyDetails(match)) {
    references.push({
      id: match.id,
      type,
      name: match.name,
      reason: "missing address/city details",
    });
  }
}

function referenceNameMatches(option: NamedOption, value: string) {
  const lookup = normalizeKey(value);
  if (!lookup) return false;

  return (
    normalizeKey(option.name) === lookup ||
    normalizeKey(option.normalized_name) === lookup
  );
}

function companyNameMatches(company: CompanyOption, value: string) {
  const lookup = normalizeKey(value);
  if (!lookup) return false;

  return (
    normalizeKey(company.name) === lookup ||
    normalizeKey(company.normalized_name) === lookup
  );
}

function needsNamedDetails(option: NamedOption) {
  const hasRequiredDetails = Boolean(
    option.name?.trim() && option.address?.trim() && option.city?.trim(),
  );
  if (hasRequiredDetails) return false;

  if (option.profile_status === "needs_details") return true;

  return !hasRequiredDetails;
}

function needsCompanyDetails(company: CompanyOption) {
  const hasRequiredDetails = Boolean(
    company.name?.trim() && company.address?.trim() && company.city?.trim(),
  );
  if (hasRequiredDetails) return false;

  if (company.profile_status === "needs_details") return true;

  return !hasRequiredDetails;
}

function buildReferenceMeta(option: NamedOption) {
  const details = [
    option.city,
    option.address,
    option.contact_name,
    option.contact_phone,
    option.email,
  ]
    .filter(Boolean)
    .join(" • ");

  if (details) return details;
  if (needsNamedDetails(option)) return "Needs details";
  return "";
}

function normalizeKey(value?: string | null) {
  if (!value) return "";

  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(
      /\b(inc|incorporated|ltd|limited|corp|corporation|company|co|llc|the)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function buildBaseForm(workOrder: WorkOrderRecord): BaseForm {
  return {
    bill_to_company_name: safeString(
      workOrder.bill_to_company_name || workOrder.customer_company_name,
    ),
    carrier_company_name: safeString(workOrder.carrier_company_name),
    customs_broker_company_name: safeString(
      workOrder.customs_broker_company_name,
    ),
    customer_reference: safeString(workOrder.customer_reference),
    pickup_date: safeString(workOrder.pickup_date),
    delivery_date: safeString(workOrder.delivery_date),
    currency: workOrder.dispatch_price_currency === "USD" ? "USD" : "CAD",
    billing_status: (workOrder.billing_status as BillingStatus) || "not_ready",
    quickbooks_invoice_number: safeString(workOrder.quickbooks_invoice_number),
    accounting_notes: safeString(workOrder.accounting_notes),
  };
}

function lineRecordToDraft(record: LineRecord): LineDraft {
  return {
    id: record.id,
    line_number: Number(record.line_number || 1),
    shipper: safeString(record.pickup_company_name),
    shipper_city: safeString(record.pickup_city),
    receiver: safeString(record.delivery_company_name),
    receiver_city: safeString(record.delivery_city),
    piece_count: safeString(record.quantity),
    piece_type: safeString(record.unit || "skid"),
    commodity: safeString(record.commodity),
    weight_lbs: safeString(record.weight_lbs),
    price: safeString(record.amount),
    notes: safeString(record.notes),
  };
}

function lineFromWorkOrder(workOrder: WorkOrderRecord): LineDraft {
  return {
    ...createBlankLine(1),
    shipper: safeString(workOrder.pickup_company_name),
    receiver: safeString(workOrder.delivery_company_name),
    piece_count: safeString(workOrder.number_of_skids),
    weight_lbs: safeString(workOrder.weight_lbs),
    price: safeString(workOrder.dispatch_base_price),
  };
}

function calculateTotals(lines: LineDraft[]) {
  return lines.reduce(
    (totals, line) => ({
      totalPieces: totals.totalPieces + numberOrZero(line.piece_count),
      totalWeight: totals.totalWeight + numberOrZero(line.weight_lbs),
      totalPrice: totals.totalPrice + numberOrZero(line.price),
    }),
    { totalPieces: 0, totalWeight: 0, totalPrice: 0 },
  );
}

function findCompany(companies: CompanyOption[], name: string) {
  return companies.find((company) => companyNameMatches(company, name)) || null;
}

function cleanText(value: string) {
  const cleaned = value.trim();
  return cleaned === "" ? null : cleaned;
}

function numberOrNull(value: string) {
  if (value.trim() === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function numberOrZero(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function safeString(value?: string | number | null) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function displayValue(value?: string | number | null, fallback = "Unknown") {
  if (value === null || value === undefined || String(value).trim() === "")
    return fallback;
  return String(value);
}

function formatNumber(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatMoney(value: number, currency: Currency) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
  }).format(value || 0);
}

function formatStatus(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
