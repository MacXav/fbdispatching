'use client';

import { useEffect, useMemo, useState } from 'react';
import MainLayout from '@/components/MainLayout';
import Header from '@/components/Header';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Lock,
  MapPinned,
  RefreshCw,
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
          subtitle="Analyze assigned freight and suggest cross-dock moves"
        />

        <div className="card py-12 text-center">
          <p className="text-slate-400">Loading routing planner...</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <Header
        title="Routing Planner"
        subtitle="Compare every truck, every delivery location, and suggest a better layout"
      />

      <div className="mb-6 rounded-xl border border-blue-900 bg-blue-950/40 p-4">
        <div className="flex items-start gap-3">
          <MapPinned className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-300" />

          <div>
            <p className="font-semibold text-blue-100">
              Route bucket mode is active.
            </p>

            <p className="mt-1 text-sm leading-6 text-blue-200/80">
              The planner now tries to keep Freightboy Warehouse deliveries together and Buffalo deliveries together on their own truck when capacity allows.
            </p>
          </div>
        </div>
      </div>

      <div className="mb-6 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
          <SummaryBox
            label="Assigned freight"
            value={String(activeAssignedFreight.length)}
          />

          <SummaryBox
            label="With GPS"
            value={String(assignedWithGpsCount)}
          />

          <SummaryBox
            label="Need GPS"
            value={String(shipmentsNeedingDeliveryGps.length)}
          />

          <SummaryBox
            label="Active trucks"
            value={String(activeTrucks.length)}
          />

          <SummaryBox
            label="Companies GPS"
            value={String(
              companies.filter((company) => hasCoordinates(company)).length
            )}
          />
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
            disabled={loading || analyzing || applying || geocodingDeliveries}
          >
            <MapPinned className="h-4 w-4" />
            {geocodingDeliveries
              ? 'Geocoding...'
              : `Geocode Missing Deliveries (${shipmentsNeedingDeliveryGps.length})`}
          </button>

          <button
            type="button"
            onClick={analyzeLayout}
            className="btn-primary flex items-center justify-center gap-2"
            disabled={loading || analyzing || applying || geocodingDeliveries}
          >
            <Shuffle className="h-4 w-4" />
            {analyzing ? 'Analyzing...' : 'Analyze Layout'}
          </button>
        </div>
      </div>

      {latestGeocodeLogs.length > 0 && (
        <div className="mb-6 rounded-xl border border-dark-border bg-dark-card p-4">
          <h2 className="mb-3 text-lg font-bold text-white">
            Latest Geocode Results
          </h2>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {latestGeocodeLogs.slice(0, 12).map((log, index) => (
              <div
                key={`${log.shipmentId}-${log.status}-${index}`}
                className={`rounded-lg border p-3 ${
                  log.status === 'success'
                    ? 'border-green-900 bg-green-950/30'
                    : log.status === 'skipped'
                      ? 'border-yellow-900 bg-yellow-950/30'
                      : 'border-red-900 bg-red-950/30'
                }`}
              >
                <p className="font-semibold text-white">{log.label}</p>
                <p className="mt-1 text-xs text-slate-400">{log.address}</p>
                <p className="mt-1 text-xs text-slate-300">{log.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!plannerResult ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="card xl:col-span-2">
            <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-white">
              <TruckIcon className="h-5 w-5 text-blue-400" />
              Current Truck Layout
            </h2>

            {activeTrucks.length === 0 ? (
              <p className="text-slate-400">
                No active assigned trucks yet. Assign freight on the truck board first.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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

                  return (
                    <div
                      key={truck.id}
                      className="rounded-xl border border-dark-border bg-slate-900 p-4"
                    >
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <p className="text-lg font-bold text-white">
                            {truck.truck_number}
                          </p>

                          <p className="text-sm text-slate-400">
                            {truck.driver_name || 'No driver'}
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="text-sm font-bold text-blue-300">
                            {truckFreight.length} stop(s)
                          </p>

                          <p className="text-xs text-slate-500">
                            {totalSkids} skids • {totalWeight.toLocaleString()} lbs
                          </p>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {truckFreight.map((shipment) => {
                          const locationSource = getShipmentLocationSource(
                            shipment,
                            companies
                          );

                          const bucket = getRouteBucket(shipment);

                          return (
                            <div
                              key={shipment.id}
                              className="rounded-lg border border-dark-border bg-slate-950 p-3"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate font-semibold text-white">
                                    {getPickupDisplayName(shipment)}
                                  </p>

                                  <p className="mt-1 text-xs text-slate-300">
                                    Pickup: {displayLocation(
                                      shipment.pickup_address,
                                      shipment.pickup_city
                                    )}
                                  </p>

                                  <p className="mt-1 text-xs text-blue-300">
                                    Delivers to: {getDeliveryDisplayName(shipment)}
                                  </p>

                                  <p className="mt-1 text-xs text-slate-500">
                                    {displayLocation(
                                      shipment.delivery_address,
                                      shipment.delivery_city
                                    )}
                                  </p>

                                  <p className="mt-1 text-xs font-semibold text-purple-300">
                                    Bucket: {bucket.label}
                                  </p>
                                </div>

                                {locationSource ? (
                                  <span className="rounded bg-green-900 px-2 py-1 text-[10px] font-black text-green-100">
                                    GPS
                                  </span>
                                ) : (
                                  <span className="rounded bg-red-900 px-2 py-1 text-[10px] font-black text-red-100">
                                    NO GPS
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="card">
            <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-white">
              <AlertTriangle className="h-5 w-5 text-yellow-400" />
              Routing Rules
            </h2>

            <div className="space-y-3 text-sm leading-6 text-slate-400">
              <p>
                Freightboy Warehouse deliveries are grouped together first.
              </p>

              <p>
                Buffalo deliveries are grouped together first and kept separate when possible.
              </p>

              <p>
                Other freight is placed after those route buckets, avoiding those dedicated trucks when possible.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <PlannerResults
          result={plannerResult}
          applying={applying}
          onApply={applySuggestedLayout}
          onReAnalyze={analyzeLayout}
        />
      )}
    </MainLayout>
  );
}

function PlannerResults({
  result,
  applying,
  onApply,
  onReAnalyze,
}: {
  result: PlannerResult;
  applying: boolean;
  onApply: () => void;
  onReAnalyze: () => void;
}) {
  const improvementKm = result.currentScoreKm - result.suggestedScoreKm;
  const improvementPercent =
    result.currentScoreKm > 0
      ? Math.round((improvementKm / result.currentScoreKm) * 100)
      : 0;

  const bucketSummary = summarizeBuckets(result.stops);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <SummaryBox
          label="Current layout score"
          value={`${Math.round(result.currentScoreKm).toLocaleString()} km`}
        />

        <SummaryBox
          label="Suggested score"
          value={`${Math.round(result.suggestedScoreKm).toLocaleString()} km`}
        />

        <SummaryBox
          label="Estimated improvement"
          value={`${Math.max(0, improvementPercent)}%`}
        />

        <SummaryBox
          label="Cross-dock moves"
          value={String(result.crossDockMoves.length)}
        />
      </div>

      {bucketSummary.length > 0 && (
        <div className="card">
          <h2 className="mb-3 text-xl font-bold text-white">
            Route Buckets
          </h2>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {bucketSummary.map((bucket) => (
              <div
                key={bucket.key}
                className="rounded-xl border border-dark-border bg-slate-950 p-4"
              >
                <p className="font-bold text-white">{bucket.label}</p>
                <p className="mt-1 text-sm text-slate-400">
                  {bucket.count} stop(s) • {bucket.skids} skids
                </p>
                <p className="mt-1 text-sm text-blue-300">
                  Suggested truck: {bucket.truckNumbers.join(', ')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {result.missingLocationStops.length > 0 && (
        <div className="rounded-xl border border-yellow-900 bg-yellow-950/30 p-4">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-yellow-100">
            <AlertTriangle className="h-5 w-5" />
            Missing Delivery GPS
          </h2>

          <p className="mb-4 text-sm leading-6 text-yellow-100/80">
            These pickups were skipped because the planner could not find GPS on the shipment or on a matched delivery company.
          </p>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {result.missingLocationStops.map((item) => (
              <div
                key={item.shipment.id}
                className="rounded-lg border border-yellow-900/80 bg-black/30 p-3"
              >
                <p className="font-semibold text-yellow-100">
                  {getPickupDisplayName(item.shipment)}
                </p>

                <p className="mt-1 text-xs text-yellow-100/70">
                  Pickup: {displayLocation(
                    item.shipment.pickup_address,
                    item.shipment.pickup_city
                  )}
                </p>

                <p className="mt-1 text-xs text-yellow-100/70">
                  Delivers to: {getDeliveryDisplayName(item.shipment)}
                </p>

                <p className="mt-1 text-xs text-yellow-100/70">
                  Delivery address: {displayLocation(
                    item.shipment.delivery_address,
                    item.shipment.delivery_city
                  )}
                </p>

                <p className="mt-1 text-xs text-yellow-100/70">
                  Current truck: {item.truckNumber}
                </p>

                <p className="mt-1 text-xs text-yellow-100/70">
                  {item.reason}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <CrossDockMovesByTruck result={result} />

      <div className="card">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-bold text-white">
              <Shuffle className="h-5 w-5 text-blue-400" />
              Full Cross-Dock Move List
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              This is every physical move needed on the dock.
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
              {applying ? 'Applying...' : 'Apply Suggested Layout'}
            </button>
          </div>
        </div>

        {result.crossDockMoves.length === 0 ? (
          <div className="rounded-lg border border-green-900 bg-green-950/30 p-4">
            <p className="font-semibold text-green-100">
              The current layout already looks reasonable based on available coordinates.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {result.crossDockMoves.map((move) => (
              <div
                key={move.shipment.id}
                className="rounded-xl border border-dark-border bg-slate-900 p-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-bold text-white">
                      {getPickupDisplayName(move.shipment)}
                    </p>

                    <p className="mt-1 text-sm text-slate-300">
                      Pickup: {displayLocation(
                        move.shipment.pickup_address,
                        move.shipment.pickup_city
                      )}
                    </p>

                    <p className="mt-1 text-sm text-blue-300">
                      Delivers to: {getDeliveryDisplayName(move.shipment)}
                    </p>

                    <p className="mt-1 text-xs text-purple-300">
                      Bucket: {getRouteBucket(move.shipment).label}
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      {move.skids} skids • {move.weightLbs.toLocaleString()} lbs
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-lg border border-red-900 bg-red-950 px-3 py-2 text-sm font-bold text-red-100">
                      OFF {move.fromTruckNumber}
                    </span>

                    <ArrowRight className="h-5 w-5 text-slate-400" />

                    <span className="rounded-lg border border-green-900 bg-green-950 px-3 py-2 text-sm font-bold text-green-100">
                      ON {move.toTruckNumber}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="mb-2 text-xl font-bold text-white">
          Final Truck Layout After Cross-Dock
        </h2>

        <p className="mb-5 text-sm text-slate-400">
          Each truck now shows what to remove, what to add, and what stays.
        </p>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          {result.truckPlans.map((plan) => (
            <FinalTruckPlanCard
              key={plan.truck.id}
              plan={plan}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function CrossDockMovesByTruck({ result }: { result: PlannerResult }) {
  if (result.crossDockMoves.length === 0) {
    return null;
  }

  const trucksWithMoves = result.truckPlans.filter((plan) =>
    result.crossDockMoves.some(
      (move) =>
        move.fromTruckId === plan.truck.id ||
        move.toTruckId === plan.truck.id
    )
  );

  return (
    <div className="card">
      <h2 className="mb-2 text-xl font-bold text-white">
        Cross-Dock Instructions By Truck
      </h2>

      <p className="mb-5 text-sm text-slate-400">
        This is the dock view: what comes off each truck, and what gets added to each truck.
      </p>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {trucksWithMoves.map((plan) => {
          const movingOff = result.crossDockMoves.filter(
            (move) => move.fromTruckId === plan.truck.id
          );

          const movingOn = result.crossDockMoves.filter(
            (move) => move.toTruckId === plan.truck.id
          );

          return (
            <div
              key={plan.truck.id}
              className="rounded-xl border border-dark-border bg-slate-950 p-5"
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-2xl font-black text-white">
                    {plan.truck.truck_number}
                  </h3>

                  <p className="text-sm text-slate-400">
                    {plan.truck.driver_name || 'No driver'}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                    Dock Actions
                  </p>

                  <p className="mt-1 text-sm font-bold text-white">
                    {movingOff.length} off • {movingOn.length} on
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-red-900 bg-red-950/30 p-4">
                  <p className="mb-3 text-sm font-black uppercase tracking-wide text-red-200">
                    Take Off {plan.truck.truck_number}
                  </p>

                  {movingOff.length === 0 ? (
                    <p className="text-sm text-red-100/60">
                      Nothing comes off this truck.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {movingOff.map((move) => (
                        <DockMoveCard
                          key={move.shipment.id}
                          shipment={move.shipment}
                          badge={`TO ${move.toTruckNumber}`}
                          tone="red"
                          skids={move.skids}
                          weightLbs={move.weightLbs}
                        />
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-green-900 bg-green-950/30 p-4">
                  <p className="mb-3 text-sm font-black uppercase tracking-wide text-green-200">
                    Add To {plan.truck.truck_number}
                  </p>

                  {movingOn.length === 0 ? (
                    <p className="text-sm text-green-100/60">
                      Nothing gets added to this truck.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {movingOn.map((move) => (
                        <DockMoveCard
                          key={move.shipment.id}
                          shipment={move.shipment}
                          badge={`FROM ${move.fromTruckNumber}`}
                          tone="green"
                          skids={move.skids}
                          weightLbs={move.weightLbs}
                        />
                      ))}
                    </div>
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

function DockMoveCard({
  shipment,
  badge,
  tone,
  skids,
  weightLbs,
}: {
  shipment: Shipment;
  badge: string;
  tone: 'red' | 'green';
  skids: number;
  weightLbs: number;
}) {
  return (
    <div className="rounded-lg border border-black/30 bg-black/30 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-white">
            {getPickupDisplayName(shipment)}
          </p>

          <p className="mt-1 text-xs text-slate-300">
            Pickup: {displayLocation(shipment.pickup_address, shipment.pickup_city)}
          </p>

          <p className="mt-1 text-xs text-blue-300">
            Delivers to: {getDeliveryDisplayName(shipment)}
          </p>

          <p className="mt-1 text-xs text-purple-300">
            {getRouteBucket(shipment).label}
          </p>

          <p className="mt-1 text-xs text-slate-500">
            {skids} skids • {weightLbs.toLocaleString()} lbs
          </p>
        </div>

        <span
          className={`flex-shrink-0 rounded px-2 py-1 text-[10px] font-black ${
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

function FinalTruckPlanCard({ plan }: { plan: TruckPlan }) {
  const movingIn = plan.suggestedStops.filter(
    (stop) => stop.currentTruckId !== plan.truck.id
  );

  const movingOut = plan.currentStops.filter(
    (stop) => stop.suggestedTruckId !== plan.truck.id
  );

  const overSkids = plan.suggestedSkids > (plan.truck.capacity_skids || 12);
  const overWeight =
    plan.suggestedWeightLbs > (plan.truck.max_weight_lbs || 15000);

  const routeGroups = summarizeBuckets(plan.suggestedStops);

  return (
    <div className="rounded-xl border border-dark-border bg-slate-950 p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-2xl font-black text-white">
            {plan.truck.truck_number}
          </h3>

          <p className="text-sm text-slate-400">
            {plan.truck.driver_name || 'No driver'}
          </p>

          {routeGroups.length > 0 && (
            <p className="mt-1 text-xs font-semibold text-purple-300">
              {routeGroups.map((group) => group.label).join(' • ')}
            </p>
          )}
        </div>

        <div className="text-right">
          <p className={`text-sm font-bold ${overSkids ? 'text-red-300' : 'text-blue-300'}`}>
            Final: {plan.suggestedSkids}/{plan.truck.capacity_skids || 12} skids
          </p>

          <p className={`text-xs ${overWeight ? 'text-red-300' : 'text-slate-500'}`}>
            {plan.suggestedWeightLbs.toLocaleString()}/{(plan.truck.max_weight_lbs || 15000).toLocaleString()} lbs
          </p>
        </div>
      </div>

      {movingOut.length > 0 && (
        <div className="mb-4 rounded-xl border border-red-900 bg-red-950/30 p-4">
          <p className="mb-3 text-sm font-black uppercase tracking-wide text-red-200">
            Take These Skids Off {plan.truck.truck_number}
          </p>

          <div className="space-y-2">
            {movingOut.map((stop) => (
              <FinalMoveCard
                key={stop.shipment.id}
                stop={stop}
                badge={`MOVE TO ${stop.suggestedTruckNumber}`}
                tone="red"
              />
            ))}
          </div>
        </div>
      )}

      {movingIn.length > 0 && (
        <div className="mb-4 rounded-xl border border-green-900 bg-green-950/30 p-4">
          <p className="mb-3 text-sm font-black uppercase tracking-wide text-green-200">
            Add These Skids To {plan.truck.truck_number}
          </p>

          <div className="space-y-2">
            {movingIn.map((stop) => (
              <FinalMoveCard
                key={stop.shipment.id}
                stop={stop}
                badge={`FROM ${stop.currentTruckNumber}`}
                tone="green"
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">
          Final Load On {plan.truck.truck_number}
        </p>

        {plan.suggestedStops.length === 0 ? (
          <div className="rounded-lg border border-dark-border bg-black/40 p-4">
            <p className="text-sm text-slate-500">
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
    <div className="rounded-lg border border-black/30 bg-black/30 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-white">
            {getPickupDisplayName(stop.shipment)}
          </p>

          <p className="mt-1 text-xs text-blue-300">
            Delivers to: {getDeliveryDisplayName(stop.shipment)}
          </p>

          <p className="mt-1 text-xs text-purple-300">
            {stop.routeBucketLabel}
          </p>

          <p className="mt-1 text-xs text-slate-500">
            {stop.skids} skids • {stop.weightLbs.toLocaleString()} lbs
          </p>
        </div>

        <span
          className={`flex-shrink-0 rounded px-2 py-1 text-[10px] font-black ${
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
      className={`rounded-lg border p-3 ${
        tone === 'green'
          ? 'border-green-800 bg-green-950/40'
          : 'border-dark-border bg-slate-900'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-white">
            {getPickupDisplayName(stop.shipment)}
          </p>

          <p className="mt-1 text-xs text-slate-300">
            Pickup: {displayLocation(
              stop.shipment.pickup_address,
              stop.shipment.pickup_city
            )}
          </p>

          <p className="mt-1 text-xs text-blue-300">
            Delivers to: {getDeliveryDisplayName(stop.shipment)}
          </p>

          <p className="mt-1 text-xs text-purple-300">
            Bucket: {stop.routeBucketLabel}
          </p>

          <p className="mt-2 text-xs text-slate-500">
            {stop.skids} skids • {stop.weightLbs.toLocaleString()} lbs
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <span
            className={`rounded px-2 py-1 text-[10px] font-black ${
              tone === 'green'
                ? 'bg-green-700 text-white'
                : 'bg-slate-700 text-slate-100'
            }`}
          >
            {badge}
          </span>

          {stop.locked && (
            <span title="Locked by dispatch">
              <Lock className="h-4 w-4 text-yellow-300" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryBox({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-dark-border bg-dark-card px-4 py-3">
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">
        {label}
      </p>

      <p className="mt-1 text-2xl font-bold text-white">
        {value}
      </p>
    </div>
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

  const capacityUsed = new Map<string, { skids: number; weightLbs: number }>();

  for (const truck of trucks) {
    capacityUsed.set(truck.id, {
      skids: 0,
      weightLbs: 0,
    });
  }

  const nextStops: StopWithLocation[] = [];

  const lockedStops = stops.filter((stop) => stop.locked);
  const unlockedStops = stops.filter((stop) => !stop.locked);

  for (const stop of lockedStops) {
    const truck = truckMap.get(stop.currentTruckId);

    if (!truck) {
      continue;
    }

    const used = capacityUsed.get(stop.currentTruckId);

    if (used) {
      used.skids += stop.skids;
      used.weightLbs += stop.weightLbs;
    }

    nextStops.push({
      ...stop,
      suggestedTruckId: stop.currentTruckId,
      suggestedTruckNumber: truck.truck_number,
    });
  }

  const groups = Array.from(groupStopsByBucket(unlockedStops).values()).sort(
    (a, b) => {
      const priorityCompare = b.priority - a.priority;

      if (priorityCompare !== 0) {
        return priorityCompare;
      }

      return b.skids - a.skids;
    }
  );

  const reservedSpecialTruckIds = new Set<string>();

  for (const group of groups) {
    const bestTruck = findBestTruckForRouteBucket({
      group,
      trucks,
      capacityUsed,
      reservedSpecialTruckIds,
    });

    if (!bestTruck) {
      for (const stop of group.stops) {
        const fallbackTruck = findBestTruckForSingleStop({
          stop,
          trucks,
          capacityUsed,
          reservedSpecialTruckIds,
        });

        const used = capacityUsed.get(fallbackTruck.id);

        if (used) {
          used.skids += stop.skids;
          used.weightLbs += stop.weightLbs;
        }

        nextStops.push({
          ...stop,
          suggestedTruckId: fallbackTruck.id,
          suggestedTruckNumber: fallbackTruck.truck_number,
        });
      }

      continue;
    }

    if (group.isDedicatedBucket) {
      reservedSpecialTruckIds.add(bestTruck.id);
    }

    const used = capacityUsed.get(bestTruck.id);

    if (used) {
      used.skids += group.skids;
      used.weightLbs += group.weightLbs;
    }

    for (const stop of group.stops) {
      nextStops.push({
        ...stop,
        suggestedTruckId: bestTruck.id,
        suggestedTruckNumber: bestTruck.truck_number,
      });
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