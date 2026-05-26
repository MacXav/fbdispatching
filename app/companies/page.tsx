'use client';

import { useEffect, useState } from 'react';
import MainLayout from '@/components/MainLayout';
import Header from '@/components/Header';
import { Plus, Edit2, Trash2, X } from 'lucide-react';
import { createCompany, getCompanies, updateCompany, deleteCompany } from '@/lib/database';
import { Company } from '@/types';

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    contact_name: '',
    contact_phone: '',
    email: '',
    address: '',
    city: '',
    postal_code: '',
    notes: '',
    type: 'both' as 'shipper' | 'receiver' | 'both',
  });

  useEffect(() => {
    loadCompanies();
  }, []);

  const loadCompanies = async () => {
    try {
      setLoading(true);
      const data = await getCompanies();
      setCompanies(data);
    } catch (error) {
      console.error('Error loading companies:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (editingId) {
        await updateCompany(editingId, formData as any);
      } else {
        await createCompany(formData as any);
      }
      setShowForm(false);
      setEditingId(null);
      await loadCompanies();
    } catch (error) {
      console.error('Error saving company:', error);
    }
  };

  const handleEdit = (company: Company) => {
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
    if (confirm('Delete this company?')) {
      await deleteCompany(id);
      await loadCompanies();
    }
  };

  return (
    <MainLayout>
      <Header title="Companies" subtitle="Manage shippers and receivers" />

      <div className="flex justify-between items-center mb-6">
        <div />
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-5 h-5" />
          Add Company
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-card border border-dark-border rounded-lg p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-white">{editingId ? 'Edit Company' : 'Add Company'}</h2>
              <button onClick={() => { setShowForm(false); setEditingId(null); }} className="text-slate-400 hover:text-white"><X className="w-6 h-6" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <input className="input-field" placeholder="Company Name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
              <div className="grid grid-cols-2 gap-4">
                <input className="input-field" placeholder="Contact Name" value={formData.contact_name} onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })} />
                <input className="input-field" placeholder="Contact Phone" value={formData.contact_phone} onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <input className="input-field" placeholder="Email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                <select className="select-field" value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}>
                  <option value="shipper">Shipper</option>
                  <option value="receiver">Receiver</option>
                  <option value="both">Both</option>
                </select>
              </div>
              <input className="input-field" placeholder="Address" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} />
              <div className="grid grid-cols-2 gap-4">
                <input className="input-field" placeholder="City" value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} />
                <input className="input-field" placeholder="Postal Code" value={formData.postal_code} onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })} />
              </div>
              <textarea className="input-field" placeholder="Notes" rows={3} value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />

              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary">{editingId ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="card">
        <h3 className="text-lg font-bold text-white mb-4">Companies</h3>
        {loading ? (
          <p className="text-slate-400">Loading...</p>
        ) : companies.length === 0 ? (
          <p className="text-slate-400">No companies yet.</p>
        ) : (
          <div className="space-y-2">
            {companies.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-3 bg-slate-800 rounded-lg border border-dark-border">
                <div>
                  <p className="font-semibold text-white">{c.name}</p>
                  <p className="text-xs text-slate-400">{c.city} • {c.contact_name} • {c.contact_phone}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleEdit(c)} className="text-blue-400 hover:text-blue-300"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={() => handleDelete(c.id)} className="text-red-400 hover:text-red-300"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
