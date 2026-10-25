import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import {
  LogOut,
  Timer,
  ExternalLink,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Sliders,
  Flame,
  Repeat,
  Clock,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { WORKOUT_SESSION_DOC } from '../firebase';
import type { WorkoutMode, WorkoutState } from '../types/workout';

const MODE_TABS: { id: WorkoutMode; label: string; subtitle: string; icon: React.ReactNode }[] = [
  {
    id: 'FOR_TIME',
    label: 'For Time',
    subtitle: 'Counts UP from 00:00 to Time Cap',
    icon: <Flame className="w-4 h-4" />,
  },
  {
    id: 'AMRAP',
    label: 'AMRAP',
    subtitle: 'Counts DOWN from Total Time to 00:00',
    icon: <Repeat className="w-4 h-4" />,
  },
  {
    id: 'EMOM',
    label: 'EMOM',
    subtitle: 'Every Minute on the Minute intervals',
    icon: <Clock className="w-4 h-4" />,
  },
];

function formatDuration(totalSeconds: number | undefined): string {
  if (totalSeconds === undefined || totalSeconds <= 0) return '00:00';
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Wraps a Firestore write promise with a timeout so it rejects instead of hanging
 * indefinitely when Firestore is unreachable or not yet created in the Firebase Console.
 */
async function withFirestoreTimeout<T>(
  operation: Promise<T>,
  operationName: string,
  timeoutMs = 8000
): Promise<T> {
  let timeoutId: number | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(
        new Error(
          `Firestore "${operationName}" timed out after ${timeoutMs / 1000}s. Verify that Cloud Firestore is created in your Firebase Console (Build -> Firestore Database) and security rules allow read/write.`
        )
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  }
}

export const Setup: React.FC = () => {
  const { user, signOut } = useAuth();

  // Form state for configuring a workout
  const [selectedMode, setSelectedMode] = useState<WorkoutMode>('FOR_TIME');

  // For Time inputs (Time Cap: Minutes & Seconds)
  const [forTimeMinutes, setForTimeMinutes] = useState<number>(12);
  const [forTimeSeconds, setForTimeSeconds] = useState<number>(0);

  // AMRAP inputs (Total Time: Minutes & Seconds)
  const [amrapMinutes, setAmrapMinutes] = useState<number>(15);
  const [amrapSeconds, setAmrapSeconds] = useState<number>(0);

  // EMOM input (Total Minutes)
  const [emomMinutes, setEmomMinutes] = useState<number>(10);

  // Live synced state from Firestore (sessions/current)
  const [liveWorkout, setLiveWorkout] = useState<WorkoutState | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  useEffect(() => {
    const unsubscribe = onSnapshot(
      WORKOUT_SESSION_DOC,
      (snapshot) => {
        if (snapshot.exists()) {
          setLiveWorkout(snapshot.data() as WorkoutState);
        } else {
          setLiveWorkout(null);
        }
      },
      (err) => {
        console.error('Firestore listener error on sessions/current:', err);
        setFeedback({
          type: 'error',
          message: `Firestore sync error: ${err.message}`,
        });
      }
    );

    return () => unsubscribe();
  }, []);

  const showTemporarySuccess = (message: string) => {
    setFeedback({ type: 'success', message });
    window.setTimeout(() => {
      setFeedback((prev) => (prev?.message === message ? null : prev));
    }, 3000);
  };

  // Write the chosen workout configuration to Firestore (sessions/current)
  const handleSetWorkout = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    let newWorkoutState: WorkoutState;

    if (selectedMode === 'FOR_TIME') {
      const totalCapSeconds = Math.max(0, forTimeMinutes * 60 + forTimeSeconds);
      if (totalCapSeconds <= 0) {
        setFeedback({ type: 'error', message: 'Please enter a Time Cap greater than 0 seconds.' });
        return;
      }
      newWorkoutState = {
        mode: 'FOR_TIME',
        config: { timeCapSeconds: totalCapSeconds },
        status: 'IDLE',
        startTimestamp: null,
        pausedElapsedMs: 0,
      };
    } else if (selectedMode === 'AMRAP') {
      const totalAmrapSeconds = Math.max(0, amrapMinutes * 60 + amrapSeconds);
      if (totalAmrapSeconds <= 0) {
        setFeedback({
          type: 'error',
          message: 'Please enter a Total Time greater than 0 seconds.',
        });
        return;
      }
      newWorkoutState = {
        mode: 'AMRAP',
        config: { totalTimeSeconds: totalAmrapSeconds },
        status: 'IDLE',
        startTimestamp: null,
        pausedElapsedMs: 0,
      };
    } else {
      const totalEmomMins = Math.max(0, Math.floor(emomMinutes));
      if (totalEmomMins <= 0) {
        setFeedback({
          type: 'error',
          message: 'Please enter at least 1 minute for EMOM.',
        });
        return;
      }
      newWorkoutState = {
        mode: 'EMOM',
        config: { emomTotalMinutes: totalEmomMins },
        status: 'IDLE',
        startTimestamp: null,
        pausedElapsedMs: 0,
      };
    }

    setIsSyncing(true);
    try {
      await withFirestoreTimeout(
        setDoc(WORKOUT_SESSION_DOC, newWorkoutState),
        'setDoc(sessions/current)'
      );
      setLiveWorkout(newWorkoutState);
      showTemporarySuccess('Workout configuration synced to floor timer (IDLE).');
    } catch (err: unknown) {
      console.error('Firestore Error setting workout configuration:', err);
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to write workout to Firestore.',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Start or Resume the active workout in Firestore
  const handleStart = async () => {
    if (!liveWorkout) {
      setFeedback({
        type: 'error',
        message: 'Set a workout configuration first before starting the timer.',
      });
      return;
    }

    setIsSyncing(true);
    setFeedback(null);
    try {
      const now = Date.now();
      // When starting fresh from IDLE/FINISHED, schedule startTimestamp 3 seconds ahead for the 3-2-1 countdown.
      // When resuming from PAUSED, offset startTimestamp by pausedElapsedMs so elapsed time continues seamlessly.
      const isResuming = liveWorkout.status === 'PAUSED' && (liveWorkout.pausedElapsedMs ?? 0) > 0;
      const nextStartTimestamp = isResuming
        ? now - (liveWorkout.pausedElapsedMs ?? 0)
        : now + 3000;

      await withFirestoreTimeout(
        updateDoc(WORKOUT_SESSION_DOC, {
          status: 'RUNNING',
          startTimestamp: nextStartTimestamp,
          pausedElapsedMs: 0,
        }),
        'updateDoc(status: RUNNING)'
      );
      showTemporarySuccess(
        isResuming ? 'Timer resumed (RUNNING).' : '3-2-1 Countdown started (RUNNING).'
      );
    } catch (err: unknown) {
      console.error('Firestore Error starting workout:', err);
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to start timer.',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Pause the running workout in Firestore
  const handlePause = async () => {
    if (!liveWorkout || liveWorkout.status !== 'RUNNING') return;

    setIsSyncing(true);
    setFeedback(null);
    try {
      const elapsedMs = liveWorkout.startTimestamp
        ? Math.max(0, Date.now() - liveWorkout.startTimestamp)
        : 0;

      await withFirestoreTimeout(
        updateDoc(WORKOUT_SESSION_DOC, {
          status: 'PAUSED',
          pausedElapsedMs: elapsedMs,
          startTimestamp: null,
        }),
        'updateDoc(status: PAUSED)'
      );
      showTemporarySuccess('Timer paused (PAUSED).');
    } catch (err: unknown) {
      console.error('Firestore Error pausing workout:', err);
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to pause timer.',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Reset the workout back to IDLE with startTimestamp = null
  const handleReset = async () => {
    if (!liveWorkout) return;

    setIsSyncing(true);
    setFeedback(null);
    try {
      await withFirestoreTimeout(
        updateDoc(WORKOUT_SESSION_DOC, {
          status: 'IDLE',
          startTimestamp: null,
          pausedElapsedMs: 0,
        }),
        'updateDoc(status: IDLE)'
      );
      showTemporarySuccess('Timer reset to 00:00 (IDLE).');
    } catch (err: unknown) {
      console.error('Firestore Error resetting workout:', err);
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to reset timer.',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const renderLiveConfigSummary = (workout: WorkoutState) => {
    if (workout.mode === 'FOR_TIME') {
      return `For Time • Cap ${formatDuration(workout.config.timeCapSeconds)}`;
    }
    if (workout.mode === 'AMRAP') {
      return `AMRAP • ${formatDuration(workout.config.totalTimeSeconds)}`;
    }
    return `EMOM • ${workout.config.emomTotalMinutes ?? 0} Minutes`;
  };

  const statusBadgeColors: Record<WorkoutState['status'], string> = {
    IDLE: 'bg-zinc-800 text-zinc-300 border-zinc-700',
    RUNNING: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 animate-pulse',
    PAUSED: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    FINISHED: 'bg-red-500/20 text-red-300 border-red-500/40',
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6">
      {/* Top Navigation Header */}
      <header className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-yellow-400/10 border border-yellow-400/30 rounded-xl flex items-center justify-center">
            <Timer className="w-6 h-6 text-yellow-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Yaqbot Coach Dashboard</h1>
            <p className="text-xs text-zinc-400">
              Signed in as <span className="text-yellow-400 font-mono">{user?.email}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/timer"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs font-semibold flex items-center gap-2 transition"
          >
            <ExternalLink className="w-4 h-4 text-yellow-400" />
            Launch Floor Timer (/timer)
          </Link>
          <button
            type="button"
            onClick={signOut}
            className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-red-950/60 border border-zinc-800 hover:border-red-500/40 text-xs font-semibold text-zinc-300 hover:text-red-200 flex items-center gap-2 transition cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Content Grid */}
      <main className="max-w-5xl mx-auto mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Workout Configuration Form */}
        <section className="lg:col-span-7 bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
          <div className="flex items-center gap-2.5 mb-6">
            <Sliders className="w-5 h-5 text-yellow-400" />
            <h2 className="text-lg font-bold tracking-tight">1. Configure Workout Mode</h2>
          </div>

          {/* Mode Selector Tabs */}
          <div className="grid grid-cols-3 gap-2.5 p-1.5 bg-zinc-950 rounded-xl border border-zinc-800 mb-6">
            {MODE_TABS.map((tab) => {
              const isSelected = selectedMode === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSelectedMode(tab.id)}
                  className={`py-3 px-3 rounded-lg font-bold text-sm flex flex-col items-center justify-center gap-1 transition cursor-pointer ${
                    isSelected
                      ? 'bg-yellow-400 text-black shadow-md'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    {tab.icon}
                    <span>{tab.label}</span>
                  </div>
                </button>
              );
            })}
          </div>

          <p className="text-xs text-zinc-400 mb-6">
            {MODE_TABS.find((t) => t.id === selectedMode)?.subtitle}
          </p>

          <form onSubmit={handleSetWorkout} className="space-y-6">
            {/* FOR TIME INPUTS */}
            {selectedMode === 'FOR_TIME' && (
              <div className="p-5 rounded-xl bg-zinc-950/70 border border-zinc-800/80 space-y-4">
                <label className="block text-xs font-bold uppercase tracking-wider text-yellow-400">
                  For Time — Time Cap
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="forTimeMinutes"
                      className="block text-xs text-zinc-400 mb-1.5 font-medium"
                    >
                      Minutes
                    </label>
                    <input
                      id="forTimeMinutes"
                      type="number"
                      min={0}
                      max={180}
                      value={forTimeMinutes}
                      onChange={(e) => setForTimeMinutes(Math.max(0, Number(e.target.value)))}
                      className="w-full px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-700 focus:border-yellow-400 focus:outline-none text-2xl font-mono font-bold text-white"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="forTimeSeconds"
                      className="block text-xs text-zinc-400 mb-1.5 font-medium"
                    >
                      Seconds
                    </label>
                    <input
                      id="forTimeSeconds"
                      type="number"
                      min={0}
                      max={59}
                      value={forTimeSeconds}
                      onChange={(e) =>
                        setForTimeSeconds(Math.min(59, Math.max(0, Number(e.target.value))))
                      }
                      className="w-full px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-700 focus:border-yellow-400 focus:outline-none text-2xl font-mono font-bold text-white"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* AMRAP INPUTS */}
            {selectedMode === 'AMRAP' && (
              <div className="p-5 rounded-xl bg-zinc-950/70 border border-zinc-800/80 space-y-4">
                <label className="block text-xs font-bold uppercase tracking-wider text-yellow-400">
                  AMRAP — Total Time
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="amrapMinutes"
                      className="block text-xs text-zinc-400 mb-1.5 font-medium"
                    >
                      Minutes
                    </label>
                    <input
                      id="amrapMinutes"
                      type="number"
                      min={0}
                      max={180}
                      value={amrapMinutes}
                      onChange={(e) => setAmrapMinutes(Math.max(0, Number(e.target.value)))}
                      className="w-full px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-700 focus:border-yellow-400 focus:outline-none text-2xl font-mono font-bold text-white"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="amrapSeconds"
                      className="block text-xs text-zinc-400 mb-1.5 font-medium"
                    >
                      Seconds
                    </label>
                    <input
                      id="amrapSeconds"
                      type="number"
                      min={0}
                      max={59}
                      value={amrapSeconds}
                      onChange={(e) =>
                        setAmrapSeconds(Math.min(59, Math.max(0, Number(e.target.value))))
                      }
                      className="w-full px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-700 focus:border-yellow-400 focus:outline-none text-2xl font-mono font-bold text-white"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* EMOM INPUT */}
            {selectedMode === 'EMOM' && (
              <div className="p-5 rounded-xl bg-zinc-950/70 border border-zinc-800/80 space-y-4">
                <label className="block text-xs font-bold uppercase tracking-wider text-yellow-400">
                  EMOM — Total Minutes (Intervals)
                </label>
                <div>
                  <label
                    htmlFor="emomMinutes"
                    className="block text-xs text-zinc-400 mb-1.5 font-medium"
                  >
                    Total Minutes (1-minute per round)
                  </label>
                  <input
                    id="emomMinutes"
                    type="number"
                    min={1}
                    max={120}
                    value={emomMinutes}
                    onChange={(e) => setEmomMinutes(Math.max(1, Number(e.target.value)))}
                    className="w-full px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-700 focus:border-yellow-400 focus:outline-none text-2xl font-mono font-bold text-white"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isSyncing}
              className="w-full py-3.5 px-6 rounded-xl bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 text-black font-extrabold text-sm uppercase tracking-wider transition cursor-pointer shadow-lg"
            >
              {isSyncing ? 'Syncing to Firestore...' : 'Set Workout'}
            </button>
          </form>
        </section>

        {/* Right Column: Live Session Controls (Start, Pause, Reset) */}
        <section className="lg:col-span-5 bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-6">
              <div className="flex items-center gap-2.5">
                <Timer className="w-5 h-5 text-yellow-400" />
                <h2 className="text-lg font-bold tracking-tight">2. Live Floor Controls</h2>
              </div>
              {liveWorkout && (
                <span
                  className={`px-3 py-1 rounded-full text-xs font-mono font-bold border ${
                    statusBadgeColors[liveWorkout.status]
                  }`}
                >
                  {liveWorkout.status}
                </span>
              )}
            </div>

            {/* Active Firestore Document Status Card */}
            <div className="p-5 rounded-xl bg-zinc-950 border border-zinc-800 mb-6">
              <p className="text-xs uppercase tracking-wider text-zinc-500 font-semibold mb-1">
                Synced Session (sessions/current)
              </p>
              {liveWorkout ? (
                <div className="space-y-2">
                  <p className="text-xl font-extrabold text-white">
                    {renderLiveConfigSummary(liveWorkout)}
                  </p>
                  <p className="text-xs text-zinc-400 font-mono">
                    startTimestamp:{' '}
                    {liveWorkout.startTimestamp ? liveWorkout.startTimestamp : 'null'}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-zinc-400 py-2">
                  No workout loaded yet. Click <strong>Set Workout</strong> to initialize the
                  session.
                </p>
              )}
            </div>

            {/* Control Buttons: Start, Pause, Reset */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleStart}
                disabled={isSyncing || !liveWorkout || liveWorkout.status === 'RUNNING'}
                className="w-full py-4 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-black font-extrabold text-base uppercase tracking-wider flex items-center justify-center gap-2.5 transition cursor-pointer"
              >
                <Play className="w-5 h-5 fill-current" />
                {liveWorkout?.status === 'PAUSED' ? 'Resume Timer' : 'Start'}
              </button>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handlePause}
                  disabled={isSyncing || !liveWorkout || liveWorkout.status !== 'RUNNING'}
                  className="py-3.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-black font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <Pause className="w-4 h-4 fill-current" />
                  Pause
                </button>

                <button
                  type="button"
                  onClick={handleReset}
                  disabled={isSyncing || !liveWorkout}
                  className="py-3.5 px-4 rounded-xl bg-zinc-800 hover:bg-red-500/20 border border-zinc-700 hover:border-red-500/40 disabled:opacity-40 text-zinc-200 hover:text-red-300 font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reset
                </button>
              </div>
            </div>
          </div>

          {/* Feedback Banner */}
          {feedback && (
            <div
              role="status"
              className={`mt-6 p-3.5 rounded-xl border text-xs font-medium flex items-start gap-2.5 ${
                feedback.type === 'success'
                  ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200'
                  : 'bg-red-950/60 border-red-500/40 text-red-200'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              )}
              <span>{feedback.message}</span>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};
