'use client';

import { useState, useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatNumber } from '@/lib/utils';
import { getSupabaseSearchPatterns } from '@/lib/search-utils';

interface CityResult {
  fips_code: string;
  name: string;
  state: string;
  state_code: string;
  population: number;
  slug: string;
}

interface CityPickerProps {
  selected: CityResult | null;
  onSelect: (city: CityResult) => void;
  onRemove: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export default function CityPicker({ selected, onSelect, onRemove, placeholder, autoFocus }: CityPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CityResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current && !selected) {
      inputRef.current.focus();
    }
  }, [autoFocus, selected]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }

    const search = async () => {
      const patterns = getSupabaseSearchPatterns(trimmed);
      const orFilter = patterns.map(p => `name.ilike.${p}`).join(',');
      const { data } = await supabase
        .from('cities')
        .select('fips_code, name, state, state_code, population, slug')
        .or(orFilter)
        .order('population', { ascending: false })
        .limit(6);
      if (data) {
        setResults(data);
        setOpen(data.length > 0);
        setActiveIndex(-1);
      }
    };

    const timer = setTimeout(search, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (city: CityResult) => {
    onSelect(city);
    setQuery('');
    setResults([]);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      handleSelect(results[activeIndex]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  if (selected) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'var(--color-bg-glass)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)', padding: '12px 16px',
        minHeight: '56px',
      }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1rem' }}>{selected.name}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-tertiary)' }}>
            {selected.state_code} · {formatNumber(selected.population)}
          </div>
        </div>
        <button
          onClick={onRemove}
          style={{
            background: 'rgba(239, 68, 68, 0.15)', border: 'none', borderRadius: '50%',
            width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#ef4444', transition: 'all 0.2s',
          }}
          onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(239, 68, 68, 0.3)')}
          onMouseOut={(e) => (e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)')}
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div
        onClick={() => inputRef.current?.focus()}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          background: 'var(--color-bg-glass)',
          border: focused ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
          boxShadow: focused ? '0 0 0 2px rgba(6, 214, 160, 0.15)' : 'none',
          borderRadius: 'var(--radius-lg)', padding: '12px 16px',
          minHeight: '56px', cursor: 'text', transition: 'border 0.2s, box-shadow 0.2s',
        }}
      >
        <Search size={16} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
        <input
          ref={inputRef}
          type="text"
          className="no-focus-ring"
          placeholder={placeholder || 'Search a city...'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { setFocused(true); results.length > 0 && setOpen(true); }}
          onBlur={() => setFocused(false)}
          style={{
            background: 'transparent', border: 'none', outline: 'none',
            color: 'var(--color-text-primary)', fontSize: '0.95rem',
            width: '100%', fontFamily: 'inherit', paddingLeft: '2px',
          }}
        />
      </div>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          marginTop: '4px', background: 'var(--color-bg-card)',
          border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-xl)', overflow: 'hidden',
        }}>
          {results.map((city, idx) => (
            <div
              key={city.fips_code}
              onClick={() => handleSelect(city)}
              onMouseEnter={() => setActiveIndex(idx)}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 16px', cursor: 'pointer',
                background: idx === activeIndex ? 'rgba(139, 92, 246, 0.1)' : 'transparent',
                transition: 'background 0.15s',
              }}
            >
              <div>
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{city.name}</span>
                <span style={{ color: 'var(--color-text-tertiary)', fontSize: '0.85rem' }}>, {city.state_code}</span>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--color-text-tertiary)' }}>
                {formatNumber(city.population)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
