'use client';

import { useEffect, useMemo, useState } from 'react';
import MainLayout from '@/components/MainLayout';
import Header from '@/components/Header';
import PrintableBol, {
  displayLocation,
  displayValue,
  getDraftBolNumber,
  getShipmentWeight,
} from '@/components/PrintableBol';
import { getShipments } from '@/lib/database';
import { supabase } from '@/lib/supabase';
import { Shipment } from '@/types';
import { FileText, Printer, RefreshCw, Search } from 'lucide-react';

interface BolRecord {
  id: string;
  bol_number: string;
  shipment_id: string | null;
  shipment_snapshot: Shipment;
  printed_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export default function BolsPage() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [selectedShipmentIds, setSelectedShipmentIds] = useState<string[]>([]);
  const [savedPrintRecords, setSavedPrintRecords] = useState<BolRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [printedBy, setPrintedBy] = useState('Dispatch');
  const [loading, setLoading] = useState(true);
  const [savingRecords, setSavingRecords] = useState(false);

  useEffect(() => {
    loadShipments();
  }, []);

  const loadShipments = async () => {
    try {
      setLoading(true);
      const data = await getShipments();
      setShipments(data);
    } catch (error) {
      console.error('Error loading work orders:', error);
      alert('Could not load work orders.');
    } finally {
      setLoading(false);
    }
  };

  const filteredShipments = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    if (!query) {
      return shipments;
    }

