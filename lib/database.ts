import { supabase } from './supabase';
import { Shipment, Truck, TruckAssignment, ShipmentStatus, TruckStatus, Company } from '@/types';

function logSupabaseError(label: string, error: any) {
  try {
    if (!error) return console.error(label, error);
    if (error instanceof Error) return console.error(label, error.message, error);

    // Log a small, safe subset of common Supabase/PostgREST error fields.
    const safe: Record<string, any> = {};
    const keys = ['message', 'code', 'status', 'details', 'hint', 'table', 'constraint'];
    for (const k of keys) {
      try {
        if ((error as any)[k] !== undefined) safe[k] = (error as any)[k];
      } catch (_) {
        // ignore
      }
    }

    // Fallback: try to stringify; if that fails, fall back to toString()
    let raw = undefined;
    try {
      raw = JSON.stringify(error);
    } catch (e) {
      try {
        raw = String(error);
      } catch (_) {
        raw = undefined;
      }
    }

    try {
      console.error(label, safe, raw);
    } catch (e) {
      console.error(label, String(error));
    }
  } catch (e) {
    try {
      console.error(label, String(error));
    } catch (_e) {
      // swallow
    }
  }
}

// ============ SHIPMENT FUNCTIONS ============

export async function createShipment(shipment: Omit<Shipment, 'id' | 'created_at' | 'updated_at'>): Promise<Shipment | null> {
  try {
    const { data, error } = await supabase
      .from('shipments')
      .insert([shipment])
      .select()
      .single();

    if (error) throw error;
    return data as Shipment;
  } catch (error) {
    logSupabaseError('Error creating shipment', error);
    return null;
  }
}

export async function getShipments(): Promise<Shipment[]> {
  try {
    const { data, error } = await supabase
      .from('shipments')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data as Shipment[]) || [];
  } catch (error) {
    logSupabaseError('Error fetching shipments', error);
    return [];
  }
}

export async function getShipmentById(id: string): Promise<Shipment | null> {
  try {
    const { data, error } = await supabase
      .from('shipments')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data as Shipment;
  } catch (error) {
    logSupabaseError('Error fetching shipment', error);
    return null;
  }
}

export async function updateShipmentStatus(id: string, status: ShipmentStatus): Promise<Shipment | null> {
  try {
    const { data, error } = await supabase
      .from('shipments')
      .update({ 
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as Shipment;
  } catch (error) {
    logSupabaseError('Error updating shipment status', error);
    return null;
  }
}

export async function updateShipment(id: string, updates: Partial<Shipment>): Promise<Shipment | null> {
  try {
    const { data, error } = await supabase
      .from('shipments')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as Shipment;
  } catch (error) {
    logSupabaseError('Error updating shipment', error);
    return null;
  }
}

export async function deleteShipment(id: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('shipments')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  } catch (error) {
    logSupabaseError('Error deleting shipment', error);
    return false;
  }
}

export async function getShipmentsByStatus(status: ShipmentStatus): Promise<Shipment[]> {
  try {
    const { data, error } = await supabase
      .from('shipments')
      .select('*')
      .eq('status', status)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data as Shipment[]) || [];
  } catch (error) {
    logSupabaseError('Error fetching shipments by status', error);
    return [];
  }
}

export async function getUnassignedShipments(): Promise<Shipment[]> {
  try {
    const { data, error } = await supabase
      .from('shipments')
      .select('*')
      .is('assigned_truck_id', null)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data as Shipment[]) || [];
  } catch (error) {
    logSupabaseError('Error fetching unassigned shipments', error);
    return [];
  }
}

// ============ TRUCK FUNCTIONS ============

export async function createTruck(truck: Omit<Truck, 'id' | 'created_at' | 'updated_at'>): Promise<Truck | null> {
  try {
    const { data, error } = await supabase
      .from('trucks')
      .insert([truck])
      .select()
      .single();

    if (error) throw error;
    return data as Truck;
  } catch (error) {
    logSupabaseError('Error creating truck', error);
    return null;
  }
}

export async function getTrucks(): Promise<Truck[]> {
  try {
    const { data, error } = await supabase
      .from('trucks')
      .select('*')
      .order('truck_number', { ascending: true });

    if (error) throw error;
    return (data as Truck[]) || [];
  } catch (error) {
    logSupabaseError('Error fetching trucks', error);
    return [];
  }
}

export async function getTruckById(id: string): Promise<Truck | null> {
  try {
    const { data, error } = await supabase
      .from('trucks')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data as Truck;
  } catch (error) {
    logSupabaseError('Error fetching truck', error);
    return null;
  }
}

export async function updateTruck(id: string, updates: Partial<Truck>): Promise<Truck | null> {
  try {
    const { data, error } = await supabase
      .from('trucks')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as Truck;
  } catch (error) {
    logSupabaseError('Error updating truck', error);
    return null;
  }
}

