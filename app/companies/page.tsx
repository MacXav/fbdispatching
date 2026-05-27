'use client';

import { useEffect, useState } from 'react';
import MainLayout from '@/components/MainLayout';
import Header from '@/components/Header';
import { Edit2, Plus, Trash2, X } from 'lucide-react';
import {
  createCompany,
  deleteCompany,
  getCompanies,
  updateCompany,
} from '@/lib/database';
import { Company } from '@/types';

type CompanyType = 'shipper' | 'receiver' | 'both';

type CompanyWithExtras = Company & {
  email?: string | null;
  type?: CompanyType | null;
};

const AUTO_COMPANY_NOTES = [
  'Created from pickup/dispatch task form. Address/details need to be completed later.',
  'Created from work order form. Address/details need to be completed later.',
];

const emptyForm = {
  name: '',
  contact_name: '',
  contact_phone: '',
  email: '',
  address: '',
  city: '',
  postal_code: '',
  notes: '',
  type: 'both' as CompanyType,
};

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<CompanyWithExtras[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState(emptyForm);

  useEffect(() => {
    loadCompanies();
  }, []);

  const loadCompanies = async () => {
    try {
      setLoading(true);
      const data = await getCompanies();
      setCompanies(data as CompanyWithExtras[]);
    } catch (error) {
      console.error('Error loading companies:', error);
      alert('Could not load companies.');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData(emptyForm);
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    try {
      const cleanedNotes = formData.notes.trim();
      const hasAddedCompanyInfo = Boolean(
        formData.contact_name.trim() ||
          formData.contact_phone.trim() ||
          formData.email.trim() ||
          formData.address.trim() ||
          formData.city.trim() ||
          formData.postal_code.trim()
      );
      const shouldClearAutoNote =
        hasAddedCompanyInfo && AUTO_COMPANY_NOTES.includes(cleanedNotes);

      const payload = {
        ...formData,
        name: formData.name.trim(),
        contact_name: formData.contact_name.trim() || null,
        contact_phone: formData.contact_phone.trim() || null,
        email: formData.email.trim() || null,
        address: formData.address.trim() || null,
        city: formData.city.trim() || null,
        postal_code: formData.postal_code.trim() || null,
        notes: shouldClearAutoNote ? null : cleanedNotes || null,
      };

      if (editingId) {
        await updateCompany(editingId, payload as any);
      } else {
        await createCompany(payload as any);
      }

      resetForm();
      await loadCompanies();
    } catch (error) {
      console.error('Error saving company:', error);
      alert('Could not save company.');
    }
  };

  const handleEdit = (company: CompanyWithExtras) => {
    setFormData({
      name: company.name || '',
      contact_name: company.contact_name || '',
      contact_phone: company.contact_phone || '',
      email: company.email || '',
      address: company.address || '',
      city: company.city || '',
      postal_code: company.postal_code || '',
      notes: company.notes || '',
      type: company.type || 'both',
    });

    setEditingId(company.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this company?')) {
      return;
    }

    try {
      await deleteCompany(id);
      await loadCompanies();
    } catch (error) {
      console.error('Error deleting company:', error);
      alert('Could not delete company.');
    }
  };

  return (
    <MainLayout>
      <Header title="Companies" subtitle="Manage shippers and receivers" />

      <div className="mb-6 flex items-center justify-between">
        <div />

        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="h-5 w-5" />
          Add Company
        </button>
      </div>

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
            className="custom-board-scrollbar max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-300 bg-white p-6 shadow-2xl dark:border-dark-border dark:bg-dark-card sm:p-8"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-slate-950 dark:text-white">
                  {editingId ? 'Edit Company' : 'Add Company'}
                </h2>

                <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Save shipper, receiver, contact, and address details for dispatch forms.
                </p>
              </div>

              <button
                type="button"
                onClick={resetForm}
                className="text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white"
                aria-label="Close form"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Company Name
                </label>
                <input
                  className="input-field"
                  placeholder="Company Name"
                  value={formData.name}
                  onChange={(event) =>
                    setFormData({ ...formData, name: event.target.value })
                  }
                  required
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Contact Name
                  </label>
                  <input
                    className="input-field"
                    placeholder="Contact Name"
                    value={formData.contact_name}
                    onChange={(event) =>
                      setFormData({
                        ...formData,
                        contact_name: event.target.value,
                      })
                    }
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Contact Phone
                  </label>
                  <input
                    className="input-field"
                    placeholder="Contact Phone"
                    value={formData.contact_phone}
                    onChange={(event) =>
                      setFormData({
                        ...formData,
                        contact_phone: event.target.value,
                      })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Email
                  </label>
                  <input
                    className="input-field"
                    placeholder="Email"
                    value={formData.email}
                    onChange={(event) =>
                      setFormData({ ...formData, email: event.target.value })
                    }
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Company Type
                  </label>
                  <select
                    className="select-field"
                    value={formData.type}
                    onChange={(event) =>
                      setFormData({
                        ...formData,
                        type: event.target.value as 'shipper' | 'receiver' | 'both',
                      })
                    }
                  >
                    <option value="shipper">Shipper</option>
                    <option value="receiver">Receiver</option>
                    <option value="both">Both</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Address
                </label>
                <input
                  className="input-field"
                  placeholder="Address"
                  value={formData.address}
                  onChange={(event) =>
                    setFormData({ ...formData, address: event.target.value })
                  }
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    City
                  </label>
                  <input
                    className="input-field"
                    placeholder="City"
                    value={formData.city}
                    onChange={(event) =>
                      setFormData({ ...formData, city: event.target.value })
                    }
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Postal Code
                  </label>
                  <input
                    className="input-field"
                    placeholder="Postal Code"
                    value={formData.postal_code}
                    onChange={(event) =>
                      setFormData({
                        ...formData,
                        postal_code: event.target.value,
                      })
                    }
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Notes
                </label>
                <textarea
                  className="input-field"
                  placeholder="Notes"
                  rows={3}
                  value={formData.notes}
                  onChange={(event) =>
                    setFormData({ ...formData, notes: event.target.value })
                  }
                />
              </div>

              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={resetForm}
                  className="btn-secondary"
                >
                  Cancel
                </button>

                <button type="submit" className="btn-primary">
                  {editingId ? 'Update Company' : 'Create Company'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="card">
        <div className="mb-5 flex flex-col gap-2 border-b border-slate-300 pb-5 dark:border-dark-border sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-black text-slate-950 dark:text-white">
              Companies
            </h3>

            <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
              {companies.length} saved compan{companies.length === 1 ? 'y' : 'ies'}
            </p>
          </div>
        </div>

        {loading ? (
          <p className="font-medium text-slate-700 dark:text-slate-300">Loading...</p>
        ) : companies.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-400 bg-slate-50 p-8 text-center dark:border-dark-border dark:bg-slate-900/50">
            <p className="text-base font-black text-slate-950 dark:text-white">
              No companies yet.
            </p>

            <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
              Add companies here so they can be reused on pickups, work orders, and routes.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {companies.map((company) => (
              <div
                key={company.id}
                className="flex flex-col gap-3 rounded-xl border-2 border-slate-300 bg-white p-4 shadow-sm transition hover:border-slate-500 hover:bg-slate-50 dark:border-dark-border dark:bg-slate-800 dark:hover:bg-slate-700/70 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-base font-black text-slate-950 dark:text-white">
                      {company.name}
                    </p>

                    {company.type && (
                      <span className="rounded-full border border-blue-300 bg-blue-100 px-2 py-0.5 text-[11px] font-black uppercase tracking-wide text-blue-700 dark:bg-blue-950 dark:text-blue-200">
                        {company.type}
                      </span>
                    )}
                  </div>

                  <p className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-300">
                    {[company.city, company.contact_name, company.contact_phone]
                      .filter(Boolean)
                      .join(' • ') || 'No contact details saved'}
                  </p>

                  {(company.address || company.postal_code) && (
                    <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-400">
                      {[company.address, company.postal_code]
                        .filter(Boolean)
                        .join(' • ')}
                    </p>
                  )}
                </div>

                <div className="flex gap-2 sm:flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => handleEdit(company)}
                    className="rounded-lg border border-blue-200 bg-blue-50 p-2 text-blue-700 transition hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950"
                    title="Edit company"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(company.id)}
                    className="rounded-lg border border-red-200 bg-red-50 p-2 text-red-700 transition hover:bg-red-100 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950"
                    title="Delete company"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}