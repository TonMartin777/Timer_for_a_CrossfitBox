export type WorkoutMode = 'FOR_TIME' | 'AMRAP' | 'EMOM';
export type WorkoutStatus = 'IDLE' | 'RUNNING' | 'PAUSED' | 'FINISHED';

export interface WorkoutConfig {
  timeCapSeconds?: number;   // Used for FOR_TIME
  totalTimeSeconds?: number; // Used for AMRAP
  emomTotalMinutes?: number; // Used for EMOM
}

export interface WorkoutState {
  mode: WorkoutMode;
  config: WorkoutConfig;
  status: WorkoutStatus;
  startTimestamp: number | null; // Unix timestamp (ms) when started to prevent time drift
  pausedElapsedMs?: number;      // Elapsed ms preserved while status is PAUSED
}
