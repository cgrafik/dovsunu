# CLAUDE.md

This file guides Claude Code when working in this repository.

## What this is

**Şamarmatik 3000** (renamed from "Şaplak Şov" on 2026-10-18; repo/URL `dovsunu`) is a browser arcade game. The player uploads a photo, and the face is mapped onto a cartoon character. The player picks a setting and hits the character with slapstick tools for 60 seconds to build combos.

- **Language:** the UI, code comments and commit messages are in Turkish. Reply to the user in Turkish.
- **Separate project:** this is independent of MenuHoop (`~/menuhoop`). Don't mix the two. The folder name `taraftar-arcade` is historical: the first version had a football-fan theme, which was replaced at the user's request.
- **Content rule:** keep it cartoon slapstick only. No blood, no realistic injuries.
- **Privacy rule:** photos are processed only in the browser. Nothing is uploaded or stored.

## Stack and environment

- React 19, TypeScript 6 (`erasableSyntaxOnly`, so no enums or parameter properties), Vite 8, Canvas 2D, Web Audio, MediaPipe `tasks-vision`.
- **No backend and no paid API.**
- The code lives in WSL. Run commands there, for example: `wsl -d Ubuntu-24.04 -u grafik_bolat -- bash -lc "cd ~/taraftar-arcade && npm run build"`.
- Install with `npm install --legacy-peer-deps`, because npm 10.8.2 hits an "edgesOut" bug.
  - `postinstall` runs `scripts/setup-mediapipe.sh`, which copies the wasm into `public/mediapipe/` and downloads `public/models/face_landmarker.task`.
  - Both of those directories are gitignored.
- Git Bash on Windows mangles `$VAR`, `$()` and quotes inside `bash -lc '...'`. Put multi-step shell or Python into a script file and run that file instead.

## Commands

- `npm run dev`: dev server on port 5173.
- `npm run build`: type check plus build.
- `npm run preview`: serves the build on port 4173.
- `npm run lint`: runs oxlint.
- **End-to-end test:** run `bash scripts/make-fixtures.sh` once, start `npx vite preview --host 127.0.0.1 --port 4173`, then run `bash tests/run-e2e.sh masaustu|telefon`.
  - It uses Playwright from `~/.cache/mh-shot/node_modules`, which is shared with the MenuHoop tooling.
  - Screenshots go to `tests/out/`.
- **Contact sheets:** `bash tests/sheet.sh out.png a.png b.png c.png d.png` uses the ffmpeg binary in `~/menuhoop/tools/menu-visuals/ffbin/`.

## Architecture

- `src/game/`: canvas engine, independent of React.
  - `GameEngine.ts`: rAF loop, input, cooldowns, knockout every 10 combo hits, demo scene cycling, idle chatter.
  - `CharacterRenderer.ts`: spring-based pose, outfit and hat per scene, face jaw split, expressions.
  - `AnimationManager.ts`: tool effects, decals (hand print, bump, cream, water), particles, texts, speech bubble.
  - `scenes.ts`: the 6 scenes (office, ring, kitchen, school, beach, home). Each has a background and foreground drawing, plus outfit, hat, lines, finish banner and sign text.
  - `SoundManager.ts`: plays CC0 recordings from `public/sfx/` (sources in `public/sfx/KAYNAKLAR.md`, loaded after the first tap); falls back to procedural Web Audio sounds when a file is missing or still loading.
  - `ScoreManager.ts`: the single source of truth for score, combo and round.
  - `bodies.ts`: realistic AI-generated bodies (`public/bodies/*.webp`, 6 outfits × `m`/`f`, made with Canva AI; sources in `public/bodies/KAYNAKLAR.md`). Skin is retinted to the face at load; arms are part of the image. Falls back to the drawn body while loading. `CharacterLook.body` picks the gender. To regenerate: Canva generate-image → remove-background → place in a design → export PNG (transparent) → crop/scale script (see git history).
  - `taunts.ts`: taunt lines (`TAUNTS`) shown as speech bubbles at start, idle, miss, combo loss, last 10 s and sometimes after a hit; the jaw flaps briefly. Spoken TTS was tried and removed at the user's request (2026-10-18) — don't re-add voice synthesis.
  - `damage.ts`: permanent face damage for the round (redness, faint hand prints, bruises, forehead bump, crossed band-aids after 10/22 hits, shock soot, faint stamp ink). Painted with source-atop onto the renderer's working copies of the face textures (the FaceAsset stays clean) and re-uploaded via `FaceWarp.setTextures`, so marks follow the mesh. No blood or open wounds.
  - **No violence against women (user rule, 2026-10-18):** with `look.body === 'f'` only `soft` tools (pie, water, tickle, loan) work; the others keep their buttons but trigger `noViolence()`: "KADINA ŞİDDETE HAYIR!" banner, YUUUH, booing + whistles, no points, combo ends. Female body uses female yells (`yellF`) and a higher giggle (`giggleF`).
  - New-feature check: `node tests/new-shots.cjs` (damage, loan scenarios, female block) with the preview server running.
  - Kredi Çek has 5 random scenarios (burning money, bank call + interest, HACİZLİ tags, fainting, empty pockets with a moth).
  - `tools.ts`: the 10 tools, on keys 1–9 and 0 (Elektrik = cartoon zap: flash, frizzed hair, soot, smoke; Kredi Çek = forehead stamp, burning banknotes, tears). The user asked for strangling/torture too; that was declined (real person's photo) — keep it slapstick.
- `src/face/`: MediaPipe detection (GPU with CPU fallback), crop, feather, cartoon filter, mascot face.
  - Full head: `segmentPerson()` (MediaPipe selfie segmenter, `public/models/selfie_segmenter.tflite`) cuts the head with hair and ears from a crop `HEAD_EXPAND` (1.4×) wider; below the jawline is removed. `FaceAsset.expand/cutout` record this; features stay in normal-crop coordinates.
  - `FaceWarp.ts`: realistic face. The photo is stretched over the 468-point MediaPipe mesh (`meshData.ts`, generated by `node scripts/gen-face-mesh.mjs`) and drawn with WebGL into an offscreen canvas. Expression channels (jaw, blink, smile, brow, frown, pucker) bend the mesh; impacts make it jiggle. Eyes and mouth are mesh holes with photo patches underneath, so lids really close and the jaw really opens. Without landmarks or WebGL, the old overlay + jaw-split drawing is used.
  - Close-up check: `node tests/face-shots.cjs` (preview server running) → `tests/out/yuz-*.png`.
- `src/components/`: screens.
  - Start (with demo) → PhotoUpload/CropEditor → CharacterSetup (scene picker) → GameScreen (Hud, GameControls) → ResultsScreen.
- World coordinates are 800×1000, bottom-anchored. Extra canvas space goes to the top on phones and to the sides on wide screens, so scenes draw over a wide area.

## Working rules

- **Live on GitHub Pages:** public repo `cgrafik/dovsunu`, https://cgrafik.github.io/dovsunu/. Every push to `main` builds (lint + build with `BASE_PATH=/dovsunu/`) and deploys via `.github/workflows/pages.yml`, so push only with the user's approval.
- Live e2e: `URL=https://cgrafik.github.io/dovsunu/ node tests/e2e.cjs telefon` (with the `LD_LIBRARY_PATH` from `tests/run-e2e.sh`).
- The user doesn't want to run terminal commands. Run things yourself, and open files in VS Code when their input is needed.
- **Known gaps:**
  - Emoji show as boxes only in headless test Chromium.
  - Decals (hand print, cream) follow the head but not the face-mesh jiggle.
  - There is no saved high score.
  - The game hasn't been tested on a real phone yet.
