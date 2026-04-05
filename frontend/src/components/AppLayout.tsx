import type { PropsWithChildren } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NavLink, useNavigate } from 'react-router-dom';
import { api, authHeaders } from '../api/client';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { to: '/blueprints', label: 'Blueprints', icon: 'architecture' },
  { to: '/tests', label: 'Take Test', icon: 'quiz' },
  { to: '/results', label: 'Results', icon: 'analytics' },
  { to: '/question-bank', label: 'Question Bank', icon: 'database' },
  { to: '/import', label: 'Import', icon: 'upload_file' },
];

type SearchResult = {
  id: string;
  type: 'test' | 'question' | 'user' | 'attempt' | 'analytics' | 'action';
  title: string;
  description?: string;
  route: string;
  score: number;
};

type SearchResponse = {
  results: SearchResult[];
  grouped: {
    tests: SearchResult[];
    users: SearchResult[];
    questions: SearchResult[];
    attempts: SearchResult[];
    analytics: SearchResult[];
    actions: SearchResult[];
  };
};

function typeBadge(type: SearchResult['type']) {
  switch (type) {
    case 'action':
      return 'bg-blue-100 text-blue-700';
    case 'test':
      return 'bg-indigo-100 text-indigo-700';
    case 'question':
      return 'bg-amber-100 text-amber-700';
    case 'attempt':
      return 'bg-emerald-100 text-emerald-700';
    case 'analytics':
      return 'bg-purple-100 text-purple-700';
    case 'user':
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

export function AppLayout({ children }: PropsWithChildren) {
  const { user, logout, accessToken } = useAuth();
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const searchShellRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(searchInput.trim());
    }, 180);

    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!searchShellRef.current?.contains(event.target as Node)) {
        setIsFocused(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const searchQuery = useQuery({
    queryKey: ['global-search', debouncedQuery],
    queryFn: async () => {
      const { data } = await api.get<SearchResponse>('/search', {
        params: { q: debouncedQuery, limit: 12 },
        headers: authHeaders(accessToken),
      });
      return data;
    },
    enabled: debouncedQuery.length > 0,
    staleTime: 10_000,
  });

  const showDropdown = isFocused && debouncedQuery.length > 0;

  const handleSelectResult = async (item: SearchResult) => {
    try {
      await api.post(
        '/search/track-select',
        {
          id: item.id,
          type: item.type,
          title: item.title,
          route: item.route,
          query: debouncedQuery,
        },
        { headers: authHeaders(accessToken) },
      );
    } catch {
      // Keep navigation responsive even if tracking fails.
    }

    setIsFocused(false);
    setSearchInput('');
    setDebouncedQuery('');
    navigate(item.route);
  };

  return (
    <div className="surface-base min-h-screen text-[var(--on-surface)]">
      <aside className="surface-low fixed left-0 top-0 z-40 hidden h-screen w-64 flex-col p-4 md:flex">
        <div className="mb-8 px-2">
          <h1 className="headline-tight text-2xl font-extrabold text-[var(--primary)]">Blueprint Pro</h1>
          <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--on-surface-variant)]">Architectural Minimalist</p>
        </div>

        <nav className="space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? 'bg-white text-[var(--primary)] soft-shadow'
                    : 'text-[var(--on-surface-variant)] hover:bg-white/70'
                }`
              }
            >
              <span className="material-symbols-outlined">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto rounded-xl bg-white/70 p-3">
          <p className="truncate text-xs font-bold text-[var(--on-surface)]">{user?.email}</p>
          <button type="button" className="btn-secondary mt-3 w-full" onClick={() => void logout()}>
            Sign Out
          </button>
        </div>
      </aside>

      <div className="md:ml-64">
        <header className="fixed left-0 right-0 top-0 z-30 h-16 border-b border-slate-200/20 bg-white/80 px-4 backdrop-blur-xl md:left-64 md:px-8">
          <div className="mx-auto flex h-full w-full max-w-7xl items-center justify-between">
            <div ref={searchShellRef} className="relative flex-1">
              <div className="relative w-full max-w-md group">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
                <input
                  type="text"
                  className="w-full rounded-xl border-none bg-[var(--surface-low)] pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                  placeholder="Search tests, students, or analytics..."
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  onFocus={() => setIsFocused(true)}
                />
              </div>

              {showDropdown ? (
                <div className="absolute left-0 top-[calc(100%+10px)] z-50 w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl">
                  {searchQuery.isLoading ? (
                    <div className="px-3 py-4 text-sm text-slate-500">Searching...</div>
                  ) : searchQuery.data?.results?.length ? (
                    <div className="max-h-[380px] overflow-auto">
                      {searchQuery.data.results.map((item) => (
                        <button
                          key={`${item.type}:${item.id}`}
                          type="button"
                          onClick={() => void handleSelectResult(item)}
                          className="flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-[var(--surface-low)]"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-slate-800">{item.title}</p>
                            {item.description ? <p className="truncate text-xs text-slate-500">{item.description}</p> : null}
                          </div>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] ${typeBadge(item.type)}`}>
                            {item.type}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="px-3 py-4 text-sm text-slate-500">No results found.</div>
                  )}
                </div>
              ) : null}
            </div>

            <div className="flex items-center gap-4">
              <button className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-[var(--surface-high)]">
                <span className="material-symbols-outlined">notifications</span>
              </button>
              <button className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-[var(--surface-high)]">
                <span className="material-symbols-outlined">help_outline</span>
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 pb-12 pt-24 md:px-8">{children}</main>
      </div>
    </div>
  );
}
