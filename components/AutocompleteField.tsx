'use client';

import { Fragment, useMemo, useState } from 'react';
import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
  Transition,
} from '@headlessui/react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

export interface AutocompleteItem {
  id: string;
  label: string;
  description?: string;
  keywords?: string;
}

interface AutocompleteFieldProps {
  label: string;
  placeholder?: string;
  items: AutocompleteItem[];
  selectedId: string;
  onSelect: (item: AutocompleteItem) => void;
  onClear: () => void;
  emptyMessage?: string;
  disabled?: boolean;
}

export default function AutocompleteField({
  label,
  placeholder = 'Start typing...',
  items,
  selectedId,
  onSelect,
  onClear,
  emptyMessage = 'No results found.',
  disabled = false,
}: AutocompleteFieldProps) {
  const [query, setQuery] = useState('');

  const selectedItem = useMemo(() => {
    return items.find((item) => item.id === selectedId) || null;
  }, [items, selectedId]);

  const filteredItems = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();

    if (!cleanQuery) {
      return items.slice(0, 50);
    }

    const queryParts = cleanQuery.split(/\s+/).filter(Boolean);

    return items
      .map((item) => {
        const label = item.label.toLowerCase();

        const searchableText = [
          item.label,
          item.description,
          item.keywords,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        const matches = queryParts.every((part) => searchableText.includes(part));

        if (!matches) {
          return null;
        }

        let score = 0;

        if (label === cleanQuery) score += 100;
        if (label.startsWith(cleanQuery)) score += 70;
        if (label.includes(cleanQuery)) score += 40;
        if (item.description?.toLowerCase().includes(cleanQuery)) score += 10;
        if (item.keywords?.toLowerCase().includes(cleanQuery)) score += 5;

        return {
          item,
          score,
        };
      })
      .filter((result): result is { item: AutocompleteItem; score: number } =>
        Boolean(result)
      )
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }

        return a.item.label.localeCompare(b.item.label);
      })
      .slice(0, 50)
      .map((result) => result.item);
  }, [items, query]);

  const handleSelect = (item: AutocompleteItem | null) => {
    if (!item) {
      return;
    }

    onSelect(item);
    setQuery('');
  };

  const handleClear = () => {
    onClear();
    setQuery('');
  };

  return (
    <Combobox
      value={selectedItem}
      onChange={handleSelect}
      disabled={disabled}
      immediate
      nullable
    >
      {({ open }) => (
        <div className="relative">
          <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
            {label}
          </label>

          <div
            className={`relative rounded-lg border bg-white ${
              open
                ? 'border-blue-500 ring-2 ring-blue-500/20'
                : 'border-slate-300 dark:border-dark-border'
            } dark:bg-dark-bg`}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />

            <ComboboxInput
              className="w-full rounded-lg bg-transparent py-2.5 pl-9 pr-20 text-sm text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60 dark:text-white dark:placeholder:text-slate-600"
              displayValue={(item: AutocompleteItem | null) => item?.label || ''}
              placeholder={placeholder}
              autoComplete="off"
              onFocus={() => setQuery('')}
              onChange={(event) => setQuery(event.target.value)}
            />

            <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
              {selectedItem && (
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={handleClear}
                  disabled={disabled}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-white"
                  title="Clear selection"
                >
                  <X className="h-4 w-4" />
                </button>
              )}

              <ComboboxButton
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-white"
                title="Open options"
              >
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${
                    open ? 'rotate-180' : ''
                  }`}
                />
              </ComboboxButton>
            </div>
          </div>

          {selectedItem && !open && (
            <div className="mt-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 dark:border-green-900 dark:bg-green-950/30">
              <div className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-700 dark:text-green-300" />

                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-green-900 dark:text-green-100">
                    {selectedItem.label}
                  </p>

                  {selectedItem.description && (
                    <p className="mt-0.5 truncate text-xs text-green-700 dark:text-green-200/70">
                      {selectedItem.description}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <Transition
            as={Fragment}
            leave="transition ease-in duration-100"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
            afterLeave={() => setQuery('')}
          >
            <ComboboxOptions className="custom-board-scrollbar absolute z-[9999] mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-dark-border dark:bg-slate-950">
              {filteredItems.length === 0 ? (
                <div className="px-3 py-3 text-sm text-slate-500">
                  {emptyMessage}
                </div>
              ) : (
                filteredItems.map((item) => (
                  <ComboboxOption
                    key={item.id}
                    value={item}
                    className={({ active }) =>
                      `cursor-pointer px-3 py-2.5 text-left transition ${
                        active
                          ? 'bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-100'
                          : 'text-slate-800 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-900'
                      }`
                    }
                  >
                    {({ selected }) => (
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {item.label}
                          </p>

                          {item.description && (
                            <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                              {item.description}
                            </p>
                          )}
                        </div>

                        {selected && (
                          <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-700 dark:text-green-300" />
                        )}
                      </div>
                    )}
                  </ComboboxOption>
                ))
              )}
            </ComboboxOptions>
          </Transition>
        </div>
      )}
    </Combobox>
  );
}