# Execution Tasks for AI Agent

- [X] **Task 1: Project Scaffold & Firebase Setup**
  - Initialize a new React project using Vite and TypeScript.
  - Install Tailwind CSS and configure it.
  - Install `firebase`. Create a `firebase.ts` config file.
  - Set up Firebase Auth and Firestore. DO NOT hide Firebase keys in `.env` if they are public client keys, just hardcode them for this MVP to save time, or use standard Vite env vars if preferred.

- [X] **Task 2: Authentication & Routing**
  - Implement a simple Login page (`/login`) with a "Sign in with Google" button.
  - In the auth callback, check if `user.email?.endsWith('@yaqbot.com')`. If not, force sign out and show an error message.
  - Create a Protected Route component for `/setup`.
  - Create a public Route for `/timer`.

- [X] **Task 3: Desktop UI - Workout Configuration**
  - Create the `/setup` view (Dashboard).
  - Build a tabbed or dropdown interface to select between "For Time", "AMRAP", and "EMOM".
  - Build the corresponding inputs:
    - **For Time**: Two number inputs (Minutes, Seconds) for the Time Cap.
    - **AMRAP**: Two number inputs (Minutes, Seconds) for Total Time.
    - **EMOM**: One number input for Total Minutes.
  - Add a "Set Workout" button that writes the chosen configuration to a specific Firestore document (e.g., `sessions/current`).
  - Add "Start", "Pause", and "Reset" buttons that update the `status` and `startTimestamp` fields in the Firestore document.

- [X] **Task 4: Phone UI - Timer Layout & WakeLock**
  - Create the `/timer` view. Apply a black background and center the text using Flexbox/CSS Grid.
  - Implement the `navigator.wakeLock.request('screen')` API when the component mounts or when status becomes 'RUNNING'. Handle visibility change re-requests.
  - Implement a Firebase real-time listener (`onSnapshot`) on the `sessions/current` document to sync state.

- [X] **Task 5: Timer Logic & Synchronization**
  - Build a custom hook `useTimer(workoutState)` that calculates the displayed time.
  - Use `requestAnimationFrame` or a 100ms `setInterval` to continuously compare `Date.now()` against the Firebase `startTimestamp`. 
  - **For Time**: Format string as `MM:SS` counting UP.
  - **AMRAP**: Format string as `MM:SS` counting DOWN.
  - **EMOM**: Format as `MM:SS` counting DOWN from 1:00, and display "Round X of Y".

- [X] **Task 6: Audio Integration**
  - Add audio files (or generate oscillator beeps) for standard CrossFit sounds.
  - Create an Audio manager or custom hook.
  - Trigger a 3-second countdown (3 short beeps, 1 long beep) when status changes from IDLE to RUNNING.
  - In EMOM mode, trigger a beep exactly when `Date.now()` crosses a minute boundary relative to `startTimestamp`.

- [X] **Task 7: Final Review & Polish**
  - Ensure the UI looks clean, modern, and highly legible.
  - Verify that only `@yaqbot.com` emails can configure the app.
  - Prepare for Vercel/Firebase Hosting deployment.