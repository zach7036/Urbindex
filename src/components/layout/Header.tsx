'use client';

import Link from 'next/link';
import { Search } from 'lucide-react';
import { useState } from 'react';
import CitySearch from '@/components/search/CitySearch';

export default function Header() {
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <header className="header">
      <div className="header-inner">
        <Link href="/" className="header-logo">
          <div className="header-logo-icon">U</div>
          Urbindex
        </Link>

        <nav className="header-nav">
          <Link href="/">Home</Link>
          <Link href="/explore">Explore</Link>
          <Link href="/compare">Compare</Link>
          <button
            onClick={() => setSearchOpen(!searchOpen)}
            className="header-search-btn"
          >
            <Search size={14} />
            Search cities...
          </button>
        </nav>
      </div>

      {searchOpen && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(8px)',
          zIndex: 2000,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          paddingTop: '120px',
        }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setSearchOpen(false);
          }}
        >
          <div style={{ width: '100%', maxWidth: '640px', padding: '0 24px' }}>
            <CitySearch onSelect={() => setSearchOpen(false)} autoFocus />
          </div>
        </div>
      )}
    </header>
  );
}
