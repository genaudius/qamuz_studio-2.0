# Qamuz Studio 2.0

Cross-platform DAW. Svelte 5 in the WebView, Tauri 2 as the native shell. Same `.dawproj` package the macOS 1.0 Swift build writes, so a project saved on either version opens in the other.

The 1.0 source in `../qamuz_studio 1.0` is left untouched. This folder is the Windows + Mac app.

## What runs today

- Arrange view, transport (BARS / TIME / BPM / SIG), mixer, piano roll, inspector, V-Rack
- Web Audio + AudioWorklet mixer (identical on Windows and macOS)
- MIDI input via Web MIDI, internal instruments
- Audio import (drag and drop), waveforms, play / record / loop / metronome
- Save and open `.dawproj` packages (`project.json` + `Audio Files/`)
- Generative Fill and the AI assistant, through the existing Supabase `claude-proxy` and `elevenlabs-proxy`
- Native cpal device list (the socket for the later low-latency graph and VST3 hosting)

## Requirements

- Node 20+
- Rust stable (`rustup`)
- Windows: Visual Studio Build Tools with the "Desktop development with C++" workload, WebView2 (ships with Windows 11)
- macOS: Xcode Command Line Tools

## Develop

```bash
npm install
npm run tauri dev
```

The UI also runs in a browser tab with `npm run dev` (port 1420). File dialogs and `.dawproj` I/O need the Tauri window.

## Tests

```bash
npm test
```

## Build

Windows (this machine):

```bash
npm run tauri build
```

Produces `.exe` / NSIS under `src-tauri/target/release/bundle/`.

macOS (your Mac), universal Intel + Apple Silicon:

```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm install
npm run tauri build -- --target universal-apple-darwin
```

Pushing a `v*` tag runs [`.github/workflows/release.yml`](.github/workflows/release.yml) on `windows-latest` and `macos-latest`.

## AI

Open the sparkles panel and paste the Supabase project URL + anon key from the 1.0 setup. The edge functions live in [`supabase/functions`](supabase/functions) (copies of the 1.0 proxies). Local Anthropic / ElevenLabs keys are a fallback and stay in `settings.json`, never in git.

Turn on Generative Fill (wand), drag a beat range on a track, describe the part. MIDI goes to Claude; audio goes to ElevenLabs.

## Layout

```text
src/                  Svelte 5 UI + TypeScript engine
  lib/core/           Project / Track / Clip models + Swift-compatible JSON
  lib/audio/          AudioBackend, WebAudioBackend, NativeAudioBackend
  lib/ai/             Claude, ElevenLabs, Generative Fill
src-tauri/            Rust: .dawproj I/O, cpal devices
supabase/functions/   Edge proxies (keys stay on the server)
```
