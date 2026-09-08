// src/config.js
function clampNum(val, def, min, max) {
  const n = Number(val !== void 0 && val !== null && val !== "" ? val : def);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}
function getStubConfig() {
  return {
    entity: "",
    media_entity: "",
    bpm_entity: "",
    respond_delay: 0,
    zoom: 85,
    transparent_bg: false,
    tap_enabled: true,
    tap_speed: 0.5,
    tap_bounces: 5,
    tap_intensity: 1,
    tap_action: { action: "none" }
  };
}
function sanitizeConfig(config) {
  const c = JSON.parse(JSON.stringify(config));
  if (!c.entity) {
    throw new Error("You need to define an entity");
  }
  c.zoom = clampNum(c.zoom, 85, 10, 200);
  c.respond_delay = clampNum(c.respond_delay, 0, 0, 16);
  c.tap_speed = clampNum(c.tap_speed, 0.5, 0.1, 2);
  c.tap_intensity = clampNum(c.tap_intensity, 1, 0.5, 2);
  c.tap_bounces = Math.round(clampNum(c.tap_bounces, 5, 1, 20));
  if (typeof c.tap_action === "string") {
    c.tap_action = { action: c.tap_action };
  } else if (!c.tap_action) {
    c.tap_action = { action: "none" };
  }
  return c;
}

// src/state-mapper.js
function mapVoiceState(raw) {
  const s = (raw || "idle").toLowerCase();
  if (s.includes("respond") || s.includes("speak") || s.includes("tts")) return "responding";
  if (s.includes("listen") || s.includes("wake")) return "listening";
  if (s.includes("process") || s.includes("think")) return "processing";
  if (s === "dancing") return "dancing";
  return "idle";
}
function resolveState(voiceState, mediaState) {
  let mapped = mapVoiceState(voiceState);
  if (mapped === "idle" && mediaState === "playing") mapped = "dancing";
  return mapped;
}
function parseBpm(rawBpm) {
  const n = parseFloat(rawBpm);
  return isNaN(n) ? 120 : n;
}

