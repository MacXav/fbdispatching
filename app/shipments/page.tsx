'use client';

import { KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import MainLayout from '@/components/MainLayout';
import Header from '@/components/Header';
import { ChevronDown, ChevronUp, Edit2, Plus, Trash2, X } from 'lucide-react';
import {
  createCompany,
  createShipment,
  deleteShipment,
  getCompanies,
  getShipments,
  updateShipment,
} from '@/lib/database';
import { BoardStopType, Company, Shipment } from '@/types';

interface CompanySearchItem {
  id: string;
  label: string;
  description: string;
  keywords: string;
}

const emptyForm = {
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

  notes: '',

  customs_docs_received: false,
  stays_in_canada: false,
};

const stopTypeOptions: { value: BoardStopType; label: string; description: string }[] = [
  {
    value: 'pickup',
    label: 'Pickup',
    description: 'Pickup task shown on the pickup board.',
  },
  {
    value: 'delivery',
    label: 'Delivery',
    description: 'Delivery task shown as a delivery stop.',
  },
  {
    value: 'pickup_and_delivery',
    label: 'Pickup + Delivery',
    description: 'Driver is doing both.',
  },
  {
    value: 'cross_dock',
    label: 'Cross Dock',
    description: 'Freight moving through the dock.',
  },
  {
    value: 'warehouse',
    label: 'Warehouse',
    description: 'Warehouse/load task.',
  },
];

export default function PickupsPage() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [showTimes, setShowTimes] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [pickupDateFilter, setPickupDateFilter] = useState<'all' | 'today' | 'tomorrow' | 'future'>('all');
  const [docFilter, setDocFilter] = useState<'all' | 'received' | 'missing'>('all');
  const [canFilter, setCanFilter] = useState<'all' | 'canada' | 'not_canada'>('all');

  const [selectedShipmentIds, setSelectedShipmentIds] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [creatingCompanyField, setCreatingCompanyField] = useState<
    'pickup' | 'delivery' | null
  >(null);

  const [inlineEditingShipmentId, setInlineEditingShipmentId] = useState<string | null>(null);
  const [inlineSkidsDraft, setInlineSkidsDraft] = useState('');
  const [inlineWeightDraft, setInlineWeightDraft] = useState('');
  const [inlineSavingId, setInlineSavingId] = useState<string | null>(null);

  const [formData, setFormData] = useState(emptyForm);

  useEffect(() => {
    loadPageData();
  }, []);

  const loadPageData = async () => {
    try {
      setLoading(true);

      const [shipmentsData, companiesData] = await Promise.all([
        getShipments(),
        getCompanies(),
      ]);

      setShipments(shipmentsData);
      setCompanies(companiesData);

      setSelectedShipmentIds((currentIds) =>
        currentIds.filter((id) => shipmentsData.some((shipment) => shipment.id === id))
      );
    } catch (error) {
      console.error('Error loading pickups:', error);
      alert('Could not load pickups.');
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

  const selectedPickupCompany = useMemo(() => {
    return companies.find((company) => company.id === formData.pickup_company_id) || null;
  }, [companies, formData.pickup_company_id]);

  const selectedDeliveryCompany = useMemo(() => {
    return companies.find((company) => company.id === formData.delivery_company_id) || null;
  }, [companies, formData.delivery_company_id]);

  const filteredShipments = shipments.filter((shipment) => {
    const lowerSearch = searchTerm.trim().toLowerCase();

    const matchesSearch =
      lowerSearch === '' ||
      [
        shipment.pickup_company_name,
        shipment.delivery_company_name,
        shipment.pickup_address,
        shipment.delivery_address,
        shipment.pickup_city,
        shipment.delivery_city,
        shipment.pickup_postal_code,
        shipment.delivery_postal_code,
        shipment.board_name,
        shipment.board_note,
        shipment.notes,
        shipment.board_stop_type,
        shipment.number_of_skids,
        shipment.weight_lbs,
        shipment.weight_kg,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(lowerSearch);

    const matchesActive = shipment.status !== 'delivered';

    const pickupDateBucket = getPickupDateBucketLabel(shipment.pickup_date).toLowerCase();

    const matchesPickupDate =
      pickupDateFilter === 'all' ||
      pickupDateBucket === pickupDateFilter;

    const matchesDocs =
      docFilter === 'all' ||
      (docFilter === 'received' && Boolean(shipment.customs_docs_received)) ||
      (docFilter === 'missing' && !shipment.customs_docs_received);

    const matchesCanada =
      canFilter === 'all' ||
      (canFilter === 'canada' && Boolean(shipment.stays_in_canada)) ||
      (canFilter === 'not_canada' && !shipment.stays_in_canada);

    return matchesSearch && matchesActive && matchesPickupDate && matchesDocs && matchesCanada;
  }).sort(sortPickupsBySchedule);

  const allFilteredSelected =
    filteredShipments.length > 0 &&
    filteredShipments.every((shipment) => selectedShipmentIds.includes(shipment.id));

  const toggleShipmentSelection = (shipmentId: string) => {
    setSelectedShipmentIds((currentIds) => {
      if (currentIds.includes(shipmentId)) {
        return currentIds.filter((id) => id !== shipmentId);
      }

      return [...currentIds, shipmentId];
    });
  };

  const toggleAllFilteredShipments = () => {
    if (allFilteredSelected) {
      setSelectedShipmentIds((currentIds) =>
        currentIds.filter(
          (id) => !filteredShipments.some((shipment) => shipment.id === id)
        )
      );

      return;
    }

    setSelectedShipmentIds((currentIds) => {
      const nextIds = new Set(currentIds);

      filteredShipments.forEach((shipment) => {
        nextIds.add(shipment.id);
      });

      return Array.from(nextIds);
    });
  };

  const handleBulkDelete = async () => {
    if (selectedShipmentIds.length === 0) {
      alert('Select pickups to delete first.');
      return;
    }

    if (
      !confirm(
        `Delete ${selectedShipmentIds.length} selected pickup(s)? This cannot be undone.`
      )
    ) {
      return;
    }

    try {
      setBulkDeleting(true);

      let failed = 0;

      for (const shipmentId of selectedShipmentIds) {
        const deleted = await deleteShipment(shipmentId);

        if (!deleted) {
          failed++;
        }
      }

      setSelectedShipmentIds([]);
      await loadPageData();

      if (failed > 0) {
        alert(`${failed} pickup(s) could not be deleted.`);
      }
    } catch (error) {
      console.error('Error bulk deleting pickups:', error);
      alert('Something went wrong while deleting selected pickups.');
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleCreateCompanyFromName = async (
    companyName: string,
    field: 'pickup' | 'delivery'
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
      setFormData((current) => ({
        ...current,
        [field === 'pickup' ? 'pickup_company_id' : 'delivery_company_id']:
          existingCompany.id,
      }));
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

      setFormData((current) => ({
        ...current,
        [field === 'pickup' ? 'pickup_company_id' : 'delivery_company_id']:
          createdCompany.id,
      }));
    } catch (error) {
      console.error('Error creating company:', error);
      alert('Could not create company.');
    } finally {
      setCreatingCompanyField(null);
    }
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

  const buildShipmentPayload = () => {
    return {
      work_order_id: null,

      dispatch_task_type: 'pickup',
      dispatch_status: 'open',

      pickup_company_name: selectedPickupCompany?.name || null,
      pickup_address: companyValue(selectedPickupCompany?.address),
      pickup_city: companyValue(selectedPickupCompany?.city),
      pickup_postal_code: companyValue(selectedPickupCompany?.postal_code),
      pickup_date: blankToNull(formData.pickup_date),
      pickup_time: blankToNull(formData.pickup_time),
      pickup_contact_name: companyValue(selectedPickupCompany?.contact_name),
      pickup_contact_phone: companyValue(selectedPickupCompany?.contact_phone),

      delivery_company_name: selectedDeliveryCompany?.name || null,
      delivery_address: companyValue(selectedDeliveryCompany?.address),
      delivery_city: companyValue(selectedDeliveryCompany?.city),
      delivery_postal_code: companyValue(selectedDeliveryCompany?.postal_code),
      delivery_date: blankToNull(formData.delivery_date),
      delivery_time: blankToNull(formData.delivery_time),
      delivery_contact_name: companyValue(selectedDeliveryCompany?.contact_name),
      delivery_contact_phone: companyValue(selectedDeliveryCompany?.contact_phone),

      number_of_skids: numberValue(formData.number_of_skids),
      weight_lbs: numberValue(formData.weight_lbs),
      dimensions: blankToNull(formData.dimensions),

      board_name: blankToNull(formData.board_name),
      board_note: blankToNull(formData.board_note),
      board_stop_type: formData.board_stop_type,

      notes: blankToNull(formData.notes),

      customs_docs_received: formData.customs_docs_received,
      stays_in_canada: formData.stays_in_canada,
    };
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!formData.pickup_date) {
      setShowTimes(true);
      alert('Pickup date is required so future pickups do not show on today\'s dashboard.');
      return;
    }

    try {
      setSaving(true);

      const payload = buildShipmentPayload();

      if (editingId) {
        const updatedShipment = await updateShipment(editingId, payload as Partial<Shipment>);

        if (!updatedShipment) {
          alert('Pickup could not be updated.');
          return;
        }
      } else {
        const createdShipment = await createShipment({
          ...payload,
          status: 'pending',
        } as Omit<Shipment, 'id' | 'created_at' | 'updated_at'>);

        if (!createdShipment) {
          alert('Pickup could not be created.');
          return;
        }
      }

      resetForm();
      await loadPageData();
    } catch (error) {
      console.error('Error saving pickup:', error);
      alert('Something went wrong while saving the pickup.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (shipment: Shipment) => {
    const pickupCompany = companies.find(
      (company) =>
        company.name.toLowerCase() === (shipment.pickup_company_name || '').toLowerCase()
    );

    const deliveryCompany = companies.find(
      (company) =>
        company.name.toLowerCase() === (shipment.delivery_company_name || '').toLowerCase()
    );

    const hasTimes =
      Boolean(shipment.pickup_date) ||
      Boolean(shipment.pickup_time) ||
      Boolean(shipment.delivery_date) ||
      Boolean(shipment.delivery_time);

    setFormData({
      pickup_company_id: pickupCompany?.id || '',
      delivery_company_id: deliveryCompany?.id || '',

      pickup_date: shipment.pickup_date || '',
      pickup_time: shipment.pickup_time || '',
      delivery_date: shipment.delivery_date || '',
      delivery_time: shipment.delivery_time || '',

      number_of_skids:
        shipment.number_of_skids === null || shipment.number_of_skids === undefined
          ? ''
          : String(shipment.number_of_skids),

      weight_lbs:
        shipment.weight_lbs === null || shipment.weight_lbs === undefined
          ? shipment.weight_kg === null || shipment.weight_kg === undefined
            ? ''
            : String(shipment.weight_kg)
          : String(shipment.weight_lbs),

      dimensions: shipment.dimensions || '',

      board_name: shipment.board_name || '',
      board_note: shipment.board_note || '',
      board_stop_type: (shipment.board_stop_type as BoardStopType) || 'pickup',

      notes: shipment.notes || '',

      customs_docs_received: Boolean(shipment.customs_docs_received),
      stays_in_canada: Boolean(shipment.stays_in_canada),
    });

    setShowTimes(false);
    setEditingId(shipment.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this pickup?')) {
      return;
    }

    try {
      const deleted = await deleteShipment(id);

      if (!deleted) {
        alert('Pickup could not be deleted.');
        return;
      }

      setSelectedShipmentIds((currentIds) => currentIds.filter((shipmentId) => shipmentId !== id));
      await loadPageData();
    } catch (error) {
      console.error('Error deleting pickup:', error);
      alert('Could not delete pickup.');
    }
  };

  const openInlineSkidsWeightEditor = (shipment: Shipment) => {
    setInlineEditingShipmentId(shipment.id);
    setInlineSkidsDraft(
      shipment.number_of_skids === null || shipment.number_of_skids === undefined
        ? ''
        : String(shipment.number_of_skids)
    );
    setInlineWeightDraft(
      shipment.weight_lbs === null || shipment.weight_lbs === undefined
        ? shipment.weight_kg === null || shipment.weight_kg === undefined
          ? ''
          : String(shipment.weight_kg)
        : String(shipment.weight_lbs)
    );
  };

  const closeInlineSkidsWeightEditor = () => {
    setInlineEditingShipmentId(null);
    setInlineSkidsDraft('');
    setInlineWeightDraft('');
  };

  const saveInlineSkidsWeight = async (shipment: Shipment) => {
    try {
      setInlineSavingId(shipment.id);

      const updated = await updateShipment(shipment.id, {
        number_of_skids: numberValue(inlineSkidsDraft),
        weight_lbs: numberValue(inlineWeightDraft),
      } as Partial<Shipment>);

      if (!updated) {
        alert('Could not update skids/weight.');
        return;
      }

      closeInlineSkidsWeightEditor();
      await loadPageData();
    } catch (error) {
      console.error('Error updating skids/weight:', error);
      alert('Could not update skids/weight.');
    } finally {
      setInlineSavingId(null);
    }
  };

  const openAddPickupForm = () => {
    setFormData({
      ...emptyForm,
      pickup_date: getTodayDateKey(),
    });
    setShowTimes(false);
    setEditingId(null);
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData(emptyForm);
    setShowTimes(false);
    setEditingId(null);
    setShowForm(false);
  };

  const clearTimes = () => {
    setFormData({
      ...formData,
      pickup_time: '',
      delivery_date: '',
      delivery_time: '',
    });
    setShowTimes(true);
  };

  return (
    <MainLayout>
      <Header
        title="Pickups"
        subtitle="Create and schedule pickups. Today and overdue pickups show on the dashboard."
      />

      <div className="page-actions">
        <div className="page-actions-left">
          <input
            type="text"
            placeholder="Search pickup, delivery, city, board name, notes..."
            className="input-field max-w-xl"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />

          {selectedShipmentIds.length > 0 && (
            <button
              type="button"
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="btn-danger flex items-center justify-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              {bulkDeleting
                ? 'Deleting...'
                : `Delete Selected (${selectedShipmentIds.length})`}
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={openAddPickupForm}
          className="btn-primary flex items-center justify-center gap-2"
        >
          <Plus className="h-5 w-5" />
          Add Pickup
        </button>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-soft dark:border-dark-border dark:bg-dark-card dark:shadow-soft-dark lg:grid-cols-3">
        <FilterButtonGroup
          label="Pickup Date"
          value={pickupDateFilter}
          options={[
            { value: 'all', label: 'All Active' },
            { value: 'today', label: 'Today' },
            { value: 'tomorrow', label: 'Tomorrow' },
            { value: 'future', label: 'Future' },
          ]}
          onChange={(value) =>
            setPickupDateFilter(value as 'all' | 'today' | 'tomorrow' | 'future')
          }
        />

        <FilterButtonGroup
          label="Docs"
          value={docFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'received', label: 'Received' },
            { value: 'missing', label: 'Missing' },
          ]}
          onChange={(value) => setDocFilter(value as 'all' | 'received' | 'missing')}
        />

        <FilterButtonGroup
          label="Canada"
          value={canFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'canada', label: 'Canada' },
            { value: 'not_canada', label: 'Not Canada' },
          ]}
          onChange={(value) => setCanFilter(value as 'all' | 'canada' | 'not_canada')}
        />
      </div>

      {selectedShipmentIds.length > 0 && (
        <div className="mb-4 flex flex-col gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm dark:border-red-800 dark:bg-red-950/40 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-red-800 dark:text-red-100">
            {selectedShipmentIds.length} pickup(s) selected.
          </p>

          <button
            type="button"
            onClick={() => setSelectedShipmentIds([])}
            className="text-sm font-semibold text-red-700 hover:text-red-900 dark:text-red-200 dark:hover:text-white"
          >
            Clear selection
          </button>
        </div>
      )}

      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm dark:bg-black/60"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              resetForm();
            }
          }}
        >
          <div
            className="custom-board-scrollbar max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-dark-border dark:bg-dark-card sm:p-8"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-slate-950 dark:text-white">
                  {editingId ? 'Edit Pickup' : 'Create Pickup'}
                </h2>

                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  This creates a dispatch task for the truck board. It does not need a work order.
                </p>
              </div>

              <button
                type="button"
                onClick={resetForm}
                className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-dark-border dark:bg-slate-900/50">
                <h3 className="mb-4 text-lg font-bold text-slate-950 dark:text-white">
                  Pickup / Delivery
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
                      label="Going To"
                      placeholder="Type receiver, warehouse, cross-dock..."
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
                      createLabel="Create new destination"
                    />

                    {selectedDeliveryCompany && (
                      <CompanyPreview company={selectedDeliveryCompany} />
                    )}
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-dark-border dark:bg-slate-900/50">
                <h3 className="mb-4 text-lg font-bold text-slate-950 dark:text-white">
                  Freight Details
                </h3>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <NumberField
                    label="Number of Skids"
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

                  <div className="md:col-span-2">
                    <TextField
                      label="Dimensions"
                      placeholder="Unknown"
                      value={formData.dimensions}
                      onChange={(value) =>
                        setFormData({ ...formData, dimensions: value })
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

                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Notes
                    </label>

                    <textarea
                      placeholder="Optional dispatch notes"
                      className="input-field"
                      rows={3}
                      value={formData.notes}
                      onChange={(event) =>
                        setFormData({ ...formData, notes: event.target.value })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border-2 border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/20">
                <div className="mb-4">
                  <h3 className="text-lg font-black text-slate-950 dark:text-white">
                    Pickup Schedule <span className="text-red-600 dark:text-red-400">*</span>
                  </h3>

                  <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                    Required. Only pickups dated today or overdue will appear on the dashboard. Future pickups stay scheduled until their pickup date.
                  </p>
                </div>

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
                </div>

                <button
                  type="button"
                  onClick={() => setShowTimes(!showTimes)}
                  className="mt-5 flex w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-4 py-3 text-left transition hover:bg-slate-50 dark:border-dark-border dark:bg-slate-900 dark:hover:bg-slate-800"
                >
                  <div>
                    <p className="text-sm font-black text-slate-950 dark:text-white">
                      Delivery date / appointment details
                    </p>

                    <p className="mt-1 text-xs font-medium text-slate-600 dark:text-slate-400">
                      Optional. Add this only when there is a known delivery date or appointment time.
                    </p>
                  </div>

                  {showTimes ? (
                    <ChevronUp className="h-5 w-5 text-slate-500 dark:text-slate-400" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-slate-500 dark:text-slate-400" />
                  )}
                </button>

                {showTimes && (
                  <div className="mt-4 grid grid-cols-1 gap-4 border-t border-blue-200 pt-4 dark:border-blue-900 md:grid-cols-2">
                    <DateField
                      label="Delivery Date"
                      value={formData.delivery_date}
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

                    <div className="md:col-span-2">
                      <button
                        type="button"
                        onClick={clearTimes}
                        className="text-sm font-bold text-red-700 hover:text-red-800 dark:text-red-300 dark:hover:text-red-200"
                      >
                        Clear optional delivery/time fields
                      </button>
                    </div>
                  </div>
                )}
              </div>



              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-dark-border dark:bg-slate-900/50">
                <h3 className="mb-4 text-lg font-bold text-slate-950 dark:text-white">
                  Pickup Flags
                </h3>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() =>
                      setFormData({
                        ...formData,
                        customs_docs_received: !formData.customs_docs_received,
                      })
                    }
                    className={`rounded-lg border px-4 py-3 text-left font-semibold ${
                      formData.customs_docs_received
                        ? 'border-green-300 bg-green-50 text-green-800 dark:border-green-700 dark:bg-green-950 dark:text-green-200'
                        : 'border-red-300 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200'
                    }`}
                  >
                    DOC: {formData.customs_docs_received ? 'Received' : 'Not Received'}
                    <p className="mt-1 text-xs font-normal opacity-80">
                      Only shown on pickup board.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setFormData({
                        ...formData,
                        stays_in_canada: !formData.stays_in_canada,
                      })
                    }
                    className={`rounded-lg border px-4 py-3 text-left font-semibold ${
                      formData.stays_in_canada
                        ? 'border-red-600 bg-red-600 text-white dark:bg-red-900'
                        : 'border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                    }`}
                  >
                    CAN: {formData.stays_in_canada ? 'Canada Freight' : 'Not Marked Canada'}
                    <p className="mt-1 text-xs font-normal opacity-80">
                      Only used before assigning to a truck.
                    </p>
                  </button>
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
                  {saving ? 'Saving...' : editingId ? 'Update Pickup' : 'Create Pickup'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="card">
          <p className="text-slate-600 dark:text-slate-400">Loading pickups...</p>
        </div>
      ) : filteredShipments.length === 0 ? (
        <div className="card text-center">
          <p className="text-slate-600 dark:text-slate-400">No pickups found.</p>
        </div>
      ) : (
        <div className="custom-board-scrollbar overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-soft dark:border-dark-border dark:bg-dark-card dark:shadow-soft-dark">
          <table className="status-table">
            <thead>
              <tr>
                <th className="w-12">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleAllFilteredShipments}
                    className="h-4 w-4 cursor-pointer"
                    title="Select all visible pickups"
                  />
                </th>
                <th>Board Name</th>
                <th>Pickup Date</th>
                <th>Pickup</th>
                <th>Going To</th>
                <th>Skids / Weight</th>
                <th>Flags</th>
                <th>Notes</th>
                <th>Assigned</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredShipments.map((shipment) => {
                const selected = selectedShipmentIds.includes(shipment.id);
                const inlineEditing = inlineEditingShipmentId === shipment.id;
                const shipmentWeight = shipment.weight_lbs || shipment.weight_kg || null;

                return (
                  <tr
                    key={shipment.id}
                    className={selected ? 'bg-red-50 dark:bg-red-950/30' : ''}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleShipmentSelection(shipment.id)}
                        className="h-4 w-4 cursor-pointer"
                        title="Select pickup"
                      />
                    </td>

                    <td>
                      <p className="font-semibold text-slate-950 dark:text-white">
                        {getBoardDisplayName(shipment)}
                      </p>
                      <p className="mt-1 text-xs capitalize text-slate-500 dark:text-slate-400">
                        {(shipment.board_stop_type || 'pickup').replace(/_/, ' ')}
                      </p>
                    </td>

                    <td>
                      <p className="whitespace-nowrap text-sm font-black text-slate-950 dark:text-white">
                        {formatFriendlyPickupDate(shipment.pickup_date)}
                      </p>

                      <span
                        className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${getPickupDateBadgeClass(
                          shipment.pickup_date
                        )}`}
                      >
                        {getPickupDateBucketLabel(shipment.pickup_date)}
                      </span>
                    </td>

                    <td>
                      <p className="font-semibold text-slate-950 dark:text-white">
                        {displayValue(shipment.pickup_company_name)}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {displayLocation(shipment.pickup_address, shipment.pickup_city)}
                      </p>
                    </td>

                    <td>
                      <p className="font-semibold text-slate-950 dark:text-white">
                        {displayValue(shipment.delivery_company_name)}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {displayLocation(shipment.delivery_address, shipment.delivery_city)}
                      </p>
                    </td>

                    <td>
                      {inlineEditing ? (
                        <div className="min-w-[170px] space-y-2">
                          <input
                            type="number"
                            className="input-field h-9 text-sm"
                            placeholder="Skids"
                            min="0"
                            max="12"
                            value={inlineSkidsDraft}
                            onChange={(event) => setInlineSkidsDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                saveInlineSkidsWeight(shipment);
                              }

                              if (event.key === 'Escape') {
                                closeInlineSkidsWeightEditor();
                              }
                            }}
                          />

                          <input
                            type="number"
                            className="input-field h-9 text-sm"
                            placeholder="Weight"
                            min="0"
                            max="15000"
                            value={inlineWeightDraft}
                            onChange={(event) => setInlineWeightDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                saveInlineSkidsWeight(shipment);
                              }

                              if (event.key === 'Escape') {
                                closeInlineSkidsWeightEditor();
                              }
                            }}
                          />

                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => saveInlineSkidsWeight(shipment)}
                              className="rounded bg-green-600 px-2 py-1 text-xs font-bold text-white hover:bg-green-700"
                              disabled={inlineSavingId === shipment.id}
                            >
                              {inlineSavingId === shipment.id ? 'Saving...' : 'Save'}
                            </button>

                            <button
                              type="button"
                              onClick={closeInlineSkidsWeightEditor}
                              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openInlineSkidsWeightEditor(shipment)}
                          className="rounded-lg border border-transparent p-2 text-left hover:border-blue-300 hover:bg-blue-50 dark:hover:border-blue-600 dark:hover:bg-blue-950/40"
                          title="Click to edit skids and weight"
                        >
                          <p className="font-semibold text-slate-950 dark:text-white">
                            {displayValue(shipment.number_of_skids, 'Unknown')} skids
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {shipmentWeight
                              ? `${Number(shipmentWeight).toLocaleString()} lbs`
                              : 'Weight unknown'}
                          </p>
                          <p className="mt-1 text-[10px] font-semibold text-blue-700 dark:text-blue-300">
                            Click to edit
                          </p>
                        </button>
                      )}
                    </td>

                    <td>
                      <div className="flex flex-wrap gap-1">
                        <span
                          className={`rounded px-2 py-1 text-xs font-semibold ${
                            shipment.customs_docs_received
                              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                              : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                          }`}
                        >
                          {shipment.customs_docs_received ? 'DOC YES' : 'DOC NO'}
                        </span>

                        {shipment.stays_in_canada && (
                          <span className="rounded bg-red-700 px-2 py-1 text-xs font-semibold text-white">
                            CANADA
                          </span>
                        )}

                        {shipment.route_completed && (
                          <span className="rounded bg-green-700 px-2 py-1 text-xs font-semibold text-white">
                            FIN
                          </span>
                        )}
                      </div>
                    </td>

                    <td>
                      <p className="max-w-xs text-xs font-semibold text-amber-700 dark:text-yellow-300">
                        {shipment.board_note || '—'}
                      </p>

                      {shipment.notes && (
                        <p className="mt-1 max-w-xs text-xs text-slate-500 dark:text-slate-400">
                          {shipment.notes}
                        </p>
                      )}
                    </td>

                    <td>
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          shipment.assigned_truck_id
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                            : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {shipment.assigned_truck_id ? 'On Truck' : 'Pickup Board'}
                      </span>
                    </td>

                    <td>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleEdit(shipment)}
                          className="text-blue-400 hover:text-blue-300"
                          title="Edit pickup"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDelete(shipment.id)}
                          className="text-red-400 hover:text-red-300"
                          title="Delete pickup"
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
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-500">
        {label}
      </p>

      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
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
  helpText,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  helpText?: string;
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

      {helpText && (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-500">
          {helpText}
        </p>
      )}
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
      <label className="mb-2 block text-sm font-bold text-slate-800 dark:text-slate-300">
        {label}
        {required && <span className="ml-1 text-red-600 dark:text-red-400">*</span>}
      </label>

      <input
        type="date"
        className="input-field cursor-pointer font-semibold"
        value={value}
        required={required}
        onClick={(event) => {
          try {
            event.currentTarget.showPicker?.();
          } catch {
            // Browser may block showPicker in some cases. The normal date input still works.
          }
        }}
        onFocus={(event) => {
          try {
            event.currentTarget.showPicker?.();
          } catch {
            // Browser may block showPicker in some cases. The normal date input still works.
          }
        }}
        onChange={(event) => onChange(event.target.value)}
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

function CompanyPreview({ company }: { company: Company }) {
  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-dark-border dark:bg-slate-800 dark:text-slate-400">
      <p className="font-semibold text-slate-950 dark:text-slate-200">{company.name}</p>

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
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const selectedItem = items.find((item) => item.id === selectedId) || null;

  const [query, setQuery] = useState(selectedItem?.label || '');
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  useEffect(() => {
    setQuery(selectedItem?.label || '');
  }, [selectedItem?.label]);

  const cleanedQuery = query.trim().toLowerCase();

  const matchingItems = useMemo(() => {
    if (!cleanedQuery) {
      return items.slice(0, 40);
    }

    const queryParts = cleanedQuery.split(/\s+/).filter(Boolean);

    return items
      .map((item) => {
        const labelText = item.label.toLowerCase();

        const searchableText = [
          item.label,
          item.description,
          item.keywords,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        const matches = queryParts.every((part) => searchableText.includes(part));

        if (!matches) {
          return null;
        }

        let score = 0;

        if (labelText === cleanedQuery) score += 100;
        if (labelText.startsWith(cleanedQuery)) score += 70;
        if (labelText.includes(cleanedQuery)) score += 40;
        if (item.description.toLowerCase().includes(cleanedQuery)) score += 10;
        if (item.keywords.toLowerCase().includes(cleanedQuery)) score += 5;

        return {
          item,
          score,
        };
      })
      .filter((result): result is { item: CompanySearchItem; score: number } =>
        Boolean(result)
      )
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }

        return a.item.label.localeCompare(b.item.label);
      })
      .slice(0, 40)
      .map((result) => result.item);
  }, [items, cleanedQuery]);

  const exactMatch = items.some(
    (item) => item.label.trim().toLowerCase() === cleanedQuery
  );

  const canCreate = query.trim() !== '' && !exactMatch;
  const totalOptions = matchingItems.length + (canCreate ? 1 : 0);
  const showMenu = open && totalOptions > 0;

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;

      if (!target || !wrapperRef.current) {
        return;
      }

      if (!wrapperRef.current.contains(target)) {
        setOpen(false);
        setHighlightedIndex(0);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown, true);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [open]);

  useEffect(() => {
    if (!showMenu) {
      return;
    }

    const highlightedOption = listRef.current?.querySelector(
      `[data-option-index="${highlightedIndex}"]`
    );

    highlightedOption?.scrollIntoView({
      block: 'nearest',
    });
  }, [highlightedIndex, showMenu]);

  useEffect(() => {
    setHighlightedIndex((currentIndex) => {
      if (totalOptions <= 0) {
        return 0;
      }

      return Math.min(currentIndex, totalOptions - 1);
    });
  }, [totalOptions]);

  const closeMenu = () => {
    setOpen(false);
    setHighlightedIndex(0);
  };

  const selectCompany = (item: CompanySearchItem) => {
    onSelect(item);
    setQuery(item.label);
    closeMenu();
  };

  const createCompany = () => {
    const cleanedName = query.trim();

    if (!cleanedName || creating) {
      return;
    }

    onCreate(cleanedName);
    closeMenu();
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();

      setOpen(true);

      setHighlightedIndex((currentIndex) => {
        if (totalOptions <= 0) {
          return 0;
        }

        return currentIndex >= totalOptions - 1 ? 0 : currentIndex + 1;
      });

      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();

      setOpen(true);

      setHighlightedIndex((currentIndex) => {
        if (totalOptions <= 0) {
          return 0;
        }

        return currentIndex <= 0 ? totalOptions - 1 : currentIndex - 1;
      });

      return;
    }

    if (event.key === 'Enter') {
      if (!open) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const highlightedCompany = matchingItems[highlightedIndex];

      if (highlightedCompany) {
        selectCompany(highlightedCompany);
        return;
      }

      if (canCreate && highlightedIndex === matchingItems.length) {
        createCompany();
      }

      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
      return;
    }

    if (event.key === 'Tab') {
      closeMenu();
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </label>

      <div className="flex gap-2">
        <input
          type="text"
          className="input-field"
          placeholder={placeholder}
          value={query}
          autoComplete="off"
          onFocus={() => {
            setOpen(true);
            setHighlightedIndex(0);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setHighlightedIndex(0);

            if (selectedId) {
              onClear();
            }
          }}
          onKeyDown={handleInputKeyDown}
        />

        {(selectedId || query.trim()) && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              onClear();
              closeMenu();
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-dark-border dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Clear
          </button>
        )}
      </div>

      {showMenu && (
        <div
          ref={listRef}
          className="custom-board-scrollbar absolute z-[9999] mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-dark-border dark:bg-slate-950"
        >
          {matchingItems.map((item, index) => (
            <button
              key={item.id}
              type="button"
              data-option-index={index}
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                selectCompany(item);
              }}
              onMouseEnter={() => setHighlightedIndex(index)}
              className={`block w-full border-b border-slate-200 px-4 py-3 text-left dark:border-dark-border ${
                highlightedIndex === index
                  ? 'bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-100'
                  : 'text-slate-800 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              <p className="font-semibold text-slate-950 dark:text-white">{item.label}</p>

              {item.description && (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {item.description}
                </p>
              )}
            </button>
          ))}

          {canCreate && (
            <button
              type="button"
              data-option-index={matchingItems.length}
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                createCompany();
              }}
              onMouseEnter={() => setHighlightedIndex(matchingItems.length)}
              disabled={creating}
              className={`block w-full px-4 py-3 text-left font-semibold disabled:opacity-60 ${
                highlightedIndex === matchingItems.length
                  ? 'bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200'
                  : 'text-green-700 hover:bg-green-50 dark:text-green-300 dark:hover:bg-green-950'
              }`}
            >
              {creating ? 'Creating...' : `${createLabel}: ${query.trim()}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function getBoardDisplayName(shipment: Shipment) {
  if (shipment.board_name && shipment.board_name.trim() !== '') {
    return shipment.board_name;
  }

  const stopType = shipment.board_stop_type || 'pickup';

  if (
    stopType === 'pickup' ||
    stopType === 'pickup_and_delivery' ||
    stopType === 'warehouse'
  ) {
    return shipment.pickup_company_name || shipment.delivery_company_name || 'Unknown';
  }

  if (stopType === 'cross_dock') {
    return shipment.pickup_company_name || shipment.delivery_company_name || 'Cross Dock';
  }

  return shipment.delivery_company_name || shipment.pickup_company_name || 'Unknown';
}

function displayValue(value?: string | number | null, fallback = 'Unknown') {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  return value;
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

function sortPickupsBySchedule(a: Shipment, b: Shipment) {
  const today = getTodayDateKey();
  const aKey = getDateKey(a.pickup_date);
  const bKey = getDateKey(b.pickup_date);

  const aRank = getPickupDateRank(aKey, today);
  const bRank = getPickupDateRank(bKey, today);

  if (aRank !== bRank) {
    return aRank - bRank;
  }

  if (aKey !== bKey) {
    return aKey.localeCompare(bKey);
  }

  return safeString(a.pickup_time).localeCompare(safeString(b.pickup_time));
}

function getPickupDateRank(dateKey: string, todayKey: string) {
  if (!dateKey) return 5;
  if (dateKey < todayKey) return 0;
  if (dateKey === todayKey) return 1;

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = formatDateKey(tomorrow);

  if (dateKey === tomorrowKey) return 2;

  return 3;
}

function getDateKey(value?: string | null) {
  if (!value) {
    return '';
  }

  return String(value).slice(0, 10);
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function formatFriendlyPickupDate(value?: string | null) {
  const dateKey = getDateKey(value);

  if (!dateKey) {
    return 'No date';
  }

  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const weekday = date.toLocaleDateString('en-CA', { weekday: 'long' });
  const monthName = date.toLocaleDateString('en-CA', { month: 'long' });

  return `${weekday}, ${monthName} ${getOrdinalDay(day)}`;
}

function getOrdinalDay(day: number) {
  const suffix =
    day % 10 === 1 && day % 100 !== 11
      ? 'st'
      : day % 10 === 2 && day % 100 !== 12
        ? 'nd'
        : day % 10 === 3 && day % 100 !== 13
          ? 'rd'
          : 'th';

  return `${day}${suffix}`;
}

function getPickupDateBucketLabel(value?: string | null) {
  const today = getTodayDateKey();
  const dateKey = getDateKey(value);

  if (!dateKey) return 'No date';
  if (dateKey < today) return 'Today';
  if (dateKey === today) return 'Today';

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (dateKey === formatDateKey(tomorrow)) return 'Tomorrow';

  return 'Future';
}

function getPickupDateBadgeClass(value?: string | null) {
  const label = getPickupDateBucketLabel(value);

  if (label === 'Today') {
    return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100';
  }

  if (label === 'Tomorrow') {
    return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100';
  }

  if (label === 'Future') {
    return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200';
  }

  return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100';
}

function getTodayDateKey() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}



function safeString(value?: string | number | null) {
  if (value === null || value === undefined) return '';
  return String(value);
}
