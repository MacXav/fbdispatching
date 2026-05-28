'use client';

import { useEffect, useMemo, useState } from 'react';
import MainLayout from '@/components/MainLayout';
import Header from '@/components/Header';
import {
  BoardDisplaySettings,
  defaultBoardDisplaySettings,
  loadBoardDisplaySettings,
  resetBoardDisplaySettings,
  saveBoardDisplaySettings,
} from '@/lib/boardDisplaySettings';
import {
  Eye,
  EyeOff,
  Moon,
  RotateCcw,
  Settings,
  Sun,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';

type SiteTheme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'dispatch_pro_theme';

const boardOptions: {
  key: keyof BoardDisplaySettings;
  label: string;
  description: string;
}[] = [
  {
    key: 'showWorkOrderNumber',
    label: 'WO Number',
    description: 'Show WO-000123 on pickup and truck board rows.',
  },
  {
    key: 'showCustomerReference',
    label: 'Customer Ref #',
    description: 'Show customer PO, order number, or load number.',
  },
  {
    key: 'showPickupReference',
    label: 'Pickup Ref #',
    description: 'Show pickup confirmation or appointment reference.',
  },
  {
    key: 'showDeliveryReference',
    label: 'Delivery Ref #',
    description: 'Show receiver or delivery reference.',
  },
  {
    key: 'showCity',
    label: 'City',
    description: 'Show pickup/delivery city on board rows.',
  },
  {
    key: 'showSkids',
    label: 'Skids',
    description: 'Show skid count on board rows.',
  },
  {
    key: 'showStopType',
    label: 'Stop Type',
    description: 'Show PU, DEL, PU/DEL, XDOCK, or WH.',
  },
  {
    key: 'showBoardNote',
    label: 'Board Note',
    description: 'Show the yellow editable board note field.',
  },
  {
    key: 'showNormalNotes',
    label: 'Normal Notes',
    description: 'Show regular pickup/shipment notes.',
  },
  {
    key: 'showInternalNotes',
    label: 'Special/Internal Notes',
    description: 'Show extra internal notes copied from the work order.',
  },
  {
    key: 'showFinDetails',
    label: 'FIN Details',
    description: 'Show who completed the stop after FIN is checked.',
  },
];

function applySiteTheme(theme: SiteTheme) {
  document.documentElement.classList.remove('light', 'dark');
  document.documentElement.classList.add(theme);
  document.documentElement.style.colorScheme = theme;
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
}

function loadSiteTheme(): SiteTheme {
  if (typeof window === 'undefined') return 'dark';

  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);

  if (savedTheme === 'light' || savedTheme === 'dark') {
    return savedTheme;
  }

  return 'dark';
}

