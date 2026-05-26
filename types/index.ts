export type ShipmentStatus =
  | 'pending'
  | 'picked_up'
  | 'at_cross_dock'
  | 'out_for_delivery'
  | 'delivered';

export type TruckStatus =
  | 'available'
  | 'loaded'
  | 'out_for_delivery'
  | 'maintenance';

export type BoardStopType =
  | 'delivery'
  | 'pickup'
  | 'pickup_and_delivery'
  | 'cross_dock'
  | 'warehouse';

export type ServiceType =
  | 'ltl'
  | 'ftl'
  | 'pickup'
  | 'delivery'
  | 'cross_dock'
  | 'warehouse'
  | 'courier'
  | 'other';

export type PriorityLevel =
  | 'normal'
  | 'hot'
  | 'urgent'
  | 'hold';

export type InvoiceStatus =
  | 'not_ready'
  | 'ready'
  | 'invoiced'
  | 'paid'
  | 'do_not_invoice';

export type WorkOrderStatus =
  | 'open'
  | 'on_hold'
  | 'completed'
  | 'cancelled';

export interface WorkOrder {
  id: string;

  work_order_number: string;

  customer_company_name?: string | null;
  bill_to_company_name?: string | null;

  customer_reference?: string | null;
  pickup_reference?: string | null;
  delivery_reference?: string | null;

  service_type?: ServiceType | string | null;
  priority_level?: PriorityLevel | string | null;

  pickup_company_name?: string | null;
  pickup_address?: string | null;
  pickup_city?: string | null;
  pickup_postal_code?: string | null;
  pickup_date?: string | null;
  pickup_time?: string | null;
  pickup_contact_name?: string | null;
  pickup_contact_phone?: string | null;

  delivery_company_name?: string | null;
  delivery_address?: string | null;
  delivery_city?: string | null;
  delivery_postal_code?: string | null;
  delivery_date?: string | null;
  delivery_time?: string | null;
  delivery_contact_name?: string | null;
  delivery_contact_phone?: string | null;

  number_of_skids?: number | null;
  weight_lbs?: number | null;
  dimensions?: string | null;

  board_name?: string | null;
  board_note?: string | null;
  board_stop_type?: BoardStopType | string | null;

  special_instructions?: string | null;
  internal_notes?: string | null;
  billing_notes?: string | null;

  ready_to_invoice?: boolean | null;
  invoice_status?: InvoiceStatus | string | null;

  pod_received?: boolean | null;
  pod_received_at?: string | null;

  status?: WorkOrderStatus | string | null;

  created_at: string;
  updated_at: string;
}

export interface Shipment {
  id: string;

  work_order_id?: string | null;
  work_order_number?: string | null;

  customer_company_name?: string | null;
  bill_to_company_name?: string | null;
  customer_reference?: string | null;
  pickup_reference?: string | null;
  delivery_reference?: string | null;

  service_type?: ServiceType | string | null;
  priority_level?: PriorityLevel | string | null;

  internal_notes?: string | null;

  ready_to_invoice?: boolean | null;
  invoice_status?: InvoiceStatus | string | null;

  pod_received?: boolean | null;
  pod_received_at?: string | null;

  dispatch_task_type?: string | null;
  dispatch_status?: string | null;

  routing_locked?: boolean | null;
  suggested_truck_id?: string | null;
  routing_notes?: string | null;
  is_warehouse_delivery?: boolean | null;

  pickup_company_name: string | null;
  pickup_address: string | null;
  pickup_city: string | null;
  pickup_postal_code: string | null;
  pickup_date: string | null;
  pickup_time: string | null;
  pickup_contact_name: string | null;
  pickup_contact_phone: string | null;

  delivery_company_name: string | null;
  delivery_address: string | null;
  delivery_city: string | null;
  delivery_postal_code: string | null;
  delivery_date: string | null;
  delivery_time: string | null;
  delivery_contact_name: string | null;
  delivery_contact_phone: string | null;

  delivery_latitude?: number | null;
  delivery_longitude?: number | null;
  delivery_geocoded_at?: string | null;

  number_of_skids: number | null;

  weight_lbs?: number | null;
  weight_kg?: number | null;

  dimensions?: string | null;
  notes?: string | null;

  board_name?: string | null;
  board_stop_type?: BoardStopType | string | null;
  board_note?: string | null;
  board_sort_order?: number | null;

  customs_docs_received?: boolean | null;
  stays_in_canada?: boolean | null;

  route_completed?: boolean | null;
  route_completed_at?: string | null;
  route_completed_by?: string | null;

  status: ShipmentStatus;
  assigned_truck_id?: string | null;
  assigned_at?: string | null;

  created_at: string;
  updated_at: string;
}

export interface Truck {
  id: string;
  truck_number: string;
  driver_name: string;
  capacity_skids: number;
  max_weight_lbs: number;
  current_route_area?: string | null;
  status: TruckStatus;
  created_at: string;
  updated_at: string;
}

export interface TruckAssignment {
  id: string;
  truck_id: string;
  shipment_id: string;
  assigned_at: string;
  created_at: string;
  updated_at: string;
}

export interface Company {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  notes?: string | null;
  is_shipper?: boolean | null;

  latitude?: number | null;
  longitude?: number | null;
  country?: string | null;
  geocoded_at?: string | null;

  created_at: string;
  updated_at: string;
}