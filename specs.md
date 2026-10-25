# Project Specifications: Yaqbot CrossFit Timer

## Core Objective
Build a web-based timer application for a CrossFit box using React (Vite), TypeScript, Tailwind CSS, and Firebase. 
Time budget: 3-4 hours. 
Goal: A robust MVP prioritizing core functionality (Desktop to Phone sync, accurate timer, legibility) over complex features.

## Authentication & Access Control
- **Provider**: Google Sign-In via Firebase Auth.
- **Restriction**: ONLY allow emails ending in `@yaqbot.com` (Test account: `hola@yaqbot.com`). 
- **Roles**: Only authenticated users (coaches) can access the `/setup` (Desktop) view to configure workouts. Unauthenticated devices can view the `/timer` (Phone) route if they have the specific session ID.
- **Roles**: Only authenticated users (coaches) can access the `/setup` (Desktop) view to configure workouts. Unauthenticated devices can view the `/timer` (Phone) route if they have the specific session ID.

## Data Model (Firestore)
Use a single Firestore document to sync state between Desktop and Phone.
Collection: `sessions` -> Document: `current_workout` (or dynamically generated ID).
```typescript
interface WorkoutState {
  mode: 'FOR_TIME' | 'AMRAP' | 'EMOM';
  config: {
    timeCapSeconds?: number; // Used for FOR_TIME
    totalTimeSeconds?: number; // Used for AMRAP
    emomTotalMinutes?: number; // Used for EMOM
  };
  status: 'IDLE' | 'RUNNING' | 'PAUSED' | 'FINISHED';
  startTimestamp: number | null; // Unix timestamp when started to calculate accurate time drift
}
```

## Desktop Setup UI (Coach View - `/setup`)
Coaches must be able to configure the following parameters based on the selected mode:
1. **For Time**:
   - **Input**: "Time Cap" (Minutes and Seconds).
   - **Behavior**: Sets a maximum limit for the workout.
2. **AMRAP (As Many Rounds As Possible)**:
   - **Input**: "Total Time" (Minutes and Seconds).
   - **Behavior**: Sets the countdown duration.
3. **EMOM (Every Minute on the Minute)**:
   - **Input**: "Total Minutes" (Number input).
   - **Behavior**: Sets how many 1-minute intervals will occur.

## Phone Timer View (`/timer`)
- **Display**: Huge, high-contrast typography (white/yellow on black background), readable from several meters away. Full screen layout.
- **Sync**: Listens to Firestore `onSnapshot`. When `status` changes to 'RUNNING', it starts the timer logic.
- **Hardware API**: MUST use the Web `WakeLock` API to keep the screen ON while the timer runs.
- **Timer Logic (Critical)**: Rely on comparing `Date.now()` with `startTimestamp` rather than `setInterval` to avoid time drift if the browser throttles background tabs.
- **Specific Mode Logic**:
  - *For Time*: Counts UP from 00:00 to the `timeCap`. Stops at the cap.
  - *AMRAP*: Counts DOWN from `totalTime` to 00:00.
  - *EMOM*: Shows the current Minute number (e.g., "Minute 3/10") and a countdown of the current minute (59 down to 00).
- **Sound Cues**: Use Web Audio API or HTML5 `<audio>`.
  - 3-2-1 countdown beeps before workout starts.
  - Long beep on START and FINISH.
  - *EMOM specific*: Short beep at the start of every new minute.