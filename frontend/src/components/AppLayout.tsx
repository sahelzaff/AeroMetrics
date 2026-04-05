import type { PropsWithChildren } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { to: '/blueprints', label: 'Blueprints', icon: 'architecture' },
  { to: '/tests', label: 'Take Test', icon: 'quiz' },
  { to: '/results', label: 'Results', icon: 'analytics' },
  { to: '/question-bank', label: 'Question Bank', icon: 'database' },
  { to: '/import', label: 'Import', icon: 'upload_file' },
];

export function AppLayout({ children }: PropsWithChildren) {
  const { user, logout } = useAuth();

  return (
    <div className="surface-base min-h-screen text-[var(--on-surface)]">
      <aside className="surface-low fixed left-0 top-0 z-40 hidden h-screen w-64 flex-col p-4 md:flex">
        <div className="mb-8 px-2">
          <h1 className="headline-tight text-2xl font-extrabold text-[var(--primary)]">AeroMetrics</h1>
          <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--on-surface-variant)]">Measure. Improve. Master.</p>
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
        <header className="frosted sticky top-0 z-30 flex h-16 items-center justify-between border-b ghost-separator px-4 md:px-8">
          <Link to="/dashboard" className="text-sm font-bold uppercase tracking-[0.16em] text-[var(--on-surface-variant)]">
            Weekly Skill Lab
          </Link>
          <div className="hidden items-center gap-2 md:flex">
            <button type="button" className="btn-secondary px-3 py-1.5">Drafts</button>
            <button type="button" className="btn-secondary px-3 py-1.5">Archive</button>
          </div>
        </header>

        <main className="px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
