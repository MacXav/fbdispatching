'use client';

import { ReactNode } from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  backgroundColor?: string;
}

export default function StatCard({
  title,
  value,
  subtitle,
  icon,
  backgroundColor = 'bg-blue-600',
}: StatCardProps) {
  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-slate-400 text-sm font-medium">{title}</p>
          <p className="text-3xl font-bold text-white mt-2">{value}</p>
          {subtitle && <p className="text-xs text-slate-500 mt-2">{subtitle}</p>}
        </div>
        {icon && (
          <div className={`${backgroundColor} p-3 rounded-lg`}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
