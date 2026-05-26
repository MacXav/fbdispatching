'use client';

import { useEffect, useState } from 'react';
import MainLayout from '@/components/MainLayout';
import Header from '@/components/Header';
import {
  BoardDisplaySettings,
  defaultBoardDisplaySettings,
  loadBoardDisplaySettings,
  resetBoardDisplaySettings,
  saveBoardDisplaySettings,
} from '@/lib/boardDisplaySettings';
import { Eye, EyeOff, RotateCcw, Settings } from 'lucide-react';

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

export default function SettingsPage() {
  const [boardSettings, setBoardSettings] = useState<BoardDisplaySettings>(
    defaultBoardDisplaySettings
  );

  useEffect(() => {
    setBoardSettings(loadBoardDisplaySettings());
  }, []);

  const updateBoardSetting = (
    key: keyof BoardDisplaySettings,
    value: boolean
  ) => {
    const nextSettings = {
      ...boardSettings,
      [key]: value,
    };

    setBoardSettings(nextSettings);
    saveBoardDisplaySettings(nextSettings);
  };

  const resetSettings = () => {
    resetBoardDisplaySettings();
    setBoardSettings(defaultBoardDisplaySettings);
  };

  return (
    <MainLayout>
      <Header
        title="Settings"
        subtitle="Control what information appears on the dispatch board"
      />

      <div className="mb-6 rounded-xl border border-blue-900 bg-blue-950/40 p-4">
        <div className="flex items-start gap-3">
          <Settings className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-300" />

          <div>
            <p className="font-semibold text-blue-100">
              Board display settings
            </p>

            <p className="mt-1 text-sm leading-6 text-blue-200/80">
              Turn off anything that clutters the truck board. These settings are saved on this computer/browser.
            </p>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="mb-5 flex flex-col gap-3 border-b border-dark-border pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">
              Truck Board Visibility
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              Choose what dispatch sees on pickup and truck rows.
            </p>
          </div>

          <button
            type="button"
            onClick={resetSettings}
            className="btn-secondary flex items-center justify-center gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            Reset Defaults
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {boardOptions.map((option) => {
            const enabled = boardSettings[option.key];

            return (
              <button
                key={option.key}
                type="button"
                onClick={() => updateBoardSetting(option.key, !enabled)}
                className={`rounded-xl border p-4 text-left transition ${
                  enabled
                    ? 'border-blue-600 bg-blue-950/50'
                    : 'border-dark-border bg-slate-900/60 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${
                      enabled
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {enabled ? (
                      <Eye className="h-4 w-4" />
                    ) : (
                      <EyeOff className="h-4 w-4" />
                    )}
                  </div>

                  <div>
                    <p className="font-bold text-white">
                      {option.label}
                    </p>

                    <p className="mt-1 text-sm leading-5 text-slate-400">
                      {option.description}
                    </p>

                    <p
                      className={`mt-2 text-xs font-bold ${
                        enabled ? 'text-blue-300' : 'text-slate-500'
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