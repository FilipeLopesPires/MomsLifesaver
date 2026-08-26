# Mom's Lifesaver Product Concept

### Soothing audio tracks to help your baby sleep

Mom's Lifesaver is a focused, offline-first audio player designed to help
soothe and calm babies. It offers a small, curated library of looping
sounds (white noise, nature sounds, heartbeat, shushing, kalimba) that can
be played individually or layered to create a custom bedtime atmosphere.

The app is intentionally minimal: no accounts, no ads, no tracking. Just
audio that starts fast, keeps playing in the background, and responds to
system-level media controls.

## Principles

- **Private by default** - everything runs locally on the device; no
  network calls are made for playback, and saved preferences never leave
  the device.
- **Simple UI** - one screen, one job: pick tracks, mix volumes, press play.
- **Reliable background playback** - audio continues when the app is
  backgrounded or the screen is locked.
- **Cross-platform** - a single Expo / React Native codebase targets
  Android, iOS, and the web (GitHub Pages).

## What the app does today

- Shipped track library: kalimba, rain, soft water stream, intense water
  stream, heartbeat, shush (x3), shush (x5).
- Select one or more tracks by tapping their card; selected tracks play
  simultaneously and loop indefinitely.
- Per-track volume slider for mixing.
- Master volume slider that scales every playing track.
- Global play/pause and stop controls for the currently selected tracks.
- Android foreground service with a media-style notification exposing a
  play/pause button.
- Web [Media Session](https://developer.mozilla.org/en-US/docs/Web/API/Media_Session_API)
  integration so browser media keys and OS media widgets can control
  playback.
- Deep-linkable start positions: tracks with interesting cue points (e.g.
  kalimba) begin from a random cue on each new play.
- Persisted preferences: the selected tracks and their volumes (per-track and
  master) are saved on-device and restored on the next launch (restored
  paused, not auto-played).
- A settings screen, reached from an always-on gear, to manage the Android
  notification permission, toggle background playback, and reset saved
  preferences to defaults.

