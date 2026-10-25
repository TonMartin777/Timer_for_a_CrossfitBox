import { useEffect, useState } from 'react';
import type { WorkoutState, WorkoutStatus } from '../types/workout';

export interface TimerComputation {
  formattedTime: string;
  currentRound: number | null;
  totalRounds: number | null;
  effectiveStatus: WorkoutStatus;
  elapsedMs: number;
  isFinished: boolean;
  preCountdownSeconds: number | null;
}

export function formatMMSS(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getInitialFormattedTime(workout: WorkoutState): string {
  if (workout.mode === 'FOR_TIME') {
    return '00:00';
  }
  if (workout.mode === 'AMRAP') {
    return formatMMSS(workout.config.totalTimeSeconds ?? 0);
  }
  return '01:00';
}

function computeTimerSnapshot(workout: WorkoutState | null, nowMs: number): TimerComputation {
  if (!workout) {
    return {
      formattedTime: '00:00',
      currentRound: null,
      totalRounds: null,
      effectiveStatus: 'IDLE',
      elapsedMs: 0,
      isFinished: false,
      preCountdownSeconds: null,
    };
  }

  // Handle 3-2-1 pre-workout countdown when status is RUNNING and nowMs < startTimestamp
  if (workout.status === 'RUNNING' && workout.startTimestamp !== null && nowMs < workout.startTimestamp) {
    const remainingLeadInMs = workout.startTimestamp - nowMs;
    const preCountdownSeconds = Math.max(1, Math.min(3, Math.ceil(remainingLeadInMs / 1000)));
    return {
      formattedTime: getInitialFormattedTime(workout),
      currentRound: workout.mode === 'EMOM' ? 1 : null,
      totalRounds: workout.mode === 'EMOM' ? Math.max(1, workout.config.emomTotalMinutes ?? 1) : null,
      effectiveStatus: 'RUNNING',
      elapsedMs: 0,
      isFinished: false,
      preCountdownSeconds,
    };
  }

  // Determine accurate elapsed milliseconds based on status and startTimestamp
  let elapsedMs = 0;
  if (workout.status === 'RUNNING' && workout.startTimestamp !== null) {
    elapsedMs = Math.max(0, nowMs - workout.startTimestamp);
  } else if (workout.status === 'PAUSED') {
    elapsedMs = Math.max(0, workout.pausedElapsedMs ?? 0);
  } else if (workout.status === 'FINISHED') {
    if (workout.mode === 'FOR_TIME') {
      elapsedMs = (workout.config.timeCapSeconds ?? 0) * 1000;
    } else if (workout.mode === 'AMRAP') {
      elapsedMs = (workout.config.totalTimeSeconds ?? 0) * 1000;
    } else {
      elapsedMs = (workout.config.emomTotalMinutes ?? 0) * 60 * 1000;
    }
  }

  // 1. FOR_TIME: Counts UP from 00:00 to timeCapSeconds
  if (workout.mode === 'FOR_TIME') {
    const capSeconds = Math.max(0, workout.config.timeCapSeconds ?? 0);
    const capMs = capSeconds * 1000;
    const isFinished =
      workout.status === 'FINISHED' || (capMs > 0 && elapsedMs >= capMs);
    const clampedElapsedSeconds = isFinished
      ? capSeconds
      : Math.min(capSeconds, Math.floor(elapsedMs / 1000));

    return {
      formattedTime: formatMMSS(clampedElapsedSeconds),
      currentRound: null,
      totalRounds: null,
      effectiveStatus: isFinished ? 'FINISHED' : workout.status,
      elapsedMs: Math.min(elapsedMs, capMs),
      isFinished,
      preCountdownSeconds: null,
    };
  }

  // 2. AMRAP: Counts DOWN from totalTimeSeconds to 00:00
  if (workout.mode === 'AMRAP') {
    const totalSeconds = Math.max(0, workout.config.totalTimeSeconds ?? 0);
    const totalMs = totalSeconds * 1000;
    const isFinished =
      workout.status === 'FINISHED' || (totalMs > 0 && elapsedMs >= totalMs);

    if (workout.status === 'IDLE' && elapsedMs === 0) {
      return {
        formattedTime: formatMMSS(totalSeconds),
        currentRound: null,
        totalRounds: null,
        effectiveStatus: 'IDLE',
        elapsedMs: 0,
        isFinished: false,
        preCountdownSeconds: null,
      };
    }

    const remainingMs = Math.max(0, totalMs - elapsedMs);
    const remainingSeconds = isFinished ? 0 : Math.ceil(remainingMs / 1000);

    return {
      formattedTime: formatMMSS(remainingSeconds),
      currentRound: null,
      totalRounds: null,
      effectiveStatus: isFinished ? 'FINISHED' : workout.status,
      elapsedMs: Math.min(elapsedMs, totalMs),
      isFinished,
      preCountdownSeconds: null,
    };
  }

  // 3. EMOM: Counts DOWN from 01:00 every minute and tracks "Round X of Y"
  const totalMinutes = Math.max(1, workout.config.emomTotalMinutes ?? 1);
  const totalEmomMs = totalMinutes * 60 * 1000;
  const isFinished =
    workout.status === 'FINISHED' || elapsedMs >= totalEmomMs;

  if (workout.status === 'IDLE' && elapsedMs === 0) {
    return {
      formattedTime: '01:00',
      currentRound: 1,
      totalRounds: totalMinutes,
      effectiveStatus: 'IDLE',
      elapsedMs: 0,
      isFinished: false,
      preCountdownSeconds: null,
    };
  }

  if (isFinished) {
    return {
      formattedTime: '00:00',
      currentRound: totalMinutes,
      totalRounds: totalMinutes,
      effectiveStatus: 'FINISHED',
      elapsedMs: totalEmomMs,
      isFinished: true,
      preCountdownSeconds: null,
    };
  }

  const currentRound = Math.min(totalMinutes, Math.floor(elapsedMs / 60000) + 1);
  const msIntoCurrentMinute = elapsedMs % 60000;
  const remainingMsInMinute = 60000 - msIntoCurrentMinute;
  const remainingSecondsInMinute = Math.ceil(remainingMsInMinute / 1000);

  return {
    formattedTime: formatMMSS(remainingSecondsInMinute),
    currentRound,
    totalRounds: totalMinutes,
    effectiveStatus: workout.status,
    elapsedMs,
    isFinished: false,
    preCountdownSeconds: null,
  };
}

/**
 * Custom hook that continuously compares Date.now() against the Firestore startTimestamp
 * every 100ms to prevent drift even when mobile browsers throttle background tabs.
 */
export function useTimer(workout: WorkoutState | null): TimerComputation {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    setNowMs(Date.now());

    if (!workout || workout.status !== 'RUNNING') {
      return;
    }

    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 100);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [workout]);

  return computeTimerSnapshot(workout, nowMs);
}
