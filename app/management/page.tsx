'use client';

import Link from 'next/link';
import MainLayout from '@/components/MainLayout';
import Header from '@/components/Header';
import {
  Building2,
  FileSpreadsheet,
  Settings,
  Truck,
} from 'lucide-react';

export default function ManagementPage() {
  return (
    <MainLayout>
      <Header
        title="Management"
        subtitle="Edit setup items like trucks and company imports"
      />

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        <ManagementCard
          href="/trucks"
          title="Edit Trucks"
          description="Add trucks, update drivers, capacities, route areas, and truck status."
          icon={Truck}
        />

        <ManagementCard
          href="/companies/import"
          title="Import Companies"
          description="Upload company lists from Excel or CSV so they can be used in pickups and work orders."
          icon={FileSpreadsheet}
        />

        <ManagementCard
          href="/companies"
          title="Company Database"
          description="View and edit saved companies, addresses, contacts, and notes."
          icon={Building2}
        />
      </div>
    </MainLayout>
  );
}

function ManagementCard({
  href,
  title,
  description,
  icon: Icon,
  disabled = false,
}: {
  href: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <div className="rounded-xl border border-dark-border bg-dark-card p-6 opacity-60">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800 text-slate-400">
          <Icon className="h-6 w-6" />
        </div>

        <h2 className="text-xl font-bold text-white">{title}</h2>

        <p className="mt-2 text-sm leading-6 text-slate-400">
          {description}
        </p>

        <p className="mt-5 text-sm font-semibold text-slate-500">
          Coming later
        </p>
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="group rounded-xl border border-dark-border bg-dark-card p-6 transition hover:border-blue-500 hover:bg-slate-900"
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-950 text-blue-300 transition group-hover:bg-blue-600 group-hover:text-white">
        <Icon className="h-6 w-6" />
      </div>

      <h2 className="text-xl font-bold text-white">{title}</h2>

      <p className="mt-2 text-sm leading-6 text-slate-400">
        {description}
      </p>

      <p className="mt-5 text-sm font-semibold text-blue-300 group-hover:text-blue-200">
        Open →
      </p>
    </Link>
  );
}