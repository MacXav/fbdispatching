'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

export interface AutocompleteItem {
  id: string;
  label: string;
  description?: string;
  keywords?: string;
}

interface AutocompleteFieldProps {
  label: string;
  placeholder: string;
  items: AutocompleteItem[];
  selectedId: string;
  onSelect: (item: AutocompleteItem) => void;
  onClear: () => void;
  emptyMessage?: string;
  disabled?: boolean;
}

export default function AutocompleteField({
  label,
  placeholder,
  items,
  selectedId,
  onSelect,
  onClear,
  emptyMessage = 'No matches found',
  disabled = false,
}: AutocompleteFieldProps) {
  const selectedItem = items.find((item) => item.id === selectedId) || null;

  const [query, setQuery] = useState(selectedItem?.label || '');
  const [open, setOpen] = useState(false);

  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setQuery(selectedItem?.label || '');
  }, [selectedItem?.id, selectedItem?.label]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!wrapperRef.current) return;

      if (!wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);

        if (selectedItem) {
          setQuery(selectedItem.label);
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [selectedItem]);

  const filteredItems = useMemo(() => {
    const trimmedQuery = query.trim().toLowerCase();

    if (trimmedQuery === '') {
      return items.slice(0, 8);
    }

    return items
      .filter((item) => {
        const haystack = [
          item.label,
          item.description || '',
          item.keywords || '',
        ]
          .join(' ')
          .toLowerCase();

        return haystack.includes(trimmedQuery);
      })
      .slice(0, 8);
  }, [items, query]);

  return (
    <div ref={wrapperRef} className="relative">
      <label className="mb-2 block text-sm font-medium text-slate-300">
        {label}
      </label>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />

        <input
          type="text"
          className="input-field pl-10 pr-10"
          placeholder={placeholder}
          value={query}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);

            if (selectedId) {
              onClear();
            }
          }}
        />

        {(query || selectedId) && !disabled && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              onClear();
              setOpen(true);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
            aria-label="Clear selection"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && !disabled && (
        <div className="absolute z-40 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-dark-border bg-slate-900 shadow-2xl">
          {filteredItems.length === 0 ? (
            <div className="px-4 py-3 text-sm text-slate-400">
              {emptyMessage}
            </div>
          ) : (
            filteredItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelect(item);
                  setQuery(item.label);
                  setOpen(false);
                }}
                className={`block w-full border-b border-dark-border px-4 py-3 text-left last:border-b-0 hover:bg-slate-800 ${
                  selectedId === item.id ? 'bg-blue-950/60' : ''
                }`}
              >
                <p className="font-semibold text-white">{item.label}</p>

                {item.description && (
                  <p className="mt-1 text-xs text-slate-400">
                    {item.description}
                  </p>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}