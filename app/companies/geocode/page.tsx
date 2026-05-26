'use client';

import { useEffect, useMemo, useState } from 'react';
import MainLayout from '@/components/MainLayout';
import Header from '@/components/Header';
import {
  AlertTriangle,
  CheckCircle2,
  MapPin,
  RefreshCw,
  Search,
} from 'lucide-react';
import { getCompanies, updateCompany } from '@/lib/database';
import { Company } from '@/types';

interface GeocodeResult {
  latitude: number;
  longitude: number;
  formatted_address: string;
  country: string | null;
  country_code: string | null;
}

interface GeocodeLogItem {
  companyId: string;
  companyName: string;
  status: 'success' | 'error';
  message: string;
}

export default function CompanyGeocodePage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [geocodingId, setGeocodingId] = useState<string | null>(null);
  const [bulkGeocoding, setBulkGeocoding] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [logs, setLogs] = useState<GeocodeLogItem[]>([]);

  useEffect(() => {
    loadCompanies();
  }, []);

  const loadCompanies = async () => {
    try {
      setLoading(true);
      const companiesData = await getCompanies();
      setCompanies(companiesData);
    } catch (error) {
      console.error('Error loading companies:', error);
      alert('Could not load companies.');
    } finally {
      setLoading(false);
    }
  };

  const companiesWithAddress = useMemo(() => {
    return companies.filter((company) => companyHasAddress(company));
  }, [companies]);

  const missingCoordinates = useMemo(() => {
    return companiesWithAddress.filter((company) => !companyHasCoordinates(company));
  }, [companiesWithAddress]);

  const geocodedCompanies = useMemo(() => {
    return companies.filter((company) => companyHasCoordinates(company));
  }, [companies]);

  const filteredMissingCompanies = useMemo(() => {
    const lowerSearch = searchTerm.trim().toLowerCase();

    if (!lowerSearch) {
      return missingCoordinates;
    }

    return missingCoordinates.filter((company) => {
      const searchableText = [
        company.name,
        company.address,
        company.city,
        company.postal_code,
        company.country,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchableText.includes(lowerSearch);
    });
  }, [missingCoordinates, searchTerm]);

  const updateCompanyLocally = (
    companyId: string,
    updates: Partial<Company>
  ) => {
    setCompanies((currentCompanies) =>
      currentCompanies.map((company) =>
        company.id === companyId
          ? {
              ...company,
              ...updates,
            }
          : company
      )
    );
  };

  const addLog = (logItem: GeocodeLogItem) => {
    setLogs((currentLogs) => [logItem, ...currentLogs].slice(0, 50));
  };

  const geocodeCompany = async (company: Company) => {
    const address = buildCompanyAddress(company);

    if (!address) {
      addLog({
        companyId: company.id,
        companyName: company.name,
        status: 'error',
        message: 'Missing address, city, or postal code.',
      });

      return false;
    }

    try {
      setGeocodingId(company.id);

      const response = await fetch('/api/geocode-company', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ address }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMessage =
          typeof data?.error === 'string'
            ? data.error
            : 'Google could not geocode this company.';

        addLog({
          companyId: company.id,
          companyName: company.name,
          status: 'error',
          message: errorMessage,
        });

        return false;
      }

      const geocodeResult = data as GeocodeResult;

      const updatedCompany = await updateCompany(company.id, {
        latitude: geocodeResult.latitude,
        longitude: geocodeResult.longitude,
        country: geocodeResult.country,
        geocoded_at: new Date().toISOString(),
      } as Partial<Company>);

      if (!updatedCompany) {
        addLog({
          companyId: company.id,
          companyName: company.name,
          status: 'error',
          message: 'Coordinates found, but Supabase could not save them.',
        });

        return false;
      }

      updateCompanyLocally(company.id, {
        latitude: geocodeResult.latitude,
        longitude: geocodeResult.longitude,
        country: geocodeResult.country,
        geocoded_at: new Date().toISOString(),
      });

      addLog({
        companyId: company.id,
        companyName: company.name,
        status: 'success',
        message: `Saved ${geocodeResult.latitude.toFixed(6)}, ${geocodeResult.longitude.toFixed(6)}`,
      });

      return true;
    } catch (error) {
      console.error('Error geocoding company:', error);

      addLog({
        companyId: company.id,
        companyName: company.name,
        status: 'error',
        message: 'Unexpected error while geocoding.',
      });

      return false;
    } finally {
      setGeocodingId(null);
    }
  };

  const geocodeAllMissing = async () => {
    if (filteredMissingCompanies.length === 0) {
      alert('There are no missing companies to geocode.');
      return;
    }

    const confirmed = confirm(
      `Geocode ${filteredMissingCompanies.length} missing compan${
        filteredMissingCompanies.length === 1 ? 'y' : 'ies'
      }? This will call Google once per company.`
    );

    if (!confirmed) {
      return;
    }

    try {
      setBulkGeocoding(true);

      let successCount = 0;
      let failCount = 0;

      for (const company of filteredMissingCompanies) {
        const success = await geocodeCompany(company);

        if (success) {
          successCount++;
        } else {
          failCount++;
        }

        await wait(250);
      }

      alert(
        `Geocoding finished. ${successCount} saved, ${failCount} failed.`
      );
    } finally {
      setBulkGeocoding(false);
      setGeocodingId(null);
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <Header
          title="Geocode Companies"
          subtitle="Save coordinates for routing optimization"
        />

        <div className="card py-12 text-center">
          <p className="text-slate-400">Loading companies...</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <Header
        title="Geocode Companies"
        subtitle="Convert saved company addresses into latitude and longitude"
      />

      <div className="mb-6 rounded-xl border border-blue-900 bg-blue-950/40 p-4">
        <div className="flex items-start gap-3">
          <MapPin className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-300" />

          <div>
            <p className="font-semibold text-blue-100">
              This only geocodes companies missing coordinates.
            </p>

            <p className="mt-1 text-sm leading-6 text-blue-200/80">
              Coordinates are saved to Supabase so the Routing Planner can compare stops without calling Google every time.
            </p>
          </div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <SummaryCard
          label="Total Companies"
          value={String(companies.length)}
        />

        <SummaryCard
          label="With Address"
          value={String(companiesWithAddress.length)}
        />

        <SummaryCard
          label="Geocoded"
          value={String(geocodedCompanies.length)}
        />

        <SummaryCard
          label="Missing GPS"
          value={String(missingCoordinates.length)}
          warning={missingCoordinates.length > 0}
        />
      </div>

      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />

          <input
            type="text"
            className="input-field w-full pl-10"
            placeholder="Search missing companies by name, city, address..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={loadCompanies}
            className="btn-secondary flex items-center justify-center gap-2"
            disabled={loading || bulkGeocoding}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          <button
            type="button"
            onClick={geocodeAllMissing}
            className="btn-primary flex items-center justify-center gap-2"
            disabled={bulkGeocoding || filteredMissingCompanies.length === 0}
          >
            <MapPin className="h-4 w-4" />
            {bulkGeocoding
              ? 'Geocoding...'
              : `Geocode Missing (${filteredMissingCompanies.length})`}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <div className="card">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white">
                  Missing Coordinates
                </h2>

                <p className="mt-1 text-sm text-slate-400">
                  These companies have an address but no latitude/longitude yet.
                </p>
              </div>

              <span className="rounded bg-slate-800 px-3 py-1 text-xs font-bold text-slate-300">
                {filteredMissingCompanies.length} shown
              </span>
            </div>

            {filteredMissingCompanies.length === 0 ? (
              <div className="rounded-xl border border-green-900 bg-green-950/30 p-5">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-300" />

                  <div>
                    <p className="font-semibold text-green-100">
                      No missing companies found.
                    </p>

                    <p className="mt-1 text-sm text-green-100/80">
                      The Routing Planner should now have coordinates for these companies.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredMissingCompanies.map((company) => (
                  <CompanyGeocodeCard
                    key={company.id}
                    company={company}
                    geocoding={geocodingId === company.id}
                    disabled={bulkGeocoding || Boolean(geocodingId)}
                    onGeocode={() => geocodeCompany(company)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="card">
            <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-white">
              <AlertTriangle className="h-5 w-5 text-yellow-400" />
              Before You Run It
            </h2>

            <div className="space-y-3 text-sm leading-6 text-slate-400">
              <p>
                Make sure your Google API key is saved in <span className="font-mono text-slate-200">.env.local</span>.
              </p>

              <p>
                Make sure the Geocoding API is enabled in Google Cloud.
              </p>

              <p>
                Restart <span className="font-mono text-slate-200">npm run dev</span> after changing environment variables.
              </p>

              <p>
                Set a daily quota in Google Cloud so you cannot accidentally spend too much.
              </p>
            </div>
          </div>

          <div className="card">
            <h2 className="mb-4 text-xl font-bold text-white">
              Latest Results
            </h2>

            {logs.length === 0 ? (
              <p className="text-sm text-slate-500">
                Geocoding results will appear here.
              </p>
            ) : (
              <div className="space-y-2">
                {logs.map((log, index) => (
                  <div
                    key={`${log.companyId}-${index}`}
                    className={`rounded-lg border p-3 ${
                      log.status === 'success'
                        ? 'border-green-900 bg-green-950/30'
                        : 'border-red-900 bg-red-950/30'
                    }`}
                  >
                    <p
                      className={`text-sm font-bold ${
                        log.status === 'success'
                          ? 'text-green-100'
                          : 'text-red-100'
                      }`}
                    >
                      {log.companyName}
                    </p>

                    <p
                      className={`mt-1 text-xs ${
                        log.status === 'success'
                          ? 'text-green-100/80'
                          : 'text-red-100/80'
                      }`}
                    >
                      {log.message}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <h2 className="mb-4 text-xl font-bold text-white">
              Already Geocoded
            </h2>

            <div className="max-h-[360px] space-y-2 overflow-y-auto">
              {geocodedCompanies.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No companies have coordinates yet.
                </p>
              ) : (
                geocodedCompanies.map((company) => (
                  <div
                    key={company.id}
                    className="rounded-lg border border-dark-border bg-slate-900 p-3"
                  >
                    <p className="truncate text-sm font-bold text-white">
                      {company.name}
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      {Number(company.latitude).toFixed(5)},{' '}
                      {Number(company.longitude).toFixed(5)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}

function CompanyGeocodeCard({
  company,
  geocoding,
  disabled,
  onGeocode,
}: {
  company: Company;
  geocoding: boolean;
  disabled: boolean;
  onGeocode: () => void;
}) {
  return (
    <div className="rounded-xl border border-dark-border bg-slate-900 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="truncate text-lg font-bold text-white">
            {company.name}
          </p>

          <p className="mt-1 text-sm text-slate-400">
            {buildCompanyAddress(company) || 'No address saved'}
          </p>

          {company.notes && (
            <p className="mt-1 line-clamp-2 text-xs text-slate-500">
              {company.notes}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onGeocode}
          className="btn-primary flex flex-shrink-0 items-center justify-center gap-2"
          disabled={disabled}
        >
          <MapPin className="h-4 w-4" />
          {geocoding ? 'Geocoding...' : 'Geocode'}
        </button>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  warning = false,
}: {
  label: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        warning
          ? 'border-yellow-900 bg-yellow-950/30'
          : 'border-dark-border bg-dark-card'
      }`}
    >
      <p
        className={`text-xs font-black uppercase tracking-wide ${
          warning ? 'text-yellow-300' : 'text-slate-500'
        }`}
      >
        {label}
      </p>

      <p className="mt-1 text-3xl font-bold text-white">
        {value}
      </p>
    </div>
  );
}

function companyHasAddress(company: Company) {
  return Boolean(
    company.address?.trim() ||
      company.city?.trim() ||
      company.postal_code?.trim()
  );
}

function companyHasCoordinates(company: Company) {
  return (
    company.latitude !== null &&
    company.latitude !== undefined &&
    company.longitude !== null &&
    company.longitude !== undefined &&
    !Number.isNaN(Number(company.latitude)) &&
    !Number.isNaN(Number(company.longitude))
  );
}

function buildCompanyAddress(company: Company) {
  const parts = [
    company.address,
    company.city,
    company.postal_code,
    company.country,
  ].filter((part) => part && String(part).trim() !== '');

  return parts.join(', ');
}

function wait(milliseconds: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}