'use client';

import { useEffect, useMemo, useState } from 'react';
import MainLayout from '@/components/MainLayout';
import Header from '@/components/Header';
import {
  ChevronDown,
  ChevronUp,
  Edit2,
  PackagePlus,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  BoardStopType,
  Company,
  InvoiceStatus,
  PriorityLevel,
  ServiceType,
  Shipment,
  WorkOrder,
  WorkOrderStatus,
} from '@/types';
import {
  createCompany,
  createShipment,
  getCompanies,
  getShipments,
} from '@/lib/database';

interface CompanySearchItem {
  id: string;
  label: string;
  description: string;
  keywords: string;
}

const emptyForm = {
  customer_company_name: '',
  bill_to_company_name: '',

  customer_reference: '',
  pickup_reference: '',
  delivery_reference: '',

  service_type: 'ltl' as ServiceType,
  priority_level: 'normal' as PriorityLevel,

  pickup_company_id: '',
  delivery_company_id: '',

  pickup_date: '',
  pickup_time: '',
  delivery_date: '',
  delivery_time: '',

  number_of_skids: '',
  weight_lbs: '',
  dimensions: '',

  board_name: '',
  board_note: '',
  board_stop_type: 'pickup' as BoardStopType,

  special_instructions: '',
  internal_notes: '',
  billing_notes: '',

  ready_to_invoice: false,
  invoice_status: 'not_ready' as InvoiceStatus,

  pod_received: false,

  status: 'open' as WorkOrderStatus,
};

const serviceTypeOptions: { value: ServiceType; label: string }[] = [
  { value: 'ltl', label: 'LTL' },
  { value: 'ftl', label: 'FTL' },
  { value: 'cross_dock', label: 'Cross Dock' },
  { value: 'warehouse', label: 'Warehouse' },
  { value: 'courier', label: 'Courier' },
  { value: 'other', label: 'Other' },
];

const priorityOptions: { value: PriorityLevel; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'hot', label: 'Hot' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'hold', label: 'Hold' },
];

const invoiceStatusOptions: { value: InvoiceStatus; label: string }[] = [
  { value: 'not_ready', label: 'Not Ready' },
  { value: 'ready', label: 'Ready' },
  { value: 'invoiced', label: 'Invoiced' },
  { value: 'paid', label: 'Paid' },
  { value: 'do_not_invoice', label: 'Do Not Invoice' },
];