    return shipments.filter((shipment) => {
      const searchableText = [
        shipment.id,
        shipment.board_name,
        shipment.pickup_company_name,
        shipment.delivery_company_name,
        shipment.pickup_address,
        shipment.delivery_address,
        shipment.pickup_city,
        shipment.delivery_city,
        shipment.pickup_postal_code,
        shipment.delivery_postal_code,
        shipment.board_note,
        shipment.notes,
        shipment.number_of_skids,
        shipment.weight_lbs,
        shipment.weight_kg,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [shipments, searchTerm]);

  const selectedShipments = useMemo(() => {
    return shipments.filter((shipment) => selectedShipmentIds.includes(shipment.id));
  }, [shipments, selectedShipmentIds]);

  const allFilteredSelected =
    filteredShipments.length > 0 &&
    filteredShipments.every((shipment) => selectedShipmentIds.includes(shipment.id));

  const toggleShipment = (shipmentId: string) => {
    setSelectedShipmentIds((currentIds) => {
      if (currentIds.includes(shipmentId)) {
        return currentIds.filter((id) => id !== shipmentId);
      }

      return [...currentIds, shipmentId];
    });

    setSavedPrintRecords([]);
  };

  const toggleAllFiltered = () => {
    if (allFilteredSelected) {
      setSelectedShipmentIds((currentIds) =>
        currentIds.filter(
          (id) => !filteredShipments.some((shipment) => shipment.id === id)
        )
      );

      setSavedPrintRecords([]);
      return;
    }

    setSelectedShipmentIds((currentIds) => {
      const nextIds = new Set(currentIds);

      filteredShipments.forEach((shipment) => {
        nextIds.add(shipment.id);
      });

      return Array.from(nextIds);
    });

    setSavedPrintRecords([]);
  };

  const createBolNumber = (shipment: Shipment, index: number) => {
    const now = new Date();
    const datePart = now
      .toISOString()
      .replaceAll('-', '')
      .replaceAll(':', '')
      .replaceAll('.', '')
      .slice(0, 15);

    return `BOL-${datePart}-${shipment.id.slice(0, 6).toUpperCase()}-${index + 1}`;
  };

  const createWorkOrderDocuments = async () => {
    if (selectedShipments.length === 0) {
      alert('Select at least one work order first.');
      return [];
    }

    const rows = selectedShipments.map((shipment, index) => ({
      bol_number: createBolNumber(shipment, index),
      shipment_id: shipment.id,
      shipment_snapshot: shipment,
      printed_by: printedBy.trim() || null,
      notes: shipment.board_note || shipment.notes || null,
      updated_at: new Date().toISOString(),
    }));

    const { data, error } = await supabase
      .from('bol_records')
      .insert(rows)
      .select('*');

    if (error) {
      console.error('Error saving work order documents:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });

      alert(`Could not save work order document.\n\n${error.message}`);
      return [];
    }

    return (data || []) as BolRecord[];
  };

  const printSelectedWorkOrders = async () => {
    if (selectedShipments.length === 0) {
      alert('Select at least one work order first.');
      return;
    }

    try {
      setSavingRecords(true);

      const records = await createWorkOrderDocuments();

      if (records.length === 0) {
        return;
      }

      setSavedPrintRecords(records);

      setTimeout(() => {
        window.print();
      }, 200);
    } catch (error) {
      console.error('Error printing work order documents:', error);
      alert('Could not create work order documents.');
    } finally {
      setSavingRecords(false);
    }
  };

  return (
    <MainLayout>
      <style jsx global>{`
        @media print {
          body {
            background: white !important;
          }

          aside,
          nav,
          .no-print,
          .screen-area {
            display: none !important;
          }

          main {
            overflow: visible !important;
            background: white !important;
          }

          .print-area {
            display: block !important;
          }

          .bol-page {
            page-break-after: always;
            break-after: page;
          }

          .bol-page:last-child {
            page-break-after: auto;
            break-after: auto;
          }
        }

        @page {
          size: letter;
          margin: 0.25in;
        }
      `}</style>

      <div className="screen-area">
        <div className="mb-6 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <Header
            title="Work Orders"
            subtitle="Select work orders, save a document record, then print or save as PDF"
          />

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={loadShipments}
              className="btn-secondary flex items-center justify-center gap-2"
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>

            <button
              type="button"
              onClick={printSelectedWorkOrders}
              className="btn-primary flex items-center justify-center gap-2"
              disabled={selectedShipments.length === 0 || savingRecords}
            >
              <Printer className="h-4 w-4" />
              {savingRecords
                ? 'Saving...'
                : `Save Work Order Document + Print (${selectedShipments.length})`}
            </button>
          </div>
        </div>

        <div className="mb-6 rounded-xl border border-blue-900 bg-blue-950/50 p-4">
          <p className="text-sm text-blue-100">
            Every time you click Save Work Order Document + Print, the selected
            work order document is saved into Work Order History as a snapshot.
            That means you can look it up later even if the shipment details change.
          </p>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-3 xl:grid-cols-[1fr_260px]">
          <div className="relative w-full">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />

            <input
              type="text"
              className="input-field pl-10"
              placeholder="Search shipper, receiver, city, address, notes..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>

          <input
            type="text"
            className="input-field"
            placeholder="Printed by"
            value={printedBy}
            onChange={(event) => setPrintedBy(event.target.value)}
          />
        </div>

        {selectedShipments.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setSelectedShipmentIds([]);
              setSavedPrintRecords([]);
            }}
            className="mb-4 text-sm font-semibold text-red-300 hover:text-red-200"
          >
            Clear selection
          </button>
        )}

        {loading ? (
          <div className="card">
            <p className="text-slate-400">Loading work orders...</p>
          </div>
        ) : filteredShipments.length === 0 ? (
          <div className="card text-center">
            <p className="text-slate-400">No work orders found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-dark-border">
            <table className="status-table">
              <thead>
                <tr>
                  <th className="w-12">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleAllFiltered}
                      className="h-4 w-4 cursor-pointer"
                      title="Select all visible work orders"
                    />
                  </th>
                  <th>Work Order Doc</th>
                  <th>Pickup / Shipper</th>
                  <th>Delivery / Receiver</th>
                  <th>Freight</th>
                  <th>Board Notes</th>
                </tr>
              </thead>

              <tbody>
                {filteredShipments.map((shipment) => {
                  const selected = selectedShipmentIds.includes(shipment.id);

                  return (
                    <tr key={shipment.id} className={selected ? 'bg-blue-950/40' : ''}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleShipment(shipment.id)}
                          className="h-4 w-4 cursor-pointer"
                        />
                      </td>

                      <td>
                        <p className="font-semibold text-white">
                          {getDraftBolNumber(shipment)}
                        </p>
                        <p className="text-xs text-slate-400">
                          New number made when saved
                        </p>
                      </td>

                      <td>
                        <p className="font-semibold text-white">
                          {displayValue(shipment.pickup_company_name)}
                        </p>
                        <p className="text-xs text-slate-400">
                          {displayLocation(
                            shipment.pickup_address,
                            shipment.pickup_city,
                            shipment.pickup_postal_code
                          )}
                        </p>
                      </td>

                      <td>
                        <p className="font-semibold text-white">
                          {displayValue(shipment.delivery_company_name)}
                        </p>
                        <p className="text-xs text-slate-400">
                          {displayLocation(
                            shipment.delivery_address,
                            shipment.delivery_city,
                            shipment.delivery_postal_code
                          )}
                        </p>
                      </td>

                      <td>
                        <p className="font-semibold text-white">
                          {displayValue(shipment.number_of_skids, 'Unknown')} skid(s)
                        </p>
                        <p className="text-xs text-slate-400">
                          {getShipmentWeight(shipment) || 'Weight unknown'}
                        </p>
                      </td>

                      <td>
                        <p className="max-w-xs text-xs font-semibold text-yellow-300">
                          {shipment.board_note || shipment.notes || '—'}
                        </p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {selectedShipments.length > 0 && (
          <div className="mt-8 rounded-xl border border-dark-border bg-dark-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-300" />
              <h2 className="text-xl font-bold text-white">
                Work Order Document Preview
              </h2>
            </div>

            <div className="space-y-4">
              {selectedShipments.map((shipment) => {
                const savedRecord = savedPrintRecords.find(
                  (record) => record.shipment_id === shipment.id
                );

                return (
                  <div
                    key={shipment.id}
                    className="rounded-xl border border-slate-700 bg-white p-4 text-black"
                  >
                    <PrintableBol
                      shipment={shipment}
                      bolNumber={savedRecord?.bol_number}
                      preview
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="print-area hidden">
        {savedPrintRecords.length > 0
          ? savedPrintRecords.map((record) => (
              <div key={record.id} className="bol-page">
                <PrintableBol
                  shipment={record.shipment_snapshot}
                  bolNumber={record.bol_number}
                />
              </div>
            ))
          : selectedShipments.map((shipment) => (
              <div key={shipment.id} className="bol-page">
                <PrintableBol shipment={shipment} />
              </div>
            ))}
      </div>
    </MainLayout>
  );
}