// src/template.js
function buildTemplate(config) {
  const zoom = config.zoom !== void 0 ? config.zoom : 85;
  const scale = zoom / 100;
  const width = 280 * scale;
  const height = 320 * scale;
  const bgStyle = config.transparent_bg ? "background: transparent; box-shadow: none; border: none;" : "background: var(--ha-card-background, var(--card-background-color, #1c1c1c));";
  return `
    <style>
      :host { display: flex; align-items: center; justify-content: center; ${bgStyle} border-radius: var(--ha-card-border-radius, 12px); overflow: hidden; width: 100%; }
      #scene { position: relative; width: ${width}px; height: ${height}px; display: flex; align-items: center; justify-content: center; }

      #hitbox { position: absolute; inset: 0; z-index: 100; cursor: pointer; display: none; }
      #glados-svg { width: 100%; height: 100%; display: block; overflow: visible; pointer-events: none; --led-color: #ffb800; --led-opacity: 0.15; }

      .led-dot, #ind-l1, #ind-l2, #ind-r1, #ind-r2 { transition: opacity 0.15s ease-out; fill: var(--led-color); opacity: var(--led-opacity); }
      .led-matrix.pulsing .led-dot { animation: led-pulse 0.9s ease-in-out infinite; }
      @keyframes led-pulse { 0%,100% { opacity: var(--led-opacity); } 50% { opacity: calc(var(--led-opacity) * 0.3); } }

      #body-pivot { transform-origin: 140px 116px; animation: body-sway 8s ease-in-out infinite; }
      @keyframes body-sway { 0%, 100% { transform: rotate(-1.4deg); } 50% { transform: rotate( 1.4deg); } }

      #head-sway-pivot { transform-origin: 140px 285px; animation: head-ambient-sway 13s ease-in-out infinite; }
      @keyframes head-ambient-sway { 0%, 100% { transform: rotate(-0.8deg); } 50% { transform: rotate(0.8deg); } }

      #torso-swivel { transform-origin: 140px 116px; transition: transform 2.0s cubic-bezier(0.45,0.05,0.55,0.95); }
      #glados-head { transform-box: view-box; transform-origin: 140px 285px; transition: transform 1.6s cubic-bezier(0.34, 1.06, 0.64, 1); }

      #eye-halo, #eye-center { transition: fill 0.8s ease-in-out; }
      .eye-layer { transition: opacity 0.8s ease-in-out; }
      @keyframes eye-breathe { 0%,100%{opacity:.02} 48%{opacity:.2} }
      #eye-halo.breathing { animation: eye-breathe 8s ease-in-out infinite; }
      @keyframes danger-flash { 0%,100%{opacity:0} 50%{opacity:1} }
      #danger-ring.active { animation: danger-flash .35s ease-in-out infinite; }
    </style>
    <div id="scene">
      <div id="hitbox" role="button" tabindex="0" aria-label="GLaDOS tap action"></div>
      <svg id="glados-svg" viewBox="0 116 280 320" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
        <defs>
          <linearGradient id="ceramicGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#8a8d94"/><stop offset="8%" stop-color="#b0b4bc"/><stop offset="8.5%" stop-color="#ffffff"/><stop offset="25%" stop-color="#ffffff"/><stop offset="75%" stop-color="#ffffff"/><stop offset="91.5%" stop-color="#e8eaec"/><stop offset="92%" stop-color="#a0a4ac"/><stop offset="100%" stop-color="#6a6d75"/></linearGradient>
          <linearGradient id="ceramicBackgroundGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#4a4d54"/><stop offset="8%" stop-color="#70747c"/><stop offset="8.5%" stop-color="#b0b4bc"/><stop offset="25%" stop-color="#b0b4bc"/><stop offset="75%" stop-color="#b0b4bc"/><stop offset="91.5%" stop-color="#a0a4ac"/><stop offset="92%" stop-color="#6a6d75"/><stop offset="100%" stop-color="#3a3d44"/></linearGradient>
          <linearGradient id="ceramicShadow" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ffffff" stop-opacity="0"/><stop offset="60%" stop-color="#60646c" stop-opacity="0.1"/><stop offset="85%" stop-color="#2a2c32" stop-opacity="0.5"/><stop offset="100%" stop-color="#0a0a0f" stop-opacity="0.85"/></linearGradient>
          <linearGradient id="bezelGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#4a4d54"/><stop offset="20%" stop-color="#6a6d75"/><stop offset="50%" stop-color="#3a3c42"/><stop offset="80%" stop-color="#1a1c20"/><stop offset="100%" stop-color="#0a0a0c"/></linearGradient>
          <linearGradient id="cavityGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#181a1c"/><stop offset="100%" stop-color="#30353a"/></linearGradient>
          <linearGradient id="trackGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#1a1c20"/><stop offset="50%" stop-color="#3a3e46"/><stop offset="100%" stop-color="#121316"/></linearGradient>
          <radialGradient id="eyeGradIdle" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#ffffff"/><stop offset="20%" stop-color="#ffcc00"/><stop offset="55%" stop-color="#d95500"/><stop offset="80%" stop-color="#7a1100"/><stop offset="100%" stop-color="#110000"/></radialGradient>
          <radialGradient id="eyeGradListen" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#ffffff"/><stop offset="25%" stop-color="#aaffff"/><stop offset="60%" stop-color="#00ccff"/><stop offset="85%" stop-color="#0066aa"/><stop offset="100%" stop-color="#001a33"/></radialGradient>
          <radialGradient id="eyeGradProcess" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#ffffff"/><stop offset="25%" stop-color="#ffddaa"/><stop offset="60%" stop-color="#ff6600"/><stop offset="85%" stop-color="#aa3300"/><stop offset="100%" stop-color="#220a00"/></radialGradient>
          <radialGradient id="eyeGradRespond" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#ffffff"/><stop offset="25%" stop-color="#ffaaaa"/><stop offset="60%" stop-color="#ff2200"/><stop offset="85%" stop-color="#aa0000"/><stop offset="100%" stop-color="#220000"/></radialGradient>
          <radialGradient id="eyeGradDance" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#ffffff"/><stop offset="20%" stop-color="#aaffaa"/><stop offset="55%" stop-color="#1DB954"/><stop offset="80%" stop-color="#0a5926"/><stop offset="100%" stop-color="#001a00"/></radialGradient>
          <filter id="softGlow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          <radialGradient id="haloGradIdle"><stop offset="0%" stop-color="#330800" stop-opacity="1"/><stop offset="60%" stop-color="#330800" stop-opacity="0.4"/><stop offset="100%" stop-color="#330800" stop-opacity="0"/></radialGradient>
          <radialGradient id="haloGradDance"><stop offset="0%" stop-color="#1DB954" stop-opacity="1"/><stop offset="60%" stop-color="#1DB954" stop-opacity="0.4"/><stop offset="100%" stop-color="#1DB954" stop-opacity="0"/></radialGradient>
          <radialGradient id="haloGradListen"><stop offset="0%" stop-color="#00ccff" stop-opacity="1"/><stop offset="60%" stop-color="#00ccff" stop-opacity="0.4"/><stop offset="100%" stop-color="#00ccff" stop-opacity="0"/></radialGradient>
          <radialGradient id="haloGradProcess"><stop offset="0%" stop-color="#ff6600" stop-opacity="1"/><stop offset="60%" stop-color="#ff6600" stop-opacity="0.4"/><stop offset="100%" stop-color="#ff6600" stop-opacity="0"/></radialGradient>
          <radialGradient id="haloGradRespond"><stop offset="0%" stop-color="#ff2200" stop-opacity="1"/><stop offset="60%" stop-color="#ff2200" stop-opacity="0.4"/><stop offset="100%" stop-color="#ff2200" stop-opacity="0"/></radialGradient>
          <linearGradient id="lidGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1f2124"/><stop offset="100%" stop-color="#08090a"/></linearGradient>
          <linearGradient id="lidGradFlip" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stop-color="#1f2124"/><stop offset="100%" stop-color="#08090a"/></linearGradient>
          <clipPath id="cavityClip"><rect x="97" y="283.25" width="66" height="161.5" rx="33"/></clipPath>
          <clipPath id="trackClip"><rect x="107" y="293.25" width="46" height="141.5" rx="23"/></clipPath>
          <clipPath id="eyeballClip"><circle cx="130" cy="364" r="25.5"/></clipPath>
        </defs>
        <g id="body-pivot">
          <g id="torso-swivel">
            <g id="torso" transform="matrix(1.2,0,0,1.2,-28,-23.2)">
              <ellipse cx="140" cy="116" rx="55" ry="15" fill="#1c1c26" stroke="#0c0c12" stroke-width="1.2"/>
              <ellipse cx="140" cy="116" rx="46" ry="11" fill="#141420" stroke="#1e1e2c" stroke-width="0.7"/>
              <path d="m 94,126 -8,8 -2,66 q 0,10 10,12 h 92 q 10,-2 10,-12 l -2,-66 -8,-8 z" fill="url(#ceramicBackgroundGrad)" stroke="#6a6d75" stroke-width="1.4"/>
              <path d="m 90,132 -28,8 -4,40 4,16 12,4 16,-4 z" fill="url(#ceramicBackgroundGrad)" stroke="#6a6d75" stroke-width="1"/>
              <path d="m 90,136 -24,7 -4,35 4,14 10,4 14,-4 z" fill="#eeeeee" opacity="0.05"/>
              <circle cx="60" cy="168" r="9" fill="#14141c" stroke="#0c0c12" stroke-width="1"/>
              <circle cx="60" cy="168" r="5.5" fill="#0c0c10" stroke="#1a1a22" stroke-width="0.8"/>
              <path d="m 90,132 c -4,20 -6,40 -4,60" stroke="#1a1a22" stroke-width="2.5" fill="none" opacity="0.8"/>
              <path d="m 190,132 28,8 4,40 -4,16 -12,4 -16,-4 z" fill="url(#ceramicBackgroundGrad)" stroke="#6a6d75" stroke-width="1"/>
              <path d="m 190,136 24,7 4,35 -4,14 10,4 14,-4 z" fill="#eeeeee" opacity="0.05"/>
              <circle cx="220" cy="168" r="9" fill="#14141c" stroke="#0c0c12" stroke-width="1"/>
              <circle cx="220" cy="168" r="5.5" fill="#0c0c10" stroke="#1a1a22" stroke-width="0.8"/>
              <path d="m 190,132 c 4,20 6,40 4,60" stroke="#1a1a22" stroke-width="2.5" fill="none" opacity="0.8"/>
              <line x1="90" y1="152" x2="190" y2="152" stroke="#6a6d75" stroke-width="1"/>
              <line x1="89" y1="174" x2="191" y2="174" stroke="#6a6d75" stroke-width="1"/>
              <line x1="140" y1="128" x2="140" y2="210" stroke="#6a6d75" stroke-width="1"/>
              <rect x="94" y="135" width="36" height="20" rx="2.5" fill="#050508" stroke="#101014" stroke-width="0.6"/>
              <rect x="96" y="137" width="32" height="16" rx="1.5" fill="#020202"/>
              <g id="led-matrix-left" class="led-matrix">
                <rect class="led-dot" x="98" y="140" width="28" height="2" rx="1"/>
                <rect class="led-dot" x="98" y="145" width="28" height="2" rx="1"/>
                <rect class="led-dot" x="98" y="150" width="28" height="2" rx="1"/>
              </g>
              <rect x="150" y="135" width="36" height="20" rx="2.5" fill="#050508" stroke="#101014" stroke-width="0.6"/>
              <rect x="152" y="137" width="32" height="16" rx="1.5" fill="#020202"/>
              <g id="led-matrix-right" class="led-matrix">
                <rect class="led-dot" x="154" y="140" width="28" height="2" rx="1"/>
                <rect class="led-dot" x="154" y="145" width="28" height="2" rx="1"/>
                <rect class="led-dot" x="154" y="150" width="28" height="2" rx="1"/>
              </g>
              <circle cx="100" cy="180" r="2.5" fill="#0a0a0e" stroke="#101014" stroke-width="0.5"/>
              <circle id="ind-l1" cx="100" cy="180" r="1.5"/>
              <circle cx="108" cy="180" r="2.5" fill="#0a0a0e" stroke="#101014" stroke-width="0.5"/>
              <circle id="ind-l2" cx="108" cy="180" r="1.5"/>
              <circle cx="172" cy="180" r="2.5" fill="#0a0a0e" stroke="#101014" stroke-width="0.5"/>
              <circle id="ind-r1" cx="172" cy="180" r="1.5"/>
              <circle cx="180" cy="180" r="2.5" fill="#0a0a0e" stroke="#101014" stroke-width="0.5"/>
              <circle id="ind-r2" cx="180" cy="180" r="1.5"/>
            </g>
          </g>
        </g>
        <g id="glados-head-wrapper" transform="translate(0, -65)">
          <g id="head-sway-pivot">
            <g id="glados-head">
              <ellipse cx="140" cy="285" rx="18" ry="6" fill="#181824" stroke="#0a0a0f" stroke-width="1"/>
              <ellipse cx="140" cy="285" rx="12" ry="3.8" fill="#101015" stroke="#181824" stroke-width="0.6"/>
              <g id="Group_White_Casing">
                <path id="rect74" fill="url(#ceramicGrad)" d="m 135,232 h 10 c 20.41692,0 38.38909,10.09589 49.21698,25.58812 L 205,276.8 c 0,0 2.4,52.45447 2.4,78.7 0,26.24553 -2.4,78.7 -2.4,78.7 l -10.77334,19.19803 C 183.3998,468.8981 165.423,479 145,479 H 135 C 114.59769,479 96.636634,468.91856 85.806278,453.44514 L 75,434.2 c 0,0 -2.4,-52.45447 -2.4,-78.7 0,-26.24553 2.4,-78.7 2.4,-78.7 L 85.808333,257.55193 C 96.638906,242.08017 114.59898,232 135,232 Z"/>
                <rect x="75" y="232" width="130" height="247" rx="60" fill="url(#ceramicShadow)"/>
              </g>
              <g id="Group_Faceplate_Inset">
                <rect x="93" y="279.25" width="76" height="171.5" rx="38" fill="#000" opacity="0.6" filter="url(#softGlow)"/>
                <rect x="91" y="277.25" width="78" height="173.5" rx="39" fill="url(#bezelGrad)" stroke="#1a1c22" stroke-width="1"/>
                <rect x="93" y="279.25" width="74" height="169.5" rx="37" fill="none" stroke="#6a6d75" stroke-width="1.5"/>
                <g clip-path="url(#cavityClip)">
                  <rect x="97" y="283.25" width="66" height="161.5" rx="33" fill="url(#cavityGrad)"/>
                  <rect x="97" y="283.25" width="66" height="161.5" rx="33" fill="none" stroke="#050607" stroke-width="5" opacity="0.9"/>
                  <rect x="107" y="293.25" width="46" height="141.5" rx="23" fill="url(#trackGrad)" stroke="#000000" stroke-width="3"/>
                  <g clip-path="url(#trackClip)">
                    <g id="bellows" style="transition: transform 0.15s ease-out;">
                      <g stroke="#000" stroke-width="4.5" stroke-linecap="butt" opacity="0.9">
                        <line x1="107" y1="140" x2="153" y2="140"/><line x1="107" y1="152" x2="153" y2="152"/><line x1="107" y1="164" x2="153" y2="164"/><line x1="107" y1="176" x2="153" y2="176"/><line x1="107" y1="188" x2="153" y2="188"/><line x1="107" y1="200" x2="153" y2="200"/><line x1="107" y1="212" x2="153" y2="212"/><line x1="107" y1="224" x2="153" y2="224"/><line x1="107" y1="236" x2="153" y2="236"/><line x1="107" y1="248" x2="153" y2="248"/><line x1="107" y1="260" x2="153" y2="260"/><line x1="107" y1="272" x2="153" y2="272"/><line x1="107" y1="284" x2="153" y2="284"/><line x1="107" y1="296" x2="153" y2="296"/><line x1="107" y1="308" x2="153" y2="308"/><line x1="107" y1="320" x2="153" y2="320"/><line x1="107" y1="332" x2="153" y2="332"/><line x1="107" y1="344" x2="153" y2="344"/><line x1="107" y1="356" x2="153" y2="356"/><line x1="107" y1="368" x2="153" y2="368"/><line x1="107" y1="380" x2="153" y2="380"/><line x1="107" y1="392" x2="153" y2="392"/><line x1="107" y1="404" x2="153" y2="404"/><line x1="107" y1="416" x2="153" y2="416"/><line x1="107" y1="428" x2="153" y2="428"/><line x1="107" y1="440" x2="153" y2="440"/><line x1="107" y1="452" x2="153" y2="452"/><line x1="107" y1="464" x2="153" y2="464"/><line x1="107" y1="476" x2="153" y2="476"/><line x1="107" y1="488" x2="153" y2="488"/><line x1="107" y1="500" x2="153" y2="500"/><line x1="107" y1="512" x2="153" y2="512"/><line x1="107" y1="524" x2="153" y2="524"/>
                      </g>
                    </g>
                  </g>
                  <g id="eyeball-assembly" style="transition: transform 0.15s ease-out;">
                    <circle cx="130" cy="364" r="26" fill="#1c1e22" stroke="#000000" stroke-width="2"/>
                    <circle cx="130" cy="364" r="23" fill="#0a0b0c"/>
                    <circle cx="147" cy="388" r="3.5" fill="#1a0000" stroke="#000000" stroke-width="1"/>
                    <circle id="indicator-dot" cx="147" cy="388" r="2.5" fill="#ff2200" opacity="0.8" filter="url(#softGlow)"/>
                    <circle id="eye-halo" cx="130" cy="364" r="25" fill="url(#haloGradIdle)" opacity=".05"/>
                    <g id="eye-pupil" style="transition: transform 0.15s ease-out;">
                      <circle id="eye-layer-idle" cx="130" cy="364" r="17.6" fill="url(#eyeGradIdle)" filter="url(#softGlow)" class="eye-layer" opacity="1" />
                      <circle id="eye-layer-listen" cx="130" cy="364" r="17.6" fill="url(#eyeGradListen)" filter="url(#softGlow)" class="eye-layer" opacity="0" />
                      <circle id="eye-layer-process" cx="130" cy="364" r="17.6" fill="url(#eyeGradProcess)" filter="url(#softGlow)" class="eye-layer" opacity="0" />
                      <circle id="eye-layer-respond" cx="130" cy="364" r="17.6" fill="url(#eyeGradRespond)" filter="url(#softGlow)" class="eye-layer" opacity="0" />
                      <circle id="eye-layer-dance" cx="130" cy="364" r="17.6" fill="url(#eyeGradDance)" filter="url(#softGlow)" class="eye-layer" opacity="0" />
                      <circle id="eye-center" cx="130" cy="364" r="6.6" fill="#ffe855" />
                      <circle cx="128" cy="362" r="2.2" fill="#ffffff" opacity="0.7" />
                    </g>
                    <g clip-path="url(#eyeballClip)">
                      <path id="eye-lid" d="m 80,200 h 100 v 164 h -24 a 26,26 0 0 0 -52,0 H 80 Z" fill="url(#lidGrad)" stroke="#000000" stroke-width="2"/>
                      <path id="eye-lid-bottom" d="M 80,500 H 180 V 364 h -24 a 26,26 0 0 1 -52,0 H 80 Z" fill="url(#lidGradFlip)" stroke="#000000" stroke-width="2"/>
                    </g>
                  </g>
                </g>
              </g>
              <path d="m 92,359 5,2 v 6 l -5,2 z" fill="#050505"/>
              <path d="m 92,379 5,2 v 8 l -5,2 z" fill="#050505"/>
              <rect id="danger-ring" x="97" y="283.25" width="66" height="161.5" rx="33" fill="none" stroke="#ff2200" stroke-width="2" opacity="0"/>
            </g>
          </g>
        </g>
      </svg>
    </div>
  `;
}

