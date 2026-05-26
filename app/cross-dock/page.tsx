'use client';

import { useEffect, useState } from 'react';
import MainLayout from '@/components/MainLayout';
import Header from '@/components/Header';
import { ArrowRight, AlertCircle } from 'lucide-react';
import {
  getUnassignedShipments,
  getTrucks,
  assignShipmentToTruck,
  getTruckSkidCount,
  getAssignmentsByTruck,
} from '@/lib/database';
import { Shipment, Truck } from '@/types';

interface TruckWithStats extends Truck {
  assigned_skids: number;
  available_skids: number;
  assigned_shipments: number;
}

export default function CrossDockPage() {
  const [unassignedShipments, setUnassignedShipments] = useState<Shipment[]>([]);
  const [trucks, setTrucks] = useState<TruckWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const [recommendations, setRecommendations] = useState<TruckWithStats[]>([]);
  const [cityFilter, setCityFilter] = useState('');

  useEffect(() => {
    loadCrossDockData();
  }, []);

  const loadCrossDockData = async () => {
    try {
      setLoading(true);
      const [shipments, trucksData] = await Promise.all([
        getUnassignedShipments(),
        getTrucks(),
      ]);

      setUnassignedShipments(shipments);

      // Load truck stats
      const trucksWithStats = await Promise.all(
        trucksData.map(async (truck) => {
          const assignedSkids = await getTruckSkidCount(truck.id);
          const assignments = await getAssignmentsByTruck(truck.id);
          return {
            ...truck,
            assigned_skids: assignedSkids,
            available_skids: truck.capacity_skids - assignedSkids,
            assigned_shipments: assignments.length,
          };
        })
      );

      setTrucks(trucksWithStats);
    } catch (error) {
      console.error('Error loading cross-dock data:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateRecommendations = (shipment: Shipment): TruckWithStats[] => {
    // Sort trucks by recommendations
    return trucks
      .filter((truck) => {
        // Filter trucks with enough capacity
        return truck.available_skids >= shipment.number_of_skids && truck.status === 'available';
      })
      .sort((a, b) => {
        // 1. Trucks already going to the same city (highest priority)
        const aHasSameCity = a.current_route_area
          ?.toLowerCase()
          .includes(shipment.delivery_city.toLowerCase()) || false;
        const bHasSameCity = b.current_route_area
          ?.toLowerCase()
          .includes(shipment.delivery_city.toLowerCase()) || false;

        if (aHasSameCity && !bHasSameCity) return -1;
        if (!aHasSameCity && bHasSameCity) return 1;

        // 2. Trucks with more available space (medium priority)
        if (b.available_skids !== a.available_skids) {
          return b.available_skids - a.available_skids;
        }

        // 3. Trucks with fewer existing shipments (medium priority)
        return a.assigned_shipments - b.assigned_shipments;
      });
  };

  const handleSelectShipment = (shipment: Shipment) => {
    setSelectedShipment(shipment);
    const recs = generateRecommendations(shipment);
    setRecommendations(recs);
  };

  const handleAssignShipment = async (shipmentId: string, truckId: string) => {
    try {
      await assignShipmentToTruck(shipmentId, truckId);
      setSelectedShipment(null);
      setRecommendations([]);
      await loadCrossDockData();
    } catch (error) {
      console.error('Error assigning shipment:', error);
      alert('Failed to assign shipment. Please try again.');
    }
  };

  const deliveryByCity = unassignedShipments.reduce(
    (acc, shipment) => {
      const city = shipment.delivery_city;
      if (!acc[city]) acc[city] = [];
      acc[city].push(shipment);
      return acc;
    },
    {} as Record<string, Shipment[]>
  );

  const uniqueCities = Object.keys(deliveryByCity).sort();
  const citiesWithFilter = cityFilter
    ? uniqueCities.filter((city) => city.toLowerCase().includes(cityFilter.toLowerCase()))
    : uniqueCities;

  return (
    <MainLayout>
      <Header
        title="Cross-Dock"
        subtitle="Assign shipments to trucks based on delivery location and capacity"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Unassigned Shipments */}
        <div className="lg:col-span-2 card">
          <h2 className="text-xl font-bold text-white mb-4">Unassigned Shipments</h2>

          {unassignedShipments.length === 0 ? (
            <p className="text-slate-400">All shipments have been assigned!</p>
          ) : (
            <>
              <input
                type="text"
                placeholder="Filter by delivery city..."
                className="input-field mb-4"
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
              />

              <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                {citiesWithFilter.map((city) => (
                  <div key={city}>
                    <h3 className="text-sm font-semibold text-blue-400 mb-2">{city}</h3>
                    <div className="space-y-2 ml-2">
                      {deliveryByCity[city].map((shipment) => (
                        <button
                          key={shipment.id}
                          onClick={() => handleSelectShipment(shipment)}
                          className={`w-full text-left p-3 rounded-lg border transition-colors ${
                            selectedShipment?.id === shipment.id
                              ? 'bg-blue-600 border-blue-500'
                              : 'bg-slate-800 border-dark-border hover:bg-slate-700'
                          }`}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-semibold text-white">
                                {shipment.pickup_company_name}
                              </p>
                              <p className="text-xs text-slate-400 mt-1">
                                → {shipment.delivery_company_name}
                              </p>
                              <p className="text-xs text-slate-500 mt-2">
                                {shipment.number_of_skids} skids
                              </p>
                            </div>
                            <span className="text-xs bg-slate-700 px-2 py-1 rounded">
                              {shipment.delivery_date}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Truck Recommendations */}
        <div className="card">
          <h2 className="text-xl font-bold text-white mb-4">Truck Recommendations</h2>

          {!selectedShipment ? (
            <p className="text-slate-400">Select a shipment to see recommendations</p>
          ) : (
            <div className="space-y-4">
              <div className="bg-slate-800 p-3 rounded-lg border border-dark-border">
                <p className="text-sm font-semibold text-blue-300">Selected Shipment:</p>
                <p className="text-sm text-white mt-1">{selectedShipment.pickup_company_name}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {selectedShipment.number_of_skids} skids required
                </p>
              </div>

              {recommendations.length === 0 ? (
                <div className="bg-yellow-900 border border-yellow-700 p-3 rounded-lg flex gap-2">
                  <AlertCircle className="w-5 h-5 text-yellow-200 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-yellow-200">
                    No trucks available with sufficient capacity. Consider adding more trucks.
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-xs font-semibold text-slate-400 mb-2">RECOMMENDED TRUCKS:</p>
                  <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                    {recommendations.map((truck, index) => (
                      <button
                        key={truck.id}
                        onClick={() =>
                          handleAssignShipment(selectedShipment.id, truck.id)
                        }
                        className="w-full text-left p-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-dark-border transition-colors group"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {index === 0 && (
                              <span className="bg-green-600 text-white text-xs px-2 py-1 rounded">
                                Top Match
                              </span>
                            )}
                            <p className="font-semibold text-white">{truck.truck_number}</p>
                          </div>
                          <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-blue-400" />
                        </div>
                        <p className="text-xs text-slate-400">Driver: {truck.driver_name}</p>
                        <div className="mt-2 space-y-1">
                          <p className="text-xs text-slate-400">
                            Available: {truck.available_skids}/{truck.capacity_skids} skids
                          </p>
                          <p className="text-xs text-slate-400">
                            Route: {truck.current_route_area || 'Not set'}
                          </p>
                        </div>
                        <div className="mt-2 w-full bg-slate-700 rounded-full h-1.5">
                          <div
                            className="bg-blue-500 h-1.5 rounded-full"
                            style={{
                              width: `${(
                                (truck.capacity_skids - truck.available_skids) /
                                truck.capacity_skids
                              ) * 100}%`,
                            }}
                          />
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Show all available trucks */}
                  {trucks.filter(
                    (t) =>
                      t.available_skids >= selectedShipment.number_of_skids &&
                      t.status === 'available' &&
                      !recommendations.some((r) => r.id === t.id)
                  ).length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-400 mt-4 mb-2">
                        OTHER AVAILABLE TRUCKS:
                      </p>
                      <div className="space-y-2">
                        {trucks
                          .filter(
                            (t) =>
                              t.available_skids >= selectedShipment.number_of_skids &&
                              t.status === 'available' &&
                              !recommendations.some((r) => r.id === t.id)
                          )
                          .map((truck) => (
                            <button
                              key={truck.id}
                              onClick={() =>
                                handleAssignShipment(selectedShipment.id, truck.id)
                              }
                              className="w-full text-left p-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-dark-border transition-colors text-xs"
                            >
                              <p className="font-semibold text-white">{truck.truck_number}</p>
                              <p className="text-slate-400">
                                {truck.available_skids} skids available
                              </p>
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Trucks At Capacity */}
      {trucks.filter((t) => t.available_skids <= 0).length > 0 && (
        <div className="mt-6 p-4 bg-red-900 border border-red-700 rounded-lg">
          <p className="text-red-200">
            ⚠️ {trucks.filter((t) => t.available_skids <= 0).length} truck(s) at full capacity:
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            {trucks
              .filter((t) => t.available_skids <= 0)
              .map((truck) => (
                <span
                  key={truck.id}
                  className="bg-red-800 text-red-200 px-3 py-1 rounded-lg text-sm"
                >
                  {truck.truck_number}
                </span>
              ))}
          </div>
        </div>
      )}
    </MainLayout>
  );
}
