"use client";

import type React from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Home,
  Layers,
  MapPin,
  Menu,
  Navigation2,
  Package,
  Route,
  Settings,
  Truck,
} from "lucide-react";

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

const SIDEBAR_COLLAPSED_KEY = "dispatch-pro-sidebar-collapsed";

export default function Sidebar({ mobile = false, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    const savedValue = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY);

    if (savedValue === "true") {
      setCollapsed(true);
    }
  }, []);

  const toggleCollapsed = () => {
    const nextValue = !collapsed;

    setCollapsed(nextValue);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(nextValue));
    }
  };

  const groups: SidebarGroup[] = [
    {
      links: [
        {
          href: "/dashboard",
          label: "Dashboard",
          icon: Home,
          match: ["/dashboard", "/"],
        },
      ],
    },
    {
      title: "Operations",
      links: [
        {
          href: "/shipments",
          label: "Pickups",
          icon: Package,
          match: ["/shipments"],
        },
        {
          href: "/routes",
          label: "Driver Routes",
          icon: Navigation2,
          match: ["/routes"],
        },
        {
          href: "/routing-planner",
          label: "Routing Planner",
          icon: Route,
          match: ["/routing-planner"],
        },
      ],
    },
    {
      title: "Office",
      links: [
        {
          href: "/work-orders",
          label: "Work Orders",
          icon: ClipboardList,
          match: ["/work-orders"],
        },
        {
          href: "/companies",
          label: "Companies",
          icon: Building2,
          match: ["/companies"],
        },
      ],
    },
    {
      title: "System",
      links: [
        {
          href: "/management",
          label: "Management",
          icon: Settings,
          match: ["/management"],
        },
        {
          href: "/settings",
          label: "Settings",
          icon: Settings,
          match: ["/settings"],
        },
        {
          href: "/companies/geocode",
          label: "Geocode",
          icon: MapPin,
          match: ["/companies/geocode"],
        },
      ],
    },
  ];

  const isActive = (link: SidebarLink) => {
    const matches = link.match || [link.href];

    return matches.some((match) => {
      if (match === "/") {
        return pathname === "/";
      }

      if (match === "/companies") {
        return pathname === "/companies";
      }

      return pathname === match || pathname.startsWith(`${match}/`);
    });
  };

  const desktopCollapsed = mounted && collapsed && !mobile;

  return (
    <aside
      className={`${
        mobile
          ? "h-full w-full"
          : desktopCollapsed
            ? "min-h-screen w-[72px]"
            : "min-h-screen w-64"
      } flex flex-col border-r border-dark-border bg-dark-card transition-all duration-300`}
    >
      <div
        className={`flex min-h-0 flex-1 flex-col ${
          desktopCollapsed ? "px-2 py-4" : "p-4"
        }`}
      >
        {!mobile && (
          <div
            className={`mb-5 flex items-center ${
              desktopCollapsed ? "justify-center" : "justify-between gap-3"
            }`}
          >
            <Link
              href="/dashboard"
              className={`flex min-w-0 items-center ${
                desktopCollapsed ? "justify-center" : "gap-3"
              }`}
              title="Dispatch Pro"
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-blue-500/30 bg-blue-950 text-blue-300 shadow-lg shadow-blue-950/30">
                <Truck className="h-5 w-5" />
              </div>

              {!desktopCollapsed && (
                <div className="min-w-0">
                  <h1 className="truncate text-base font-black leading-tight text-white">
                    Dispatch Pro
                  </h1>
                  <p className="truncate text-[11px] font-semibold text-slate-500">
                    Trucking Management
                  </p>
                </div>
              )}
            </Link>

            {!desktopCollapsed && (
              <button
                type="button"
                onClick={toggleCollapsed}
                className="rounded-xl border border-dark-border bg-slate-900 p-2 text-slate-400 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white"
                title="Collapse sidebar"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {!mobile && desktopCollapsed && (
          <button
            type="button"
            onClick={toggleCollapsed}
            className="mb-5 flex h-10 w-full items-center justify-center rounded-xl border border-dark-border bg-slate-900 text-slate-400 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white"
            title="Expand sidebar"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}

        {mobile && (
          <div className="mb-5 flex items-center gap-3 px-1">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-blue-500/30 bg-blue-950 text-blue-300">
              <Menu className="h-5 w-5" />
            </div>

            <div>
              <h1 className="text-base font-black leading-tight text-white">
                Dispatch Pro
              </h1>
              <p className="text-[11px] font-semibold text-slate-500">
                Navigation
              </p>
            </div>
          </div>
        )}

        <nav className="custom-board-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
          {groups.map((group, groupIndex) => (
            <div key={group.title || `group-${groupIndex}`}>
              {group.title && !desktopCollapsed && (
                <p className="mb-2 px-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-600">
                  {group.title}
                </p>
              )}

              {group.title && desktopCollapsed && groupIndex > 0 && (
                <div className="mx-auto mb-2 h-px w-8 bg-dark-border" />
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
                      title={desktopCollapsed ? link.label : undefined}
                      className={`group relative flex items-center rounded-xl transition-all duration-200 ${
                        desktopCollapsed
                          ? "h-11 justify-center px-0"
                          : "gap-3 px-3 py-2.5"
                      } ${
                        active
                          ? "bg-blue-600 text-white shadow-lg shadow-blue-950/30"
                          : "text-slate-400 hover:bg-slate-800 hover:text-white"
                      }`}
                    >
                      <Icon className="h-5 w-5 flex-shrink-0" />

                      {!desktopCollapsed && (
                        <span className="truncate text-sm font-semibold">
                          {link.label}
                        </span>
                      )}

                      {desktopCollapsed && (
                        <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-lg border border-dark-border bg-slate-950 px-3 py-2 text-xs font-semibold text-white shadow-xl group-hover:block">
                          {link.label}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div
          className={`mt-5 border-t border-dark-border pt-4 ${
            desktopCollapsed ? "text-center" : ""
          }`}
        >
          {desktopCollapsed ? (
            <button
              type="button"
              onClick={toggleCollapsed}
              className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl border border-dark-border bg-slate-900 text-slate-400 transition hover:bg-slate-800 hover:text-white"
              title="Expand sidebar"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-slate-500">
                  © 2026 Dispatch Pro
                </p>
                <p className="mt-0.5 text-[10px] text-slate-600">
                  Local dispatch system
                </p>
              </div>

              {!mobile && (
                <button
                  type="button"
                  onClick={toggleCollapsed}
                  className="rounded-xl border border-dark-border bg-slate-900 p-2 text-slate-400 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white"
                  title="Collapse sidebar"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
