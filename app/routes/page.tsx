'use client';

import { useEffect, useMemo, useState } from 'react';
import MainLayout from '@/components/MainLayout';
import Header from '@/components/Header';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Navigation2,
  RefreshCw,
  Route,
  Truck as TruckIcon,
} from 'lucide-react';
import {
  getCompanies,
  getShipments,
  getTrucks,
} from '@/lib/database';
import { Company, Shipment, Truck } from '@/types';

interface TruckRoute {
  truck: Truck;
  routeDateKey: string;
  shipments: Shipment[];
  gpsReadyShipments: Shipment[];
  missingGpsShipments: Shipment[];
  routeNoteShipments: Shipment[];
  totalSkids: number;
  totalWeightLbs: number;
  totalStops: number;
  totalFreightStops: number;
  totalRouteNotes: number;
  totalFinished: number;
}

interface GoogleRouteStop {
  shipmentId: string;
  label: string;
  latitude: number;
  longitude: number;
  routeBucket?: string;
  routeBucketLabel?: string;
  address?: string | null;
  city?: string | null;
  stopPurpose?: 'delivery' | 'pickup';
  operationalPhase?: number;
  operationalPhaseLabel?: string;
}

interface GoogleTruckRouteEstimate {
  originAddress: string;
  distanceMeters: number;
  distanceKm: number;
  distanceText: string;
  duration: string;
  durationText: string;
  staticDuration: string;
  staticDurationText: string;
  orderedStops: GoogleRouteStop[];
}