const workOrderStatusOptions: { value: WorkOrderStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const stopTypeOptions: { value: BoardStopType; label: string }[] = [
  { value: 'pickup', label: 'Pickup' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'pickup_and_delivery', label: 'Pickup + Delivery' },
  { value: 'cross_dock', label: 'Cross Dock' },
  { value: 'warehouse', label: 'Warehouse' },
];

export default function WorkOrdersPage() {

  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [creatingPickupId, setCreatingPickupId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [showTimes, setShowTimes] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingNumber, setEditingNumber] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'active' | 'all' | WorkOrderStatus
  >('active');
  const [invoiceFilter, setInvoiceFilter] = useState<'all' | InvoiceStatus>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | PriorityLevel>('all');

  const [creatingCompanyField, setCreatingCompanyField] = useState<
    'customer' | 'bill_to' | 'pickup' | 'delivery' | null
  >(null);

  const [formData, setFormData] = useState(emptyForm);

  const openWorkOrderDetail = (workOrder: WorkOrder) => {
    const href = getWorkOrderDetailHref(workOrder);
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  useEffect(() => {
    loadPageData();
  }, []);

  useEffect(() => {
    const refreshWorkOrders = () => {
      loadPageData();
    };

    const handleStorageRefresh = (event: StorageEvent) => {
      if (event.key === 'dispatch_pro_work_orders_refresh') {
        loadPageData();
      }
    };

    window.addEventListener('focus', refreshWorkOrders);
    window.addEventListener('storage', handleStorageRefresh);

    return () => {
      window.removeEventListener('focus', refreshWorkOrders);
      window.removeEventListener('storage', handleStorageRefresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadPageData = async () => {
    try {
      setLoading(true);

      const [companiesData, shipmentsData] = await Promise.all([
        getCompanies(),
        getShipments(),
      ]);

      const { data, error } = await supabase
        .from('work_orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading work orders:', error);
        alert(`Could not load work orders.\n\n${error.message}`);
        return;
      }

      setCompanies(companiesData);
      setShipments(shipmentsData);
      setWorkOrders((data || []) as WorkOrder[]);
    } catch (error) {
      console.error('Error loading work orders:', error);
      alert('Could not load work orders.');
    } finally {
      setLoading(false);
    }
  };

  const companyItems: CompanySearchItem[] = useMemo(() => {
    return companies
      .map((company) => ({
        id: company.id,
        label: company.name,
        description: [
          company.address,
          company.city,
          company.postal_code,
          company.contact_name,
          company.contact_phone,
        ]
          .filter(Boolean)
          .join(' • '),
        keywords: [
          company.name,
          company.address,
          company.city,
          company.postal_code,
          company.contact_name,
          company.contact_phone,
          company.notes,
        ]
          .filter(Boolean)
          .join(' '),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [companies]);

  const selectedPickupCompany = companies.find(
    (company) => company.id === formData.pickup_company_id
  );

  const selectedDeliveryCompany = companies.find(
    (company) => company.id === formData.delivery_company_id
  );

  const filteredWorkOrders = workOrders.filter((workOrder) => {
    const lowerSearch = searchTerm.trim().toLowerCase();

    const matchesSearch =
      lowerSearch === '' ||
      [
        workOrder.work_order_number,
        workOrder.customer_company_name,
        workOrder.bill_to_company_name,
        workOrder.customer_reference,
        workOrder.pickup_reference,
        workOrder.delivery_reference,
        workOrder.service_type,
        workOrder.priority_level,
        workOrder.invoice_status,
        workOrder.status,
        workOrder.pickup_company_name,
        workOrder.delivery_company_name,
        workOrder.pickup_city,
        workOrder.delivery_city,
        workOrder.board_name,
        workOrder.board_note,
        workOrder.special_instructions,
        workOrder.internal_notes,
        workOrder.billing_notes,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(lowerSearch);

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' &&
        workOrder.status !== 'completed' &&
        workOrder.status !== 'cancelled') ||
      workOrder.status === statusFilter;

    const matchesInvoice =
      invoiceFilter === 'all' || workOrder.invoice_status === invoiceFilter;

    const matchesPriority =
      priorityFilter === 'all' || workOrder.priority_level === priorityFilter;

    return matchesSearch && matchesStatus && matchesInvoice && matchesPriority;
  });

  const getActivePickupForWorkOrder = (workOrderId: string) => {
    return (
      shipments.find(
        (shipment) =>
          shipment.work_order_id === workOrderId &&
          shipment.status !== 'delivered'
      ) || null
    );
  };

  const updateLinkedPickupFromWorkOrder = async (
    pickupId: string,
    updates: Partial<Shipment>
  ) => {
    try {
      const { data, error } = await supabase
        .from('shipments')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', pickupId)
        .select()
        .single();

      if (error) {
        console.error('Error updating linked pickup from work order:', error);
        return null;
      }

      return data as Shipment;
    } catch (error) {
      console.error('Error updating linked pickup from work order:', error);
      return null;
    }
  };

  const handleCreatePickupFromWorkOrder = async (workOrder: WorkOrder) => {
    const existingPickup = getActivePickupForWorkOrder(workOrder.id);

    if (existingPickup) {
      alert(
        `This work order already has an active pickup.\n\nPickup: ${
          existingPickup.board_name ||
          existingPickup.pickup_company_name ||
          existingPickup.delivery_company_name ||
          existingPickup.id
        }`
      );
      return;
    }

    try {
      setCreatingPickupId(workOrder.id);

      const boardNoteParts = [
        workOrder.board_note || null,
        workOrder.work_order_number,
        workOrder.customer_reference
          ? `Cust Ref: ${workOrder.customer_reference}`
          : null,
        workOrder.pickup_reference ? `PU Ref: ${workOrder.pickup_reference}` : null,
        workOrder.delivery_reference
          ? `DEL Ref: ${workOrder.delivery_reference}`
          : null,
      ].filter(Boolean);

      const createdPickup = await createShipment({
        work_order_id: workOrder.id,
        work_order_number: workOrder.work_order_number,

        customer_company_name: workOrder.customer_company_name || null,
        bill_to_company_name: workOrder.bill_to_company_name || null,
        customer_reference: workOrder.customer_reference || null,
        pickup_reference: workOrder.pickup_reference || null,
        delivery_reference: workOrder.delivery_reference || null,

        dispatch_task_type: 'pickup',
        dispatch_status: 'open',

        pickup_company_name: workOrder.pickup_company_name || null,
        pickup_address: workOrder.pickup_address || null,
        pickup_city: workOrder.pickup_city || null,
        pickup_postal_code: workOrder.pickup_postal_code || null,
        pickup_date: workOrder.pickup_date || null,
        pickup_time: workOrder.pickup_time || null,
        pickup_contact_name: workOrder.pickup_contact_name || null,
        pickup_contact_phone: workOrder.pickup_contact_phone || null,

        delivery_company_name: workOrder.delivery_company_name || null,
        delivery_address: workOrder.delivery_address || null,
        delivery_city: workOrder.delivery_city || null,
        delivery_postal_code: workOrder.delivery_postal_code || null,
        delivery_date: workOrder.delivery_date || null,
        delivery_time: workOrder.delivery_time || null,
        delivery_contact_name: workOrder.delivery_contact_name || null,
        delivery_contact_phone: workOrder.delivery_contact_phone || null,

        number_of_skids: workOrder.number_of_skids || null,
        weight_lbs: workOrder.weight_lbs || null,
        weight_kg: null,
        dimensions: workOrder.dimensions || null,

        board_name:
          workOrder.board_name ||
          workOrder.pickup_company_name ||
          workOrder.delivery_company_name ||
          workOrder.customer_company_name ||
          workOrder.work_order_number ||
          'Pickup from WO',

        board_stop_type: (workOrder.board_stop_type as BoardStopType) || 'pickup',
        board_note: boardNoteParts.join(' • ') || null,
        board_sort_order: 999,

        notes: workOrder.special_instructions || workOrder.internal_notes || null,

        customs_docs_received: false,
        stays_in_canada: false,

        route_completed: false,
        route_completed_at: null,
        route_completed_by: null,

        ready_to_invoice: workOrder.ready_to_invoice || false,
        invoice_status: workOrder.invoice_status || 'not_ready',
        pod_received: workOrder.pod_received || false,
        pod_received_at: workOrder.pod_received_at || null,

        service_type: workOrder.service_type || 'ltl',
        priority_level: workOrder.priority_level || 'normal',
        internal_notes: workOrder.internal_notes || null,

        status: 'pending',
        assigned_truck_id: null,
        assigned_at: null,
      } as Omit<Shipment, 'id' | 'created_at' | 'updated_at'>);

      if (!createdPickup) {
        alert('Could not create pickup from work order.');
        return;
      }

      await loadPageData();

      alert(
        `Pickup created from ${workOrder.work_order_number}.\n\nIt is now on the pickup board.`
      );
    } catch (error) {
      console.error('Error creating pickup from work order:', error);
      alert('Could not create pickup from work order.');
    } finally {
      setCreatingPickupId(null);
    }
  };

  const handleCreateCompanyFromName = async (
    companyName: string,
    field: 'customer' | 'bill_to' | 'pickup' | 'delivery'
  ) => {
    const cleanedName = companyName.trim();

    if (!cleanedName) {
      alert('Type a company name first.');
      return;
    }

    const existingCompany = companies.find(
      (company) => company.name.trim().toLowerCase() === cleanedName.toLowerCase()
    );

    if (existingCompany) {
      applyCompanyToField(existingCompany, field);
      return;
    }

    try {
      setCreatingCompanyField(field);

      const createdCompany = await createCompany({
        name: cleanedName,
        address: null,
        city: null,
        postal_code: null,
        contact_name: null,
        contact_phone: null,
        notes: null,
        is_shipper: field === 'pickup',
      } as Omit<Company, 'id' | 'created_at' | 'updated_at'>);

      if (!createdCompany) {
        alert('Could not create company.');
        return;
      }

      setCompanies((currentCompanies) =>
        [...currentCompanies, createdCompany].sort((a, b) =>
          a.name.localeCompare(b.name)
        )
      );

      applyCompanyToField(createdCompany, field);
    } catch (error) {
      console.error('Error creating company:', error);
      alert('Could not create company.');
    } finally {
      setCreatingCompanyField(null);
    }
  };

  const applyCompanyToField = (
    company: Company,
    field: 'customer' | 'bill_to' | 'pickup' | 'delivery'
  ) => {
    if (field === 'customer') {
      setFormData((current) => ({
        ...current,
        customer_company_name: company.name,
      }));
      return;
    }

    if (field === 'bill_to') {
      setFormData((current) => ({
        ...current,
        bill_to_company_name: company.name,
      }));
      return;
    }

    if (field === 'pickup') {
      setFormData((current) => ({
        ...current,
        pickup_company_id: company.id,
      }));
      return;
    }

    setFormData((current) => ({
      ...current,
      delivery_company_id: company.id,
    }));
  };

  const blankToNull = (value: string) => {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  };

  const companyValue = (value?: string | null) => {
    if (!value || value.trim() === '') return null;
    return value.trim();
  };

  const numberValue = (value: string) => {
    if (value.trim() === '') return null;

    const parsed = Number(value);

    if (Number.isNaN(parsed)) {
      return null;
    }

    return parsed;
  };

  const buildPayload = () => {
    return {
      customer_company_name: blankToNull(formData.customer_company_name),
      bill_to_company_name: blankToNull(formData.bill_to_company_name),

      customer_reference: blankToNull(formData.customer_reference),
      pickup_reference: blankToNull(formData.pickup_reference),
      delivery_reference: blankToNull(formData.delivery_reference),

      service_type: formData.service_type,
      priority_level: formData.priority_level,

      pickup_company_name: selectedPickupCompany?.name || null,
      pickup_address: companyValue(selectedPickupCompany?.address),
      pickup_city: companyValue(selectedPickupCompany?.city),
      pickup_postal_code: companyValue(selectedPickupCompany?.postal_code),
      pickup_contact_name: companyValue(selectedPickupCompany?.contact_name),
      pickup_contact_phone: companyValue(selectedPickupCompany?.contact_phone),
      pickup_date: blankToNull(formData.pickup_date),
      pickup_time: blankToNull(formData.pickup_time),

      delivery_company_name: selectedDeliveryCompany?.name || null,
      delivery_address: companyValue(selectedDeliveryCompany?.address),
      delivery_city: companyValue(selectedDeliveryCompany?.city),
      delivery_postal_code: companyValue(selectedDeliveryCompany?.postal_code),
      delivery_contact_name: companyValue(selectedDeliveryCompany?.contact_name),
      delivery_contact_phone: companyValue(selectedDeliveryCompany?.contact_phone),
      delivery_date: blankToNull(formData.delivery_date),
      delivery_time: blankToNull(formData.delivery_time),

      number_of_skids: numberValue(formData.number_of_skids),
      weight_lbs: numberValue(formData.weight_lbs),
      dimensions: blankToNull(formData.dimensions),

      board_name: blankToNull(formData.board_name),
      board_note: blankToNull(formData.board_note),
      board_stop_type: formData.board_stop_type,

      special_instructions: blankToNull(formData.special_instructions),
      internal_notes: blankToNull(formData.internal_notes),
      billing_notes: blankToNull(formData.billing_notes),

      ready_to_invoice: formData.ready_to_invoice,
      invoice_status: formData.invoice_status,

      pod_received: formData.pod_received,
      pod_received_at: formData.pod_received ? new Date().toISOString() : null,

      status: formData.status,

      updated_at: new Date().toISOString(),
    };
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!formData.pickup_date || !formData.delivery_date) {
      setShowTimes(true);
      alert('Pickup Date and Estimated Delivery Date are required before saving a work order.');
      return;
    }

    if (formData.delivery_date < formData.pickup_date) {
      const shouldContinue = confirm(
        'The estimated delivery date is before the pickup date. Do you still want to save this work order?'
      );

      if (!shouldContinue) {
        setShowTimes(true);
        return;
      }
    }

    try {
      setSaving(true);

      const payload = buildPayload();

      if (editingId) {
        const { error } = await supabase
          .from('work_orders')
          .update(payload)
          .eq('id', editingId);

        if (error) {
          console.error('Error updating work order:', error);
          alert(`Could not update work order.\n\n${error.message}`);
          return;
        }

        const activePickup = getActivePickupForWorkOrder(editingId);

        if (activePickup) {
          const boardNoteParts = [
            payload.board_note || null,
            editingNumber || null,
            payload.customer_reference
              ? `Cust Ref: ${payload.customer_reference}`
              : null,
            payload.pickup_reference ? `PU Ref: ${payload.pickup_reference}` : null,
            payload.delivery_reference
              ? `DEL Ref: ${payload.delivery_reference}`
              : null,
          ].filter(Boolean);

          const updatedPickup = await updateLinkedPickupFromWorkOrder(
            activePickup.id,
            {
              work_order_number: editingNumber,

              customer_company_name: payload.customer_company_name,
              bill_to_company_name: payload.bill_to_company_name,
              customer_reference: payload.customer_reference,
              pickup_reference: payload.pickup_reference,
              delivery_reference: payload.delivery_reference,

              service_type: payload.service_type,
              priority_level: payload.priority_level,

              pickup_company_name: payload.pickup_company_name,
              pickup_address: payload.pickup_address,
              pickup_city: payload.pickup_city,
              pickup_postal_code: payload.pickup_postal_code,
              pickup_contact_name: payload.pickup_contact_name,
              pickup_contact_phone: payload.pickup_contact_phone,
              pickup_date: payload.pickup_date,
              pickup_time: payload.pickup_time,

              delivery_company_name: payload.delivery_company_name,
              delivery_address: payload.delivery_address,
              delivery_city: payload.delivery_city,
              delivery_postal_code: payload.delivery_postal_code,
              delivery_contact_name: payload.delivery_contact_name,
              delivery_contact_phone: payload.delivery_contact_phone,
              delivery_date: payload.delivery_date,
              delivery_time: payload.delivery_time,

              number_of_skids: payload.number_of_skids,
              weight_lbs: payload.weight_lbs,
              dimensions: payload.dimensions,

              board_name:
                payload.board_name ||
                payload.pickup_company_name ||
                payload.delivery_company_name ||
                payload.customer_company_name ||
                editingNumber ||
                null,

              board_note: boardNoteParts.join(' • ') || null,
              board_stop_type: payload.board_stop_type,

              notes: payload.special_instructions || payload.internal_notes || null,
              internal_notes: payload.internal_notes,

              ready_to_invoice: payload.ready_to_invoice,
              invoice_status: payload.invoice_status,
              pod_received: payload.pod_received,
              pod_received_at: payload.pod_received_at,
            }
          );

          if (!updatedPickup) {
            alert(
              'Work order saved, but the linked pickup on the board could not be updated.'
            );
          }
        }
      } else {
        const { error } = await supabase
          .from('work_orders')
          .insert([
            {
              ...payload,
              work_order_number: '',
            },
          ]);

        if (error) {
          console.error('Error creating work order:', error);
          alert(`Could not create work order.\n\n${error.message}`);
          return;
        }
      }

      resetForm();
      await loadPageData();
    } catch (error) {
      console.error('Error saving work order:', error);
      alert('Could not save work order.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (workOrder: WorkOrder) => {
    const pickupCompany = companies.find(
      (company) =>
        company.name.toLowerCase() ===
        (workOrder.pickup_company_name || '').toLowerCase()
    );

    const deliveryCompany = companies.find(
      (company) =>
        company.name.toLowerCase() ===
        (workOrder.delivery_company_name || '').toLowerCase()
    );

    const hasTimes =
      Boolean(workOrder.pickup_date) ||
      Boolean(workOrder.pickup_time) ||
      Boolean(workOrder.delivery_date) ||
      Boolean(workOrder.delivery_time);

    setFormData({
      customer_company_name: workOrder.customer_company_name || '',
      bill_to_company_name: workOrder.bill_to_company_name || '',

      customer_reference: workOrder.customer_reference || '',
      pickup_reference: workOrder.pickup_reference || '',
      delivery_reference: workOrder.delivery_reference || '',

      service_type: (workOrder.service_type as ServiceType) || 'ltl',
      priority_level: (workOrder.priority_level as PriorityLevel) || 'normal',

      pickup_company_id: pickupCompany?.id || '',
      delivery_company_id: deliveryCompany?.id || '',

      pickup_date: workOrder.pickup_date || '',
      pickup_time: workOrder.pickup_time || '',
      delivery_date: workOrder.delivery_date || '',
      delivery_time: workOrder.delivery_time || '',

      number_of_skids:
        workOrder.number_of_skids === null || workOrder.number_of_skids === undefined
          ? ''
          : String(workOrder.number_of_skids),

      weight_lbs:
        workOrder.weight_lbs === null || workOrder.weight_lbs === undefined
          ? ''
          : String(workOrder.weight_lbs),

      dimensions: workOrder.dimensions || '',

      board_name: workOrder.board_name || '',
      board_note: workOrder.board_note || '',
      board_stop_type: (workOrder.board_stop_type as BoardStopType) || 'pickup',

      special_instructions: workOrder.special_instructions || '',
      internal_notes: workOrder.internal_notes || '',
      billing_notes: workOrder.billing_notes || '',

      ready_to_invoice: Boolean(workOrder.ready_to_invoice),
      invoice_status: (workOrder.invoice_status as InvoiceStatus) || 'not_ready',

      pod_received: Boolean(workOrder.pod_received),

      status: (workOrder.status as WorkOrderStatus) || 'open',
    });

    setShowTimes(true);
    setEditingId(workOrder.id);
    setEditingNumber(workOrder.work_order_number);
    setShowForm(true);
  };

  const handleDelete = async (workOrder: WorkOrder) => {
    if (!confirm(`Delete ${workOrder.work_order_number}? This cannot be undone.`)) {
      return;
    }

    try {
      setDeletingId(workOrder.id);

      const { error } = await supabase
        .from('work_orders')
        .delete()
        .eq('id', workOrder.id);

      if (error) {
        console.error('Error deleting work order:', error);
        alert(`Could not delete work order.\n\n${error.message}`);
        return;
      }

      await loadPageData();
    } catch (error) {
      console.error('Error deleting work order:', error);
      alert('Could not delete work order.');
    } finally {
      setDeletingId(null);
    }
  };

  const resetForm = () => {
    setFormData(emptyForm);
    setShowTimes(true);
    setEditingId(null);
    setEditingNumber(null);
    setShowForm(false);
  };

  const clearTimes = () => {
    setFormData({
      ...formData,
      pickup_time: '',
      delivery_time: '',
    });
    setShowTimes(true);
  };

  return (
    <MainLayout>
      <Header
        title="Work Orders"
        subtitle="Condensed work order list. Click any work order row to open the full detailed file."
      />

      <div className="page-actions">
        <div className="page-actions-left">
          <input
            type="text"
            placeholder="Search WO #, customer ref #, customer, pickup, delivery, notes..."
            className="input-field max-w-xl"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>

        <a
          href="/wo/new"
          target="_blank"
          rel="noreferrer"
          className="btn-primary flex items-center justify-center gap-2"
        >
          <Plus className="h-5 w-5" />
          Create Work Order
        </a>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-soft dark:border-dark-border dark:bg-dark-card dark:shadow-soft-dark lg:grid-cols-3">
        <FilterButtonGroup
          label="Status"
          value={statusFilter}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'all', label: 'All' },
            ...workOrderStatusOptions,
          ]}
          onChange={(value) => setStatusFilter(value as 'active' | 'all' | WorkOrderStatus)}
        />

        <FilterButtonGroup
          label="Priority"
          value={priorityFilter}
          options={[
            { value: 'all', label: 'All' },
            ...priorityOptions,
          ]}
          onChange={(value) => setPriorityFilter(value as 'all' | PriorityLevel)}
        />

        <FilterButtonGroup
          label="Invoice"
          value={invoiceFilter}
          options={[
            { value: 'all', label: 'All' },
            ...invoiceStatusOptions,
          ]}
          onChange={(value) => setInvoiceFilter(value as 'all' | InvoiceStatus)}
        />
      </div>

      {false && showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm dark:bg-black/60">
          <div className="custom-board-scrollbar max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-dark-border dark:bg-dark-card sm:p-8">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-slate-950 dark:text-white">
                  {editingId ? 'Work Order Information' : 'Create Work Order'}
                </h2>

                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  {editingId
                    ? editingNumber || 'Existing work order'
                    : 'A WO number will be generated automatically after saving.'}
                </p>
              </div>

              <button
                type="button"
                onClick={resetForm}
                className="text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-dark-border dark:bg-slate-900/50">
                <h3 className="mb-4 text-lg font-bold text-slate-950 dark:text-white">
                  Customer / Billing / References
                </h3>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <CreatableNameField
                    label="Customer"
                    placeholder="Type customer..."
                    items={companyItems}
                    value={formData.customer_company_name}
                    onChange={(value) =>
                      setFormData({ ...formData, customer_company_name: value })
                    }
                    onCreate={(companyName) =>
                      handleCreateCompanyFromName(companyName, 'customer')
                    }
                    creating={creatingCompanyField === 'customer'}
                    createLabel="Create new customer"
                  />

                  <CreatableNameField
                    label="Bill To"
                    placeholder="Type bill-to company..."
                    items={companyItems}
                    value={formData.bill_to_company_name}
                    onChange={(value) =>
                      setFormData({ ...formData, bill_to_company_name: value })
                    }
                    onCreate={(companyName) =>
                      handleCreateCompanyFromName(companyName, 'bill_to')
                    }
                    creating={creatingCompanyField === 'bill_to'}
                    createLabel="Create new bill-to"
                  />

                  <TextField
                    label="Customer Ref #"
                    placeholder="Customer PO, order number, load number"
                    value={formData.customer_reference}
                    onChange={(value) =>
                      setFormData({ ...formData, customer_reference: value })
                    }
                  />

                  <TextField
                    label="Pickup Ref #"
                    placeholder="Pickup number, confirmation, appointment"
                    value={formData.pickup_reference}
                    onChange={(value) =>
                      setFormData({ ...formData, pickup_reference: value })
                    }
                  />

                  <TextField
                    label="Delivery Ref #"
                    placeholder="Delivery number, receiver ref, appointment"
                    value={formData.delivery_reference}
                    onChange={(value) =>
                      setFormData({ ...formData, delivery_reference: value })
                    }
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-dark-border dark:bg-slate-900/50">
                <h3 className="mb-4 text-lg font-bold text-slate-950 dark:text-white">
                  Pickup / Delivery Information
                </h3>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <CreatableCompanyField
                      label="Pickup From"
                      placeholder="Type pickup company..."
                      items={companyItems}
                      selectedId={formData.pickup_company_id}
                      onSelect={(item) =>
                        setFormData({ ...formData, pickup_company_id: item.id })
                      }
                      onClear={() =>
                        setFormData({ ...formData, pickup_company_id: '' })
                      }
                      onCreate={(companyName) =>
                        handleCreateCompanyFromName(companyName, 'pickup')
                      }
                      creating={creatingCompanyField === 'pickup'}
                      createLabel="Create new pickup company"
                    />

                    {selectedPickupCompany && (
                      <CompanyPreview company={selectedPickupCompany} />
                    )}
                  </div>

                  <div>
                    <CreatableCompanyField
                      label="Deliver To / Going To"
                      placeholder="Type receiver or destination..."
                      items={companyItems}
                      selectedId={formData.delivery_company_id}
                      onSelect={(item) =>
                        setFormData({ ...formData, delivery_company_id: item.id })
                      }
                      onClear={() =>
                        setFormData({ ...formData, delivery_company_id: '' })
                      }
                      onCreate={(companyName) =>
                        handleCreateCompanyFromName(companyName, 'delivery')
                      }
                      creating={creatingCompanyField === 'delivery'}
                      createLabel="Create new receiver"
                    />

                    {selectedDeliveryCompany && (
                      <CompanyPreview company={selectedDeliveryCompany} />
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-dark-border dark:bg-slate-900/50">
                <h3 className="mb-4 text-lg font-bold text-slate-950 dark:text-white">
                  Freight / Board Information
                </h3>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <NumberField
                    label="Skids"
                    placeholder="Unknown"
                    value={formData.number_of_skids}
                    onChange={(value) =>
                      setFormData({ ...formData, number_of_skids: value })
                    }
                    min="0"
                    max="12"
                  />

                  <NumberField
                    label="Weight LBS"
                    placeholder="Unknown"
                    value={formData.weight_lbs}
                    onChange={(value) =>
                      setFormData({ ...formData, weight_lbs: value })
                    }
                    min="0"
                    max="15000"
                  />

                  <TextField
                    label="Dimensions"
                    placeholder="Unknown"
                    value={formData.dimensions}
                    onChange={(value) =>
                      setFormData({ ...formData, dimensions: value })
                    }
                  />

                  <TextField
                    label="Board Name"
                    placeholder="Example: TDG USA PU, Warehouse, TDG CAN"
                    value={formData.board_name}
                    onChange={(value) =>
                      setFormData({ ...formData, board_name: value })
                    }
                  />

                  <div className="md:col-span-2">
                    <ButtonGroup
                      label="Board Task Type"
                      value={formData.board_stop_type}
                      options={stopTypeOptions}
                      onChange={(value) =>
                        setFormData({
                          ...formData,
                          board_stop_type: value as BoardStopType,
                        })
                      }
                    />
                  </div>

                  <div className="md:col-span-2">
                    <TextField
                      label="Board Note"
                      placeholder="Example: No Bury, Call with ETA, Leave on tail"
                      value={formData.board_note}
                      onChange={(value) =>
                        setFormData({ ...formData, board_note: value })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-dark-border dark:bg-slate-900/50">
                <button
                  type="button"
                  onClick={() => setShowTimes(!showTimes)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <div>
                    <h3 className="text-lg font-bold text-slate-950 dark:text-white">
                      Pickup / Estimated Delivery Dates
                    </h3>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                      Pickup date and estimated delivery date are required. Times are optional.
                    </p>
                  </div>

                  {showTimes ? (
                    <ChevronUp className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                  )}
                </button>

                {showTimes && (
                  <div className="mt-5 border-t border-slate-200 dark:border-dark-border pt-5">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <DateField
                        label="Pickup Date"
                        value={formData.pickup_date}
                        required
                        onChange={(value) =>
                          setFormData({ ...formData, pickup_date: value })
                        }
                      />

                      <TimeField
                        label="Pickup Time"
                        value={formData.pickup_time}
                        onChange={(value) =>
                          setFormData({ ...formData, pickup_time: value })
                        }
                      />

                      <DateField
                        label="Estimated Delivery Date"
                        value={formData.delivery_date}
                        required
                        onChange={(value) =>
                          setFormData({ ...formData, delivery_date: value })
                        }
                      />

                      <TimeField
                        label="Delivery Time"
                        value={formData.delivery_time}
                        onChange={(value) =>
                          setFormData({ ...formData, delivery_time: value })
                        }
                      />
                    </div>

                    <button
                      type="button"
                      onClick={clearTimes}
                      className="mt-4 text-sm font-semibold text-red-300 hover:text-red-200"
                    >
                      Clear times only
                    </button>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-dark-border dark:bg-slate-900/50">
                <h3 className="mb-4 text-lg font-bold text-slate-950 dark:text-white">
                  Status / Billing
                </h3>

                <ButtonGroup
                  label="Work Order Status"
                  value={formData.status}
                  options={workOrderStatusOptions}
                  onChange={(value) =>
                    setFormData({ ...formData, status: value as WorkOrderStatus })
                  }
                />

                <div className="mt-5">
                  <ButtonGroup
                    label="Service Type"
                    value={formData.service_type}
                    options={serviceTypeOptions}
                    onChange={(value) =>
                      setFormData({ ...formData, service_type: value as ServiceType })
                    }
                  />
                </div>

                <div className="mt-5">
                  <ButtonGroup
                    label="Priority"
                    value={formData.priority_level}
                    options={priorityOptions}
                    onChange={(value) =>
                      setFormData({ ...formData, priority_level: value as PriorityLevel })
                    }
                  />
                </div>

                <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() =>
                      setFormData({
                        ...formData,
                        pod_received: !formData.pod_received,
                      })
                    }
                    className={`rounded-lg border px-4 py-3 text-left font-semibold ${
                      formData.pod_received
                        ? 'border-green-300 bg-green-50 text-green-800 dark:border-green-700 dark:bg-green-950 dark:text-green-200'
                        : 'border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                    }`}
                  >
                    POD: {formData.pod_received ? 'Received' : 'Not Received'}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setFormData({
                        ...formData,
                        ready_to_invoice: !formData.ready_to_invoice,
                        invoice_status: !formData.ready_to_invoice
                          ? 'ready'
                          : 'not_ready',
                      })
                    }
                    className={`rounded-lg border px-4 py-3 text-left font-semibold ${
                      formData.ready_to_invoice
                        ? 'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-200'
                        : 'border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                    }`}
                  >
                    Invoice: {formData.ready_to_invoice ? 'Ready' : 'Not Ready'}
                  </button>
                </div>

                <div className="mt-5">
                  <ButtonGroup
                    label="Invoice Status"
                    value={formData.invoice_status}
                    options={invoiceStatusOptions}
                    onChange={(value) =>
                      setFormData({
                        ...formData,
                        invoice_status: value as InvoiceStatus,
                        ready_to_invoice: value === 'ready',
                      })
                    }
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-dark-border dark:bg-slate-900/50">
                <h3 className="mb-4 text-lg font-bold text-slate-950 dark:text-white">
                  Notes / Special Information
                </h3>

                <div className="grid grid-cols-1 gap-4">
                  <TextAreaField
                    label="Special Instructions"
                    placeholder="Anything important for dispatch, driver, customer, appointment details, tailgate, call ahead, no bury, etc."
                    value={formData.special_instructions}
                    onChange={(value) =>
                      setFormData({ ...formData, special_instructions: value })
                    }
                  />

                  <TextAreaField
                    label="Internal Notes"
                    placeholder="Internal office notes"
                    value={formData.internal_notes}
                    onChange={(value) =>
                      setFormData({ ...formData, internal_notes: value })
                    }
                  />

                  <TextAreaField
                    label="Billing Notes"
                    placeholder="Rates, extras, waiting time, charges, invoice notes, etc."
                    value={formData.billing_notes}
                    onChange={(value) =>
                      setFormData({ ...formData, billing_notes: value })
                    }
                  />
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={resetForm}
                  className="btn-secondary"
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="btn-primary"
                  disabled={saving}
                >
                  {saving
                    ? 'Saving...'
                    : editingId
                      ? 'Save Work Order'
                      : 'Create Work Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="card">
          <p className="text-slate-600 dark:text-slate-400">Loading work orders...</p>
        </div>
      ) : filteredWorkOrders.length === 0 ? (
        <div className="card text-center">
          <p className="text-slate-600 dark:text-slate-400">No work orders found.</p>
        </div>
      ) : (
        <div className="custom-board-scrollbar overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-soft dark:border-dark-border dark:bg-dark-card dark:shadow-soft-dark">
          <table className="status-table">
            <thead>
              <tr>
                <th>WO #</th>
                <th>Customer / Refs</th>
                <th>Pickup / Delivery</th>
                <th>Freight</th>
                <th>Status</th>
                <th>Pickup</th>
                <th>Notes</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredWorkOrders.map((workOrder) => {
                const activePickup = getActivePickupForWorkOrder(workOrder.id);

                return (
                  <tr
                    key={workOrder.id}
                    onClick={() => openWorkOrderDetail(workOrder)}
                    className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    title="Click to open full work order details"
                  >
                    <td>
                      <p className="font-bold text-blue-700 underline-offset-2 hover:underline dark:text-blue-300">
                        {workOrder.work_order_number}
                      </p>

                      <p className="text-xs capitalize text-slate-600 dark:text-slate-400">
                        {(workOrder.service_type || 'ltl').replaceAll('_', ' ')}
                      </p>

                      {workOrder.priority_level && workOrder.priority_level !== 'normal' && (
                        <span
                          className={`mt-1 inline-block rounded px-2 py-1 text-xs font-bold ${
                            workOrder.priority_level === 'hot' ||
                            workOrder.priority_level === 'urgent'
                              ? 'bg-red-800 text-red-100'
                              : 'bg-yellow-800 text-yellow-100'
                          }`}
                        >
                          {String(workOrder.priority_level).toUpperCase()}
                        </span>
                      )}
                    </td>

                    <td>
                      <p className="font-semibold text-slate-950 dark:text-white">
                        {workOrder.customer_company_name || 'No customer'}
                      </p>

                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        Bill To: {workOrder.bill_to_company_name || '—'}
                      </p>

                      {workOrder.customer_reference && (
                        <p className="text-xs text-blue-300">
                          Cust Ref: {workOrder.customer_reference}
                        </p>
                      )}

                      {workOrder.pickup_reference && (
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                          PU Ref: {workOrder.pickup_reference}
                        </p>
                      )}

                      {workOrder.delivery_reference && (
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                          DEL Ref: {workOrder.delivery_reference}
                        </p>
                      )}
                    </td>

                    <td>
                      <p className="font-semibold text-slate-950 dark:text-white">
                        PU: {workOrder.pickup_company_name || '—'}
                      </p>

                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        {displayLocation(workOrder.pickup_address, workOrder.pickup_city)}
                      </p>

                      <p className="mt-2 font-semibold text-slate-950 dark:text-white">
                        DEL: {workOrder.delivery_company_name || '—'}
                      </p>

                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        {displayLocation(workOrder.delivery_address, workOrder.delivery_city)}
                      </p>
                    </td>

                    <td>
                      <p className="font-semibold text-slate-950 dark:text-white">
                        {workOrder.number_of_skids ?? 'Unknown'} skids
                      </p>

                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        {workOrder.weight_lbs
                          ? `${Number(workOrder.weight_lbs).toLocaleString()} lbs`
                          : 'Weight unknown'}
                      </p>

                      {workOrder.dimensions && (
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                          {workOrder.dimensions}
                        </p>
                      )}
                    </td>

                    <td>
                      <div className="flex flex-wrap gap-1">
                        <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold capitalize text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                          {(workOrder.status || 'open').replaceAll('_', ' ')}
                        </span>

                        {workOrder.pod_received && (
                          <span className="rounded bg-green-700 px-2 py-1 text-xs font-semibold text-white">
                            POD
                          </span>
                        )}

                        {workOrder.ready_to_invoice && (
                          <span className="rounded bg-blue-700 px-2 py-1 text-xs font-semibold text-white">
                            READY
                          </span>
                        )}

                        <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold capitalize text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                          {(workOrder.invoice_status || 'not_ready').replaceAll('_', ' ')}
                        </span>
                      </div>
                    </td>

                    <td>
                      {activePickup ? (
                        <div>
                          <span className="rounded bg-green-700 px-2 py-1 text-xs font-semibold text-white dark:bg-green-800 dark:text-green-100">
                            Pickup Created
                          </span>

                          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                            {activePickup.assigned_truck_id
                              ? 'Assigned to truck'
                              : 'On pickup board'}
                          </p>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleCreatePickupFromWorkOrder(workOrder);
                          }}
                          disabled={creatingPickupId === workOrder.id}
                          className="rounded bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
                          title="Create pickup from this work order"
                        >
                          <PackagePlus className="mr-1 inline h-3.5 w-3.5" />
                          {creatingPickupId === workOrder.id
                            ? 'Creating...'
                            : 'Create Pickup'}
                        </button>
                      )}
                    </td>

                    <td>
                      <p className="max-w-xs text-xs text-yellow-300">
                        {workOrder.special_instructions || '—'}
                      </p>

                      {workOrder.internal_notes && (
                        <p className="mt-1 max-w-xs text-xs text-purple-300">
                          Internal: {workOrder.internal_notes}
                        </p>
                      )}

                      {workOrder.billing_notes && (
                        <p className="mt-1 max-w-xs text-xs text-blue-300">
                          Billing: {workOrder.billing_notes}
                        </p>
                      )}
                    </td>

                    <td>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openWorkOrderDetail(workOrder);
                          }}
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-dark-border dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                          title="Open full work order details"
                        >
                          Open
                        </button>

                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleEdit(workOrder);
                          }}
                          className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                          title="Edit work order"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>

                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDelete(workOrder);
                          }}
                          disabled={deletingId === workOrder.id}
                          className="text-red-400 hover:text-red-300 disabled:opacity-50"
                          title="Delete work order"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </MainLayout>
  );
}


function getWorkOrderDetailHref(workOrder: WorkOrder) {
  const numberOrId = workOrder.work_order_number || workOrder.id;
  return `/wo/${encodeURIComponent(numberOrId)}`;
}

function FilterButtonGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </p>

      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
              value === option.value
                ? 'border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-100'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-dark-border dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ButtonGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-3 block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </label>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
              value === option.value
                ? 'border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-100'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-dark-border dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TextField({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </label>

      <input
        type="text"
        placeholder={placeholder}
        className="input-field"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function NumberField({
  label,
  placeholder,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </label>

      <input
        type="number"
        className="input-field"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        min={min}
        max={max}
        step="1"
        placeholder={placeholder}
      />
    </div>
  );
}

function openNativeDatePicker(input: HTMLInputElement) {
  try {
    if (typeof input.showPicker === 'function') {
      input.showPicker();
    }
  } catch {
    // Some browsers only allow showPicker during a direct user click/focus event.
  }
}

function DateField({
  label,
  value,
  onChange,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
        {required && <span className="ml-1 text-red-600 dark:text-red-400">*</span>}
      </label>

      <input
        type="date"
        className="input-field cursor-pointer"
        value={value}
        onClick={(event) => openNativeDatePicker(event.currentTarget)}
        onFocus={(event) => openNativeDatePicker(event.currentTarget)}
        onChange={(event) => onChange(event.target.value)}
        required={required}
      />
    </div>
  );
}

function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </label>

      <input
        type="time"
        className="input-field"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function TextAreaField({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </label>

      <textarea
        placeholder={placeholder}
        className="input-field"
        rows={3}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function CompanyPreview({ company }: { company: Company }) {
  return (
    <div className="mt-3 rounded-lg border border-dark-border bg-slate-800 p-3 text-xs text-slate-600 dark:text-slate-400">
      <p className="font-semibold text-slate-200">{company.name}</p>

      <p className="mt-1">
        {company.address || 'No address saved'}
        {company.city ? `, ${company.city}` : ''}
        {company.postal_code ? ` ${company.postal_code}` : ''}
      </p>

      <p className="mt-1">
        Contact: {company.contact_name || 'No contact saved'}
        {company.contact_phone ? ` — ${company.contact_phone}` : ''}
      </p>
    </div>
  );
}

function CreatableCompanyField({
  label,
  placeholder,
  items,
  selectedId,
  onSelect,
  onClear,
  onCreate,
  creating,
  createLabel,
}: {
  label: string;
  placeholder: string;
  items: CompanySearchItem[];
  selectedId: string;
  onSelect: (item: CompanySearchItem) => void;
  onClear: () => void;
  onCreate: (companyName: string) => void;
  creating: boolean;
  createLabel: string;
}) {
  const selectedItem = items.find((item) => item.id === selectedId) || null;
  const [query, setQuery] = useState(selectedItem?.label || '');
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    setQuery(selectedItem?.label || '');
  }, [selectedItem?.label]);

  const cleanedQuery = query.trim().toLowerCase();

  const matchingItems = cleanedQuery
    ? items
        .filter((item) => {
          const searchableText = [
            item.label,
            item.description,
            item.keywords,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

          return searchableText.includes(cleanedQuery);
        })
        .slice(0, 8)
    : items.slice(0, 8);

  const exactMatch = items.some(
    (item) => item.label.trim().toLowerCase() === cleanedQuery
  );

  const showMenu = focused && (matchingItems.length > 0 || query.trim() !== '');

  return (
    <div className="relative">
      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </label>

      <div className="flex gap-2">
        <input
          type="text"
          className="input-field"
          placeholder={placeholder}
          value={query}
          onFocus={() => setFocused(true)}
          onChange={(event) => {
            setQuery(event.target.value);

            if (selectedId) {
              onClear();
            }
          }}
        />

        {(selectedId || query.trim()) && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              onClear();
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-dark-border dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Clear
          </button>
        )}
      </div>

      {showMenu && (
        <div className="custom-board-scrollbar absolute z-50 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-dark-border dark:bg-slate-950">
          {matchingItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onSelect(item);
                setQuery(item.label);
                setFocused(false);
              }}
              className="block w-full border-b border-slate-200 px-4 py-3 text-left hover:bg-slate-50 dark:border-dark-border dark:hover:bg-slate-800"
            >
              <p className="font-semibold text-slate-950 dark:text-white">{item.label}</p>
              {item.description && (
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{item.description}</p>
              )}
            </button>
          ))}

          {!exactMatch && query.trim() !== '' && (
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onCreate(query.trim());
                setFocused(false);
              }}
              disabled={creating}
              className="block w-full px-4 py-3 text-left font-semibold text-green-300 hover:bg-green-950 disabled:opacity-60"
            >
              {creating ? 'Creating...' : `${createLabel}: ${query.trim()}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CreatableNameField({
  label,
  placeholder,
  items,
  value,
  onChange,
  onCreate,
  creating,
  createLabel,
}: {
  label: string;
  placeholder: string;
  items: CompanySearchItem[];
  value: string;
  onChange: (value: string) => void;
  onCreate: (companyName: string) => void;
  creating: boolean;
  createLabel: string;
}) {
  const [focused, setFocused] = useState(false);

  const cleanedQuery = value.trim().toLowerCase();

  const matchingItems = cleanedQuery
    ? items
        .filter((item) => {
          const searchableText = [
            item.label,
            item.description,
            item.keywords,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

          return searchableText.includes(cleanedQuery);
        })
        .slice(0, 8)
    : items.slice(0, 8);

  const exactMatch = items.some(
    (item) => item.label.trim().toLowerCase() === cleanedQuery
  );

  const showMenu = focused && (matchingItems.length > 0 || value.trim() !== '');

  return (
    <div className="relative">
      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </label>

      <input
        type="text"
        className="input-field"
        placeholder={placeholder}
        value={value}
        onFocus={() => setFocused(true)}
        onChange={(event) => onChange(event.target.value)}
      />

      {showMenu && (
        <div className="custom-board-scrollbar absolute z-50 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-dark-border dark:bg-slate-950">
          {matchingItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(item.label);
                setFocused(false);
              }}
              className="block w-full border-b border-slate-200 px-4 py-3 text-left hover:bg-slate-50 dark:border-dark-border dark:hover:bg-slate-800"
            >
              <p className="font-semibold text-slate-950 dark:text-white">{item.label}</p>
              {item.description && (
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{item.description}</p>
              )}
            </button>
          ))}

          {!exactMatch && value.trim() !== '' && (
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onCreate(value.trim());
                setFocused(false);
              }}
              disabled={creating}
              className="block w-full px-4 py-3 text-left font-semibold text-green-300 hover:bg-green-950 disabled:opacity-60"
            >
              {creating ? 'Creating...' : `${createLabel}: ${value.trim()}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function displayLocation(address?: string | null, city?: string | null) {
  const parts = [address, city].filter(
    (part) => part && String(part).trim() !== ''
  );

  if (parts.length === 0) {
    return 'Location unknown';
  }

  return parts.join(', ');
}