// src/animator.js
var GladosAnimator = class {
  constructor(shadowRoot) {
    const root = shadowRoot;
    this.el = {
      svg: root.getElementById("glados-svg"),
      head: root.getElementById("glados-head"),
      torsoSwivel: root.getElementById("torso-swivel"),
      hitbox: root.getElementById("hitbox"),
      eyeLayerIdle: root.getElementById("eye-layer-idle"),
      eyeLayerListen: root.getElementById("eye-layer-listen"),
      eyeLayerProcess: root.getElementById("eye-layer-process"),
      eyeLayerRespond: root.getElementById("eye-layer-respond"),
      eyeLayerDance: root.getElementById("eye-layer-dance"),
      eyeHalo: root.getElementById("eye-halo"),
      eyeCenter: root.getElementById("eye-center"),
      pupil: root.getElementById("eye-pupil"),
      eyeball: root.getElementById("eyeball-assembly"),
      bellows: root.getElementById("bellows"),
      lidTop: root.getElementById("eye-lid"),
      lidBot: root.getElementById("eye-lid-bottom"),
      dangerRing: root.getElementById("danger-ring"),
      ledMatrices: root.querySelectorAll(".led-matrix")
    };
    this.currentBaseLid = 0;
    this.currentLedColor = "#ffb800";
    this.currentLedOpacity = "0.15";
    this._timers = /* @__PURE__ */ new Map();
    this._rafs = /* @__PURE__ */ new Map();
  }
  // ---- Tracked scheduling (the ONLY way behaviors may schedule work) ----
  setTimeout(name, fn, delay) {
    this.clearTimeout(name);
    const id = setTimeout(() => {
      this._timers.delete(name);
      fn();
    }, delay);
    this._timers.set(name, id);
    return id;
  }
  clearTimeout(name) {
    const id = this._timers.get(name);
    if (id !== void 0) {
      clearTimeout(id);
      this._timers.delete(name);
    }
  }
  requestRaf(name, fn) {
    this.cancelRaf(name);
    const id = requestAnimationFrame((now) => {
      this._rafs.delete(name);
      fn(now);
    });
    this._rafs.set(name, id);
    return id;
  }
  cancelRaf(name) {
    const id = this._rafs.get(name);
    if (id !== void 0) {
      cancelAnimationFrame(id);
      this._rafs.delete(name);
    }
  }
  /** Tear down every tracked timer and RAF. */
  stopAll() {
    for (const id of this._timers.values()) clearTimeout(id);
    for (const id of this._rafs.values()) cancelAnimationFrame(id);
    this._timers.clear();
    this._rafs.clear();
  }
  // ---- Motion primitives (1:1 ports of the original initGlados closures) ----
  setHead(rot, tx, ty, scale = 1, dur, ease = "cubic-bezier(0.34,1.06,0.64,1)") {
    this.el.head.style.transition = `transform ${dur}s ${ease}`;
    this.el.head.style.transform = `translate3d(${tx}px,${ty}px,0) rotate(${rot}deg) scale(${scale})`;
  }
  setBodySwivel(rot, sx, dur) {
    this.el.torsoSwivel.style.transition = `transform ${dur || 2}s cubic-bezier(0.45,0.05,0.55,0.95)`;
    this.el.torsoSwivel.style.transform = `rotate(${rot}deg) scaleX(${sx || 1})`;
  }
  resetBodySwivel() {
    this.el.torsoSwivel.style.transition = `transform 2.0s cubic-bezier(0.45,0.05,0.55,0.95)`;
    this.el.torsoSwivel.style.transform = "";
  }
  setLid(amount, dur = 0.7) {
    const px = amount * 17;
    this.el.lidTop.style.transition = `transform ${dur}s ease-in-out`;
    this.el.lidBot.style.transition = `transform ${dur}s ease-in-out`;
    this.el.lidTop.style.transform = `translate3d(0, ${px}px, 0)`;
    this.el.lidBot.style.transform = `translate3d(0, ${-px}px, 0)`;
  }
  setBaseLid(amount, dur = 0.7) {
    this.currentBaseLid = amount;
    this.setLid(amount, dur);
  }
  setPupil(px, py) {
    this.el.pupil.style.transform = `translate3d(${px}px, ${py}px, 0)`;
    const ey = py * 1.5;
    this.el.eyeball.style.transform = `translate3d(0, ${ey}px, 0)`;
    this.el.bellows.style.transform = `translate3d(0, ${ey}px, 0)`;
  }
  setLEDs(color, opacity) {
    this.currentLedColor = color;
    this.currentLedOpacity = opacity;
    this.el.svg.style.setProperty("--led-color", color);
    this.el.svg.style.setProperty("--led-opacity", opacity);
  }
};

