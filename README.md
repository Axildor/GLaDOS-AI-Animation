# GLaDOS AI Animation Card for Home Assistant

<img width="954" height="439" alt="image" src="https://github.com/user-attachments/assets/8cf8be88-e375-46d2-9fb8-7db2061b308c" />

A highly responsive, fully animated GLaDOS custom card for Home Assistant. Built using zero-dependency CSS and SVG transitions, this card brings GLaDOS to life on your dashboard as a visual interface for your Voice Assistant satellites.

She tracks your voice assistant's state in real-time, features a randomized idle behavior engine, and includes a **dynamic, mathematically-driven dance engine** that syncs perfectly to your music.

## ✨ Features

* **Real-time State Tracking:** Seamlessly transitions between Idle, Listening (Blue), Processing (Orange/Pulsing), and Responding (Red/Talking).
* **Organic Idle Engine:** Uses a weighted randomizer to cycle through various idle animations (swaying, looking around, glitching, getting bored) so she never looks robotic or looped.
* **Performance Optimized:** Uses GPU-accelerated CSS `transform` and `opacity` properties, with bloom effects pre-baked as SVG gradients instead of runtime filters. Internal state-caching and garbage collection ensure zero memory leaks and negligible CPU drain.
* **Visual UI Editor:** Fully supports Home Assistant's visual card editor. No YAML configuration required!
* **Response Delay Timer:** Configurable delay to keep her in the "Processing" state a little longer before she starts talking, giving your TTS engine time to catch up.

## 🪩 The Dynamic Dance Engine

When your configured media player starts playing, GLaDOS enters a dedicated **Spotify Green** dance mode. 

Instead of a basic looped animation, she features a **Macro-Choreography Math Engine** that actively reads the tempo of your music and chains together **32 unique, tempo-locked dance routines**. Every 16 beats, she randomly switches her style so the animation stays fresh throughout a full song.

Her movement is built from three composable layers, the same way a real puppeteer works:
* **Groove Spring** — a physics-driven bob that gets a "kick" on every beat (harder on downbeats), so she never looks like she's marching to a metronome.
* **Keyframed Moves** — every pose change plays a cartoon-style *anticipation → hit → settle* sequence: she winds up opposite the move, snaps through with overshoot, then lands on the pose.
* **Syncopation & Breathing** — at 90+ BPM she adds half-beat "and" accents (counter-kicks, eye darts, LED flickers), and her bellows pump on the downbeats like she's breathing with the music.

Her personality shifts depending on the speed of the music:
* **Chill & Soulful (< 90 BPM):** Fluid, heavily relaxed movements. Half-note vertical nods, wide figure-8 sweeps, and heavy eyelids.
* **Groovy & Pop (90 - 124 BPM):** Confident and bouncy. Syncopated U-shaped sweeps, double-bounces, and standard left/right bobs.
* **Upbeat & Club (125 - 159 BPM):** Sharp, high-energy snaps. Rapid eye darts, diagonal snapping tilts, and 4-beat build-up zooms.
* **Intense & Hardcore (160+ BPM):** Aggressive and chaotic. Deep vertical headbangs, erratic twitching, and mechanical system overrides.

### ⚠️ Prerequisite for Dancing
For GLaDOS to sync her movements to the beat, **she needs to know the BPM of the currently playing song**. 

