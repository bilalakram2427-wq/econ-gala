
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Screen, Button } from '@/components/ui';
import { auth } from '@/lib/api';
import { normalizeRegNo } from '@/lib/config';
import { ApiError, ERROR_TEXT } from '@/lib/types';

export default function LoginPage() {
  const router = useRouter();

  const [regNo, setRegNo] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!regNo.trim() || !password) {
      setError('Please enter your registration number and password.');
      return;
    }

    setBusy(true);
    setError('');

    try {
      await auth.login(normalizeRegNo(regNo), password);
      router.push('/');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(ERROR_TEXT[err.code]);
      } else {
        setError(ERROR_TEXT.UNKNOWN);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Econ Gala">
      <div className="space-y-2">
        <h2 className="font-heading text-2xl text-forest">
          Welcome!
        </h2>
        <p className="text-forest/60">
          Log in to join the networking game.
        </p>
      </div>

      <form onSubmit={handleLogin} className="space-y-5">
        <div className="space-y-2">
          <label
            htmlFor="regNo"
            className="block text-sm font-medium text-forest"
          >
            Registration Number
          </label>

          <input
            id="regNo"
            type="text"
            value={regNo}
            onChange={(event) => setRegNo(event.target.value)}
            placeholder="e.g. FA24-BED-001"
            autoComplete="username"
            required
            className="w-full min-h-12 rounded-xl border border-forest/20 bg-white px-4 text-forest outline-none focus:border-bronze"
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="password"
            className="block text-sm font-medium text-forest"
          >
            Password
          </label>

          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter your password"
            autoComplete="current-password"
            required
            className="w-full min-h-12 rounded-xl border border-forest/20 bg-white px-4 text-forest outline-none focus:border-bronze"
          />
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-xl bg-red-50 p-3 text-sm text-red-800"
          >
            {error}
          </p>
        )}

        <Button type="submit" full busy={busy}>
          {busy ? 'Logging in...' : 'Login'}
        </Button>
      </form>
    </Screen>
  );
}