// src/behaviors/idle.js
function lidLoop(card, now) {
  const a = card.animator;
  const st = card._state;
  if (st !== "idle" && st !== "processing") return;
  if (now >= a._nextLidAt) {
    if (st === "idle") {
      const val = Math.max(0, Math.min(1, a.currentBaseLid + (Math.random() - 0.5) * 0.15));
      a.setLid(val, 0.5 + Math.random() * 0.8);
      a._nextLidAt = now + 1500 + Math.random() * 2500;
    } else {
      const val = 0.5 + Math.random() * 0.35;
      a.setLid(val, 0.15 + Math.random() * 0.25);
      a._nextLidAt = now + 120 + Math.random() * 280;
    }
  }
  a.requestRaf("lid-loop", (t) => lidLoop(card, t));
}
function startLidBehavior(card) {
  stopLidBehavior(card);
  card.animator._nextLidAt = 0;
  card.animator.requestRaf("lid-loop", (now) => lidLoop(card, now));
}
function stopLidBehavior(card) {
  card.animator.cancelRaf("lid-loop");
}
var IDLE_BEHAVIORS = [
  {
    name: "passive",
    exec(card, a) {
      a.setHead(0, 0, 0, 1, 2.4);
      a.setBaseLid(0, 1);
      a.resetBodySwivel();
    },
    min: 6e3,
    max: 13e3,
    weight: 4
  },
  {
    name: "scan_right",
    exec(card, a) {
      a.setHead(12, 0, -5, 0.98, 1.4);
      a.setBaseLid(0, 1);
      a.setBodySwivel(-2, 1, 1.8);
    },
    min: 3500,
    max: 7e3,
    weight: 1.5
  },
  {
    name: "scan_left",
    exec(card, a) {
      a.setHead(-12, 0, -5, 0.98, 1.4);
      a.setBaseLid(0, 1);
      a.setBodySwivel(2, 1, 1.8);
    },
    min: 3500,
    max: 7e3,
    weight: 1.5
  },
  {
    name: "curious",
    exec(card, a) {
      a.setHead(8, 0, -20, 1.05, 1.2);
      a.setBaseLid(0, 0.8);
      a.setBodySwivel(-2, 1, 1.6);
    },
    min: 4e3,
    max: 8e3,
    weight: 2
  },
  {
    name: "contemptuous",
    exec(card, a) {
      a.setHead(-6, 0, 15, 0.95, 1.8);
      a.setBaseLid(0.65, 1);
      a.setBodySwivel(1.5, 1, 2);
      a.setTimeout("idle-blink", () => {
        if (card._state === "idle") a.setBaseLid(0, 1.5);
      }, 1500);
    },
    min: 5e3,
    max: 1e4,
    weight: 2
  },
  {
    name: "alert",
    exec(card, a) {
      a.setHead(0, 0, -25, 1.08, 0.28);
      a.setBaseLid(0, 0.2);
      a.setBodySwivel(-1, 1, 0.4);
    },
    min: 1500,
    max: 3e3,
    weight: 1
  },
  {
    name: "bored",
    exec(card, a) {
      a.setHead(2, 0, 20, 0.96, 2.8);
      a.setBaseLid(0.7, 1.5);
      a.setBodySwivel(1, 1, 3);
      a.setTimeout("idle-blink", () => {
        if (card._state === "idle") a.setBaseLid(0, 1.5);
      }, 1500);
    },
    min: 7e3,
    max: 14e3,
    weight: 1.5
  },
  {
    name: "full_swivel",
    exec(card, a) {
      a.setBodySwivel(-6, 0.96, 2.5);
      a.setTimeout("idle-blink", () => {
        a.setHead(6, 0, -3, 1.02, 1.2);
        a.setBaseLid(0, 0.8);
      }, 600);
    },
    min: 4e3,
    max: 8e3,
    weight: 0.8
  },
  {
    name: "glitch",
    exec(card, a) {
      let count = 0, lastTime = 0;
      a.cancelRaf("idle-glitch");
      const glitchLoop = (timestamp) => {
        if (!lastTime) lastTime = timestamp;
        if (timestamp - lastTime > 60) {
          lastTime = timestamp;
          if (card._state !== "idle" || count > 12) {
            a.cancelRaf("idle-glitch");
            if (card._state === "idle") {
              a.el.eyeHalo.setAttribute("fill", "url(#haloGradIdle)");
              a.el.eyeCenter.setAttribute("fill", "#ffcc00");
              a.setHead(0, 0, 0, 1, 0.4);
            }
            return;
          }
          a.setHead((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, 1, 0.05, "linear");
          if (count % 2 === 0) {
            a.el.eyeHalo.setAttribute("fill", "#110000");
            a.el.eyeCenter.setAttribute("fill", "#884400");
          } else {
            a.el.eyeHalo.setAttribute("fill", "#ffb800");
            a.el.eyeCenter.setAttribute("fill", "#ffffff");
          }
          count++;
        }
        a.requestRaf("idle-glitch", glitchLoop);
      };
      a.requestRaf("idle-glitch", glitchLoop);
    },
    min: 4e3,
    max: 7e3,
    weight: 0.3
  }
];
function dartPupil(card) {
  if (card._state === "idle") {
    const max = 7;
    card.animator.setPupil((Math.random() - 0.5) * max * 2, (Math.random() - 0.5) * max * 2);
    card.animator.setTimeout("idle-pupil", () => dartPupil(card), 600 + Math.random() * 2500);
  }
}
function runNextIdleBehavior(card) {
  if (card._state !== "idle") return;
  const a = card.animator;
  let r = Math.random() * IDLE_BEHAVIORS.reduce((s, b) => s + b.weight, 0);
  let chosen = IDLE_BEHAVIORS[0];
  for (const b of IDLE_BEHAVIORS) {
    r -= b.weight;
    if (r <= 0) {
      chosen = b;
      break;
    }
  }
  try {
    chosen.exec(card, a);
  } catch (err) {
  }
  a.setTimeout("idle-behavior", () => runNextIdleBehavior(card), chosen.min + Math.random() * (chosen.max - chosen.min));
}
function startIdleCycle(card) {
  stopIdleCycle2(card);
  dartPupil(card);
  card.animator.setTimeout("idle-behavior", () => runNextIdleBehavior(card), 2e3 + Math.random() * 3e3);
}
function stopIdleCycle2(card) {
  card.animator.clearTimeout("idle-behavior");
  card.animator.clearTimeout("idle-pupil");
  card.animator.clearTimeout("idle-blink");
  card.animator.cancelRaf("idle-glitch");
}

// src/behaviors/dance.js
function startDanceCycle(card, bpm) {
  const a = card.animator;
  stopDanceCycle(card);
  let dancePhase = 0;
  let currentRoutine = Math.floor(Math.random() * 8);
  const currentBpm = Math.max(60, Math.min(200, bpm));
  const beatMs = 60 / currentBpm * 1e3;
  const beatSec = beatMs / 1e3;
  let expectedNextTick = performance.now() + beatMs;
  const step = () => {
    if (card._state !== "dancing") return;
    if (dancePhase > 0 && dancePhase % 16 === 0) {
      let nextRoutine;
      do {
        nextRoutine = Math.floor(Math.random() * 8);
      } while (nextRoutine === currentRoutine);
      currentRoutine = nextRoutine;
    }
    const choreoBlock = currentRoutine;
    const isDownBeat = dancePhase % 2 === 0;
    const isQuadBeat = dancePhase % 4 === 0;
    const phaseMod4 = dancePhase % 4;
    const phaseMod8 = dancePhase % 8;
    const dirX = isDownBeat ? 1 : -1;
    a.setLEDs("#1DB954", "1");
    a.el.eyeHalo.style.opacity = choreoBlock === 7 ? "0.8" : "0.5";
    a.el.eyeCenter.style.transform = "scale(1.2)";
    a.setTimeout("dance-led", () => {
      if (card._state === "dancing") {
        a.setLEDs("#1DB954", "0.15");
        a.el.eyeHalo.style.opacity = "0.05";
        a.el.eyeCenter.style.transform = "scale(1)";
      }
    }, beatMs * 0.3);
    let r = 0, tx = 0, ty = 0, s = 1, lid = 0, ease = "ease-in-out";
    let moveDur = beatSec;
    let bodyDur = beatSec * 2;
    const executeTick = () => {
      dancePhase++;
      const now = performance.now();
      if (now > expectedNextTick + beatMs) {
        expectedNextTick = now;
      } else {
        expectedNextTick += beatMs;
      }
      const delay = Math.max(0, expectedNextTick - now);
      a.setTimeout("dance-step", step, delay);
    };
    if (currentBpm < 90) {
      moveDur = beatSec * 2;
      bodyDur = beatSec * 4;
      ease = "ease-in-out";
      lid = 0.4;
      if (choreoBlock === 0) {
        r = isQuadBeat ? 8 : -8;
        tx = isQuadBeat ? 5 : -5;
        ty = 2;
      } else if (choreoBlock === 1) {
        r = 0;
        tx = 0;
        ty = isQuadBeat ? 15 : -5;
      } else if (choreoBlock === 2) {
        r = Math.sin(dancePhase * Math.PI / 2) * 6;
        tx = Math.sin(dancePhase * Math.PI / 2) * 5;
        ty = Math.cos(dancePhase * Math.PI / 4) * 8 + 4;
      } else if (choreoBlock === 3) {
        r = phaseMod8 < 4 ? 10 : -10;
        tx = phaseMod8 < 4 ? 4 : -4;
        ty = 5;
      } else if (choreoBlock === 4) {
        r = Math.sin(dancePhase * Math.PI / 4) * 12;
        tx = 0;
        ty = 0;
      } else if (choreoBlock === 5) {
        r = isQuadBeat ? 4 : -4;
        tx = 0;
        ty = isQuadBeat ? 12 : 2;
        s = isQuadBeat ? 1.03 : 1;
      } else if (choreoBlock === 6) {
        r = phaseMod8 === 0 ? 12 : phaseMod8 === 4 ? -6 : 0;
        tx = r * 0.5;
        ty = 8;
      } else {
        r = 0;
        tx = 0;
        ty = 2;
        s = 1.05;
        lid = 0.5 + Math.sin(dancePhase * Math.PI / 2) * 0.3;
      }
      if (!isDownBeat) return executeTick();
    } else if (currentBpm < 125) {
      moveDur = beatSec * 0.8;
      ease = "cubic-bezier(0.34, 1.06, 0.64, 1)";
      lid = 0.2;
      if (choreoBlock === 0) {
        r = isDownBeat ? 7 : -7;
        ty = isDownBeat ? 8 : -2;
        s = isDownBeat ? 1.02 : 1;
      } else if (choreoBlock === 1) {
        const side = phaseMod4 < 2 ? 1 : -1;
        r = side * 8;
        tx = side * 4;
        ty = isDownBeat ? 10 : 2;
      } else if (choreoBlock === 2) {
        r = phaseMod4 === 0 ? 10 : phaseMod4 === 2 ? -10 : 0;
        ty = phaseMod4 === 1 || phaseMod4 === 3 ? 12 : 0;
        ease = "ease-in-out";
      } else if (choreoBlock === 3) {
        r = [10, 5, -10, -5][phaseMod4];
        ty = [0, 8, 0, 8][phaseMod4];
      } else if (choreoBlock === 4) {
        r = 0;
        tx = isDownBeat ? 8 : -8;
        ty = 4;
      } else if (choreoBlock === 5) {
        r = isDownBeat ? 10 : -10;
        tx = isDownBeat ? 5 : -5;
        ty = isDownBeat ? 10 : -5;
      } else if (choreoBlock === 6) {
        r = dirX * 6;
        ty = !isDownBeat ? 14 : 0;
        s = !isDownBeat ? 1.04 : 1;
      } else {
        const side = dancePhase % 3 === 0 ? -1 : 1;
        r = side * 8;
        ty = isDownBeat ? 8 : 0;
      }
    } else if (currentBpm < 160) {
      moveDur = beatSec * 0.6;
      ease = "cubic-bezier(0.25, 0.8, 0.25, 1)";
      lid = isDownBeat ? 0.1 : 0;
      if (choreoBlock === 0) {
        r = isDownBeat ? 12 : -12;
        tx = isDownBeat ? 6 : -6;
        ty = isDownBeat ? 10 : -8;
        s = 1.03;
      } else if (choreoBlock === 1) {
        r = 0;
        tx = [8, 0, -8, 0][phaseMod4];
        ty = isDownBeat ? 5 : -5;
        if (phaseMod4 === 3) lid = 0.6;
      } else if (choreoBlock === 2) {
        r = isDownBeat ? 5 : -5;
        ty = isDownBeat ? 5 : -2;
        s = 1 + phaseMod4 * 0.03;
        lid = 0.4 - phaseMod4 * 0.1;
      } else if (choreoBlock === 3) {
        r = isDownBeat ? 15 : -15;
        tx = isDownBeat ? 5 : -5;
        ty = 8;
      } else if (choreoBlock === 4) {
        r = [10, 10, -10, -10][phaseMod4];
        tx = [5, 5, -5, -5][phaseMod4];
        ty = [8, -2, 8, -2][phaseMod4];
      } else if (choreoBlock === 5) {
        r = dirX * 10;
        ty = isDownBeat ? 12 : 4;
        s = 1.02;
        moveDur = beatSec * 0.4;
        ease = "linear";
      } else if (choreoBlock === 6) {
        r = phaseMod4 === 1 || phaseMod4 === 3 ? 0 : phaseMod4 === 0 ? 12 : -12;
        ty = phaseMod4 === 1 || phaseMod4 === 3 ? 14 : -2;
      } else {
        r = isDownBeat ? 12 : 12;
        tx = isDownBeat ? 8 : 8;
        ty = isDownBeat ? 8 : -4;
        if (isDownBeat) moveDur = beatSec * 0.1;
        else moveDur = beatSec * 0.8;
      }
      if (isDownBeat && choreoBlock !== 2) a.setPupil((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 6);
    } else {
      moveDur = beatSec * 0.8;
      ease = "linear";
      lid = isQuadBeat ? 0.4 : 0;
      if (choreoBlock === 0) {
        r = 0;
        tx = 0;
        ty = isDownBeat ? 20 : -10;
        s = isDownBeat ? 1.08 : 0.95;
        ease = "ease-out";
      } else if (choreoBlock === 1) {
        r = (Math.random() - 0.5) * 30;
        tx = (Math.random() - 0.5) * 15;
        ty = (Math.random() - 0.5) * 15;
        moveDur = beatSec * 0.5;
      } else if (choreoBlock === 2) {
        r = isDownBeat ? 18 : -18;
        tx = isDownBeat ? 10 : -10;
        ty = 12;
      } else if (choreoBlock === 3) {
        r = isDownBeat ? 10 : -10;
        tx = (Math.random() - 0.5) * 20;
        ty = 15;
        s = 1.1;
        a.el.eyeHalo.style.opacity = "0.8";
      } else if (choreoBlock === 4) {
        r = isDownBeat ? 25 : -25;
        tx = isDownBeat ? 15 : -15;
        ty = isDownBeat ? 15 : -15;
      } else if (choreoBlock === 5) {
        r = 0;
        tx = 0;
        ty = isDownBeat ? 12 : 2;
        moveDur = beatSec * 0.3;
      } else if (choreoBlock === 6) {
        r = Math.sin(dancePhase * Math.PI) * 20;
        tx = Math.sin(dancePhase * Math.PI) * 12;
        ty = Math.cos(dancePhase * Math.PI / 2) * 15 + 5;
      } else {
        if (phaseMod4 === 0) {
          r = 15;
          ty = 10;
          s = 1.1;
          moveDur = beatSec * 0.1;
        } else {
          r = 15;
          ty = 10;
          s = 1.1;
          moveDur = beatSec * 1.5;
        }
        a.el.eyeCenter.setAttribute("fill", dancePhase % 2 === 0 ? "#ff0000" : "#ffffff");
      }
      a.setPupil((Math.random() - 0.5) * 15, (Math.random() - 0.5) * 15);
    }
    a.setHead(r, tx, ty, s, moveDur, ease);
    a.setBodySwivel(r * -0.8, 1, bodyDur);
    a.setBaseLid(lid, beatSec * 0.5);
    executeTick();
  };
  step();
}
function stopDanceCycle(card) {
  card.animator.clearTimeout("dance-step");
  card.animator.clearTimeout("dance-led");
}

// src/behaviors/talk.js
var TALK_MOVES = [
  { r: -10, tx: -8, ty: -18, s: 1.02, dur: 1.8, lid: 0.1, px: 0, py: -2 },
  { r: 4, tx: 0, ty: 16, s: 1.08, dur: 1.2, lid: 0.85, px: 0, py: 4 },
  { r: 2, tx: 0, ty: 10, s: 1.04, dur: 1, lid: 0.5, px: 0, py: 2 },
  { r: 12, tx: 10, ty: -12, s: 0.96, dur: 2.2, lid: 0.1, px: 0, py: -1 },
  { r: 0, tx: 0, ty: 25, s: 1.1, dur: 1.8, lid: 0.9, px: 0, py: 5 },
  { r: -6, tx: 6, ty: -22, s: 0.98, dur: 1, lid: 0.1, px: 0, py: -3 },
  { r: 4, tx: -3, ty: 6, s: 1.03, dur: 2, lid: 0.4, px: 0, py: 1 },
  { r: -3, tx: 0, ty: 22, s: 1.15, dur: 1.2, lid: 0.95, px: 0, py: 6 },
  { r: 6, tx: 3, ty: -6, s: 1, dur: 1.5, lid: 0.2, px: 0, py: 0 }
];
function startTalkAnim(card) {
  const a = card.animator;
  a.clearTimeout("talk-step");
  let talkPhase = 0;
  const step = () => {
    const m = TALK_MOVES[talkPhase % TALK_MOVES.length];
    a.setHead(m.r, m.tx, m.ty, m.s, m.dur, "ease-in-out");
    a.setLid(m.lid, m.dur);
    a.setPupil(m.px, m.py);
    a.setBodySwivel(m.r * -0.6, 1, m.dur);
    talkPhase++;
    a.setTimeout("talk-step", step, m.dur * 1e3);
  };
  step();
}
function stopTalkAnim(card) {
  card.animator.clearTimeout("talk-step");
}

// src/behaviors/bop.js
function bopHead(card) {
  const a = card.animator;
  const config = card.config;
  const backendSpeed = config.tap_speed !== void 0 ? parseFloat(config.tap_speed) : 0.5;
  const bounces = Math.max(1, Math.min(20, config.tap_bounces !== void 0 ? parseInt(config.tap_bounces) : 5));
  const intensity = config.tap_intensity !== void 0 ? parseFloat(config.tap_intensity) : 1;
  const maxAmp = 15 * intensity;
  const omega = 0.28 * Math.max(0.01, backendSpeed);
  const dampingRatio = Math.min(0.7, 0.6 / bounces);
  const damping = 2 * omega * dampingRatio;
  const stiffness = omega * omega;
  const initialVelocity = maxAmp * omega * 1.8;
  if (card._bopping) {
    card._bopVelocity = initialVelocity;
    return;
  }
  card._bopping = true;
  stopIdleCycle(card);
  stopLidBehavior(card);
  const savedLedColor = a.currentLedColor;
  const savedLedOpacity = a.currentLedOpacity;
  const savedBaseLid = a.currentBaseLid;
  card._bopPosition = 0;
  card._bopVelocity = initialVelocity;
  let lastTime = performance.now();
  let accumulator = 0;
  const TIME_STEP = 16.666;
  let lastLedUpdate = 0;
  a.cancelRaf("bop-raf");
  const animate = (now) => {
    if (!card._bopping) return;
    let frameTime = now - lastTime;
    lastTime = now;
    if (frameTime > 100) frameTime = 16.666;
    accumulator += frameTime;
    while (accumulator >= TIME_STEP) {
      const force = -stiffness * card._bopPosition - damping * card._bopVelocity;
      card._bopVelocity += force;
      card._bopPosition += card._bopVelocity;
      accumulator -= TIME_STEP;
    }
    if (Math.abs(card._bopPosition) < 0.08 && Math.abs(card._bopVelocity) < 0.08) {
      card._bopping = false;
      a.el.head.style.transition = "transform 0.4s ease-out";
      a.el.head.style.transform = "translate3d(0,0,0) rotate(0deg) scale(1)";
      a.setLEDs(savedLedColor, savedLedOpacity);
      a.setLid(savedBaseLid, 0.4);
      if (card._state === "idle") {
        startLidBehavior(card);
        startIdleCycle(card);
      }
      return;
    }
    const ty = card._bopPosition;
    const rot = card._bopPosition * 0.15;
    const scale = 1 - Math.abs(card._bopPosition) * 3e-3;
    a.el.head.style.transition = "none";
    a.el.head.style.transform = `translate3d(0, ${ty.toFixed(2)}px, 0) rotate(${rot.toFixed(2)}deg) scale(${scale.toFixed(4)})`;
    if (now - lastLedUpdate > 60) {
      lastLedUpdate = now;
      const normPos = Math.min(1, Math.abs(card._bopPosition) / maxAmp);
      const baseOp = parseFloat(savedLedOpacity) || 0.15;
      const ledOp = baseOp + (1 - baseOp) * normPos;
      a.el.svg.style.setProperty("--led-color", savedLedColor);
      a.el.svg.style.setProperty("--led-opacity", ledOp.toFixed(2));
    }
    a.requestRaf("bop-raf", animate);
  };
  a.requestRaf("bop-raf", animate);
}
function stopBop(card) {
  card._bopping = false;
  card.animator.cancelRaf("bop-raf");
}

// src/states.js
function resetAll(card) {
  const a = card.animator;
  stopTalkAnim(card);
  stopLidBehavior(card);
  stopIdleCycle2(card);
  stopDanceCycle(card);
  stopBop(card);
  a.el.ledMatrices.forEach((m) => m.classList.remove("pulsing"));
  if (a.el.dangerRing) a.el.dangerRing.setAttribute("opacity", "0");
  a.el.eyeLayerIdle.style.opacity = "0";
  a.el.eyeLayerListen.style.opacity = "0";
  a.el.eyeLayerProcess.style.opacity = "0";
  a.el.eyeLayerRespond.style.opacity = "0";
  a.el.eyeLayerDance.style.opacity = "0";
  a.el.eyeCenter.style.transform = "scale(1)";
  a.el.eyeCenter.style.transition = "fill 0.8s ease-in-out";
}
function applyStateVisuals(card, state, bpm) {
  const a = card.animator;
  resetAll(card);
  if (state === "idle") {
    a.el.eyeLayerIdle.style.opacity = "1";
    a.el.eyeHalo.style.transition = "fill 0.8s ease-in-out, opacity 0.8s";
    a.el.eyeHalo.setAttribute("fill", "url(#haloGradIdle)");
    a.el.eyeHalo.style.opacity = "0.05";
    a.el.eyeCenter.setAttribute("fill", "#ffcc00");
    a.setHead(0, 0, 0, 1, 2.2);
    a.setLid(0, 1.2);
    a.setPupil(0, 0);
    a.currentBaseLid = 0;
    a.setLEDs("#ffb800", "0.15");
    a.resetBodySwivel();
    startLidBehavior(card);
    startIdleCycle(card);
  } else if (state === "dancing") {
    a.el.eyeLayerDance.style.opacity = "1";
    a.el.eyeHalo.style.transition = "fill 0.8s ease-in-out, opacity 0.15s ease-out";
    a.el.eyeHalo.setAttribute("fill", "url(#haloGradDance)");
    a.el.eyeCenter.setAttribute("fill", "#ffffff");
    a.el.eyeCenter.style.transformOrigin = "130px 364px";
    a.el.eyeCenter.style.transition = "transform 0.1s ease-out, fill 0.8s ease-in-out";
    a.setLEDs("#1DB954", "0.15");
    a.resetBodySwivel();
    startDanceCycle(card, bpm);
  } else if (state === "listening") {
    a.el.eyeLayerListen.style.opacity = "1";
    a.el.eyeHalo.style.transition = "fill 0.8s ease-in-out, opacity 0.8s";
    a.el.eyeHalo.setAttribute("fill", "url(#haloGradListen)");
    a.el.eyeHalo.style.opacity = "0.05";
    a.el.eyeCenter.setAttribute("fill", "#aaffff");
    a.setHead(4, 0, -8, 1.06, 1);
    a.setBaseLid(0.1, 0.4);
    a.setPupil(0, -3);
    a.setLEDs("#00ccff", "1");
    a.setBodySwivel(-2, 1, 1.4);
  } else if (state === "processing") {
    a.el.eyeLayerProcess.style.opacity = "1";
    a.el.eyeHalo.style.transition = "fill 0.8s ease-in-out, opacity 0.8s";
    a.el.eyeHalo.setAttribute("fill", "url(#haloGradProcess)");
    a.el.eyeHalo.style.opacity = "0.05";
    a.el.eyeCenter.setAttribute("fill", "#ffddaa");
    a.setHead(-2, 0, 10, 0.96, 1.4);
    a.setBaseLid(0.65, 0.5);
    a.setLEDs("#ff6600", "1");
    a.setBodySwivel(1, 0.98, 1.8);
    a.el.ledMatrices.forEach((m) => m.classList.add("pulsing"));
    startLidBehavior(card);
    const dart = () => {
      if (card._state !== "processing") return;
      a.setPupil((Math.random() - 0.5) * 12, 4);
      a.setTimeout("process-dart", dart, 200 + Math.random() * 600);
    };
    dart();
  } else if (state === "responding") {
    a.el.eyeLayerRespond.style.opacity = "1";
    a.el.eyeHalo.style.transition = "fill 0.8s ease-in-out, opacity 0.8s";
    a.el.eyeHalo.setAttribute("fill", "url(#haloGradRespond)");
    a.el.eyeHalo.style.opacity = "0.05";
    a.el.eyeCenter.setAttribute("fill", "#ffaaaa");
    if (a.el.dangerRing) a.el.dangerRing.setAttribute("opacity", "1");
    a.setLEDs("#ff2200", "1");
    a.setBodySwivel(0, 1, 0.8);
    startTalkAnim(card);
  }
}
function applyState(card, mapped, bpm) {
  const a = card.animator;
  a.clearTimeout("respond-delay");
  const delaySeconds = card.config.respond_delay !== void 0 ? parseFloat(card.config.respond_delay) : 0;
  if (mapped === "responding" && card._state !== "responding" && delaySeconds > 0) {
    a.setTimeout("respond-delay", () => {
      card._state = "responding";
      applyStateVisuals(card, "responding", bpm);
    }, delaySeconds * 1e3);
    return;
  }
  card._state = mapped;
  applyStateVisuals(card, mapped, bpm);
}

// src/glados-card.js
var GladosCard = class extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._lastHassVoice = null;
    this._lastHassMedia = null;
    this._lastHassBpm = null;
    this._state = "idle";
    this._currentBpm = 120;
    this._bopping = false;
    this._bopPosition = 0;
    this._bopVelocity = 0;
    this.animator = null;
    this.contentReady = false;
  }
  static getConfigElement() {
    return document.createElement("glados-card-editor");
  }
  static getStubConfig() {
    return getStubConfig();
  }
  setConfig(config) {
    this.config = sanitizeConfig(config);
    if (this.contentReady) {
      const prevState = this._state;
      this._teardownAnimation();
      this.setupDOM();
      this.initGlados();
      applyState(this, prevState || "idle", this._currentBpm);
    }
  }
  set hass(hass) {
    if (!hass) return;
    this._hass = hass;
    if (!this.contentReady) {
      this.setupDOM();
      this.initGlados();
      this.contentReady = true;
    }
    const entity = this.config.entity;
    const mediaEntity = this.config.media_entity;
    const bpmEntity = this.config.bpm_entity;
    const newVoiceState = entity && hass.states[entity] ? hass.states[entity].state.toLowerCase() : "idle";
    const newMediaState = mediaEntity && hass.states[mediaEntity] ? hass.states[mediaEntity].state.toLowerCase() : "paused";
    const newBpmState = bpmEntity && hass.states[bpmEntity] ? hass.states[bpmEntity].state : "120";
    if (this._lastHassVoice === newVoiceState && this._lastHassMedia === newMediaState && this._lastHassBpm === newBpmState) return;
    this._lastHassVoice = newVoiceState;
    this._lastHassMedia = newMediaState;
    this._lastHassBpm = newBpmState;
    const currentBpm = parseBpm(newBpmState);
    const mapped = resolveState(newVoiceState, newMediaState);
    if (this._state !== mapped || mapped === "dancing" && this._currentBpm !== currentBpm) {
      this._currentBpm = currentBpm;
      applyState(this, mapped, currentBpm);
    }
  }
  getCardSize() {
    return 6;
  }
  getGridOptions() {
    return { rows: 4, min_rows: 2, columns: 6, min_columns: 4, max_columns: 12 };
  }
  /** Stop all animation resources (timers, RAFs, bop flag). */
  _teardownAnimation() {
    if (this.animator) this.animator.stopAll();
    this._bopping = false;
  }
  // Double rAF Kinetic Reflow completely flushes frozen WebKit SVG timelines
  connectedCallback() {
    if (this._boundVisibility) {
      document.addEventListener("visibilitychange", this._boundVisibility);
    }
    if (this.contentReady) {
      const pivots = this.shadowRoot.querySelectorAll("#body-pivot, #head-sway-pivot");
      pivots.forEach((p) => {
        p.style.animation = "none";
      });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          pivots.forEach((p) => {
            p.style.animation = "";
          });
        });
      });
      if (this._state) {
        applyState(this, this._state, this._currentBpm);
      }
    }
  }
  disconnectedCallback() {
    if (this._hitbox) {
      if (this._tapHandler) this._hitbox.removeEventListener("click", this._tapHandler);
      if (this._keyHandler) this._hitbox.removeEventListener("keydown", this._keyHandler);
    }
    this._teardownAnimation();
    if (this._boundVisibility) {
      document.removeEventListener("visibilitychange", this._boundVisibility);
    }
  }
  setupDOM() {
    this.shadowRoot.innerHTML = buildTemplate(this.config);
  }
  initGlados() {
    this.animator = new GladosAnimator(this.shadowRoot);
    this._hitbox = this.animator.el.hitbox;
    if (this._tapHandler && this._hitbox) {
      this._hitbox.removeEventListener("click", this._tapHandler);
    }
    this._tapHandler = (e) => {
      if (this.config.tap_enabled === false) return;
      e.stopPropagation();
      e.preventDefault();
      bopHead(this);
      const actionObj = this.config.tap_action || { action: "none" };
      if (actionObj.action === "none") return;
      const ev = new Event("hass-action", { bubbles: true, composed: true });
      ev.detail = {
        config: this.config,
        action: "tap"
      };
      this.dispatchEvent(ev);
    };
    if (this.config.tap_enabled !== false) {
      this._hitbox.style.display = "block";
    }
    this._hitbox.addEventListener("click", this._tapHandler);
    if (this._keyHandler && this._hitbox) {
      this._hitbox.removeEventListener("keydown", this._keyHandler);
    }
    this._keyHandler = (e) => {
      if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
        if (e.key === " ") e.preventDefault();
        this._tapHandler(e);
      }
    };
    this._hitbox.addEventListener("keydown", this._keyHandler);
    this._visibilityHandler = () => {
      if (!this.isConnected) return;
      if (document.hidden) {
        this._teardownAnimation();
        this.animator.el.svg.style.animationPlayState = "paused";
        this.animator.el.svg.querySelectorAll("#body-pivot, #head-sway-pivot").forEach((e) => {
          e.style.animationPlayState = "paused";
        });
      } else {
        this.animator.el.svg.style.animationPlayState = "";
        this.animator.el.svg.querySelectorAll("#body-pivot, #head-sway-pivot").forEach((e) => {
          e.style.animationPlayState = "";
        });
        applyState(this, this._state, this._currentBpm || 120);
      }
    };
    if (this._boundVisibility) document.removeEventListener("visibilitychange", this._boundVisibility);
    this._boundVisibility = this._visibilityHandler;
    document.addEventListener("visibilitychange", this._boundVisibility);
    applyState(this, "idle", 120);
  }
};

