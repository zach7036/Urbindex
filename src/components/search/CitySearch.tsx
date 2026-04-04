'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatNumber, getCityUrl } from '@/lib/utils';
import { getSupabaseSearchPatterns } from '@/lib/search-utils';

interface SearchResult {
  fips_code: string;
  name: string;
  state: string;
  state_code: string;
  population: number;
  slug: string;
}

interface CitySearchProps {
  onSelect?: () => void;
  autoFocus?: boolean;
  large?: boolean;
}

export default function CitySearch({ onSelect, autoFocus, large }: CitySearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [open, setOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }

    const searchCities = async () => {
      setIsSearching(true);
      const patterns = getSupabaseSearchPatterns(trimmed);
      
      // Build OR query for all search variants
      const orFilter = patterns.map(p => `name.ilike.${p}`).join(',');
      
      const { data, error } = await supabase
        .from('cities')
        .select('fips_code, name, state, state_code, population, slug')
        .or(orFilter)
        .order('population', { ascending: false })
        .limit(8);

      if (!error && data) {
        setResults(data);
        setOpen(data.length > 0);
        setActiveIndex(-1);
      }
      setIsSearching(false);
    };

    const timer = setTimeout(searchCities, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const navigateToCity = (city: SearchResult) => {
    const url = getCityUrl(city.state_code, city.slug);
    router.push(url);
    setOpen(false);
    setQuery('');
    onSelect?.();
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
      navigateToCity(results[activeIndex]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div className="search-container">
      <div className="search-input-wrapper">
        <Search
          size={large ? 20 : 16}
          className="search-icon"
        />
        <input
          ref={inputRef}
          type="text"
          className="search-input"
          placeholder="Search any US city..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setOpen(true)}
          style={large ? {
            padding: '18px 24px 18px 52px',
            fontSize: '1.15rem',
            borderRadius: '16px',
          } : undefined}
        />
      </div>

      {open && (
        <div className="search-results">
          {results.map((city, idx) => (
            <div
              key={city.fips_code}
              className={`search-result-item ${idx === activeIndex ? 'active' : ''}`}
              onClick={() => navigateToCity(city)}
              onMouseEnter={() => setActiveIndex(idx)}
            >
              <div>
                <span className="search-result-name">{city.name}</span>
                <span className="search-result-state">, {city.state}</span>
              </div>
              <span className="search-result-pop">
                {formatNumber(city.population)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
