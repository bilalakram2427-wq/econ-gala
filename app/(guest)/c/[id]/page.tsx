
'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import {
  Screen,
  Button,
  Card,
  Loading,
} from '@/components/ui';

import { api, poll } from '@/lib/api';
import { ApiError, ERROR_TEXT, type ActiveConnection, type Vote, type SubmitResponse } from '@/lib/types';

export default function ConversationPage() {
  const router = useRouter();
  const params = useParams();
  const connectionId = params.id as string;

  const idempotencyKey = useRef('');

  const [connection, setConnection] = useState<ActiveConnection | null>(null);
  const [learnedText, setLearnedText] = useState('');
  const [vote, setVote] = useState<Vote | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [serverOffset, setServerOffset] = useState(0);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [result, setResult] = useState<SubmitResponse | null>(null);
  const [error, setError] = useState('');

  // Generate the key once when the screen opens.
  useEffect(() => {
    idempotencyKey.current = crypto.randomUUID();
  }, []);

  // Get the active conversation and keep checking for updates.
  useEffect(() => {
    const stopPolling = poll(
      api.me,
      3000,
      (data) => {
        setServerOffset(
          new Date(data.server_time).getTime() - Date.now()
        );

        if (data.active_connection?.connection_id === connectionId) {
          setConnection(data.active_connection);

          if (data.active_connection.i_submitted) {
            setSubmitted(true);
          }
        } else if (submitted) {
          setCompleted(true);
        } else if (!data.active_connection) {
          router.push('/');
        }

        setLoading(false);
      },
      () => setError(ERROR_TEXT.NETWORK),
    );

    return stopPolling;
  }, [connectionId, router, submitted]);

  // Update the countdown every second.
  useEffect(() => {
    if (!connection || submitted) return;

    const updateCountdown = () => {
      const endTime =
        new Date(connection.started_at).getTime() +
        connection.min_chat_seconds * 1000;

      const remaining = Math.ceil(
        (endTime - (Date.now() + serverOffset)) / 1000
      );

      setSecondsLeft(Math.max(0, remaining));
    };

    updateCountdown();

    const timer = setInterval(updateCountdown, 1000);

    return () => clearInterval(timer);
  }, [connection, serverOffset, submitted]);

  async function handleSubmit() {
    if (
      !connection ||
      !vote ||
      secondsLeft > 0 ||
      learnedText.trim().length < 15 ||
      learnedText.trim().length > 140 ||
      busy ||
      !idempotencyKey.current
    ) {
      return;
    }

    setBusy(true);
    setError('');

    try {
      const response = await api.submit({
        connection_id: connection.connection_id,
        learned_text: learnedText.trim(),
        vote,
        idempotency_key: idempotencyKey.current,
      });

      setResult(response);
      setSubmitted(true);

      if (response.status === 'completed') {
        setCompleted(true);
      }
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

  if (loading) {
    return <Loading />;
  }

  if (completed) {
    return (
      <Screen title="Conversation complete">
        <Card className="space-y-4 text-center">
          <h2 className="font-heading text-2xl text-forest">
            Great job!
          </h2>

          <p className="text-forest/70">
            Your conversation has been completed.
          </p>

          {result?.status === 'completed' && (
            <>
              <p className="text-forest">
                Points earned: {result.points_awarded}
              </p>
              <p className="text-forest">
                Your total: {result.new_total}
              </p>
            </>
          )}

          <Button full onClick={() => router.push('/')}>
            Back home
          </Button>
        </Card>
      </Screen>
    );
  }

  if (submitted) {
    return (
      <Screen title="Almost there">
        <Card className="space-y-4 text-center">
          <h2 className="font-heading text-2xl text-forest">
            Waiting for {connection?.partner_display_name}
          </h2>

          <p className="text-forest/70">
            You've submitted your response. Your connection will be completed
            when the other person submits theirs.
          </p>

          <Loading />
        </Card>
      </Screen>
    );
  }

  if (!connection) {
    return <Loading />;
  }

  const textLength = learnedText.trim().length;
  const validText = textLength >= 15 && textLength <= 140;
  const canSubmit = secondsLeft === 0 && validText && vote !== null && !busy;

  return (
    <Screen title="Conversation">
      <Card className="space-y-2">
        <p className="text-sm text-forest/60">
          You're connected with
        </p>

        <h2 className="font-heading text-2xl text-forest">
          {connection.partner_display_name}
        </h2>

        <p className="text-sm text-forest/60">
          Take some time to get to know each other!
        </p>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-heading text-xl text-forest">
          Conversation starters
        </h2>

        <p className="text-sm text-forest/60">
          Pick any of these topics to get started:
        </p>

        {connection.starters.map((starter, index) => (
          <div
            key={index}
            className="rounded-xl bg-forest/5 p-3 text-forest"
          >
            {starter}
          </div>
        ))}
      </Card>

      <Card className="space-y-3 text-center">
        <h2 className="font-heading text-xl text-forest">
          Keep talking!
        </h2>

        {secondsLeft > 0 ? (
          <>
            <p className="text-sm text-forest/60">
              You can submit after the minimum chat time.
            </p>

            <p className="text-4xl font-semibold text-bronze">
              {Math.floor(secondsLeft / 60)}:
              {String(secondsLeft % 60).padStart(2, '0')}
            </p>
          </>
        ) : (
          <p className="text-forest">
            Minimum chat time completed!
          </p>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-heading text-xl text-forest">
          What did you learn about them?
        </h2>

        <textarea
          value={learnedText}
          onChange={(event) =>
            setLearnedText(event.target.value.slice(0, 140))
          }
          placeholder="Write something interesting you learned..."
          maxLength={140}
          rows={4}
          className="w-full rounded-xl border border-forest/20 bg-white p-3 text-forest outline-none focus:border-bronze"
        />

        <p className="text-right text-sm text-forest/60">
          {textLength}/140 characters (minimum 15)
        </p>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-heading text-xl text-forest">
          How was your connection?
        </h2>

        <div className="grid grid-cols-2 gap-3">
          <Button
            full
            variant={vote === 'great' ? 'primary' : 'secondary'}
            onClick={() => setVote('great')}
          >
            Great!
          </Button>

          <Button
            full
            variant={vote === 'skip' ? 'primary' : 'secondary'}
            onClick={() => setVote('skip')}
          >
            Skip
          </Button>
        </div>
      </Card>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <Button
        full
        disabled={!canSubmit}
        busy={busy}
        onClick={handleSubmit}
      >
        {busy ? 'Submitting...' : 'Submit conversation'}
      </Button>
    </Screen>
  );
}

