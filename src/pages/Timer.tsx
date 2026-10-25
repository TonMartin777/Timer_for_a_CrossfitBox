import React, { useCallback, useEffect, useRef, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { Volume2, VolumeX, Maximize2, Smartphone, Flame, Repeat, Clock, Timer as TimerIcon } from 'lucide-react';
import { WORKOUT_SESSION_DOC } from '../firebase';
import { useTimer, formatMMSS } from '../hooks/useTimer';
import { useWakeLock } from '../hooks/useWakeLock';
import { gymAudio } from '../utils/audio';
import type { WorkoutState } from '../types/workout';

export const Timer: React.FC = () => {
  const [workoutState, setWorkoutState] = useState<WorkoutState | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [audioUnlocked, setAudioUnlocked] = useState<boolean>(
    () => gymAudio.getAudioState() === 'running'
  );
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [showControls, setShowControls] = useState<boolean>(true);
  const inactivityTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMouseCoordsRef = useRef<{ x: number; y: number } | null>(null);

  const resetInactivityTimer = useCallback(() => {
    setShowControls(true);
    if (inactivityTimeoutRef.current !== null) {
      clearTimeout(inactivityTimeoutRef.current);
    }
    inactivityTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  }, []);

  // Auto-hide top controls after 3 seconds of inactivity; fade back in on mousemove or touchstart
  useEffect(() => {
    resetInactivityTimer();

    const handleWindowMouseMove = (e: MouseEvent) => {
      const prev = lastMouseCoordsRef.current;
      // Ignore synthetic mousemove events fired by the browser during 100ms timer DOM updates when cursor hasn't moved
      if (prev && prev.x === e.clientX && prev.y === e.clientY) {
        return;
      }
      lastMouseCoordsRef.current = { x: e.clientX, y: e.clientY };
      resetInactivityTimer();
    };

    const handleWindowTouchStart = () => {
      resetInactivityTimer();
    };

    window.addEventListener('mousemove', handleWindowMouseMove, { passive: true });
    window.addEventListener('touchstart', handleWindowTouchStart, { passive: true });

    return () => {
      if (inactivityTimeoutRef.current !== null) {
        clearTimeout(inactivityTimeoutRef.current);
      }
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('touchstart', handleWindowTouchStart);
    };
  }, [resetInactivityTimer]);

  // Real-time Firestore listener on sessions/current
  useEffect(() => {
    const unsubscribe = onSnapshot(
      WORKOUT_SESSION_DOC,
      (snapshot) => {
        setSyncError(null);
        if (snapshot.exists()) {
          setWorkoutState(snapshot.data() as WorkoutState);
        } else {
          setWorkoutState(null);
        }
      },
      (err) => {
        console.error('Error listening to workout session on /timer:', err);
        setSyncError(err.message);
      }
    );

    return () => unsubscribe();
  }, []);

  // Unlock Web Audio API on first user tap/click anywhere on the timer screen
  useEffect(() => {
    const handleUserGesture = async () => {
      const unlocked = await gymAudio.unlockAudio();
      if (unlocked) {
        setAudioUnlocked(true);
      }
    };

    window.addEventListener('pointerdown', handleUserGesture);
    window.addEventListener('keydown', handleUserGesture);
    return () => {
      window.removeEventListener('pointerdown', handleUserGesture);
      window.removeEventListener('keydown', handleUserGesture);
    };
  }, []);

  // Calculate drift-free timer display from workoutState
  const {
    formattedTime,
    currentRound,
    totalRounds,
    effectiveStatus,
    isFinished,
    preCountdownSeconds,
  } = useTimer(workoutState);

  // Keep phone screen awake via Screen Wake Lock API
  const { isSupported: wakeLockSupported, isLocked: wakeLockActive } = useWakeLock(true);

  // Refs to track state transitions for Web Audio cues without duplicate triggers
  const lastPreCountdownRef = useRef<number | null>(null);
  const lastRoundRef = useRef<number | null>(null);
  const wasFinishedRef = useRef<boolean>(false);
  const lastStartTimestampRef = useRef<number | null>(null);

  // Reset audio tracking refs when workout is reset or a new startTimestamp is assigned
  useEffect(() => {
    if (
      !workoutState ||
      workoutState.status === 'IDLE' ||
      workoutState.startTimestamp !== lastStartTimestampRef.current
    ) {
      lastStartTimestampRef.current = workoutState?.startTimestamp ?? null;
      lastPreCountdownRef.current = null;
      lastRoundRef.current = null;
      wasFinishedRef.current = false;
    }
  }, [workoutState]);

  // Trigger 3-2-1 Countdown Beeps and START Horn
  useEffect(() => {
    if (!workoutState || workoutState.status !== 'RUNNING') {
      lastPreCountdownRef.current = null;
      return;
    }

    // 3 - 2 - 1 short countdown beeps
    if (preCountdownSeconds !== null) {
      if (lastPreCountdownRef.current !== preCountdownSeconds) {
        gymAudio.playCountdownBeep();
        lastPreCountdownRef.current = preCountdownSeconds;
      }
      return;
    }

    // Transition from pre-countdown (1) -> active workout (null): Play long START horn!
    if (lastPreCountdownRef.current !== null && preCountdownSeconds === null && !isFinished) {
      gymAudio.playStartHorn();
      lastPreCountdownRef.current = null;
      lastRoundRef.current = currentRound;
    }
  }, [workoutState, preCountdownSeconds, isFinished, currentRound]);

  // Trigger EMOM Minute-Boundary Interval Beep (Round 2, Round 3, ...)
  useEffect(() => {
    if (
      !workoutState ||
      workoutState.mode !== 'EMOM' ||
      workoutState.status !== 'RUNNING' ||
      preCountdownSeconds !== null ||
      isFinished ||
      currentRound === null
    ) {
      return;
    }

    if (lastRoundRef.current === null) {
      lastRoundRef.current = currentRound;
      return;
    }

    if (currentRound > lastRoundRef.current) {
      gymAudio.playEmomMinuteBeep();
      lastRoundRef.current = currentRound;
    }
  }, [workoutState, currentRound, preCountdownSeconds, isFinished]);

  // Trigger Final Completion Horn when timer reaches Cap / 00:00
  useEffect(() => {
    if (isFinished && !wasFinishedRef.current) {
      wasFinishedRef.current = true;
      gymAudio.playFinishHorn();
    } else if (!isFinished) {
      wasFinishedRef.current = false;
    }
  }, [isFinished]);

  const handleToggleAudio = async () => {
    const unlocked = await gymAudio.unlockAudio();
    setAudioUnlocked(unlocked);

    if (!audioUnlocked) {
      gymAudio.playCountdownBeep();
      return;
    }

    const nextMuted = !isMuted;
    gymAudio.setMuted(nextMuted);
    setIsMuted(nextMuted);
    if (!nextMuted) {
      gymAudio.playCountdownBeep();
    }
  };

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen().catch(() => {
        // Ignore if blocked
      });
    } else {
      void document.exitFullscreen().catch(() => {
        // Ignore
      });
    }
  };

  const getModeLabel = (workout: WorkoutState | null): string => {
    if (!workout) return 'WAITING FOR WORKOUT';
    if (workout.mode === 'FOR_TIME') {
      return `FOR TIME • CAP ${formatMMSS(workout.config.timeCapSeconds ?? 0)}`;
    }
    if (workout.mode === 'AMRAP') {
      return `AMRAP • ${formatMMSS(workout.config.totalTimeSeconds ?? 0)}`;
    }
    return `EMOM • ${workout.config.emomTotalMinutes ?? 0} MINUTES`;
  };

  const getModeIcon = (workout: WorkoutState | null) => {
    if (!workout) return <TimerIcon className="w-7 h-7 sm:w-9 sm:h-9 text-[#de7c36]" />;
    if (workout.mode === 'FOR_TIME') return <Flame className="w-7 h-7 sm:w-9 sm:h-9 text-[#de7c36]" />;
    if (workout.mode === 'AMRAP') return <Repeat className="w-7 h-7 sm:w-9 sm:h-9 text-[#de7c36]" />;
    return <Clock className="w-7 h-7 sm:w-9 sm:h-9 text-[#de7c36]" />;
  };

  return (
    <div
      onMouseMove={(e) => {
        const prev = lastMouseCoordsRef.current;
        if (prev && prev.x === e.clientX && prev.y === e.clientY) return;
        lastMouseCoordsRef.current = { x: e.clientX, y: e.clientY };
        resetInactivityTimer();
      }}
      onTouchStart={resetInactivityTimer}
      className="relative flex flex-col items-center justify-center min-h-screen w-full bg-[#fceada] text-[#2d241c] px-4 py-6 select-none overflow-hidden"
    >
      {/* Top Floating Controls (Sound & Fullscreen) - Auto-hide after 3s of inactivity */}
      <div
        className={`absolute top-4 right-4 sm:top-6 sm:right-6 flex items-center gap-3 z-10 transition-opacity duration-500 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <button
          type="button"
          onClick={handleToggleAudio}
          className={`px-4 py-2.5 rounded-xl border-2 text-xs sm:text-sm font-extrabold uppercase tracking-wider flex items-center gap-2 transition cursor-pointer shadow-sm ${
            !audioUnlocked
              ? 'bg-[#de7c36] text-[#fceada] border-[#de7c36]'
              : isMuted
                ? 'bg-[#fceada] text-[#2d241c]/70 border-[#de7c36]/50'
                : 'bg-[#fceada] text-[#2d241c] border-[#de7c36] hover:bg-[#de7c36]/10'
          }`}
          title="Toggle or unlock gym buzzer audio"
        >
          {isMuted || !audioUnlocked ? (
            <VolumeX className={`w-5 h-5 ${!audioUnlocked ? 'text-[#fceada]' : 'text-[#de7c36]'}`} />
          ) : (
            <Volume2 className="w-5 h-5 text-[#de7c36]" />
          )}
          <span>{!audioUnlocked ? 'Tap to Enable Sound' : isMuted ? 'Muted' : 'Sound On'}</span>
        </button>

        <button
          type="button"
          onClick={handleToggleFullscreen}
          className="p-2.5 rounded-xl bg-[#fceada] hover:bg-[#de7c36]/15 border-2 border-[#de7c36] text-[#de7c36] transition cursor-pointer shadow-sm"
          title="Toggle Fullscreen"
        >
          <Maximize2 className="w-5 h-5 text-[#de7c36]" />
        </button>
      </div>

      {/* Perfectly Centered Main Display Stack */}
      <div className="flex flex-col items-center justify-center text-center w-full max-w-[98vw]">
        {/* Mode Header */}
        <div className="flex items-center justify-center gap-3 mb-2 sm:mb-4">
          {getModeIcon(workoutState)}
          <span className="text-2xl sm:text-4xl md:text-5xl font-black uppercase tracking-widest text-[#2d241c]">
            {getModeLabel(workoutState)}
          </span>
        </div>

        {/* EMOM Round Info */}
        {workoutState?.mode === 'EMOM' &&
          currentRound !== null &&
          totalRounds !== null &&
          preCountdownSeconds === null && (
            <div className="mb-2 sm:mb-4 px-8 py-2.5 rounded-2xl bg-[#de7c36]/15 border-4 border-[#de7c36]">
              <span className="text-3xl sm:text-5xl md:text-6xl font-black uppercase tracking-wider text-[#2d241c]">
                Round <span className="text-[#de7c36]">{currentRound}</span> of {totalRounds}
              </span>
            </div>
          )}

        {/* Pre-Workout 3-2-1 Countdown OR Massive Main Timer */}
        {preCountdownSeconds !== null ? (
          <div className="flex flex-col items-center justify-center my-2">
            <span className="text-3xl sm:text-5xl md:text-6xl font-black uppercase tracking-[0.25em] text-[#de7c36] mb-2">
              GET READY
            </span>
            <div className="text-[30vw] leading-none font-mono font-black text-[#de7c36] tracking-tighter tabular-nums">
              {preCountdownSeconds}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center w-full">
            {/* massive 25vw timer digits */}
            <div
              className={`text-[25vw] leading-none font-mono font-black tracking-tighter tabular-nums text-[#2d241c] ${
                effectiveStatus === 'PAUSED' ? 'animate-pulse opacity-80' : ''
              }`}
            >
              {formattedTime}
            </div>
          </div>
        )}

        {/* Prominent Distance-Readable Status Pill */}
        <div className="mt-4 sm:mt-6 flex items-center justify-center gap-4">
          <div className="px-6 py-2 rounded-full bg-[#de7c36] text-[#fceada] text-xl sm:text-3xl md:text-4xl font-black uppercase tracking-[0.2em] shadow-md">
            {preCountdownSeconds !== null
              ? 'STARTING'
              : effectiveStatus === 'FINISHED'
                ? 'TIME! FINISHED'
                : effectiveStatus}
          </div>
        </div>
      </div>

      {/* Bottom Hardware / WakeLock Bar */}
      <div className="absolute bottom-4 left-4 right-4 sm:bottom-6 sm:left-8 sm:right-8 flex flex-wrap items-center justify-between gap-4 text-xs sm:text-base font-mono font-bold uppercase tracking-widest text-[#2d241c]/80">
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full bg-[#de7c36]" />
          <span>YAQBOT FLOOR DISPLAY</span>
          {syncError && <span className="text-[#de7c36] font-extrabold">• SYNC ERROR: {syncError}</span>}
        </div>

        <div className="flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-[#de7c36]" />
          <span>
            WAKE LOCK:{' '}
            <strong className="text-[#2d241c]">
              {!wakeLockSupported ? 'UNSUPPORTED' : wakeLockActive ? 'ACTIVE' : 'STANDBY'}
            </strong>
          </span>
        </div>
      </div>
    </div>
  );
};
