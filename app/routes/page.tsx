'use client';

import { useEffect, useState } from 'react';
import MainLayout from '@/components/MainLayout';
import Header from '@/components/Header';
import { CheckCircle2, MapPin, Navigation2, RefreshCw, Truck as TruckIcon } from 'lucide-react';
import {
  getShipments,
  getTrucks,
} from '@/lib/database';
import { Shipment, Truck } from '@/types';

interface TruckRoute {
  truck: Truck;
  shipments: Shipment[];
  totalSkids: number;
  totalWeightLbs: number;
  totalStops: number;
  totalRouteNotes: number;
  totalFinished: number;
}

export default function RoutesPage() {
  const [routes, setRoutes] = useState<TruckRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTruck, setSelectedTruck] = useState<string | null>(null);

  useEffect(() => {
    loadRoutes();
  }, []);

  const loadRoutes = async () => {
    try {
      setLoading(true);

      const [trucks, shipments] = await Promise.all([
        getTrucks(),
        getShipments(),
      ]);

      const activeShipments = shipments
        .filter((shipment) => shipment.status !== 'delivered')
        .filter((shipment) => Boolean(shipment.assigned_truck_id));

      const truckRoutes = trucks.map((truck) => {
        const truckShipments = activeShipments
          .filter((shipment) => shipment.assigned_truck_id === truck.id)
          .sort(sortRouteStops);

        const realFreightShipments = truckShipments.filter(
          (shipment) => shipment.dispatch_task_type !== 'board_stop'
        );

        const routeNotes = truckShipments.filter(
          (shipment) => shipment.dispatch_task_type === 'board_stop'
        );

        const totalSkids = realFreightShipments.reduce(
          (sum, shipment) => sum + Number(shipment.number_of_skids || 0),
          0
        );

        const totalWeightLbs = realFreightShipments.reduce(
          (sum, shipment) => sum + Number(shipment.weight_lbs || shipment.weight_kg || 0),
          0
        );

        const totalFinished = truckShipments.filter(
          (shipment) => shipment.route_completed
        ).length;

        return {
          truck,
          shipments: truckShipments,
          totalSkids,
          totalWeightLbs,
          totalStops: truckShipments.length,
          totalRouteNotes: routeNotes.length,
          totalFinished,
        };
      });

      const routesWithStops = truckRoutes.filter((route) => route.totalStops > 0);

      setRoutes(routesWithStops);

      if (!selectedTruck && routesWithStops.length > 0) {
        setSelectedTruck(routesWithStops[0].truck.id);
      }

      if (
        selectedTruck &&
        routesWithStops.length > 0 &&
        !routesWithStops.some((route) => route.truck.id === selectedTruck)
      ) {
        setSelectedTruck(routesWithStops[0].truck.id);
      }

      if (routesWithStops.length === 0) {
        setSelectedTruck(null);
      }
    } catch (error) {
      console.error('Error loading routes:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectedRoute = routes.find((route) => route.truck.id === selectedTruck) || null;

  if (loading) {
    return (
      <MainLayout>
        <Header title="Routes" subtitle="View active truck routes" />

        <div className="py-12 text-center">
          <p className="text-slate-400">Loading routes...</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <Header
        title="Routes"
        subtitle="View active route stops, route notes, and assigned freight by truck"
      />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-slate-400">
            This page follows the truck board order. Checking FIN on the board will not reorder stops.
          </p>
        </div>

        <button
          type="button"
          onClick={loadRoutes}
          className="btn-secondary flex items-center justify-center gap-2"
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh Routes
        </button>
      </div>

      {routes.length === 0 ? (
        <div className="card py-12 text-center">
          <p className="text-slate-400">
            No active routes yet. Assign pickups or type route notes on the truck board.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          <div className="card h-fit lg:col-span-1">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-white">
              <TruckIcon className="h-5 w-5 text-blue-400" />
              Active Routes
            </h3>

            <div className="space-y-2">
              {routes.map((route) => {
                const selected = selectedTruck === route.truck.id;

                return (
                  <button
                    key={route.truck.id}
                    type="button"
                    onClick={() => setSelectedTruck(route.truck.id)}
                    className={`w-full rounded-lg border p-3 text-left transition-colors ${
                      selected
                        ? 'border-blue-500 bg-blue-600'
                        : 'border-dark-border bg-slate-800 hover:bg-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-white">
                          {displayValue(route.truck.truck_number)}
                        </p>

                        <p className={`mt-1 truncate text-xs ${selected ? 'text-blue-100' : 'text-slate-400'}`}>
                          {displayValue(route.truck.driver_name, 'No driver')}
                        </p>
                      </div>

                      {route.totalFinished > 0 && (
                        <span className="rounded bg-green-700 px-2 py-1 text-[10px] font-black text-white">
                          {route.totalFinished} FIN
                        </span>
                      )}
                    </div>

                    <p className={`mt-2 text-xs ${selected ? 'text-blue-100' : 'text-slate-500'}`}>
                      {route.totalStops} stop(s) • {route.totalSkids} skid(s)
                    </p>

                    {route.totalRouteNotes > 0 && (
                      <p className={`mt-1 text-xs ${selected ? 'text-blue-100' : 'text-slate-500'}`}>
                        {route.totalRouteNotes} route note(s)
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-3">
            {!selectedRoute ? (
              <div className="card py-12 text-center">
                <p className="text-slate-400">Select a truck to view its route.</p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="card">
                  <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h2 className="text-2xl font-bold text-white">
                        {displayValue(selectedRoute.truck.truck_number)}
                      </h2>

                      <p className="mt-1 text-slate-400">
                        Driver: {displayValue(selectedRoute.truck.driver_name, 'No driver assigned')}
                      </p>
                    </div>

                    <div className="text-left sm:text-right">
                      <p className="text-3xl font-bold text-blue-400">
                        {selectedRoute.totalStops}
                      </p>

                      <p className="text-sm text-slate-400">
                        Route stop(s)
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 border-t border-dark-border pt-4 sm:grid-cols-4">
                    <RouteStat label="Total Skids" value={String(selectedRoute.totalSkids)} />

                    <RouteStat
                      label="Total Weight"
                      value={`${selectedRoute.totalWeightLbs.toLocaleString()} lbs`}
                    />

                    <RouteStat
                      label="Route Notes"
                      value={String(selectedRoute.totalRouteNotes)}
                    />

                    <RouteStat
                      label="Finished"
                      value={`${selectedRoute.totalFinished}/${selectedRoute.totalStops}`}
                    />
                  </div>

                  <div className="mt-6 rounded-lg border border-dark-border bg-slate-800 p-4 text-center">
                    <div className="mb-2 flex items-center justify-center gap-2 text-slate-400">
                      <MapPin className="h-5 w-5" />
                      <p>Google Maps Integration</p>
                    </div>

                    <p className="text-xs text-slate-500">
                      Later this can show optimized routing, ETA, distance, and live truck location.
                    </p>
                  </div>
                </div>

                <div className="card">
                  <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-white">
                    <Navigation2 className="h-5 w-5 text-blue-400" />
                    Route Stops
                  </h3>

                  <div className="space-y-3">
                    {selectedRoute.shipments.map((shipment, index) => {
                      const isBoardOnlyStop = shipment.dispatch_task_type === 'board_stop';

                      return (
                        <div
                          key={shipment.id}
                          className={`rounded-lg border p-4 ${
                            shipment.route_completed
                              ? 'border-green-800 bg-green-950/50'
                              : isBoardOnlyStop
                                ? 'border-slate-700 bg-slate-900'
                                : shipment.stays_in_canada
                                  ? 'border-red-800 bg-red-950/50'
                                  : 'border-dark-border bg-slate-800'
                          }`}
                        >
                          <div className="flex items-start gap-4">
                            <div
                              className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                                shipment.route_completed
                                  ? 'bg-green-700'
                                  : isBoardOnlyStop
                                    ? 'bg-slate-700'
                                    : 'bg-blue-600'
                              }`}
                            >
                              <span className="text-sm font-bold text-white">
                                {index + 1}
                              </span>
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="mb-2 flex flex-wrap items-center gap-2">
                                {shipment.route_completed && (
                                  <span className="flex items-center gap-1 rounded bg-green-700 px-2 py-1 text-xs font-semibold text-white">
                                    <CheckCircle2 className="h-3 w-3" />
                                    FIN
                                  </span>
                                )}

                                {isBoardOnlyStop && (
                                  <span className="rounded bg-slate-700 px-2 py-1 text-xs font-semibold text-white">
                                    ROUTE NOTE
                                  </span>
                                )}

                                {!isBoardOnlyStop && shipment.stays_in_canada && (
                                  <span className="rounded bg-red-700 px-2 py-1 text-xs font-semibold text-white">
                                    CANADA
                                  </span>
                                )}

                                {!isBoardOnlyStop && (
                                  <span className="rounded bg-slate-700 px-2 py-1 text-xs font-semibold text-slate-200">
                                    {getStopTypeLabel(shipment.board_stop_type)}
                                  </span>
                                )}
                              </div>

                              {isBoardOnlyStop ? (
                                <RouteNoteStop shipment={shipment} />
                              ) : (
                                <FreightStop shipment={shipment} />
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="card">
                  <h3 className="mb-4 text-lg font-bold text-white">
                    Route Optimization
                  </h3>

                  <p className="mb-4 text-slate-400">
                    This section is ready for future Google Maps routing features.
                  </p>

                  <ul className="space-y-2 text-sm text-slate-400">
                    <li className="flex items-center gap-2">
                      <span className="text-yellow-500">•</span>
                      Calculate total distance and estimated drive time
                    </li>

                    <li className="flex items-center gap-2">
                      <span className="text-yellow-500">•</span>
                      Optimize stop order only when dispatch chooses to
                    </li>

                    <li className="flex items-center gap-2">
                      <span className="text-yellow-500">•</span>
                      Show real-time truck location with Motive API
                    </li>

                    <li className="flex items-center gap-2">
                      <span className="text-yellow-500">•</span>
                      Provide turn-by-turn directions
                    </li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </MainLayout>
  );
}

function RouteStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-sm text-slate-400">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

function RouteNoteStop({ shipment }: { shipment: Shipment }) {
  return (
    <div>
      <p className="text-lg font-bold text-white">
        {displayValue(shipment.board_name, 'Route note')}
      </p>

      {shipment.board_note && (
        <p className="mt-2 rounded border border-yellow-800/70 bg-yellow-950/40 px-3 py-2 text-sm font-semibold text-yellow-200">
          {shipment.board_note}
        </p>
      )}

      {shipment.route_completed && (
        <p className="mt-2 text-xs text-green-300">
          Completed by {displayValue(shipment.route_completed_by, 'driver')}
        </p>
      )}
    </div>
  );
}

function FreightStop({ shipment }: { shipment: Shipment }) {
  const shipmentWeight = shipment.weight_lbs || shipment.weight_kg || null;

  return (
    <div>
      <p className="font-semibold text-white">
        {displayValue(getBoardDisplayName(shipment), 'Freight stop')}
      </p>

      {shipment.work_order_number && (
        <p className="mt-1 text-xs font-semibold text-blue-300">
          {shipment.work_order_number}
        </p>
      )}

      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-dark-border bg-slate-950/60 p-3">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">
            Pickup
          </p>

          <p className="mt-1 font-semibold text-white">
            {displayValue(shipment.pickup_company_name)}
          </p>

          <p className="mt-1 text-xs text-slate-400">
            {displayLocation(shipment.pickup_address, shipment.pickup_city)}
          </p>

          {(shipment.pickup_date || shipment.pickup_time) && (
            <p className="mt-1 text-xs text-slate-500">
              {displayDateTime(shipment.pickup_date, shipment.pickup_time)}
            </p>
          )}
        </div>

        <div className="rounded-lg border border-dark-border bg-slate-950/60 p-3">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">
            Delivery
          </p>

          <p className="mt-1 font-semibold text-white">
            {displayValue(shipment.delivery_company_name)}
          </p>

          <p className="mt-1 text-xs text-slate-400">
            {displayLocation(shipment.delivery_address, shipment.delivery_city)}
          </p>

          {(shipment.delivery_date || shipment.delivery_time) && (
            <p className="mt-1 text-xs text-slate-500">
              {displayDateTime(shipment.delivery_date, shipment.delivery_time)}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded bg-slate-700 px-2 py-1 text-xs text-slate-200">
          {displayValue(shipment.number_of_skids, 'Unknown')} skids
        </span>

        <span className="rounded bg-slate-700 px-2 py-1 text-xs text-slate-200">
          {shipmentWeight
            ? `${Number(shipmentWeight).toLocaleString()} lbs`
            : 'Weight unknown'}
        </span>

        {shipment.customs_docs_received ? (
          <span className="rounded bg-green-800 px-2 py-1 text-xs text-green-100">
            DOC YES
          </span>
        ) : (
          <span className="rounded bg-red-900 px-2 py-1 text-xs text-red-100">
            DOC NO
          </span>
        )}
      </div>

      {shipment.board_note && (
        <p className="mt-3 rounded border border-yellow-800/70 bg-yellow-950/40 px-3 py-2 text-sm font-semibold text-yellow-200">
          {shipment.board_note}
        </p>
      )}

      {shipment.notes && (
        <p className="mt-2 text-sm italic text-slate-400">
          Note: {shipment.notes}
        </p>
      )}

      {shipment.route_completed && (
        <p className="mt-2 text-xs text-green-300">
          Completed by {displayValue(shipment.route_completed_by, 'driver')}
        </p>
      )}
    </div>
  );
}

function sortRouteStops(a: Shipment, b: Shipment) {
  const aOrder =
    a.board_sort_order === null || a.board_sort_order === undefined
      ? 999
      : Number(a.board_sort_order);

  const bOrder =
    b.board_sort_order === null || b.board_sort_order === undefined
      ? 999
      : Number(b.board_sort_order);

  if (aOrder !== bOrder) {
    return aOrder - bOrder;
  }

  return safeString(a.created_at).localeCompare(safeString(b.created_at));
}

function getBoardDisplayName(shipment: Shipment) {
  if (shipment.board_name && shipment.board_name.trim() !== '') {
    return shipment.board_name;
  }

  return (
    shipment.delivery_company_name ||
    shipment.pickup_company_name ||
    'Freight stop'
  );
}

function getStopTypeLabel(stopType?: string | null) {
  if (stopType === 'pickup') return 'Pickup';
  if (stopType === 'pickup_and_delivery') return 'Pickup + Delivery';
  if (stopType === 'cross_dock') return 'Cross Dock';
  if (stopType === 'warehouse') return 'Warehouse';
  return 'Delivery';
}

function displayValue(
  value?: string | number | null,
  fallback = 'Unknown'
) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  return value;
}

function displayLocation(
  address?: string | null,
  city?: string | null
) {
  const parts = [address, city].filter(
    (part) => part && String(part).trim() !== ''
  );

  if (parts.length === 0) {
    return 'Location unknown';
  }

  return parts.join(', ');
}

function displayDateTime(
  date?: string | null,
  time?: string | null
) {
  const parts = [date, time].filter(
    (part) => part && String(part).trim() !== ''
  );

  if (parts.length === 0) {
    return 'No time set';
  }

  return parts.join(' at ');
}

function safeString(value?: string | null) {
  return value || '';
}