export async function updateTruckStatus(id: string, status: TruckStatus): Promise<Truck | null> {
  try {
    const { data, error } = await supabase
      .from('trucks')
      .update({ 
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as Truck;
  } catch (error) {
    logSupabaseError('Error updating truck status', error);
    return null;
  }
}

export async function deleteTruck(id: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('trucks')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  } catch (error) {
    logSupabaseError('Error deleting truck', error);
    return false;
  }
}

export async function getTrucksByStatus(status: TruckStatus): Promise<Truck[]> {
  try {
    const { data, error } = await supabase
      .from('trucks')
      .select('*')
      .eq('status', status)
      .order('truck_number', { ascending: true });

    if (error) throw error;
    return (data as Truck[]) || [];
  } catch (error) {
    logSupabaseError('Error fetching trucks by status', error);
    return [];
  }
}

// ============ TRUCK ASSIGNMENT FUNCTIONS ============

export async function assignShipmentToTruck(shipmentId: string, truckId: string): Promise<TruckAssignment | null> {
  try {
    const assignment: Omit<TruckAssignment, 'id' | 'created_at' | 'updated_at'> = {
      truck_id: truckId,
      shipment_id: shipmentId,
      assigned_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('truck_assignments')
      .insert([assignment])
      .select()
      .single();

    if (error) throw error;
    
    // Update shipment with truck assignment
    await updateShipment(shipmentId, {
      assigned_truck_id: truckId,
      assigned_at: new Date().toISOString(),
    });

    return data as TruckAssignment;
  } catch (error) {
    logSupabaseError('Error assigning shipment to truck', error);
    return null;
  }
}

export async function getAssignmentsByTruck(truckId: string): Promise<TruckAssignment[]> {
  try {
    const { data, error } = await supabase
      .from('truck_assignments')
      .select('*')
      .eq('truck_id', truckId)
      .order('assigned_at', { ascending: false });

    if (error) throw error;
    return (data as TruckAssignment[]) || [];
  } catch (error) {
    logSupabaseError('Error fetching assignments by truck', error);
    return [];
  }
}

export async function getAssignmentsByShipment(shipmentId: string): Promise<TruckAssignment | null> {
  try {
    const { data, error } = await supabase
      .from('truck_assignments')
      .select('*')
      .eq('shipment_id', shipmentId)
      .single();

    if (error) throw error;
    return data as TruckAssignment;
  } catch (error) {
    logSupabaseError('Error fetching assignment by shipment', error);
    return null;
  }
}

export async function removeAssignmentFromTruck(assignmentId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('truck_assignments')
      .delete()
      .eq('id', assignmentId);

    if (error) throw error;
    return true;
  } catch (error) {
    logSupabaseError('Error removing assignment', error);
    return false;
  }
}

export async function getTruckSkidCount(truckId: string): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('truck_assignments')
      .select('shipment_id')
      .eq('truck_id', truckId);

    if (error) throw error;

    // Sum up skids from all assigned shipments
    let totalSkids = 0;
    for (const assignment of data || []) {
      const shipment = await getShipmentById(assignment.shipment_id);
      if (shipment) {
        totalSkids += shipment.number_of_skids;
      }
    }

    return totalSkids;
  } catch (error) {
    logSupabaseError('Error getting truck skid count', error);
    return 0;
  }
}

// ============ COMPANY FUNCTIONS ============

export async function createCompany(company: Omit<Company, 'id' | 'created_at' | 'updated_at'>): Promise<Company | null> {
  try {
    const { data, error } = await supabase
      .from('companies')
      .insert([company])
      .select()
      .single();

    if (error) throw error;
    return data as Company;
  } catch (error) {
    logSupabaseError('Error creating company', error);
    return null;
  }
}

export async function getCompanies(): Promise<Company[]> {
  try {
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;
    return (data as Company[]) || [];
  } catch (error) {
    logSupabaseError('Error fetching companies', error);
    return [];
  }
}

export async function getCompanyById(id: string): Promise<Company | null> {
  try {
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data as Company;
  } catch (error) {
    logSupabaseError('Error fetching company', error);
    return null;
  }
}

export async function updateCompany(id: string, updates: Partial<Company>): Promise<Company | null> {
  try {
    const { data, error } = await supabase
      .from('companies')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as Company;
  } catch (error) {
    logSupabaseError('Error updating company', error);
    return null;
  }
}

export async function deleteCompany(id: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('companies')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  } catch (error) {
    logSupabaseError('Error deleting company', error);
    return false;
  }
}

export async function searchCompanies(query: string): Promise<Company[]> {
  try {
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .ilike('name', `%${query}%`)
      .order('name', { ascending: true });

    if (error) throw error;
    return (data as Company[]) || [];
  } catch (error) {
    logSupabaseError('Error searching companies', error);
    return [];
  }
}
