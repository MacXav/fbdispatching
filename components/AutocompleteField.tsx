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
          <label className="mb-2 block text-sm font-medium text-slate-300">
            {label} 
          </label>

          <div
            className={`relative rounded-lg border ${
              open
                ? 'border-blue-500 ring-2 ring-blue-500/20'
                : 'border-dark-border'
            } bg-dark-bg`}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />

            <ComboboxInput
              className="w-full rounded-lg bg-transparent py-2.5 pl-9 pr-20 text-sm text-white outline-none placeholder:text-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
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
                  className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  title="Clear selection"
                >
                  <X className="h-4 w-4" />
                </button>
              )}

              <ComboboxButton
                className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
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
            <div className="mt-2 rounded-lg border border-green-900 bg-green-950/30 px-3 py-2">
              <div className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-300" />

                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-green-100">
                    {selectedItem.label}
                  </p>

                  {selectedItem.description && (
                    <p className="mt-0.5 truncate text-xs text-green-200/70">
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
            <ComboboxOptions className="custom-board-scrollbar absolute z-[9999] mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-dark-border bg-slate-950 shadow-2xl">
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
                          ? 'bg-blue-950 text-blue-100'
                          : 'text-slate-200 hover:bg-slate-900'
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
                            <p className="mt-0.5 truncate text-xs text-slate-400">
                              {item.description}
                            </p>
                          )}
                        </div>

                        {selected && (
                          <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-300" />
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