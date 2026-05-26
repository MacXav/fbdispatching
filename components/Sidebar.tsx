'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Building2,
  ClipboardList,
  FileText,
  Home,
  Layers,
  MapPin,
  Navigation2,
  Package,
  Route,
  Settings,
  Truck,
} from 'lucide-react';

interface SidebarProps {
  mobile?: boolean;
  onNavigate?: () => void;
}

interface SidebarLink {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  match?: string[];
}

interface SidebarGroup {
  title?: string;
  links: SidebarLink[];
}

export default function Sidebar({ mobile = false, onNavigate }: SidebarProps) {
  const pathname = usePathname();

  const groups: SidebarGroup[] = [
    {
      links: [
        {
          href: '/dashboard',
          label: 'Dashboard',
          icon: Home,
          match: ['/dashboard', '/'],
        },
      ],
    },
    {
      title: 'Dispatching',
      links: [
        {
          href: '/shipments',
          label: 'Pickups',
          icon: Package,
          match: ['/shipments'],
        },
        {
          href: '/routes',
          label: 'Routes',
          icon: Navigation2,
          match: ['/routes'],
        },
        {
          href: '/routing-planner',
          label: 'Routing Planner',
          icon: Route,
          match: ['/routing-planner'],
        },
        {
          href: '/cross-dock',
          label: 'Cross-Dock',
          icon: Layers,
          match: ['/cross-dock'],
        },
        {
          href: '/bols',
          label: 'Print Documents',
          icon: FileText,
          match: ['/bols'],
        },
        {
          href: '/bols/history',
          label: 'Document History',
          icon: ClipboardList,
          match: ['/bols/history'],
        },
      ],
    },
    {
      title: 'Office',
      links: [
        {
          href: '/work-orders',
          label: 'Work Orders',
          icon: ClipboardList,
          match: ['/work-orders'],
        },
        {
          href: '/companies',
          label: 'Companies',
          icon: Building2,
          match: ['/companies'],
        },
        {
          href: '/companies/geocode',
          label: 'Geocode Companies',
          icon: MapPin,
          match: ['/companies/geocode'],
        },
      ],
    },
    {
      title: 'Management',
      links: [
        {
          href: '/management',
          label: 'Management',
          icon: Settings,
          match: ['/management'],
        },
        {
          href: '/settings',
          label: 'Settings',
          icon: Settings,
          match: ['/settings'],
        },
      ],
    },
  ];

  const isActive = (link: SidebarLink) => {
    const matches = link.match || [link.href];

    return matches.some((match) => {
      if (match === '/') {
        return pathname === '/';
      }

      if (match === '/bols') {
        return pathname === '/bols';
      }

      if (match === '/companies') {
        return pathname === '/companies';
      }

      return pathname === match || pathname.startsWith(`${match}/`);
    });
  };

  return (
    <aside
      className={`${
        mobile ? 'h-full w-full' : 'min-h-screen w-64'
      } border-r border-dark-border bg-dark-card p-5`}
    >
      {!mobile && (
        <div className="mb-8">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-blue-400">
            <Truck className="h-8 w-8" />
            Dispatch Pro
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Trucking Management System
          </p>
        </div>
      )}

      <nav className="space-y-6">
        {groups.map((group, groupIndex) => (
          <div key={group.title || `group-${groupIndex}`}>
            {group.title && (
              <p className="mb-2 px-4 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                {group.title}
              </p>
            )}

            <div className="space-y-1">
              {group.links.map((link) => {
                const Icon = link.icon;
                const active = isActive(link);

                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={onNavigate}
                    className={`flex items-center gap-3 rounded-xl px-4 py-3 transition-colors duration-200 ${
                      active
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-950/30'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="font-medium">{link.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-10 border-t border-dark-border pt-5">
        <p className="text-xs text-slate-500">© 2026 Dispatch Pro</p>
      </div>
    </aside>
  );
}