export default function RoutesPage() {
  const [routes, setRoutes] = useState<TruckRoute[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTruck, setSelectedTruck] = useState<string | null>(null);
  const [routeDate, setRouteDate] = useState(getTodayDateKey());
  const [googleRoutes, setGoogleRoutes] = useState<Record<string, GoogleTruckRouteEstimate>>({});
  const [calculatingTruckId, setCalculatingTruckId] = useState<string | null>(null);

  useEffect(() => {
    loadRoutes();
  }, [routeDate]);

  const loadRoutes = async () => {
    try {
      setLoading(true);

      const [trucks, shipments, loadedCompanies] = await Promise.all([
        getTrucks(),
        getShipments(),
        getCompanies(),
      ]);

      setCompanies(loadedCompanies || []);

      const activeShipments = shipments
        .filter((shipment) => shipment.status !== 'delivered')
        .filter((shipment) => Boolean(shipment.assigned_truck_id))
        .filter((shipment) => shouldShowShipmentOnRouteDate(shipment, routeDate));

      const truckRoutes = trucks.map((truck) => {
        const truckShipments = activeShipments
          .filter((shipment) => shipment.assigned_truck_id === truck.id)
          .sort(sortRouteStops);

        const realFreightShipments = truckShipments.filter(
          (shipment) => shipment.dispatch_task_type !== 'board_stop'
        );

        const routeNoteShipments = truckShipments.filter(
          (shipment) => shipment.dispatch_task_type === 'board_stop'
        );

        const gpsReadyShipments = realFreightShipments.filter(
          (shipment) => buildOperationalStopsForShipment(shipment, loadedCompanies || [], routeDate).length > 0
        );

        const missingGpsShipments = realFreightShipments.filter(
          (shipment) => buildOperationalStopsForShipment(shipment, loadedCompanies || [], routeDate).length === 0
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
          routeDateKey: routeDate,
          shipments: truckShipments,
          gpsReadyShipments,
          missingGpsShipments,
          routeNoteShipments,
          totalSkids,
          totalWeightLbs,
          totalStops: truckShipments.length,
          totalFreightStops: realFreightShipments.length,
          totalRouteNotes: routeNoteShipments.length,
          totalFinished,
        };
      });

      const routesWithStops = truckRoutes.filter((route) => route.totalStops > 0);

      setRoutes(routesWithStops);
      setGoogleRoutes({});
      setCalculatingTruckId(null);

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
      alert('Could not load routes.');
    } finally {
      setLoading(false);
    }
  };

  const selectedRoute = routes.find((route) => route.truck.id === selectedTruck) || null;
  const selectedGoogleRoute = selectedRoute ? googleRoutes[selectedRoute.truck.id] : undefined;

  const totalActiveStops = useMemo(() => {
    return routes.reduce((sum, route) => sum + route.totalStops, 0);
  }, [routes]);

  const totalGpsReadyStops = useMemo(() => {
    return routes.reduce((sum, route) => sum + route.gpsReadyShipments.length, 0);
  }, [routes]);

  const totalMissingGpsStops = useMemo(() => {
    return routes.reduce((sum, route) => sum + route.missingGpsShipments.length, 0);
  }, [routes]);

  const calculateGoogleRoute = async (route: TruckRoute) => {
    try {
      const stopsWithGps = buildGoogleStopsForRoute(route, companies);

      if (stopsWithGps.length < 1) {
        alert('This truck needs at least one GPS-ready pickup or delivery stop to calculate a unit route.');
        return;
      }

      if (stopsWithGps.length > 26) {
        alert(
          'This truck has too many GPS-ready stops for this route calculation. Limit is 26 stops because the home office is always used as the fixed start.'
        );
        return;
      }

      setCalculatingTruckId(route.truck.id);

      const phaseGroups = groupStopsByOperationalPhase(stopsWithGps);
      const phaseEstimates: GoogleTruckRouteEstimate[] = [];
      let usedManualFallback = false;

      for (const phaseStops of phaseGroups) {
        if (phaseStops.length <= 1) {
          phaseEstimates.push(buildManualOperationalRouteEstimate(phaseStops));
          usedManualFallback = true;
          continue;
        }

        try {
          const response = await fetch('/api/google-truck-route', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            cache: 'no-store',
            body: JSON.stringify({
              stops: phaseStops,
            }),
          });

          const data = await response.json();

          if (!response.ok) {
            console.warn('Google could not calculate this unit route phase:', data.error || data);
            phaseEstimates.push(buildManualOperationalRouteEstimate(phaseStops));
            usedManualFallback = true;
            continue;
          }

          phaseEstimates.push(data as GoogleTruckRouteEstimate);
        } catch (phaseError) {
          console.warn('Google route phase failed:', phaseError);
          phaseEstimates.push(buildManualOperationalRouteEstimate(phaseStops));
          usedManualFallback = true;
        }
      }

      const estimate = combinePhaseRouteEstimates(phaseEstimates, stopsWithGps, usedManualFallback);

      setGoogleRoutes((current) => ({
        ...current,
        [route.truck.id]: estimate,
      }));
    } catch (error) {
      console.error('Unit route error:', error);

      const stopsWithGps = buildGoogleStopsForRoute(route, companies);

      if (stopsWithGps.length > 0) {
        setGoogleRoutes((current) => ({
          ...current,
          [route.truck.id]: buildManualOperationalRouteEstimate(stopsWithGps),
        }));
      } else {
        alert(
          error instanceof Error
            ? error.message
            : 'Could not calculate this unit route.'
        );
      }
    } finally {
      setCalculatingTruckId(null);
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <Header title="Routes" subtitle="Optimize delivery order for freight already assigned to trucks" />

        <div className="rounded-2xl border border-slate-200 bg-white shadow-soft dark:border-dark-border dark:bg-dark-card dark:shadow-soft-dark py-12 text-center">
          <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-blue-700 dark:text-blue-300" />
          <p className="text-slate-700 dark:text-slate-300">Loading routes...</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <Header
        title="Routes"
        subtitle="Driver route optimization: sequence the stops after the routing planner assigns freight to trucks"
      />

      <div className="mb-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm dark:border-blue-900 dark:bg-blue-950/30">
        <p className="text-sm font-black uppercase tracking-wide text-blue-800 dark:text-blue-200">
          Route workflow
        </p>

        <p className="mt-1 text-sm font-semibold leading-6 text-blue-950 dark:text-blue-100">
          This page builds the selected route date only. Tomorrow pickups can be assigned now, but they will not show on today's driver route.
        </p>
      </div>

      <div className="mb-6 rounded-2xl border border-slate-200 bg-white shadow-soft dark:border-dark-border dark:bg-dark-card dark:shadow-soft-dark p-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-950 dark:text-white">
              Driver route optimizer
            </h2>

            <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
              Pick a route date, then build the unit route. Pickup stops use pickup date; delivery stops use delivery date when available.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block">
              <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-400">
                Route Date
              </span>

              <input
                type="date"
                value={routeDate}
                onClick={(event) => {
                  try {
                    event.currentTarget.showPicker?.();
                  } catch {
                    // Normal date input still works.
                  }
                }}
                onFocus={(event) => {
                  try {
                    event.currentTarget.showPicker?.();
                  } catch {
                    // Normal date input still works.
                  }
                }}
                onChange={(event) => {
                  setRouteDate(event.target.value || getTodayDateKey());
                  setGoogleRoutes({});
                }}
                className="input-field h-11 min-w-[170px] cursor-pointer font-black"
              />

              <p className="mt-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
                {formatFriendlyRouteDate(routeDate)}
              </p>
            </label>

            <button
              type="button"
              onClick={loadRoutes}
              className="btn-secondary flex h-11 items-center justify-center gap-2"
              disabled={loading || Boolean(calculatingTruckId)}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh Route Stops
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <TopStat label="Trucks" value={String(routes.length)} />
          <TopStat label="Active Stops" value={String(totalActiveStops)} />
          <TopStat label="GPS Ready" value={String(totalGpsReadyStops)} />
          <TopStat label="Need GPS" value={String(totalMissingGpsStops)} />
        </div>
      </div>

      {routes.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-soft dark:border-dark-border dark:bg-dark-card dark:shadow-soft-dark py-12 text-center">
          <TruckIcon className="mx-auto mb-3 h-8 w-8 text-slate-700 dark:text-slate-400" />
          <p className="font-semibold text-slate-950 dark:text-white">No routes for this date.</p>
          <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
            Assigned stops only appear here when their pickup or delivery date matches the selected route date.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          <div className="h-fit rounded-2xl border border-slate-200 bg-white shadow-soft dark:border-dark-border dark:bg-dark-card dark:shadow-soft-dark p-5 lg:col-span-1">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-black text-slate-950 dark:text-white">
              <TruckIcon className="h-5 w-5 text-blue-700 dark:text-blue-400" />
              Trucks
            </h3>

            <div className="space-y-2">
              {routes.map((route) => {
                const selected = selectedTruck === route.truck.id;
                const routeEstimate = googleRoutes[route.truck.id];

                return (
                  <button
                    key={route.truck.id}
                    type="button"
                    onClick={() => setSelectedTruck(route.truck.id)}
                    className={`w-full rounded-xl border p-3 text-left transition-colors ${
                      selected
                        ? 'border-blue-500 bg-blue-600'
                        : 'border-slate-200 bg-white dark:border-dark-border dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p
                          className={`truncate text-lg font-black ${
                            selected ? 'text-white' : 'text-slate-950 dark:text-white'
                          }`}
                        >
                          {displayValue(route.truck.truck_number)}
                        </p>

                        <p className={`mt-1 truncate text-xs ${selected ? 'text-blue-900 dark:text-blue-100' : 'text-slate-700 dark:text-slate-300'}`}>
                          {displayValue(route.truck.driver_name, 'No driver')}
                        </p>
                      </div>

                      {route.totalFinished > 0 && (
                        <span className="rounded bg-green-700 px-2 py-1 text-[10px] font-black text-white">
                          {route.totalFinished} FIN
                        </span>
                      )}
                    </div>

                    <p className={`mt-2 text-xs ${selected ? 'text-white' : 'text-slate-700 dark:text-slate-400'}`}>
                      {route.totalStops} stop(s) • {route.totalSkids} skid(s)
                    </p>

                    <p className={`mt-1 text-xs font-semibold ${selected ? 'text-white' : 'text-blue-700 dark:text-blue-300'}`}>
                      {formatFriendlyRouteDate(route.routeDateKey)}
                    </p>

                    <p className={`mt-1 text-xs ${selected ? 'text-white' : 'text-slate-700 dark:text-slate-400'}`}>
                      GPS: {route.gpsReadyShipments.length}/{route.totalFreightStops}
                    </p>

                    {routeEstimate && (
                      <p className={`mt-1 text-xs font-semibold ${selected ? 'text-white' : 'text-green-700 dark:text-green-300'}`}>
                        Google: {routeEstimate.durationText} • {routeEstimate.distanceText}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-3">
            {!selectedRoute ? (
              <div className="rounded-2xl border border-slate-200 bg-white shadow-soft dark:border-dark-border dark:bg-dark-card dark:shadow-soft-dark py-12 text-center">
                <p className="text-slate-700 dark:text-slate-300">Select a truck to view its route.</p>
              </div>
            ) : (
              <div className="space-y-6">
                <RouteHeaderCard
                  route={selectedRoute}
                  googleRoute={selectedGoogleRoute}
                  calculating={calculatingTruckId === selectedRoute.truck.id}
                  onCalculate={() => calculateGoogleRoute(selectedRoute)}
                />

                <GoogleStopsDebugCard
                  route={selectedRoute}
                  companies={companies}
                />

                {selectedGoogleRoute && (
                  <GoogleRouteResultCard
                    route={selectedRoute}
                    googleRoute={selectedGoogleRoute}
                  />
                )}

                {(selectedRoute.missingGpsShipments.length > 0 ||
                  selectedRoute.routeNoteShipments.length > 0) && (
                  <RouteWarningCard route={selectedRoute} />
                )}

                <RouteStopsCard
                  route={selectedRoute}
                  googleRoute={selectedGoogleRoute}
                  companies={companies}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </MainLayout>
  );
}

function RouteHeaderCard({
  route,
  googleRoute,
  calculating,
  onCalculate,
}: {
  route: TruckRoute;
  googleRoute?: GoogleTruckRouteEstimate;
  calculating: boolean;
  onCalculate: () => void;
}) {
  const googleDisabled =
    calculating ||
    route.gpsReadyShipments.length < 1 ||
    route.gpsReadyShipments.length > 26;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-soft dark:border-dark-border dark:bg-dark-card dark:shadow-soft-dark p-5">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-3xl font-black text-slate-950 dark:text-white">
            {displayValue(route.truck.truck_number)}
          </h2>

          <p className="mt-1 text-slate-700 dark:text-slate-300">
            Driver: {displayValue(route.truck.driver_name, 'No driver assigned')}
          </p>

          <p className="mt-1 text-sm font-black text-blue-700 dark:text-blue-300">
            Route Date: {formatFriendlyRouteDate(route.routeDateKey)}
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:items-end">
          <button
            type="button"
            onClick={onCalculate}
            className="btn-primary flex items-center justify-center gap-2"
            disabled={googleDisabled}
          >
            {calculating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Route className="h-4 w-4" />
            )}
            {calculating ? 'Calculating...' : googleRoute ? 'Recalculate Unit Route' : 'Calculate Unit Route'}
          </button>

          {route.gpsReadyShipments.length < 1 && (
            <p className="text-xs text-amber-700 dark:text-yellow-300">
              Needs at least 1 GPS-ready freight stop.
            </p>
          )}

          {route.gpsReadyShipments.length > 26 && (
            <p className="text-xs text-amber-700 dark:text-yellow-300">
              Too many GPS stops. Max is 26.
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <RouteStat label="Stops" value={String(route.totalStops)} />
        <RouteStat label="Freight" value={String(route.totalFreightStops)} />
        <RouteStat label="Skids" value={String(route.totalSkids)} />
        <RouteStat
          label="Weight"
          value={`${route.totalWeightLbs.toLocaleString()} lbs`}
        />
        <RouteStat
          label="Finished"
          value={`${route.totalFinished}/${route.totalStops}`}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SmallInfoBox
          label="GPS Ready"
          value={`${route.gpsReadyShipments.length}/${route.totalFreightStops}`}
          tone={route.missingGpsShipments.length === 0 ? 'green' : 'yellow'}
        />

        <SmallInfoBox
          label="Route Notes"
          value={String(route.totalRouteNotes)}
          tone={route.totalRouteNotes > 0 ? 'blue' : 'slate'}
        />

        <SmallInfoBox
          label="Unit Route"
          value={googleRoute ? `${googleRoute.durationText}` : 'Not calculated'}
          tone={googleRoute ? 'green' : 'slate'}
        />
      </div>
    </div>
  );
}

function GoogleStopsDebugCard({
  route,
  companies,
}: {
  route: TruckRoute;
  companies: Company[];
}) {
  const [open, setOpen] = useState(false);
  const stops = buildGoogleStopsForRoute(route, companies);
  const badStops = stops.filter((stop) => getStopDebugWarnings(stop).length > 0);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft dark:border-dark-border dark:bg-dark-card dark:shadow-soft-dark">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-4 text-left"
      >
        <div>
          <h3 className="text-lg font-black text-slate-950 dark:text-white">
            Debug Google Stops
          </h3>

          <p className="mt-1 text-sm font-medium text-slate-600 dark:text-slate-400">
            Shows exactly what this page sends to Google for {displayValue(route.truck.truck_number)} on {formatFriendlyRouteDate(route.routeDateKey)}.
          </p>
        </div>

        <span
          className={`rounded-full px-3 py-1 text-xs font-black ${
            badStops.length > 0
              ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200'
              : 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200'
          }`}
        >
          {stops.length} stop(s) • {badStops.length} warning(s)
        </span>
      </button>

      {open && (
        <div className="mt-4 space-y-3 border-t border-slate-200 pt-4 dark:border-dark-border">
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-950 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
            If Google fails, look for a bad coordinate, reversed latitude/longitude, a coordinate far away from the address, or a stop that has an address but no usable GPS.
          </div>

          {stops.length === 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
              No GPS-ready route stops for this selected route date.
            </div>
          ) : (
            <div className="custom-board-scrollbar max-h-[520px] overflow-y-auto rounded-xl border border-slate-200 dark:border-dark-border">
              <table className="w-full min-w-[950px] border-collapse text-left text-xs">
                <thead className="sticky top-0 z-10 bg-slate-100 text-[10px] font-black uppercase tracking-wide text-slate-600 dark:bg-slate-900 dark:text-slate-400">
                  <tr>
                    <th className="border-b border-slate-200 px-3 py-2 dark:border-dark-border">#</th>
                    <th className="border-b border-slate-200 px-3 py-2 dark:border-dark-border">Phase</th>
                    <th className="border-b border-slate-200 px-3 py-2 dark:border-dark-border">Stop</th>
                    <th className="border-b border-slate-200 px-3 py-2 dark:border-dark-border">Address</th>
                    <th className="border-b border-slate-200 px-3 py-2 dark:border-dark-border">GPS Sent</th>
                    <th className="border-b border-slate-200 px-3 py-2 dark:border-dark-border">Warnings</th>
                    <th className="border-b border-slate-200 px-3 py-2 dark:border-dark-border">Test</th>
                  </tr>
                </thead>

                <tbody>
                  {stops.map((stop, index) => {
                    const warnings = getStopDebugWarnings(stop);
                    const mapsUrl = buildSingleStopGoogleMapsUrl(stop);

                    return (
                      <tr
                        key={`${stop.shipmentId}-${index}`}
                        className="border-b border-slate-100 bg-white align-top last:border-b-0 dark:border-slate-800 dark:bg-slate-950"
                      >
                        <td className="px-3 py-3 font-black text-slate-950 dark:text-white">
                          {index + 1}
                        </td>

                        <td className="px-3 py-3">
                          <div className="space-y-1">
                            <span className="inline-flex rounded bg-blue-700 px-2 py-1 text-[10px] font-black text-white">
                              {stop.operationalPhaseLabel || 'Route Stop'}
                            </span>

                            <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                              {stop.stopPurpose || 'delivery'}
                            </p>
                          </div>
                        </td>

                        <td className="px-3 py-3">
                          <p className="max-w-[190px] truncate font-black text-slate-950 dark:text-white">
                            {stop.label}
                          </p>

                          <p className="mt-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                            ID: {stop.shipmentId}
                          </p>
                        </td>

                        <td className="px-3 py-3">
                          <p className="max-w-[240px] text-xs font-semibold text-slate-700 dark:text-slate-300">
                            {[stop.address, stop.city].filter(Boolean).join(', ') || 'No address on stop'}
                          </p>
                        </td>

                        <td className="px-3 py-3">
                          <code className="rounded bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-900 dark:bg-slate-900 dark:text-slate-100">
                            {Number(stop.latitude).toFixed(6)}, {Number(stop.longitude).toFixed(6)}
                          </code>
                        </td>

                        <td className="px-3 py-3">
                          {warnings.length > 0 ? (
                            <div className="space-y-1">
                              {warnings.map((warning) => (
                                <p
                                  key={warning}
                                  className="rounded bg-red-100 px-2 py-1 text-[10px] font-black text-red-800 dark:bg-red-950 dark:text-red-200"
                                >
                                  {warning}
                                </p>
                              ))}
                            </div>
                          ) : (
                            <span className="rounded bg-green-100 px-2 py-1 text-[10px] font-black text-green-800 dark:bg-green-950 dark:text-green-200">
                              Looks OK
                            </span>
                          )}
                        </td>

                        <td className="px-3 py-3">
                          <a
                            href={mapsUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-[10px] font-black text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Open
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {route.missingGpsShipments.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
              <h4 className="text-sm font-black text-amber-900 dark:text-amber-100">
                Assigned freight hidden from Google because it has no usable GPS for this route date
              </h4>

              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {route.missingGpsShipments.map((shipment) => (
                  <div
                    key={shipment.id}
                    className="rounded-lg border border-amber-200 bg-white p-3 dark:border-amber-900 dark:bg-slate-950"
                  >
                    <p className="font-black text-slate-950 dark:text-white">
                      {getBoardDisplayName(shipment)}
                    </p>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                      Pickup: {displayLocation(shipment.pickup_address, shipment.pickup_city)}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Delivery: {displayLocation(shipment.delivery_address, shipment.delivery_city)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


function GoogleRouteResultCard({
  route,
  googleRoute,
}: {
  route: TruckRoute;
  googleRoute: GoogleTruckRouteEstimate;
}) {
  const googleMapsUrl = buildGoogleMapsDirectionsUrl(googleRoute.orderedStops);

  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/20 p-5">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-xl font-black text-slate-950 dark:text-white">
            <Route className="h-5 w-5 text-blue-700 dark:text-blue-300" />
            Unit route estimate
          </h3>

          <p className="mt-1 text-sm text-blue-900 dark:text-blue-800 dark:text-blue-200">
            This route starts at {googleRoute.originAddress || '146 Cushman Road, St. Catharines'}. The unit route keeps US deliveries before US pickups, then keeps the rest of the assigned stops in one combined route.
          </p>
        </div>

        {googleMapsUrl && (
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary flex items-center justify-center gap-2"
          >
            <ExternalLink className="h-4 w-4" />
            Open in Google Maps
          </a>
        )}
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <GoogleStat label="Distance" value={googleRoute.distanceText} />
        <GoogleStat label="Drive Time" value={googleRoute.durationText} />
        <GoogleStat label="Route Stops" value={String(googleRoute.orderedStops.length)} />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 dark:border-dark-border dark:bg-slate-950 p-4">
        <h4 className="mb-3 text-sm font-black uppercase tracking-wide text-slate-700 dark:text-slate-400">
          Unit route from home office
        </h4>

        <div className="mb-2 flex items-start gap-3 rounded-xl border border-blue-900 bg-blue-50 dark:bg-blue-950/30 p-3">
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-black text-white">
            0
          </span>

          <div className="min-w-0 flex-1">
            <span className="rounded bg-blue-100 dark:bg-blue-900 px-2 py-1 text-[10px] font-black text-blue-900 dark:text-blue-100">
              START
            </span>

            <p className="mt-2 truncate text-sm font-black text-slate-950 dark:text-white">
              {googleRoute.originAddress || '146 Cushman Road, St. Catharines, ON, Canada'}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {googleRoute.orderedStops.map((stop, index) => {
            const matchingShipment = route.shipments.find(
              (shipment) => shipment.id === getShipmentIdFromRouteStop(stop)
            );

            return (
              <div
                key={`${stop.shipmentId}-${index}`}
                className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white dark:border-dark-border dark:bg-slate-900 p-3"
              >
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-black text-blue-900 dark:bg-blue-900 dark:text-blue-100">
                  {index + 1}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    {stop.operationalPhaseLabel && (
                      <span className="rounded bg-blue-700 px-2 py-1 text-[10px] font-black text-white">
                        {stop.operationalPhaseLabel}
                      </span>
                    )}

                    {stop.routeBucketLabel && (
                      <span className="rounded bg-purple-900 px-2 py-1 text-[10px] font-black text-purple-100">
                        {stop.routeBucketLabel}
                      </span>
                    )}
                  </div>

                  <p className="truncate text-sm font-black text-slate-950 dark:text-white">
                    {stop.label}
                  </p>

                  {matchingShipment && (
                    <p className="mt-1 truncate text-xs text-slate-700 dark:text-slate-300">
                      {displayLocation(matchingShipment.delivery_address, matchingShipment.delivery_city)}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function RouteWarningCard({ route }: { route: TruckRoute }) {
  return (
    <details className="rounded-2xl border border-yellow-300 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950/30 p-5">
      <summary className="cursor-pointer list-none">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-black text-yellow-900 dark:text-yellow-100">
              <AlertTriangle className="h-5 w-5" />
              Route warnings
            </h3>

            <p className="mt-1 text-sm text-yellow-900 dark:text-yellow-800 dark:text-yellow-800 dark:text-yellow-200">
              {route.missingGpsShipments.length} freight stop(s) missing GPS • {route.routeNoteShipments.length} route note(s)
            </p>
          </div>

          <span className="rounded-full border border-yellow-800 bg-yellow-100 dark:bg-yellow-900/40 px-3 py-1 text-xs font-black text-yellow-900 dark:text-yellow-100">
            Show details
          </span>
        </div>
      </summary>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {route.missingGpsShipments.length > 0 && (
          <div className="rounded-xl border border-yellow-900 bg-white/70 dark:bg-black/20 p-4">
            <p className="mb-3 text-sm font-black uppercase tracking-wide text-yellow-900 dark:text-yellow-100">
              Missing delivery GPS
            </p>

            <div className="space-y-2">
              {route.missingGpsShipments.map((shipment) => (
                <div
                  key={shipment.id}
                  className="rounded-lg border border-yellow-900/70 bg-white dark:bg-black/30 p-3"
                >
                  <p className="font-semibold text-yellow-900 dark:text-yellow-100">
                    {displayValue(getBoardDisplayName(shipment), 'Freight stop')}
                  </p>

                  <p className="mt-1 text-xs text-yellow-900 dark:text-yellow-800 dark:text-yellow-800 dark:text-yellow-200">
                    {displayLocation(shipment.delivery_address, shipment.delivery_city)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {route.routeNoteShipments.length > 0 && (
          <div className="rounded-xl border border-blue-900 bg-white/70 dark:bg-black/20 p-4">
            <p className="mb-3 text-sm font-black uppercase tracking-wide text-blue-900 dark:text-blue-100">
              Route notes
            </p>

            <div className="space-y-2">
              {route.routeNoteShipments.map((shipment) => (
                <div
                  key={shipment.id}
                  className="rounded-lg border border-blue-900/70 bg-white dark:bg-black/30 p-3"
                >
                  <p className="font-semibold text-blue-900 dark:text-blue-100">
                    {displayValue(shipment.board_name, 'Route note')}
                  </p>

                  {shipment.board_note && (
                    <p className="mt-1 text-xs text-blue-900 dark:text-blue-800 dark:text-blue-200">
                      {shipment.board_note}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </details>
  );
}

function RouteStopsCard({
  route,
  googleRoute,
  companies,
}: {
  route: TruckRoute;
  googleRoute?: GoogleTruckRouteEstimate;
  companies: Company[];
}) {
  const googleOrderByShipmentId = new Map<string, number>();

  if (googleRoute) {
    googleRoute.orderedStops.forEach((stop, index) => {
      googleOrderByShipmentId.set(getShipmentIdFromRouteStop(stop), index + 1);
    });
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-soft dark:border-dark-border dark:bg-dark-card dark:shadow-soft-dark p-5">
      <h3 className="mb-4 flex items-center gap-2 text-lg font-black text-slate-950 dark:text-white">
        <Navigation2 className="h-5 w-5 text-blue-700 dark:text-blue-400" />
        Route stops
      </h3>

      <div className="space-y-3">
        {route.shipments.map((shipment, index) => {
          const isBoardOnlyStop = shipment.dispatch_task_type === 'board_stop';
          const googleOrder = googleOrderByShipmentId.get(shipment.id);
          const locationSource = getShipmentLocationSource(shipment, companies);
          const bucket = getRouteBucket(shipment);

          return (
            <div
              key={shipment.id}
              className={`rounded-xl border p-4 ${
                shipment.route_completed
                  ? 'border-green-800 bg-green-50 dark:bg-green-950/50'
                  : isBoardOnlyStop
                    ? 'border-slate-700 bg-slate-900'
                    : shipment.stays_in_canada
                      ? 'border-red-800 bg-red-50 dark:bg-red-950/50'
                      : 'border-slate-200 bg-white dark:border-dark-border dark:bg-slate-800'
              }`}
            >
              <div className="flex items-start gap-4">
                <div
                  className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${
                    shipment.route_completed
                      ? 'bg-green-700'
                      : isBoardOnlyStop
                        ? 'bg-slate-100 dark:bg-slate-700'
                        : 'bg-blue-600'
                  }`}
                >
                  <span className="text-sm font-black text-slate-950 dark:text-white">
                    {index + 1}
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    {shipment.route_completed && (
                      <span className="flex items-center gap-1 rounded bg-green-700 px-2 py-1 text-xs font-semibold text-slate-950 dark:text-white">
                        <CheckCircle2 className="h-3 w-3" />
                        FIN
                      </span>
                    )}

                    {isBoardOnlyStop && (
                      <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-white">
                        ROUTE NOTE
                      </span>
                    )}

                    {!isBoardOnlyStop && shipment.stays_in_canada && (
                      <span className="rounded bg-red-700 px-2 py-1 text-xs font-semibold text-slate-950 dark:text-white">
                        CANADA
                      </span>
                    )}

                    {!isBoardOnlyStop && (
                      <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                        {getStopTypeLabel(shipment.board_stop_type)}
                      </span>
                    )}

                    {!isBoardOnlyStop && (
                      <span className="rounded bg-purple-900 px-2 py-1 text-xs font-semibold text-purple-100">
                        {bucket.label}
                      </span>
                    )}

                    {!isBoardOnlyStop && locationSource && (
                      <span className="rounded bg-green-800 px-2 py-1 text-xs font-semibold text-green-900 dark:text-green-100">
                        GPS {locationSource.source === 'company' ? 'COMPANY' : 'SHIPMENT'}
                      </span>
                    )}

                    {!isBoardOnlyStop && !locationSource && (
                      <span className="rounded bg-yellow-800 px-2 py-1 text-xs font-semibold text-yellow-900 dark:text-yellow-100">
                        NO GPS
                      </span>
                    )}

                    {googleOrder && (
                      <span className="rounded bg-blue-800 px-2 py-1 text-xs font-semibold text-blue-900 dark:text-blue-100">
                        Google #{googleOrder}
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
  );
}

function TopStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-dark-border dark:bg-slate-950 px-4 py-3">
      <p className="text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-400">
        {label}
      </p>

      <p className="mt-1 text-2xl font-black text-slate-950 dark:text-white">
        {value}
      </p>
    </div>
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
    <div className="rounded-xl border border-slate-200 bg-slate-50 dark:border-dark-border dark:bg-slate-950 p-4">
      <p className="text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-400">
        {label}
      </p>

      <p className="mt-1 text-xl font-black text-slate-950 dark:text-white">
        {value}
      </p>
    </div>
  );
}

function SmallInfoBox({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'green' | 'yellow' | 'blue' | 'slate';
}) {
  const toneClasses = {
    green: 'border-green-900 bg-green-50 dark:bg-green-950/30 text-green-900 dark:text-green-100',
    yellow: 'border-yellow-300 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950/30 text-yellow-900 dark:text-yellow-100',
    blue: 'border-blue-900 bg-blue-50 dark:bg-blue-950/30 text-blue-900 dark:text-blue-100',
    slate: 'border-slate-200 bg-slate-50 dark:border-dark-border dark:bg-slate-950 text-slate-200',
  };

  return (
    <div className={`rounded-xl border p-3 ${toneClasses[tone]}`}>
      <p className="text-xs font-black uppercase tracking-wide opacity-70">
        {label}
      </p>

      <p className="mt-1 text-lg font-black text-slate-950 dark:text-white">
        {value}
      </p>
    </div>
  );
}

function GoogleStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-blue-200 bg-white dark:border-blue-900 dark:bg-slate-950 p-4">
      <p className="text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-400">
        {label}
      </p>

      <p className="mt-1 text-2xl font-black text-slate-950 dark:text-white">
        {value}
      </p>
    </div>
  );
}

function RouteNoteStop({ shipment }: { shipment: Shipment }) {
  return (
    <div>
      <p className="text-lg font-bold text-slate-950 dark:text-white">
        {displayValue(shipment.board_name, 'Route note')}
      </p>

      {shipment.board_note && (
        <p className="mt-2 rounded border border-yellow-800/70 bg-yellow-50 dark:bg-yellow-950/40 px-3 py-2 text-sm font-semibold text-yellow-800 dark:text-yellow-200">
          {shipment.board_note}
        </p>
      )}

      {shipment.route_completed && (
        <p className="mt-2 text-xs text-green-700 dark:text-green-300">
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
      <p className="font-semibold text-slate-950 dark:text-white">
        {displayValue(getBoardDisplayName(shipment), 'Freight stop')}
      </p>

      {shipment.work_order_number && (
        <p className="mt-1 text-xs font-semibold text-blue-700 dark:text-blue-300">
          {shipment.work_order_number}
        </p>
      )}

      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-slate-50 dark:border-dark-border dark:bg-slate-950/60 p-3">
          <p className="text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-400">
            Pickup
          </p>

          <p className="mt-1 font-semibold text-slate-950 dark:text-white">
            {displayValue(shipment.pickup_company_name)}
          </p>

          <p className="mt-1 text-xs text-slate-700 dark:text-slate-300">
            {displayLocation(shipment.pickup_address, shipment.pickup_city)}
          </p>

          {(shipment.pickup_date || shipment.pickup_time) && (
            <p className="mt-1 text-xs text-slate-700 dark:text-slate-400">
              {displayDateTime(shipment.pickup_date, shipment.pickup_time)}
            </p>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 dark:border-dark-border dark:bg-slate-950/60 p-3">
          <p className="text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-400">
            Delivery
          </p>

          <p className="mt-1 font-semibold text-slate-950 dark:text-white">
            {displayValue(shipment.delivery_company_name)}
          </p>

          <p className="mt-1 text-xs text-slate-700 dark:text-slate-300">
            {displayLocation(shipment.delivery_address, shipment.delivery_city)}
          </p>

          {(shipment.delivery_date || shipment.delivery_time) && (
            <p className="mt-1 text-xs text-slate-700 dark:text-slate-400">
              {displayDateTime(shipment.delivery_date, shipment.delivery_time)}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
          {displayValue(shipment.number_of_skids, 'Unknown')} skids
        </span>

        <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
          {shipmentWeight
            ? `${Number(shipmentWeight).toLocaleString()} lbs`
            : 'Weight unknown'}
        </span>

        {shipment.customs_docs_received ? (
          <span className="rounded bg-green-800 px-2 py-1 text-xs text-green-900 dark:text-green-100">
            DOC YES
          </span>
        ) : (
          <span className="rounded bg-red-100 dark:bg-red-900 px-2 py-1 text-xs text-red-900 dark:text-red-100">
            DOC NO
          </span>
        )}
      </div>

      {shipment.board_note && (
        <p className="mt-3 rounded border border-yellow-800/70 bg-yellow-50 dark:bg-yellow-950/40 px-3 py-2 text-sm font-semibold text-yellow-800 dark:text-yellow-200">
          {shipment.board_note}
        </p>
      )}

      {shipment.notes && (
        <p className="mt-2 text-sm italic text-slate-700 dark:text-slate-300">
          Note: {shipment.notes}
        </p>
      )}

      {shipment.route_completed && (
        <p className="mt-2 text-xs text-green-700 dark:text-green-300">
          Completed by {displayValue(shipment.route_completed_by, 'driver')}
        </p>
      )}
    </div>
  );
}

function groupStopsByOperationalPhase(stops: GoogleRouteStop[]) {
  const phaseMap = new Map<number, GoogleRouteStop[]>();

  stops.forEach((stop) => {
    const phase = Number(stop.operationalPhase || 99);
    const current = phaseMap.get(phase) || [];
    current.push(stop);
    phaseMap.set(phase, current);
  });

  return Array.from(phaseMap.entries())
    .sort(([aPhase], [bPhase]) => aPhase - bPhase)
    .map(([, phaseStops]) => phaseStops);
}

function combinePhaseRouteEstimates(
  phaseEstimates: GoogleTruckRouteEstimate[],
  originalStops: GoogleRouteStop[],
  usedManualFallback = false
): GoogleTruckRouteEstimate {
  const firstEstimate = phaseEstimates[0];
  const orderedStops = phaseEstimates.flatMap((estimate) => estimate.orderedStops);
  const operationalOrderedStops = applyOperationalStopOrder(orderedStops, originalStops);
  const distanceMeters = phaseEstimates.reduce(
    (sum, estimate) => sum + Number(estimate.distanceMeters || 0),
    0
  );
  const distanceKm = distanceMeters / 1000;
  const durationSeconds = phaseEstimates.reduce(
    (sum, estimate) => sum + parseDurationToSeconds(estimate.duration),
    0
  );
  const staticDurationSeconds = phaseEstimates.reduce(
    (sum, estimate) => sum + parseDurationToSeconds(estimate.staticDuration),
    0
  );

  return {
    originAddress: firstEstimate?.originAddress || '146 Cushman Road, St. Catharines, ON',
    distanceMeters,
    distanceKm,
    distanceText: usedManualFallback
      ? distanceKm > 0
        ? `${distanceKm.toFixed(1)} km + manual stop(s)`
        : 'Manual operational order'
      : `${distanceKm.toFixed(1)} km`,
    duration: `${durationSeconds}s`,
    durationText: usedManualFallback
      ? durationSeconds > 0
        ? `${formatDurationSeconds(durationSeconds)} + manual stop(s)`
        : 'Manual operational order'
      : formatDurationSeconds(durationSeconds),
    staticDuration: `${staticDurationSeconds}s`,
    staticDurationText: usedManualFallback
      ? staticDurationSeconds > 0
        ? `${formatDurationSeconds(staticDurationSeconds)} + manual stop(s)`
        : 'Manual operational order'
      : formatDurationSeconds(staticDurationSeconds),
    orderedStops: operationalOrderedStops,
  };
}

function buildManualOperationalRouteEstimate(
  originalStops: GoogleRouteStop[]
): GoogleTruckRouteEstimate {
  const orderedStops = originalStops
    .slice()
    .sort((a, b) => {
      const phaseDiff = Number(a.operationalPhase || 99) - Number(b.operationalPhase || 99);

      if (phaseDiff !== 0) {
        return phaseDiff;
      }

      return String(a.label).localeCompare(String(b.label));
    });

  return {
    originAddress: '146 Cushman Road, St. Catharines, ON',
    distanceMeters: 0,
    distanceKm: 0,
    distanceText: 'Google route unavailable',
    duration: '0s',
    durationText: 'Google route unavailable',
    staticDuration: '0s',
    staticDurationText: 'Google route unavailable',
    orderedStops,
  };
}

function parseDurationToSeconds(value?: string | null) {
  if (!value) {
    return 0;
  }

  const match = String(value).match(/(\d+)/);

  if (!match) {
    return 0;
  }

  return Number(match[1]);
}

function formatDurationSeconds(totalSeconds: number) {
  if (!totalSeconds) {
    return 'Google route unavailable';
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);

  if (hours <= 0) {
    return `${minutes} min`;
  }

  if (minutes <= 0) {
    return `${hours} hr`;
  }

  return `${hours} hr ${minutes} min`;
}

function buildGoogleStopsForRoute(
  route: TruckRoute,
  companies: Company[]
): GoogleRouteStop[] {
  const stops = route.gpsReadyShipments.flatMap((shipment) =>
    buildOperationalStopsForShipment(shipment, companies, route.routeDateKey)
  );

  return stops.sort((a, b) => {
    const phaseDiff = Number(a.operationalPhase || 99) - Number(b.operationalPhase || 99);

    if (phaseDiff !== 0) {
      return phaseDiff;
    }

    return String(a.label).localeCompare(String(b.label));
  });
}

function buildOperationalStopsForShipment(
  shipment: Shipment,
  companies: Company[],
  routeDateKey?: string
): GoogleRouteStop[] {
  const stops: GoogleRouteStop[] = [];
  const stopType = shipment.board_stop_type || 'delivery';

  if (stopType !== 'pickup' && stopMatchesRouteDate(shipment, 'delivery', routeDateKey)) {
    const deliveryLocation = getDeliveryLocationSource(shipment, companies);

    if (deliveryLocation) {
      const bucket = getRouteBucket(shipment, 'delivery');
      const phase = getOperationalPhase(shipment, 'delivery');

      stops.push({
        shipmentId:
          stopType === 'pickup_and_delivery'
            ? `${shipment.id}:delivery`
            : shipment.id,
        label: getGoogleStopLabel(shipment, 'delivery'),
        latitude: deliveryLocation.latitude,
        longitude: deliveryLocation.longitude,
        routeBucket: bucket.key,
        routeBucketLabel: bucket.label,
        address: shipment.delivery_address,
        city: shipment.delivery_city,
        stopPurpose: 'delivery',
        operationalPhase: phase.order,
        operationalPhaseLabel: phase.label,
      });
    }
  }

  if (
    (stopType === 'pickup' || stopType === 'pickup_and_delivery') &&
    stopMatchesRouteDate(shipment, 'pickup', routeDateKey)
  ) {
    const pickupLocation = getPickupLocationSource(shipment, companies);

    if (pickupLocation) {
      const bucket = getRouteBucket(shipment, 'pickup');
      const phase = getOperationalPhase(shipment, 'pickup');

      stops.push({
        shipmentId:
          stopType === 'pickup_and_delivery'
            ? `${shipment.id}:pickup`
            : shipment.id,
        label: getGoogleStopLabel(shipment, 'pickup'),
        latitude: pickupLocation.latitude,
        longitude: pickupLocation.longitude,
        routeBucket: bucket.key,
        routeBucketLabel: bucket.label,
        address: shipment.pickup_address,
        city: shipment.pickup_city,
        stopPurpose: 'pickup',
        operationalPhase: phase.order,
        operationalPhaseLabel: phase.label,
      });
    }
  }

  return stops;
}

function applyOperationalStopOrder(
  googleOrderedStops: GoogleRouteStop[],
  originalStops: GoogleRouteStop[]
) {
  const originalStopById = new Map(
    originalStops.map((stop) => [stop.shipmentId, stop])
  );

  return googleOrderedStops
    .map((stop, index) => {
      const originalStop = originalStopById.get(stop.shipmentId);

      return {
        ...stop,
        ...originalStop,
        latitude: stop.latitude,
        longitude: stop.longitude,
        address: originalStop?.address ?? stop.address,
        city: originalStop?.city ?? stop.city,
        googleOrder: index + 1,
      } as GoogleRouteStop & { googleOrder?: number };
    })
    .sort((a, b) => {
      const phaseDiff = Number(a.operationalPhase || 99) - Number(b.operationalPhase || 99);

      if (phaseDiff !== 0) {
        return phaseDiff;
      }

      return Number(a.googleOrder || 999) - Number(b.googleOrder || 999);
    });
}

function getRouteBucket(shipment: Shipment, purpose: 'delivery' | 'pickup' = 'delivery') {
  const deliveryText = normalizeRouteText(
    [
      shipment.delivery_company_name,
      shipment.delivery_address,
      shipment.delivery_city,
      shipment.delivery_postal_code,
      shipment.board_name,
    ].join(' ')
  );

  const pickupText = normalizeRouteText(
    [
      shipment.pickup_company_name,
      shipment.pickup_address,
      shipment.pickup_city,
      shipment.pickup_postal_code,
    ].join(' ')
  );

  const allText = `${deliveryText} ${pickupText}`;

  if (
    allText.includes('freightboy warehouse') ||
    allText.includes('freight boy warehouse') ||
    allText.includes('witmer industrial') ||
    allText.includes('4450 witmer')
  ) {
    return {
      key: 'freightboy_warehouse',
      label: 'Freightboy Warehouse',
    };
  }

  if (
    allText.includes('buffalo') ||
    allText.includes('cheektowaga') ||
    allText.includes('tonawanda') ||
    allText.includes('amherst ny') ||
    allText.includes('kenmore') ||
    allText.includes('kenmore ny')
  ) {
    return {
      key: 'buffalo',
      label: 'Buffalo',
    };
  }

  const city =
    purpose === 'pickup'
      ? shipment.pickup_city
      : shipment.delivery_city;

  const companyName =
    purpose === 'pickup'
      ? shipment.pickup_company_name
      : shipment.delivery_company_name;

  if (city && city.trim() !== '') {
    return {
      key: `city_${normalizeRouteKey(city)}`,
      label: city,
    };
  }

  if (companyName && companyName.trim() !== '') {
    return {
      key: `company_${normalizeRouteKey(companyName)}`,
      label: companyName,
    };
  }

  return {
    key: 'other',
    label: 'Other',
  };
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

function getGoogleStopLabel(
  shipment: Shipment,
  purpose: 'delivery' | 'pickup' = 'delivery'
) {
  if (purpose === 'pickup') {
    return (
      shipment.pickup_company_name ||
      shipment.board_name ||
      shipment.work_order_number ||
      displayLocation(shipment.pickup_address, shipment.pickup_city) ||
      'Pickup stop'
    );
  }

  return (
    shipment.delivery_company_name ||
    shipment.board_name ||
    shipment.work_order_number ||
    displayLocation(shipment.delivery_address, shipment.delivery_city) ||
    'Delivery stop'
  );
}

function getStopTypeLabel(stopType?: string | null) {
  if (stopType === 'pickup') return 'Pickup';
  if (stopType === 'pickup_and_delivery') return 'Pickup + Delivery';
  if (stopType === 'cross_dock') return 'Cross Dock';
  if (stopType === 'warehouse') return 'Warehouse';
  return 'Delivery';
}

function getShipmentLocationSource(
  shipment: Shipment,
  companies: Company[]
): { latitude: number; longitude: number; source: 'shipment' | 'company' } | null {
  return getDeliveryLocationSource(shipment, companies);
}

function getDeliveryLocationSource(
  shipment: Shipment,
  companies: Company[]
): { latitude: number; longitude: number; source: 'shipment' | 'company' } | null {
  if (shipmentHasDeliveryGps(shipment)) {
    return {
      latitude: Number(shipment.delivery_latitude),
      longitude: Number(shipment.delivery_longitude),
      source: 'shipment',
    };
  }

  const deliveryCompany = findDeliveryCompany(shipment, companies);

  if (deliveryCompany && hasCoordinates(deliveryCompany)) {
    return {
      latitude: Number(deliveryCompany.latitude),
      longitude: Number(deliveryCompany.longitude),
      source: 'company',
    };
  }

  return null;
}

function getPickupLocationSource(
  shipment: Shipment,
  companies: Company[]
): { latitude: number; longitude: number; source: 'shipment' | 'company' } | null {
  if (shipmentHasPickupGps(shipment)) {
    return {
      latitude: Number((shipment as Shipment & { pickup_latitude?: number | string | null }).pickup_latitude),
      longitude: Number((shipment as Shipment & { pickup_longitude?: number | string | null }).pickup_longitude),
      source: 'shipment',
    };
  }

  const pickupCompany = findPickupCompany(shipment, companies);

  if (pickupCompany && hasCoordinates(pickupCompany)) {
    return {
      latitude: Number(pickupCompany.latitude),
      longitude: Number(pickupCompany.longitude),
      source: 'company',
    };
  }

  return null;
}

function shipmentHasDeliveryGps(shipment: Shipment) {
  return (
    shipment.delivery_latitude !== null &&
    shipment.delivery_latitude !== undefined &&
    shipment.delivery_longitude !== null &&
    shipment.delivery_longitude !== undefined &&
    !Number.isNaN(Number(shipment.delivery_latitude)) &&
    !Number.isNaN(Number(shipment.delivery_longitude))
  );
}

function shipmentHasPickupGps(shipment: Shipment) {
  const pickupLatitude = (shipment as Shipment & { pickup_latitude?: number | string | null }).pickup_latitude;
  const pickupLongitude = (shipment as Shipment & { pickup_longitude?: number | string | null }).pickup_longitude;

  return (
    pickupLatitude !== null &&
    pickupLatitude !== undefined &&
    pickupLongitude !== null &&
    pickupLongitude !== undefined &&
    !Number.isNaN(Number(pickupLatitude)) &&
    !Number.isNaN(Number(pickupLongitude))
  );
}

function findPickupCompany(
  shipment: Shipment,
  companies: Company[]
) {
  const pickupName = normalizeName(shipment.pickup_company_name);

  if (pickupName) {
    const byName = companies.find(
      (company) => normalizeName(company.name) === pickupName
    );

    if (byName) {
      return byName;
    }
  }

  const shipmentAddress = normalizeAddress(shipment.pickup_address);
  const shipmentCity = normalizeAddress(shipment.pickup_city);
  const shipmentPostalCode = normalizePostalCode(shipment.pickup_postal_code);

  if (!shipmentAddress && !shipmentCity && !shipmentPostalCode) {
    return null;
  }

  const exactAddressCityPostal = companies.find((company) => {
    return (
      normalizeAddress(company.address) === shipmentAddress &&
      normalizeAddress(company.city) === shipmentCity &&
      normalizePostalCode(company.postal_code) === shipmentPostalCode &&
      Boolean(shipmentAddress || shipmentCity || shipmentPostalCode)
    );
  });

  if (exactAddressCityPostal) {
    return exactAddressCityPostal;
  }

  const exactAddressCity = companies.find((company) => {
    return (
      normalizeAddress(company.address) === shipmentAddress &&
      normalizeAddress(company.city) === shipmentCity &&
      Boolean(shipmentAddress && shipmentCity)
    );
  });

  if (exactAddressCity) {
    return exactAddressCity;
  }

  const exactAddressMatches = companies.filter((company) => {
    return (
      normalizeAddress(company.address) === shipmentAddress &&
      Boolean(shipmentAddress)
    );
  });

  if (exactAddressMatches.length === 1) {
    return exactAddressMatches[0];
  }

  return null;
}

function findDeliveryCompany(
  shipment: Shipment,
  companies: Company[]
) {
  const deliveryName = normalizeName(shipment.delivery_company_name);

  if (deliveryName) {
    const byName = companies.find(
      (company) => normalizeName(company.name) === deliveryName
    );

    if (byName) {
      return byName;
    }
  }

  const shipmentAddress = normalizeAddress(shipment.delivery_address);
  const shipmentCity = normalizeAddress(shipment.delivery_city);
  const shipmentPostalCode = normalizePostalCode(shipment.delivery_postal_code);

  if (!shipmentAddress && !shipmentCity && !shipmentPostalCode) {
    return null;
  }

  const exactAddressCityPostal = companies.find((company) => {
    return (
      normalizeAddress(company.address) === shipmentAddress &&
      normalizeAddress(company.city) === shipmentCity &&
      normalizePostalCode(company.postal_code) === shipmentPostalCode &&
      Boolean(shipmentAddress || shipmentCity || shipmentPostalCode)
    );
  });

  if (exactAddressCityPostal) {
    return exactAddressCityPostal;
  }

  const exactAddressCity = companies.find((company) => {
    return (
      normalizeAddress(company.address) === shipmentAddress &&
      normalizeAddress(company.city) === shipmentCity &&
      Boolean(shipmentAddress && shipmentCity)
    );
  });

  if (exactAddressCity) {
    return exactAddressCity;
  }

  const exactAddressMatches = companies.filter((company) => {
    return (
      normalizeAddress(company.address) === shipmentAddress &&
      Boolean(shipmentAddress)
    );
  });

  if (exactAddressMatches.length === 1) {
    return exactAddressMatches[0];
  }

  return null;
}

function hasCoordinates(company: Company) {
  return (
    company.latitude !== null &&
    company.latitude !== undefined &&
    company.longitude !== null &&
    company.longitude !== undefined &&
    !Number.isNaN(Number(company.latitude)) &&
    !Number.isNaN(Number(company.longitude))
  );
}

function getStopDebugWarnings(stop: GoogleRouteStop) {
  const warnings: string[] = [];
  const latitude = Number(stop.latitude);
  const longitude = Number(stop.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    warnings.push('Invalid GPS number');
    return warnings;
  }

  if (latitude === 0 && longitude === 0) {
    warnings.push('GPS is 0,0');
  }

  if (Math.abs(latitude) > 90) {
    warnings.push('Latitude outside valid range');
  }

  if (Math.abs(longitude) > 180) {
    warnings.push('Longitude outside valid range');
  }

  if (Math.abs(latitude) > 55 && Math.abs(longitude) < 55) {
    warnings.push('Latitude/longitude may be reversed');
  }

  if (latitude > 35 && latitude < 50 && longitude > 35 && longitude < 90) {
    warnings.push('Longitude is positive; Ontario/NY should usually be negative');
  }

  if (latitude < 35 || latitude > 50 || longitude < -95 || longitude > -70) {
    warnings.push('GPS is far outside Ontario / nearby US area');
  }

  if (!stop.address && !stop.city) {
    warnings.push('No address text shown for stop');
  }

  return warnings;
}

function buildSingleStopGoogleMapsUrl(stop: GoogleRouteStop) {
  const destination = `${stop.latitude},${stop.longitude}`;

  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
    '146 Cushman Road, St. Catharines, ON'
  )}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
}

function buildGoogleMapsDirectionsUrl(stops: GoogleRouteStop[]) {
  if (stops.length < 1) {
    return '';
  }

  const homeOfficeAddress = '146 Cushman Road, St. Catharines, ON, Canada';

  const destination = stops[stops.length - 1];
  const waypoints = stops.slice(0, -1);

  const params = new URLSearchParams();

  params.set('api', '1');
  params.set('origin', homeOfficeAddress);
  params.set('destination', `${destination.latitude},${destination.longitude}`);
  params.set('travelmode', 'driving');

  if (waypoints.length > 0) {
    params.set(
      'waypoints',
      waypoints
        .map((stop) => `${stop.latitude},${stop.longitude}`)
        .join('|')
    );
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function shouldShowShipmentOnRouteDate(shipment: Shipment, routeDateKey: string) {
  const stopType = shipment.board_stop_type || 'delivery';

  if (shipment.dispatch_task_type === 'board_stop') {
    return true;
  }

  if (stopType === 'pickup') {
    return stopMatchesRouteDate(shipment, 'pickup', routeDateKey);
  }

  if (stopType === 'pickup_and_delivery') {
    return (
      stopMatchesRouteDate(shipment, 'pickup', routeDateKey) ||
      stopMatchesRouteDate(shipment, 'delivery', routeDateKey)
    );
  }

  return stopMatchesRouteDate(shipment, 'delivery', routeDateKey);
}

function stopMatchesRouteDate(
  shipment: Shipment,
  purpose: 'delivery' | 'pickup',
  routeDateKey?: string
) {
  if (!routeDateKey) {
    return true;
  }

  const stopDateKey = getRouteStopDateKey(shipment, purpose);

  if (!stopDateKey) {
    return false;
  }

  return stopDateKey === routeDateKey;
}

function getRouteStopDateKey(
  shipment: Shipment,
  purpose: 'delivery' | 'pickup'
) {
  if (purpose === 'pickup') {
    return getDateKey(shipment.pickup_date);
  }

  return getDateKey(shipment.delivery_date);
}

function getTodayDateKey() {
  return formatDateKey(new Date());
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

function formatFriendlyRouteDate(value?: string | null) {
  const dateKey = getDateKey(value);

  if (!dateKey) {
    return 'No route date';
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

function getOperationalPhase(
  shipment: Shipment,
  purpose: 'delivery' | 'pickup'
) {
  const countryText =
    purpose === 'pickup'
      ? [shipment.pickup_company_name, shipment.pickup_address, shipment.pickup_city, shipment.pickup_postal_code].join(' ')
      : [shipment.delivery_company_name, shipment.delivery_address, shipment.delivery_city, shipment.delivery_postal_code].join(' ');

  const isUsStop = isUnitedStatesStop(countryText);

  if (isUsStop && purpose === 'delivery') {
    return {
      order: 10,
      label: 'US Delivery',
    };
  }

  if (isUsStop && purpose === 'pickup') {
    return {
      order: 20,
      label: 'US Pickup After Deliveries',
    };
  }

  if (purpose === 'delivery') {
    return {
      order: 30,
      label: 'Canada / Regular Delivery',
    };
  }

  return {
    order: 40,
    label: 'Canada / Regular Pickup',
  };
}

function isUnitedStatesStop(value?: string | null) {
  const text = normalizeRouteText(value || '');

  return (
    text.includes(' usa ') ||
    text.endsWith(' usa') ||
    text.includes(' united states') ||
    text.includes(' new york') ||
    text.includes(' ny ') ||
    text.endsWith(' ny') ||
    text.includes('buffalo') ||
    text.includes('cheektowaga') ||
    text.includes('tonawanda') ||
    text.includes('amherst') ||
    text.includes('kenmore') ||
    text.includes('niagara falls ny') ||
    text.includes('rochester') ||
    text.includes('syracuse')
  );
}

function getShipmentIdFromRouteStop(stop: GoogleRouteStop) {
  return stop.shipmentId.split(':')[0];
}

function normalizeName(value?: string | null) {
  if (!value) {
    return '';
  }

  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeAddress(value?: string | null) {
  if (!value) {
    return '';
  }

  return value
    .trim()
    .toLowerCase()
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ');
}

function normalizePostalCode(value?: string | null) {
  if (!value) {
    return '';
  }

  return value.trim().toLowerCase().replace(/\s+/g, '');
}

function normalizeRouteText(value?: string | null) {
  if (!value) {
    return '';
  }

  return value
    .trim()
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ');
}

function normalizeRouteKey(value?: string | null) {
  if (!value) {
    return 'unknown';
  }

  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
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