You will need an integration that provides a BPM sensor for your media player. I highly recommend using **[SongBPM-26](https://github.com/adix992/SongBPM-26)**, an integration specifically created to pull real-time track BPMs for this exact purpose.

## 📦 Installation

### HACS (Recommended)
1. Open HACS in your Home Assistant instance.
2. Go to **Frontend** > Top right menu > **Custom repositories**.
3. Add the URL to this repository and select **Lovelace** as the category.
4. Click Install and reload your browser.

### Manual
1. Download `glados-card.js` from the latest release.
2. Copy it into your `config/www/` directory.
3. Go to **Settings** > **Dashboards** > **Top right menu** > **Resources**.
4. Add `/local/glados-card.js` as a JavaScript Module.

## ⚙️ Configuration

You can easily configure the card using the Home Assistant visual editor simply by clicking "Add Card" and searching for "GLaDOS Custom Card". The visual editor uses Home Assistant's native form components (entity pickers, sliders, toggles, and the standard action editor), so it looks and behaves like a first-party card.

Alternatively, you can use YAML:

```yaml
type: custom:glados-card
entity: assist_satellite.living_room
media_entity: media_player.spotify
bpm_entity: sensor.universal_music_bpm
respond_delay: 2.5
zoom: 85 # Scale percentage of the SVG model inside the card. Default is 85. Above 100 the card grows to keep the model fully visible.
tap_action:
  action: more-info # Standard HA action: more-info, toggle, navigate, call-service, etc.
```

## Configuration Variables

| Name | Type | Requirement | Description |
| :--- | :--- | :--- | :--- |
| `type` | string | **Required** | Must be `custom:glados-card`. |
| `entity` | string | **Required** | The entity ID of your voice assistant satellite (e.g., `assist_satellite...`). |
| `media_entity` | string | Optional | The entity ID of your media player. Triggers the dance state when `playing`. |
| `bpm_entity` | string | Optional | The entity ID of the sensor providing the current song's BPM (requires [SongBPM-26](https://github.com/adix992/SongBPM-26)). Defaults to 120 if missing. |
| `respond_delay` | number | Optional | Number of seconds to wait before changing from Processing (Orange) to Responding (Red). Useful if your TTS has a slight delay. Default is `0`. |
| `zoom` | number | Optional | Scale percentage of the SVG model inside the card. Default is `85`. Above 100 the card slot grows with the model so it stays fully visible. |
| `transparent_bg` | boolean | Optional | Removes the card background, shadow, and border. Default is `false`. |
| `tap_enabled` | boolean | Optional | Enables the tap-to-bop interaction. Default is `true`. |
| `tap_action` | object | Optional | Standard HA action (`more-info`, `toggle`, `navigate`, `call-service`, etc.) fired on tap. Default is `{action: "none"}`. |
| `tap_speed` | number | Optional | Bop animation speed, `0.1` (slow) – `2.0` (fast). Default is `0.5`. |
| `tap_bounces` | number | Optional | Rebound oscillations before settling, `1`–`20`. Default is `5`. |
| `tap_intensity` | number | Optional | How far the head pulls back, `0.5`–`2`. Default is `1.0`. |
| `tap_bop_resume` | number | Optional | Point in the bop tail (fraction of max bounce) where the idle/dance head poses resume, `0.05`–`0.8`. Default is `0.3`. The bop plays on its own layer, so the background animation melds back in while the last small bounces are still finishing — no frozen ending. |

## 🧑‍💻 Development

The card source lives in small, focused ES modules under `src/` and is bundled into the single `glados-card.js` file that HACS distributes.

| Module | Responsibility |
| :--- | :--- |
| `src/index.js` | Entry point: custom element registration + card picker entry |
| `src/glados-card.js` | Card lifecycle, config, hass state diffing, tap handlers |
| `src/editor.js` | Declarative `getConfigForm()` schema for HA's native visual editor |
| `src/config.js` | Config sanitization/clamping (pure functions) |
| `src/state-mapper.js` | Voice/media/BPM state mapping (pure functions) |
| `src/template.js` | CSS + inline SVG markup (the GLaDOS model artwork) |
| `src/animator.js` | Element refs, motion primitives, timer/RAF registry |
| `src/states.js` | Per-state visual setup (idle/dancing/listening/processing/responding) |
| `src/behaviors/idle.js` | Weighted idle behaviors, lid loop, pupil darting |
| `src/behaviors/dance.js` | BPM-synced choreography engine |
| `src/behaviors/talk.js` | Responding-state talk animation |
| `src/behaviors/bop.js` | Spring-physics tap bop |
| `src/behaviors/spring.js` | Shared damped-oscillator spring physics |

### Building

```bash
npm install
npm run build    # bundles src/ -> glados-card.js
npm run verify   # build + syntax check
```

A GitHub Actions workflow automatically rebuilds `glados-card.js` on every push to `main`, so the committed bundle always matches the source. When contributing, edit files under `src/` only — never hand-edit `glados-card.js`.

## �️ Tech Stack & Optimization

This card is completely self-contained. It uses no external image files (everything is dynamically drawn via inline SVG), and all lighting blooms, shadows, and metallic reflections are calculated natively by the browser's SVG rendering engine.

### Performance Notes:

* **Zero-Drift Sync:** Uses `performance.now()` high-resolution timestamps to ensure dance moves stay locked to the beat during long playback sessions.
* **Firehose Gatekeeping:** Implements state-caching to ensure the card only recalculates animations when your tracked entities change, ignoring irrelevant Home Assistant state traffic.
* **Resource Management:** Automatically destroys all active timers and animation loops when the card is removed from the DOM to prevent memory leaks.
