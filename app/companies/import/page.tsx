'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import MainLayout from '@/components/MainLayout';
import Header from '@/components/Header';
import {
  ArrowLeft,
  CheckCircle2,
  FileSpreadsheet,
  Upload,
  XCircle,
} from 'lucide-react';
import { createCompany, getCompanies } from '@/lib/database';
import { Company } from '@/types';

interface ImportRow {
  row_number: number;
  name: string;
  address: string;
  city: string;
  postal_code: string;
  is_shipper: boolean;
  error?: string;
}

interface RawSpreadsheetRow {
  [key: string]: unknown;
}

const ACCEPTED_HEADERS = [
  'Name',
  'Address',
  'City',
  'Postal',
  'Add as shipper?',
];

export default function ImportCompaniesPage() {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number;
    skipped: number;
    failed: number;
  } | null>(null);

  const validRows = useMemo(() => {
    return rows.filter((row) => !row.error);
  }, [rows]);

  const invalidRows = useMemo(() => {
    return rows.filter((row) => row.error);
  }, [rows]);

  const shipperCount = useMemo(() => {
    return validRows.filter((row) => row.is_shipper).length;
  }, [validRows]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setFileName(file.name);
    setImportResult(null);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];

      if (!firstSheetName) {
        setRows([]);
        alert('This spreadsheet does not have any sheets.');
        return;
      }

      const worksheet = workbook.Sheets[firstSheetName];

      const rawRows = XLSX.utils.sheet_to_json<RawSpreadsheetRow>(worksheet, {
        defval: '',
        raw: false,
      });

      const parsedRows = rawRows
        .map((rawRow, index) => parseSpreadsheetRow(rawRow, index + 2))
        .filter((row) => {
          const hasAnyData =
            row.name ||
            row.address ||
            row.city ||
            row.postal_code;

          return hasAnyData;
        });

      setRows(parsedRows);
    } catch (error) {
      console.error('Error reading spreadsheet:', error);
      setRows([]);
      alert('Could not read this file. Make sure it is a valid .xlsx, .xls, or .csv file.');
    } finally {
      event.target.value = '';
    }
  };

  const handleImport = async () => {
    if (validRows.length === 0) {
      alert('There are no valid companies to import.');
      return;
    }

    try {
      setImporting(true);
      setImportResult(null);

      const existingCompanies = await getCompanies();

      const existingNames = new Set(
        existingCompanies.map((company) => company.name.trim().toLowerCase())
      );

      let imported = 0;
      let skipped = 0;
      let failed = 0;

      for (const row of validRows) {
        const normalizedName = row.name.trim().toLowerCase();

        if (existingNames.has(normalizedName)) {
          skipped++;
          continue;
        }

        const created = await createCompany({
          name: row.name.trim(),
          address: blankToNull(row.address),
          city: blankToNull(row.city),
          postal_code: blankToNull(row.postal_code),
          contact_name: null,
          contact_phone: null,
          notes: null,
          is_shipper: row.is_shipper,
        } as Omit<Company, 'id' | 'created_at' | 'updated_at'>);

        if (created) {
          imported++;
          existingNames.add(normalizedName);
        } else {
          failed++;
        }
      }

      setImportResult({
        imported,
        skipped,
        failed,
      });
    } catch (error) {
      console.error('Error importing companies:', error);
      alert('Something went wrong while importing companies. Check the console for details.');
    } finally {
      setImporting(false);
    }
  };

  const clearImport = () => {
    setRows([]);
    setFileName('');
    setImportResult(null);
  };

  return (
    <MainLayout>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Header
          title="Import Companies"
          subtitle="Mass upload companies from an Excel or CSV spreadsheet"
        />

        <Link
          href="/companies"
          className="btn-secondary flex items-center justify-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Companies
        </Link>
      </div>

      <div className="mb-6 rounded-xl border border-blue-800 bg-blue-950/60 p-5">
        <h2 className="text-lg font-bold text-white">Spreadsheet Format</h2>

        <p className="mt-2 text-sm text-blue-100">
          Your first row should contain these headers. Extra spaces are okay now.
        </p>

        <div className="mt-4 overflow-x-auto rounded-lg border border-blue-900">
          <table className="w-full min-w-[700px] border-collapse text-sm">
            <thead className="bg-blue-900/60 text-blue-100">
              <tr>
                {ACCEPTED_HEADERS.map((header) => (
                  <th key={header} className="border border-blue-800 px-3 py-2 text-left">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              <tr className="bg-slate-950/60 text-slate-200">
                <td className="border border-blue-900 px-3 py-2">Raz Design</td>
                <td className="border border-blue-900 px-3 py-2">135 Railside Road</td>
                <td className="border border-blue-900 px-3 py-2">Toronto</td>
                <td className="border border-blue-900 px-3 py-2">M3A 1B2</td>
                <td className="border border-blue-900 px-3 py-2">y</td>
              </tr>

              <tr className="bg-slate-950/40 text-slate-200">
                <td className="border border-blue-900 px-3 py-2">POSS Design</td>
                <td className="border border-blue-900 px-3 py-2"></td>
                <td className="border border-blue-900 px-3 py-2">Oakville</td>
                <td className="border border-blue-900 px-3 py-2"></td>
                <td className="border border-blue-900 px-3 py-2">y</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 text-sm text-blue-100 md:grid-cols-2">
          <div>
            <p className="font-semibold text-white">Required column:</p>
            <p>Name</p>
          </div>

          <div>
            <p className="font-semibold text-white">Accepted shipper values:</p>
            <p>yes, no, true, false, y, n, 1, 0</p>
          </div>
        </div>
      </div>

      <div className="card mb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-bold text-white">
              <FileSpreadsheet className="h-5 w-5 text-green-400" />
              Upload Spreadsheet
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              Upload a .xlsx, .xls, or .csv file. You can preview before importing.
            </p>

            {fileName && (
              <p className="mt-2 text-sm font-semibold text-blue-300">
                Loaded file: {fileName}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="btn-primary flex cursor-pointer items-center justify-center gap-2">
              <Upload className="h-4 w-4" />
              Choose File
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleFileUpload}
              />
            </label>

            {rows.length > 0 && (
              <button
                type="button"
                onClick={clearImport}
                className="btn-secondary"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {rows.length > 0 && (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
            <ImportStat label="Total Rows" value={rows.length} />
            <ImportStat label="Valid Companies" value={validRows.length} />
            <ImportStat label="Marked Shipper" value={shipperCount} />
            <ImportStat label="Rows With Errors" value={invalidRows.length} />
          </div>

          {invalidRows.length > 0 && (
            <div className="mb-6 rounded-xl border border-red-800 bg-red-950/60 p-4">
              <h3 className="font-bold text-red-200">Rows with errors</h3>

              <div className="mt-3 space-y-2">
                {invalidRows.slice(0, 10).map((row) => (
                  <p key={row.row_number} className="text-sm text-red-200">
                    Row {row.row_number}: {row.error}
                  </p>
                ))}
              </div>

              {invalidRows.length > 10 && (
                <p className="mt-2 text-sm text-red-300">
                  Plus {invalidRows.length - 10} more error row(s).
                </p>
              )}
            </div>
          )}

          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">Preview</h2>
              <p className="text-sm text-slate-400">
                Duplicate company names will be skipped during import.
              </p>
            </div>

            <button
              type="button"
              onClick={handleImport}
              disabled={importing || validRows.length === 0}
              className="btn-success"
            >
              {importing ? 'Importing...' : `Import ${validRows.length} Companies`}
            </button>
          </div>

          {importResult && (
            <div className="mb-6 rounded-xl border border-green-800 bg-green-950/60 p-4">
              <h3 className="flex items-center gap-2 font-bold text-green-200">
                <CheckCircle2 className="h-5 w-5" />
                Import Complete
              </h3>

              <p className="mt-2 text-sm text-green-100">
                Imported: {importResult.imported} • Skipped duplicates: {importResult.skipped} • Failed: {importResult.failed}
              </p>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-dark-border">
            <table className="status-table">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Name</th>
                  <th>Address</th>
                  <th>City</th>
                  <th>Postal</th>
                  <th>Shipper?</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((row) => (
                  <tr key={row.row_number}>
                    <td>{row.row_number}</td>

                    <td>
                      <p className="font-semibold text-white">
                        {row.name || 'Missing name'}
                      </p>
                    </td>

                    <td>{row.address || '—'}</td>
                    <td>{row.city || '—'}</td>
                    <td>{row.postal_code || '—'}</td>

                    <td>
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          row.is_shipper
                            ? 'bg-green-900 text-green-200'
                            : 'bg-slate-700 text-slate-300'
                        }`}
                      >
                        {row.is_shipper ? 'Yes' : 'No'}
                      </span>
                    </td>

                    <td>
                      {row.error ? (
                        <span className="flex items-center gap-1 text-sm font-semibold text-red-300">
                          <XCircle className="h-4 w-4" />
                          {row.error}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-sm font-semibold text-green-300">
                          <CheckCircle2 className="h-4 w-4" />
                          Ready
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </MainLayout>
  );
}

function parseSpreadsheetRow(rawRow: RawSpreadsheetRow, rowNumber: number): ImportRow {
  const normalizedRow = normalizeSpreadsheetRow(rawRow);

  const name = getCellValue(normalizedRow, ['name', 'company', 'companyname']);
  const address = getCellValue(normalizedRow, ['address', 'street', 'streetaddress']);
  const city = getCellValue(normalizedRow, ['city']);
  const postal = getCellValue(normalizedRow, ['postal', 'postalcode', 'zip']);
  const addAsShipper = getCellValue(normalizedRow, [
    'addasshipper',
    'shipper',
    'isshipper',
  ]);

  const parsed: ImportRow = {
    row_number: rowNumber,
    name,
    address,
    city,
    postal_code: postal,
    is_shipper: parseBoolean(addAsShipper),
  };

  if (!name.trim()) {
    parsed.error = 'Name is required.';
  }

  return parsed;
}

function normalizeSpreadsheetRow(row: RawSpreadsheetRow) {
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = normalizeHeader(key);
    normalized[normalizedKey] =
      value === undefined || value === null ? '' : String(value).trim();
  }

  return normalized;
}

function normalizeHeader(header: string) {
  return String(header)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/\?/g, '')
    .replace(/_/g, '')
    .replace(/-/g, '');
}

function getCellValue(row: Record<string, string>, possibleHeaders: string[]) {
  for (const header of possibleHeaders) {
    const value = row[header];

    if (value !== undefined && value !== null) {
      return String(value).trim();
    }
  }

  return '';
}

function parseBoolean(value: string) {
  const normalized = value.trim().toLowerCase();

  if (['yes', 'y', 'true', '1'].includes(normalized)) {
    return true;
  }

  return false;
}

function blankToNull(value: string) {
  const trimmed = value.trim();

  if (trimmed === '') {
    return null;
  }

  return trimmed;
}

function ImportStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-dark-border bg-dark-card p-4">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-1 text-3xl font-bold text-white">{value}</p>
    </div>
  );
}