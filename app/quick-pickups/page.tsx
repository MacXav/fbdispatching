'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import MainLayout from '@/components/MainLayout';
import Header from '@/components/Header';
import AutocompleteField, { AutocompleteItem } from '@/components/AutocompleteField';
import { supabase } from '@/lib/supabase';
import { createShipment, getCompanies } from '@/lib/database';
import { Company, Shipment } from '@/types';
import {
  CheckCircle2,
  Edit2,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';

interface PickupTemplate {
  id: string;
  template_name: string;
  pickup_company_id: string | null;
  delivery_company_id: string | null;
  board_name: string | null;
  board_note: string | null;
  number_of_skids: number | null;
  weight_lbs: number | null;
  customs_docs_received: boolean;
  stays_in_canada: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const emptyForm = {
  template_name: '',
  pickup_company_id: '',
  delivery_company_id: '',
  board_name: '',
  board_note: '',
  number_of_skids: '',
  weight_lbs: '',
  customs_docs_received: false,
  stays_in_canada: false,
  is_active: true,
};

export default function QuickPickupsPage() {
  const [templates, setTemplates] = useState<PickupTemplate[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);

  const [loading, setLoading] = useState(true);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [creatingAll, setCreatingAll] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [formData, setFormData] = useState(emptyForm);

  useEffect(() => {
    loadPageData();
  }, []);

  const loadPageData = async () => {
    try {
      setLoading(true);

      const [companiesData, templatesResult] = await Promise.all([
        getCompanies(),
        supabase
          .from('pickup_templates')
          .select('*')
          .order('template_name', { ascending: true }),
      ]);

      if (templatesResult.error) {
        console.error('Error loading pickup templates:', templatesResult.error);
        alert('Could not load pickup templates. Check the console.');
        return;
      }

      setCompanies(companiesData);
      setTemplates((templatesResult.data || []) as PickupTemplate[]);
    } catch (error) {
      console.error('Error loading quick pickups page:', error);
      alert('Could not load quick pickups page.');
    } finally {
      setLoading(false);
    }
  };

  const companyItems: AutocompleteItem[] = useMemo(() => {
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

  const activeTemplates = templates.filter((template) => template.is_active);

  const getCompanyById = (companyId?: string | null) => {
    if (!companyId) return null;
    return companies.find((company) => company.id === companyId) || null;
  };

  const selectedPickupCompany = getCompanyById(formData.pickup_company_id);
  const selectedDeliveryCompany = getCompanyById(formData.delivery_company_id);

  const blankToNull = (value: string) => {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  };

  const numberValue = (value: string) => {
    if (value.trim() === '') return null;

    const parsed = Number(value);

    if (Number.isNaN(parsed)) {
      return null;
    }

    return parsed;
  };

  const companyValue = (value?: string | null) => {
    if (!value || value.trim() === '') return null;
    return value.trim();
  };

  const buildTemplatePayload = () => {
    return {
      template_name: formData.template_name.trim(),
      pickup_company_id: blankToNull(formData.pickup_company_id),
      delivery_company_id: blankToNull(formData.delivery_company_id),
      board_name: blankToNull(formData.board_name),
      board_note: blankToNull(formData.board_note),
      number_of_skids: numberValue(formData.number_of_skids),
      weight_lbs: numberValue(formData.weight_lbs),
      customs_docs_received: formData.customs_docs_received,
      stays_in_canada: formData.stays_in_canada,
      is_active: formData.is_active,
      updated_at: new Date().toISOString(),
    };
  };

  const handleSaveTemplate = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!formData.template_name.trim()) {
      alert('Template name is required.');
      return;
    }

    try {
      setSavingTemplate(true);

      const payload = buildTemplatePayload();

      if (editingTemplateId) {
        const { error } = await supabase
          .from('pickup_templates')
          .update(payload)
          .eq('id', editingTemplateId);

        if (error) {
          console.error('Error updating pickup template:', {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code,
            fullError: JSON.stringify(error, null, 2),
          });

          alert(
            `Could not update pickup template.\n\n${error.message || 'Unknown Supabase error'}`
          );

          return;
        }
      } else {
        const { error } = await supabase.from('pickup_templates').insert(payload);

        if (error) {
          console.error('Error creating pickup template:', {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code,
            fullError: JSON.stringify(error, null, 2),
          });

          alert(
            `Could not create pickup template.\n\n${error.message || 'Unknown Supabase error'}`
          );

          return;
        }
      }

      resetForm();
      await loadPageData();
    } catch (error) {
      console.error('Error saving pickup template:', error);
      alert('Could not save pickup template.');
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleEditTemplate = (template: PickupTemplate) => {
    setFormData({
      template_name: template.template_name || '',
      pickup_company_id: template.pickup_company_id || '',
      delivery_company_id: template.delivery_company_id || '',
      board_name: template.board_name || '',
      board_note: template.board_note || '',
      number_of_skids:
        template.number_of_skids === null || template.number_of_skids === undefined
          ? ''
          : String(template.number_of_skids),
      weight_lbs:
        template.weight_lbs === null || template.weight_lbs === undefined
          ? ''
          : String(template.weight_lbs),
      customs_docs_received: Boolean(template.customs_docs_received),
      stays_in_canada: Boolean(template.stays_in_canada),
      is_active: Boolean(template.is_active),
    });

    setEditingTemplateId(template.id);
    setShowForm(true);
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!confirm('Delete this pickup template?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('pickup_templates')
        .delete()
        .eq('id', templateId);

      if (error) {
        console.error('Error deleting pickup template:', error);
        alert('Could not delete pickup template.');
        return;
      }

      await loadPageData();
    } catch (error) {
      console.error('Error deleting pickup template:', error);
      alert('Could not delete pickup template.');
    }
  };

  const handleToggleActive = async (template: PickupTemplate) => {
    try {
      const { error } = await supabase
        .from('pickup_templates')
        .update({
          is_active: !template.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq('id', template.id);

      if (error) {
        console.error('Error updating pickup template:', error);
        alert('Could not update pickup template.');
        return;
      }

      await loadPageData();
    } catch (error) {
      console.error('Error updating pickup template:', error);
      alert('Could not update pickup template.');
    }
  };

  const createShipmentFromTemplate = async (template: PickupTemplate) => {
    const pickupCompany = getCompanyById(template.pickup_company_id);
    const deliveryCompany = getCompanyById(template.delivery_company_id);

    const createdShipment = await createShipment({
      pickup_company_name: pickupCompany?.name || null,
      pickup_address: companyValue(pickupCompany?.address),
      pickup_city: companyValue(pickupCompany?.city),
      pickup_postal_code: companyValue(pickupCompany?.postal_code),
      pickup_date: null,
      pickup_time: null,
      pickup_contact_name: companyValue(pickupCompany?.contact_name),
      pickup_contact_phone: companyValue(pickupCompany?.contact_phone),

      delivery_company_name: deliveryCompany?.name || null,
      delivery_address: companyValue(deliveryCompany?.address),
      delivery_city: companyValue(deliveryCompany?.city),
      delivery_postal_code: companyValue(deliveryCompany?.postal_code),
      delivery_date: null,
      delivery_time: null,
      delivery_contact_name: companyValue(deliveryCompany?.contact_name),
      delivery_contact_phone: companyValue(deliveryCompany?.contact_phone),

      number_of_skids: template.number_of_skids,
      weight_lbs: template.weight_lbs,
      dimensions: null,
      notes: null,

      board_name: template.board_name,
      board_note: template.board_note,
      board_stop_type: 'pickup',

      customs_docs_received: template.customs_docs_received,
      stays_in_canada: template.stays_in_canada,

      route_completed: false,
      route_completed_at: null,
      route_completed_by: null,

      status: 'pending',
    } as Omit<Shipment, 'id' | 'created_at' | 'updated_at'>);

    return createdShipment;
  };

  const handleCreatePickup = async (template: PickupTemplate) => {
    try {
      setCreatingId(template.id);

      const created = await createShipmentFromTemplate(template);

      if (!created) {
        alert('Could not create pickup from template.');
        return;
      }

      alert(`Created pickup: ${template.template_name}`);
    } catch (error) {
      console.error('Error creating pickup from template:', error);
      alert('Could not create pickup from template.');
    } finally {
      setCreatingId(null);
    }
  };

  const handleCreateAllActive = async () => {
    if (activeTemplates.length === 0) {
      alert('No active pickup templates found.');
      return;
    }

    if (
      !confirm(
        `Create ${activeTemplates.length} pickup(s) from active templates?`
      )
    ) {
      return;
    }

    try {
      setCreatingAll(true);

      let created = 0;
      let failed = 0;

      for (const template of activeTemplates) {
        const result = await createShipmentFromTemplate(template);

        if (result) {
          created++;
        } else {
          failed++;
        }
      }

      alert(`Created ${created} pickup(s). Failed: ${failed}.`);
    } catch (error) {
      console.error('Error creating all active pickups:', error);
      alert('Could not create all active pickups.');
    } finally {
      setCreatingAll(false);
    }
  };

  const resetForm = () => {
    setFormData(emptyForm);
    setEditingTemplateId(null);
    setShowForm(false);
  };

  return (
    <MainLayout>
      <div className="mb-6 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <Header
          title="Quick Pickups"
          subtitle="Create everyday recurring pickups fast"
        />

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={loadPageData}
            className="btn-secondary flex items-center justify-center gap-2"
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          <button
            type="button"
            onClick={handleCreateAllActive}
            className="btn-success flex items-center justify-center gap-2"
            disabled={creatingAll || activeTemplates.length === 0}
          >
            <CheckCircle2 className="h-4 w-4" />
            {creatingAll
              ? 'Creating...'
              : `Create All Active (${activeTemplates.length})`}
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingTemplateId(null);
              setFormData(emptyForm);
              setShowForm(true);
            }}
            className="btn-primary flex items-center justify-center gap-2"
          >
            <Plus className="h-4 w-4" />
            New Template
          </button>
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-blue-900 bg-blue-950/50 p-4">
        <p className="text-sm text-blue-100">
          Use this for daily repeat pickups like Raz to Warehouse, Beta to Warehouse, or Orthotic to FedEx. Each template creates a new unassigned pickup on the dashboard pickup board.
        </p>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-dark-border bg-dark-card p-5 shadow-2xl sm:p-8">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-white">
                  {editingTemplateId
                    ? 'Edit Quick Pickup Template'
                    : 'New Quick Pickup Template'}
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  {editingTemplateId
                    ? 'Update this saved template for future quick pickups.'
                    : 'This creates a saved template you can use every day.'}
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

            <form onSubmit={handleSaveTemplate} className="space-y-6">
              <div className="rounded-xl border border-dark-border bg-slate-900/50 p-4">
                <h3 className="mb-4 text-lg font-semibold text-white">
                  Template Info
                </h3>

                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-300">
                      Template Name
                    </label>

                    <input
                      type="text"
                      className="input-field"
                      placeholder="Example: Raz to Warehouse"
                      value={formData.template_name}
                      onChange={(event) =>
                        setFormData({
                          ...formData,
                          template_name: event.target.value,
                        })
                      }
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-300">
                      Board Name
                    </label>

                    <input
                      type="text"
                      className="input-field"
                      placeholder="Optional. Example: RAZ PU"
                      value={formData.board_name}
                      onChange={(event) =>
                        setFormData({
                          ...formData,
                          board_name: event.target.value,
                        })
                      }
                    />

                    <p className="mt-2 text-xs text-slate-500">
                      Leave blank to show the pickup company name on the board.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-dark-border bg-slate-900/50 p-4">
                <h3 className="mb-4 text-lg font-semibold text-white">
                  Companies
                </h3>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <AutocompleteField
                      label="Pickup From"
                      placeholder="Start typing pickup company..."
                      items={companyItems}
                      selectedId={formData.pickup_company_id}
                      onSelect={(item) =>
                        setFormData({
                          ...formData,
                          pickup_company_id: item.id,
                        })
                      }
                      onClear={() =>
                        setFormData({
                          ...formData,
                          pickup_company_id: '',
                        })
                      }
                      emptyMessage="No company found. Add it in Companies first."
                    />

                    {selectedPickupCompany && (
                      <CompanyPreview company={selectedPickupCompany} />
                    )}
                  </div>

                  <div>
                    <AutocompleteField
                      label="Going To"
                      placeholder="Start typing receiver/warehouse..."
                      items={companyItems}
                      selectedId={formData.delivery_company_id}
                      onSelect={(item) =>
                        setFormData({
                          ...formData,
                          delivery_company_id: item.id,
                        })
                      }
                      onClear={() =>
                        setFormData({
                          ...formData,
                          delivery_company_id: '',
                        })
                      }
                      emptyMessage="No company found. Add it in Companies first."
                    />

                    {selectedDeliveryCompany && (
                      <CompanyPreview company={selectedDeliveryCompany} />
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-dark-border bg-slate-900/50 p-4">
                <h3 className="mb-4 text-lg font-semibold text-white">
                  Pickup Details
                </h3>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-300">
                      Skids
                    </label>

                    <input
                      type="number"
                      min="0"
                      max="12"
                      className="input-field"
                      placeholder="Usually 1, but optional"
                      value={formData.number_of_skids}
                      onChange={(event) =>
                        setFormData({
                          ...formData,
                          number_of_skids: event.target.value,
                        })
                      }
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-300">
                      Weight LBS
                    </label>

                    <input
                      type="number"
                      min="0"
                      max="15000"
                      className="input-field"
                      placeholder="Optional"
                      value={formData.weight_lbs}
                      onChange={(event) =>
                        setFormData({
                          ...formData,
                          weight_lbs: event.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm font-medium text-slate-300">
                      Board Note
                    </label>

                    <input
                      type="text"
                      className="input-field"
                      placeholder="Example: Call with ETA, No Bury, Ask for Mike"
                      value={formData.board_note}
                      onChange={(event) =>
                        setFormData({
                          ...formData,
                          board_note: event.target.value,
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-dark-border bg-slate-900/50 p-4">
                <h3 className="mb-4 text-lg font-semibold text-white">
                  Board Flags
                </h3>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
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
                    CAN: {formData.stays_in_canada ? 'Canada' : 'Not Canada'}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setFormData({
                        ...formData,
                        is_active: !formData.is_active,
                      })
                    }
                    className={`rounded-lg border px-4 py-3 text-left font-semibold ${
                      formData.is_active
                        ? 'border-green-700 bg-green-950 text-green-200'
                        : 'border-slate-700 bg-slate-900 text-slate-300'
                    }`}
                  >
                    Active: {formData.is_active ? 'Yes' : 'No'}
                  </button>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={resetForm}
                  className="btn-secondary"
                  disabled={savingTemplate}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="btn-primary"
                  disabled={savingTemplate}
                >
                  {savingTemplate
                    ? 'Saving...'
                    : editingTemplateId
                    ? 'Update Template'
                    : 'Save Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="card">
          <p className="text-slate-400">Loading quick pickups...</p>
        </div>
      ) : templates.length === 0 ? (
        <div className="card text-center">
          <p className="text-slate-400">
            No quick pickup templates yet.
          </p>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="btn-primary mt-4"
          >
            Create Your First Template
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {templates.map((template) => {
            const pickupCompany = getCompanyById(template.pickup_company_id);
            const deliveryCompany = getCompanyById(template.delivery_company_id);

            return (
              <div
                key={template.id}
                className={`rounded-xl border p-5 ${
                  template.is_active
                    ? 'border-dark-border bg-dark-card'
                    : 'border-slate-800 bg-slate-950 opacity-70'
                }`}
              >
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-white">
                      {template.template_name}
                    </h2>

                    <p className="mt-1 text-sm text-slate-400">
                      {pickupCompany?.name || 'Unknown pickup'} →{' '}
                      {deliveryCompany?.name || 'Unknown destination'}
                    </p>
                  </div>

                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      template.is_active
                        ? 'bg-green-900 text-green-200'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {template.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <div className="mb-4 grid grid-cols-2 gap-2 text-sm">
                  <InfoPill
                    label="Board"
                    value={template.board_name || pickupCompany?.name || 'Pickup'}
                  />

                  <InfoPill
                    label="Skids"
                    value={
                      template.number_of_skids === null ||
                      template.number_of_skids === undefined
                        ? 'Unknown'
                        : String(template.number_of_skids)
                    }
                  />

                  <InfoPill
                    label="Weight"
                    value={
                      template.weight_lbs
                        ? `${Number(template.weight_lbs).toLocaleString()} lbs`
                        : 'Unknown'
                    }
                  />

                  <InfoPill
                    label="DOC"
                    value={template.customs_docs_received ? 'Yes' : 'No'}
                  />
                </div>

                {template.board_note && (
                  <div className="mb-4 rounded-lg border border-yellow-800 bg-yellow-950/50 p-3">
                    <p className="text-xs font-semibold uppercase text-yellow-500">
                      Board Note
                    </p>
                    <p className="mt-1 text-sm font-semibold text-yellow-200">
                      {template.board_note}
                    </p>
                  </div>
                )}

                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleCreatePickup(template)}
                    disabled={creatingId === template.id}
                    className="btn-success flex flex-1 items-center justify-center gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    {creatingId === template.id ? 'Creating...' : 'Create Pickup'}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleEditTemplate(template)}
                    className="btn-primary flex items-center justify-center gap-2"
                  >
                    <Edit2 className="h-4 w-4" />
                    Edit
                  </button>

                  <button
                    type="button"
                    onClick={() => handleToggleActive(template)}
                    className="btn-secondary"
                  >
                    {template.is_active ? 'Deactivate' : 'Activate'}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteTemplate(template.id)}
                    className="btn-danger flex items-center justify-center gap-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6">
        <Link href="/dashboard" className="text-sm font-semibold text-blue-300 hover:text-blue-200">
          Back to Truck Board
        </Link>
      </div>
    </MainLayout>
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

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-dark-border bg-slate-900 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 font-semibold text-white">
        {value}
      </p>
    </div>
  );
}