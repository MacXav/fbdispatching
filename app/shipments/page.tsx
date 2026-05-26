'use client';

import { useEffect, useMemo, useState } from 'react';
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
  const [activeFilter, setActiveFilter] = useState<'active' | 'all' | 'completed'>('active');
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

    const matchesActive =
      activeFilter === 'all' ||
      (activeFilter === 'active' && shipment.status !== 'delivered') ||
      (activeFilter === 'completed' && shipment.status === 'delivered');

    const matchesDocs =
      docFilter === 'all' ||
      (docFilter === 'received' && Boolean(shipment.customs_docs_received)) ||
      (docFilter === 'missing' && !shipment.customs_docs_received);

    const matchesCanada =
      canFilter === 'all' ||
      (canFilter === 'canada' && Boolean(shipment.stays_in_canada)) ||
      (canFilter === 'not_canada' && !shipment.stays_in_canada);

    return matchesSearch && matchesActive && matchesDocs && matchesCanada;
  });

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
        notes: 'Created from pickup/dispatch task form. Address/details need to be completed later.',
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

    setShowTimes(hasTimes);
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

  const resetForm = () => {
    setFormData(emptyForm);
    setShowTimes(false);
    setEditingId(null);
    setShowForm(false);
  };

  const clearTimes = () => {
    setFormData({
      ...formData,
      pickup_date: '',
      pickup_time: '',
      delivery_date: '',
      delivery_time: '',
    });
    setShowTimes(false);
  };

  return (
    <MainLayout>
      <Header
        title="Pickups"
        subtitle="Create dispatch tasks for the truck board. These can exist with or without a work order."
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
          onClick={() => setShowForm(true)}
          className="btn-primary flex items-center justify-center gap-2"
        >
          <Plus className="h-5 w-5" />
          Add Pickup
        </button>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 rounded-xl border border-dark-border bg-dark-card p-4 lg:grid-cols-3">
        <FilterButtonGroup
          label="Status"
          value={activeFilter}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'all', label: 'All' },
            { value: 'completed', label: 'Completed' },
          ]}
          onChange={(value) => setActiveFilter(value as 'active' | 'all' | 'completed')}
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
        <div className="mb-4 flex flex-col gap-2 rounded-xl border border-red-800 bg-red-950/40 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-red-100">
            {selectedShipmentIds.length} pickup(s) selected.
          </p>

          <button
            type="button"
            onClick={() => setSelectedShipmentIds([])}
            className="text-sm font-semibold text-red-200 hover:text-white"
          >
            Clear selection
          </button>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-xl border border-dark-border bg-dark-card p-5 shadow-2xl sm:p-8">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-white">
                  {editingId ? 'Edit Pickup' : 'Create Pickup'}
                </h2>

                <p className="mt-1 text-sm text-slate-400">
                  This creates a dispatch task for the truck board. It does not need a work order.
                </p>
              </div>

              <button
                type="button"
                onClick={resetForm}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="rounded-xl border border-dark-border bg-slate-900/50 p-4">
                <h3 className="mb-4 text-lg font-semibold text-white">
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

              <div className="rounded-xl border border-dark-border bg-slate-900/50 p-4">
                <h3 className="mb-4 text-lg font-semibold text-white">
                  Board Display
                </h3>

                <div className="grid grid-cols-1 gap-4">
                  <TextField
                    label="Board Name"
                    placeholder="Example: TDG USA PU, Warehouse, TDG CAN"
                    value={formData.board_name}
                    onChange={(value) =>
                      setFormData({ ...formData, board_name: value })
                    }
                    helpText="Leave blank to use the pickup or delivery company name."
                  />

                  <div>
                    <label className="mb-3 block text-sm font-medium text-slate-300">
                      Dispatch Task Type
                    </label>

                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      {stopTypeOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() =>
                            setFormData({
                              ...formData,
                              board_stop_type: option.value,
                            })
                          }
                          className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                            formData.board_stop_type === option.value
                              ? 'border-blue-500 bg-blue-950 text-blue-100'
                              : 'border-dark-border bg-slate-900 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          <p className="font-semibold">{option.label}</p>
                          <p className="mt-1 text-xs text-slate-400">
                            {option.description}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-dark-border bg-slate-900/50 p-4">
                <h3 className="mb-4 text-lg font-semibold text-white">
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
                    <label className="mb-2 block text-sm font-medium text-slate-300">
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

              <div className="rounded-xl border border-dark-border bg-slate-900/50 p-4">
                <h3 className="mb-4 text-lg font-semibold text-white">
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
                        ? 'border-green-700 bg-green-950 text-green-200'
                        : 'border-red-700 bg-red-950 text-red-200'
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
                        ? 'border-red-600 bg-red-900 text-white'
                        : 'border-slate-700 bg-slate-900 text-slate-300'
                    }`}
                  >
                    CAN: {formData.stays_in_canada ? 'Canada Freight' : 'Not Marked Canada'}
                    <p className="mt-1 text-xs font-normal opacity-80">
                      Only used before assigning to a truck.
                    </p>
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-dark-border bg-slate-900/50 p-4">
                <button
                  type="button"
                  onClick={() => setShowTimes(!showTimes)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <div>
                    <h3 className="text-lg font-semibold text-white">
                      Click to add pickup/delivery times
                    </h3>
                    <p className="mt-1 text-sm text-slate-400">
                      Add times only if there is an appointment or known time.
                    </p>
                  </div>

                  {showTimes ? (
                    <ChevronUp className="h-5 w-5 text-slate-400" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-slate-400" />
                  )}
                </button>

                {showTimes && (
                  <div className="mt-5 border-t border-dark-border pt-5">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <DateField
                        label="Pickup Date"
                        value={formData.pickup_date}
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
                    </div>

                    <button
                      type="button"
                      onClick={clearTimes}
                      className="mt-4 text-sm font-semibold text-red-300 hover:text-red-200"
                    >
                      Clear pickup/delivery times
                    </button>
                  </div>
                )}
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
          <p className="text-slate-400">Loading pickups...</p>
        </div>
      ) : filteredShipments.length === 0 ? (
        <div className="card text-center">
          <p className="text-slate-400">No pickups found.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-dark-border">
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
                    className={selected ? 'bg-red-950/30' : ''}
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
                      <p className="font-semibold text-white">
                        {getBoardDisplayName(shipment)}
                      </p>
                      <p className="mt-1 text-xs capitalize text-slate-400">
                        {(shipment.board_stop_type || 'pickup').replaceAll('_', ' ')}
                      </p>
                    </td>

                    <td>
                      <p className="font-semibold text-white">
                        {displayValue(shipment.pickup_company_name)}
                      </p>
                      <p className="text-xs text-slate-400">
                        {displayLocation(shipment.pickup_address, shipment.pickup_city)}
                      </p>
                    </td>

                    <td>
                      <p className="font-semibold text-white">
                        {displayValue(shipment.delivery_company_name)}
                      </p>
                      <p className="text-xs text-slate-400">
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
                              className="rounded bg-green-700 px-2 py-1 text-xs font-bold text-white hover:bg-green-600"
                              disabled={inlineSavingId === shipment.id}
                            >
                              {inlineSavingId === shipment.id ? 'Saving...' : 'Save'}
                            </button>

                            <button
                              type="button"
                              onClick={closeInlineSkidsWeightEditor}
                              className="rounded bg-slate-700 px-2 py-1 text-xs font-bold text-white hover:bg-slate-600"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openInlineSkidsWeightEditor(shipment)}
                          className="rounded-lg border border-transparent p-2 text-left hover:border-blue-600 hover:bg-blue-950/40"
                          title="Click to edit skids and weight"
                        >
                          <p className="font-semibold text-white">
                            {displayValue(shipment.number_of_skids, 'Unknown')} skids
                          </p>
                          <p className="text-xs text-slate-400">
                            {shipmentWeight
                              ? `${Number(shipmentWeight).toLocaleString()} lbs`
                              : 'Weight unknown'}
                          </p>
                          <p className="mt-1 text-[10px] font-semibold text-blue-300">
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
                              ? 'bg-green-900 text-green-200'
                              : 'bg-red-900 text-red-200'
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
                      <p className="max-w-xs text-xs font-semibold text-yellow-300">
                        {shipment.board_note || '—'}
                      </p>

                      {shipment.notes && (
                        <p className="mt-1 max-w-xs text-xs text-slate-400">
                          {shipment.notes}
                        </p>
                      )}
                    </td>

                    <td>
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          shipment.assigned_truck_id
                            ? 'bg-blue-900 text-blue-200'
                            : 'bg-slate-700 text-slate-300'
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
                ? 'border-blue-500 bg-blue-950 text-blue-100'
                : 'border-dark-border bg-slate-900 text-slate-300 hover:bg-slate-800'
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
      <label className="mb-2 block text-sm font-medium text-slate-300">
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
        <p className="mt-2 text-xs text-slate-500">
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
      <label className="mb-2 block text-sm font-medium text-slate-300">
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-300">
        {label}
      </label>

      <input
        type="date"
        className="input-field"
        value={value}
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
      <label className="mb-2 block text-sm font-medium text-slate-300">
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
    <div className="mt-3 rounded-lg border border-dark-border bg-slate-800 p-3 text-xs text-slate-400">
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
      <label className="mb-2 block text-sm font-medium text-slate-300">
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
            className="rounded-lg border border-dark-border bg-slate-800 px-3 text-sm font-semibold text-slate-200 hover:bg-slate-700"
          >
            Clear
          </button>
        )}
      </div>

      {showMenu && (
        <div className="absolute z-50 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-dark-border bg-slate-950 shadow-2xl">
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
              className="block w-full border-b border-dark-border px-4 py-3 text-left hover:bg-slate-800"
            >
              <p className="font-semibold text-white">{item.label}</p>
              {item.description && (
                <p className="mt-1 text-xs text-slate-400">{item.description}</p>
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