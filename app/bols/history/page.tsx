'use client';

import { useEffect, useMemo, useState } from 'react';
import MainLayout from '@/components/MainLayout';
import Header from '@/components/Header';
import PrintableBol, {
  displayLocation,
  displayValue,
  getBoardDisplayName,
} from '@/components/PrintableBol';
import { supabase } from '@/lib/supabase';
import { Shipment } from '@/types';
import { FileText, Printer, RefreshCw, Search, Trash2 } from 'lucide-react';

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

export default function BolHistoryPage() {
  const [records, setRecords] = useState<BolRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<BolRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadRecords();
  }, []);

  const loadRecords = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('bol_records')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading work order history:', error);
        alert(`Could not load work order history.\n\n${error.message}`);
        return;
      }

      setRecords((data || []) as BolRecord[]);
    } catch (error) {
      console.error('Error loading work order history:', error);
      alert('Could not load work order history.');
    } finally {
      setLoading(false);
    }
  };

  const filteredRecords = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    if (!query) {
      return records;
    }

    return records.filter((record) => {
      const shipment = record.shipment_snapshot;

      const searchableText = [
        record.bol_number,
        record.printed_by,
        record.notes,
        record.created_at,
        shipment?.board_name,
        shipment?.pickup_company_name,
        shipment?.delivery_company_name,
        shipment?.pickup_address,
        shipment?.delivery_address,
        shipment?.pickup_city,
        shipment?.delivery_city,
        shipment?.pickup_postal_code,
        shipment?.delivery_postal_code,
        shipment?.board_note,
        shipment?.notes,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [records, searchTerm]);

  const deleteRecord = async (record: BolRecord) => {
    if (!confirm(`Delete work order document ${record.bol_number}?`)) {
      return;
    }

    try {
      setDeletingId(record.id);

      const { error } = await supabase
        .from('bol_records')
        .delete()
        .eq('id', record.id);

      if (error) {
        console.error('Error deleting work order document:', error);
        alert(`Could not delete work order document.\n\n${error.message}`);
        return;
      }

      if (selectedRecord?.id === record.id) {
        setSelectedRecord(null);
      }

      await loadRecords();
    } catch (error) {
      console.error('Error deleting work order document:', error);
      alert('Could not delete work order document.');
    } finally {
      setDeletingId(null);
    }
  };

  const printSelectedRecord = () => {
    if (!selectedRecord) {
      alert('Open a document first.');
      return;
    }

    window.print();
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
        }

        @page {
          size: letter;
          margin: 0.25in;
        }
      `}</style>

      <div className="screen-area">
        <div className="mb-6 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <Header
            title="Work Order History"
            subtitle="Look back at every work order document that was created"
          />

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={loadRecords}
              className="btn-secondary flex items-center justify-center gap-2"
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>

            <button
              type="button"
              onClick={printSelectedRecord}
              className="btn-primary flex items-center justify-center gap-2"
              disabled={!selectedRecord}
            >
              <Printer className="h-4 w-4" />
              Reprint Open Document
            </button>
          </div>
        </div>

        <div className="mb-6 rounded-xl border border-blue-900 bg-blue-950/50 p-4">
          <p className="text-sm text-blue-100">
            These are saved work order document snapshots. Even if a shipment gets
            edited later, the history keeps what was printed at the time.
          </p>
        </div>

        <div className="relative mb-4 w-full max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />

          <input
            type="text"
            className="input-field pl-10"
            placeholder="Search document number, shipper, receiver, city, notes..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[1fr_0.95fr]">
          <div className="overflow-x-auto rounded-xl border border-dark-border">
            {loading ? (
              <div className="card">
                <p className="text-slate-400">Loading work order history...</p>
              </div>
            ) : filteredRecords.length === 0 ? (
              <div className="card text-center">
                <p className="text-slate-400">No work order documents found.</p>
              </div>
            ) : (
              <table className="status-table">
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Date</th>
                    <th>Shipper</th>
                    <th>Receiver</th>
                    <th>Printed By</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredRecords.map((record) => {
                    const shipment = record.shipment_snapshot;
                    const open = selectedRecord?.id === record.id;

                    return (
                      <tr
                        key={record.id}
                        className={open ? 'bg-blue-950/40' : ''}
                      >
                        <td>
                          <p className="font-semibold text-white">
                            {record.bol_number}
                          </p>
                          <p className="text-xs text-slate-400">
                            {getBoardDisplayName(shipment)}
                          </p>
                        </td>

                        <td>
                          <p className="font-semibold text-white">
                            {formatDate(record.created_at)}
                          </p>
                          <p className="text-xs text-slate-400">
                            {formatTime(record.created_at)}
                          </p>
                        </td>

                        <td>
                          <p className="font-semibold text-white">
                            {displayValue(shipment?.pickup_company_name)}
                          </p>
                          <p className="text-xs text-slate-400">
                            {displayLocation(
                              shipment?.pickup_address,
                              shipment?.pickup_city,
                              shipment?.pickup_postal_code
                            )}
                          </p>
                        </td>

                        <td>
                          <p className="font-semibold text-white">
                            {displayValue(shipment?.delivery_company_name)}
                          </p>
                          <p className="text-xs text-slate-400">
                            {displayLocation(
                              shipment?.delivery_address,
                              shipment?.delivery_city,
                              shipment?.delivery_postal_code
                            )}
                          </p>
                        </td>

                        <td>
                          <span className="rounded-full bg-slate-700 px-2 py-1 text-xs font-semibold text-slate-200">
                            {record.printed_by || 'Unknown'}
                          </span>
                        </td>

                        <td>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedRecord(record)}
                              className="text-blue-400 hover:text-blue-300"
                              title="Open document"
                            >
                              <FileText className="h-4 w-4" />
                            </button>

                            <button
                              type="button"
                              onClick={() => deleteRecord(record)}
                              disabled={deletingId === record.id}
                              className="text-red-400 hover:text-red-300 disabled:opacity-50"
                              title="Delete document record"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="rounded-xl border border-dark-border bg-dark-card p-4">
            {selectedRecord ? (
              <>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold text-white">
                      {selectedRecord.bol_number}
                    </h2>
                    <p className="text-sm text-slate-400">
                      Created {formatDate(selectedRecord.created_at)} at{' '}
                      {formatTime(selectedRecord.created_at)}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedRecord(null)}
                    className="text-sm font-semibold text-slate-300 hover:text-white"
                  >
                    Close
                  </button>
                </div>

                <div className="rounded-xl bg-white p-4 text-black">
                  <PrintableBol
                    shipment={selectedRecord.shipment_snapshot}
                    bolNumber={selectedRecord.bol_number}
                    preview
                  />
                </div>
              </>
            ) : (
              <div className="flex min-h-[300px] items-center justify-center text-center">
                <div>
                  <FileText className="mx-auto h-10 w-10 text-slate-600" />
                  <p className="mt-3 text-sm font-semibold text-slate-400">
                    Click a work order document to preview it here.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="print-area hidden">
        {selectedRecord && (
          <PrintableBol
            shipment={selectedRecord.shipment_snapshot}
            bolNumber={selectedRecord.bol_number}
          />
        )}
      </div>
    </MainLayout>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}