'use client';

import { DragEvent, KeyboardEvent, type CSSProperties, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import MainLayout from '@/components/MainLayout';
import AutocompleteField, { AutocompleteItem } from '@/components/AutocompleteField';
import {
  Check,
  ClipboardList,
  Edit2,
  FileText,
  GripVertical,
  Plus,
  RefreshCw,
  Truck as TruckIcon,
  User,
  X,
} from 'lucide-react';
import {
  createShipment,
  getCompanies,
  getShipments,
  getTrucks,
  updateShipment,
  updateShipmentStatus,
} from '@/lib/database';
import { supabase } from '@/lib/supabase';
import { BoardStopType, Company, Shipment, Truck } from '@/types';
import {
  BoardDisplaySettings,
  loadBoardDisplaySettings,
} from '@/lib/boardDisplaySettings';

interface TruckBoardColumn {
  truck: Truck;
  shipments: Shipment[];
  totalSkids: number;
  totalWeightLbs: number;
  remainingSkids: number;
  remainingWeightLbs: number;
}

interface DraggedBoardItem {
  shipmentId: string;
  sourceColumnKey: string;
}

interface PickupEditForm {
  pickup_company_id: string;
  delivery_company_id: string;
  board_name: string;
  board_stop_type: BoardStopType;
  number_of_skids: string;
  weight_lbs: string;
  board_note: string;
  customs_docs_received: boolean;
  stays_in_canada: boolean;
}

const DEFAULT_SKID_CAPACITY = 12;
const DEFAULT_WEIGHT_CAPACITY_LBS = 15000;
const PICKUP_COLUMN_KEY = 'pickup';
const BOARD_ZOOM_STORAGE_KEY = 'dispatch_pro_dashboard_zoom';

const emptyPickupEditForm: PickupEditForm = {
  pickup_company_id: '',
  delivery_company_id: '',
  board_name: '',
  board_stop_type: 'pickup',
  number_of_skids: '',
  weight_lbs: '',
  board_note: '',
  customs_docs_received: false,
  stays_in_canada: false,
};

const BOARD_COLORS = [
  {
    header: 'bg-red-700 text-white',
    body: 'border-red-300/70',
    accent: 'text-red-200',
  },
  {
    header: 'bg-green-700 text-white',
    body: 'border-green-500/70',
    accent: 'text-green-300',
  },
  {
    header: 'bg-pink-700 text-white',
    body: 'border-pink-200/70',
    accent: 'text-pink-200',
  },
  {
    header: 'bg-orange-700 text-white',
    body: 'border-orange-500/70',
    accent: 'text-orange-300',
  },
  {
    header: 'bg-slate-700 text-white',
    body: 'border-slate-300/70',
    accent: 'text-slate-300',
  },
  {
    header: 'bg-rose-700 text-white',
    body: 'border-rose-500/70',
    accent: 'text-rose-300',
  },
];

const PICKUP_COLUMN_COLOR = {
  header: 'bg-blue-700 text-white',
  body: 'border-blue-300/70',
  accent: 'text-blue-300',
};

const stopTypeOptions: { value: BoardStopType; label: string }[] = [
  { value: 'delivery', label: 'Delivery' },
  { value: 'pickup', label: 'Pickup' },
  { value: 'pickup_and_delivery', label: 'Pickup + Delivery' },
  { value: 'cross_dock', label: 'Cross Dock' },
  { value: 'warehouse', label: 'Warehouse' },
];

export default function Dashboard() {
  const [truckColumns, setTruckColumns] = useState<TruckBoardColumn[]>([]);
  const [unassignedShipments, setUnassignedShipments] = useState<Shipment[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);

  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [clearingFinished, setClearingFinished] = useState(false);

  const [assigningShipment, setAssigningShipment] = useState<Shipment | null>(null);
  const [selectedTruckId, setSelectedTruckId] = useState('');

  const [editingPickup, setEditingPickup] = useState<Shipment | null>(null);
  const [pickupEditForm, setPickupEditForm] = useState<PickupEditForm>(emptyPickupEditForm);
  const [savingPickupEdit, setSavingPickupEdit] = useState(false);

  const [draggedItem, setDraggedItem] = useState<DraggedBoardItem | null>(null);
  const [dragOverShipmentId, setDragOverShipmentId] = useState<string | null>(null);
  const [dragOverColumnKey, setDragOverColumnKey] = useState<string | null>(null);
  const [dragDropPosition, setDragDropPosition] = useState<
    'before' | 'after' | 'end' | null
  >(null);

  const [boardDisplaySettings, setBoardDisplaySettings] = useState<BoardDisplaySettings>(
    loadBoardDisplaySettings()
  );
  const [boardZoom, setBoardZoom] = useState(100);

  useEffect(() => {
    loadBoardData();
  }, []);

  useEffect(() => {
    const savedZoom = Number(window.localStorage.getItem(BOARD_ZOOM_STORAGE_KEY));

    if (!Number.isNaN(savedZoom) && savedZoom >= 70 && savedZoom <= 130) {
      setBoardZoom(savedZoom);
    }
  }, []);

  useEffect(() => {
    const refreshSettings = () => {
      setBoardDisplaySettings(loadBoardDisplaySettings());
    };

    window.addEventListener('storage', refreshSettings);
    window.addEventListener('board-display-settings-updated', refreshSettings);

    return () => {
      window.removeEventListener('storage', refreshSettings);
      window.removeEventListener('board-display-settings-updated', refreshSettings);
    };
  }, []);

  const calculateColumnStats = (truck: Truck, shipments: Shipment[]) => {
    const capacitySkids = truck.capacity_skids || DEFAULT_SKID_CAPACITY;
    const maxWeightLbs = truck.max_weight_lbs || DEFAULT_WEIGHT_CAPACITY_LBS;

    const realFreightShipments = shipments.filter(
      (shipment) => shipment.dispatch_task_type !== 'board_stop'
    );

    const totalSkids = realFreightShipments.reduce(
      (sum, shipment) => sum + Number(shipment.number_of_skids || 0),
      0
    );

    const totalWeightLbs = realFreightShipments.reduce(
      (sum, shipment) =>
        sum + Number(shipment.weight_lbs || shipment.weight_kg || 0),
      0
    );

    return {
      truck: {
        ...truck,
        capacity_skids: capacitySkids,
        max_weight_lbs: maxWeightLbs,
      },
      totalSkids,
      totalWeightLbs,
      remainingSkids: capacitySkids - totalSkids,
      remainingWeightLbs: maxWeightLbs - totalWeightLbs,
    };
  };

  const rebuildTruckColumns = (columns: TruckBoardColumn[]) => {
    return columns.map((column) => {
      const stats = calculateColumnStats(column.truck, column.shipments);

      return {
        ...column,
        truck: stats.truck,
        totalSkids: stats.totalSkids,
        totalWeightLbs: stats.totalWeightLbs,
        remainingSkids: stats.remainingSkids,
        remainingWeightLbs: stats.remainingWeightLbs,
      };
    });
  };

  const loadBoardData = async () => {
    try {
      setLoading(true);

      const [trucksData, shipmentsData, companiesData] = await Promise.all([
        getTrucks(),
        getShipments(),
        getCompanies(),
      ]);

      setCompanies(companiesData);

      const columns = trucksData.map((truck) => {
        const validShipments = shipmentsData
          .filter((shipment) => shipment.status !== 'delivered')
          .filter((shipment) => shipment.assigned_truck_id === truck.id)
          .sort(sortShipmentsForBoard);

        const stats = calculateColumnStats(truck, validShipments);

        return {
          truck: stats.truck,
          shipments: validShipments,
          totalSkids: stats.totalSkids,
          totalWeightLbs: stats.totalWeightLbs,
          remainingSkids: stats.remainingSkids,
          remainingWeightLbs: stats.remainingWeightLbs,
        };
      });

      const todayDateKey = getTodayDateKey();

      const pickups = shipmentsData
        .filter((shipment) => !shipment.assigned_truck_id)
        .filter((shipment) => shipment.status === 'pending')
        .filter((shipment) => shipment.dispatch_task_type !== 'board_stop')
        .filter((shipment) => shouldShowOnTodayPickupBoard(shipment, todayDateKey))
        .sort(sortShipmentsForBoard);

      setTruckColumns(columns);
      setUnassignedShipments(pickups);
    } catch (error) {
      console.error('Error loading truck board:', error);
    } finally {
      setLoading(false);
    }
  };

  const allBoardShipments = useMemo(() => {
    return [
      ...unassignedShipments,
      ...truckColumns.flatMap((column) => column.shipments),
    ];
  }, [unassignedShipments, truckColumns]);

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

  const truckItemsForAssignment: AutocompleteItem[] = useMemo(() => {
    if (!assigningShipment) return [];

    const shipmentSkids = Number(assigningShipment.number_of_skids || 0);
    const shipmentWeight = Number(
      assigningShipment.weight_lbs || assigningShipment.weight_kg || 0
    );

    return truckColumns
      .filter((column) => {
        const truckUsable =
          column.truck.status === 'available' ||
          column.truck.status === 'loaded' ||
          column.truck.status === 'out_for_delivery';

        const hasSkidSpace =
          shipmentSkids <= 0 || column.remainingSkids >= shipmentSkids;

        const hasWeightSpace =
          shipmentWeight <= 0 || column.remainingWeightLbs >= shipmentWeight;

        return truckUsable && hasSkidSpace && hasWeightSpace;
      })
      .map((column) => ({
        id: column.truck.id,
        label: `${column.truck.truck_number} — ${column.truck.driver_name || 'Unassigned'}`,
        description: `${column.remainingSkids} skids left • ${column.remainingWeightLbs.toLocaleString()} lbs left • ${column.truck.current_route_area || 'No area set'}`,
        keywords: [
          column.truck.truck_number,
          column.truck.driver_name,
          column.truck.current_route_area,
          column.truck.status,
        ]
          .filter(Boolean)
          .join(' '),
      }));
  }, [assigningShipment, truckColumns]);

  const selectedPickupCompany = companies.find(
    (company) => company.id === pickupEditForm.pickup_company_id
  );

  const selectedDeliveryCompany = companies.find(
    (company) => company.id === pickupEditForm.delivery_company_id
  );

  const getColumnShipments = (columnKey: string) => {
    if (columnKey === PICKUP_COLUMN_KEY) {
      return unassignedShipments;
    }

    const column = truckColumns.find((item) => item.truck.id === columnKey);

    return column?.shipments || [];
  };

  const updateShipmentLocally = (shipmentId: string, updates: Partial<Shipment>) => {
    setUnassignedShipments((current) =>
      current.map((shipment) =>
        shipment.id === shipmentId ? { ...shipment, ...updates } : shipment
      )
    );

    setTruckColumns((current) =>
      rebuildTruckColumns(
        current.map((column) => ({
          ...column,
          shipments: column.shipments.map((shipment) =>
            shipment.id === shipmentId ? { ...shipment, ...updates } : shipment
          ),
        }))
      )
    );
  };

  const addShipmentToTruckLocally = (truckId: string, shipment: Shipment) => {
    setTruckColumns((current) =>
      rebuildTruckColumns(
        current.map((column) => {
          if (column.truck.id !== truckId) {
            return column;
          }

          return {
            ...column,
            shipments: [
              ...column.shipments,
              {
                ...shipment,
                assigned_truck_id: truckId,
              },
            ],
          };
        })
      )
    );
  };

  const applyMoveLocally = ({
    shipmentId,
    sourceColumnKey,
    targetColumnKey,
    targetBeforeShipmentId,
    assignedAt,
  }: {
    shipmentId: string;
    sourceColumnKey: string;
    targetColumnKey: string;
    targetBeforeShipmentId: string | null;
    assignedAt: string;
  }) => {
    const movedShipment = allBoardShipments.find((shipment) => shipment.id === shipmentId);

    if (!movedShipment) {
      return;
    }

    const movedToPickup = targetColumnKey === PICKUP_COLUMN_KEY;

    const updatedMovedShipment: Shipment = {
      ...movedShipment,
      assigned_truck_id: movedToPickup ? null : targetColumnKey,
      assigned_at: movedToPickup ? null : assignedAt,
      route_completed: false,
      route_completed_at: null,
      route_completed_by: null,
    };

    let nextUnassigned = unassignedShipments.filter(
      (shipment) => shipment.id !== shipmentId
    );

    let nextColumns = truckColumns.map((column) => ({
      ...column,
      shipments: column.shipments.filter((shipment) => shipment.id !== shipmentId),
    }));

    if (movedToPickup) {
      if (updatedMovedShipment.dispatch_task_type !== 'board_stop') {
        const beforeIndex = targetBeforeShipmentId
          ? nextUnassigned.findIndex((shipment) => shipment.id === targetBeforeShipmentId)
          : -1;

        if (beforeIndex >= 0) {
          nextUnassigned.splice(beforeIndex, 0, updatedMovedShipment);
        } else {
          nextUnassigned.push(updatedMovedShipment);
        }
      }
    } else {
      nextColumns = nextColumns.map((column) => {
        if (column.truck.id !== targetColumnKey) {
          return column;
        }

        const nextShipments = [...column.shipments];
        const beforeIndex = targetBeforeShipmentId
          ? nextShipments.findIndex((shipment) => shipment.id === targetBeforeShipmentId)
          : -1;

        if (beforeIndex >= 0) {
          nextShipments.splice(beforeIndex, 0, updatedMovedShipment);
        } else {
          nextShipments.push(updatedMovedShipment);
        }

        return {
          ...column,
          shipments: nextShipments,
        };
      });
    }

    nextUnassigned = nextUnassigned.map((shipment, index) => ({
      ...shipment,
      board_sort_order: (index + 1) * 10,
    }));

    nextColumns = nextColumns.map((column) => ({
      ...column,
      shipments: column.shipments.map((shipment, index) => ({
        ...shipment,
        board_sort_order: (index + 1) * 10,
      })),
    }));

    setUnassignedShipments(nextUnassigned);
    setTruckColumns(rebuildTruckColumns(nextColumns));
  };

  const checkTruckCapacityBeforeMove = (
    shipment: Shipment,
    sourceColumnKey: string,
    targetColumnKey: string
  ) => {
    if (
      shipment.dispatch_task_type === 'board_stop' ||
      targetColumnKey === PICKUP_COLUMN_KEY ||
      sourceColumnKey === targetColumnKey
    ) {
      return true;
    }

    const targetColumn = truckColumns.find((column) => column.truck.id === targetColumnKey);

    if (!targetColumn) {
      alert('Target truck was not found.');
      return false;
    }

    const shipmentSkids = Number(shipment.number_of_skids || 0);
    const shipmentWeight = Number(shipment.weight_lbs || shipment.weight_kg || 0);

    const currentTargetShipments = targetColumn.shipments
      .filter((item) => item.id !== shipment.id)
      .filter((item) => item.dispatch_task_type !== 'board_stop');

    const targetSkids = currentTargetShipments.reduce(
      (sum, item) => sum + Number(item.number_of_skids || 0),
      0
    );

    const targetWeight = currentTargetShipments.reduce(
      (sum, item) => sum + Number(item.weight_lbs || item.weight_kg || 0),
      0
    );

    if (shipmentSkids > 0 && targetSkids + shipmentSkids > targetColumn.truck.capacity_skids) {
      alert(
        `${targetColumn.truck.truck_number} does not have enough skid space for this move.`
      );
      return false;
    }

    if (
      shipmentWeight > 0 &&
      targetWeight + shipmentWeight > targetColumn.truck.max_weight_lbs
    ) {
      alert(
        `${targetColumn.truck.truck_number} does not have enough weight capacity for this move.`
      );
      return false;
    }

    return true;
  };

  const saveBoardMove = async ({
    shipmentId,
    sourceColumnKey,
    targetColumnKey,
    targetBeforeShipmentId,
  }: {
    shipmentId: string;
    sourceColumnKey: string;
    targetColumnKey: string;
    targetBeforeShipmentId: string | null;
  }) => {
    const movedShipment = allBoardShipments.find((shipment) => shipment.id === shipmentId);

    if (!movedShipment) {
      handleDragEnd();
      return;
    }

    if (
      movedShipment.dispatch_task_type === 'board_stop' &&
      targetColumnKey === PICKUP_COLUMN_KEY
    ) {
      alert('Route notes must stay on a truck route.');
      handleDragEnd();
      return;
    }

    if (!checkTruckCapacityBeforeMove(movedShipment, sourceColumnKey, targetColumnKey)) {
      handleDragEnd();
      return;
    }

    const previousTruckColumns = truckColumns;
    const previousUnassignedShipments = unassignedShipments;

    const sourceIds = getColumnShipments(sourceColumnKey)
      .map((shipment) => shipment.id)
      .filter((id) => id !== shipmentId);

    const targetIds =
      sourceColumnKey === targetColumnKey
        ? sourceIds
        : getColumnShipments(targetColumnKey)
            .map((shipment) => shipment.id)
            .filter((id) => id !== shipmentId);

    if (targetBeforeShipmentId) {
      const targetIndex = targetIds.indexOf(targetBeforeShipmentId);

      if (targetIndex === -1) {
        targetIds.push(shipmentId);
      } else {
        targetIds.splice(targetIndex, 0, shipmentId);
      }
    } else {
      targetIds.push(shipmentId);
    }

    const now = new Date().toISOString();

    applyMoveLocally({
      shipmentId,
      sourceColumnKey,
      targetColumnKey,
      targetBeforeShipmentId,
      assignedAt: now,
    });

    try {
      setUpdatingId('reordering');

      await syncTruckAssignment({
        shipmentId,
        targetColumnKey,
        assignedAt: now,
      });

      if (sourceColumnKey !== targetColumnKey) {
        for (let index = 0; index < sourceIds.length; index++) {
          await updateShipment(sourceIds[index], {
            board_sort_order: (index + 1) * 10,
          } as Partial<Shipment>);
        }
      }

      for (let index = 0; index < targetIds.length; index++) {
        const id = targetIds[index];

        if (id === shipmentId) {
          await updateShipment(id, {
            assigned_truck_id:
              targetColumnKey === PICKUP_COLUMN_KEY ? null : targetColumnKey,
            assigned_at: targetColumnKey === PICKUP_COLUMN_KEY ? null : now,
            route_completed: false,
            route_completed_at: null,
            route_completed_by: null,
            board_sort_order: (index + 1) * 10,
          } as Partial<Shipment>);
        } else {
          await updateShipment(id, {
            board_sort_order: (index + 1) * 10,
          } as Partial<Shipment>);
        }
      }
    } catch (error) {
      console.error('Error moving shipment on board:', error);
      setTruckColumns(previousTruckColumns);
      setUnassignedShipments(previousUnassignedShipments);
      alert('Could not move shipment. The board was restored.');
    } finally {
      setUpdatingId(null);
      handleDragEnd();
    }
  };

  const syncTruckAssignment = async ({
    shipmentId,
    targetColumnKey,
    assignedAt,
  }: {
    shipmentId: string;
    targetColumnKey: string;
    assignedAt: string;
  }) => {
    const deleteResult = await supabase
      .from('truck_assignments')
      .delete()
      .eq('shipment_id', shipmentId);

    if (deleteResult.error) {
      throw deleteResult.error;
    }

    if (targetColumnKey === PICKUP_COLUMN_KEY) {
      return;
    }

    const insertResult = await supabase.from('truck_assignments').insert([
      {
        shipment_id: shipmentId,
        truck_id: targetColumnKey,
        assigned_at: assignedAt,
      },
    ]);

    if (insertResult.error) {
      throw insertResult.error;
    }
  };

  const handleCreateTypedRouteStop = async (truck: Truck, text: string) => {
    const cleanedText = text.trim();

    if (!cleanedText) {
      return;
    }

    try {
      setUpdatingId(`typed-stop-${truck.id}`);

      const currentColumn = truckColumns.find((column) => column.truck.id === truck.id);
      const nextSortOrder = ((currentColumn?.shipments.length || 0) + 1) * 10;
      const now = new Date().toISOString();

      const createdStop = await createShipment({
        work_order_id: null,
        work_order_number: null,

        customer_company_name: null,
        bill_to_company_name: null,
        customer_reference: null,
        pickup_reference: null,
        delivery_reference: null,

        service_type: 'other',
        priority_level: 'normal',

        internal_notes: null,

        ready_to_invoice: false,
        invoice_status: 'do_not_invoice',

        pod_received: false,
        pod_received_at: null,

        dispatch_task_type: 'board_stop',
        dispatch_status: 'open',

        pickup_company_name: null,
        pickup_address: null,
        pickup_city: null,
        pickup_postal_code: null,
        pickup_date: null,
        pickup_time: null,
        pickup_contact_name: null,
        pickup_contact_phone: null,

        delivery_company_name: null,
        delivery_address: null,
        delivery_city: null,
        delivery_postal_code: null,
        delivery_date: null,
        delivery_time: null,
        delivery_contact_name: null,
        delivery_contact_phone: null,

        number_of_skids: null,
        weight_lbs: null,
        weight_kg: null,

        dimensions: null,
        notes: null,

        board_name: cleanedText,
        board_stop_type: 'warehouse',
        board_note: null,
        board_sort_order: nextSortOrder,

        customs_docs_received: false,
        stays_in_canada: false,

        route_completed: false,
        route_completed_at: null,
        route_completed_by: null,

        status: 'pending',
        assigned_truck_id: truck.id,
        assigned_at: now,
      } as Omit<Shipment, 'id' | 'created_at' | 'updated_at'>);

      if (!createdStop) {
        alert('Could not add route note.');
        return;
      }

      await updateShipment(createdStop.id, {
        work_order_number: null,
        work_order_id: null,
        customer_reference: null,
        pickup_reference: null,
        delivery_reference: null,
        customer_company_name: null,
        bill_to_company_name: null,
      } as Partial<Shipment>);

      const cleanCreatedStop: Shipment = {
        ...createdStop,
        work_order_number: null,
        work_order_id: null,
        customer_reference: null,
        pickup_reference: null,
        delivery_reference: null,
        customer_company_name: null,
        bill_to_company_name: null,
        dispatch_task_type: 'board_stop',
        board_name: cleanedText,
        assigned_truck_id: truck.id,
        assigned_at: now,
        board_sort_order: nextSortOrder,
      };

      addShipmentToTruckLocally(truck.id, cleanCreatedStop);

      const insertResult = await supabase.from('truck_assignments').insert([
        {
          shipment_id: createdStop.id,
          truck_id: truck.id,
          assigned_at: now,
        },
      ]);

      if (insertResult.error) {
        console.error('Error creating truck assignment for typed route stop:', insertResult.error);
      }
    } catch (error) {
      console.error('Error creating typed route stop:', error);
      alert('Could not add route note.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDragStart = (
    event: DragEvent<HTMLDivElement>,
    shipment: Shipment,
    columnKey: string
  ) => {
    setDraggedItem({
      shipmentId: shipment.id,
      sourceColumnKey: columnKey,
    });

    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(
      'text/plain',
      JSON.stringify({
        shipmentId: shipment.id,
        sourceColumnKey: columnKey,
      })
    );
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverShipmentId(null);
    setDragOverColumnKey(null);
    setDragDropPosition(null);
  };

  const handleDropOnShipment = async (
    event: DragEvent<HTMLDivElement>,
    targetShipment: Shipment,
    targetColumnKey: string,
    position: 'before' | 'after'
  ) => {
    event.preventDefault();
    event.stopPropagation();

    if (!draggedItem) return;

    if (draggedItem.shipmentId === targetShipment.id) {
      handleDragEnd();
      return;
    }

    const targetColumnShipments = getColumnShipments(targetColumnKey);
    const targetIndex = targetColumnShipments.findIndex(
      (shipment) => shipment.id === targetShipment.id
    );

    const targetBeforeShipmentId =
      position === 'before'
        ? targetShipment.id
        : targetColumnShipments[targetIndex + 1]?.id || null;

    await saveBoardMove({
      shipmentId: draggedItem.shipmentId,
      sourceColumnKey: draggedItem.sourceColumnKey,
      targetColumnKey,
      targetBeforeShipmentId,
    });
  };

  const handleDropOnColumnEnd = async (
    event: DragEvent<HTMLDivElement>,
    targetColumnKey: string
  ) => {
    event.preventDefault();
    event.stopPropagation();

    if (!draggedItem) return;

    await saveBoardMove({
      shipmentId: draggedItem.shipmentId,
      sourceColumnKey: draggedItem.sourceColumnKey,
      targetColumnKey,
      targetBeforeShipmentId: null,
    });
  };

  const handleToggleRouteComplete = async (shipment: Shipment, truck: Truck) => {
    const previousCompleted = shipment.route_completed;
    const previousCompletedAt = shipment.route_completed_at;
    const previousCompletedBy = shipment.route_completed_by;

    const nextCompleted = !shipment.route_completed;

    const localUpdates: Partial<Shipment> = {
      route_completed: nextCompleted,
      route_completed_at: nextCompleted ? new Date().toISOString() : null,
      route_completed_by: nextCompleted ? truck.driver_name || truck.truck_number : null,
    };

    updateShipmentLocally(shipment.id, localUpdates);

    try {
      setUpdatingId(shipment.id);

      const updated = await updateShipment(shipment.id, localUpdates);

      if (!updated) {
        updateShipmentLocally(shipment.id, {
          route_completed: previousCompleted,
          route_completed_at: previousCompletedAt,
          route_completed_by: previousCompletedBy,
        });

        alert('Could not update FIN status.');
      }
    } catch (error) {
      console.error('Error updating FIN status:', error);

      updateShipmentLocally(shipment.id, {
        route_completed: previousCompleted,
        route_completed_at: previousCompletedAt,
        route_completed_by: previousCompletedBy,
      });

      alert('Could not update FIN status.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleClearFinishedStops = async () => {
    const finishedShipments = truckColumns.flatMap((column) =>
      column.shipments.filter((shipment) => shipment.route_completed)
    );

    if (finishedShipments.length === 0) {
      alert('No finished stops to clear.');
      return;
    }

    if (
      !confirm(
        `Clear ${finishedShipments.length} finished stop(s) from the board? They will be marked delivered and removed from the active board.`
      )
    ) {
      return;
    }

    const previousTruckColumns = truckColumns;

    setTruckColumns((current) =>
      rebuildTruckColumns(
        current.map((column) => ({
          ...column,
          shipments: column.shipments.filter(
            (shipment) => !shipment.route_completed
          ),
        }))
      )
    );

    try {
      setClearingFinished(true);

      for (const shipment of finishedShipments) {
        await updateShipmentStatus(shipment.id, 'delivered');
      }
    } catch (error) {
      console.error('Error clearing finished stops:', error);
      setTruckColumns(previousTruckColumns);
      alert('Could not clear finished stops. The board was restored.');
    } finally {
      setClearingFinished(false);
    }
  };

  const handleToggleDocs = async (shipment: Shipment) => {
    const previousValue = shipment.customs_docs_received;
    const nextValue = !shipment.customs_docs_received;

    updateShipmentLocally(shipment.id, {
      customs_docs_received: nextValue,
    });

    try {
      setUpdatingId(shipment.id);

      const updated = await updateShipment(shipment.id, {
        customs_docs_received: nextValue,
      } as Partial<Shipment>);

      if (!updated) {
        updateShipmentLocally(shipment.id, {
          customs_docs_received: previousValue,
        });

        alert('Could not update customs docs status.');
      }
    } catch (error) {
      console.error('Error updating customs docs:', error);

      updateShipmentLocally(shipment.id, {
        customs_docs_received: previousValue,
      });

      alert('Could not update customs docs status.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleToggleCanada = async (shipment: Shipment) => {
    const previousValue = shipment.stays_in_canada;
    const nextValue = !shipment.stays_in_canada;

    updateShipmentLocally(shipment.id, {
      stays_in_canada: nextValue,
    });

    try {
      setUpdatingId(shipment.id);

      const updated = await updateShipment(shipment.id, {
        stays_in_canada: nextValue,
      } as Partial<Shipment>);

      if (!updated) {
        updateShipmentLocally(shipment.id, {
          stays_in_canada: previousValue,
        });

        alert('Could not update Canada status.');
      }
    } catch (error) {
      console.error('Error updating Canada status:', error);

      updateShipmentLocally(shipment.id, {
        stays_in_canada: previousValue,
      });

      alert('Could not update Canada status.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleSaveBoardNote = async (shipment: Shipment, boardNote: string) => {
    const cleanedNote = boardNote.trim();
    const previousNote = shipment.board_note || null;
    const nextNote = cleanedNote === '' ? null : cleanedNote;

    if (previousNote === nextNote) {
      return;
    }

    updateShipmentLocally(shipment.id, {
      board_note: nextNote,
    });

    try {
      setUpdatingId(shipment.id);

      const updated = await updateShipment(shipment.id, {
        board_note: nextNote,
      } as Partial<Shipment>);

      if (!updated) {
        updateShipmentLocally(shipment.id, {
          board_note: previousNote,
        });

        alert('Could not save board note.');
      }
    } catch (error) {
      console.error('Error saving board note:', error);

      updateShipmentLocally(shipment.id, {
        board_note: previousNote,
      });

      alert('Could not save board note.');
    } finally {
      setUpdatingId(null);
    }
  };

  const openAssignModal = (shipment: Shipment) => {
    setAssigningShipment(shipment);
    setSelectedTruckId('');
  };

  const closeAssignModal = () => {
    setAssigningShipment(null);
    setSelectedTruckId('');
  };

  const handleAssignPickup = async () => {
    if (!assigningShipment) return;

    if (!selectedTruckId) {
      alert('Type and select a truck first.');
      return;
    }

    try {
      setUpdatingId(assigningShipment.id);

      await saveBoardMove({
        shipmentId: assigningShipment.id,
        sourceColumnKey: PICKUP_COLUMN_KEY,
        targetColumnKey: selectedTruckId,
        targetBeforeShipmentId: null,
      });

      closeAssignModal();
    } catch (error) {
      console.error('Error assigning pickup:', error);
      alert('Could not assign pickup to truck.');
    } finally {
      setUpdatingId(null);
    }
  };

  const openPickupEditModal = (shipment: Shipment) => {
    const pickupCompany = companies.find(
      (company) =>
        company.name.trim().toLowerCase() ===
        (shipment.pickup_company_name || '').trim().toLowerCase()
    );

    const deliveryCompany = companies.find(
      (company) =>
        company.name.trim().toLowerCase() ===
        (shipment.delivery_company_name || '').trim().toLowerCase()
    );

    setEditingPickup(shipment);
    setPickupEditForm({
      pickup_company_id: pickupCompany?.id || '',
      delivery_company_id: deliveryCompany?.id || '',
      board_name: shipment.board_name || '',
      board_stop_type: (shipment.board_stop_type as BoardStopType) || 'pickup',
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
      board_note: shipment.board_note || '',
      customs_docs_received: Boolean(shipment.customs_docs_received),
      stays_in_canada: Boolean(shipment.stays_in_canada),
    });
  };

  const closePickupEditModal = () => {
    setEditingPickup(null);
    setPickupEditForm(emptyPickupEditForm);
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

  const handleSavePickupEdit = async () => {
    if (!editingPickup) return;

    const previousShipment = editingPickup;

    const localUpdates: Partial<Shipment> = {
      pickup_company_name: selectedPickupCompany?.name || null,
      pickup_address: companyValue(selectedPickupCompany?.address),
      pickup_city: companyValue(selectedPickupCompany?.city),
      pickup_postal_code: companyValue(selectedPickupCompany?.postal_code),
      pickup_contact_name: companyValue(selectedPickupCompany?.contact_name),
      pickup_contact_phone: companyValue(selectedPickupCompany?.contact_phone),

      delivery_company_name: selectedDeliveryCompany?.name || null,
      delivery_address: companyValue(selectedDeliveryCompany?.address),
      delivery_city: companyValue(selectedDeliveryCompany?.city),
      delivery_postal_code: companyValue(selectedDeliveryCompany?.postal_code),
      delivery_contact_name: companyValue(selectedDeliveryCompany?.contact_name),
      delivery_contact_phone: companyValue(selectedDeliveryCompany?.contact_phone),

      board_name: pickupEditForm.board_name.trim() || null,
      board_stop_type: pickupEditForm.board_stop_type,
      number_of_skids: numberValue(pickupEditForm.number_of_skids),
      weight_lbs: numberValue(pickupEditForm.weight_lbs),
      board_note: pickupEditForm.board_note.trim() || null,
      customs_docs_received: pickupEditForm.customs_docs_received,
      stays_in_canada: pickupEditForm.stays_in_canada,
    };

    updateShipmentLocally(editingPickup.id, localUpdates);

    try {
      setSavingPickupEdit(true);

      const updated = await updateShipment(editingPickup.id, localUpdates);

      if (!updated) {
        updateShipmentLocally(editingPickup.id, previousShipment);
        alert('Could not save pickup changes.');
        return;
      }

      closePickupEditModal();
    } catch (error) {
      console.error('Error saving pickup edit:', error);
      updateShipmentLocally(editingPickup.id, previousShipment);
      alert('Could not save pickup changes.');
    } finally {
      setSavingPickupEdit(false);
    }
  };

  const setBoardZoomLevel = (nextZoom: number) => {
    const safeZoom = Math.min(130, Math.max(70, nextZoom));

    setBoardZoom(safeZoom);
    window.localStorage.setItem(BOARD_ZOOM_STORAGE_KEY, String(safeZoom));
  };

  return (
    <MainLayout>
      <div className="flex h-full max-h-full min-h-0 w-full flex-col overflow-hidden bg-white dark:bg-dark-bg">
        <div className="flex h-[48px] flex-shrink-0 items-center justify-between border-b-2 border-slate-400 bg-white px-2 shadow-sm dark:border-dark-border dark:bg-dark-bg">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-black text-slate-950 dark:text-white">
              Truck Board
            </h1>
            <p className="truncate text-[11px] text-slate-600 dark:text-slate-400">
              Drag freight, type route notes, and track what each driver is doing
            </p>
          </div>

          <div className="flex flex-shrink-0 gap-1.5">
            <Link
              href="/settings"
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600"
            >
              Board Settings
            </Link>

            <div className="hidden items-center gap-1 rounded border border-slate-300 bg-white px-1 py-1 text-xs font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-700 dark:text-white sm:flex">
              <button
                type="button"
                onClick={() => setBoardZoomLevel(boardZoom - 10)}
                className="rounded px-2 py-0.5 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-600"
                disabled={boardZoom <= 70}
                title="Zoom out"
              >
                −
              </button>

              <button
                type="button"
                onClick={() => setBoardZoomLevel(100)}
                className="min-w-[48px] rounded px-2 py-0.5 text-center hover:bg-slate-100 dark:hover:bg-slate-600"
                title="Reset zoom"
              >
                {boardZoom}%
              </button>

              <button
                type="button"
                onClick={() => setBoardZoomLevel(boardZoom + 10)}
                className="rounded px-2 py-0.5 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-600"
                disabled={boardZoom >= 130}
                title="Zoom in"
              >
                +
              </button>
            </div>

            <button
              type="button"
              onClick={loadBoardData}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600"
              disabled={loading}
            >
              <RefreshCw className={`mr-1 inline h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>

            <button
              type="button"
              onClick={handleClearFinishedStops}
              className="rounded bg-red-700 px-2 py-1 text-xs font-bold text-white hover:bg-red-600 disabled:opacity-60"
              disabled={clearingFinished}
            >
              {clearingFinished ? 'Clearing...' : 'Clear FIN'}
            </button>

            <Link
              href="/shipments"
              className="rounded bg-blue-600 px-2 py-1 text-xs font-bold text-white hover:bg-blue-500"
            >
              <Plus className="mr-1 inline h-3 w-3" />
              Add
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center bg-white dark:bg-dark-bg">
            <p className="text-slate-600 dark:text-slate-400">Loading truck board...</p>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-hidden bg-white p-0 dark:bg-dark-bg">
            <div
              className="h-full min-h-0 w-full"
              style={{ zoom: boardZoom / 100 } as CSSProperties & { zoom: number }}
            >
              <div
                className="grid h-full min-h-0 w-full gap-0"
                style={{
                  gridTemplateColumns: `repeat(${truckColumns.length + 1}, minmax(0, 1fr))`,
                }}
              >
              {truckColumns.map((column, index) => (
                <TruckBoardColumnCard
                  key={column.truck.id}
                  column={column}
                  columnKey={column.truck.id}
                  color={BOARD_COLORS[index % BOARD_COLORS.length]}
                  boardDisplaySettings={boardDisplaySettings}
                  onToggleRouteComplete={handleToggleRouteComplete}
                  onSaveBoardNote={handleSaveBoardNote}
                  onCreateTypedRouteStop={handleCreateTypedRouteStop}
                  updatingId={updatingId}
                  draggedItem={draggedItem}
                  dragOverShipmentId={dragOverShipmentId}
                  dragOverColumnKey={dragOverColumnKey}
                  dragDropPosition={dragDropPosition}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onDragOverColumn={(columnKey) => {
                    setDragOverShipmentId(null);
                    setDragOverColumnKey(columnKey);
                    setDragDropPosition('end');
                  }}
                  onDragOverShipment={(shipmentId, columnKey, position) => {
                    setDragOverShipmentId(shipmentId);
                    setDragOverColumnKey(columnKey);
                    setDragDropPosition(position);
                  }}
                  onDropOnShipment={handleDropOnShipment}
                  onDropOnColumnEnd={handleDropOnColumnEnd}
                />
              ))}

              <PickupBoardColumn
                shipments={unassignedShipments}
                columnKey={PICKUP_COLUMN_KEY}
                onToggleDocs={handleToggleDocs}
                onToggleCanada={handleToggleCanada}
                onAssign={openAssignModal}
                onEdit={openPickupEditModal}
                updatingId={updatingId}
                draggedItem={draggedItem}
                dragOverShipmentId={dragOverShipmentId}
                dragOverColumnKey={dragOverColumnKey}
                dragDropPosition={dragDropPosition}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragOverColumn={(columnKey) => {
                  setDragOverShipmentId(null);
                  setDragOverColumnKey(columnKey);
                  setDragDropPosition('end');
                }}
                onDragOverShipment={(shipmentId, columnKey, position) => {
                  setDragOverShipmentId(shipmentId);
                  setDragOverColumnKey(columnKey);
                  setDragDropPosition(position);
                }}
                onDropOnShipment={handleDropOnShipment}
                onDropOnColumnEnd={handleDropOnColumnEnd}
              />
              </div>
            </div>
          </div>
        )}

        {assigningShipment && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm dark:bg-black/70">
            <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-dark-border dark:bg-dark-card">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black text-slate-950 dark:text-white">
                    Assign Pickup to Truck
                  </h2>

                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    {displayValue(assigningShipment.pickup_company_name)} •{' '}
                    {displayLocation(assigningShipment.pickup_address, assigningShipment.pickup_city)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeAssignModal}
                  className="text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <AutocompleteField
                label="Truck"
                placeholder="Type Unit 11, driver, area, rental..."
                items={truckItemsForAssignment}
                selectedId={selectedTruckId}
                onSelect={(item) => setSelectedTruckId(item.id)}
                onClear={() => setSelectedTruckId('')}
                emptyMessage="No truck found with enough capacity."
              />

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeAssignModal}
                  className="btn-secondary"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleAssignPickup}
                  className="btn-primary"
                  disabled={updatingId === assigningShipment.id}
                >
                  {updatingId === assigningShipment.id ? 'Assigning...' : 'Assign Pickup'}
                </button>
              </div>
            </div>
          </div>
        )}

        {editingPickup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm dark:bg-black/70">
            <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-dark-border dark:bg-dark-card">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black text-slate-950 dark:text-white">
                    Edit Pickup
                  </h2>

                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    Change the pickup without leaving the board.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closePickupEditModal}
                  className="text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="space-y-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <AutocompleteField
                      label="Pickup From"
                      placeholder="Type pickup company..."
                      items={companyItems}
                      selectedId={pickupEditForm.pickup_company_id}
                      onSelect={(item) =>
                        setPickupEditForm({
                          ...pickupEditForm,
                          pickup_company_id: item.id,
                        })
                      }
                      onClear={() =>
                        setPickupEditForm({
                          ...pickupEditForm,
                          pickup_company_id: '',
                        })
                      }
                      emptyMessage="No company found."
                    />

                    {selectedPickupCompany && (
                      <SmallCompanyPreview company={selectedPickupCompany} />
                    )}
                  </div>

                  <div>
                    <AutocompleteField
                      label="Going To"
                      placeholder="Type receiver/warehouse..."
                      items={companyItems}
                      selectedId={pickupEditForm.delivery_company_id}
                      onSelect={(item) =>
                        setPickupEditForm({
                          ...pickupEditForm,
                          delivery_company_id: item.id,
                        })
                      }
                      onClear={() =>
                        setPickupEditForm({
                          ...pickupEditForm,
                          delivery_company_id: '',
                        })
                      }
                      emptyMessage="No company found."
                    />

                    {selectedDeliveryCompany && (
                      <SmallCompanyPreview company={selectedDeliveryCompany} />
                    )}
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Board Name
                  </label>

                  <input
                    type="text"
                    className="input-field"
                    placeholder="Optional board override"
                    value={pickupEditForm.board_name}
                    onChange={(event) =>
                      setPickupEditForm({
                        ...pickupEditForm,
                        board_name: event.target.value,
                      })
                    }
                  />
                </div>

                <div>
                  <label className="mb-3 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Stop Type
                  </label>

                  <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                    {stopTypeOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          setPickupEditForm({
                            ...pickupEditForm,
                            board_stop_type: option.value,
                          })
                        }
                        className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                          pickupEditForm.board_stop_type === option.value
                            ? 'border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-100'
                            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-dark-border dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Skids
                    </label>

                    <input
                      type="number"
                      min="0"
                      max="12"
                      className="input-field"
                      value={pickupEditForm.number_of_skids}
                      onChange={(event) =>
                        setPickupEditForm({
                          ...pickupEditForm,
                          number_of_skids: event.target.value,
                        })
                      }
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Weight LBS
                    </label>

                    <input
                      type="number"
                      min="0"
                      max="15000"
                      className="input-field"
                      value={pickupEditForm.weight_lbs}
                      onChange={(event) =>
                        setPickupEditForm({
                          ...pickupEditForm,
                          weight_lbs: event.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Board Note
                  </label>

                  <input
                    type="text"
                    className="input-field"
                    placeholder="Call with ETA, No Bury, etc."
                    value={pickupEditForm.board_note}
                    onChange={(event) =>
                      setPickupEditForm({
                        ...pickupEditForm,
                        board_note: event.target.value,
                      })
                    }
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() =>
                      setPickupEditForm({
                        ...pickupEditForm,
                        customs_docs_received: !pickupEditForm.customs_docs_received,
                      })
                    }
                    className={`rounded-lg border px-4 py-3 text-left font-semibold ${
                      pickupEditForm.customs_docs_received
                        ? 'border-green-300 bg-green-50 text-green-800 dark:border-green-700 dark:bg-green-950 dark:text-green-200'
                        : 'border-red-300 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200'
                    }`}
                  >
                    DOC: {pickupEditForm.customs_docs_received ? 'Received' : 'Not Received'}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setPickupEditForm({
                        ...pickupEditForm,
                        stays_in_canada: !pickupEditForm.stays_in_canada,
                      })
                    }
                    className={`rounded-lg border px-4 py-3 text-left font-semibold ${
                      pickupEditForm.stays_in_canada
                        ? 'border-red-600 bg-red-600 text-white dark:bg-red-900'
                        : 'border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                    }`}
                  >
                    CAN: {pickupEditForm.stays_in_canada ? 'Canada' : 'Not Canada'}
                  </button>
                </div>
              </div>

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closePickupEditModal}
                  className="btn-secondary"
                  disabled={savingPickupEdit}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleSavePickupEdit}
                  className="btn-primary"
                  disabled={savingPickupEdit}
                >
                  {savingPickupEdit ? 'Saving...' : 'Save Pickup'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}

interface BoardColor {
  header: string;
  body: string;
  accent: string;
}

interface TruckBoardColumnCardProps {
  column: TruckBoardColumn;
  columnKey: string;
  color: BoardColor;
  boardDisplaySettings: BoardDisplaySettings;
  onToggleRouteComplete: (shipment: Shipment, truck: Truck) => void;
  onSaveBoardNote: (shipment: Shipment, boardNote: string) => void;
  onCreateTypedRouteStop: (truck: Truck, text: string) => void;
  updatingId: string | null;
  draggedItem: DraggedBoardItem | null;
  dragOverShipmentId: string | null;
  dragOverColumnKey: string | null;
  dragDropPosition: 'before' | 'after' | 'end' | null;
  onDragStart: (
    event: DragEvent<HTMLDivElement>,
    shipment: Shipment,
    columnKey: string
  ) => void;
  onDragEnd: () => void;
  onDragOverColumn: (columnKey: string) => void;
  onDragOverShipment: (
    shipmentId: string,
    columnKey: string,
    position: 'before' | 'after'
  ) => void;
  onDropOnShipment: (
    event: DragEvent<HTMLDivElement>,
    shipment: Shipment,
    columnKey: string,
    position: 'before' | 'after'
  ) => void;
  onDropOnColumnEnd: (
    event: DragEvent<HTMLDivElement>,
    columnKey: string
  ) => void;
}

function TruckBoardColumnCard({
  column,
  columnKey,
  color,
  boardDisplaySettings,
  onToggleRouteComplete,
  onSaveBoardNote,
  onCreateTypedRouteStop,
  updatingId,
  draggedItem,
  dragOverShipmentId,
  dragOverColumnKey,
  dragDropPosition,
  onDragStart,
  onDragEnd,
  onDragOverColumn,
  onDragOverShipment,
  onDropOnShipment,
  onDropOnColumnEnd,
}: TruckBoardColumnCardProps) {
  const { truck, shipments, totalSkids, totalWeightLbs, remainingSkids, remainingWeightLbs } = column;

  const overSkids = remainingSkids < 0;
  const overWeight = remainingWeightLbs < 0;

  return (
    <section
      className={`flex min-h-0 flex-col overflow-hidden border-r ${color.body} bg-white dark:bg-slate-950 ${
        dragOverColumnKey === columnKey && draggedItem?.sourceColumnKey !== columnKey
          ? 'ring-2 ring-blue-400'
          : ''
      }`}
    >
      <div className={`${color.header} flex-shrink-0 px-2 py-1.5`}>
        <div className="flex items-center justify-between gap-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <TruckIcon className="h-4 w-4 flex-shrink-0" />
            <p className="truncate text-base font-black leading-none">
              {truck.truck_number}
            </p>
          </div>

          <Link
            href="/trucks"
            className="rounded bg-black/10 px-1.5 py-0.5 text-[9px] font-black hover:bg-black/20"
          >
            EDIT
          </Link>
        </div>

        <div className="mt-1 flex min-w-0 items-center gap-1 text-[10px] font-bold">
          <User className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{truck.driver_name || 'Unassigned'}</span>
        </div>

        <div className="mt-1 grid grid-cols-2 gap-1 text-[9px] font-black">
          <div className={`rounded bg-black/10 px-1 py-0.5 ${overSkids ? 'text-red-900' : ''}`}>
            {totalSkids}/{truck.capacity_skids} SK
          </div>

          <div className={`rounded bg-black/10 px-1 py-0.5 ${overWeight ? 'text-red-900' : ''}`}>
            {totalWeightLbs.toLocaleString()}/{truck.max_weight_lbs.toLocaleString()} LB
          </div>
        </div>
      </div>

      <div className="grid flex-shrink-0 grid-cols-[18px_1fr_38px] border-b-2 border-slate-400 bg-slate-100 text-[9px] font-black uppercase tracking-wide text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
        <div className="border-r-2 border-slate-400 px-0.5 py-1 dark:border-slate-700 text-center">
          ↕
        </div>

        <div className="border-r-2 border-slate-400 px-1.5 py-1 dark:border-slate-700">
          Route / Note
        </div>

        <div className="px-0.5 py-1 text-center">
          FIN
        </div>
      </div>

      <div
        className={`custom-board-scrollbar min-h-0 flex-1 overflow-y-auto ${
          dragOverColumnKey === columnKey ? 'bg-blue-50 dark:bg-blue-950/30' : ''
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          onDragOverColumn(columnKey);
        }}
        onDrop={(event) => onDropOnColumnEnd(event, columnKey)}
      >
        <TypedRouteStopInput
          truck={truck}
          disabled={updatingId === `typed-stop-${truck.id}` || updatingId === 'reordering'}
          onCreate={onCreateTypedRouteStop}
        />

        {shipments.length === 0 ? (
          <div className="px-2 py-2 text-[10px] font-semibold uppercase text-slate-600">
            Type above or drop freight here
          </div>
        ) : (
          shipments.map((shipment) => (
            <BoardShipmentRow
              key={shipment.id}
              shipment={shipment}
              columnKey={columnKey}
              boardDisplaySettings={boardDisplaySettings}
              actionTitle="Toggle stop completed"
              onAction={() => onToggleRouteComplete(shipment, truck)}
              onSaveBoardNote={(boardNote) => onSaveBoardNote(shipment, boardNote)}
              disabled={updatingId === shipment.id || updatingId === 'reordering'}
              accentClassName={color.accent}
              isDragging={draggedItem?.shipmentId === shipment.id}
              isDragOver={dragOverShipmentId === shipment.id}
              isDragBefore={
                dragOverShipmentId === shipment.id && dragDropPosition === 'before'
              }
              isDragAfter={
                dragOverShipmentId === shipment.id && dragDropPosition === 'after'
              }
              onDragStart={(event) => onDragStart(event, shipment, columnKey)}
              onDragEnd={onDragEnd}
              onDragOver={(event) => {
                event.preventDefault();
                event.stopPropagation();

                const position = getRowDropPosition(event.currentTarget, event.clientY);
                onDragOverShipment(shipment.id, columnKey, position);
              }}
              onDrop={(event) =>
                onDropOnShipment(
                  event,
                  shipment,
                  columnKey,
                  dragDropPosition === 'after' ? 'after' : 'before'
                )
              }
            />
          ))
        )}

        <EmptyTruckRows count={Math.max(18 - shipments.length, 4)} />
      </div>
    </section>
  );
}

function TypedRouteStopInput({
  truck,
  disabled,
  onCreate,
}: {
  truck: Truck;
  disabled: boolean;
  onCreate: (truck: Truck, text: string) => void;
}) {
  const [text, setText] = useState('');

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();

    const cleanedText = text.trim();

    if (!cleanedText) {
      return;
    }

    onCreate(truck, cleanedText);
    setText('');
  };

  return (
    <div className="grid min-h-[36px] grid-cols-[18px_1fr_38px] border-b border-dashed border-slate-300 bg-slate-50 text-[11px] font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
      <div className="flex items-center justify-center border-r-2 border-slate-400 dark:border-slate-700 text-slate-500">
        +
      </div>

      <div className="border-r-2 border-slate-400 px-1 py-1 dark:border-slate-700">
        <input
          type="text"
          value={text}
          disabled={disabled}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Click and type route note, then Enter..."
          className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-[10px] font-semibold normal-case text-slate-950 outline-none placeholder:text-slate-400 focus:border-blue-500 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
        />
      </div>

      <div className="flex items-center justify-center text-[8px] font-black text-slate-500">
        ENTER
      </div>
    </div>
  );
}

interface PickupBoardColumnProps {
  shipments: Shipment[];
  columnKey: string;
  onToggleDocs: (shipment: Shipment) => void;
  onToggleCanada: (shipment: Shipment) => void;
  onAssign: (shipment: Shipment) => void;
  onEdit: (shipment: Shipment) => void;
  updatingId: string | null;
  draggedItem: DraggedBoardItem | null;
  dragOverShipmentId: string | null;
  dragOverColumnKey: string | null;
  dragDropPosition: 'before' | 'after' | 'end' | null;
  onDragStart: (
    event: DragEvent<HTMLDivElement>,
    shipment: Shipment,
    columnKey: string
  ) => void;
  onDragEnd: () => void;
  onDragOverColumn: (columnKey: string) => void;
  onDragOverShipment: (
    shipmentId: string,
    columnKey: string,
    position: 'before' | 'after'
  ) => void;
  onDropOnShipment: (
    event: DragEvent<HTMLDivElement>,
    shipment: Shipment,
    columnKey: string,
    position: 'before' | 'after'
  ) => void;
  onDropOnColumnEnd: (
    event: DragEvent<HTMLDivElement>,
    columnKey: string
  ) => void;
}

function PickupBoardColumn({
  shipments,
  columnKey,
  onToggleDocs,
  onToggleCanada,
  onAssign,
  onEdit,
  updatingId,
  draggedItem,
  dragOverShipmentId,
  dragOverColumnKey,
  dragDropPosition,
  onDragStart,
  onDragEnd,
  onDragOverColumn,
  onDragOverShipment,
  onDropOnShipment,
  onDropOnColumnEnd,
}: PickupBoardColumnProps) {
  const totalSkids = shipments.reduce(
    (sum, shipment) => sum + Number(shipment.number_of_skids || 0),
    0
  );

  const missingDocs = shipments.filter(
    (shipment) => !shipment.customs_docs_received
  ).length;

  return (
    <section
      className={`flex min-h-0 flex-col overflow-hidden border-r ${PICKUP_COLUMN_COLOR.body} bg-white dark:bg-slate-950 ${
        dragOverColumnKey === columnKey && draggedItem?.sourceColumnKey !== columnKey
          ? 'ring-2 ring-blue-400'
          : ''
      }`}
    >
      <div className={`${PICKUP_COLUMN_COLOR.header} flex-shrink-0 px-2 py-1.5`}>
        <div className="flex items-center justify-between gap-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <ClipboardList className="h-4 w-4 flex-shrink-0" />
            <p className="truncate text-base font-black leading-none">
              PICK UPS
            </p>
          </div>

          <Link
            href="/shipments"
            className="rounded bg-black/10 px-1.5 py-0.5 text-[9px] font-black hover:bg-black/20"
          >
            ADD
          </Link>
        </div>

        <div className="mt-1 flex min-w-0 items-center gap-1 text-[10px] font-bold">
          <User className="h-3 w-3 flex-shrink-0 opacity-0" />
          <span className="truncate">Unassigned pickups</span>
        </div>

        <div className="mt-1 grid grid-cols-3 gap-1 text-[9px] font-black">
          <div className="rounded bg-black/10 px-1 py-0.5">
            {shipments.length} PU
          </div>

          <div className="rounded bg-black/10 px-1 py-0.5">
            {totalSkids} SK
          </div>

          <div className={`rounded px-1 py-0.5 ${missingDocs > 0 ? 'bg-red-700 text-white' : 'bg-black/10'}`}>
            {missingDocs} NO DOC
          </div>
        </div>
      </div>

      <div className="grid flex-shrink-0 grid-cols-[18px_1fr_24px_28px_28px_34px] border-b-2 border-slate-400 bg-slate-100 text-[8px] font-black uppercase tracking-wide text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
        <div className="border-r-2 border-slate-400 px-0.5 py-1 dark:border-slate-700 text-center">
          ↕
        </div>

        <div className="border-r-2 border-slate-400 px-1 py-1 dark:border-slate-700">
          Pickup
        </div>

        <div className="border-r-2 border-slate-400 px-0.5 py-1 dark:border-slate-700 text-center">
          SK
        </div>

        <div className="border-r-2 border-slate-400 px-0.5 py-1 dark:border-slate-700 text-center">
          CAN
        </div>

        <div className="border-r-2 border-slate-400 px-0.5 py-1 dark:border-slate-700 text-center">
          DOC
        </div>

        <div className="px-0.5 py-1 text-center">
          GO
        </div>
      </div>

      <div
        className={`custom-board-scrollbar min-h-0 flex-1 overflow-y-auto ${
          dragOverColumnKey === columnKey ? 'bg-blue-50 dark:bg-blue-950/30' : ''
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          onDragOverColumn(columnKey);
        }}
        onDrop={(event) => onDropOnColumnEnd(event, columnKey)}
      >
        {shipments.length === 0 ? (
          <div className="px-2 py-2 text-[10px] font-semibold uppercase text-slate-600">
            Drop freight here
          </div>
        ) : (
          shipments.map((shipment) => (
            <CompactPickupRow
              key={shipment.id}
              shipment={shipment}
              columnKey={columnKey}
              onAssign={() => onAssign(shipment)}
              onEdit={() => onEdit(shipment)}
              onToggleDocs={() => onToggleDocs(shipment)}
              onToggleCanada={() => onToggleCanada(shipment)}
              disabled={updatingId === shipment.id || updatingId === 'reordering'}
              isDragging={draggedItem?.shipmentId === shipment.id}
              isDragOver={dragOverShipmentId === shipment.id}
              isDragBefore={
                dragOverShipmentId === shipment.id && dragDropPosition === 'before'
              }
              isDragAfter={
                dragOverShipmentId === shipment.id && dragDropPosition === 'after'
              }
              onDragStart={(event) => onDragStart(event, shipment, columnKey)}
              onDragEnd={onDragEnd}
              onDragOver={(event) => {
                event.preventDefault();
                event.stopPropagation();

                const position = getRowDropPosition(event.currentTarget, event.clientY);
                onDragOverShipment(shipment.id, columnKey, position);
              }}
              onDrop={(event) =>
                onDropOnShipment(
                  event,
                  shipment,
                  columnKey,
                  dragDropPosition === 'after' ? 'after' : 'before'
                )
              }
            />
          ))
        )}

        <EmptyPickupRows count={Math.max(30 - shipments.length, 4)} />
      </div>
    </section>
  );
}

interface CompactPickupRowProps {
  shipment: Shipment;
  columnKey: string;
  onAssign: () => void;
  onEdit: () => void;
  onToggleDocs: () => void;
  onToggleCanada: () => void;
  disabled: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  isDragBefore: boolean;
  isDragAfter: boolean;
  onDragStart: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
}

function CompactPickupRow({
  shipment,
  columnKey,
  onAssign,
  onEdit,
  onToggleDocs,
  onToggleCanada,
  disabled,
  isDragging,
  isDragOver,
  isDragBefore,
  isDragAfter,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: CompactPickupRowProps) {
  const displayName = getPickupColumnDisplayName(shipment);
  const city = shipment.pickup_city || shipment.delivery_city || '';
  const skids = shipment.number_of_skids || 0;
  const isHot =
    String(shipment.priority_level || '').toLowerCase() === 'hot' ||
    String(shipment.priority_level || '').toLowerCase() === 'urgent' ||
    (shipment.notes || '').toLowerCase().includes('hot') ||
    (shipment.notes || '').toLowerCase().includes('urgent') ||
    (shipment.notes || '').toLowerCase().includes('rush');

  const rowBackground = shipment.stays_in_canada
    ? 'bg-red-600 text-white'
    : isHot
      ? 'bg-red-50 text-slate-950 dark:bg-red-950/60 dark:text-red-100'
      : isDragOver
        ? 'bg-blue-50 text-slate-950 dark:bg-blue-950/60 dark:text-blue-100'
        : 'bg-white text-slate-950 odd:bg-white even:bg-slate-50 dark:bg-slate-900 dark:text-slate-100 dark:odd:bg-slate-900 dark:even:bg-slate-800/80';

  return (
    <div
      data-column-key={columnKey}
      draggable={!disabled}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`mb-1 grid min-h-[30px] grid-cols-[18px_1fr_24px_28px_28px_34px] rounded-sm border-2 border-blue-400 transition ${
        rowBackground
      } ${isDragging ? 'opacity-40' : ''} ${
        isDragBefore ? 'border-t-4 border-t-blue-400' : ''
      } ${
        isDragAfter ? 'border-b-4 border-b-blue-400' : ''
      } ${
        isDragOver ? 'outline outline-2 outline-blue-500' : ''
      }`}
    >
      <div
        className="flex cursor-grab items-center justify-center border-r-2 border-slate-400 bg-slate-100 text-slate-500 active:cursor-grabbing dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
        title="Drag to assign or reorder"
      >
        <GripVertical className="h-3 w-3" />
      </div>

      <button
        type="button"
        onClick={onEdit}
        disabled={disabled}
        className="min-w-0 border-r-2 border-slate-400 px-1 py-0.5 dark:border-slate-700 text-left hover:bg-blue-50 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:hover:bg-blue-950/40"
        title="Click to edit pickup"
      >
        <div className="flex min-w-0 items-center gap-1">
          {isHot && (
            <span className="rounded bg-red-600 px-1 text-[7px] font-black text-white">
              HOT
            </span>
          )}

          <span className="truncate text-[10px] font-black uppercase leading-tight text-inherit">
            {displayName}
          </span>
        </div>

        <p className="truncate text-[8px] font-semibold uppercase leading-tight text-inherit">
          {city || 'NO CITY'}
          {shipment.board_note ? ` • ${shipment.board_note}` : ''}
        </p>
      </button>

      <div className="flex items-center justify-center border-r-2 border-slate-400 dark:border-slate-700 text-[10px] font-black text-inherit">
        {skids || '-'}
      </div>

      <button
        type="button"
        onClick={onToggleCanada}
        disabled={disabled}
        className={`flex items-center justify-center border-r-2 border-slate-400 dark:border-slate-700 text-[7px] font-black disabled:cursor-wait disabled:opacity-60 ${
          shipment.stays_in_canada
            ? 'bg-red-700 text-white'
            : 'bg-white text-slate-500 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
        }`}
        title="Toggle Canada"
      >
        CAN
      </button>

      <button
        type="button"
        onClick={onToggleDocs}
        disabled={disabled}
        className={`flex items-center justify-center border-r-2 border-slate-400 disabled:cursor-wait disabled:opacity-60 ${
          shipment.customs_docs_received
            ? 'bg-green-100 text-green-800'
            : 'bg-red-100 text-red-800'
        }`}
        title="Toggle docs received"
      >
        {shipment.customs_docs_received ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <FileText className="h-3.5 w-3.5" />
        )}
      </button>

      <div className="flex">
        <button
          type="button"
          onClick={onEdit}
          disabled={disabled}
          className="flex flex-1 items-center justify-center border-r-2 border-slate-400 dark:border-slate-700 text-blue-700 hover:bg-blue-50 disabled:cursor-wait disabled:opacity-60"
          title="Edit pickup"
        >
          <Edit2 className="h-3 w-3" />
        </button>

        <button
          type="button"
          onClick={onAssign}
          disabled={disabled}
          className="flex flex-1 items-center justify-center text-[8px] font-black text-blue-700 hover:bg-blue-50 disabled:cursor-wait disabled:opacity-60 dark:text-blue-300 dark:hover:bg-blue-950/40"
          title="Assign pickup"
        >
          GO
        </button>
      </div>
    </div>
  );
}

interface BoardShipmentRowProps {
  shipment: Shipment;
  columnKey: string;
  boardDisplaySettings: BoardDisplaySettings;
  actionTitle: string;
  onAction: () => void;
  onSaveBoardNote: (boardNote: string) => void;
  disabled: boolean;
  accentClassName: string;
  isDragging: boolean;
  isDragOver: boolean;
  isDragBefore: boolean;
  isDragAfter: boolean;
  onDragStart: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
}

function BoardShipmentRow({
  shipment,
  columnKey,
  boardDisplaySettings,
  actionTitle,
  onAction,
  onSaveBoardNote,
  disabled,
  accentClassName,
  isDragging,
  isDragOver,
  isDragBefore,
  isDragAfter,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: BoardShipmentRowProps) {
  const [draftNote, setDraftNote] = useState(shipment.board_note || '');

  useEffect(() => {
    setDraftNote(shipment.board_note || '');
  }, [shipment.board_note]);

  const isBoardOnlyStop = shipment.dispatch_task_type === 'board_stop';
  const displayName = getBoardDisplayName(shipment, 'truck');

  const city = shipment.pickup_city || shipment.delivery_city;

  const metaParts =
    isBoardOnlyStop
      ? []
      : [
          boardDisplaySettings.showStopType ? getStopTypeLabel(shipment.board_stop_type) : null,
          boardDisplaySettings.showCity ? city : null,
          boardDisplaySettings.showSkids && shipment.number_of_skids
            ? `${shipment.number_of_skids} SK`
            : null,
        ].filter(Boolean);

  const referenceParts = isBoardOnlyStop
    ? []
    : [
        boardDisplaySettings.showWorkOrderNumber && shipment.work_order_number
          ? shipment.work_order_number
          : null,
        boardDisplaySettings.showCustomerReference && shipment.customer_reference
          ? `Cust: ${shipment.customer_reference}`
          : null,
        boardDisplaySettings.showPickupReference && shipment.pickup_reference
          ? `PU: ${shipment.pickup_reference}`
          : null,
        boardDisplaySettings.showDeliveryReference && shipment.delivery_reference
          ? `DEL: ${shipment.delivery_reference}`
          : null,
      ].filter(Boolean);

  const isHot =
    !isBoardOnlyStop &&
    (String(shipment.priority_level || '').toLowerCase() === 'hot' ||
      String(shipment.priority_level || '').toLowerCase() === 'urgent' ||
      (shipment.notes || '').toLowerCase().includes('hot') ||
      (shipment.notes || '').toLowerCase().includes('urgent') ||
      (shipment.notes || '').toLowerCase().includes('rush'));

  const rowBackground = shipment.route_completed
    ? 'bg-green-100 text-slate-950 dark:bg-green-950/70 dark:text-green-100'
    : shipment.stays_in_canada
      ? 'bg-red-600 text-white'
      : isBoardOnlyStop
        ? 'bg-slate-100 text-slate-950 dark:bg-slate-800 dark:text-slate-100'
        : isDragOver
          ? 'bg-blue-50 text-slate-950 dark:bg-blue-950/60 dark:text-blue-100'
          : 'bg-white text-slate-950 odd:bg-white even:bg-slate-50 dark:bg-slate-900 dark:text-slate-100 dark:odd:bg-slate-900 dark:even:bg-slate-800/80';

  const nameColour = shipment.route_completed
    ? 'text-inherit line-through decoration-slate-600/80'
    : 'text-inherit';

  return (
    <div
      data-column-key={columnKey}
      draggable={!disabled}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`mb-1 grid min-h-[54px] grid-cols-[18px_1fr_38px] rounded-sm border-2 border-slate-500 text-[11px] font-bold uppercase transition ${
        rowBackground
      } ${isDragging ? 'opacity-40' : ''} ${
        isDragBefore ? 'border-t-4 border-t-blue-400' : ''
      } ${
        isDragAfter ? 'border-b-4 border-b-blue-400' : ''
      } ${
        isDragOver ? 'outline outline-2 outline-blue-500' : ''
      }`}
    >
      <div
        className="flex cursor-grab items-center justify-center border-r-2 border-slate-400 bg-slate-100 text-slate-500 active:cursor-grabbing dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
        title="Drag to move this stop"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </div>

      <div className="min-w-0 border-r-2 border-slate-400 px-1.5 py-1 dark:border-slate-700 dark:border-slate-700">
        <div className="flex min-w-0 items-start justify-between gap-1">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1">
              {isHot && (
                <span className="rounded bg-red-600 px-1 text-[7px] font-black text-white">
                  HOT
                </span>
              )}

              {shipment.stays_in_canada && (
                <span className="rounded bg-red-700 px-1 text-[7px] font-black text-white">
                  CAN
                </span>
              )}

              <p className={`truncate text-[11px] font-black leading-tight ${nameColour}`}>
                {displayName}
              </p>
            </div>

            {referenceParts.length > 0 && (
              <p className="mt-0.5 truncate text-[8px] font-bold leading-tight text-inherit">
                {referenceParts.join(' • ')}
              </p>
            )}

            {metaParts.length > 0 && (
              <p className="mt-0.5 truncate text-[8px] font-bold leading-tight text-inherit">
                {metaParts.join(' • ')}
              </p>
            )}

            {boardDisplaySettings.showBoardNote && shipment.board_note && (
              <p className="mt-0.5 truncate text-[8px] font-bold leading-tight text-inherit">
                {shipment.board_note}
              </p>
            )}

            {boardDisplaySettings.showNormalNotes && shipment.notes && (
              <p className="mt-0.5 truncate text-[8px] font-bold leading-tight text-inherit">
                Note: {shipment.notes}
              </p>
            )}

            {boardDisplaySettings.showInternalNotes && shipment.internal_notes && (
              <p className="mt-0.5 truncate text-[8px] font-bold leading-tight text-inherit">
                Internal: {shipment.internal_notes}
              </p>
            )}

            {boardDisplaySettings.showFinDetails &&
              shipment.route_completed &&
              shipment.route_completed_by && (
                <p className="mt-0.5 truncate text-[8px] font-bold leading-tight text-inherit">
                  FIN by {shipment.route_completed_by}
                </p>
              )}
          </div>
        </div>

        {isBoardOnlyStop ? null : (
          <input
            type="text"
            value={draftNote}
            disabled={disabled}
            onChange={(event) => setDraftNote(event.target.value)}
            onBlur={() => onSaveBoardNote(draftNote)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.currentTarget.blur();
              }
            }}
            onDragStart={(event) => event.stopPropagation()}
            placeholder="Board note..."
            className="mt-1 w-full rounded border border-slate-300 bg-white px-1 py-0.5 text-[9px] font-semibold normal-case text-slate-950 outline-none placeholder:text-slate-400 focus:border-blue-500 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
        )}
      </div>

      <button
        type="button"
        onClick={onAction}
        disabled={disabled}
        className={`flex items-center justify-center text-[9px] font-black disabled:cursor-wait disabled:opacity-60 ${
          shipment.route_completed
            ? 'bg-green-600 text-white'
            : 'bg-white text-slate-500 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
        }`}
        title={actionTitle}
      >
        FIN
      </button>
    </div>
  );
}

function EmptyTruckRows({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="grid min-h-[28px] grid-cols-[18px_1fr_38px] border-b border-slate-200 text-[9px] text-slate-400 dark:border-slate-800 dark:text-slate-600"
        >
          <div className="border-r border-slate-200 dark:border-slate-800" />
          <div className="border-r border-slate-200 dark:border-slate-800 px-1 py-1">
            
          </div>
          <div />
        </div>
      ))}
    </>
  );
}

function EmptyPickupRows({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="grid min-h-[28px] grid-cols-[18px_1fr_24px_28px_28px_34px] border-b border-slate-200 text-[9px] text-slate-400 dark:border-slate-800 dark:text-slate-600"
        >
          <div className="border-r border-slate-200 dark:border-slate-800" />
          <div className="border-r border-slate-200 dark:border-slate-800 px-1 py-1">
            
          </div>
          <div className="border-r border-slate-200 dark:border-slate-800" />
          <div className="border-r border-slate-200 dark:border-slate-800" />
          <div className="border-r border-slate-200 dark:border-slate-800" />
          <div />
        </div>
      ))}
    </>
  );
}

function SmallCompanyPreview({ company }: { company: Company }) {
  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-dark-border dark:bg-slate-950 dark:text-slate-400">
      <p className="font-semibold text-slate-950 dark:text-slate-200">
        {company.name}
      </p>

      <p className="mt-1">
        {displayLocation(company.address, company.city)}
      </p>

      {company.postal_code && (
        <p>{company.postal_code}</p>
      )}

      {(company.contact_name || company.contact_phone) && (
        <p className="mt-1">
          {[company.contact_name, company.contact_phone].filter(Boolean).join(' • ')}
        </p>
      )}
    </div>
  );
}

function getRowDropPosition(
  element: HTMLDivElement,
  clientY: number
): 'before' | 'after' {
  const rectangle = element.getBoundingClientRect();
  const midpoint = rectangle.top + rectangle.height / 2;

  return clientY < midpoint ? 'before' : 'after';
}

function getTodayDateKey() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getDateKey(value?: string | null) {
  if (!value) {
    return '';
  }

  return String(value).slice(0, 10);
}

function shouldShowOnTodayPickupBoard(shipment: Shipment, todayDateKey: string) {
  const pickupDateKey = getDateKey(shipment.pickup_date);

  if (!pickupDateKey) {
    return false;
  }

  return pickupDateKey <= todayDateKey;
}

function sortShipmentsForBoard(a: Shipment, b: Shipment) {
  const aOrder = a.board_sort_order ?? 999;
  const bOrder = b.board_sort_order ?? 999;

  if (aOrder !== bOrder) {
    return aOrder - bOrder;
  }

  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
}

function getPickupColumnDisplayName(shipment: Shipment) {
  if (shipment.pickup_company_name && shipment.pickup_company_name.trim() !== '') {
    return shipment.pickup_company_name;
  }

  if (shipment.board_name && shipment.board_name.trim() !== '') {
    return shipment.board_name;
  }

  return (
    shipment.customer_company_name ||
    shipment.work_order_number ||
    shipment.delivery_company_name ||
    'Pickup'
  );
}

function getBoardDisplayName(shipment: Shipment, context: 'truck' | 'pickup') {
  if (shipment.board_name && shipment.board_name.trim() !== '') {
    return shipment.board_name;
  }

  if (shipment.pickup_company_name && shipment.pickup_company_name.trim() !== '') {
    return shipment.pickup_company_name;
  }

  if (context === 'truck') {
    return (
      shipment.customer_company_name ||
      shipment.work_order_number ||
      shipment.delivery_company_name ||
      'Stop'
    );
  }

  return (
    shipment.customer_company_name ||
    shipment.work_order_number ||
    shipment.delivery_company_name ||
    'Pickup'
  );
}

function getStopTypeLabel(stopType?: string | null) {
  if (stopType === 'pickup') return 'PU';
  if (stopType === 'pickup_and_delivery') return 'PU+DEL';
  if (stopType === 'cross_dock') return 'XDOCK';
  if (stopType === 'warehouse') return 'WH';
  return 'DEL';
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