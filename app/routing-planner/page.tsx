'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import MainLayout from '@/components/MainLayout';
import Header from '@/components/Header';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  Lock,
  MapPinned,
  RefreshCw,
  Route,
  Shuffle,
  Truck as TruckIcon,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Company, Shipment, Truck } from '@/types';

interface StopWithLocation {
  shipment: Shipment;
  currentTruckId: string;
  currentTruckNumber: string;
  suggestedTruckId: string;
  suggestedTruckNumber: string;
  latitude: number;
  longitude: number;
  skids: number;
  weightLbs: number;
  locked: boolean;
  gpsSource: 'shipment' | 'company';
  routeBucket: string;
  routeBucketLabel: string;
  routeBucketPriority: number;
}

interface MissingLocationStop {
  shipment: Shipment;
  truckNumber: string;
  reason: string;
}

interface TruckPlan {
  truck: Truck;
  currentStops: StopWithLocation[];
  suggestedStops: StopWithLocation[];
  currentSkids: number;
  suggestedSkids: number;
  currentWeightLbs: number;
  suggestedWeightLbs: number;
}

interface CrossDockMove {
  shipment: Shipment;
  fromTruckId: string;
  fromTruckNumber: string;
  toTruckId: string;
  toTruckNumber: string;
  skids: number;
  weightLbs: number;
}

interface PlannerResult {
  stops: StopWithLocation[];
  missingLocationStops: MissingLocationStop[];
  truckPlans: TruckPlan[];
  crossDockMoves: CrossDockMove[];
  currentScoreKm: number;
  suggestedScoreKm: number;
}

interface PlannerDataResponse {
  trucks: Truck[];
  shipments: Shipment[];
  companies: Company[];
  error?: string;
}

interface GeocodeDeliveriesResponse {
  successCount: number;
  failCount: number;
  skippedCount: number;
  totalChecked: number;
  totalNeedingGps: number;
  logs: {
    shipmentId: string;
    label: string;
    address: string;
    status: 'success' | 'error' | 'skipped';
    message: string;
  }[];
  error?: string;
}

interface GoogleTruckRouteEstimate {
  distanceKm: number;
  distanceText: string;
  durationText: string;
  staticDurationText: string;
  orderedStops: {
    shipmentId: string;
    label: string;
    latitude: number;
    longitude: number;
  }[];
}

