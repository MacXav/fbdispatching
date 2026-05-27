'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import { Menu, X } from 'lucide-react';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  const isDashboard = pathname === '/dashboard' || pathname === '/';

  return (
    <div className="min-h-screen bg-white text-slate-950 transition-colors duration-200 dark:bg-dark-bg dark:text-slate-100">
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2 shadow-sm lg:hidden dark:border-dark-border dark:bg-dark-card dark:shadow-none">
        <div>
          <p className="text-base font-black text-blue-600 dark:text-blue-400">
            Dispatch Pro
          </p>

          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Trucking Management System
          </p>
        </div>

        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="rounded-xl border border-slate-300 bg-white p-2 text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-dark-border dark:bg-slate-800 dark:text-slate-100 dark:shadow-none dark:hover:bg-slate-700"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/40 dark:bg-black/60"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu overlay"
          />

          <div className="relative h-full w-72 max-w-[85vw] bg-white shadow-2xl dark:bg-dark-card">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-dark-border">
              <div>
                <p className="text-lg font-black text-blue-600 dark:text-blue-400">
                  Dispatch Pro
                </p>

                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Menu
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="rounded-xl border border-slate-300 bg-white p-2 text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-dark-border dark:bg-slate-800 dark:text-slate-100 dark:shadow-none dark:hover:bg-slate-700"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <Sidebar mobile onNavigate={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex h-screen overflow-hidden">
        <div className="hidden h-screen flex-shrink-0 lg:block">
          <Sidebar />
        </div>

        <main className="min-w-0 flex-1 overflow-hidden bg-white transition-colors duration-200 dark:bg-dark-bg">
          {isDashboard ? (
            <div className="h-full w-full p-0">{children}</div>
          ) : (
            <div className="h-full w-full overflow-y-auto p-4 sm:p-6 lg:p-8">
              {children}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}