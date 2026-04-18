# Mom's Lifesaver

### Soothing audio tracks to help your baby sleep

<!-- Website and Social Media Links -->
<!-- TODO: Add your website URL here -->
<!-- TODO: Add your social media links here -->

**Author:** Filipe Lopes Pires ([@FilipeLopesPires](https://github.com/FilipeLopesPires))

**Live Demo:** [View on GitHub Pages](https://FilipeLopesPires.github.io/MomsLifesaver/)

**Latest Release:** [View latest release](https://github.com/FilipeLopesPires/MomsLifesaver/releases/latest)

---

## Introduction

Mom's Lifesaver is a baby sleeping audio tool designed to help soothe and calm your baby. The app provides a collection of carefully curated audio tracks including white noise, nature sounds, heartbeat rhythms, and shushing sounds that can be played individually or combined to create the perfect calming environment.

The app is built with [Expo](https://expo.dev) and [React Native](https://reactnative.dev), making it available across platforms.

### Key Features

- **Multiple Audio Tracks**: Choose from a growing library of different soothing sounds including rain, water streams, kalimba music, heartbeat, and shushing sounds
- **Simultaneous Playback**: Play multiple tracks at the same time to create custom sound combinations
- **Individual Volume Control**: Adjust the volume of each track independently for fine-tuned audio mixing
- **Master Volume Control**: Quickly adjust the overall volume of all playing tracks with a single slider
- **Background Audio**: Audio continues playing when you switch apps or lock your device
- **Smart Track Selection**: Select tracks with a tap, then control them all together with play/pause and stop buttons
- **Cross-Platform**: Tested on Android and Web browsers

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v20 or later recommended)
- [npm](https://www.npmjs.com/) (comes with Node.js)
- For mobile development:
  - [Expo Go](https://expo.dev/go) app on your iOS/Android device, OR
  - iOS Simulator (macOS only) / Android Emulator

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/FilipeLopesPires/MomsLifesaver.git
   cd MomsLifesaver
   ```

2. **Navigate to the app directory**
   ```bash
   cd src/MomsLifesaver
   ```

3. **Install dependencies**
   ```bash
   npm install
   ```

4. **Start the development server**
   ```bash
   npm start
   # or
   npx expo start
   ```

5. **Run on your preferred platform**
   - Press `w` for web
   - Press `a` for Android (requires Android emulator or device)
   - Press `i` for iOS (requires iOS simulator or device)
   - Scan QR code with Expo Go app on your phone

### Development Scripts

Run these from `src/MomsLifesaver/` (all `npm run` commands execute from that directory):

- `npm start` - Start the Expo development server
- `npm run web` - Start the web development server (LAN host)
- `npm run android` - Run on Android (dev build or Expo Go)
- `npm run ios` - Run on iOS (dev build or Expo Go)
- `npm run export:web` - Export a static web build to `docs/` at the repo root
- `npm run lint` - Run ESLint (via `expo lint`)
- `npm test` - Run the Jest test suites (web + native projects)
- `npm run build:android:dev` - Local EAS build, Android dev APK (`builds/android-dev.apk`)
- `npm run build:android:preview` - Local EAS build, Android preview APK (`builds/android-preview.apk`)
- `npm run build:android:prod` - Local EAS build, Android production AAB (`builds/android-prod.aab`)
- `npm run build:android:prod-apk` - Local EAS build, Android production APK (`builds/android-prod.apk`)

### Testing

Tests are run with [Jest](https://jestjs.io/) and split into two projects:

- **web** (jsdom): pure TypeScript logic under `constants/`, `utils/`, `services/`, and `hooks/`
- **native** (`jest-expo`): React component tests under `components/` and `app/`

Run all tests:

```bash
cd src/MomsLifesaver
npm test
```

Run a single project or test file:

```bash
# Only the web project
npx jest --selectProjects web

# A single file
npx jest utils/__tests__/logger.test.ts
```

Static asset imports (`*.png`, `*.mp3`, `*.m4a`, etc.) are stubbed by `__mocks__/asset-stub.js`, and the Web Audio API is mocked in `jest.setup.ts` so `WebSound` can run headless.

### Health Checks

Before building or opening a PR, it's worth running:

```bash
cd src/MomsLifesaver
npx expo-doctor   # validate the Expo project configuration
npm run lint
npm test
```

### Building and Testing the Web Export

To build a static version of the web app for deployment:

1. **Export the web build**
   ```bash
   cd src/MomsLifesaver
   npm run export:web
   ```
   This creates a `docs` folder at the repository root with static files ready for deployment. The base URL (`/MomsLifesaver`) is configured in `app.json` under `experiments.baseUrl` to match the GitHub Pages subdirectory.

2. **Test the exported build locally**
   
   **Using npx (recommended, no installation needed):**
   ```bash
   # From repository root
   npx serve docs -p 8000
   ```
   Then open `http://localhost:8000` in your browser.
   
   **Alternative methods:**
   ```bash
   # Using Python
   cd docs
   python -m http.server 8000
   
   # Using Node.js http-server (if installed globally)
   cd docs
   http-server -p 8000
   ```

3. **Verify the build**
   - App loads correctly
   - Audio tracks are visible and playable
   - Volume controls work
   - No console errors in browser DevTools

The `docs` folder is automatically generated by GitHub Actions on each push to `main` and deployed to GitHub Pages. You don't need to commit the `docs` folder manually.

---

## Project Structure

The repository is laid out as follows:

```
MomsLifesaver/
├── .github/workflows/   # GitHub Actions (web export + GitHub Pages deploy)
├── docs/                # Generated static web build (published to GitHub Pages)
├── src/MomsLifesaver/   # Expo / React Native application source
└── tools/               # Local authoring tools for audio assets (Audacity, FFmpeg, yt-dlp)
```

The application itself lives under `src/MomsLifesaver/`:

```
src/MomsLifesaver/
├── app/           # Expo Router screens (playlist, index, +not-found, _layout)
├── components/    # UI components (track cards, playback bar, slider, ...)
│   ├── ui/        # Themed primitives (kept from the Expo template)
│   └── unused/    # Template components not currently wired into any screen
├── constants/     # Theme colors, typography, track library metadata
├── hooks/         # React hooks (audio controller, foreground service, media session, ...)
├── services/      # Platform playback service and the web Audio wrapper
├── utils/         # Logger, error handler, helpers
├── types/         # Ambient TypeScript declarations for asset imports
├── assets/        # Images, icons, and audio files (each subfolder has its own README)
├── scripts/       # Maintenance scripts (e.g. Expo template reset)
├── __mocks__/     # Jest stubs (static assets)
├── app.json       # Expo app configuration
├── eas.json       # EAS build profiles (dev / preview / production / production-apk)
├── jest.setup.ts  # Jest setup (Web Audio + HTMLMediaElement mocks)
└── package.json   # Scripts, dependencies, Jest projects
```

### Platform-specific files

Some modules ship both a native and a web implementation. Metro / Expo pick the
right file at build time based on the platform:

| Module                                | Native (iOS/Android)           | Web                              |
| ------------------------------------- | ------------------------------ | -------------------------------- |
| Foreground service hook               | `hooks/use-foreground-service.ts`      | `hooks/use-foreground-service.web.ts` |
| Playback service (notification glue)  | `services/playback-service.ts`         | `services/playback-service.web.ts`    |
| Color scheme hook                     | `hooks/use-color-scheme.ts`            | `hooks/use-color-scheme.web.ts`       |

---

## Contributing

I welcome contributions! Whether you're fixing bugs, adding features, improving documentation, or suggesting ideas, your help makes this project better for everyone.

### How to Contribute

1. **Fork the repository**
   - Click the "Fork" button at the top of this page

2. **Create a branch**
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```

3. **Make your changes**
   - Write clean, readable code
   - Follow the existing code style
   - Add comments where necessary
   - Test your changes

4. **Commit your changes**
   ```bash
   git commit -m "Add: description of your changes"
   ```
   Use clear, descriptive commit messages.

5. **Push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Open a Pull Request**
   - Go to the [Pull Requests](https://github.com/FilipeLopesPires/MomsLifesaver/pulls) page
   - Click "New Pull Request"
   - Select your fork and branch
   - Describe your changes clearly

### Reporting Issues

Found a bug or have a suggestion? Please [open an issue](https://github.com/FilipeLopesPires/MomsLifesaver/issues/new) and include:
- A clear description of the problem or suggestion
- Steps to reproduce (for bugs)
- Expected vs. actual behavior
- Screenshots (if applicable)
- Your environment (OS, device, Expo version, etc.)

---

## Feature Roadmap

- [x] (P1) Audio playback of: rain, water stream (soft / intense), kalimba, heartbeat, shush
- [x] (P1) Independent and simultaneous audio playback
- [x] (P1) Global and individual volume adjustment
- [x] (P1) Background audio playback
- [ ] (P1) Smooth volume adjustment (instead of instant)
- [ ] (P1) Playback timer with smooth fade-out
- [ ] (P2) Persistence of user's last volumes and timer settings
- [ ] (P2) Lock screen app controls
- [ ] (P2) App notifications and top bar controls
- [ ] (P3) Upgraded audio playlist
- [ ] (P3) Custom audio in-app upload

---

## License

This project is licensed under the **GNU General Public License v3.0** (GPL-3.0).

See the [LICENSE](LICENSE) file for the full license text.

### What this means:
- ✅ You can use, modify, and distribute this software
- ✅ You must include the original license and copyright notice
- ✅ You must make your modifications available under the same license
- ✅ You must disclose the source code when distributing

---

## Links

- **Issues**: [Report a bug or request a feature](https://github.com/FilipeLopesPires/MomsLifesaver/issues)
- **Pull Requests**: [Contribute code](https://github.com/FilipeLopesPires/MomsLifesaver/pulls)
- **Discussions**: [Join the conversation](https://github.com/FilipeLopesPires/MomsLifesaver/discussions) *(if enabled)*

---

## Acknowledgments

- Built with [Expo](https://expo.dev) and [React Native](https://reactnative.dev)
- Audio track sources and icon attributions are listed in
  [`src/MomsLifesaver/assets/audio/README.md`](src/MomsLifesaver/assets/audio/README.md)
  and [`src/MomsLifesaver/assets/icons/README.md`](src/MomsLifesaver/assets/icons/README.md)
- Special thanks to the open source community

---

**Made with ❤️ for parents everywhere**
