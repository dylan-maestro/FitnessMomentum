# Fitness Momentum

Fitness Momentum is an offline-first workout tracker for Android and the web (PWA). Instead of streaks, it uses a continuous momentum model based on training volume, so progress builds gradually, decays smoothly, and adapts to your target training frequency.

## Get The App

The latest instructions for getting the app will always be reflected on the landing page at [fitmo.co](https://fitmo.co)

## Highlights

- Continuous momentum score driven by logged workout volume
- Weight-based and distance-based workouts, including bodyweight and laps-based modes
- Daily targets that account for decay, consistency, and progressive overload
- Quick logging with same-day accumulation and immediate feedback
- Local JSON export/import for backup and transfer
- Installable PWA plus an Android WebView shell
- Offline operation after the app has been built and installed

## How The Data Works

Fitness Momentum stores data locally in browser/WebView `localStorage`. That includes workout configuration, daily logged volume, timestamps used for target calculations, and momentum history used for charts and sparklines.

There is no cloud backend in this repository, and Android and browser/PWA installs do not sync automatically. To move data between them, export a backup JSON from one install and import it into the other.

## Built-In Templates

The app currently ships with these starter templates:

- Bodyweight: Pushups, Pull-Ups, Dips, Air Squats, Walking Lunges
- Strength: Barbell Squat, Bench Press, Overhead Press, Barbell Row
- Endurance: Daily Walk, Running, Cycling, Swimming Laps, Open Water Swimming

## How It Works

Each workout builds momentum from logged volume:

- Weight-based workouts use `reps x weight`
- Distance-based workouts use total distance
- Momentum decays over time, so missed sessions reduce it gradually instead of resetting a streak
- Daily targets aim to cover decay and apply the configured progression rate

In practice, the app answers a simple question each day: how much work would keep this habit moving forward?

## Architecture

This repository contains a shared Svelte frontend with two delivery targets:

- Android app: a minimal WebView shell in `app/`
- Web app: a Vite-built PWA in `app/src/main/assets/app/`

Build outputs:

- `npm run build:android` writes WebView assets to `app/src/main/assets/www/`
- `npm run build:web` writes the web/PWA build to `app/src/main/assets/app/dist/`

Key directories:

```text
fitness-momentum/
├── app/
│   ├── build.gradle.kts
│   └── src/main/
│       ├── AndroidManifest.xml
│       └── assets/
│           ├── app/      # Svelte source
│           └── www/      # Built Android WebView assets
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- JDK 17+
- Android Studio plus Android SDK if you want to build the Android app
- For Android builds, install at least:
  - Android SDK Platform 34
  - Android SDK Build-Tools 34.0.0
  - Android SDK Platform-Tools

### Install Dependencies

```bash
git clone <repository-url>
cd fitness-momentum
cd app/src/main/assets/app
npm ci
```

For reproducible builds, prefer `npm ci` over `npm install` so the frontend dependencies come from the committed `package-lock.json`.

### Run The Frontend In Dev Mode

```bash
cd app/src/main/assets/app
npm run dev
```

This starts the Svelte app locally for browser-based development.

### Build The Android App

```bash
cd app/src/main/assets/app
npm run build:android

cd /path/to/fitness-momentum
./gradlew clean assembleDebug
```

Use the committed Gradle wrapper (`./gradlew`) rather than a system Gradle installation so the Android build uses the pinned Gradle version from the repository.

The Android Gradle build also depends on the frontend build step, so once dependencies are installed, `./gradlew clean assembleDebug` will rebuild the WebView assets automatically.

### Build The Web/PWA Target

```bash
cd app/src/main/assets/app
npm run build:web
```

## Reproducible Builds

This repository is set up so you can reproduce the app build from source up to the point of release signing.

For the closest match to the maintainer build process:

1. Use the committed lockfiles and wrappers:
   - `npm ci` in `app/src/main/assets/app/`
   - `./gradlew`, not a system Gradle install
2. Use the documented toolchain:
   - Node.js 18+
   - JDK 17
   - Android SDK Platform 34
   - Android SDK Build-Tools 34.0.0
3. Start from a clean checkout and run:

```bash
cd app/src/main/assets/app
npm ci
npm run build:web
npm run build:android

cd /path/to/fitness-momentum
./gradlew clean assembleDebug
```

Expected outputs:

- Web/PWA build: `app/src/main/assets/app/dist/`
- Android WebView assets: `app/src/main/assets/www/`
- Debug APK: `app/build/outputs/apk/debug/`

Release builds are also possible from source:

```bash
./gradlew clean assembleRelease
```

Release assets for Obtainium/Accrescent include checksums and machine-readable build metadata (`release-manifest.json`) for verification.

## Web Hosting

The web target publishes from `app/src/main/assets/app/dist/` and can be deployed to any static host that supports SPA rewrites.

## Testing

Android instrumentation tests:

```bash
./gradlew connectedAndroidTest
```

For manual validation, verify offline startup, workout creation, logging, export/import, and persistence across app restarts.

## Contributing

Issues, suggestions, and pull requests are welcome, especially if you enjoy the app and want to help improve it.

If you submit a contribution, you are agreeing that it may be reviewed, discussed, modified, and merged into the project under this repository's license and release process. Accepted contributions may be acknowledged in release notes where practical, but merging a contribution does not create any separate ownership or control rights over the project or its future direction.

## License

Fitness Momentum is provided under the PolyForm Noncommercial License 1.0.0. See `LICENSE` for the full terms.

Third-party libraries and their original licenses are documented in `THIRD_PARTY_NOTICES.md`.