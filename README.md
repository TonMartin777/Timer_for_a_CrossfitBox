# Yaqbot CrossFit Timer

A real-time, high-contrast timer application designed for a CrossFit box. It features a secure Coach Dashboard to configure workouts and a synchronized Public Floor Display optimized for extreme distance readability. Built as a technical assignment within a strict 4-hour timeframe.

**Live Demo:** https://timer-for-a-crossfit-box.web.app

## Tech Stack
* **Frontend:** React, TypeScript, Vite, Tailwind CSS
* **Backend:** Firebase Authentication, Cloud Firestore

## Key Features
* **Workout Modes:** Fully mathematical implementations of *For Time*, *AMRAP*, and *EMOM*.
* **Domain-Restricted Access:** Coach dashboard login is strictly protected and locked to `@yaqbot.com` Google accounts.
* **Real-Time Synchronization:** Zero-delay communication between the coach's control panel and the public floor screen.
* **Gym-Floor Optimized:** Integrates HTML5 Web Audio API for acoustic cues (countdown/completion buzzers) and the Screen Wake Lock API to prevent the display from sleeping during a workout.

## Architecture Decisions
* **Firestore `onSnapshot`:** Selected over REST polling for lightweight, real-time WebSocket communication. It ensures that the public display stays instantly synced with the coach's live controls.
* **Scalable UI:** The public timer relies on dynamic viewport-based text scaling (vw) in Tailwind CSS to remain perfectly legible across large industrial gym spaces.

## Local Setup

1. Clone the repository and install dependencies:
   ```bash
   npm install
