
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

import {
  Screen,
  Button,
  Card,
  ErrorNote,
  Loading,
} from '@/components/ui';

import { api, poll } from '@/lib/api';
import { ApiError, ERROR_TEXT } from '@/lib/types';

export default function ScanPage() {
  const router = useRouter();

  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [partner, setPartner] = useState('');
  const [pendingConnectionId, setPendingConnectionId] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [message, setMessage] = useState('');

  const scannerRef = useRef<{ clear: () => Promise<void> } | null>(null);
  const scannedRef = useRef(false);

  const handleScan = useCallback(async (value: string) => {
    if (scannedRef.current) return;

    scannedRef.current = true;
    setBusy(true);
    setError(null);
    setMessage('');

    try {
      const result = await api.scan(value);

      if (result.status === 'active') {
        router.push(`/c/${result.connection_id}`);
        return;
      }

      setPartner(result.partner_display_name);
      setPendingConnectionId(result.connection_id);
      setWaiting(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err);
      } else {
        setMessage('Something went wrong. Please try again.');
      }

      scannedRef.current = false;
    } finally {
      setBusy(false);
    }
  }, [router]);

  async function handleManualSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!/^\d{6}$/.test(code)) {
      setMessage('Please enter a valid 6-digit code.');
      return;
    }

    await handleScan(code);
  }

  async function handleCancel() {
    if (!pendingConnectionId || cancelBusy) return;

    setCancelBusy(true);
    setError(null);

    try {
      await api.cancelPending(pendingConnectionId);
      setWaiting(false);
      router.push('/');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err);
      } else {
        setMessage('Could not cancel. Please try again.');
      }
    } finally {
      setCancelBusy(false);
    }
  }

  useEffect(() => {
    if (!cameraOn || waiting) return;

    let scanner: { clear: () => Promise<void> } | null = null;
    let cancelled = false;

    async function startCamera() {
      try {
        const { Html5QrcodeScanner } = await import('html5-qrcode');

        if (cancelled) return;

        const newScanner = new Html5QrcodeScanner(
          'qr-reader',
          {
            fps: 10,
            qrbox: { width: 230, height: 230 },
            showTorchButtonIfSupported: true,
          },
          false,
        );

        scanner = newScanner;
        scannerRef.current = newScanner;

        newScanner.render(
          (decodedText) => {
            void newScanner.clear();
            setCameraOn(false);
            void handleScan(decodedText);
          },
          () => {},
        );
      } catch {
        setMessage(
          'Camera could not start. Check your browser permission or enter the code manually.',
        );
      }
    }

    void startCamera();

    return () => {
      cancelled = true;

      if (scanner) {
        void scanner.clear().catch(() => {});
      }

      scannerRef.current = null;
    };
  }, [cameraOn, waiting, handleScan]);

  useEffect(() => {
    if (!waiting) return;

    const stopPolling = poll(
      api.me,
      3000,
      (data) => {
        if (data.active_connection) {
          router.push(`/c/${data.active_connection.connection_id}`);
        } else if (!data.pending_connection) {
          router.push('/');
        }
      },
      (err) => setError(err),
    );

    return stopPolling;
  }, [waiting, router]);

  if (waiting) {
    return (
      <Screen title="Waiting">
        <Card className="space-y-4 text-center">
          <h2 className="font-heading text-2xl text-forest">
            Waiting for {partner}
          </h2>

          <p className="text-forest/60">
            Ask them to scan your QR code back.
          </p>

          <Loading />
        </Card>

        {error && <ErrorNote error={error} />}

        {message && (
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">
            {message}
          </p>
        )}

        <Button
          full
          variant="secondary"
          busy={cancelBusy}
          disabled={cancelBusy}
          onClick={handleCancel}
        >
          {cancelBusy ? 'Cancelling...' : 'Cancel connection'}
        </Button>
      </Screen>
    );
  }

  return (
    <Screen title="Scan someone">
      <p className="text-sm text-forest/60">
        Scan another guest's QR code or enter their six-digit code.
      </p>

      <Card className="space-y-4">
        <div id="qr-reader" />

        {!cameraOn && (
          <Button full onClick={() => {
            setMessage('');
            setCameraOn(true);
          }}>
            Open camera
          </Button>
        )}

        {cameraOn && (
          <Button
            full
            variant="secondary"
            onClick={() => setCameraOn(false)}
          >
            Close camera
          </Button>
        )}

        <p className="text-xs text-forest/50">
          Camera access requires permission. If it doesn't work, use manual entry below.
        </p>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-heading text-xl text-forest">
          Enter code manually
        </h2>

        <form onSubmit={handleManualSubmit} className="space-y-3">
          <input
            value={code}
            onChange={(event) => {
              setCode(event.target.value.replace(/\D/g, '').slice(0, 6));
              setMessage('');
            }}
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            className="w-full min-h-14 rounded-xl border border-forest/20 bg-white px-4 text-center text-2xl tracking-[0.4em] text-forest outline-none focus:border-bronze"
          />

          <Button full type="submit" disabled={busy || code.length !== 6}>
            {busy ? 'Checking...' : 'Submit code'}
          </Button>
        </form>
      </Card>

      {error && <ErrorNote error={error} />}

      {message && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">
          {message}
        </p>
      )}

      <Button
        full
        variant="secondary"
        onClick={() => router.push('/')}
      >
        Back home
      </Button>
    </Screen>
  );
}
