class GladosCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._lastHassVoice = null;
    this._lastHassMedia = null;
    this._lastHassBpm = null;
  }
  static getConfigElement() { return document.createElement('glados-card-editor'); }
  static getStubConfig() { return { entity: "", media_entity: "", bpm_entity: "", respond_delay: 0, zoom: 85, transparent_bg: false, tap_enabled: true, tap_speed: 0.2, tap_bounces: 5, tap_intensity: 1.0, tap_action: "none" }; }
  setConfig(config) {
    if (!config.entity && !this.config) {
      this.config = { ...config, entity: 'assist_satellite.example' };
    } else {
      this.config = config;
    }
    if (this.contentReady) {
        this._cleanupTimers();
        this.setupDOM();
        this.initGlados();
        this.applyState(this._currentState, this._currentBpm);
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
    const newVoiceState = (entity && hass.states[entity]) ? hass.states[entity].state.toLowerCase() : 'idle';
    const newMediaState = (mediaEntity && hass.states[mediaEntity]) ? hass.states[mediaEntity].state.toLowerCase() : 'paused';
    const newBpmState = (bpmEntity && hass.states[bpmEntity]) ? hass.states[bpmEntity].state : '120';
    if (this._lastHassVoice === newVoiceState && this._lastHassMedia === newMediaState && this._lastHassBpm === newBpmState) return;
    this._lastHassVoice = newVoiceState;
    this._lastHassMedia = newMediaState;
    this._lastHassBpm = newBpmState;
    const currentBpm = isNaN(parseFloat(newBpmState)) ? 120 : parseFloat(newBpmState);
    let effectiveState = 'idle';
    if (['listen', 'wake', 'process', 'think', 'respond', 'speak', 'tts'].some(s => newVoiceState.includes(s))) {
      effectiveState = newVoiceState;
    } else if (newMediaState === 'playing') {
      effectiveState = 'dancing';
    }
    if (this._currentState !== effectiveState || (effectiveState === 'dancing' && this._currentBpm !== currentBpm)) {
      this._currentState = effectiveState;
      this._currentBpm = currentBpm;
      if (this.applyState) this.applyState(effectiveState, currentBpm);
    }
  }
  getCardSize() { return 6; }
  _cleanupTimers() {
    if (this.stopIdleCycle) this.stopIdleCycle();
    if (this.stopDanceCycle) this.stopDanceCycle();
    if (this.respondTimer) { clearTimeout(this.respondTimer); this.respondTimer = null; }
    if (this.lidTimer) { clearTimeout(this.lidTimer); this.lidTimer = null; }
    if (this.pupilTimer) { clearTimeout(this.pupilTimer); this.pupilTimer = null; }
    if (this.talkAnim) { clearTimeout(this.talkAnim); this.talkAnim = null; }
    if (this.glitchRaf) { cancelAnimationFrame(this.glitchRaf); this.glitchRaf = null; }
    if (this._bopRaf) { cancelAnimationFrame(this._bopRaf); this._bopRaf = null; }
    this._bopping = false;
    if (this._boundVisibility) {
      document.removeEventListener('visibilitychange', this._boundVisibility);
      this._boundVisibility = null;
    }
    if (this._tapHandler) {
      this.removeEventListener('click', this._tapHandler);
      this._tapHandler = null;
    }
  }
  setupDOM() {
    const zoom = this.config.zoom !== undefined ? this.config.zoom : 85;
    const scale = zoom / 100;
    const width = 280 * scale;
    const height = 320 * scale;
    const bgStyle = this.config.transparent_bg ? 'background: transparent; box-shadow: none; border: none;' : 'background: var(--ha-card-background, var(--card-background-color, #1c1c1c));';
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: flex; align-items: center; justify-content: center; ${bgStyle} border-radius: var(--ha-card-border-radius, 12px); overflow: hidden; width: 100%; }
        #scene { width: ${width}px; height: ${height}px; display: flex; align-items: center; justify-content: center; }
        #glados-svg { width: 100%; height: 100%; display: block; overflow: visible; --led-color: #ffb800; --led-opacity: 0.15; }
        .led-dot, #ind-l1, #ind-l2, #ind-r1, #ind-r2 { transition: fill 0.2s, opacity 0.15s ease-out; fill: var(--led-color); opacity: var(--led-opacity); }
        #body-pivot, #head-sway-pivot { will-change: transform; }
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
            <filter id="eyeBloom" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
            <filter id="softGlow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
            <filter id="ledGlow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
            <linearGradient id="lidGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1f2124"/><stop offset="100%" stop-color="#08090a"/></linearGradient>
            <linearGradient id="lidGradFlip" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stop-color="#1f2124"/><stop offset="100%" stop-color="#08090a"/></linearGradient>
            <clipPath id="cavityClip"><rect x="97" y="283.25" width="66" height="161.5" rx="33"/></clipPath>
            <clipPath id="trackClip"><rect x="107" y="293.25" width="46" height="141.5" rx="23"/></clipPath>
            <clipPath id="eyeballClip"><circle cx="130" cy="364" r="25.5"/></clipPath>
            <meshgradient id="meshgradient125" gradientUnits="userSpaceOnUse" x="72.6" y="232">
              <meshrow><meshpatch><stop path="c 4.62124,0 9.24247,0 13.8637,0" style="stop-color:#fafafa;stop-opacity:1"/><stop path="c -0.0372484,9.53147 -0.589635,18.9441 -1.15999,28.3526" style="stop-color:#fafafa;stop-opacity:1"/><stop path="c -4.35666,0.0610757 -8.07605,0.269212 -12.7036,0.267753" style="stop-color:#aeaeae;stop-opacity:1"/><stop path="c -1.03361e-05,-9.54009 -3.03118e-05,-19.0802 -6.8917e-05,-28.6203" style="stop-color:#aeaeae;stop-opacity:1"/></meshpatch><meshpatch><stop path="c 0.810267,0 1.62053,0 2.4308,0"/><stop path="c -6.05e-06,9.54005 -0.605469,18.9404 -1.23204,28.3359" style="stop-color:#cdcdcd;stop-opacity:1"/><stop path="c -0.811394,-0.00026 -1.59486,0.00592 -2.35874,0.01664" style="stop-color:#c6c6c6;stop-opacity:1"/></meshpatch><meshpatch><stop path="c 5.46826,0 10.9365,0 16.4048,0"/><stop path="c 0,9.54005 0,19.0801 0,28.6202" style="stop-color:#cdcdcd;stop-opacity:1"/><stop path="c -5.46075,0.00173 -12.1761,-0.28606 -17.6368,-0.28431" style="stop-color:#c6c6c6;stop-opacity:1"/></meshpatch><meshpatch><stop path="c 11.1251,0 22.2503,0 33.3755,0"/><stop path="c 0,9.54005 0,19.0801 0,28.6202" style="stop-color:#cdcdcd;stop-opacity:1"/><stop path="c -11.1252,-7.42e-06 -22.2504,-1.48e-05 -33.3755,0" style="stop-color:#c6c6c6;stop-opacity:1"/></meshpatch><meshpatch><stop path="c 12.2565,0 24.513,0 36.7695,0"/><stop path="c 0,9.54005 0,19.0801 0,28.6202" style="stop-color:#cdcdcd;stop-opacity:1"/><stop path="c -12.2565,-3.48e-06 -24.513,4.32e-07 -36.7695,0" style="stop-color:#c6c6c6;stop-opacity:1"/></meshpatch><meshpatch><stop path="c 5.18545,0 10.3709,0 15.5564,0"/><stop path="c 0,9.54005 0.51231,19.0801 1.04249,28.6202" style="stop-color:#cdcdcd;stop-opacity:1"/><stop path="c -5.17909,-8.78e-07 -11.4198,1.44e-06 -16.5989,0" style="stop-color:#c6c6c6;stop-opacity:1"/></meshpatch><meshpatch><stop path="c 0.715253,0 1.43051,0 2.14576,0"/><stop path="c 0.02971,9.54005 0.504699,19.0801 0.995215,28.6202" style="stop-color:#e8e8e8;stop-opacity:1"/><stop path="c -0.68449,7.21e-07 -1.3824,1.63e-06 -2.09849,0" style="stop-color:#f1f1f1;stop-opacity:1"/></meshpatch><meshpatch><stop path="c 4.7512,0 9.50239,0 14.2535,0"/><stop path="c 0,9.5401 0,19.0802 0,28.6203" style="stop-color:#fbfbfb;stop-opacity:1"/><stop path="c -4.7567,-2.88e-05 -8.71145,-5.75e-05 -13.2583,-7.49e-05" style="stop-color:#fbfbfb;stop-opacity:1"/></meshpatch></meshrow>
              <meshrow><meshpatch><stop path="c -0.611566,10.0884 -1.24379,20.172 -1.28373,30.3922"/><stop path="c -4.05968,0.129582 -6.79877,0.563913 -11.4199,0.563906" style="stop-color:#5d5d5d;stop-opacity:1"/><stop path="c 0,-10.2294 0,-20.4589 -1.1e-05,-30.6884" style="stop-color:#5d5d5d;stop-opacity:1"/></meshpatch><meshpatch><stop path="c -0.671855,10.0744 -1.36798,20.1433 -1.368,30.3728"/><stop path="c -0.810267,-1.12e-06 -1.56267,0.01335 -2.27448,0.0361" style="stop-color:#a3a3a3;stop-opacity:1"/></meshpatch><meshpatch><stop path="c 0,10.2295 0,20.459 0,30.6885"/><stop path="c -5.46829,-7.55e-06 -13.5366,-0.60001 -19.0048,-0.6" style="stop-color:#d6d6d6;stop-opacity:1"/></meshpatch><meshpatch><stop path="c 0,10.2295 0,20.459 0,30.6885"/><stop path="c -11.1252,-1.53e-05 -22.2503,-3.07e-05 -33.3755,0" style="stop-color:#d6d6d6;stop-opacity:1"/></meshpatch><meshpatch><stop path="c 0,10.2295 0,20.459 0,30.6885"/><stop path="c -12.2565,-7.23e-06 -24.513,8.96e-07 -36.7695,0" style="stop-color:#d6d6d6;stop-opacity:1"/></meshpatch><meshpatch><stop path="c 0.568487,10.2295 1.15751,20.459 1.15751,30.6885"/><stop path="c -5.18545,-1.81e-06 -12.5709,3e-06 -17.7564,0" style="stop-color:#d6d6d6;stop-opacity:1"/></meshpatch><meshpatch><stop path="c 0.525962,10.2295 1.06978,20.459 1.10164,30.6885"/><stop path="c -0.649776,1.49e-06 -1.32736,3.39e-06 -2.04261,0" style="stop-color:#fbfbfb;stop-opacity:1"/></meshpatch><meshpatch><stop path="c 0,10.2295 0,20.459 0,30.6884"/><stop path="c -4.7512,-7.97e-06 -7.84044,-1.56e-05 -12.1567,0" style="stop-color:#fbfbfb;stop-opacity:1"/></meshpatch></meshrow>
              <meshrow><meshpatch><stop path="c -0.014335,9.16529 -0.226812,18.608 -0.446185,28.0604"/><stop path="c -3.95792,-0.012905 -6.35012,-0.06422 -10.9737,-0.06079" style="stop-color:#565656;stop-opacity:1"/><stop path="c -2.84e-06,-9.14524 -8.33e-06,-18.2905 -1.5e-05,-27.4357" style="stop-color:#565656;stop-opacity:1"/></meshpatch><meshpatch><stop path="c -1.05e-05,9.14522 -0.232903,18.6165 -0.473903,28.0991"/><stop path="c -0.8107,0.000616 -1.5528,-0.00045 -2.24676,-0.0026" style="stop-color:#ffffff;stop-opacity:1"/></meshpatch><meshpatch><stop path="c 0,9.14522 0,18.2905 0,27.4357"/><stop path="c -5.4654,-0.00406 -14.0134,0.06748 -19.4787,0.0634" style="stop-color:#ffffff;stop-opacity:1"/></meshpatch><meshpatch><stop path="c 0,9.14522 0,18.2905 0,27.4357"/><stop path="c -11.1252,-1.97e-05 -22.2503,-3.94e-05 -33.3755,0" style="stop-color:#ffffff;stop-opacity:1"/></meshpatch><meshpatch><stop path="c 0,9.14522 0,18.2905 0,27.4357"/><stop path="c -12.2565,-6.13e-06 -24.513,7.6e-07 -36.7695,0" style="stop-color:#ffffff;stop-opacity:1"/></meshpatch><meshpatch><stop path="c 3.03e-08,9.14522 0.279468,18.3836 0.568669,27.6253"/><stop path="c -5.18197,0.00115 -13.143,-0.19071 -18.3251,-0.1896" style="stop-color:#ffffff;stop-opacity:1"/></meshpatch><meshpatch><stop path="c 0.016208,9.15062 0.275318,18.3822 0.542886,27.6167"/><stop path="c -0.632997,0.00558 -1.30112,0.00872 -2.01683,0.0086" style="stop-color:#fbfbfb;stop-opacity:1"/></meshpatch><meshpatch><stop path="c 0,9.14522 0,18.2905 0,27.4357"/><stop path="c -4.75422,-0.001 -7.40902,0.14382 -11.6138,0.181" style="stop-color:#fbfbfb;stop-opacity:1"/></meshpatch></meshrow>
              <meshrow><meshpatch><stop path="c -0.235205,10.1345 -0.478338,20.2801 -0.493693,30.1067"/><stop path="c -3.84371,-0.17279 -5.8589,-0.75191 -10.48,-0.75193" style="stop-color:#505050;stop-opacity:1"/><stop path="c 0,-9.80518 0,-19.6104 0,-29.4156" style="stop-color:#505050;stop-opacity:1"/></meshpatch><meshpatch><stop path="c -0.258391,10.167 -0.526101,20.347 -0.526095,30.1522"/><stop path="c -0.810269,-1.76e-06 -1.54042,-0.0178 -2.21436,-0.0481" style="stop-color:#a3a3a3;stop-opacity:1"/></meshpatch><meshpatch><stop path="c 0,9.80521 0,19.6104 0,29.4156"/><stop path="c -5.46829,-1.2e-05 -14.5366,0.79998 -20.0048,0.8" style="stop-color:#d6d6d6;stop-opacity:1"/></meshpatch><meshpatch><stop path="c 0,9.80521 0,19.6104 0,29.4156"/><stop path="c -11.1252,-2.44e-05 -22.2503,-4.88e-05 -33.3755,0" style="stop-color:#d6d6d6;stop-opacity:1"/></meshpatch><meshpatch><stop path="c 0,9.80521 0,19.6104 0,29.4156"/><stop path="c -12.2565,-4.96e-06 -24.513,6.1e-07 -36.7695,0" style="stop-color:#d6d6d6;stop-opacity:1"/></meshpatch><meshpatch><stop path="c 0.310071,9.90857 0.631331,19.8209 0.631331,29.626"/><stop path="c -5.18545,-1.2e-06 -13.7709,-0.39999 -18.9564,-0.4" style="stop-color:#d6d6d6;stop-opacity:1"/></meshpatch><meshpatch><stop path="c 0.286878,9.90083 0.583479,19.8049 0.600854,29.6158"/><stop path="c -0.614063,0.0119 -1.2711,0.01875 -1.98635,0.0188" style="stop-color:#fbfbfb;stop-opacity:1"/></meshpatch><meshpatch><stop path="c 0,9.80521 0,19.6104 0,29.4156"/><stop path="c -4.7512,-5.47e-06 -6.93393,0.30216 -11.0129,0.3812" style="stop-color:#fbfbfb;stop-opacity:1"/></meshpatch></meshrow>
              <meshrow><meshpatch><stop path="c 0.041532,20.4293 1.27426,40.0078 1.31583,60.437"/><stop path="c -4.14608,0.04318 -7.17473,0.18796 -11.7959,0.18795" style="stop-color:#383838;stop-opacity:1"/><stop path="c 0,-20.459 0,-40.918 0,-61.3769" style="stop-color:#383838;stop-opacity:1"/></meshpatch><meshpatch><stop path="c -3.1e-05,20.459 1.39999,39.918 1.4,60.3769"/><stop path="c -0.810269,-1.18e-06 -1.57158,0.00444 -2.29853,0.012" style="stop-color:#a3a3a3;stop-opacity:1"/></meshpatch><meshpatch><stop path="c 0,20.459 0,40.918 0,61.3769"/><stop path="c -5.46829,-7.97e-06 -13.1366,-0.20001 -18.6048,-0.2" style="stop-color:#d6d6d6;stop-opacity:1"/></meshpatch><meshpatch><stop path="c 0,20.459 0,40.918 0,61.3769"/><stop path="c -11.1252,-1.62e-05 -22.2503,-3.24e-05 -33.3755,0" style="stop-color:#d6d6d6;stop-opacity:1"/></meshpatch><meshpatch><stop path="c 0,20.459 0,40.918 0,61.3769"/><stop path="c -12.2565,-4.37e-07 -24.513,5.4e-08 -36.7695,0" style="stop-color:#d6d6d6;stop-opacity:1"/></meshpatch><meshpatch><stop path="c 0,20.459 -0.2,40.518 -0.2,60.9769"/><stop path="c -5.18545,-1.1e-07 -13.5709,1.73e-07 -18.7564,0" style="stop-color:#d6d6d6;stop-opacity:1"/></meshpatch><meshpatch><stop path="c -0.00559,20.4478 -0.185026,40.5479 -0.190624,60.9957"/><stop path="c -0.620016,9.2e-08 -1.28048,2e-07 -1.99573,0" style="stop-color:#ffffff;stop-opacity:1"/></meshpatch><meshpatch><stop path="c 0,20.459 0,40.9179 0,61.3769"/><stop path="c -4.7512,-4.83e-07 -7.08501,-9.66e-07 -11.2035,0" style="stop-color:#eeeeee;stop-opacity:1"/></meshpatch></meshrow>
              <meshrow><meshpatch><stop path="c 0.06526,23.1603 2.00241,46.4908 2.06774,69.6511"/><stop path="c -4.62124,0 -9.24246,0 -13.8637,0" style="stop-color:#4c4c4c;stop-opacity:1"/><stop path="c 0,-23.1544 0,-46.3088 0,-69.4631" style="stop-color:#4c4c4c;stop-opacity:1"/></meshpatch><meshpatch><stop path="c -3.79e-05,23.1544 2.19999,46.5088 2.20001,69.6631"/><stop path="c -0.810269,0 -1.62054,0 -2.4308,0" style="stop-color:#4c4c4c;stop-opacity:1"/></meshpatch><meshpatch><stop path="c 1.23e-05,23.1544 2.47e-05,46.3088 3.71e-05,69.4631"/><stop path="c -5.46829,0 -10.9366,0 -16.4049,0" style="stop-color:#d6d6d6;stop-opacity:1"/></meshpatch><meshpatch><stop path="c 0,23.1544 0,46.3088 0,69.4631"/><stop path="c -11.1251,0 -22.2503,0 -33.3755,0" style="stop-color:#d6d6d6;stop-opacity:1"/></meshpatch><meshpatch><stop path="c 0,23.1544 0,46.3088 0,69.4631"/><stop path="c -12.2565,0 -24.513,0 -36.7695,0" style="stop-color:#4c4c4c;stop-opacity:1"/></meshpatch><meshpatch><stop path="c 0,23.1544 -3.2,46.3088 -3.2,69.4631"/><stop path="c -5.18545,0 -10.3709,0 -15.5564,0" style="stop-color:#4c4c4c;stop-opacity:1"/></meshpatch><meshpatch><stop path="c -0.08956,23.1544 -2.96042,46.3088 -3.04998,69.4631"/><stop path="c -0.715248,0 -1.4305,0 -2.14575,0" style="stop-color:#4c4c4c;stop-opacity:1"/></meshpatch><meshpatch><stop path="c 0,23.1544 0,46.3088 0,69.4631"/><stop path="c -4.7512,0 -9.50239,0 -14.2535,0" style="stop-color:#4c4c4c;stop-opacity:1"/></meshpatch></meshrow>
            </meshgradient>
          </defs>
          <g id="body-pivot"><g id="torso-swivel"><g id="torso" transform="matrix(1.2,0,0,1.2,-28,-23.2)"><ellipse cx="140" cy="116" rx="55" ry="15" fill="#1c1c26" stroke="#0c0c12" stroke-width="1.2"/><ellipse cx="140" cy="116" rx="46" ry="11" fill="#141420" stroke="#1e1e2c" stroke-width="0.7"/><path d="m 94,126 -8,8 -2,66 q 0,10 10,12 h 92 q 10,-2 10,-12 l -2,-66 -8,-8 z" fill="url(#ceramicBackgroundGrad)" stroke="#6a6d75" stroke-width="1.4"/><path d="m 90,132 -28,8 -4,40 4,16 12,4 16,-4 z" fill="url(#ceramicBackgroundGrad)" stroke="#6a6d75" stroke-width="1"/><path d="m 90,136 -24,7 -4,35 4,14 10,4 14,-4 z" fill="#eeeeee" opacity="0.05"/><circle cx="60" cy="168" r="9" fill="#14141c" stroke="#0c0c12" stroke-width="1"/><circle cx="60" cy="168" r="5.5" fill="#0c0c10" stroke="#1a1a22" stroke-width="0.8"/><path d="m 90,132 c -4,20 -6,40 -4,60" stroke="#1a1a22" stroke-width="2.5" fill="none" opacity="0.8"/><path d="m 190,132 28,8 4,40 -4,16 -12,4 -16,-4 z" fill="url(#ceramicBackgroundGrad)" stroke="#6a6d75" stroke-width="1"/><path d="m 190,136 24,7 4,35 -4,14 10,4 14,-4 z" fill="#eeeeee" opacity="0.05"/><circle cx="220" cy="168" r="9" fill="#14141c" stroke="#0c0c12" stroke-width="1"/><circle cx="220" cy="168" r="5.5" fill="#0c0c10" stroke="#1a1a22" stroke-width="0.8"/><path d="m 190,132 c 4,20 6,40 4,60" stroke="#1a1a22" stroke-width="2.5" fill="none" opacity="0.8"/><line x1="90" y1="152" x2="190" y2="152" stroke="#6a6d75" stroke-width="1"/><line x1="89" y1="174" x2="191" y2="174" stroke="#6a6d75" stroke-width="1"/><line x1="140" y1="128" x2="140" y2="210" stroke="#6a6d75" stroke-width="1"/><rect x="94" y="135" width="36" height="20" rx="2.5" fill="#050508" stroke="#101014" stroke-width="0.6"/><rect x="96" y="137" width="32" height="16" rx="1.5" fill="#020202"/><g id="led-matrix-left" class="led-matrix" filter="url(#ledGlow)"><rect class="led-dot" x="98" y="140" width="28" height="2" rx="1"/><rect class="led-dot" x="98" y="145" width="28" height="2" rx="1"/><rect class="led-dot" x="98" y="150" width="28" height="2" rx="1"/></g><rect x="150" y="135" width="36" height="20" rx="2.5" fill="#050508" stroke="#101014" stroke-width="0.6"/><rect x="152" y="137" width="32" height="16" rx="1.5" fill="#020202"/><g id="led-matrix-right" class="led-matrix" filter="url(#ledGlow)"><rect class="led-dot" x="154" y="140" width="28" height="2" rx="1"/><rect class="led-dot" x="154" y="145" width="28" height="2" rx="1"/><rect class="led-dot" x="154" y="150" width="28" height="2" rx="1"/></g><circle cx="100" cy="180" r="2.5" fill="#0a0a0e" stroke="#101014" stroke-width="0.5"/><circle id="ind-l1" cx="100" cy="180" r="1.5"/><circle cx="108" cy="180" r="2.5" fill="#0a0a0e" stroke="#101014" stroke-width="0.5"/><circle id="ind-l2" cx="108" cy="180" r="1.5"/><circle cx="172" cy="180" r="2.5" fill="#0a0a0e" stroke="#101014" stroke-width="0.5"/><circle id="ind-r1" cx="172" cy="180" r="1.5"/><circle cx="180" cy="180" r="2.5" fill="#0a0a0e" stroke="#101014" stroke-width="0.5"/><circle id="ind-r2" cx="180" cy="180" r="1.5"/></g></g></g>
          <g id="glados-head-wrapper" transform="translate(0, -65)"><g id="head-sway-pivot"><g id="glados-head"><ellipse cx="140" cy="285" rx="18" ry="6" fill="#181824" stroke="#0a0a0f" stroke-width="1"/><ellipse cx="140" cy="285" rx="12" ry="3.8" fill="#101015" stroke="#181824" stroke-width="0.6"/><g id="Group_White_Casing"><path id="rect74" fill="url(#meshgradient125)" d="m 135,232 h 10 c 20.41692,0 38.38909,10.09589 49.21698,25.58812 L 205,276.8 c 0,0 2.4,52.45447 2.4,78.7 0,26.24553 -2.4,78.7 -2.4,78.7 l -10.77334,19.19803 C 183.3998,468.8981 165.423,479 145,479 H 135 C 114.59769,479 96.636634,468.91856 85.806278,453.44514 L 75,434.2 c 0,0 -2.4,-52.45447 -2.4,-78.7 0,-26.24553 2.4,-78.7 2.4,-78.7 L 85.808333,257.55193 C 96.638906,242.08017 114.59898,232 135,232 Z"/><rect x="75" y="232" width="130" height="247" rx="60" fill="url(#ceramicShadow)"/></g><g id="Group_Faceplate_Inset"><rect x="93" y="279.25" width="76" height="171.5" rx="38" fill="#000" opacity="0.6" filter="url(#softGlow)"/><rect x="91" y="277.25" width="78" height="173.5" rx="39" fill="url(#bezelGrad)" stroke="#1a1c22" stroke-width="1"/><rect x="93" y="279.25" width="74" height="169.5" rx="37" fill="none" stroke="#6a6d75" stroke-width="1.5"/><g clip-path="url(#cavityClip)"><rect x="97" y="283.25" width="66" height="161.5" rx="33" fill="url(#cavityGrad)"/><rect x="97" y="283.25" width="66" height="161.5" rx="33" fill="none" stroke="#050607" stroke-width="5" opacity="0.9"/><rect x="107" y="293.25" width="46" height="141.5" rx="23" fill="url(#trackGrad)" stroke="#000000" stroke-width="3"/><g clip-path="url(#trackClip)"><g id="bellows" style="transition: transform 0.15s ease-out;"><g stroke="#000" stroke-width="4.5" stroke-linecap="butt" opacity="0.9"><line x1="107" y1="140" x2="153" y2="140"/><line x1="107" y1="152" x2="153" y2="152"/><line x1="107" y1="164" x2="153" y2="164"/><line x1="107" y1="176" x2="153" y2="176"/><line x1="107" y1="188" x2="153" y2="188"/><line x1="107" y1="200" x2="153" y2="200"/><line x1="107" y1="212" x2="153" y2="212"/><line x1="107" y1="224" x2="153" y2="224"/><line x1="107" y1="236" x2="153" y2="236"/><line x1="107" y1="248" x2="153" y2="248"/><line x1="107" y1="260" x2="153" y2="260"/><line x1="107" y1="272" x2="153" y2="272"/><line x1="107" y1="284" x2="153" y2="284"/><line x1="107" y1="296" x2="153" y2="296"/><line x1="107" y1="308" x2="153" y2="308"/><line x1="107" y1="320" x2="153" y2="320"/><line x1="107" y1="332" x2="153" y2="332"/><line x1="107" y1="344" x2="153" y2="344"/><line x1="107" y1="356" x2="153" y2="356"/><line x1="107" y1="368" x2="153" y2="368"/><line x1="107" y1="380" x2="153" y2="380"/><line x1="107" y1="392" x2="153" y2="392"/><line x1="107" y1="404" x2="153" y2="404"/><line x1="107" y1="416" x2="153" y2="416"/><line x1="107" y1="428" x2="153" y2="428"/><line x1="107" y1="440" x2="153" y2="440"/><line x1="107" y1="452" x2="153" y2="452"/><line x1="107" y1="464" x2="153" y2="464"/><line x1="107" y1="476" x2="153" y2="476"/><line x1="107" y1="488" x2="153" y2="488"/><line x1="107" y1="500" x2="153" y2="500"/><line x1="107" y1="512" x2="153" y2="512"/><line x1="107" y1="524" x2="153" y2="524"/></g></g></g><g id="eyeball-assembly" style="transition: transform 0.15s ease-out;"><circle cx="130" cy="364" r="26" fill="#1c1e22" stroke="#000000" stroke-width="2"/><circle cx="130" cy="364" r="23" fill="#0a0b0c"/><circle cx="147" cy="388" r="3.5" fill="#1a0000" stroke="#000000" stroke-width="1"/><circle id="indicator-dot" cx="147" cy="388" r="2.5" fill="#ff2200" opacity="0.8" filter="url(#softGlow)"/><circle id="eye-halo" cx="130" cy="364" r="25" fill="#330800" opacity=".05" filter="url(#eyeBloom)"/><g id="eye-pupil" style="transition: transform 0.15s ease-out;"><circle id="eye-layer-idle" cx="130" cy="364" r="17.6" fill="url(#eyeGradIdle)" filter="url(#softGlow)" class="eye-layer" opacity="1" /><circle id="eye-layer-listen" cx="130" cy="364" r="17.6" fill="url(#eyeGradListen)" filter="url(#softGlow)" class="eye-layer" opacity="0" /><circle id="eye-layer-process" cx="130" cy="364" r="17.6" fill="url(#eyeGradProcess)" filter="url(#softGlow)" class="eye-layer" opacity="0" /><circle id="eye-layer-respond" cx="130" cy="364" r="17.6" fill="url(#eyeGradRespond)" filter="url(#softGlow)" class="eye-layer" opacity="0" /><circle id="eye-layer-dance" cx="130" cy="364" r="17.6" fill="url(#eyeGradDance)" filter="url(#softGlow)" class="eye-layer" opacity="0" /><circle id="eye-center" cx="130" cy="364" r="6.6" fill="#ffe855" /><circle cx="128" cy="362" r="2.2" fill="#ffffff" opacity="0.7" /></g><g clip-path="url(#eyeballClip)"><path id="eye-lid" d="m 80,200 h 100 v 164 h -24 a 26,26 0 0 0 -52,0 H 80 Z" fill="url(#lidGrad)" stroke="#000000" stroke-width="2"/><path id="eye-lid-bottom" d="M 80,500 H 180 V 364 h -24 a 26,26 0 0 1 -52,0 H 80 Z" fill="url(#lidGradFlip)" stroke="#000000" stroke-width="2"/></g></g></g></g><path d="m 92,359 5,2 v 6 l -5,2 z" fill="#050505"/><path d="m 92,379 5,2 v 8 l -5,2 z" fill="#050505"/><rect id="danger-ring" x="97" y="283.25" width="66" height="161.5" rx="33" fill="none" stroke="#ff2200" stroke-width="2" opacity="0"/></g></g></g>
        </svg>
      </div>
    `;
    setTimeout(() => { if (this.isConnected) this.applyMeshPolyfill(this.shadowRoot); }, 50);
  }
  applyMeshPolyfill(root) {
    const t="http://www.w3.org/2000/svg",e="http://www.w3.org/1999/xlink",s="http://www.w3.org/1999/xhtml",r=2;
    const n=(t,e,s,r)=>{let n=new x(.5*(e.x+s.x),.5*(e.y+s.y)),o=new x(.5*(t.x+e.x),.5*(t.y+e.y)),i=new x(.5*(s.x+r.x),.5*(s.y+r.y)),a=new x(.5*(n.x+o.x),.5*(n.y+o.y)),h=new x(.5*(n.x+i.x),.5*(n.y+i.y)),l=new x(.5*(a.x+h.x),.5*(a.y+h.y));return[[t,o,a,l],[l,h,i,r]]},o=t=>{let e=t[0].distSquared(t[1]),s=t[2].distSquared(t[3]),r=.25*t[0].distSquared(t[2]),n=.25*t[1].distSquared(t[3]),o=e>s?e:s,i=r>n?r:n;return 18*(o>i?o:i)},i=(t,e)=>Math.sqrt(t.distSquared(e)),a=(t,e)=>t.scale(2/3).add(e.scale(1/3)),h=t=>{let e,s,r,n,o,i,a,h=new g;return t.match(/(\w+\(\s*[^)]+\))+/g).forEach(t=>{let l=t.match(/[\w.-]+/g),d=l.shift();switch(d){case"translate":2===l.length?e=new g(1,0,0,1,l[0],l[1]):(console.error("mesh.js: translate does not have 2 arguments!"),e=new g(1,0,0,1,0,0)),h=h.append(e);break;case"scale":1===l.length?s=new g(l[0],0,0,l[0],0,0):2===l.length?s=new g(l[0],0,0,l[1],0,0):(console.error("mesh.js: scale does not have 1 or 2 arguments!"),s=new g(1,0,0,1,0,0)),h=h.append(s);break;case"rotate":if(3===l.length&&(e=new g(1,0,0,1,l[1],l[2]),h=h.append(e)),l[0]){r=l[0]*Math.PI/180;let t=Math.cos(r),e=Math.sin(r);Math.abs(t)<1e-16&&(t=0),Math.abs(e)<1e-16&&(e=0),a=new g(t,e,-e,t,0,0),h=h.append(a)}else console.error("math.js: No argument to rotate transform!");3===l.length&&(e=new g(1,0,0,1,-l[1],-l[2]),h=h.append(e));break;case"skewX":l[0]?(r=l[0]*Math.PI/180,n=Math.tan(r),o=new g(1,0,n,1,0,0),h=h.append(o)):console.error("math.js: No argument to skewX transform!");break;case"skewY":l[0]?(r=l[0]*Math.PI/180,n=Math.tan(r),i=new g(1,n,0,1,0,0),h=h.append(i)):console.error("math.js: No argument to skewY transform!");break;case"matrix":6===l.length?h=h.append(new g(...l)):console.error("math.js: Incorrect number of arguments for matrix!");break;default:console.error("mesh.js: Unhandled transform type: "+d)}}),h},l=t=>{let e=[],s=t.split(/[ ,]+/);for(let t=0,r=s.length-1;t<r;t+=2)e.push(new x(parseFloat(s[t]),parseFloat(s[t+1])));return e},d=(t,e)=>{for(let s in e)t.setAttribute(s,e[s])},c=(t,e,s,r,n)=>{let o,i,a=[0,0,0,0];for(let h=0;h<3;++h)e[h]<t[h]&&e[h]<s[h]||t[h]<e[h]&&s[h]<e[h]?a[h]=0:(a[h]=.5*((e[h]-t[h])/r+(s[h]-e[h])/n),o=Math.abs(3*(e[h]-t[h])/r),i=Math.abs(3*(s[h]-e[h])/n),a[h]>o?a[h]=o:a[h]>i&&(a[h]=i));return a},u=[[1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0],[-3,3,0,0,-2,-1,0,0,0,0,0,0,0,0,0,0],[2,-2,0,0,1,1,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0],[0,0,0,0,0,0,0,0,-3,3,0,0,-2,-1,0,0],[0,0,0,0,0,0,0,0,2,-2,0,0,1,1,0,0],[-3,0,3,0,0,0,0,0,-2,0,-1,0,0,0,0,0],[0,0,0,0,-3,0,3,0,0,0,0,0,-2,0,-1,0],[9,-9,-9,9,6,3,-6,-3,6,-6,3,-3,4,2,2,1],[-6,6,6,-6,-3,-3,3,3,-4,4,-2,2,-2,-2,-1,-1],[2,0,-2,0,0,0,0,0,1,0,1,0,0,0,0,0],[0,0,0,0,2,0,-2,0,0,0,0,0,1,0,1,0],[-6,6,6,-6,-4,-2,4,2,-3,3,-3,3,-2,-1,-2,-1],[4,-4,-4,4,2,2,-2,-2,2,-2,2,-2,1,1,1,1]],f=t=>{let e=[];for(let s=0;s<16;++s){e[s]=0;for(let r=0;r<16;++r)e[s]+=u[s][r]*t[r]}return e},p=(t,e,s)=>{const r=e*e,n=s*s,o=e*e*e,i=s*s*s;return t[0]+t[1]*e+t[2]*r+t[3]*o+t[4]*s+t[5]*s*e+t[6]*s*r+t[7]*s*o+t[8]*n+t[9]*n*e+t[10]*n*r+t[11]*n*o+t[12]*i+t[13]*i*e+t[14]*i*r+t[15]*i*o},y=t=>{let e=[],s=[],r=[];for(let s=0;s<4;++s)e[s]=[],e[s][0]=n(t[0][s],t[1][s],t[2][s],t[3][s]),e[s][1]=[],e[s][1].push(...n(...e[s][0][0])),e[s][1].push(...n(...e[s][0][1])),e[s][2]=[],e[s][2].push(...n(...e[s][1][0])),e[s][2].push(...n(...e[s][1][1])),e[s][2].push(...n(...e[s][1][2])),e[s][2].push(...n(...e[s][1][3]));for(let t=0;t<8;++t){s[t]=[];for(let r=0;r<4;++r)s[t][r]=[],s[t][r][0]=n(e[0][2][t][r],e[1][2][t][r],e[2][2][t][r],e[3][2][t][r]),s[t][r][1]=[],s[t][r][1].push(...n(...s[t][r][0][0])),s[t][r][1].push(...n(...s[t][r][0][1])),s[t][r][2]=[],s[t][r][2].push(...n(...s[t][r][1][0])),s[t][r][2].push(...n(...s[t][r][1][1])),s[t][r][2].push(...n(...s[t][r][1][2])),s[t][r][2].push(...n(...s[t][r][1][3]))}for(let t=0;t<8;++t){r[t]=[];for(let e=0;e<8;++e)r[t][e]=[],r[t][e][0]=s[t][0][2][e],r[t][e][1]=s[t][1][2][e],r[t][e][2]=s[t][2][2][e],r[t][e][3]=s[t][3][2][e]}return r};class x{constructor(t,e){this.x=t||0,this.y=e||0}toString(){return`(x=${this.x}, y=${this.y})`}clone(){return new x(this.x,this.y)}add(t){return new x(this.x+t.x,this.y+t.y)}scale(t){return void 0===t.x?new x(this.x*t,this.y*t):new x(this.x*t.x,this.y*t.y)}distSquared(t){let e=this.x-t.x,s=this.y-t.y;return e*e+s*s}transform(t){let e=this.x*t.a+this.y*t.c+t.e,s=this.x*t.b+this.y*t.d+t.f;return new x(e,s)}}class g{constructor(t,e,s,r,n,o){void 0===t?(this.a=1,this.b=0,this.c=0,this.d=1,this.e=0,this.f=0):(this.a=t,this.b=e,this.c=s,this.d=r,this.e=n,this.f=o)}toString(){return`affine: ${this.a} ${this.c} ${this.e} \n       ${this.b} ${this.d} ${this.f}`}append(t){let e=this.a*t.a+this.c*t.b,s=this.b*t.a+this.d*t.b,r=this.a*t.c+this.c*t.d,n=this.b*t.c+this.d*t.d,o=this.a*t.e+this.c*t.f+this.e,i=this.b*t.e+this.d*t.f+this.f;return new g(e,s,r,n,o,i)}}class w{constructor(t,e){this.nodes=t,this.colors=e}paintCurve(t,e){if(o(this.nodes)>r){const s=n(...this.nodes);let r=[[],[]],o=[[],[]];for(let t=0;t<4;++t)r[0][t]=this.colors[0][t],r[1][t]=(this.colors[0][t]+this.colors[1][t])/2,o[0][t]=r[1][t],o[1][t]=this.colors[1][t];let i=new w(s[0],r),a=new w(s[1],o);i.paintCurve(t,e),a.paintCurve(t,e)}else{let s=Math.round(this.nodes[0].x);if(s>=0&&s<e){let r=4*(~~this.nodes[0].y*e+s);t[r]=Math.round(this.colors[0][0]),t[r+1]=Math.round(this.colors[0][1]),t[r+2]=Math.round(this.colors[0][2]),t[r+3]=Math.round(this.colors[0][3])}}}}class m{constructor(t,e){this.nodes=t,this.colors=e}split(){let t=[[],[],[],[]],e=[[],[],[],[]],s=[[[],[]],[[],[]]],r=[[[],[]],[[],[]]];for(let s=0;s<4;++s){const r=n(this.nodes[0][s],this.nodes[1][s],this.nodes[2][s],this.nodes[3][s]);t[0][s]=r[0][0],t[1][s]=r[0][1],t[2][s]=r[0][2],t[3][s]=r[0][3],e[0][s]=r[1][0],e[1][s]=r[1][1],e[2][s]=r[1][2],e[3][s]=r[1][3]}for(let t=0;t<4;++t)s[0][0][t]=this.colors[0][0][t],s[0][1][t]=this.colors[0][1][t],s[1][0][t]=(this.colors[0][0][t]+this.colors[1][0][t])/2,s[1][1][t]=(this.colors[0][1][t]+this.colors[1][1][t])/2,r[0][0][t]=s[1][0][t],r[0][1][t]=s[1][1][t],r[1][0][t]=this.colors[1][0][t],r[1][1][t]=this.colors[1][1][t];return[new m(t,s),new m(e,r)]}paint(t,e){let s,n=!1;for(let t=0;t<4;++t)if((s=o([this.nodes[0][t],this.nodes[1][t],this.nodes[2][t],this.nodes[3][t]]))>r){n=!0;break}if(n){let s=this.split();s[0].paint(t,e),s[1].paint(t,e)}else{new w([...this.nodes[0]],[...this.colors[0]]).paintCurve(t,e)}}}class b{constructor(t){this.readMesh(t),this.type=t.getAttribute("type")||"bilinear"}readMesh(t){let e=[[]],s=[[]],r=Number(t.getAttribute("x")),n=Number(t.getAttribute("y"));e[0][0]=new x(r,n);let o=t.children;for(let t=0,r=o.length;t<r;++t){e[3*t+1]=[],e[3*t+2]=[],e[3*t+3]=[],s[t+1]=[];let r=o[t].children;for(let n=0,o=r.length;n<o;++n){let o=r[n].children;for(let r=0,i=o.length;r<i;++r){let i=r;0!==t&&++i;let h,d=o[r].getAttribute("path"),c="l";null!=d&&(c=(h=d.match(/\s*([lLcC])\s*(.*)/))[1]);let u=l(h[2]);switch(c){case"l":0===i?(e[3*t][3*n+3]=u[0].add(e[3*t][3*n]),e[3*t][3*n+1]=a(e[3*t][3*n],e[3*t][3*n+3]),e[3*t][3*n+2]=a(e[3*t][3*n+3],e[3*t][3*n])):1===i?(e[3*t+3][3*n+3]=u[0].add(e[3*t][3*n+3]),e[3*t+1][3*n+3]=a(e[3*t][3*n+3],e[3*t+3][3*n+3]),e[3*t+2][3*n+3]=a(e[3*t+3][3*n+3],e[3*t][3*n+3])):2===i?(0===n&&(e[3*t+3][3*n+0]=u[0].add(e[3*t+3][3*n+3])),e[3*t+3][3*n+1]=a(e[3*t+3][3*n],e[3*t+3][3*n+3]),e[3*t+3][3*n+2]=a(e[3*t+3][3*n+3],e[3*t+3][3*n])):(e[3*t+1][3*n]=a(e[3*t][3*n],e[3*t+3][3*n]),e[3*t+2][3*n]=a(e[3*t+3][3*n],e[3*t][3*n]));break;case"L":0===i?(e[3*t][3*n+3]=u[0],e[3*t][3*n+1]=a(e[3*t][3*n],e[3*t][3*n+3]),e[3*t][3*n+2]=a(e[3*t][3*n+3],e[3*t][3*n])):1===i?(e[3*t+3][3*n+3]=u[0],e[3*t+1][3*n+3]=a(e[3*t][3*n+3],e[3*t+3][3*n+3]),e[3*t+2][3*n+3]=a(e[3*t+3][3*n+3],e[3*t][3*n+3])):2===i?(0===n&&(e[3*t+3][3*n+0]=u[0]),e[3*t+3][3*n+1]=a(e[3*t+3][3*n],e[3*t+3][3*n+3]),e[3*t+3][3*n+2]=a(e[3*t+3][3*n+3],e[3*t+3][3*n])):(e[3*t+1][3*n]=a(e[3*t][3*n],e[3*t+3][3*n]),e[3*t+2][3*n]=a(e[3*t+3][3*n],e[3*t][3*n]));break;case"c":0===i?(e[3*t][3*n+1]=u[0].add(e[3*t][3*n]),e[3*t][3*n+2]=u[1].add(e[3*t][3*n]),e[3*t][3*n+3]=u[2].add(e[3*t][3*n])):1===i?(e[3*t+1][3*n+3]=u[0].add(e[3*t][3*n+3]),e[3*t+2][3*n+3]=u[1].add(e[3*t][3*n+3]),e[3*t+3][3*n+3]=u[2].add(e[3*t][3*n+3])):2===i?(e[3*t+3][3*n+2]=u[0].add(e[3*t+3][3*n+3]),e[3*t+3][3*n+1]=u[1].add(e[3*t+3][3*n+3]),0===n&&(e[3*t+3][3*n+0]=u[2].add(e[3*t+3][3*n+3]))):(e[3*t+2][3*n]=u[0].add(e[3*t+3][3*n]),e[3*t+1][3*n]=u[1].add(e[3*t+3][3*n]));break;case"C":0===i?(e[3*t][3*n+1]=u[0],e[3*t][3*n+2]=u[1],e[3*t][3*n+3]=u[2]):1===i?(e[3*t+1][3*n+3]=u[0],e[3*t+2][3*n+3]=u[1],e[3*t+3][3*n+3]=u[2]):2===i?(e[3*t+3][3*n+2]=u[0],e[3*t+3][3*n+1]=u[1],0===n&&(e[3*t+3][3*n+0]=u[2])):(e[3*t+2][3*n]=u[0],e[3*t+1][3*n]=u[1]);break;default:console.error("mesh.js: "+c+" invalid path type.")}if(0===t&&0===n||r>0){let e=window.getComputedStyle(o[r]).stopColor.match(/^rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i),a=window.getComputedStyle(o[r]).stopOpacity,h=255;a&&(h=Math.floor(255*a)),e&&(0===i?(s[t][n]=[],s[t][n][0]=Math.floor(e[1]),s[t][n][1]=Math.floor(e[2]),s[t][n][2]=Math.floor(e[3]),s[t][n][3]=h):1===i?(s[t][n+1]=[],s[t][n+1][0]=Math.floor(e[1]),s[t][n+1][1]=Math.floor(e[2]),s[t][n+1][2]=Math.floor(e[3]),s[t][n+1][3]=h):2===i?(s[t+1][n+1]=[],s[t+1][n+1][0]=Math.floor(e[1]),s[t+1][n+1][1]=Math.floor(e[2]),s[t+1][n+1][2]=Math.floor(e[3]),s[t+1][n+1][3]=h):3===i&&(s[t+1][n]=[],s[t+1][n][0]=Math.floor(e[1]),s[t+1][n][1]=Math.floor(e[2]),s[t+1][n][2]=Math.floor(e[3]),s[t+1][n][3]=h))}}e[3*t+1][3*n+1]=new x,e[3*t+1][3*n+2]=new x,e[3*t+2][3*n+1]=new x,e[3*t+2][3*n+2]=new x,e[3*t+1][3*n+1].x=(-4*e[3*t][3*n].x+6*(e[3*t][3*n+1].x+e[3*t+1][3*n].x)+-2*(e[3*t][3*n+3].x+e[3*t+3][3*n].x)+3*(e[3*t+3][3*n+1].x+e[3*t+1][3*n+3].x)+-1*e[3*t+3][3*n+3].x)/9,e[3*t+1][3*n+2].x=(-4*e[3*t][3*n+3].x+6*(e[3*t][3*n+2].x+e[3*t+1][3*n+3].x)+-2*(e[3*t][3*n].x+e[3*t+3][3*n+3].x)+3*(e[3*t+3][3*n+2].x+e[3*t+1][3*n].x)+-1*e[3*t+3][3*n].x)/9,e[3*t+2][3*n+1].x=(-4*e[3*t+3][3*n].x+6*(e[3*t+3][3*n+1].x+e[3*t+2][3*n].x)+-2*(e[3*t+3][3*n+3].x+e[3*t][3*n].x)+3*(e[3*t][3*n+1].x+e[3*t+2][3*n+3].x)+-1*e[3*t][3*n+3].x)/9,e[3*t+2][3*n+2].x=(-4*e[3*t+3][3*n+3].x+6*(e[3*t+3][3*n+2].x+e[3*t+2][3*n+3].x)+-2*(e[3*t+3][3*n].x+e[3*t][3*n+3].x)+3*(e[3*t][3*n+2].x+e[3*t+2][3*n].x)+-1*e[3*t][3*n].x)/9,e[3*t+1][3*n+1].y=(-4*e[3*t][3*n].y+6*(e[3*t][3*n+1].y+e[3*t+1][3*n].y)+-2*(e[3*t][3*n+3].y+e[3*t+3][3*n].y)+3*(e[3*t+3][3*n+1].y+e[3*t+1][3*n+3].y)+-1*e[3*t+3][3*n+3].y)/9,e[3*t+1][3*n+2].y=(-4*e[3*t][3*n+3].y+6*(e[3*t][3*n+2].y+e[3*t+1][3*n+3].y)+-2*(e[3*t][3*n].y+e[3*t+3][3*n+3].y)+3*(e[3*t+3][3*n+2].y+e[3*t+1][3*n].y)+-1*e[3*t+3][3*n].y)/9,e[3*t+2][3*n+1].y=(-4*e[3*t+3][3*n].y+6*(e[3*t+3][3*n+1].y+e[3*t+2][3*n].y)+-2*(e[3*t+3][3*n+3].y+e[3*t][3*n].y)+3*(e[3*t][3*n+1].y+e[3*t+2][3*n+3].y)+-1*e[3*t][3*n+3].y)/9,e[3*t+2][3*n+2].y=(-4*e[3*t+3][3*n+3].y+6*(e[3*t+3][3*n+2].y+e[3*t+2][3*n+3].y)+-2*(e[3*t+3][3*n].y+e[3*t][3*n+3].y)+3*(e[3*t][3*n+2].y+e[3*t+2][3*n].y)+-1*e[3*t][3*n].y)/9}}this.nodes=e,this.colors=s}paintMesh(t,e){let s=(this.nodes.length-1)/3,r=(this.nodes[0].length-1)/3;if("bilinear"===this.type||s<2||r<2){let n;for(let o=0;o<s;++o)for(let s=0;s<r;++s){let r=[];for(let t=3*o,e=3*o+4;t<e;++t)r.push(this.nodes[t].slice(3*s,3*s+4));let i=[];i.push(this.colors[o].slice(s,s+2)),i.push(this.colors[o+1].slice(s,s+2)),(n=new m(r,i)).paint(t,e)}}else{let n,o,a,h,l,d,u;const x=s,g=r;s++,r++;let w=new Array(s);for(let t=0;t<s;++t){w[t]=new Array(r);for(let e=0;e<r;++e)w[t][e]=[],w[t][e][0]=this.nodes[3*t][3*e],w[t][e][1]=this.colors[t][e]}for(let t=0;t<s;++t)for(let e=0;e<r;++e)0!==t&&t!==x&&(n=i(w[t-1][e][0],w[t][e][0]),o=i(w[t+1][e][0],w[t][e][0]),w[t][e][2]=c(w[t-1][e][1],w[t][e][1],w[t+1][e][1],n,o)),0!==e&&e!==g&&(n=i(w[t][e-1][0],w[t][e][0]),o=i(w[t][e+1][0],w[t][e][0]),w[t][e][3]=c(w[t][e-1][1],w[t][e][1],w[t][e+1][1],n,o));for(let t=0;t<r;++t){w[0][t][2]=[],w[x][t][2]=[];for(let e=0;e<4;++e)n=i(w[1][t][0],w[0][t][0]),o=i(w[x][t][0],w[x-1][t][0]),w[0][t][2][e]=n>0?2*(w[1][t][1][e]-w[0][t][1][e])/n-w[1][t][2][e]:0,w[x][t][2][e]=o>0?2*(w[x][t][1][e]-w[x-1][t][1][e])/o-w[x-1][t][2][e]:0}for(let t=0;t<s;++t){w[t][0][3]=[],w[t][g][3]=[];for(let e=0;e<4;++e)n=i(w[t][1][0],w[t][0][0]),o=i(w[t][g][0],w[t][g-1][0]),w[t][0][3][e]=n>0?2*(w[t][1][1][e]-w[t][0][1][e])/n-w[t][1][3][e]:0,w[t][g][3][e]=o>0?2*(w[t][g][1][e]-w[t][g-1][1][e])/o-w[t][g-1][3][e]:0}for(let s=0;s<x;++s)for(let r=0;r<g;++r){let n=i(w[s][r][0],w[s+1][r][0]),o=i(w[s][r+1][0],w[s+1][r+1][0]),c=i(w[s][r][0],w[s][r+1][0]),x=i(w[s+1][r][0],w[s+1][r+1][0]),g=[[],[],[],[]];for(let t=0;t<4;++t){(d=[])[0]=w[s][r][1][t],d[1]=w[s+1][r][1][t],d[2]=w[s][r+1][1][t],d[3]=w[s+1][r+1][1][t],d[4]=w[s][r][2][t]*n,d[5]=w[s+1][r][2][t]*n,d[6]=w[s][r+1][2][t]*o,d[7]=w[s+1][r+1][2][t]*o,d[8]=w[s][r][3][t]*c,d[9]=w[s+1][r][3][t]*x,d[10]=w[s][r+1][3][t]*c,d[11]=w[s+1][r+1][3][t]*x,d[12]=0,d[13]=0,d[14]=0,d[15]=0,u=f(d);for(let e=0;e<9;++e){g[t][e]=[];for(let s=0;s<9;++s)g[t][e][s]=p(u,e/8,s/8),g[t][e][s]>255?g[t][e][s]=255:g[t][e][s]<0&&(g[t][e][s]=0)}}h=[];for(let t=3*s,e=3*s+4;t<e;++t)h.push(this.nodes[t].slice(3*r,3*r+4));l=y(h);for(let s=0;s<8;++s)for(let r=0;r<8;++r)(a=new m(l[s][r],[[[g[0][s][r],g[1][s][r],g[2][s][r],g[3][s][r]],[g[0][s][r+1],g[1][s][r+1],g[2][s][r+1],g[3][s][r+1]]],[[g[0][s+1][r],g[1][s+1][r],g[2][s+1][r],g[3][s+1][r]],[g[0][s+1][r+1],g[1][s+1][r+1],g[2][s+1][r+1],g[3][s+1][r+1]]]])).paint(t,e)}}}transform(t){if(t instanceof x)for(let e=0,s=this.nodes.length;e<s;++e)for(let s=0,r=this.nodes[0].length;s<r;++s)this.nodes[e][s]=this.nodes[e][s].add(t);else if(t instanceof g)for(let e=0,s=this.nodes.length;e<s;++e)for(let s=0,r=this.nodes[0].length;s<r;++s)this.nodes[e][s]=this.nodes[e][s].transform(t)}scale(t){for(let e=0,s=this.nodes.length;e<s;++e)for(let s=0,r=this.nodes[0].length;s<r;++s)this.nodes[e][s]=this.nodes[e][s].scale(t)}}
    root.querySelectorAll("rect,circle,ellipse,path,text").forEach((el,n)=>{let o=el.getAttribute("id");o||(o="patchjs_shape"+n,el.setAttribute("id",o));const fillMatch=el.style.fill?el.style.fill.match(/^url\(\s*"?\s*#([^\s"]+)"?\s*\)/):null;const attrFillMatch=el.getAttribute('fill')?el.getAttribute('fill').match(/^url\(\s*"?\s*#([^\s"]+)"?\s*\)/):null;const validFillMatch=fillMatch||attrFillMatch;if(validFillMatch&&validFillMatch[1]){const gradNode=root.querySelector('#'+validFillMatch[1]);if(gradNode&&"meshgradient"===gradNode.nodeName.toLowerCase()){try{const bbox=el.getBBox();if(bbox.width===0||bbox.height===0)return;let canvas=document.createElementNS(s,"canvas");d(canvas,{width:bbox.width,height:bbox.height});const ctx=canvas.getContext("2d");let imgData=ctx.createImageData(bbox.width,bbox.height);const mesh=new b(gradNode);"objectBoundingBox"===gradNode.getAttribute("gradientUnits")&&mesh.scale(new x(bbox.width,bbox.height));const trans=gradNode.getAttribute("gradientTransform");null!=trans&&mesh.transform(h(trans));"userSpaceOnUse"===gradNode.getAttribute("gradientUnits")&&mesh.transform(new x(-bbox.x,-bbox.y));mesh.paintMesh(imgData.data,canvas.width);ctx.putImageData(imgData,0,0);const img=document.createElementNS(t,"image");d(img,{width:bbox.width,height:bbox.height,x:bbox.x,y:bbox.y});let dataUrl=canvas.toDataURL();img.setAttributeNS(e,"href",dataUrl);el.parentNode.insertBefore(img,el);if(el.style.fill)el.style.fill="none";if(el.getAttribute('fill'))el.setAttribute('fill','none');const useEl=document.createElementNS(t,"use");useEl.setAttributeNS(e,"href","#"+o);const clipId="patchjs_clip_"+n+"_"+Math.random().toString(36).substr(2,9);const clipPath=document.createElementNS(t,"clipPath");clipPath.setAttribute("id",clipId);clipPath.appendChild(useEl);el.parentElement.insertBefore(clipPath,el);img.setAttribute("clip-path","url(#"+clipId+")");}catch(err){console.warn("Mesh gradient polyfill skipped for",el,err);}}}});
  }
  initGlados() {
    const root = this.shadowRoot;
    const config = this.config;
    const el = {
      svg: root.getElementById('glados-svg'), head: root.getElementById('glados-head'), torsoSwivel: root.getElementById('torso-swivel'),
      eyeLayerIdle: root.getElementById('eye-layer-idle'), eyeLayerListen: root.getElementById('eye-layer-listen'), eyeLayerProcess: root.getElementById('eye-layer-process'),
      eyeLayerRespond: root.getElementById('eye-layer-respond'), eyeLayerDance: root.getElementById('eye-layer-dance'), eyeHalo: root.getElementById('eye-halo'),
      eyeCenter: root.getElementById('eye-center'), pupil: root.getElementById('eye-pupil'), eyeball: root.getElementById('eyeball-assembly'),
      bellows: root.getElementById('bellows'), lidTop: root.getElementById('eye-lid'), lidBot: root.getElementById('eye-lid-bottom'),
      dangerRing: root.getElementById('danger-ring'), ledMatrices: root.querySelectorAll('.led-matrix')
    };
    this._svg = el.svg;
    let stateNow = 'idle', currentBaseLid = 0, currentLedColor = '#ffb800', currentLedOpacity = '0.15';
    function setHead(rot, tx, ty, scale = 1.0, dur, ease = "cubic-bezier(0.34,1.06,0.64,1)") { el.head.style.transition = `transform ${dur}s ${ease}`; el.head.style.transform = `translate3d(${tx}px,${ty}px,0) rotate(${rot}deg) scale(${scale})`; }
    function setBodySwivel(rot, sx, dur) { el.torsoSwivel.style.transition = `transform ${dur || 2.0}s cubic-bezier(0.45,0.05,0.55,0.95)`; el.torsoSwivel.style.transform = `rotate(${rot}deg) scaleX(${sx || 1})`; }
    function resetBodySwivel() { el.torsoSwivel.style.transition = `transform 2.0s cubic-bezier(0.45,0.05,0.55,0.95)`; el.torsoSwivel.style.transform = ''; }
    function setLid(amount, dur = 0.7) { const px = amount * 17; el.lidTop.style.transition = `transform ${dur}s ease-in-out`; el.lidBot.style.transition = `transform ${dur}s ease-in-out`; el.lidTop.style.transform = `translate3d(0, ${px}px, 0)`; el.lidBot.style.transform = `translate3d(0, ${-px}px, 0)`; }
    function setBaseLid(amount, dur = 0.7) { currentBaseLid = amount; setLid(amount, dur); }
    function setPupil(px, py) { el.pupil.style.transform = `translate3d(${px}px, ${py}px, 0)`; let ey = py * 1.5; el.eyeball.style.transform = `translate3d(0, ${ey}px, 0)`; el.bellows.style.transform = `translate3d(0, ${ey}px, 0)`; }
    function setLEDs(color, opacity) { currentLedColor = color; currentLedOpacity = opacity; el.svg.style.setProperty('--led-color', color); el.svg.style.setProperty('--led-opacity', opacity); }
    this.lidTimer = null; this.idleTimer = null; this.pupilTimer = null; this.glitchRaf = null; this.danceTimer = null; this.danceLedTimer = null; this.talkAnim = null; this.respondTimer = null; this._bopRaf = null; this._bopping = false;
    const startLidBehavior = () => { if (this.lidTimer) clearTimeout(this.lidTimer); const loop = () => { if (stateNow === 'idle') { let val = Math.max(0, Math.min(1, currentBaseLid + (Math.random() - 0.5) * 0.15)); setLid(val, 0.5 + Math.random() * 0.8); this.lidTimer = setTimeout(loop, 1500 + Math.random() * 2500); } else if (stateNow === 'processing') { let val = 0.5 + (Math.random() * 0.35); setLid(val, 0.04 + Math.random() * 0.08); this.lidTimer = setTimeout(loop, 40 + Math.random() * 120); } }; loop(); };
    const stopLidBehavior = () => { if (this.lidTimer) { clearTimeout(this.lidTimer); this.lidTimer = null; } };
    const IDLE_BEHAVIORS = [
      { name: 'passive', exec() { setHead(0, 0, 0, 1.0, 2.4); setBaseLid(0, 1.0); resetBodySwivel(); }, min: 6000, max: 13000, weight: 4 },
      { name: 'scan_right', exec() { setHead(12, 0, -5, 0.98, 1.4); setBaseLid(0, 1.0); setBodySwivel(-2, 1, 1.8); }, min: 3500, max: 7000, weight: 1.5 },
      { name: 'scan_left', exec() { setHead(-12, 0, -5, 0.98, 1.4); setBaseLid(0, 1.0); setBodySwivel(2, 1, 1.8); }, min: 3500, max: 7000, weight: 1.5 },
      { name: 'curious', exec() { setHead(8, 0, -20, 1.05, 1.2); setBaseLid(0, 0.8); setBodySwivel(-2, 1, 1.6); }, min: 4000, max: 8000, weight: 2 },
      { name: 'contemptuous', exec() { setHead(-6, 0, 15, 0.95, 1.8); setBaseLid(0.65, 1.0); setBodySwivel(1.5, 1, 2.0); setTimeout(() => { if (stateNow === 'idle') setBaseLid(0, 1.5); }, 1500); }, min: 5000, max: 10000, weight: 2 },
      { name: 'alert', exec() { setHead(0, 0, -25, 1.08, 0.28); setBaseLid(0, 0.2); setBodySwivel(-1, 1, 0.4); }, min: 1500, max: 3000, weight: 1 },
      { name: 'bored', exec() { setHead(2, 0, 20, 0.96, 2.8); setBaseLid(0.7, 1.5); setBodySwivel(1, 1, 3.0); setTimeout(() => { if (stateNow === 'idle') setBaseLid(0, 1.5); }, 1500); }, min: 7000, max: 14000, weight: 1.5 },
      { name: 'full_swivel', exec() { setBodySwivel(-6, 0.96, 2.5); setTimeout(() => { setHead(6, 0, -3, 1.02, 1.2); setBaseLid(0, 0.8); }, 600); }, min: 4000, max: 8000, weight: 0.8 },
      { name: 'glitch', exec: () => { let count = 0, lastTime = 0; if (this.glitchRaf) cancelAnimationFrame(this.glitchRaf); const glitchLoop = (timestamp) => { if (!lastTime) lastTime = timestamp; if (timestamp - lastTime > 60) { lastTime = timestamp; if (stateNow !== 'idle' || count > 12) { cancelAnimationFrame(this.glitchRaf); this.glitchRaf = null; if (stateNow === 'idle') { el.eyeHalo.setAttribute('fill', '#330800'); el.eyeCenter.setAttribute('fill', '#ffcc00'); setHead(0, 0, 0, 1.0, 0.4); } return; } setHead((Math.random()-0.5)*10, (Math.random()-0.5)*8, (Math.random()-0.5)*8, 1.0, 0.05, "linear"); if (count % 2 === 0) { el.eyeHalo.setAttribute('fill', '#110000'); el.eyeCenter.setAttribute('fill', '#884400'); } else { el.eyeHalo.setAttribute('fill', '#ffb800'); el.eyeCenter.setAttribute('fill', '#ffffff'); } count++; } this.glitchRaf = requestAnimationFrame(glitchLoop); }; this.glitchRaf = requestAnimationFrame(glitchLoop); }, min: 4000, max: 7000, weight: 0.3 }
    ];
    const dartPupil = () => { if (stateNow === 'idle') { const max = 7; setPupil((Math.random() - 0.5) * max * 2, (Math.random() - 0.5) * max * 2); this.pupilTimer = setTimeout(dartPupil, 600 + Math.random() * 2500); } };
    const runNextIdleBehavior = () => { if (stateNow !== 'idle') return; let r = Math.random() * IDLE_BEHAVIORS.reduce((s, b) => s + b.weight, 0), chosen = IDLE_BEHAVIORS[0]; for (const b of IDLE_BEHAVIORS) { r -= b.weight; if (r <= 0) { chosen = b; break; } } try { chosen.exec(); } catch(err) {} this.idleTimer = setTimeout(runNextIdleBehavior, chosen.min + Math.random() * (chosen.max - chosen.min)); };
    this.startIdleCycle = () => { this.stopIdleCycle(); dartPupil(); this.idleTimer = setTimeout(runNextIdleBehavior, 2000 + Math.random() * 3000); };
    this.stopIdleCycle = () => { if (this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = null; } if (this.pupilTimer) { clearTimeout(this.pupilTimer); this.pupilTimer = null; } if (this.glitchRaf) { cancelAnimationFrame(this.glitchRaf); this.glitchRaf = null; } };
    this.stopDanceCycle = () => { if (this.danceTimer) { clearTimeout(this.danceTimer); this.danceTimer = null; } if (this.danceLedTimer) { clearTimeout(this.danceLedTimer); this.danceLedTimer = null; } };
    this.startDanceCycle = (bpm) => {
      this.stopDanceCycle();
      let dancePhase = 0; let currentRoutine = Math.floor(Math.random() * 8);
      const currentBpm = Math.max(60, Math.min(200, bpm));
      const beatMs = (60 / currentBpm) * 1000; const beatSec = beatMs / 1000;
      let expectedNextTick = performance.now() + beatMs;
      const step = () => {
        if (stateNow !== 'dancing') return;
        if (dancePhase > 0 && dancePhase % 16 === 0) { let nextRoutine; do { nextRoutine = Math.floor(Math.random() * 8); } while (nextRoutine === currentRoutine); currentRoutine = nextRoutine; }
        const choreoBlock = currentRoutine; const isDownBeat = dancePhase % 2 === 0; const isQuadBeat = dancePhase % 4 === 0; const phaseMod4 = dancePhase % 4; const phaseMod8 = dancePhase % 8; let dirX = isDownBeat ? 1 : -1;
        setLEDs('#1DB954', '1'); el.eyeHalo.style.opacity = (choreoBlock === 7) ? '0.8' : '0.5'; el.eyeCenter.style.transform = 'scale(1.2)';
        if (this.danceLedTimer) clearTimeout(this.danceLedTimer);
        this.danceLedTimer = setTimeout(() => { if (stateNow === 'dancing') { setLEDs('#1DB954', '0.15'); el.eyeHalo.style.opacity = '0.05'; el.eyeCenter.style.transform = 'scale(1)'; } }, beatMs * 0.3);
        let r = 0, tx = 0, ty = 0, s = 1.0, lid = 0.0, ease = "ease-in-out"; let moveDur = beatSec; let bodyDur = beatSec * 2;
        const executeTick = () => { dancePhase++; const now = performance.now(); if (now > expectedNextTick + beatMs) { expectedNextTick = now; } else { expectedNextTick += beatMs; } const delay = Math.max(0, expectedNextTick - now); this.danceTimer = setTimeout(step, delay); };
        if (currentBpm < 90) { moveDur = beatSec * 2; bodyDur = beatSec * 4; ease = "ease-in-out"; lid = 0.4; if (choreoBlock === 0) { r = isQuadBeat ? 8 : -8; tx = isQuadBeat ? 5 : -5; ty = 2; } else if (choreoBlock === 1) { r = 0; tx = 0; ty = isQuadBeat ? 15 : -5; } else if (choreoBlock === 2) { r = Math.sin(dancePhase * Math.PI / 2) * 6; tx = Math.sin(dancePhase * Math.PI / 2) * 5; ty = Math.cos(dancePhase * Math.PI / 4) * 8 + 4; } else if (choreoBlock === 3) { r = (phaseMod8 < 4) ? 10 : -10; tx = (phaseMod8 < 4) ? 4 : -4; ty = 5; } else if (choreoBlock === 4) { r = Math.sin(dancePhase * Math.PI / 4) * 12; tx = 0; ty = 0; } else if (choreoBlock === 5) { r = isQuadBeat ? 4 : -4; tx = 0; ty = isQuadBeat ? 12 : 2; s = isQuadBeat ? 1.03 : 1.0; } else if (choreoBlock === 6) { r = (phaseMod8 === 0) ? 12 : (phaseMod8 === 4) ? -6 : 0; tx = r * 0.5; ty = 8; } else { r = 0; tx = 0; ty = 2; s = 1.05; lid = 0.5 + Math.sin(dancePhase * Math.PI / 2) * 0.3; } if (!isDownBeat) return executeTick();
        } else if (currentBpm < 125) { moveDur = beatSec * 0.8; ease = "cubic-bezier(0.34, 1.06, 0.64, 1)"; lid = 0.2; if (choreoBlock === 0) { r = isDownBeat ? 7 : -7; ty = isDownBeat ? 8 : -2; s = isDownBeat ? 1.02 : 1.0; } else if (choreoBlock === 1) { const side = (phaseMod4 < 2) ? 1 : -1; r = side * 8; tx = side * 4; ty = isDownBeat ? 10 : 2; } else if (choreoBlock === 2) { r = (phaseMod4 === 0) ? 10 : (phaseMod4 === 2) ? -10 : 0; ty = (phaseMod4 === 1 || phaseMod4 === 3) ? 12 : 0; ease = "ease-in-out"; } else if (choreoBlock === 3) { r = [10, 5, -10, -5][phaseMod4]; ty = [0, 8, 0, 8][phaseMod4]; } else if (choreoBlock === 4) { r = 0; tx = isDownBeat ? 8 : -8; ty = 4; } else if (choreoBlock === 5) { r = isDownBeat ? 10 : -10; tx = isDownBeat ? 5 : -5; ty = isDownBeat ? 10 : -5; } else if (choreoBlock === 6) { r = dirX * 6; ty = !isDownBeat ? 14 : 0; s = !isDownBeat ? 1.04 : 1.0; } else { const side = (dancePhase % 3 === 0) ? -1 : 1; r = side * 8; ty = isDownBeat ? 8 : 0; }
        } else if (currentBpm < 160) { moveDur = beatSec * 0.6; ease = "cubic-bezier(0.25, 0.8, 0.25, 1)"; lid = isDownBeat ? 0.1 : 0.0; if (choreoBlock === 0) { r = isDownBeat ? 12 : -12; tx = isDownBeat ? 6 : -6; ty = isDownBeat ? 10 : -8; s = 1.03; } else if (choreoBlock === 1) { r = 0; tx = [8, 0, -8, 0][phaseMod4]; ty = isDownBeat ? 5 : -5; if (phaseMod4 === 3) lid = 0.6; } else if (choreoBlock === 2) { r = isDownBeat ? 5 : -5; ty = isDownBeat ? 5 : -2; s = 1.0 + (phaseMod4 * 0.03); lid = 0.4 - (phaseMod4 * 0.1); } else if (choreoBlock === 3) { r = isDownBeat ? 15 : -15; tx = isDownBeat ? 5 : -5; ty = 8; } else if (choreoBlock === 4) { r = [10, 10, -10, -10][phaseMod4]; tx = [5, 5, -5, -5][phaseMod4]; ty = [8, -2, 8, -2][phaseMod4]; } else if (choreoBlock === 5) { r = dirX * 10; ty = isDownBeat ? 12 : 4; s = 1.02; moveDur = beatSec * 0.4; ease="linear"; } else if (choreoBlock === 6) { r = (phaseMod4 === 1 || phaseMod4 === 3) ? 0 : (phaseMod4 === 0 ? 12 : -12); ty = (phaseMod4 === 1 || phaseMod4 === 3) ? 14 : -2; } else { r = isDownBeat ? 12 : 12; tx = isDownBeat ? 8 : 8; ty = isDownBeat ? 8 : -4; if (isDownBeat) moveDur = beatSec * 0.1; else moveDur = beatSec * 0.8; } if (isDownBeat && choreoBlock !== 2) setPupil((Math.random()-0.5)*8, (Math.random()-0.5)*6);
        } else { moveDur = beatSec * 0.8; ease = "linear"; lid = isQuadBeat ? 0.4 : 0.0; if (choreoBlock === 0) { r = 0; tx = 0; ty = isDownBeat ? 20 : -10; s = isDownBeat ? 1.08 : 0.95; ease = "ease-out"; } else if (choreoBlock === 1) { r = (Math.random() - 0.5) * 30; tx = (Math.random() - 0.5) * 15; ty = (Math.random() - 0.5) * 15; moveDur = beatSec * 0.5; } else if (choreoBlock === 2) { r = isDownBeat ? 18 : -18; tx = isDownBeat ? 10 : -10; ty = 12; } else if (choreoBlock === 3) { r = isDownBeat ? 10 : -10; tx = (Math.random() - 0.5) * 20; ty = 15; s = 1.1; el.eyeHalo.style.opacity = '0.8'; } else if (choreoBlock === 4) { r = isDownBeat ? 25 : -25; tx = isDownBeat ? 15 : -15; ty = isDownBeat ? 15 : -15; } else if (choreoBlock === 5) { r = 0; tx = 0; ty = isDownBeat ? 12 : 2; moveDur = beatSec * 0.3; } else if (choreoBlock === 6) { r = Math.sin(dancePhase * Math.PI) * 20; tx = Math.sin(dancePhase * Math.PI) * 12; ty = Math.cos(dancePhase * Math.PI / 2) * 15 + 5; } else { if (phaseMod4 === 0) { r=15; ty=10; s=1.1; moveDur = beatSec * 0.1; } else { r=15; ty=10; s=1.1; moveDur = beatSec * 1.5; } el.eyeCenter.setAttribute('fill', (dancePhase%2===0)?'#ff0000':'#ffffff'); } setPupil((Math.random()-0.5)*15, (Math.random()-0.5)*15); }
        setHead(r, tx, ty, s, moveDur, ease); setBodySwivel(r * -0.8, 1, bodyDur); setBaseLid(lid, beatSec * 0.5); executeTick();
      };
      step();
    };
    const TALK_MOVES = [{ r: -10, tx: -8, ty: -18, s: 1.02, dur: 1.8, lid: 0.1, px: 0, py: -2 }, { r: 4, tx: 0, ty: 16, s: 1.08, dur: 1.2, lid: 0.85, px: 0, py: 4 }, { r: 2, tx: 0, ty: 10, s: 1.04, dur: 1.0, lid: 0.5, px: 0, py: 2 }, { r: 12, tx: 10, ty: -12, s: 0.96, dur: 2.2, lid: 0.1, px: 0, py: -1 }, { r: 0, tx: 0, ty: 25, s: 1.10, dur: 1.8, lid: 0.9, px: 0, py: 5 }, { r: -6, tx: 6, ty: -22, s: 0.98, dur: 1.0, lid: 0.1, px: 0, py: -3 }, { r: 4, tx: -3, ty: 6, s: 1.03, dur: 2.0, lid: 0.4, px: 0, py: 1 }, { r: -3, tx: 0, ty: 22, s: 1.15, dur: 1.2, lid: 0.95, px: 0, py: 6 }, { r: 6, tx: 3, ty: -6, s: 1.0, dur: 1.5, lid: 0.2, px: 0, py: 0 }];
    const startTalkAnim = () => { if (this.talkAnim) clearTimeout(this.talkAnim); let talkPhase = 0; const step = () => { const m = TALK_MOVES[talkPhase % TALK_MOVES.length]; setHead(m.r, m.tx, m.ty, m.s, m.dur, "ease-in-out"); setLid(m.lid, m.dur); setPupil(m.px, m.py); setBodySwivel(m.r * -0.6, 1, m.dur); talkPhase++; this.talkAnim = setTimeout(step, m.dur * 1000); }; step(); };

    // ── BOP ANIMATION (Spring Physics — underdamped, natural decay to zero) ──
    this.bopHead = () => {
      if (this._bopping) return;
      this._bopping = true;
      this.stopIdleCycle();
      stopLidBehavior();

      const savedLedColor = currentLedColor;
      const savedLedOpacity = currentLedOpacity;
      const savedBaseLid = currentBaseLid;

      const speedMul = config.tap_speed !== undefined ? parseFloat(config.tap_speed) : 0.2;
      const bounces = Math.max(1, Math.min(10, config.tap_bounces !== undefined ? parseInt(config.tap_bounces) : 5));
      const intensity = config.tap_intensity !== undefined ? parseFloat(config.tap_intensity) : 1.0;

      // Underdamped spring: ζ < 1 guarantees oscillation.
      // bounces = number of FULL cycles (up+down) before decay to ~1%.
      const maxAmp = 15 * intensity;
      const omega = 0.28 * speedMul;
      const dampingRatio = Math.min(0.7, 0.6 / bounces);
      const damping = 2 * omega * dampingRatio;
      const stiffness = omega * omega;
      const initialVelocity = maxAmp * omega * 1.8;

      let position = 0;
      let velocity = initialVelocity;
      if (this._bopRaf) cancelAnimationFrame(this._bopRaf);
      let lastLedUpdate = 0;

      const animate = (now) => {
        if (!this._bopping) return;

        // Natural decay: stop only when position AND velocity are negligible.
        // No hard time cutoff — let it bleed to zero smoothly.
        if (Math.abs(position) < 0.08 && Math.abs(velocity) < 0.08) {
          this._bopping = false;
          this._bopRaf = null;
          // Gentle final settle — head returns to rest with a soft transition
          el.head.style.transition = 'transform 0.4s ease-out';
          el.head.style.transform = 'translate3d(0,0,0) rotate(0deg) scale(1)';
          setLEDs(savedLedColor, savedLedOpacity);
          setLid(savedBaseLid, 0.4);
          if (stateNow === 'idle') { startLidBehavior(); this.startIdleCycle(); }
          return;
        }

        // Spring physics: F = -kx - cv
        const force = -stiffness * position - damping * velocity;
        velocity += force;
        position += velocity;

        // Smooth per-frame transform (no CSS transition — we handle it every frame)
        const ty = position;
        const rot = position * 0.15;
        const scale = 1.0 - Math.abs(position) * 0.003;
        el.head.style.transition = 'none';
        el.head.style.transform = `translate3d(0, ${ty.toFixed(2)}px, 0) rotate(${rot.toFixed(2)}deg) scale(${scale.toFixed(4)})`;

        // LED pulse: brightest at extremes, dim at center
        if (now - lastLedUpdate > 60) {
          lastLedUpdate = now;
          const normPos = Math.min(1, Math.abs(position) / maxAmp);
          const baseOp = parseFloat(savedLedOpacity) || 0.15;
          const ledOp = baseOp + (1 - baseOp) * normPos;
          el.svg.style.setProperty('--led-color', savedLedColor);
          el.svg.style.setProperty('--led-opacity', ledOp.toFixed(2));
        }

        this._bopRaf = requestAnimationFrame(animate);
      };
      this._bopRaf = requestAnimationFrame(animate);
    };

    // ── TAP HANDLER ──
    // Listen on the host element (this) so clicks work on the Lovelace
    // dashboard, not just in the editor preview. HA's card wrapper
    // intercepts SVG-internal clicks, but clicks on the custom element
    // itself bubble through normally.
    if (this._tapHandler) {
      this.removeEventListener('click', this._tapHandler);
    }
    this._tapHandler = (e) => {
      if (this.config.tap_enabled === false) return;
      e.stopPropagation();
      this.bopHead();
      const action = this.config.tap_action || 'none';
      if (action === 'none' || action === 'default') return;
      if (action === 'more-info') {
        this.dispatchEvent(new CustomEvent('hass-more-info', { bubbles: true, composed: true, detail: { entityId: this.config.entity } }));
      } else if (action === 'toggle') {
        if (this._hass && this.config.entity) { this._hass.callService('homeassistant', 'toggle', { entity_id: this.config.entity }); }
      } else if (action === 'navigate') {
        if (this.config.navigation_path) {
          this.dispatchEvent(new CustomEvent('hass-navigate', { bubbles: true, composed: true, detail: { path: this.config.navigation_path } }));
        }
      } else if (action === 'url') {
        if (this.config.url_path) { window.open(this.config.url_path, '_blank'); }
      } else if (action === 'assist') {
        this.dispatchEvent(new CustomEvent('hass-voice-assist', { bubbles: true, composed: true }));
      } else if (action === 'perform-action') {
        if (this._hass && this.config.action_path) {
          const parts = this.config.action_path.split('.');
          if (parts.length === 2) { this._hass.callService(parts[0], parts[1], {}); }
        }
      }
    };
    if (this.config.tap_enabled !== false) { this.style.cursor = 'pointer'; }
    this.addEventListener('click', this._tapHandler);

    const animateGlaDOS = (state, bpm) => {
      stateNow = state;
      if (this.talkAnim) clearTimeout(this.talkAnim);
      stopLidBehavior(); this.stopIdleCycle(); this.stopDanceCycle();
      if (this._bopRaf) { cancelAnimationFrame(this._bopRaf); this._bopRaf = null; }
      this._bopping = false;
      el.ledMatrices.forEach(m => m.classList.remove('pulsing'));
      if (el.dangerRing) el.dangerRing.setAttribute('opacity', '0');
      el.eyeLayerIdle.style.opacity = '0'; el.eyeLayerListen.style.opacity = '0'; el.eyeLayerProcess.style.opacity = '0'; el.eyeLayerRespond.style.opacity = '0'; el.eyeLayerDance.style.opacity = '0';
      el.eyeCenter.style.transform = 'scale(1)'; el.eyeCenter.style.transition = 'fill 0.8s ease-in-out';
      if (state === 'idle') {
        el.eyeLayerIdle.style.opacity = '1'; el.eyeHalo.style.transition = 'fill 0.8s ease-in-out, opacity 0.8s'; el.eyeHalo.setAttribute('fill', '#330800'); el.eyeHalo.style.opacity = '0.05'; el.eyeCenter.setAttribute('fill', '#ffcc00');
        setHead(0, 0, 0, 1.0, 2.2); setLid(0, 1.2); setPupil(0, 0); currentBaseLid = 0; setLEDs('#ffb800', '0.15'); resetBodySwivel(); startLidBehavior(); this.startIdleCycle();
      } else if (state === 'dancing') {
        el.eyeLayerDance.style.opacity = '1'; el.eyeHalo.style.transition = 'fill 0.8s ease-in-out, opacity 0.15s ease-out'; el.eyeHalo.setAttribute('fill', '#1DB954'); el.eyeCenter.setAttribute('fill', '#ffffff'); el.eyeCenter.style.transformOrigin = '130px 364px'; el.eyeCenter.style.transition = 'transform 0.1s ease-out, fill 0.8s ease-in-out'; setLEDs('#1DB954', '0.15'); resetBodySwivel(); this.startDanceCycle(bpm);
      } else if (state === 'listening') {
        el.eyeLayerListen.style.opacity = '1'; el.eyeHalo.style.transition = 'fill 0.8s ease-in-out, opacity 0.8s'; el.eyeHalo.setAttribute('fill', '#00ccff'); el.eyeHalo.style.opacity = '0.05'; el.eyeCenter.setAttribute('fill', '#aaffff'); setHead(4, 0, -8, 1.06, 1.0); setBaseLid(0.1, 0.4); setPupil(0, -3); setLEDs('#00ccff', '1'); setBodySwivel(-2, 1, 1.4);
      } else if (state === 'processing') {
        el.eyeLayerProcess.style.opacity = '1'; el.eyeHalo.style.transition = 'fill 0.8s ease-in-out, opacity 0.8s'; el.eyeHalo.setAttribute('fill', '#ff6600'); el.eyeHalo.style.opacity = '0.05'; el.eyeCenter.setAttribute('fill', '#ffddaa'); setHead(-2, 0, 10, 0.96, 1.4); setBaseLid(0.65, 0.5); setLEDs('#ff6600', '1'); setBodySwivel(1, 0.98, 1.8); el.ledMatrices.forEach(m => m.classList.add('pulsing')); startLidBehavior(); const dart = () => { if (stateNow !== 'processing') return; setPupil((Math.random() - 0.5) * 12, 4); this.pupilTimer = setTimeout(dart, 200 + Math.random() * 600); }; dart();
      } else if (state === 'responding') {
        el.eyeLayerRespond.style.opacity = '1'; el.eyeHalo.style.transition = 'fill 0.8s ease-in-out, opacity 0.8s'; el.eyeHalo.setAttribute('fill', '#ff2200'); el.eyeHalo.style.opacity = '0.05'; el.eyeCenter.setAttribute('fill', '#ffaaaa'); if(el.dangerRing) el.dangerRing.setAttribute('opacity', '1'); setLEDs('#ff2200', '1'); setBodySwivel(0, 1, 0.8); startTalkAnim();
      }
    };
    this.applyState = (raw, bpm) => {
      const s = (raw || 'idle').toLowerCase();
      let mapped = 'idle';
      if (s.includes('respond') || s.includes('speak') || s.includes('tts')) mapped = 'responding';
      else if (s.includes('listen') || s.includes('wake')) mapped = 'listening';
      else if (s.includes('process') || s.includes('think')) mapped = 'processing';
      else if (s === 'dancing') mapped = 'dancing';
      if (this.respondTimer) { clearTimeout(this.respondTimer); this.respondTimer = null; }
      const delaySeconds = config.respond_delay !== undefined ? parseFloat(config.respond_delay) : 0;
      if (mapped === 'responding' && this._lastEffectiveState !== 'responding' && delaySeconds > 0) {
        this.respondTimer = setTimeout(() => { this._lastEffectiveState = 'responding'; animateGlaDOS('responding', bpm); }, delaySeconds * 1000); return;
      }
      this._lastEffectiveState = mapped; animateGlaDOS(mapped, bpm);
    };

    this._visibilityHandler = () => {
      if (!this.isConnected) return;
      if (document.hidden) {
        this.stopIdleCycle(); this.stopDanceCycle();
        if (this.lidTimer) { clearTimeout(this.lidTimer); this.lidTimer = null; }
        if (this.talkAnim) { clearTimeout(this.talkAnim); this.talkAnim = null; }
        if (this.respondTimer) { clearTimeout(this.respondTimer); this.respondTimer = null; }
        if (this._bopRaf) { cancelAnimationFrame(this._bopRaf); this._bopRaf = null; }
        this._bopping = false;
        el.svg.style.animationPlayState = 'paused';
        el.svg.querySelectorAll('#body-pivot, #head-sway-pivot').forEach(e => { e.style.animationPlayState = 'paused'; });
      } else {
        el.svg.style.animationPlayState = '';
        el.svg.querySelectorAll('#body-pivot, #head-sway-pivot').forEach(e => { e.style.animationPlayState = ''; });
        const savedState = stateNow; stateNow = '__force_restart__';
        this.applyState(savedState, this._currentBpm || 120);
      }
    };
    if (this._boundVisibility) document.removeEventListener('visibilitychange', this._boundVisibility);
    this._boundVisibility = this._visibilityHandler;
    document.addEventListener('visibilitychange', this._boundVisibility);
    this.applyState('idle', 120);
  }
  disconnectedCallback() { this._cleanupTimers(); }
}
class GladosCardEditor extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: 'open' }); this._tapOpen = false; }
  setConfig(config) { this._config = config; }
  set hass(hass) {
    this._hass = hass;
    const pickers = this.shadowRoot.querySelectorAll('ha-entity-picker');
    if (pickers.length > 0) {
      pickers.forEach(picker => { picker.hass = hass; });
    } else {
      this.render();
    }
  }
  configChanged(key, value) {
    if (!this._config) return;
    const newConfig = { ...this._config };
    if (value === '' || value === undefined || value === null) delete newConfig[key];
    else newConfig[key] = value;
    this._config = newConfig;
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: newConfig }, bubbles: true, composed: true }));
  }
  render() {
    if (!this._config || !this._hass) return;
    const c = this._config;
    const tapAction = c.tap_action || 'none';
    this.shadowRoot.innerHTML = `
      <style>
        .card-config { display: flex; flex-direction: column; gap: 16px; }
        .side-by-side { display: flex; gap: 16px; margin-top: 8px; }
        .side-by-side > div { flex: 1; display: flex; flex-direction: column; }
        label { font-family: var(--paper-font-body1_-_font-family, sans-serif); font-size: 14px; color: var(--primary-text-color); }
        .secondary { font-size: 12px; color: var(--secondary-text-color); margin-top: 2px; }
        .tap-header { cursor: pointer; padding: 12px 0; font-weight: 500; font-size: 14px; color: var(--primary-text-color); display: flex; align-items: center; gap: 8px; border-top: 1px solid var(--divider-color, #e0e0e0); }
        .tap-chevron { display: inline-block; transition: transform 0.2s; font-size: 12px; }
        .tap-content { display: none; padding-top: 8px; }
        .tap-content.open { display: flex; flex-direction: column; gap: 16px; }
      </style>
      <div class="card-config">
        <ha-entity-picker id="entity-picker" label="Voice Assistant Entity (Required)" allow-custom-entity></ha-entity-picker>
        <ha-entity-picker id="media-picker" label="Media Player Entity (Optional)" allow-custom-entity></ha-entity-picker>
        <ha-entity-picker id="bpm-picker" label="BPM Sensor Entity (Optional)" allow-custom-entity></ha-entity-picker>
        <div class="side-by-side">
          <div><label>Response Delay: <span id="delay-val">${c.respond_delay !== undefined ? c.respond_delay : 0}</span>s</label><div class="secondary">Time before she starts talking.</div><ha-slider id="delay-slider" min="0" max="16" step="0.5" pin value="${c.respond_delay !== undefined ? c.respond_delay : 0}"></ha-slider></div>
          <div><label>Zoom Scale: <span id="zoom-val">${c.zoom !== undefined ? c.zoom : 85}</span>%</label><ha-slider id="zoom-slider" min="10" max="200" step="1" pin value="${c.zoom !== undefined ? c.zoom : 85}"></ha-slider></div>
        </div>
        <ha-formfield label="Transparent Background"><ha-switch id="bg-switch"></ha-switch></ha-formfield>
        <div class="tap-header" id="tap-header"><span class="tap-chevron" id="tap-chevron">▶</span> Tap / Press</div>
        <div class="tap-content" id="tap-content">
          <ha-formfield label="Enable Tap to Bop"><ha-switch id="tap-switch"></ha-switch></ha-formfield>
          <ha-select outlined label="Tap Action" id="tap-action-select" naturalMenuWidth>
            <mwc-list-item value="default">Default (Toggle)</mwc-list-item>
            <mwc-list-item value="more-info">More Info</mwc-list-item>
            <mwc-list-item value="toggle">Toggle</mwc-list-item>
            <mwc-list-item value="navigate">Navigate</mwc-list-item>
            <mwc-list-item value="url">URL</mwc-list-item>
            <mwc-list-item value="perform-action">Perform Action</mwc-list-item>
            <mwc-list-item value="assist">Assist</mwc-list-item>
            <mwc-list-item value="none">Nothing</mwc-list-item>
          </ha-select>
          <div id="nav-path-container" style="display: ${tapAction === 'navigate' ? '' : 'none'}"><paper-input id="nav-path" label="Navigation Path" value="${c.navigation_path || ''}"></paper-input></div>
          <div id="url-path-container" style="display: ${tapAction === 'url' ? '' : 'none'}"><paper-input id="url-path" label="URL" value="${c.url_path || ''}"></paper-input></div>
          <div id="action-path-container" style="display: ${tapAction === 'perform-action' ? '' : 'none'}"><paper-input id="action-path" label="Action (e.g. light.turn_on)" value="${c.action_path || ''}"></paper-input></div>
          <div class="side-by-side">
            <div><label>Animation Speed: <span id="tap-speed-val">${c.tap_speed !== undefined ? c.tap_speed : 0.2}</span>x</label><div class="secondary">0.05 = very slow, 2.0 = fast.</div><ha-slider id="tap-speed-slider" min="0.05" max="2" step="0.05" pin value="${c.tap_speed !== undefined ? c.tap_speed : 0.2}"></ha-slider></div>
            <div><label>Bop Intensity: <span id="tap-intensity-val">${c.tap_intensity !== undefined ? c.tap_intensity : 1.0}</span>x</label><div class="secondary">How far the head pulls back.</div><ha-slider id="tap-intensity-slider" min="0.5" max="2" step="0.1" pin value="${c.tap_intensity !== undefined ? c.tap_intensity : 1.0}"></ha-slider></div>
          </div>
          <div><label>Rebound Bounces: <span id="tap-bounces-val">${c.tap_bounces !== undefined ? c.tap_bounces : 5}</span></label><div class="secondary">Full oscillation cycles before settling.</div><ha-slider id="tap-bounces-slider" min="1" max="10" step="1" pin value="${c.tap_bounces !== undefined ? c.tap_bounces : 5}"></ha-slider></div>
        </div>
      </div>
    `;
    // Entity pickers
    const ep = this.shadowRoot.querySelector('#entity-picker'); ep.hass = this._hass; ep.value = c.entity; ep.includeDomains = ['assist_satellite'];
    ep.addEventListener('value-changed', (ev) => this.configChanged('entity', ev.detail.value));
    const mp = this.shadowRoot.querySelector('#media-picker'); mp.hass = this._hass; mp.value = c.media_entity; mp.includeDomains = ['media_player'];
    mp.addEventListener('value-changed', (ev) => this.configChanged('media_entity', ev.detail.value));
    const bp = this.shadowRoot.querySelector('#bpm-picker'); bp.hass = this._hass; bp.value = c.bpm_entity; bp.includeDomains = ['sensor'];
    bp.addEventListener('value-changed', (ev) => this.configChanged('bpm_entity', ev.detail.value));
    // Sliders
    const delaySlider = this.shadowRoot.querySelector('#delay-slider');
    delaySlider.addEventListener('change', (ev) => { this.shadowRoot.querySelector('#delay-val').innerText = ev.target.value; this.configChanged('respond_delay', Number(ev.target.value)); });
    const zoomSlider = this.shadowRoot.querySelector('#zoom-slider');
    zoomSlider.addEventListener('change', (ev) => { this.shadowRoot.querySelector('#zoom-val').innerText = ev.target.value; this.configChanged('zoom', Number(ev.target.value)); });
    const bgSwitch = this.shadowRoot.querySelector('#bg-switch'); bgSwitch.checked = c.transparent_bg === true;
    bgSwitch.addEventListener('change', (ev) => this.configChanged('transparent_bg', ev.target.checked));
    // Tap section toggle
    const tapHeader = this.shadowRoot.querySelector('#tap-header');
    const tapContent = this.shadowRoot.querySelector('#tap-content');
    const tapChevron = this.shadowRoot.querySelector('#tap-chevron');
    tapHeader.addEventListener('click', () => {
      this._tapOpen = !this._tapOpen;
      tapContent.classList.toggle('open', this._tapOpen);
      tapChevron.style.transform = this._tapOpen ? 'rotate(90deg)' : '';
    });
    if (this._tapOpen) { tapContent.classList.add('open'); tapChevron.style.transform = 'rotate(90deg)'; }
    // Tap config elements
    const tapSwitch = this.shadowRoot.querySelector('#tap-switch'); tapSwitch.checked = c.tap_enabled !== false;
    tapSwitch.addEventListener('change', (ev) => this.configChanged('tap_enabled', ev.target.checked));
    const tapActionSelect = this.shadowRoot.querySelector('#tap-action-select');
    requestAnimationFrame(() => { tapActionSelect.value = tapAction; });
    tapActionSelect.addEventListener('value-changed', (ev) => {
      const val = ev.detail.value || ev.target.value;
      this.configChanged('tap_action', val);
      this.shadowRoot.querySelector('#nav-path-container').style.display = val === 'navigate' ? '' : 'none';
      this.shadowRoot.querySelector('#url-path-container').style.display = val === 'url' ? '' : 'none';
      this.shadowRoot.querySelector('#action-path-container').style.display = val === 'perform-action' ? '' : 'none';
    });
    const navPath = this.shadowRoot.querySelector('#nav-path');
    if (navPath) navPath.addEventListener('change', (ev) => this.configChanged('navigation_path', ev.target.value));
    const urlPath = this.shadowRoot.querySelector('#url-path');
    if (urlPath) urlPath.addEventListener('change', (ev) => this.configChanged('url_path', ev.target.value));
    const actionPath = this.shadowRoot.querySelector('#action-path');
    if (actionPath) actionPath.addEventListener('change', (ev) => this.configChanged('action_path', ev.target.value));
    const tapSpeedSlider = this.shadowRoot.querySelector('#tap-speed-slider');
    tapSpeedSlider.addEventListener('change', (ev) => { this.shadowRoot.querySelector('#tap-speed-val').innerText = ev.target.value; this.configChanged('tap_speed', Number(ev.target.value)); });
    const tapIntensitySlider = this.shadowRoot.querySelector('#tap-intensity-slider');
    tapIntensitySlider.addEventListener('change', (ev) => { this.shadowRoot.querySelector('#tap-intensity-val').innerText = ev.target.value; this.configChanged('tap_intensity', Number(ev.target.value)); });
    const tapBouncesSlider = this.shadowRoot.querySelector('#tap-bounces-slider');
    tapBouncesSlider.addEventListener('change', (ev) => { this.shadowRoot.querySelector('#tap-bounces-val').innerText = ev.target.value; this.configChanged('tap_bounces', Number(ev.target.value)); });
  }
}
customElements.define('glados-card-editor', GladosCardEditor);
customElements.define('glados-card', GladosCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: 'glados-card', name: 'GLaDOS Custom Card', preview: true, description: 'A responsive, animated GLaDOS AI assistant card that reacts to voice and dances to music.' });