// src/editor.js
var GladosCardEditor = class extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }
  setConfig(config) {
    this._config = JSON.parse(JSON.stringify(config));
    if (this.shadowRoot) {
      const actionEditor = this.shadowRoot.querySelector("#tap-action-editor");
      if (actionEditor) {
        actionEditor.config = this._config.tap_action || { action: "none" };
      }
      const c = this._config;
      const q = (sel) => this.shadowRoot.querySelector(sel);
      const setVal = (sel, v) => {
        const elq = q(sel);
        if (elq) elq.value = v;
      };
      const setText = (sel, v) => {
        const elq = q(sel);
        if (elq) elq.innerText = v;
      };
      const setChecked = (sel, v) => {
        const elq = q(sel);
        if (elq) elq.checked = v;
      };
      const delay = c.respond_delay !== void 0 ? c.respond_delay : 0;
      setVal("#delay-slider", delay);
      setText("#delay-val", delay);
      const zoom = c.zoom !== void 0 ? c.zoom : 85;
      setVal("#zoom-slider", zoom);
      setText("#zoom-val", zoom);
      setChecked("#bg-switch", c.transparent_bg === true);
      setChecked("#tap-switch", c.tap_enabled !== false);
      const backendSpeed = c.tap_speed !== void 0 ? Number(c.tap_speed) : 0.5;
      const uiValCalc = backendSpeed <= 0.5 ? backendSpeed / 0.5 : 1 + (backendSpeed - 0.5) / 1.5;
      const uiSpeed = uiValCalc.toFixed(1);
      setVal("#tap-speed-slider", uiSpeed);
      setText("#tap-speed-val", uiSpeed);
      const intensity = c.tap_intensity !== void 0 ? c.tap_intensity : 1;
      setVal("#tap-intensity-slider", intensity);
      setText("#tap-intensity-val", intensity);
      const bounces = c.tap_bounces !== void 0 ? c.tap_bounces : 5;
      setVal("#tap-bounces-slider", bounces);
      setText("#tap-bounces-val", bounces);
    }
  }
  set hass(hass) {
    this._hass = hass;
    if (!this.shadowRoot.querySelector(".card-config")) {
      this.render();
    } else {
      const pickers = this.shadowRoot.querySelectorAll("ha-entity-picker");
      pickers.forEach((picker) => {
        picker.hass = hass;
      });
      const actionEditor = this.shadowRoot.querySelector("#tap-action-editor");
      if (actionEditor) {
        actionEditor.hass = hass;
      }
    }
  }
  configChanged(key, value) {
    if (!this._config) return;
    const newConfig = { ...this._config };
    if (value === "" || value === void 0 || value === null) delete newConfig[key];
    else newConfig[key] = value;
    this._config = newConfig;
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: newConfig }, bubbles: true, composed: true }));
  }
  render() {
    if (!this._config || !this._hass) return;
    const c = this._config;
    const backendSpeed = c.tap_speed !== void 0 ? Number(c.tap_speed) : 0.5;
    const uiValCalc = backendSpeed <= 0.5 ? backendSpeed / 0.5 : 1 + (backendSpeed - 0.5) / 1.5;
    const uiSpeed = uiValCalc.toFixed(1);
    this.shadowRoot.innerHTML = `
      <style>
        .card-config { display: flex; flex-direction: column; gap: 16px; padding: 8px 0; }
        .side-by-side { display: flex; gap: 16px; margin-top: 8px; }
        .side-by-side > div { flex: 1; display: flex; flex-direction: column; }
        label { font-family: var(--paper-font-body1_-_font-family, sans-serif); font-size: 14px; color: var(--primary-text-color); }
        .secondary { font-size: 12px; color: var(--secondary-text-color); margin-top: 2px; }
        ha-expansion-panel { margin-top: 8px; }
      </style>
      <div class="card-config">
        <ha-entity-picker id="entity-picker" label="Voice Assistant Entity (Required)" allow-custom-entity></ha-entity-picker>
        <ha-entity-picker id="media-picker" label="Media Player Entity (Optional)" allow-custom-entity></ha-entity-picker>
        <ha-entity-picker id="bpm-picker" label="BPM Sensor Entity (Optional)" allow-custom-entity></ha-entity-picker>
        <div class="side-by-side">
          <div><label>Response Delay: <span id="delay-val">${c.respond_delay !== void 0 ? c.respond_delay : 0}</span>s</label><div class="secondary">Time before she starts talking.</div><ha-slider id="delay-slider" min="0" max="16" step="0.5" pin value="${c.respond_delay !== void 0 ? c.respond_delay : 0}"></ha-slider></div>
          <div><label>Zoom Scale: <span id="zoom-val">${c.zoom !== void 0 ? c.zoom : 85}</span>%</label><ha-slider id="zoom-slider" min="10" max="200" step="1" pin value="${c.zoom !== void 0 ? c.zoom : 85}"></ha-slider></div>
        </div>
        <ha-formfield label="Transparent Background"><ha-switch id="bg-switch"></ha-switch></ha-formfield>

        <ha-expansion-panel outlined header="Tap / Press Configuration">
          <div class="card-config" style="padding: 16px 0;">
            <ha-formfield label="Enable Tap to Bop"><ha-switch id="tap-switch"></ha-switch></ha-formfield>

            <hui-action-editor id="tap-action-editor" label="Tap Action"></hui-action-editor>

            <div class="side-by-side">
              <div><label>Animation Speed: <span id="tap-speed-val">${uiSpeed}</span>x</label><div class="secondary">0.1 = slow, 1.0 = normal, 2.0 = fast.</div><ha-slider id="tap-speed-slider" min="0.1" max="2.0" step="0.1" pin value="${uiSpeed}"></ha-slider></div>
              <div><label>Bop Intensity: <span id="tap-intensity-val">${c.tap_intensity !== void 0 ? c.tap_intensity : 1}</span>x</label><div class="secondary">How far the head pulls back.</div><ha-slider id="tap-intensity-slider" min="0.5" max="2" step="0.1" pin value="${c.tap_intensity !== void 0 ? c.tap_intensity : 1}"></ha-slider></div>
            </div>
            <div><label>Rebound Bounces: <span id="tap-bounces-val">${c.tap_bounces !== void 0 ? c.tap_bounces : 5}</span></label><div class="secondary">Full oscillation cycles before settling.</div><ha-slider id="tap-bounces-slider" min="1" max="20" step="1" pin value="${c.tap_bounces !== void 0 ? c.tap_bounces : 5}"></ha-slider></div>
          </div>
        </ha-expansion-panel>
      </div>
    `;
    const ep = this.shadowRoot.querySelector("#entity-picker");
    ep.hass = this._hass;
    ep.value = c.entity;
    ep.includeDomains = ["assist_satellite"];
    ep.addEventListener("value-changed", (ev) => this.configChanged("entity", ev.detail.value));
    const mp = this.shadowRoot.querySelector("#media-picker");
    mp.hass = this._hass;
    mp.value = c.media_entity;
    mp.includeDomains = ["media_player"];
    mp.addEventListener("value-changed", (ev) => this.configChanged("media_entity", ev.detail.value));
    const bp = this.shadowRoot.querySelector("#bpm-picker");
    bp.hass = this._hass;
    bp.value = c.bpm_entity;
    bp.includeDomains = ["sensor"];
    bp.addEventListener("value-changed", (ev) => this.configChanged("bpm_entity", ev.detail.value));
    const delaySlider = this.shadowRoot.querySelector("#delay-slider");
    delaySlider.addEventListener("change", (ev) => {
      this.shadowRoot.querySelector("#delay-val").innerText = ev.target.value;
      this.configChanged("respond_delay", Number(ev.target.value));
    });
    const zoomSlider = this.shadowRoot.querySelector("#zoom-slider");
    zoomSlider.addEventListener("change", (ev) => {
      this.shadowRoot.querySelector("#zoom-val").innerText = ev.target.value;
      this.configChanged("zoom", Number(ev.target.value));
    });
    const bgSwitch = this.shadowRoot.querySelector("#bg-switch");
    bgSwitch.checked = c.transparent_bg === true;
    bgSwitch.addEventListener("change", (ev) => this.configChanged("transparent_bg", ev.target.checked));
    const tapSwitch = this.shadowRoot.querySelector("#tap-switch");
    tapSwitch.checked = c.tap_enabled !== false;
    tapSwitch.addEventListener("change", (ev) => this.configChanged("tap_enabled", ev.target.checked));
    const actionEditor = this.shadowRoot.querySelector("#tap-action-editor");
    if (actionEditor) {
      actionEditor.hass = this._hass;
      actionEditor.config = c.tap_action || { action: "none" };
      actionEditor.addEventListener("value-changed", (ev) => {
        ev.stopPropagation();
        this.configChanged("tap_action", ev.detail.value);
      });
    }
    const tapSpeedSlider = this.shadowRoot.querySelector("#tap-speed-slider");
    tapSpeedSlider.addEventListener("change", (ev) => {
      const uiVal = Number(ev.target.value);
      this.shadowRoot.querySelector("#tap-speed-val").innerText = uiVal.toFixed(1);
      let backendVal = uiVal <= 1 ? uiVal * 0.5 : 0.5 + (uiVal - 1) * 1.5;
      this.configChanged("tap_speed", Number(backendVal.toFixed(3)));
    });
    const tapIntensitySlider = this.shadowRoot.querySelector("#tap-intensity-slider");
    tapIntensitySlider.addEventListener("change", (ev) => {
      this.shadowRoot.querySelector("#tap-intensity-val").innerText = ev.target.value;
      this.configChanged("tap_intensity", Number(ev.target.value));
    });
    const tapBouncesSlider = this.shadowRoot.querySelector("#tap-bounces-slider");
    tapBouncesSlider.addEventListener("change", (ev) => {
      this.shadowRoot.querySelector("#tap-bounces-val").innerText = ev.target.value;
      this.configChanged("tap_bounces", Number(ev.target.value));
    });
  }
};

// src/index.js
customElements.define("glados-card-editor", GladosCardEditor);
customElements.define("glados-card", GladosCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "glados-card")) {
  window.customCards.push({
    type: "glados-card",
    name: "GLaDOS Custom Card",
    preview: true,
    description: "A responsive, animated GLaDOS AI assistant card that reacts to voice and dances to music.",
    documentationURL: "https://github.com/adix992/GLaDOS-AI-Animation"
  });
}