export default function SettingsPage() {
  const [boardSettings, setBoardSettings] = useState<BoardDisplaySettings>(
    defaultBoardDisplaySettings
  );

  const [siteTheme, setSiteTheme] = useState<SiteTheme>('dark');

  useEffect(() => {
    setBoardSettings(loadBoardDisplaySettings());

    const loadedTheme = loadSiteTheme();
    setSiteTheme(loadedTheme);
    applySiteTheme(loadedTheme);
  }, []);

  const visibleCount = useMemo(() => {
    return boardOptions.filter((option) => boardSettings[option.key]).length;
  }, [boardSettings]);

  const hiddenCount = boardOptions.length - visibleCount;

  const saveSettings = (nextSettings: BoardDisplaySettings) => {
    setBoardSettings(nextSettings);
    saveBoardDisplaySettings(nextSettings);
    window.dispatchEvent(new Event('board-display-settings-updated'));
  };

  const updateBoardSetting = (
    key: keyof BoardDisplaySettings,
    value: boolean
  ) => {
    const nextSettings = {
      ...boardSettings,
      [key]: value,
    };

    saveSettings(nextSettings);
  };

  const setAllBoardSettings = (value: boolean) => {
    const nextSettings = { ...boardSettings };

    boardOptions.forEach((option) => {
      nextSettings[option.key] = value;
    });

    saveSettings(nextSettings);
  };

  const updateTheme = (theme: SiteTheme) => {
    setSiteTheme(theme);
    applySiteTheme(theme);
  };

  const resetSettings = () => {
    resetBoardDisplaySettings();
    setBoardSettings(defaultBoardDisplaySettings);
    window.dispatchEvent(new Event('board-display-settings-updated'));
  };

  return (
    <MainLayout>
      <Header
        title="Settings"
        subtitle="Control theme and what information appears on the dispatch board"
      />
      <div className="card mb-6">
        <div className="mb-5 border-b border-slate-300 pb-5 dark:border-dark-border">
          <h2 className="text-xl font-black text-slate-950 dark:text-white">
            Board Theme
          </h2>

          <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-300">
            Switch the app between dark mode and light mode on this computer/browser.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <button
            type="button"
            onClick={() => updateTheme('dark')}
            className={`rounded-xl border-2 p-4 text-left transition ${
              siteTheme === 'dark'
                ? 'border-blue-500 bg-blue-50 dark:border-blue-600 dark:bg-blue-950/50'
                : 'border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50 dark:border-dark-border dark:bg-slate-900/60 dark:hover:bg-slate-800'
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${
                  siteTheme === 'dark'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                <Moon className="h-5 w-5" />
              </div>

              <div>
                <p className="font-black text-slate-950 dark:text-white">
                  Dark Mode
                </p>

                <p className="mt-1 text-sm font-medium leading-5 text-slate-700 dark:text-slate-300">
                  Best for the truck board and dispatch screens.
                </p>

                <p
                  className={`mt-2 text-xs font-black uppercase tracking-wide ${
                    siteTheme === 'dark'
                      ? 'text-blue-700 dark:text-blue-300'
                      : 'text-slate-500 dark:text-slate-500'
                  }`}
                >
                  {siteTheme === 'dark' ? 'Active' : 'Click to use'}
                </p>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => updateTheme('light')}
            className={`rounded-xl border-2 p-4 text-left transition ${
              siteTheme === 'light'
                ? 'border-blue-500 bg-blue-50 dark:border-blue-600 dark:bg-blue-950/50'
                : 'border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50 dark:border-dark-border dark:bg-slate-900/60 dark:hover:bg-slate-800'
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${
                  siteTheme === 'light'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                <Sun className="h-5 w-5" />
              </div>

              <div>
                <p className="font-black text-slate-950 dark:text-white">
                  Light Mode
                </p>

                <p className="mt-1 text-sm font-medium leading-5 text-slate-700 dark:text-slate-300">
                  Brighter theme for office screens and daytime use.
                </p>

                <p
                  className={`mt-2 text-xs font-black uppercase tracking-wide ${
                    siteTheme === 'light'
                      ? 'text-blue-700 dark:text-blue-300'
                      : 'text-slate-500 dark:text-slate-500'
                  }`}
                >
                  {siteTheme === 'light' ? 'Active' : 'Click to use'}
                </p>
              </div>
            </div>
          </button>
        </div>
      </div>

      <div className="card">
        <div className="mb-5 flex flex-col gap-4 border-b border-slate-300 pb-5 dark:border-dark-border xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-950 dark:text-white">
              Truck Board Visibility
            </h2>

            <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-300">
              Choose what dispatch sees on pickup and truck rows.
            </p>

            <p className="mt-2 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-400">
              {visibleCount} visible • {hiddenCount} hidden
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            <button
              type="button"
              onClick={() => setAllBoardSettings(true)}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-green-300 bg-green-50 px-4 py-2 text-sm font-bold text-green-800 transition hover:bg-green-100 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200 dark:hover:bg-green-950"
            >
              <ToggleRight className="h-4 w-4" />
              Turn All On
            </button>

            <button
              type="button"
              onClick={() => setAllBoardSettings(false)}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-bold text-red-800 transition hover:bg-red-100 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950"
            >
              <ToggleLeft className="h-4 w-4" />
              Turn All Off
            </button>

            <button
              type="button"
              onClick={resetSettings}
              className="btn-secondary flex items-center justify-center gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Reset Defaults
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {boardOptions.map((option) => {
            const enabled = boardSettings[option.key];

            return (
              <button
                key={option.key}
                type="button"
                onClick={() => updateBoardSetting(option.key, !enabled)}
                className={`rounded-xl border-2 p-4 text-left transition ${
                  enabled
                    ? 'border-blue-400 bg-blue-50 hover:border-blue-500 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950/50 dark:hover:bg-blue-950'
                    : 'border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50 dark:border-dark-border dark:bg-slate-900/60 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${
                      enabled
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    {enabled ? (
                      <Eye className="h-4 w-4" />
                    ) : (
                      <EyeOff className="h-4 w-4" />
                    )}
                  </div>

                  <div>
                    <p className="font-black text-slate-950 dark:text-white">
                      {option.label}
                    </p>

                    <p className="mt-1 text-sm font-medium leading-5 text-slate-700 dark:text-slate-300">
                      {option.description}
                    </p>

                    <p
                      className={`mt-2 text-xs font-black uppercase tracking-wide ${
                        enabled
                          ? 'text-blue-700 dark:text-blue-300'
                          : 'text-slate-500 dark:text-slate-500'
                      }`}
                    >
                      {enabled ? 'Visible' : 'Hidden'}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </MainLayout>
  );
}