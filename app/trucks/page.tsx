'use client';

import { useEffect, useState } from 'react';
import MainLayout from '@/components/MainLayout';
import Header from '@/components/Header';
import { Edit2, Plus, Trash2, X } from 'lucide-react';
import {
  createTruck,
  deleteTruck,
  getAssignmentsByTruck,
  getShipmentById,
  getTrucks,
  updateTruck,
  updateTruckStatus,
} from '@/lib/database';
import { Shipment, Truck, TruckStatus } from '@/types';

interface TruckWithStats extends Truck {
  assigned_skids: number;
  available_skids: number;
  assigned_weight_lbs: number;
  available_weight_lbs: number;
  assigned_shipments: number;
}

const DEFAULT_SKID_CAPACITY = 12;
const DEFAULT_WEIGHT_CAPACITY_LBS = 15000;

export default function TrucksPage() {
  const [trucksWithStats, setTrucksWithStats] = useState<TruckWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<TruckStatus | 'all'>('all');

  const [formData, setFormData] = useState({
    truck_number: '',
    driver_name: '',
    capacity_skids: DEFAULT_SKID_CAPACITY,
    max_weight_lbs: DEFAULT_WEIGHT_CAPACITY_LBS,
    current_route_area: '',
  });

  useEffect(() => {
    loadTrucks();
  }, []);

  const loadTrucks = async () => {
    try {
      setLoading(true);

      const trucks = await getTrucks();

      const trucksWithData = await Promise.all(
        trucks.map(async (truck) => {
          const assignments = await getAssignmentsByTruck(truck.id);

          const assignedShipments = await Promise.all(
            assignments.map(async (assignment) => {
              return await getShipmentById(assignment.shipment_id);
            })
          );

          const validShipments = assignedShipments.filter(
            (shipment): shipment is Shipment => shipment !== null
          );

          const assignedSkids = validShipments.reduce(
            (sum, shipment) => sum + Number(shipment.number_of_skids || 0),
            0
          );

          const assignedWeight = validShipments.reduce(
            (sum, shipment) =>
              sum + Number(shipment.weight_lbs || shipment.weight_kg || 0),
            0
          );

          const maxWeight = truck.max_weight_lbs || DEFAULT_WEIGHT_CAPACITY_LBS;

          return {
            ...truck,
            capacity_skids: truck.capacity_skids || DEFAULT_SKID_CAPACITY,
            max_weight_lbs: maxWeight,
            assigned_skids: assignedSkids,
            available_skids:
              (truck.capacity_skids || DEFAULT_SKID_CAPACITY) - assignedSkids,
            assigned_weight_lbs: assignedWeight,
            available_weight_lbs: maxWeight - assignedWeight,
            assigned_shipments: validShipments.length,
          };
        })
      );

      setTrucksWithStats(trucksWithData);
    } catch (error) {
      console.error('Error loading trucks:', error);
      alert('Could not load trucks.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    try {
      setSaving(true);

      const payload = {
        truck_number: formData.truck_number.trim(),
        driver_name: formData.driver_name.trim() || 'Unassigned',
        capacity_skids: Math.min(
          DEFAULT_SKID_CAPACITY,
          Math.max(1, Number(formData.capacity_skids || DEFAULT_SKID_CAPACITY))
        ),
        max_weight_lbs: Math.min(
          DEFAULT_WEIGHT_CAPACITY_LBS,
          Math.max(1, Number(formData.max_weight_lbs || DEFAULT_WEIGHT_CAPACITY_LBS))
        ),
        current_route_area: formData.current_route_area.trim(),
      };

      if (editingId) {
        await updateTruck(editingId, payload as Partial<Truck>);
      } else {
        await createTruck({
          ...payload,
          status: 'available',
        } as Omit<Truck, 'id' | 'created_at' | 'updated_at'>);
      }

      resetForm();
      await loadTrucks();
    } catch (error) {
      console.error('Error saving truck:', error);
      alert('Truck could not be saved. Check the console for details.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (truck: TruckWithStats) => {
    setFormData({
      truck_number: truck.truck_number,
      driver_name: truck.driver_name,
      capacity_skids: truck.capacity_skids || DEFAULT_SKID_CAPACITY,
      max_weight_lbs: truck.max_weight_lbs || DEFAULT_WEIGHT_CAPACITY_LBS,
      current_route_area: truck.current_route_area || '',
    });

    setEditingId(truck.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this truck?')) {
      return;
    }

    try {
      await deleteTruck(id);
      await loadTrucks();
    } catch (error) {
      console.error('Error deleting truck:', error);
      alert('Truck could not be deleted. Check the console for details.');
    }
  };

  const handleStatusChange = async (id: string, newStatus: TruckStatus) => {
    try {
      await updateTruckStatus(id, newStatus);
      await loadTrucks();
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Truck status could not be updated. Check the console for details.');
    }
  };

  const resetForm = () => {
    setFormData({
      truck_number: '',
      driver_name: '',
      capacity_skids: DEFAULT_SKID_CAPACITY,
      max_weight_lbs: DEFAULT_WEIGHT_CAPACITY_LBS,
      current_route_area: '',
    });

    setEditingId(null);
    setShowForm(false);
  };

  const filteredTrucks = trucksWithStats.filter((truck) => {
    const lowerSearch = searchTerm.toLowerCase();

    const matchesSearch =
      truck.truck_number.toLowerCase().includes(lowerSearch) ||
      truck.driver_name.toLowerCase().includes(lowerSearch) ||
      (truck.current_route_area || '').toLowerCase().includes(lowerSearch);

    const matchesStatus = statusFilter === 'all' || truck.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <MainLayout>
      <Header
        title="Trucks"
        subtitle="Manage units, rentals, drivers, skid capacity, and weight capacity"
      />

      <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm dark:border-blue-900 dark:bg-blue-950/60 dark:shadow-none">
        <p className="text-sm text-blue-900 dark:text-blue-100">
          Company rule: each truck maxes out at{' '}
          <span className="font-bold">12 skids</span> and{' '}
          <span className="font-bold">15,000 lbs</span>.
        </p>
      </div>

      <div className="page-actions">
        <div className="page-actions-left">
          <input
            type="text"
            placeholder="Search by unit, driver, or area..."
            className="input-field max-w-md"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />

          <select
            className="select-field max-w-xs"
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as TruckStatus | 'all')
            }
          >
            <option value="all">All Status</option>
            <option value="available">Available</option>
            <option value="loaded">Loaded</option>
            <option value="out_for_delivery">Out for Delivery</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </div>

        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="btn-primary flex items-center justify-center gap-2"
        >
          <Plus className="h-5 w-5" />
          Add Truck / Rental
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
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-dark-border dark:bg-dark-card"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-slate-950 dark:text-white">
                  {editingId ? 'Edit Truck' : 'Add Truck / Rental'}
                </h2>

                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  Unit name and driver can change anytime.
                </p>
              </div>

              <button
                type="button"
                onClick={resetForm}
                className="text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white"
                aria-label="Close form"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Unit / Truck Name
                </label>

                <input
                  type="text"
                  placeholder="e.g. Unit 11, Rental 1"
                  className="input-field"
                  value={formData.truck_number}
                  onChange={(event) =>
                    setFormData({ ...formData, truck_number: event.target.value })
                  }
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Assigned Driver
                </label>

                <input
                  type="text"
                  placeholder="e.g. John Smith, Unassigned"
                  className="input-field"
                  value={formData.driver_name}
                  onChange={(event) =>
                    setFormData({ ...formData, driver_name: event.target.value })
                  }
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Skid Capacity
                </label>

                <input
                  type="number"
                  className="input-field"
                  value={formData.capacity_skids}
                  onChange={(event) =>
                    setFormData({
                      ...formData,
                      capacity_skids: Number(event.target.value),
                    })
                  }
                  min="1"
                  max={DEFAULT_SKID_CAPACITY}
                />

                <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                  Max allowed: {DEFAULT_SKID_CAPACITY} skids
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Weight Capacity LBS
                </label>

                <input
                  type="number"
                  className="input-field"
                  value={formData.max_weight_lbs}
                  onChange={(event) =>
                    setFormData({
                      ...formData,
                      max_weight_lbs: Number(event.target.value),
                    })
                  }
                  min="1"
                  max={DEFAULT_WEIGHT_CAPACITY_LBS}
                />

                <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                  Max allowed: {DEFAULT_WEIGHT_CAPACITY_LBS.toLocaleString()} lbs
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Current Route / Area
                </label>

                <input
                  type="text"
                  placeholder="e.g. Niagara, Toronto, Hamilton"
                  className="input-field"
                  value={formData.current_route_area}
                  onChange={(event) =>
                    setFormData({
                      ...formData,
                      current_route_area: event.target.value,
                    })
                  }
                />
              </div>

              <div className="flex flex-col-reverse gap-3 pt-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={resetForm}
                  className="btn-secondary"
                  disabled={saving}
                >
                  Cancel
                </button>

                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : editingId ? 'Update Truck' : 'Add Truck'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="card">
          <p className="text-slate-600 dark:text-slate-400">Loading trucks...</p>
        </div>
      ) : filteredTrucks.length === 0 ? (
        <div className="card text-center">
          <p className="text-slate-600 dark:text-slate-400">No trucks found.</p>
        </div>
      ) : (
        <div className="custom-board-scrollbar overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-soft dark:border-dark-border dark:bg-dark-card dark:shadow-soft-dark">
          <table className="status-table">
            <thead>
              <tr>
                <th>Unit</th>
                <th>Driver</th>
                <th>Skids</th>
                <th>Weight</th>
                <th>Route / Area</th>
                <th>Status</th>
                <th>Shipments</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredTrucks.map((truck) => {
                const skidPercent =
                  truck.capacity_skids > 0
                    ? Math.round((truck.assigned_skids / truck.capacity_skids) * 100)
                    : 0;

                const weightPercent =
                  truck.max_weight_lbs > 0
                    ? Math.round(
                        (truck.assigned_weight_lbs / truck.max_weight_lbs) * 100
                      )
                    : 0;

                return (
                  <tr key={truck.id}>
                    <td>
                      <p className="font-bold text-slate-950 dark:text-white">
                        {truck.truck_number}
                      </p>
                    </td>

                    <td>{truck.driver_name || 'Unassigned'}</td>

                    <td>
                      <div>
                        <p className="font-semibold text-slate-950 dark:text-white">
                          {truck.assigned_skids}/{truck.capacity_skids}
                        </p>

                        <p
                          className={`text-xs font-medium ${
                            truck.available_skids <= 0
                              ? 'text-red-600 dark:text-red-400'
                              : truck.available_skids <= 3
                                ? 'text-amber-600 dark:text-yellow-400'
                                : 'text-green-700 dark:text-green-400'
                          }`}
                        >
                          {truck.available_skids} skids left • {skidPercent}% full
                        </p>
                      </div>
                    </td>

                    <td>
                      <div>
                        <p className="font-semibold text-slate-950 dark:text-white">
                          {truck.assigned_weight_lbs.toLocaleString()}/
                          {truck.max_weight_lbs.toLocaleString()} lbs
                        </p>

                        <p
                          className={`text-xs font-medium ${
                            truck.available_weight_lbs <= 0
                              ? 'text-red-600 dark:text-red-400'
                              : truck.available_weight_lbs <= 3000
                                ? 'text-amber-600 dark:text-yellow-400'
                                : 'text-green-700 dark:text-green-400'
                          }`}
                        >
                          {truck.available_weight_lbs.toLocaleString()} lbs left •{' '}
                          {weightPercent}% full
                        </p>
                      </div>
                    </td>

                    <td>{truck.current_route_area || '—'}</td>

                    <td>
                      <select
                        className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-dark-border dark:bg-slate-800 dark:text-white"
                        value={truck.status}
                        onChange={(event) =>
                          handleStatusChange(
                            truck.id,
                            event.target.value as TruckStatus
                          )
                        }
                      >
                        <option value="available">Available</option>
                        <option value="loaded">Loaded</option>
                        <option value="out_for_delivery">Out for Delivery</option>
                        <option value="maintenance">Maintenance</option>
                      </select>
                    </td>

                    <td className="text-center">{truck.assigned_shipments}</td>

                    <td>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleEdit(truck)}
                          className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                          title="Edit truck"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDelete(truck.id)}
                          className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                          title="Delete truck"
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

      {trucksWithStats.some(
        (truck) => truck.available_skids < 0 || truck.available_weight_lbs < 0
      ) && (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm dark:border-red-700 dark:bg-red-950">
          <p className="text-red-800 dark:text-red-200">
            ⚠️ One or more trucks are over capacity. Check both skid count and total weight.
          </p>
        </div>
      )}
    </MainLayout>
  );
}