import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../api/client';
import { useAuth } from '../context/AuthContext';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'login') {
        await login(form.email, form.password);
      } else {
        await register(form.email, form.password, form.name);
      }
      navigate('/dashboard');
    } catch {
      setError('Incorrect Email ID or Password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen w-full overflow-hidden">
      <section className="hidden w-1/2 flex-col justify-between overflow-hidden p-12 text-white lg:flex" style={{ backgroundImage: 'linear-gradient(135deg, #0058be 0%, #2170e4 100%)' }}>
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white">
              <span className="material-symbols-outlined text-[var(--primary)]">flight</span>
            </div>
            <span className="text-2xl font-extrabold tracking-tight">AeroMetrics</span>
          </div>
        </div>

        <div className="relative z-10 max-w-lg">
          <h1 className="headline-tight mb-6 text-5xl font-extrabold leading-tight">Practice Smarter, Perform Better</h1>
          <p className="mb-10 max-w-sm text-lg font-medium text-white/80">
            Precision-engineered platform to master DGCA exams with measurable progress.
          </p>
          <div className="frosted rounded-xl p-5 text-white shadow-[0px_4px_20px_rgba(25,28,29,0.2)]">
            <p className="text-sm font-bold bg-gradient-to-r from-[#0058be] to-[#2170e4] bg-clip-text text-transparent">
              Real-time Analytics
            </p>

            <p className="text-sm font-bold bg-gradient-to-r from-[#0058be] to-[#2170e4] bg-clip-text text-transparent">
              Track your performance with architectural precision.
            </p>
          </div>
        </div>

        <p className="text-sm text-white/70">© 2026 TestFlow. Built for precision.</p>
      </section>

      <section className="flex w-full items-center justify-center p-6 lg:w-1/2 lg:p-12">
        <div className="w-full max-w-[420px]">
          <div className="mb-7 flex items-center justify-center gap-3 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--primary)] text-white">
              <span className="material-symbols-outlined text-lg">architecture</span>
            </div>
            <span className="text-xl font-extrabold tracking-tight">TestFlow</span>
          </div>

          <div className="card p-8">
            <div className="mb-8 flex gap-6 border-b ghost-separator">
              <button
                type="button"
                onClick={() => setMode('login')}
                className={`pb-3 text-sm font-semibold ${mode === 'login' ? 'border-b-2 border-[var(--primary)] text-[var(--on-surface)]' : 'text-[var(--on-surface-variant)]'}`}
              >
                Login
              </button>
              <button
                type="button"
                onClick={() => setMode('register')}
                className={`pb-3 text-sm font-semibold ${mode === 'register' ? 'border-b-2 border-[var(--primary)] text-[var(--on-surface)]' : 'text-[var(--on-surface-variant)]'}`}
              >
                Sign Up
              </button>
            </div>

            <form className="space-y-5" onSubmit={onSubmit}>
              {mode === 'register' ? (
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.1em] text-[var(--on-surface-variant)]">Name</label>
                  <input
                    className="input"
                    placeholder="Your name"
                    value={form.name}
                    onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  />
                </div>
              ) : null}

              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-[0.1em] text-[var(--on-surface-variant)]">Email Address</label>
                <input
                  className="input"
                  type="email"
                  placeholder="name@example.com"
                  value={form.email}
                  onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                  required
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-[0.1em] text-[var(--on-surface-variant)]">Password</label>
                  <button type="button" className="text-xs font-semibold text-[var(--primary)]">Forgot password?</button>
                </div>
                <input
                  className="input"
                  type="password"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                  required
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-[var(--on-surface-variant)]">
                <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
                Remember me
              </label>

              {error ? <p className="text-sm text-[var(--error)]">{error}</p> : null}

              <button className="btn-primary w-full py-3 font-bold" type="submit" disabled={loading}>
                {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            </form>

            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t ghost-separator" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="surface-card px-3 text-[var(--on-surface-variant)]">Or continue with</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <a href={`${API_BASE_URL}/auth/google`} className="btn-secondary flex items-center justify-center gap-2 py-2.5">
                <span className="material-symbols-outlined text-lg">public</span>
                <span>Google</span>
              </a>
              <button type="button" className="btn-secondary py-2.5" disabled>
                GitHub
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
