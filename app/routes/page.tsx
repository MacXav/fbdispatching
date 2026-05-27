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
  const [googleRoutes, setGoogleRoutes] = useState<Record<string, GoogleTruckRouteEstimate>>({});
  const [calculatingTruckId, setCalculatingTruckId] = useState<string | null>(null);

  useEffect(() => {
    loadRoutes();
  }, []);

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
        .filter((shipment) => Boolean(shipment.assigned_truck_id));

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

        const gpsReadyShipments = realFreightShipments.filter((shipment) =>
          Boolean(getShipmentLocationSource(shipment, loadedCompanies || []))
        );

        const missingGpsShipments = realFreightShipments.filter(
          (shipment) => !getShipmentLocationSource(shipment, loadedCompanies || [])
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
        alert('This truck needs at least one freight stop with delivery GPS to calculate a Google route.');
        return;
      }

      if (stopsWithGps.length > 26) {
        alert(
          'This truck has too many GPS-ready freight stops for this route calculation. Limit is 26 delivery stops because the home office is always used as the fixed start.'
        );
        return;
      }

      setCalculatingTruckId(route.truck.id);

      const response = await fetch('/api/google-truck-route', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({
          stops: stopsWithGps,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Could not calculate Google route.');
      }

      setGoogleRoutes((current) => ({
        ...current,
        [route.truck.id]: data as GoogleTruckRouteEstimate,
      }));
    } catch (error) {
      console.error('Google route error:', error);
      alert(
        error instanceof Error
          ? error.message
          : 'Could not calculate Google route.'
      );
    } finally {
      setCalculatingTruckId(null);
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <Header title="Routes" subtitle="View active truck routes" />

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
        subtitle="View active route stops, Google route estimates, and assigned freight by truck"
      />

      <div className="mb-6 rounded-2xl border border-slate-200 bg-white shadow-soft dark:border-dark-border dark:bg-dark-card dark:shadow-soft-dark p-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-950 dark:text-white">
              Active truck routes
            </h2>

            <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
              Every Google route starts from 146 Cushman Road, St. Catharines. Google tests the best delivery ending point and optimizes the middle stops.
            </p>
          </div>

          <button
            type="button"
            onClick={loadRoutes}
            className="btn-secondary flex items-center justify-center gap-2"
            disabled={loading || Boolean(calculatingTruckId)}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh Routes
          </button>
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
          <p className="font-semibold text-slate-950 dark:text-white">No active routes yet.</p>
          <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
            Assign pickups or type route notes on the truck board.
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
            {calculating ? 'Calculating...' : googleRoute ? 'Recalculate Google Route' : 'Calculate Google Route'}
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
          label="Google Route"
          value={googleRoute ? `${googleRoute.durationText}` : 'Not calculated'}
          tone={googleRoute ? 'green' : 'slate'}
        />
      </div>
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
            Google route estimate
          </h3>

          <p className="mt-1 text-sm text-blue-900 dark:text-blue-800 dark:text-blue-200">
            This route starts at {googleRoute.originAddress || '146 Cushman Road, St. Catharines'}. Google tests the best final delivery and optimizes the middle stops for the fastest route.
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
        <GoogleStat label="Delivery Stops" value={String(googleRoute.orderedStops.length)} />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 dark:border-dark-border dark:bg-slate-950 p-4">
        <h4 className="mb-3 text-sm font-black uppercase tracking-wide text-slate-700 dark:text-slate-400">
          Optimized stop order from home office
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
              (shipment) => shipment.id === stop.shipmentId
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
      googleOrderByShipmentId.set(stop.shipmentId, index + 1);
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

function buildGoogleStopsForRoute(
  route: TruckRoute,
  companies: Company[]
): GoogleRouteStop[] {
  return route.gpsReadyShipments
    .map((shipment): GoogleRouteStop | null => {
      const locationSource = getShipmentLocationSource(shipment, companies);

      if (!locationSource) {
        return null;
      }

      const bucket = getRouteBucket(shipment);

      return {
        shipmentId: shipment.id,
        label: getGoogleStopLabel(shipment),
        latitude: locationSource.latitude,
        longitude: locationSource.longitude,
        routeBucket: bucket.key,
        routeBucketLabel: bucket.label,
        address: shipment.delivery_address,
        city: shipment.delivery_city,
      };
    })
    .filter((stop): stop is GoogleRouteStop => stop !== null);
}

function getRouteBucket(shipment: Shipment) {
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

  if (shipment.delivery_city && shipment.delivery_city.trim() !== '') {
    return {
      key: `city_${normalizeRouteKey(shipment.delivery_city)}`,
      label: shipment.delivery_city,
    };
  }

  if (shipment.delivery_company_name && shipment.delivery_company_name.trim() !== '') {
    return {
      key: `company_${normalizeRouteKey(shipment.delivery_company_name)}`,
      label: shipment.delivery_company_name,
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

function getGoogleStopLabel(shipment: Shipment) {
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