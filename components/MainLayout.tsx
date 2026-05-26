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
    <div className="min-h-screen bg-dark-bg text-slate-100">
      {/* Mobile top bar */}
      <div className="lg:hidden sticky top-0 z-40 flex items-center justify-between border-b border-dark-border bg-dark-card px-3 py-2">
        <div>
          <p className="text-base font-bold text-blue-400">Dispatch Pro</p>
          <p className="text-[11px] text-slate-400">Trucking Management System</p>
        </div>

        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="rounded-lg border border-dark-border bg-slate-800 p-2 text-slate-100 hover:bg-slate-700"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu overlay"
          />

          <div className="relative h-full w-72 max-w-[85vw] bg-dark-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-dark-border px-4 py-3">
              <div>
                <p className="text-lg font-bold text-blue-400">Dispatch Pro</p>
                <p className="text-xs text-slate-400">Menu</p>
              </div>

              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="rounded-lg border border-dark-border bg-slate-800 p-2 text-slate-100 hover:bg-slate-700"
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
        {/* Desktop sidebar */}
        <div className="hidden h-screen flex-shrink-0 lg:block">
          <Sidebar />
        </div>

        <main className="min-w-0 flex-1 overflow-hidden bg-dark-bg">
          {isDashboard ? (
            <div className="h-full w-full p-0">
              {children}
            </div>
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