export default function RoutingPlannerPage() {
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);

  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [geocodingDeliveries, setGeocodingDeliveries] = useState(false);

  const [plannerResult, setPlannerResult] = useState<PlannerResult | null>(null);
  const [latestGeocodeLogs, setLatestGeocodeLogs] = useState<
    GeocodeDeliveriesResponse['logs']
  >([]);

  const [googleRouteEstimates, setGoogleRouteEstimates] = useState<
    Record<string, GoogleTruckRouteEstimate>
  >({});
  const [loadingGoogleRouteTruckId, setLoadingGoogleRouteTruckId] = useState<
    string | null
  >(null);

  useEffect(() => {
    loadPlannerData();
  }, []);

  const loadPlannerData = async () => {
    try {
      setLoading(true);

      const response = await fetch('/api/routing-planner-data', {
        method: 'GET',
        cache: 'no-store',
      });

      const data = (await response.json()) as PlannerDataResponse;

      if (!response.ok) {
        throw new Error(data.error || 'Could not load routing planner data.');
      }

      setTrucks(data.trucks || []);
      setShipments(data.shipments || []);
      setCompanies(data.companies || []);
      setPlannerResult(null);
      setGoogleRouteEstimates({});
      setLoadingGoogleRouteTruckId(null);
    } catch (error) {
      console.error('Error loading routing planner:', error);
      alert(
        error instanceof Error
          ? error.message
          : 'Could not load routing planner data.'
      );
    } finally {
      setLoading(false);
    }
  };

  const activeAssignedFreight = useMemo(() => {
    return shipments
      .filter((shipment) => shipment.status !== 'delivered')
      .filter((shipment) => Boolean(shipment.assigned_truck_id))
      .filter((shipment) => shipment.dispatch_task_type !== 'board_stop');
  }, [shipments]);

  const activeTrucks = useMemo(() => {
    const usedTruckIds = new Set(
      activeAssignedFreight
        .map((shipment) => shipment.assigned_truck_id)
        .filter(Boolean) as string[]
    );

    return trucks
      .filter((truck) => usedTruckIds.has(truck.id))
      .sort((a, b) =>
        safeString(a.truck_number).localeCompare(safeString(b.truck_number))
      );
  }, [activeAssignedFreight, trucks]);

  const shipmentsNeedingDeliveryGps = useMemo(() => {
    return activeAssignedFreight.filter((shipment) => {
      if (shipmentHasDeliveryGps(shipment)) {
        return false;
      }

      const company = findDeliveryCompany(shipment, companies);

      if (company && hasCoordinates(company)) {
        return false;
      }

      return Boolean(buildDeliveryAddress(shipment));
    });
  }, [activeAssignedFreight, companies]);

  const assignedWithGpsCount = useMemo(() => {
    return activeAssignedFreight.filter((shipment) =>
      Boolean(getShipmentLocationSource(shipment, companies))
    ).length;
  }, [activeAssignedFreight, companies]);

  const analyzeLayout = () => {
    try {
      setAnalyzing(true);
      setGoogleRouteEstimates({});
      setLoadingGoogleRouteTruckId(null);

      if (activeAssignedFreight.length === 0) {
        alert('There is no assigned freight to analyze yet.');
        return;
      }

      if (activeTrucks.length < 2) {
        alert('At least two trucks with assigned freight are needed to compare a layout.');
        return;
      }

      const result = buildPlannerResult({
        activeAssignedFreight,
        trucks: activeTrucks,
        companies,
      });

      setPlannerResult(result);
    } catch (error) {
      console.error('Error analyzing layout:', error);
      alert('Could not analyze the truck layout.');
    } finally {
      setAnalyzing(false);
    }
  };

  const geocodeMissingDeliveryAddresses = async () => {
    const confirmed = confirm(
      'Geocode missing assigned delivery addresses? This uses Google and saves GPS directly to the shipments table.'
    );

    if (!confirmed) {
      return;
    }

    try {
      setGeocodingDeliveries(true);
      setLatestGeocodeLogs([]);

      const response = await fetch('/api/geocode-shipment-deliveries', {
        method: 'POST',
        cache: 'no-store',
      });

      const data = (await response.json()) as GeocodeDeliveriesResponse;

      if (!response.ok) {
        console.error('Geocode API failed:', data);
        throw new Error(data.error || 'Could not geocode missing deliveries.');
      }

      setLatestGeocodeLogs(data.logs || []);

      alert(
        `Delivery geocoding finished.\n\nSaved: ${data.successCount}\nFailed: ${data.failCount}\nSkipped: ${data.skippedCount}`
      );

      await loadPlannerData();
    } catch (error) {
      console.error('Error geocoding missing deliveries:', error);

      alert(
        error instanceof Error
          ? error.message
          : 'Could not geocode missing deliveries.'
      );
    } finally {
      setGeocodingDeliveries(false);
    }
  };

  const calculateGoogleRouteForTruck = async (plan: TruckPlan) => {
    try {
      if (plan.suggestedStops.length < 2) {
        alert('This truck needs at least two GPS-ready stops to calculate a Google route.');
        return;
      }

      if (plan.suggestedStops.length > 27) {
        alert(
          'This truck has too many stops for this route calculation. Limit is 27 stops: origin, 25 stops, and destination.'
        );
        return;
      }

      setLoadingGoogleRouteTruckId(plan.truck.id);

      const response = await fetch('/api/google-truck-route', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({
          stops: plan.suggestedStops.map((stop) => ({
            shipmentId: stop.shipment.id,
            label: getDeliveryDisplayName(stop.shipment),
            latitude: stop.latitude,
            longitude: stop.longitude,
          })),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Could not calculate Google route.');
      }

      setGoogleRouteEstimates((current) => ({
        ...current,
        [plan.truck.id]: data as GoogleTruckRouteEstimate,
      }));
    } catch (error) {
      console.error('Google route error:', error);
      alert(
        error instanceof Error
          ? error.message
          : 'Could not calculate Google route.'
      );
    } finally {
      setLoadingGoogleRouteTruckId(null);
    }
  };

  const applySuggestedLayout = async () => {
    if (!plannerResult) {
      return;
    }

    if (plannerResult.crossDockMoves.length === 0) {
      alert('There are no suggested cross-dock moves to apply.');
      return;
    }

    const confirmed = confirm(
      `Apply ${plannerResult.crossDockMoves.length} suggested move(s) to the truck board?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setApplying(true);

      const stopsByTruck = groupStopsBySuggestedTruck(plannerResult.stops);

      for (const [truckId, stops] of Object.entries(stopsByTruck)) {
        for (let index = 0; index < stops.length; index++) {
          const stop = stops[index];
          const assignedAt = new Date().toISOString();

          await updateTruckAssignment(stop.shipment.id, truckId, assignedAt);

          const { error } = await supabase
            .from('shipments')
            .update({
              assigned_truck_id: truckId,
              assigned_at: assignedAt,
              suggested_truck_id: truckId,
              routing_notes: `Applied by Routing Planner • ${stop.routeBucketLabel}`,
              board_sort_order: (index + 1) * 10,
              updated_at: assignedAt,
            })
            .eq('id', stop.shipment.id);

          if (error) {
            throw error;
          }
        }
      }

      await loadPlannerData();

      alert('Suggested routing layout applied.');
    } catch (error) {
      console.error('Error applying suggested layout:', error);
      alert('Could not apply the suggested layout.');
    } finally {
      setApplying(false);
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <Header
          title="Routing Planner"
          subtitle="Cross-dock planning and tomorrow delivery truck assignments"
        />

        <div className="rounded-2xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-card p-10 text-center">
          <RefreshCw className="mx-auto mb-3 h-6 w-6 animate-spin text-blue-700 dark:text-blue-300" />
          <p className="text-sm text-slate-700 dark:text-slate-300">Loading routing planner...</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <Header
        title="Routing Planner"
        subtitle="Cross-dock planning: decide what freight goes on what delivery truck tomorrow"
      />

      <div className="space-y-5">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm dark:border-amber-900 dark:bg-amber-950/30">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-wide text-amber-800 dark:text-amber-200">
                End-of-day / morning cross-dock workflow
              </p>

              <p className="mt-1 text-sm font-semibold leading-6 text-amber-950 dark:text-amber-100">
                This page is for freight that has been picked up and brought back to the yard. Use it to decide which truck should deliver each shipment tomorrow.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-2 text-xs font-black text-amber-950 dark:text-amber-100 sm:grid-cols-4 xl:min-w-[680px]">
              <div className="rounded-xl border border-amber-300 bg-white px-3 py-2 dark:border-amber-800 dark:bg-amber-950/50">
                1. Picked up
              </div>

              <div className="rounded-xl border border-amber-300 bg-white px-3 py-2 dark:border-amber-800 dark:bg-amber-950/50">
                2. At yard
              </div>

              <div className="rounded-xl border border-amber-300 bg-white px-3 py-2 dark:border-amber-800 dark:bg-amber-950/50">
                3. Plan truck
              </div>

              <div className="rounded-xl border border-amber-300 bg-white px-3 py-2 dark:border-amber-800 dark:bg-amber-950/50">
                4. Morning sort
              </div>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-card p-5 shadow-sm">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-blue-50 dark:bg-blue-950 p-3">
                  <MapPinned className="h-6 w-6 text-blue-700 dark:text-blue-300" />
                </div>

                <div>
                  <h2 className="text-xl font-black text-slate-950 dark:text-white">
                    Cross-dock routing planner
                  </h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    Use this after pickups return to the yard. Group freight by delivery area, then apply the planned delivery truck assignments for the morning cross-dock.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={loadPlannerData}
                className="btn-secondary flex items-center justify-center gap-2"
                disabled={loading || analyzing || applying || geocodingDeliveries}
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>

              <button
                type="button"
                onClick={geocodeMissingDeliveryAddresses}
                className="btn-secondary flex items-center justify-center gap-2"
                disabled={
                  loading ||
                  analyzing ||
                  applying ||
                  geocodingDeliveries ||
                  shipmentsNeedingDeliveryGps.length === 0
                }
              >
                <MapPinned className="h-4 w-4" />
                {geocodingDeliveries
                  ? 'Geocoding...'
                  : `Fix GPS (${shipmentsNeedingDeliveryGps.length})`}
              </button>

              <button
                type="button"
                onClick={analyzeLayout}
                className="btn-primary flex items-center justify-center gap-2"
                disabled={loading || analyzing || applying || geocodingDeliveries}
              >
                <Shuffle className="h-4 w-4" />
                {analyzing ? 'Analyzing...' : 'Build Suggested Plan'}
              </button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
            <SummaryBox label="At Yard / Assigned" value={String(activeAssignedFreight.length)} />
            <SummaryBox label="GPS Ready" value={String(assignedWithGpsCount)} />
            <SummaryBox label="Need GPS" value={String(shipmentsNeedingDeliveryGps.length)} />
            <SummaryBox label="Trucks" value={String(activeTrucks.length)} />
            <SummaryBox
              label="Companies GPS"
              value={String(companies.filter((company) => hasCoordinates(company)).length)}
            />
          </div>
        </div>

        {latestGeocodeLogs.length > 0 && (
          <GeocodeSummary logs={latestGeocodeLogs} />
        )}

        {!plannerResult ? (
          <CurrentLayout
            activeTrucks={activeTrucks}
            activeAssignedFreight={activeAssignedFreight}
            companies={companies}
          />
        ) : (
          <PlannerResults
            result={plannerResult}
            applying={applying}
            onApply={applySuggestedLayout}
            onReAnalyze={analyzeLayout}
            googleRouteEstimates={googleRouteEstimates}
            loadingGoogleRouteTruckId={loadingGoogleRouteTruckId}
            onCalculateGoogleRoute={calculateGoogleRouteForTruck}
          />
        )}
      </div>
    </MainLayout>
  );
}

function CurrentLayout({
  activeTrucks,
  activeAssignedFreight,
  companies,
}: {
  activeTrucks: Truck[];
  activeAssignedFreight: Shipment[];
  companies: Company[];
}) {
  if (activeTrucks.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-card p-8 text-center">
        <TruckIcon className="mx-auto mb-3 h-8 w-8 text-slate-500 dark:text-slate-500" />
        <p className="font-semibold text-slate-950 dark:text-white">No active assigned trucks yet.</p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Assign freight on the truck board first, then come back here.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="rounded-2xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-card p-5">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-slate-950 dark:text-white">Current trucks</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Simple view of what is currently assigned before route analysis.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3">
          {activeTrucks.map((truck) => {
            const truckFreight = activeAssignedFreight.filter(
              (shipment) => shipment.assigned_truck_id === truck.id
            );

            const totalSkids = truckFreight.reduce(
              (sum, shipment) => sum + Number(shipment.number_of_skids || 0),
              0
            );

            const totalWeight = truckFreight.reduce(
              (sum, shipment) =>
                sum + Number(shipment.weight_lbs || shipment.weight_kg || 0),
              0
            );

            const buckets = summarizeShipmentBuckets(truckFreight);

            return (
              <div
                key={truck.id}
                className="rounded-2xl border border-slate-200 dark:border-dark-border bg-white dark:bg-slate-950 p-4"
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-2xl font-black text-slate-950 dark:text-white">
                      {truck.truck_number}
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {truck.driver_name || 'No driver'}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-sm font-bold text-blue-700 dark:text-blue-300">
                      {truckFreight.length} stops
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-500">
                      {totalSkids} skids • {totalWeight.toLocaleString()} lbs
                    </p>
                  </div>
                </div>

                {buckets.length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-2">
                    {buckets.map((bucket) => (
                      <span
                        key={bucket.key}
                        className="rounded-full border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-1 text-xs font-bold text-slate-800 dark:text-slate-200"
                      >
                        {bucket.label}: {bucket.count}
                      </span>
                    ))}
                  </div>
                )}

                <div className="space-y-2">
                  {truckFreight.map((shipment) => {
                    const locationSource = getShipmentLocationSource(shipment, companies);
                    const bucket = getRouteBucket(shipment);

                    return (
                      <ShipmentMiniCard
                        key={shipment.id}
                        shipment={shipment}
                        bucketLabel={bucket.label}
                        statusLabel={locationSource ? 'GPS' : 'NO GPS'}
                        statusTone={locationSource ? 'green' : 'red'}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}

function PlannerResults({
  result,
  applying,
  onApply,
  onReAnalyze,
  googleRouteEstimates,
  loadingGoogleRouteTruckId,
  onCalculateGoogleRoute,
}: {
  result: PlannerResult;
  applying: boolean;
  onApply: () => void;
  onReAnalyze: () => void;
  googleRouteEstimates: Record<string, GoogleTruckRouteEstimate>;
  loadingGoogleRouteTruckId: string | null;
  onCalculateGoogleRoute: (plan: TruckPlan) => void;
}) {
  const improvementKm = result.currentScoreKm - result.suggestedScoreKm;
  const improvementPercent =
    result.currentScoreKm > 0
      ? Math.round((improvementKm / result.currentScoreKm) * 100)
      : 0;

  const bucketSummary = summarizeBuckets(result.stops);

  const trucksWithMoves = result.truckPlans.filter((plan) =>
    result.crossDockMoves.some(
      (move) =>
        move.fromTruckId === plan.truck.id ||
        move.toTruckId === plan.truck.id
    )
  );

  const trucksWithoutMoves = result.truckPlans.filter(
    (plan) =>
      !result.crossDockMoves.some(
        (move) =>
          move.fromTruckId === plan.truck.id ||
          move.toTruckId === plan.truck.id
      )
  );

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-card p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-700 dark:text-blue-300">
              Route analysis complete
            </p>

            <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">
              Review the plan before applying
            </h2>

            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Start with dock moves. Then open a truck card and calculate its Google route.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={onReAnalyze}
              className="btn-secondary"
              disabled={applying}
            >
              Re-analyze
            </button>

            <button
              type="button"
              onClick={onApply}
              className="btn-primary flex items-center justify-center gap-2"
              disabled={applying || result.crossDockMoves.length === 0}
            >
              <Check className="h-4 w-4" />
              {applying ? 'Applying...' : 'Apply Layout'}
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <AnalyzeStatCard
            label="Dock moves"
            value={String(result.crossDockMoves.length)}
            helpText={
              result.crossDockMoves.length === 0
                ? 'Nothing to move'
                : 'Skids to move'
            }
            tone={result.crossDockMoves.length === 0 ? 'green' : 'blue'}
          />

          <AnalyzeStatCard
            label="Trucks changing"
            value={String(trucksWithMoves.length)}
            helpText={`Out of ${result.truckPlans.length} trucks`}
            tone={trucksWithMoves.length === 0 ? 'green' : 'yellow'}
          />

          <AnalyzeStatCard
            label="Route groups"
            value={String(bucketSummary.length)}
            helpText="Warehouse, Buffalo, cities"
            tone="purple"
          />

          <AnalyzeStatCard
            label="Improvement"
            value={`${Math.max(0, improvementPercent)}%`}
            helpText={`${Math.max(0, Math.round(improvementKm)).toLocaleString()} km cleaner`}
            tone={improvementPercent > 0 ? 'green' : 'slate'}
          />
        </div>
      </div>

      {bucketSummary.length > 0 && (
        <div className="rounded-2xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-card p-5">
          <div className="mb-4">
            <h2 className="text-xl font-black text-slate-950 dark:text-white">Route groups</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Quick view of what type of freight each truck is getting.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {bucketSummary.map((bucket) => (
              <RouteGroupSummaryCard key={bucket.key} bucket={bucket} />
            ))}
          </div>
        </div>
      )}

      {result.missingLocationStops.length > 0 && (
        <details className="rounded-2xl border border-yellow-200 dark:border-yellow-900 bg-yellow-50 dark:bg-yellow-950/30 p-5">
          <summary className="cursor-pointer list-none">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-black text-amber-900 dark:text-yellow-100">
                  <AlertTriangle className="h-5 w-5" />
                  {result.missingLocationStops.length} stop(s) skipped because GPS is missing
                </h2>

                <p className="mt-1 text-sm text-amber-900 dark:text-yellow-100/80">
                  Click to view them. Run Fix GPS, refresh, and analyze again.
                </p>
              </div>

              <span className="flex items-center gap-2 rounded-full border border-yellow-800 bg-yellow-900/40 px-3 py-1 text-xs font-black text-amber-900 dark:text-yellow-100">
                Show skipped stops
                <ChevronDown className="h-3 w-3" />
              </span>
            </div>
          </summary>

          <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
            {result.missingLocationStops.map((item) => (
              <div
                key={item.shipment.id}
                className="rounded-xl border border-yellow-200 dark:border-yellow-900/80 bg-black/30 p-3"
              >
                <p className="font-bold text-amber-900 dark:text-yellow-100">
                  {getPickupDisplayName(item.shipment)}
                </p>

                <p className="mt-1 text-xs text-amber-900 dark:text-yellow-100/70">
                  To: {getDeliveryDisplayName(item.shipment)}
                </p>

                <p className="mt-1 text-xs text-amber-900 dark:text-yellow-100/70">
                  Current truck: {item.truckNumber}
                </p>
              </div>
            ))}
          </div>
        </details>
      )}

      {result.crossDockMoves.length === 0 ? (
        <div className="rounded-2xl border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-50 dark:bg-green-950/30 p-5">
          <p className="text-lg font-black text-green-900 dark:text-green-100">
            No cross-dock moves needed.
          </p>

          <p className="mt-1 text-sm text-green-900 dark:text-green-100/70">
            The current truck layout already matches the available GPS and route bucket rules.
          </p>
        </div>
      ) : (
        <CleanDockMovesPanel result={result} />
      )}

      <div className="rounded-2xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-card p-5">
        <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-950 dark:text-white">
              Final truck board
            </h2>

            <p className="text-sm text-slate-600 dark:text-slate-400">
              Cards start closed. Open a truck to calculate its Google route.
            </p>
          </div>

          <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
            {result.truckPlans.length} trucks total
          </p>
        </div>

        {trucksWithMoves.length > 0 && (
          <div className="mb-6">
            <p className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-blue-700 dark:text-blue-300">
              Trucks with changes
            </p>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {trucksWithMoves.map((plan) => (
                <FinalTruckPlanCard
                  key={plan.truck.id}
                  plan={plan}
                  priority
                  googleRouteEstimate={googleRouteEstimates[plan.truck.id]}
                  googleRouteLoading={loadingGoogleRouteTruckId === plan.truck.id}
                  onCalculateGoogleRoute={onCalculateGoogleRoute}
                />
              ))}
            </div>
          </div>
        )}

        {trucksWithoutMoves.length > 0 && (
          <details className="rounded-2xl border border-slate-200 dark:border-dark-border bg-white dark:bg-white dark:bg-slate-950/60 p-4">
            <summary className="cursor-pointer list-none">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-black text-slate-950 dark:text-white">
                    Trucks with no changes
                  </p>

                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {trucksWithoutMoves.length} truck(s) stay the same.
                  </p>
                </div>

                <span className="flex items-center gap-2 rounded-full border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-1 text-xs font-black text-slate-700 dark:text-slate-300">
                  Show
                  <ChevronDown className="h-3 w-3" />
                </span>
              </div>
            </summary>

            <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
              {trucksWithoutMoves.map((plan) => (
                <FinalTruckPlanCard
                  key={plan.truck.id}
                  plan={plan}
                  googleRouteEstimate={googleRouteEstimates[plan.truck.id]}
                  googleRouteLoading={loadingGoogleRouteTruckId === plan.truck.id}
                  onCalculateGoogleRoute={onCalculateGoogleRoute}
                />
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

function AnalyzeStatCard({
  label,
  value,
  helpText,
  tone,
}: {
  label: string;
  value: string;
  helpText: string;
  tone: 'blue' | 'green' | 'yellow' | 'purple' | 'slate';
}) {
  const toneClasses = {
    blue: 'border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-200',
    green: 'border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-200',
    yellow: 'border-yellow-200 dark:border-yellow-900 bg-yellow-50 dark:bg-yellow-950/30 text-amber-800 dark:text-yellow-200',
    purple: 'border-purple-900 bg-purple-950/30 text-purple-200',
    slate: 'border-slate-200 dark:border-dark-border bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200',
  };

  return (
    <div className={`rounded-2xl border p-4 ${toneClasses[tone]}`}>
      <p className="text-xs font-black uppercase tracking-wide opacity-70">
        {label}
      </p>

      <p className="mt-2 text-3xl font-black text-slate-950 dark:text-white">
        {value}
      </p>

      <p className="mt-1 text-xs opacity-80">
        {helpText}
      </p>
    </div>
  );
}

function RouteGroupSummaryCard({
  bucket,
}: {
  bucket: {
    key: string;
    label: string;
    count: number;
    skids: number;
    truckNumbers: string[];
  };
}) {
  const isWarehouse = bucket.key === 'freightboy_warehouse';
  const isBuffalo = bucket.key === 'buffalo';

  return (
    <div
      className={`rounded-2xl border p-4 ${
        isWarehouse
          ? 'border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-50 dark:bg-blue-950/30'
          : isBuffalo
            ? 'border-purple-900 bg-purple-950/30'
            : 'border-slate-200 dark:border-dark-border bg-white dark:bg-slate-950'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-lg font-black text-slate-950 dark:text-white">
            {bucket.label}
          </p>

          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {bucket.count} stops • {bucket.skids} skids
          </p>
        </div>

        <span className="rounded-full border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-1 text-xs font-black text-slate-800 dark:text-slate-200">
          {bucket.truckNumbers.length} truck
          {bucket.truckNumbers.length === 1 ? '' : 's'}
        </span>
      </div>

      <p className="mt-3 text-sm font-semibold text-blue-700 dark:text-blue-300">
        {bucket.truckNumbers.join(', ')}
      </p>
    </div>
  );
}

function CleanDockMovesPanel({ result }: { result: PlannerResult }) {
  const movesByFromTruck = groupMovesByFromTruck(result.crossDockMoves);

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-card p-5">
      <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-950 dark:text-white">
            Dock moves
          </h2>

          <p className="text-sm text-slate-600 dark:text-slate-400">
            Work from top to bottom. Each section shows what comes off one truck.
          </p>
        </div>

        <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">
          {result.crossDockMoves.length} total move
          {result.crossDockMoves.length === 1 ? '' : 's'}
        </p>
      </div>

      <div className="space-y-4">
        {movesByFromTruck.map((group) => (
          <div
            key={group.fromTruckId}
            className="rounded-2xl border border-slate-200 dark:border-dark-border bg-white dark:bg-slate-950 p-4"
          >
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-red-700 dark:text-red-300">
                  Take off
                </p>

                <h3 className="text-2xl font-black text-slate-950 dark:text-white">
                  Truck {group.fromTruckNumber}
                </h3>
              </div>

              <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-50 dark:bg-red-950/30 px-4 py-2 text-right">
                <p className="text-sm font-black text-red-900 dark:text-red-100">
                  {group.moves.length} move
                  {group.moves.length === 1 ? '' : 's'}
                </p>

                <p className="text-xs text-red-900 dark:text-red-100/70">
                  {group.skids} skids • {group.weightLbs.toLocaleString()} lbs
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {group.moves.map((move) => (
                <CleanDockMoveRow key={move.shipment.id} move={move} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CleanDockMoveRow({ move }: { move: CrossDockMove }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-slate-900 p-3">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-slate-950 dark:text-white">
            {getPickupDisplayName(move.shipment)}
          </p>

          <p className="mt-1 truncate text-xs text-blue-700 dark:text-blue-300">
            To: {getDeliveryDisplayName(move.shipment)}
          </p>

          <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
            {getRouteBucket(move.shipment).label} • {move.skids} skids • {move.weightLbs.toLocaleString()} lbs
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-50 dark:bg-green-950/30 px-3 py-2">
          <span className="text-xs font-black text-red-700 dark:text-red-200">
            {move.fromTruckNumber}
          </span>

          <ArrowRight className="h-4 w-4 text-slate-600 dark:text-slate-400" />

          <span className="text-sm font-black text-green-900 dark:text-green-100">
            {move.toTruckNumber}
          </span>
        </div>
      </div>
    </div>
  );
}

function FinalTruckPlanCard({
  plan,
  priority = false,
  googleRouteEstimate,
  googleRouteLoading,
  onCalculateGoogleRoute,
}: {
  plan: TruckPlan;
  priority?: boolean;
  googleRouteEstimate?: GoogleTruckRouteEstimate;
  googleRouteLoading: boolean;
  onCalculateGoogleRoute: (plan: TruckPlan) => void;
}) {
  const movingIn = plan.suggestedStops.filter(
    (stop) => stop.currentTruckId !== plan.truck.id
  );

  const movingOut = plan.currentStops.filter(
    (stop) => stop.suggestedTruckId !== plan.truck.id
  );

  const staying = plan.suggestedStops.filter(
    (stop) => stop.currentTruckId === plan.truck.id
  );

  const overSkids = plan.suggestedSkids > (plan.truck.capacity_skids || 12);
  const overWeight =
    plan.suggestedWeightLbs > (plan.truck.max_weight_lbs || 15000);

  const routeGroups = summarizeBuckets(plan.suggestedStops);

  return (
    <details
      className={`rounded-2xl border p-4 ${
        priority
          ? 'border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-50 dark:bg-blue-950/20'
          : 'border-slate-200 dark:border-dark-border bg-white dark:bg-slate-950'
      }`}
    >
      <summary className="cursor-pointer list-none">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-2xl font-black text-slate-950 dark:text-white">
                {plan.truck.truck_number}
              </h3>

              {movingIn.length + movingOut.length > 0 ? (
                <span className="rounded-full border border-blue-800 bg-blue-900/40 px-2 py-1 text-[10px] font-black text-blue-900 dark:text-blue-100">
                  CHANGES
                </span>
              ) : (
                <span className="rounded-full border border-green-300 dark:border-green-800 bg-green-900/30 px-2 py-1 text-[10px] font-black text-green-900 dark:text-green-100">
                  SAME
                </span>
              )}
            </div>

            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {plan.truck.driver_name || 'No driver'}
            </p>

            {routeGroups.length > 0 && (
              <p className="mt-1 truncate text-xs font-semibold text-purple-300">
                {routeGroups.map((group) => group.label).join(' • ')}
              </p>
            )}
          </div>

          <div className="grid grid-cols-4 gap-2 text-center sm:min-w-[320px]">
            <TruckTinyStat label="Off" value={String(movingOut.length)} tone="red" />
            <TruckTinyStat label="On" value={String(movingIn.length)} tone="green" />
            <TruckTinyStat label="Stay" value={String(staying.length)} tone="slate" />
            <TruckTinyStat label="Skids" value={String(plan.suggestedSkids)} tone={overSkids ? 'red' : 'blue'} />
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-slate-900 px-3 py-2">
          <p
            className={`text-xs font-semibold ${
              overWeight || overSkids ? 'text-red-700 dark:text-red-300' : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Final load: {plan.suggestedSkids}/{plan.truck.capacity_skids || 12} skids •{' '}
            {plan.suggestedWeightLbs.toLocaleString()}/{(plan.truck.max_weight_lbs || 15000).toLocaleString()} lbs
          </p>

          <ChevronDown className="h-4 w-4 text-slate-500 dark:text-slate-500" />
        </div>
      </summary>

      <div className="mt-4 space-y-4">
        <div className="rounded-2xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-50 dark:bg-blue-950/20 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-blue-700 dark:text-blue-200">
                <Route className="h-4 w-4" />
                Google route
              </p>

              <p className="mt-1 text-xs text-blue-900 dark:text-blue-100/70">
                Calculates road distance and drive time for this truck using the final suggested stops.
              </p>
            </div>

            <button
              type="button"
              onClick={() => onCalculateGoogleRoute(plan)}
              className="btn-secondary flex items-center justify-center gap-2"
              disabled={googleRouteLoading || plan.suggestedStops.length < 2}
            >
              <Route className="h-4 w-4" />
              {googleRouteLoading ? 'Calculating...' : 'Calculate Google Route'}
            </button>
          </div>

          {plan.suggestedStops.length < 2 && (
            <p className="mt-3 text-xs text-amber-800 dark:text-yellow-200">
              This truck needs at least two GPS-ready stops to calculate a route.
            </p>
          )}

          {plan.suggestedStops.length > 27 && (
            <p className="mt-3 text-xs text-amber-800 dark:text-yellow-200">
              This truck has more than 27 stops, so split it before calculating a Google route.
            </p>
          )}

          {googleRouteEstimate && (
            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[220px_1fr]">
              <div className="rounded-xl border border-blue-200 dark:border-blue-900 bg-white dark:bg-slate-950 p-4">
                <p className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-500">
                  Distance
                </p>
                <p className="mt-1 text-2xl font-black text-slate-950 dark:text-white">
                  {googleRouteEstimate.distanceText}
                </p>

                <p className="mt-4 text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-500">
                  Drive time
                </p>
                <p className="mt-1 text-2xl font-black text-slate-950 dark:text-white">
                  {googleRouteEstimate.durationText}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-dark-border bg-white dark:bg-slate-950 p-4">
                <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-500">
                  Google optimized stop order
                </p>

                <div className="space-y-2">
                  {googleRouteEstimate.orderedStops.map((stop, index) => (
                    <div
                      key={`${stop.shipmentId}-${index}`}
                      className="flex items-center gap-3 rounded-lg border border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-slate-900 px-3 py-2"
                    >
                      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-900 text-xs font-black text-blue-900 dark:text-blue-100">
                        {index + 1}
                      </span>

                      <p className="truncate text-sm font-semibold text-slate-950 dark:text-white">
                        {stop.label}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {(movingOut.length > 0 || movingIn.length > 0) && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <MoveColumn title="Take off" tone="red" count={movingOut.length}>
              {movingOut.length === 0 ? (
                <EmptyMoveText text="Nothing comes off." />
              ) : (
                movingOut.map((stop) => (
                  <FinalMoveCard
                    key={stop.shipment.id}
                    stop={stop}
                    badge={`TO ${stop.suggestedTruckNumber}`}
                    tone="red"
                  />
                ))
              )}
            </MoveColumn>

            <MoveColumn title="Add on" tone="green" count={movingIn.length}>
              {movingIn.length === 0 ? (
                <EmptyMoveText text="Nothing gets added." />
              ) : (
                movingIn.map((stop) => (
                  <FinalMoveCard
                    key={stop.shipment.id}
                    stop={stop}
                    badge={`FROM ${stop.currentTruckNumber}`}
                    tone="green"
                  />
                ))
              )}
            </MoveColumn>
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-500">
            Final load
          </p>

          {plan.suggestedStops.length === 0 ? (
            <div className="rounded-xl border border-slate-200 dark:border-dark-border bg-black/40 p-4">
              <p className="text-sm text-slate-500 dark:text-slate-500">
                No freight suggested for this truck.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {plan.suggestedStops.map((stop) => (
                <FinalStopCard
                  key={stop.shipment.id}
                  stop={stop}
                  badge={
                    stop.currentTruckId === plan.truck.id
                      ? 'STAYS'
                      : `FROM ${stop.currentTruckNumber}`
                  }
                  tone={stop.currentTruckId === plan.truck.id ? 'neutral' : 'green'}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </details>
  );
}

function TruckTinyStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'red' | 'green' | 'blue' | 'slate';
}) {
  const toneClasses = {
    red: 'border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-50 dark:bg-red-950/30 text-red-900 dark:text-red-100',
    green: 'border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-50 dark:bg-green-950/30 text-green-900 dark:text-green-100',
    blue: 'border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-50 dark:bg-blue-950/30 text-blue-900 dark:text-blue-100',
    slate: 'border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200',
  };

  return (
    <div className={`rounded-xl border px-2 py-2 ${toneClasses[tone]}`}>
      <p className="text-[10px] font-black uppercase tracking-wide opacity-70">
        {label}
      </p>

      <p className="mt-1 text-lg font-black text-slate-950 dark:text-white">
        {value}
      </p>
    </div>
  );
}

function FinalMoveCard({
  stop,
  badge,
  tone,
}: {
  stop: StopWithLocation;
  badge: string;
  tone: 'red' | 'green';
}) {
  return (
    <div className="rounded-xl border border-black/30 bg-black/30 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-slate-950 dark:text-white">
            {getPickupDisplayName(stop.shipment)}
          </p>
          <p className="mt-1 truncate text-xs text-blue-700 dark:text-blue-300">
            To: {getDeliveryDisplayName(stop.shipment)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
            {stop.routeBucketLabel} • {stop.skids} skids • {stop.weightLbs.toLocaleString()} lbs
          </p>
        </div>

        <span
          className={`flex-shrink-0 rounded-lg px-2 py-1 text-[10px] font-black ${
            tone === 'red'
              ? 'bg-red-700 text-white'
              : 'bg-green-700 text-white'
          }`}
        >
          {badge}
        </span>
      </div>
    </div>
  );
}

function FinalStopCard({
  stop,
  badge,
  tone,
}: {
  stop: StopWithLocation;
  badge: string;
  tone: 'green' | 'neutral';
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        tone === 'green'
          ? 'border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-50 dark:bg-green-950/40'
          : 'border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-slate-900'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-slate-950 dark:text-white">
            {getPickupDisplayName(stop.shipment)}
          </p>

          <p className="mt-1 truncate text-xs text-blue-700 dark:text-blue-300">
            To: {getDeliveryDisplayName(stop.shipment)}
          </p>

          <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
            {stop.routeBucketLabel} • {stop.skids} skids • {stop.weightLbs.toLocaleString()} lbs
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <span
            className={`rounded-lg px-2 py-1 text-[10px] font-black ${
              tone === 'green'
                ? 'bg-green-700 text-white'
                : 'bg-slate-700 text-slate-100'
            }`}
          >
            {badge}
          </span>

          {stop.locked && (
            <span title="Locked by dispatch">
              <Lock className="h-4 w-4 text-amber-700 dark:text-yellow-300" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function ShipmentMiniCard({
  shipment,
  bucketLabel,
  statusLabel,
  statusTone,
}: {
  shipment: Shipment;
  bucketLabel: string;
  statusLabel: string;
  statusTone: 'green' | 'red';
}) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-slate-900 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-slate-950 dark:text-white">
            {getPickupDisplayName(shipment)}
          </p>
          <p className="mt-1 truncate text-xs text-blue-700 dark:text-blue-300">
            To: {getDeliveryDisplayName(shipment)}
          </p>
          <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-500">
            {displayLocation(shipment.delivery_address, shipment.delivery_city)}
          </p>
          <p className="mt-1 text-xs text-purple-300">{bucketLabel}</p>
        </div>

        <span
          className={`flex-shrink-0 rounded-lg px-2 py-1 text-[10px] font-black ${
            statusTone === 'green'
              ? 'bg-green-800 text-green-900 dark:text-green-100'
              : 'bg-red-800 text-red-900 dark:text-red-100'
          }`}
        >
          {statusLabel}
        </span>
      </div>
    </div>
  );
}

function GeocodeSummary({
  logs,
}: {
  logs: GeocodeDeliveriesResponse['logs'];
}) {
  const successCount = logs.filter((log) => log.status === 'success').length;
  const skippedCount = logs.filter((log) => log.status === 'skipped').length;
  const errorCount = logs.filter((log) => log.status === 'error').length;

  return (
    <details className="rounded-2xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-card p-5">
      <summary className="cursor-pointer list-none">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-black text-slate-950 dark:text-white">Latest GPS results</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {successCount} saved • {skippedCount} skipped • {errorCount} failed
            </p>
          </div>

          <p className="flex items-center gap-2 text-sm font-semibold text-blue-700 dark:text-blue-300">
            Click to show details
            <ChevronDown className="h-4 w-4" />
          </p>
        </div>
      </summary>

      <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
        {logs.slice(0, 12).map((log, index) => (
          <div
            key={`${log.shipmentId}-${log.status}-${index}`}
            className={`rounded-xl border p-3 ${
              log.status === 'success'
                ? 'border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-50 dark:bg-green-950/30'
                : log.status === 'skipped'
                  ? 'border-yellow-200 dark:border-yellow-900 bg-yellow-50 dark:bg-yellow-950/30'
                  : 'border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-50 dark:bg-red-950/30'
            }`}
          >
            <p className="font-bold text-slate-950 dark:text-white">{log.label}</p>
            <p className="mt-1 truncate text-xs text-slate-600 dark:text-slate-400">{log.address}</p>
            <p className="mt-1 text-xs text-slate-700 dark:text-slate-300">{log.message}</p>
          </div>
        ))}
      </div>
    </details>
  );
}

function RuleCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-dark-border bg-white dark:bg-slate-950 p-4">
      <p className="font-black text-slate-950 dark:text-white">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-400">{description}</p>
    </div>
  );
}

function MoveColumn({
  title,
  tone,
  count,
  children,
}: {
  title: string;
  tone: 'red' | 'green';
  count: number;
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        tone === 'red'
          ? 'border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-50 dark:bg-red-950/30'
          : 'border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-50 dark:bg-green-950/30'
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <p
          className={`text-sm font-black uppercase tracking-wide ${
            tone === 'red' ? 'text-red-700 dark:text-red-200' : 'text-green-700 dark:text-green-200'
          }`}
        >
          {title}
        </p>
        <span
          className={`rounded-full px-2 py-1 text-xs font-black ${
            tone === 'red'
              ? 'bg-red-900 text-red-900 dark:text-red-100'
              : 'bg-green-900 text-green-900 dark:text-green-100'
          }`}
        >
          {count}
        </span>
      </div>

      <div className="space-y-2">{children}</div>
    </div>
  );
}

function EmptyMoveText({ text }: { text: string }) {
  return <p className="text-sm text-slate-600 dark:text-slate-400">{text}</p>;
}

function SummaryBox({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-dark-border bg-white dark:bg-slate-950 px-4 py-3">
      <p className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-500">
        {label}
      </p>

      <p className="mt-1 text-2xl font-black text-slate-950 dark:text-white">
        {value}
      </p>
    </div>
  );
}

function summarizeShipmentBuckets(shipments: Shipment[]) {
  const groups = new Map<
    string,
    {
      key: string;
      label: string;
      count: number;
    }
  >();

  for (const shipment of shipments) {
    const bucket = getRouteBucket(shipment);

    if (!groups.has(bucket.key)) {
      groups.set(bucket.key, {
        key: bucket.key,
        label: bucket.label,
        count: 0,
      });
    }

    const group = groups.get(bucket.key);

    if (group) {
      group.count++;
    }
  }

  return Array.from(groups.values()).sort((a, b) => {
    const aPriority = getBucketPriorityFromKey(a.key);
    const bPriority = getBucketPriorityFromKey(b.key);

    if (aPriority !== bPriority) {
      return bPriority - aPriority;
    }

    return a.label.localeCompare(b.label);
  });
}

function groupMovesByFromTruck(moves: CrossDockMove[]) {
  const groups = new Map<
    string,
    {
      fromTruckId: string;
      fromTruckNumber: string;
      moves: CrossDockMove[];
      skids: number;
      weightLbs: number;
    }
  >();

  for (const move of moves) {
    if (!groups.has(move.fromTruckId)) {
      groups.set(move.fromTruckId, {
        fromTruckId: move.fromTruckId,
        fromTruckNumber: move.fromTruckNumber,
        moves: [],
        skids: 0,
        weightLbs: 0,
      });
    }

    const group = groups.get(move.fromTruckId);

    if (!group) {
      continue;
    }

    group.moves.push(move);
    group.skids += move.skids;
    group.weightLbs += move.weightLbs;
  }

  return Array.from(groups.values()).sort((a, b) =>
    safeString(a.fromTruckNumber).localeCompare(safeString(b.fromTruckNumber))
  );
}

function buildPlannerResult({
  activeAssignedFreight,
  trucks,
  companies,
}: {
  activeAssignedFreight: Shipment[];
  trucks: Truck[];
  companies: Company[];
}): PlannerResult {
  const truckById = new Map(trucks.map((truck) => [truck.id, truck]));
  const locatedStops: StopWithLocation[] = [];
  const missingLocationStops: MissingLocationStop[] = [];

  for (const shipment of activeAssignedFreight) {
    const truck = shipment.assigned_truck_id
      ? truckById.get(shipment.assigned_truck_id)
      : null;

    if (!truck || !shipment.assigned_truck_id) {
      continue;
    }

    const locationSource = getShipmentLocationSource(shipment, companies);

    if (!locationSource) {
      missingLocationStops.push({
        shipment,
        truckNumber: truck.truck_number,
        reason:
          'No GPS found. Use Geocode Missing Deliveries, then refresh and analyze again.',
      });

      continue;
    }

    const bucket = getRouteBucket(shipment);

    locatedStops.push({
      shipment,
      currentTruckId: truck.id,
      currentTruckNumber: truck.truck_number,
      suggestedTruckId: truck.id,
      suggestedTruckNumber: truck.truck_number,
      latitude: locationSource.latitude,
      longitude: locationSource.longitude,
      skids: Number(shipment.number_of_skids || 0),
      weightLbs: Number(shipment.weight_lbs || shipment.weight_kg || 0),
      locked: Boolean(shipment.routing_locked),
      gpsSource: locationSource.source,
      routeBucket: bucket.key,
      routeBucketLabel: bucket.label,
      routeBucketPriority: bucket.priority,
    });
  }

  const suggestedStops = optimizeStopAssignmentsByRouteBuckets(locatedStops, trucks);

  const truckPlans = buildTruckPlans(trucks, locatedStops, suggestedStops);
  const crossDockMoves = buildCrossDockMoves(suggestedStops);

  const currentScoreKm = scoreLayout(locatedStops, 'current');
  const suggestedScoreKm = scoreLayout(suggestedStops, 'suggested');

  return {
    stops: suggestedStops,
    missingLocationStops,
    truckPlans,
    crossDockMoves,
    currentScoreKm,
    suggestedScoreKm,
  };
}

function optimizeStopAssignmentsByRouteBuckets(
  stops: StopWithLocation[],
  trucks: Truck[]
) {
  if (stops.length === 0) {
    return [];
  }

  const truckMap = new Map(trucks.map((truck) => [truck.id, truck]));

  /*
    Conservative cross-dock logic:
    - Start by keeping every shipment exactly where dispatch already put it.
    - Only suggest a move when there is a clear route-group problem.
    - Do not move freight just because a rough distance score looks slightly better.
    - Warehouse and Buffalo groups are treated as protected groups.
  */
  const nextStops: StopWithLocation[] = stops.map((stop) => ({
    ...stop,
    suggestedTruckId: stop.currentTruckId,
    suggestedTruckNumber: stop.currentTruckNumber,
  }));

  const capacityUsed = buildCapacityMapFromSuggestedStops(nextStops, trucks);

  const protectedBucketKeys = ['freightboy_warehouse', 'buffalo'];

  for (const bucketKey of protectedBucketKeys) {
    const bucketStops = nextStops.filter((stop) => stop.routeBucket === bucketKey);

    if (bucketStops.length <= 1) {
      continue;
    }

    const dominantTruckId = findDominantTruckForStops(bucketStops);

    if (!dominantTruckId) {
      continue;
    }

    /*
      If most Warehouse freight is already on Unit 33, keep Unit 33 as the
      warehouse truck and only pull split Warehouse freight back to it.
      If most Buffalo freight is already on Unit 44, keep Unit 44 as the
      Buffalo truck and only pull split Buffalo freight back to it.
    */
    for (const stop of bucketStops) {
      if (stop.locked) {
        continue;
      }

      if (stop.suggestedTruckId === dominantTruckId) {
        continue;
      }

      const moved = moveStopIfSafe({
        stop,
        targetTruckId: dominantTruckId,
        nextStops,
        trucks,
        truckMap,
        capacityUsed,
        reason: 'protected-bucket-split',
      });

      if (!moved) {
        continue;
      }
    }
  }

  /*
    Second pass:
    If one truck has both Warehouse and Buffalo, fix only the minority/conflicting
    protected freight by moving it back to that bucket's dominant truck.
    This prevents a Buffalo truck from receiving random Warehouse freight.
  */
  for (const truck of trucks) {
    const truckStops = nextStops.filter((stop) => stop.suggestedTruckId === truck.id);
    const warehouseStops = truckStops.filter(
      (stop) => stop.routeBucket === 'freightboy_warehouse'
    );
    const buffaloStops = truckStops.filter((stop) => stop.routeBucket === 'buffalo');

    if (warehouseStops.length === 0 || buffaloStops.length === 0) {
      continue;
    }

    const warehouseDominantTruckId = findDominantTruckForStops(
      nextStops.filter((stop) => stop.routeBucket === 'freightboy_warehouse')
    );

    const buffaloDominantTruckId = findDominantTruckForStops(
      nextStops.filter((stop) => stop.routeBucket === 'buffalo')
    );

    const shouldMoveWarehouse =
      warehouseStops.length <= buffaloStops.length &&
      warehouseDominantTruckId &&
      warehouseDominantTruckId !== truck.id;

    const shouldMoveBuffalo =
      buffaloStops.length < warehouseStops.length &&
      buffaloDominantTruckId &&
      buffaloDominantTruckId !== truck.id;

    if (shouldMoveWarehouse && warehouseDominantTruckId) {
      for (const stop of warehouseStops) {
        if (stop.locked) {
          continue;
        }

        moveStopIfSafe({
          stop,
          targetTruckId: warehouseDominantTruckId,
          nextStops,
          trucks,
          truckMap,
          capacityUsed,
          reason: 'warehouse-on-buffalo-truck',
        });
      }
    }

    if (shouldMoveBuffalo && buffaloDominantTruckId) {
      for (const stop of buffaloStops) {
        if (stop.locked) {
          continue;
        }

        moveStopIfSafe({
          stop,
          targetTruckId: buffaloDominantTruckId,
          nextStops,
          trucks,
          truckMap,
          capacityUsed,
          reason: 'buffalo-on-warehouse-truck',
        });
      }
    }
  }

  return nextStops.sort((a, b) => {
    const truckCompare = safeString(a.suggestedTruckNumber).localeCompare(
      safeString(b.suggestedTruckNumber)
    );

    if (truckCompare !== 0) {
      return truckCompare;
    }

    const bucketCompare = b.routeBucketPriority - a.routeBucketPriority;

    if (bucketCompare !== 0) {
      return bucketCompare;
    }

    return getPickupDisplayName(a.shipment).localeCompare(
      getPickupDisplayName(b.shipment)
    );
  });
}

function buildCapacityMapFromSuggestedStops(
  stops: StopWithLocation[],
  trucks: Truck[]
) {
  const capacityUsed = new Map<string, { skids: number; weightLbs: number }>();

  for (const truck of trucks) {
    capacityUsed.set(truck.id, {
      skids: 0,
      weightLbs: 0,
    });
  }

  for (const stop of stops) {
    const used = capacityUsed.get(stop.suggestedTruckId);

    if (!used) {
      continue;
    }

    used.skids += stop.skids;
    used.weightLbs += stop.weightLbs;
  }

  return capacityUsed;
}

function findDominantTruckForStops(stops: StopWithLocation[]) {
  const counts = new Map<
    string,
    {
      truckId: string;
      truckNumber: string;
      stops: number;
      skids: number;
      weightLbs: number;
    }
  >();

  for (const stop of stops) {
    if (!counts.has(stop.suggestedTruckId)) {
      counts.set(stop.suggestedTruckId, {
        truckId: stop.suggestedTruckId,
        truckNumber: stop.suggestedTruckNumber,
        stops: 0,
        skids: 0,
        weightLbs: 0,
      });
    }

    const group = counts.get(stop.suggestedTruckId);

    if (!group) {
      continue;
    }

    group.stops++;
    group.skids += stop.skids;
    group.weightLbs += stop.weightLbs;
  }

  const dominant = Array.from(counts.values()).sort((a, b) => {
    if (b.stops !== a.stops) {
      return b.stops - a.stops;
    }

    if (b.skids !== a.skids) {
      return b.skids - a.skids;
    }

    return safeString(a.truckNumber).localeCompare(safeString(b.truckNumber));
  })[0];

  return dominant?.truckId || null;
}

function moveStopIfSafe({
  stop,
  targetTruckId,
  nextStops,
  trucks,
  truckMap,
  capacityUsed,
}: {
  stop: StopWithLocation;
  targetTruckId: string;
  nextStops: StopWithLocation[];
  trucks: Truck[];
  truckMap: Map<string, Truck>;
  capacityUsed: Map<string, { skids: number; weightLbs: number }>;
  reason: string;
}) {
  if (stop.suggestedTruckId === targetTruckId) {
    return false;
  }

  const targetTruck = truckMap.get(targetTruckId);

  if (!targetTruck) {
    return false;
  }

  const sourceUsed = capacityUsed.get(stop.suggestedTruckId);
  const targetUsed = capacityUsed.get(targetTruckId);

  if (!targetUsed) {
    return false;
  }

  const targetCapacitySkids = targetTruck.capacity_skids || 12;
  const targetCapacityWeight = targetTruck.max_weight_lbs || 15000;

  if (targetUsed.skids + stop.skids > targetCapacitySkids) {
    return false;
  }

  if (targetUsed.weightLbs + stop.weightLbs > targetCapacityWeight) {
    return false;
  }

  const targetStops = nextStops.filter(
    (item) => item.suggestedTruckId === targetTruckId && item.shipment.id !== stop.shipment.id
  );

  const targetProtectedBuckets = new Set(
    targetStops
      .map((item) => item.routeBucket)
      .filter((bucket) => bucket === 'freightboy_warehouse' || bucket === 'buffalo')
  );

  const movingProtectedBucket =
    stop.routeBucket === 'freightboy_warehouse' || stop.routeBucket === 'buffalo';

  /*
    Do not create a Warehouse + Buffalo mixed truck.
    The only time a protected bucket should move is back to the truck that
    already owns that same protected bucket.
  */
  if (movingProtectedBucket) {
    for (const bucket of targetProtectedBuckets) {
      if (bucket !== stop.routeBucket) {
        return false;
      }
    }
  }

  if (sourceUsed) {
    sourceUsed.skids -= stop.skids;
    sourceUsed.weightLbs -= stop.weightLbs;
  }

  targetUsed.skids += stop.skids;
  targetUsed.weightLbs += stop.weightLbs;

  stop.suggestedTruckId = targetTruck.id;
  stop.suggestedTruckNumber = targetTruck.truck_number;

  return true;
}

function groupStopsByBucket(stops: StopWithLocation[]) {
  const groups = new Map<
    string,
    {
      key: string;
      label: string;
      priority: number;
      isDedicatedBucket: boolean;
      stops: StopWithLocation[];
      skids: number;
      weightLbs: number;
      latitude: number;
      longitude: number;
    }
  >();

  for (const stop of stops) {
    if (!groups.has(stop.routeBucket)) {
      groups.set(stop.routeBucket, {
        key: stop.routeBucket,
        label: stop.routeBucketLabel,
        priority: stop.routeBucketPriority,
        isDedicatedBucket:
          stop.routeBucket === 'freightboy_warehouse' ||
          stop.routeBucket === 'buffalo',
        stops: [],
        skids: 0,
        weightLbs: 0,
        latitude: 0,
        longitude: 0,
      });
    }

    const group = groups.get(stop.routeBucket);

    if (!group) {
      continue;
    }

    group.stops.push(stop);
    group.skids += stop.skids;
    group.weightLbs += stop.weightLbs;
  }

  for (const group of groups.values()) {
    group.latitude =
      group.stops.reduce((sum, stop) => sum + stop.latitude, 0) /
      group.stops.length;

    group.longitude =
      group.stops.reduce((sum, stop) => sum + stop.longitude, 0) /
      group.stops.length;
  }

  return groups;
}

function findBestTruckForRouteBucket({
  group,
  trucks,
  capacityUsed,
  reservedSpecialTruckIds,
}: {
  group: {
    key: string;
    label: string;
    priority: number;
    isDedicatedBucket: boolean;
    stops: StopWithLocation[];
    skids: number;
    weightLbs: number;
    latitude: number;
    longitude: number;
  };
  trucks: Truck[];
  capacityUsed: Map<string, { skids: number; weightLbs: number }>;
  reservedSpecialTruckIds: Set<string>;
}) {
  const groupCurrentTruckCounts = new Map<string, number>();

  for (const stop of group.stops) {
    groupCurrentTruckCounts.set(
      stop.currentTruckId,
      (groupCurrentTruckCounts.get(stop.currentTruckId) || 0) + 1
    );
  }

  const candidates = trucks
    .map((truck) => {
      const used = capacityUsed.get(truck.id) || { skids: 0, weightLbs: 0 };

      const truckSkidCapacity = truck.capacity_skids || 12;
      const truckWeightCapacity = truck.max_weight_lbs || 15000;

      const fitsSkids = used.skids + group.skids <= truckSkidCapacity;
      const fitsWeight = used.weightLbs + group.weightLbs <= truckWeightCapacity;

      const sameTruckBonus = (groupCurrentTruckCounts.get(truck.id) || 0) * -8;

      const reservedPenalty =
        reservedSpecialTruckIds.has(truck.id) && !group.isDedicatedBucket
          ? 5000
          : 0;

      const alreadyUsedPenalty =
        group.isDedicatedBucket && used.skids > 0
          ? 20
          : 0;

      return {
        truck,
        fits: fitsSkids && fitsWeight,
        score: sameTruckBonus + reservedPenalty + alreadyUsedPenalty,
      };
    })
    .sort((a, b) => a.score - b.score);

  const fittingCandidate = candidates.find((candidate) => candidate.fits);

  return fittingCandidate?.truck || null;
}

function findBestTruckForSingleStop({
  stop,
  trucks,
  capacityUsed,
  reservedSpecialTruckIds,
}: {
  stop: StopWithLocation;
  trucks: Truck[];
  capacityUsed: Map<string, { skids: number; weightLbs: number }>;
  reservedSpecialTruckIds: Set<string>;
}) {
  const candidates = trucks
    .map((truck) => {
      const used = capacityUsed.get(truck.id) || { skids: 0, weightLbs: 0 };

      const truckSkidCapacity = truck.capacity_skids || 12;
      const truckWeightCapacity = truck.max_weight_lbs || 15000;

      const fitsSkids = used.skids + stop.skids <= truckSkidCapacity;
      const fitsWeight = used.weightLbs + stop.weightLbs <= truckWeightCapacity;

      const currentTruckBonus = stop.currentTruckId === truck.id ? -10 : 0;
      const reservedPenalty = reservedSpecialTruckIds.has(truck.id) ? 5000 : 0;

      return {
        truck,
        fits: fitsSkids && fitsWeight,
        score: currentTruckBonus + reservedPenalty + used.skids,
      };
    })
    .sort((a, b) => a.score - b.score);

  const fittingCandidate = candidates.find((candidate) => candidate.fits);

  return fittingCandidate?.truck || candidates[0].truck;
}

function summarizeBuckets(stops: StopWithLocation[]) {
  const groups = new Map<
    string,
    {
      key: string;
      label: string;
      count: number;
      skids: number;
      truckNumbers: string[];
    }
  >();

  for (const stop of stops) {
    if (!groups.has(stop.routeBucket)) {
      groups.set(stop.routeBucket, {
        key: stop.routeBucket,
        label: stop.routeBucketLabel,
        count: 0,
        skids: 0,
        truckNumbers: [],
      });
    }

    const group = groups.get(stop.routeBucket);

    if (!group) {
      continue;
    }

    group.count++;
    group.skids += stop.skids;

    if (!group.truckNumbers.includes(stop.suggestedTruckNumber)) {
      group.truckNumbers.push(stop.suggestedTruckNumber);
    }
  }

  return Array.from(groups.values()).sort((a, b) => {
    const aPriority = getBucketPriorityFromKey(a.key);
    const bPriority = getBucketPriorityFromKey(b.key);

    if (aPriority !== bPriority) {
      return bPriority - aPriority;
    }

    return a.label.localeCompare(b.label);
  });
}

function getBucketPriorityFromKey(key: string) {
  if (key === 'freightboy_warehouse') return 100;
  if (key === 'buffalo') return 90;
  return 10;
}

function buildTruckPlans(
  trucks: Truck[],
  currentStops: StopWithLocation[],
  suggestedStops: StopWithLocation[]
) {
  return trucks.map((truck) => {
    const truckCurrentStops = currentStops.filter(
      (stop) => stop.currentTruckId === truck.id
    );

    const truckSuggestedStops = suggestedStops.filter(
      (stop) => stop.suggestedTruckId === truck.id
    );

    return {
      truck,
      currentStops: truckCurrentStops,
      suggestedStops: truckSuggestedStops,
      currentSkids: truckCurrentStops.reduce((sum, stop) => sum + stop.skids, 0),
      suggestedSkids: truckSuggestedStops.reduce((sum, stop) => sum + stop.skids, 0),
      currentWeightLbs: truckCurrentStops.reduce(
        (sum, stop) => sum + stop.weightLbs,
        0
      ),
      suggestedWeightLbs: truckSuggestedStops.reduce(
        (sum, stop) => sum + stop.weightLbs,
        0
      ),
    };
  });
}

function buildCrossDockMoves(stops: StopWithLocation[]) {
  return stops
    .filter((stop) => stop.currentTruckId !== stop.suggestedTruckId)
    .map((stop) => ({
      shipment: stop.shipment,
      fromTruckId: stop.currentTruckId,
      fromTruckNumber: stop.currentTruckNumber,
      toTruckId: stop.suggestedTruckId,
      toTruckNumber: stop.suggestedTruckNumber,
      skids: stop.skids,
      weightLbs: stop.weightLbs,
    }))
    .sort((a, b) => {
      const fromCompare = safeString(a.fromTruckNumber).localeCompare(
        safeString(b.fromTruckNumber)
      );

      if (fromCompare !== 0) {
        return fromCompare;
      }

      return getPickupDisplayName(a.shipment).localeCompare(
        getPickupDisplayName(b.shipment)
      );
    });
}

function scoreLayout(
  stops: StopWithLocation[],
  mode: 'current' | 'suggested'
) {
  const truckIds = Array.from(
    new Set(
      stops.map((stop) =>
        mode === 'current' ? stop.currentTruckId : stop.suggestedTruckId
      )
    )
  );

  let totalDistance = 0;

  for (const truckId of truckIds) {
    const truckStops = stops.filter((stop) =>
      mode === 'current'
        ? stop.currentTruckId === truckId
        : stop.suggestedTruckId === truckId
    );

    if (truckStops.length <= 1) {
      continue;
    }

    const centroid = averageCoordinates(truckStops);

    for (const stop of truckStops) {
      totalDistance += haversineKm(
        stop.latitude,
        stop.longitude,
        centroid.latitude,
        centroid.longitude
      );
    }
  }

  return totalDistance;
}

function averageCoordinates(stops: StopWithLocation[]) {
  const latitude =
    stops.reduce((sum, stop) => sum + stop.latitude, 0) / stops.length;

  const longitude =
    stops.reduce((sum, stop) => sum + stop.longitude, 0) / stops.length;

  return {
    latitude,
    longitude,
  };
}

function groupStopsBySuggestedTruck(stops: StopWithLocation[]) {
  return stops.reduce<Record<string, StopWithLocation[]>>((groups, stop) => {
    if (!groups[stop.suggestedTruckId]) {
      groups[stop.suggestedTruckId] = [];
    }

    groups[stop.suggestedTruckId].push(stop);

    return groups;
  }, {});
}

async function updateTruckAssignment(
  shipmentId: string,
  truckId: string,
  assignedAt: string
) {
  const deleteResult = await supabase
    .from('truck_assignments')
    .delete()
    .eq('shipment_id', shipmentId);

  if (deleteResult.error) {
    throw deleteResult.error;
  }

  const insertResult = await supabase.from('truck_assignments').insert([
    {
      shipment_id: shipmentId,
      truck_id: truckId,
      assigned_at: assignedAt,
    },
  ]);

  if (insertResult.error) {
    throw insertResult.error;
  }
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
      priority: 100,
    };
  }

  if (
    allText.includes('buffalo') ||
    allText.includes('cheektowaga') ||
    allText.includes('tonawanda') ||
    allText.includes('amherst ny') ||
    allText.includes('kenmore ny')
  ) {
    return {
      key: 'buffalo',
      label: 'Buffalo',
      priority: 90,
    };
  }

  if (shipment.delivery_city && shipment.delivery_city.trim() !== '') {
    return {
      key: `city_${normalizeRouteKey(shipment.delivery_city)}`,
      label: shipment.delivery_city,
      priority: 10,
    };
  }

  if (shipment.delivery_company_name && shipment.delivery_company_name.trim() !== '') {
    return {
      key: `company_${normalizeRouteKey(shipment.delivery_company_name)}`,
      label: shipment.delivery_company_name,
      priority: 10,
    };
  }

  return {
    key: 'other',
    label: 'Other',
    priority: 1,
  };
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

function getPickupDisplayName(shipment: Shipment) {
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
    'Pickup unknown'
  );
}

function getDeliveryDisplayName(shipment: Shipment) {
  if (shipment.delivery_company_name && shipment.delivery_company_name.trim() !== '') {
    return shipment.delivery_company_name;
  }

  const deliveryLocation = displayLocation(
    shipment.delivery_address,
    shipment.delivery_city
  );

  if (deliveryLocation !== 'Location unknown') {
    return deliveryLocation;
  }

  return (
    shipment.board_name ||
    shipment.work_order_number ||
    'Delivery unknown'
  );
}

function buildDeliveryAddress(shipment: Shipment) {
  const parts = [
    shipment.delivery_address,
    shipment.delivery_city,
    shipment.delivery_postal_code,
  ].filter((part) => part && String(part).trim() !== '');

  return parts.join(', ');
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

function safeString(value?: string | null) {
  return value || '';
}

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  const earthRadiusKm = 6371;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusKm * c;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}