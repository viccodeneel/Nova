import React, { useState } from 'react';
import { ApiClient } from '../services/apiClient';

interface LoginScreenProps {
  onAuthenticated: (token: string) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onAuthenticated }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      onAuthenticated(await ApiClient.login(password));
      setPassword('');
    } catch (loginError) {
      setError((loginError as Error).message || 'Could not reach the NOVA sign-in service.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#08090d] text-slate-100 flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#11141e] p-8 shadow-2xl">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-purple-600/20 text-purple-300">
            <span className="material-symbols-outlined">lock</span>
          </div>
          <h1 className="text-xl font-bold text-white">Sign in to NOVA</h1>
          <p className="mt-2 text-sm text-slate-400">Enter your private dashboard password.</p>
        </div>
        <label htmlFor="nova-password" className="mb-2 block text-xs font-medium text-slate-300">Password</label>
        <input
          id="nova-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-lg border border-white/10 bg-[#08090d] px-3 py-3 text-sm text-white outline-none focus:border-purple-500"
        />
        {error && <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}
        <button
          type="submit"
          disabled={submitting || !password}
          className="mt-5 w-full rounded-lg bg-purple-600 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
};
