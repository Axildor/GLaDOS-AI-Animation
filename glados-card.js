class GladosCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._lastHassVoice = null;
    this._lastHassMedia = null;
    this._lastHassBpm = null;
  }

  static getConfigElement() { return document.createElement('glados-card-editor'); }
  static getStubConfig() { return { entity: "", media_entity: "", bpm_entity: "", respond_delay: 0, zoom: 85, transparent_bg: false }; }

  setConfig(config) {
    this.config = { entity: 'assist_satellite.example', ...config };
    if (this.contentReady) {
      this.setupDOM();
      this.initGlados();
      this.applyState(this._currentState, this._currentBpm);
    }
  }

  set hass(hass) {
    if (!hass) return;
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
        
        /* Compositor layer isolation limited strictly to active moving roots */
        #body-pivot, #glados-head { will-change: transform; }
        
        #body-pivot { transform-origin: 140px 116px; animation: body-sway 8s ease-in-out infinite; }
        @keyframes body-sway { 0%, 100% { transform: rotate(-1.4deg); } 50% { transform: rotate( 1.4deg); } }
        
        #head-sway-pivot { transform-origin: 140px 285px; animation: head-ambient-sway 13s ease-in-out infinite; }
        @keyframes head-ambient-sway { 0%, 100% { transform: rotate(-0.8deg); } 50% { transform: rotate(0.8deg); } }
        
        #glados-head { transform-box: view-box; transform-origin: 140px 285px; transition: transform 1.6s cubic-bezier(0.34, 1.06, 0.64, 1); }
        #torso { transition: transform 2.0s cubic-bezier(0.45, 0.05, 0.55, 0.95); transform-origin: 140px 116px; }
        
        #eye-halo, #eye-center { transition: fill 0.8s ease-in-out; }
        .eye-layer { transition: opacity 0.8s ease-in-out; }
        @keyframes eye-breathe { 0%,100%{opacity:.02} 48%{opacity:.2} }
        #eye-halo.breathing { animation: eye-breathe 8s ease-in-out infinite; }
        @keyframes danger-flash { 0%,100%{opacity:0} 50%{opacity:1} }
        #danger-ring.active { animation: danger-flash .35s ease-in-out infinite; }
      </style>
      
      <div id="scene">
        <svg id="glados-svg" viewBox="0 116 280 320" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="ceramicGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="#8a8d94"/><stop offset="8%" stop-color="#b0b4bc"/><stop offset="8.5%" stop-color="#ffffff"/><stop offset="25%" stop-color="#ffffff"/><stop offset="75%" stop-color="#ffffff"/><stop offset="91.5%" stop-color="#e8eaec"/><stop offset="92%" stop-color="#a0a4ac"/><stop offset="100%" stop-color="#6a6d75"/>
            </linearGradient>
            
            <linearGradient id="ceramicBackgroundGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="#4a4d54"/>
              <stop offset="8%" stop-color="#70747c"/>
              <stop offset="8.5%" stop-color="#b0b4bc"/>
              <stop offset="25%" stop-color="#b0b4bc"/>
              <stop offset="75%" stop-color="#b0b4bc"/>
              <stop offset="91.5%" stop-color="#a0a4ac"/>
              <stop offset="92%" stop-color="#6a6d75"/>
              <stop offset="100%" stop-color="#3a3d44"/>
            </linearGradient>

            <linearGradient id="ceramicShadow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#ffffff" stop-opacity="0"/><stop offset="60%" stop-color="#60646c" stop-opacity="0.1"/><stop offset="85%" stop-color="#2a2c32" stop-opacity="0.5"/><stop offset="100%" stop-color="#0a0a0f" stop-opacity="0.85"/>
            </linearGradient>

            <linearGradient id="bezelGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="#4a4d54"/><stop offset="20%" stop-color="#6a6d75"/><stop offset="50%" stop-color="#3a3c42"/><stop offset="80%" stop-color="#1a1c20"/><stop offset="100%" stop-color="#0a0a0c"/>
            </linearGradient>

            <linearGradient id="cavityGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#181a1c"/><stop offset="100%" stop-color="#30353a"/>
            </linearGradient>
            
            <linearGradient id="trackGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="#1a1c20"/><stop offset="50%" stop-color="#3a3e46"/><stop offset="100%" stop-color="#121316"/>
            </linearGradient>
            
            <radialGradient id="eyeGradIdle" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="#ffffff"/><stop offset="20%" stop-color="#ffcc00"/><stop offset="55%" stop-color="#d95500"/><stop offset="80%" stop-color="#7a1100"/><stop offset="100%" stop-color="#110000"/>
            </radialGradient>
            <radialGradient id="eyeGradListen" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="#ffffff"/><stop offset="25%" stop-color="#aaffff"/><stop offset="60%" stop-color="#00ccff"/><stop offset="85%" stop-color="#0066aa"/><stop offset="100%" stop-color="#001a33"/>
            </radialGradient>
            <radialGradient id="eyeGradProcess" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="#ffffff"/><stop offset="25%" stop-color="#ffddaa"/><stop offset="60%" stop-color="#ff6600"/><stop offset="85%" stop-color="#aa3300"/><stop offset="100%" stop-color="#220a00"/>
            </radialGradient>
            <radialGradient id="eyeGradRespond" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="#ffffff"/><stop offset="25%" stop-color="#ffaaaa"/><stop offset="60%" stop-color="#ff2200"/><stop offset="85%" stop-color="#aa0000"/><stop offset="100%" stop-color="#220000"/>
            </radialGradient>
            <radialGradient id="eyeGradDance" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="#ffffff"/><stop offset="20%" stop-color="#aaffaa"/><stop offset="55%" stop-color="#1DB954"/><stop offset="80%" stop-color="#0a5926"/><stop offset="100%" stop-color="#001a00"/>
            </radialGradient>

            <!-- Memory-optimized shader bounds -->
            <filter id="eyeBloom" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="6" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <filter id="ledGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="2" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            
            <linearGradient id="lidGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#1f2124"/><stop offset="100%" stop-color="#08090a"/>
            </linearGradient>
            <linearGradient id="lidGradFlip" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stop-color="#1f2124"/><stop offset="100%" stop-color="#08090a"/>
            </linearGradient>

            <clipPath id="cavityClip"><rect x="97" y="283.25" width="66" height="161.5" rx="33"/></clipPath>
            <clipPath id="trackClip"><rect x="107" y="293.25" width="46" height="141.5" rx="23"/></clipPath>
            <clipPath id="eyeballClip"><circle cx="130" cy="364" r="25.5"/></clipPath>
          </defs>

          <g id="body-pivot">
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
              <path d="m 190,136 24,7 4,35 -4,14 -10,4 -14,-4 z" fill="#eeeeee" opacity="0.05"/>
              
              <circle cx="220" cy="168" r="9" fill="#14141c" stroke="#0c0c12" stroke-width="1"/>
              <circle cx="220" cy="168" r="5.5" fill="#0c0c10" stroke="#1a1a22" stroke-width="0.8"/>
              <path d="m 190,132 c 4,20 6,40 4,60" stroke="#1a1a22" stroke-width="2.5" fill="none" opacity="0.8"/>
              
              <line x1="90" y1="152" x2="190" y2="152" stroke="#6a6d75" stroke-width="1"/>
              <line x1="89" y1="174" x2="191" y2="174" stroke="#6a6d75" stroke-width="1"/>
              <line x1="140" y1="128" x2="140" y2="210" stroke="#6a6d75" stroke-width="1"/>
              
              <rect x="94" y="135" width="36" height="20" rx="2.5" fill="#050508" stroke="#101014" stroke-width="0.6"/>
              <rect x="96" y="137" width="32" height="16" rx="1.5" fill="#020202"/>
              <g id="led-matrix-left" class="led-matrix" filter="url(#ledGlow)">
                <rect class="led-dot" x="98" y="140" width="28" height="2" rx="1"/>
                <rect class="led-dot" x="98" y="145" width="28" height="2" rx="1"/>
                <rect class="led-dot" x="98" y="150" width="28" height="2" rx="1"/>
              </g>
              
              <rect x="150" y="135" width="36" height="20" rx="2.5" fill="#050508" stroke="#101014" stroke-width="0.6"/>
              <rect x="152" y="137" width="32" height="16" rx="1.5" fill="#020202"/>
              <g id="led-matrix-right" class="led-matrix" filter="url(#ledGlow)">
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
                              <line x1="107" y1="140" x2="153" y2="140"/>
                              <line x1="107" y1="152" x2="153" y2="152"/>
                              <line x1="107" y1="164" x2="153" y2="164"/>
                              <line x1="107" y1="176" x2="153" y2="176"/>
                              <line x1="107" y1="188" x2="153" y2="188"/>
                              <line x1="107" y1="200" x2="153" y2="200"/>
                              <line x1="107" y1="212" x2="153" y2="212"/>
                              <line x1="107" y1="224" x2="153" y2="224"/>
                              <line x1="107" y1="236" x2="153" y2="236"/>
                              <line x1="107" y1="248" x2="153" y2="248"/>
                              <line x1="107" y1="260" x2="153" y2="260"/>
                              <line x1="107" y1="272" x2="153" y2="272"/>
                              <line x1="107" y1="284" x2="153" y2="284"/>
                              <line x1="107" y1="296" x2="153" y2="296"/>
                              <line x1="107" y1="308" x2="153" y2="308"/>
                              <line x1="107" y1="320" x2="153" y2="320"/>
                              <line x1="107" y1="332" x2="153" y2="332"/>
                              <line x1="107" y1="344" x2="153" y2="344"/>
                              <line x1="107" y1="356" x2="153" y2="356"/>
                              <line x1="107" y1="368" x2="153" y2="368"/>
                              <line x1="107" y1="380" x2="153" y2="380"/>
                              <line x1="107" y1="392" x2="153" y2="392"/>
                              <line x1="107" y1="404" x2="153" y2="404"/>
                              <line x1="107" y1="416" x2="153" y2="416"/>
                              <line x1="107" y1="428" x2="153" y2="428"/>
                              <line x1="107" y1="440" x2="153" y2="440"/>
                              <line x1="107" y1="452" x2="153" y2="452"/>
                              <line x1="107" y1="464" x2="153" y2="464"/>
                              <line x1="107" y1="476" x2="153" y2="476"/>
                              <line x1="107" y1="488" x2="153" y2="488"/>
                              <line x1="107" y1="500" x2="153" y2="500"/>
                              <line x1="107" y1="512" x2="153" y2="512"/>
                              <line x1="107" y1="524" x2="153" y2="524"/>
                           </g>
                        </g>
                     </g>

                     <g id="eyeball-assembly" style="transition: transform 0.15s ease-out;">
                        <circle cx="130" cy="364" r="26" fill="#1c1e22" stroke="#000000" stroke-width="2"/>
                        <circle cx="130" cy="364" r="23" fill="#0a0b0c"/>
                        
                        <circle cx="147" cy="388" r="3.5" fill="#1a0000" stroke="#000000" stroke-width="1"/>
                        <circle id="indicator-dot" cx="147" cy="388" r="2.5" fill="#ff2200" opacity="0.8" filter="url(#softGlow)"/>

                        <circle id="eye-halo" cx="130" cy="364" r="25" fill="#330800" opacity=".05" filter="url(#eyeBloom)"/>
                        
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

  initGlados() {
    const root = this.shadowRoot;
    const config = this.config;

    const el = {
      svg: root.getElementById('glados-svg'),
      head: root.getElementById('glados-head'),
      torso: root.getElementById('torso'),
      eyeLayerIdle: root.getElementById('eye-layer-idle'),
      eyeLayerListen: root.getElementById('eye-layer-listen'),
      eyeLayerProcess: root.getElementById('eye-layer-process'),
      eyeLayerRespond: root.getElementById('eye-layer-respond'),
      eyeLayerDance: root.getElementById('eye-layer-dance'),
      eyeHalo: root.getElementById('eye-halo'),
      eyeCenter: root.getElementById('eye-center'),
      pupil: root.getElementById('eye-pupil'),
      eyeball: root.getElementById('eyeball-assembly'),
      bellows: root.getElementById('bellows'),
      lidTop: root.getElementById('eye-lid'),
      lidBot: root.getElementById('eye-lid-bottom'),
      dangerRing: root.getElementById('danger-ring'),
      ledMatrices: root.querySelectorAll('.led-matrix')
    };

    let stateNow = 'idle';
    let currentBaseLid = 0;

    function setHead(rot, tx, ty, scale = 1.0, dur, ease = "cubic-bezier(0.34,1.06,0.64,1)") {
      el.head.style.transition = `transform ${dur}s ${ease}`;
      el.head.style.transform = `translate3d(${tx}px,${ty}px,0) rotate(${rot}deg) scale(${scale})`;
    }
    
    // Decoupled: Mutates torso transform directly without resetting body-sway animation
    function setBodySwivel(rot, sx, dur) {
      el.torso.style.transition = `transform ${dur || 2.0}s cubic-bezier(0.45,0.05,0.55,0.95)`;
      el.torso.style.transform = `matrix(1.2,0,0,1.2,-28,-23.2) rotate(${rot}deg) scaleX(${sx || 1})`;
    }
    
    function resetBodySwivel() {
      el.torso.style.transition = `transform 2.0s cubic-bezier(0.45,0.05,0.55,0.95)`;
      el.torso.style.transform = `matrix(1.2,0,0,1.2,-28,-23.2)`;
    }

    function setLid(amount, dur = 0.7) {
      const px = amount * 17; 
      el.lidTop.style.transition = `transform ${dur}s ease-in-out`;
      el.lidBot.style.transition = `transform ${dur}s ease-in-out`;
      el.lidTop.style.transform = `translate3d(0, ${px}px, 0)`;
      el.lidBot.style.transform = `translate3d(0, ${-px}px, 0)`;
    }

    function setBaseLid(amount, dur = 0.7) {
      currentBaseLid = amount;
      setLid(amount, dur);
    }

    function setPupil(px, py) {
      el.pupil.style.transform = `translate3d(${px}px, ${py}px, 0)`;
      const ey = py * 1.5;
      el.eyeball.style.transform = `translate3d(0, ${ey}px, 0)`;
      el.bellows.style.transform = `translate3d(0, ${ey}px, 0)`;
    }

    function setLEDs(color, opacity) {
      el.svg.style.setProperty('--led-color', color);
      el.svg.style.setProperty('--led-opacity', opacity);
    }

    this.lidTimer = null;
    this.idleTimer = null;
    this.pupilTimer = null;
    this.glitchRaf = null;
    this.danceTimer = null;
    this.danceLedTimer = null;
    this.talkAnim = null;
    this.respondTimer = null;

    const startLidBehavior = () => {
      if (this.lidTimer) clearTimeout(this.lidTimer);
      const loop = () => {
        if (stateNow === 'idle') {
          const val = Math.max(0, Math.min(1, currentBaseLid + (Math.random() - 0.5) * 0.15));
          setLid(val, 0.5 + Math.random() * 0.8);
          this.lidTimer = setTimeout(loop, 1500 + Math.random() * 2500);
        } else if (stateNow === 'processing') {
          const val = 0.5 + (Math.random() * 0.35); 
          setLid(val, 0.04 + Math.random() * 0.08);
          this.lidTimer = setTimeout(loop, 40 + Math.random() * 120);
        }
      };
      loop();
    };

    const stopLidBehavior = () => {
      if (this.lidTimer) { clearTimeout(this.lidTimer); this.lidTimer = null; }
    };

    const IDLE_BEHAVIORS = [
      { name: 'passive', exec() { setHead(0, 0, 0, 1.0, 2.4); setBaseLid(0, 1.0); resetBodySwivel(); }, min: 6000, max: 13000, weight: 4 },
      { name: 'scan_right', exec() { setHead(12, 0, -5, 0.98, 1.4); setBaseLid(0, 1.0); setBodySwivel(-2, 1, 1.8); }, min: 3500, max: 7000, weight: 1.5 },
      { name: 'scan_left', exec() { setHead(-12, 0, -5, 0.98, 1.4); setBaseLid(0, 1.0); setBodySwivel(2, 1, 1.8); }, min: 3500, max: 7000, weight: 1.5 },
      { name: 'curious', exec() { setHead(8, 0, -20, 1.05, 1.2); setBaseLid(0, 0.8); setBodySwivel(-2, 1, 1.6); }, min: 4000, max: 8000, weight: 2 },
      { name: 'contemptuous', exec() { setHead(-6, 0, 15, 0.95, 1.8); setBaseLid(0.65, 1.0); setBodySwivel(1.5, 1, 2.0); setTimeout(() => { if (stateNow === 'idle') setBaseLid(0, 1.5); }, 1500); }, min: 5000, max: 10000, weight: 2 },
      { name: 'alert', exec() { setHead(0, 0, -25, 1.08, 0.28); setBaseLid(0, 0.2); setBodySwivel(-1, 1, 0.4); }, min: 1500, max: 3000, weight: 1 },
      { name: 'bored', exec() { setHead(2, 0, 20, 0.96, 2.8); setBaseLid(0.7, 1.5); setBodySwivel(1, 1, 3.0); setTimeout(() => { if (stateNow === 'idle') setBaseLid(0, 1.5); }, 1500); }, min: 7000, max: 14000, weight: 1.5 },
      { name: 'full_swivel', exec() { setBodySwivel(-6, 0.96, 2.5); setTimeout(() => { setHead(6, 0, -3, 1.02, 1.2); setBaseLid(0, 0.8); }, 600); }, min: 4000, max: 8000, weight: 0.8 },
      { name: 'glitch', exec: () => {
          let count = 0, lastTime = 0;
          if (this.glitchRaf) cancelAnimationFrame(this.glitchRaf);
          const glitchLoop = (timestamp) => {
            if (!lastTime) lastTime = timestamp;
            if (timestamp - lastTime > 60) {
              lastTime = timestamp;
              if (stateNow !== 'idle' || count > 12) {
                cancelAnimationFrame(this.glitchRaf); 
                this.glitchRaf = null;
                if (stateNow === 'idle') {
                  el.eyeHalo.setAttribute('fill', '#330800'); 
                  el.eyeCenter.setAttribute('fill', '#ffcc00'); 
                  setHead(0, 0, 0, 1.0, 0.4);
                }
                return;
              }
              setHead((Math.random()-0.5)*10, (Math.random()-0.5)*8, (Math.random()-0.5)*8, 1.0, 0.05, "linear");
              if (count % 2 === 0) { el.eyeHalo.setAttribute('fill', '#110000'); el.eyeCenter.setAttribute('fill', '#884400'); } 
              else { el.eyeHalo.setAttribute('fill', '#ffb800'); el.eyeCenter.setAttribute('fill', '#ffffff'); }
              count++;
            }
            this.glitchRaf = requestAnimationFrame(glitchLoop);
          };
          this.glitchRaf = requestAnimationFrame(glitchLoop);
      }, min: 4000, max: 7000, weight: 0.3 }
    ];

    const dartPupil = () => {
      if (stateNow === 'idle') {
        const max = 7;
        setPupil((Math.random() - 0.5) * max * 2, (Math.random() - 0.5) * max * 2);
        this.pupilTimer = setTimeout(dartPupil, 600 + Math.random() * 2500);
      }
    };

    const runNextIdleBehavior = () => {
      if (stateNow !== 'idle') return;
      let r = Math.random() * IDLE_BEHAVIORS.reduce((s, b) => s + b.weight, 0);
      let chosen = IDLE_BEHAVIORS[0];
      for (const b of IDLE_BEHAVIORS) { 
        r -= b.weight; 
        if (r <= 0) { chosen = b; break; } 
      }
      try { chosen.exec(); } catch (err) { /* Safeguard execution loop */ }
      this.idleTimer = setTimeout(runNextIdleBehavior, chosen.min + Math.random() * (chosen.max - chosen.min));
    };

    this.startIdleCycle = () => {
      this.stopIdleCycle();
      dartPupil();
      this.idleTimer = setTimeout(runNextIdleBehavior, 2000 + Math.random() * 3000);
    };

    this.stopIdleCycle = () => {
      if (this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = null; }
      if (this.pupilTimer) { clearTimeout(this.pupilTimer); this.pupilTimer = null; }
      if (this.glitchRaf) { cancelAnimationFrame(this.glitchRaf); this.glitchRaf = null; }
    };

    this.stopDanceCycle = () => {
      if (this.danceTimer) { clearTimeout(this.danceTimer); this.danceTimer = null; }
      if (this.danceLedTimer) { clearTimeout(this.danceLedTimer); this.danceLedTimer = null; }
    };

    this.startDanceCycle = (bpm) => {
      this.stopDanceCycle();
      let dancePhase = 0; 
      let currentRoutine = Math.floor(Math.random() * 8);
      
      const currentBpm = Math.max(60, Math.min(200, bpm)); 
      const beatMs = (60 / currentBpm) * 1000;
      const beatSec = beatMs / 1000;
      let expectedNextTick = performance.now() + beatMs;

      const step = () => {
        if (stateNow !== 'dancing') return;

        if (dancePhase > 0 && dancePhase % 16 === 0) {
          let nextRoutine;
          do { nextRoutine = Math.floor(Math.random() * 8); } while (nextRoutine === currentRoutine);
          currentRoutine = nextRoutine;
        }

        const choreoBlock = currentRoutine; 
        const isDownBeat = dancePhase % 2 === 0;
        const isQuadBeat = dancePhase % 4 === 0;
        const phaseMod4 = dancePhase % 4;
        const phaseMod8 = dancePhase % 8;
        const dirX = isDownBeat ? 1 : -1;

        setLEDs('#1DB954', '1'); 
        el.eyeHalo.style.opacity = (choreoBlock === 7) ? '0.8' : '0.5'; 
        el.eyeCenter.style.transform = 'scale(1.2)';

        if (this.danceLedTimer) clearTimeout(this.danceLedTimer);
        this.danceLedTimer = setTimeout(() => {
          if (stateNow === 'dancing') {
            setLEDs('#1DB954', '0.15'); 
            el.eyeHalo.style.opacity = '0.05'; 
            el.eyeCenter.style.transform = 'scale(1)'; 
          }
        }, beatMs * 0.3);

        let r = 0, tx = 0, ty = 0, s = 1.0, lid = 0.0, ease = "ease-in-out";
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
          this.danceTimer = setTimeout(step, delay);
        };

        if (currentBpm < 90) {
           moveDur = beatSec * 2; bodyDur = beatSec * 4; ease = "ease-in-out"; lid = 0.4;
           if (choreoBlock === 0) { r = isQuadBeat ? 8 : -8; tx = isQuadBeat ? 5 : -5; ty = 2; }
           else if (choreoBlock === 1) { r = 0; tx = 0; ty = isQuadBeat ? 15 : -5; }
           else if (choreoBlock === 2) { r = Math.sin(dancePhase * Math.PI / 2) * 6; tx = Math.sin(dancePhase * Math.PI / 2) * 5; ty = Math.cos(dancePhase * Math.PI / 4) * 8 + 4; }
           else if (choreoBlock === 3) { r = (phaseMod8 < 4) ? 10 : -10; tx = (phaseMod8 < 4) ? 4 : -4; ty = 5; }
           else if (choreoBlock === 4) { r = Math.sin(dancePhase * Math.PI / 4) * 12; tx = 0; ty = 0; }
           else if (choreoBlock === 5) { r = isQuadBeat ? 4 : -4; tx = 0; ty = isQuadBeat ? 12 : 2; s = isQuadBeat ? 1.03 : 1.0; }
           else if (choreoBlock === 6) { r = (phaseMod8 === 0) ? 12 : (phaseMod8 === 4) ? -6 : 0; tx = r * 0.5; ty = 8; }
           else { r = 0; tx = 0; ty = 2; s = 1.05; lid = 0.5 + Math.sin(dancePhase * Math.PI / 2) * 0.3; }
           if (!isDownBeat) return executeTick(); 

        } else if (currentBpm < 125) {
           moveDur = beatSec * 0.8; ease = "cubic-bezier(0.34, 1.06, 0.64, 1)"; lid = 0.2;
           if (choreoBlock === 0) { r = isDownBeat ? 7 : -7; ty = isDownBeat ? 8 : -2; s = isDownBeat ? 1.02 : 1.0; }
           else if (choreoBlock === 1) { const side = (phaseMod4 < 2) ? 1 : -1; r = side * 8; tx = side * 4; ty = isDownBeat ? 10 : 2; }
           else if (choreoBlock === 2) { r = (phaseMod4 === 0) ? 10 : (phaseMod4 === 2) ? -10 : 0; ty = (phaseMod4 === 1 || phaseMod4 === 3) ? 12 : 0; ease = "ease-in-out"; }
           else if (choreoBlock === 3) { r = [10, 5, -10, -5][phaseMod4]; ty = [0, 8, 0, 8][phaseMod4]; }
           else if (choreoBlock === 4) { r = 0; tx = isDownBeat ? 8 : -8; ty = 4; }
           else if (choreoBlock === 5) { r = isDownBeat ? 10 : -10; tx = isDownBeat ? 5 : -5; ty = isDownBeat ? 10 : -5; }
           else if (choreoBlock === 6) { r = dirX * 6; ty = !isDownBeat ? 14 : 0; s = !isDownBeat ? 1.04 : 1.0; }
           else { const side = (dancePhase % 3 === 0) ? -1 : 1; r = side * 8; ty = isDownBeat ? 8 : 0; }

        } else if (currentBpm < 160) {
           moveDur = beatSec * 0.6; ease = "cubic-bezier(0.25, 0.8, 0.25, 1)"; lid = isDownBeat ? 0.1 : 0.0;
           if (choreoBlock === 0) { r = isDownBeat ? 12 : -12; tx = isDownBeat ? 6 : -6; ty = isDownBeat ? 10 : -8; s = 1.03; }
           else if (choreoBlock === 1) { r = 0; tx = [8, 0, -8, 0][phaseMod4]; ty = isDownBeat ? 5 : -5; if (phaseMod4 === 3) lid = 0.6; }
           else if (choreoBlock === 2) { r = isDownBeat ? 5 : -5; ty = isDownBeat ? 5 : -2; s = 1.0 + (phaseMod4 * 0.03); lid = 0.4 - (phaseMod4 * 0.1); }
           else if (choreoBlock === 3) { r = isDownBeat ? 15 : -15; tx = isDownBeat ? 5 : -5; ty = 8; }
           else if (choreoBlock === 4) { r = [10, 10, -10, -10][phaseMod4]; tx = [5, 5, -5, -5][phaseMod4]; ty = [8, -2, 8, -2][phaseMod4]; }
           else if (choreoBlock === 5) { r = dirX * 10; ty = isDownBeat ? 12 : 4; s = 1.02; moveDur = beatSec * 0.4; ease="linear"; }
           else if (choreoBlock === 6) { r = (phaseMod4 === 1 || phaseMod4 === 3) ? 0 : (phaseMod4 === 0 ? 12 : -12); ty = (phaseMod4 === 1 || phaseMod4 === 3) ? 14 : -2; }
           else { r = isDownBeat ? 12 : 12; tx = isDownBeat ? 8 : 8; ty = isDownBeat ? 8 : -4; if (isDownBeat) moveDur = beatSec * 0.1; else moveDur = beatSec * 0.8; }
           if (isDownBeat && choreoBlock !== 2) setPupil((Math.random()-0.5)*8, (Math.random()-0.5)*6);

        } else {
           moveDur = beatSec * 0.8; ease = "linear"; lid = isQuadBeat ? 0.4 : 0.0; 
           if (choreoBlock === 0) { r = 0; tx = 0; ty = isDownBeat ? 20 : -10; s = isDownBeat ? 1.08 : 0.95; ease = "ease-out"; }
           else if (choreoBlock === 1) { r = (Math.random() - 0.5) * 30; tx = (Math.random() - 0.5) * 15; ty = (Math.random() - 0.5) * 15; moveDur = beatSec * 0.5; }
           else if (choreoBlock === 2) { r = isDownBeat ? 18 : -18; tx = isDownBeat ? 10 : -10; ty = 12; }
           else if (choreoBlock === 3) { r = isDownBeat ? 10 : -10; tx = (Math.random() - 0.5) * 20; ty = 15; s = 1.1; el.eyeHalo.style.opacity = '0.8'; }
           else if (choreoBlock === 4) { r = isDownBeat ? 25 : -25; tx = isDownBeat ? 15 : -15; ty = isDownBeat ? 15 : -15; }
           else if (choreoBlock === 5) { r = 0; tx = 0; ty = isDownBeat ? 12 : 2; moveDur = beatSec * 0.3;  }
           else if (choreoBlock === 6) { r = Math.sin(dancePhase * Math.PI) * 20; tx = Math.sin(dancePhase * Math.PI) * 12; ty = Math.cos(dancePhase * Math.PI / 2) * 15 + 5; }
           else { if (phaseMod4 === 0) { r=15; ty=10; s=1.1; moveDur = beatSec * 0.1; } else { r=15; ty=10; s=1.1; moveDur = beatSec * 1.5; } el.eyeCenter.setAttribute('fill', (dancePhase%2===0)?'#ff0000':'#ffffff'); }
           setPupil((Math.random()-0.5)*15, (Math.random()-0.5)*15);
        }
        
        setHead(r, tx, ty, s, moveDur, ease);
        setBodySwivel(r * -0.8, 1, bodyDur);
        setBaseLid(lid, beatSec * 0.5);

        executeTick();
      };
      
      step();
    };

    const TALK_MOVES = [
      { r: -10, tx: -8, ty: -18, s: 1.02, dur: 1.8, lid: 0.1, px: 0, py: -2 },
      { r: 4, tx: 0, ty: 16, s: 1.08, dur: 1.2, lid: 0.85, px: 0, py: 4 },
      { r: 2, tx: 0, ty: 10, s: 1.04, dur: 1.0, lid: 0.5, px: 0, py: 2 },
      { r: 12, tx: 10, ty: -12, s: 0.96, dur: 2.2, lid: 0.1, px: 0, py: -1 },
      { r: 0, tx: 0, ty: 25, s: 1.10, dur: 1.8, lid: 0.9, px: 0, py: 5 },
      { r: -6, tx: 6, ty: -22, s: 0.98, dur: 1.0, lid: 0.1, px: 0, py: -3 },
      { r: 4, tx: -3, ty: 6, s: 1.03, dur: 2.0, lid: 0.4, px: 0, py: 1 },
      { r: -3, tx: 0, ty: 22, s: 1.15, dur: 1.2, lid: 0.95, px: 0, py: 6 },
      { r: 6, tx: 3, ty: -6, s: 1.0, dur: 1.5, lid: 0.2, px: 0, py: 0 },
    ];

    const startTalkAnim = () => {
      if (this.talkAnim) clearTimeout(this.talkAnim);
      let talkPhase = 0;
      const step = () => {
        const m = TALK_MOVES[talkPhase % TALK_MOVES.length];
        setHead(m.r, m.tx, m.ty, m.s, m.dur, "ease-in-out");
        setLid(m.lid, m.dur);
        setPupil(m.px, m.py);
        setBodySwivel(m.r * -0.6, 1, m.dur); 
        talkPhase++;
        this.talkAnim = setTimeout(step, m.dur * 1000);
      };
      step();
    };

    const animateGlaDOS = (state, bpm) => {
      stateNow = state;
      if (this.talkAnim) clearTimeout(this.talkAnim);
      stopLidBehavior();
      this.stopIdleCycle();
      this.stopDanceCycle();

      el.ledMatrices.forEach(m => m.classList.remove('pulsing'));
      if (el.dangerRing) el.dangerRing.setAttribute('opacity', '0');

      el.eyeLayerIdle.style.opacity = '0'; 
      el.eyeLayerListen.style.opacity = '0'; 
      el.eyeLayerProcess.style.opacity = '0'; 
      el.eyeLayerRespond.style.opacity = '0'; 
      el.eyeLayerDance.style.opacity = '0';
      el.eyeCenter.style.transform = 'scale(1)';
      el.eyeCenter.style.transition = 'fill 0.8s ease-in-out';

      if (state === 'idle') {
        el.eyeLayerIdle.style.opacity = '1';
        el.eyeHalo.style.transition = 'fill 0.8s ease-in-out, opacity 0.8s'; 
        el.eyeHalo.setAttribute('fill', '#330800'); 
        el.eyeHalo.style.opacity = '0.05';
        el.eyeCenter.setAttribute('fill', '#ffcc00');
        setHead(0, 0, 0, 1.0, 2.2); 
        setLid(0, 1.2); 
        setPupil(0, 0); 
        currentBaseLid = 0;
        setLEDs('#ffb800', '0.15');
        resetBodySwivel();
        startLidBehavior();
        this.startIdleCycle();
        
      } else if (state === 'dancing') {
        el.eyeLayerDance.style.opacity = '1';
        el.eyeHalo.style.transition = 'fill 0.8s ease-in-out, opacity 0.15s ease-out';
        el.eyeHalo.setAttribute('fill', '#1DB954'); 
        el.eyeCenter.setAttribute('fill', '#ffffff'); 
        el.eyeCenter.style.transformOrigin = '130px 364px';
        el.eyeCenter.style.transition = 'transform 0.1s ease-out, fill 0.8s ease-in-out';

        setLEDs('#1DB954', '0.15'); 
        resetBodySwivel();
        this.startDanceCycle(bpm);
        
      } else if (state === 'listening') {
        el.eyeLayerListen.style.opacity = '1';
        el.eyeHalo.style.transition = 'fill 0.8s ease-in-out, opacity 0.8s';
        el.eyeHalo.setAttribute('fill', '#00ccff'); 
        el.eyeHalo.style.opacity = '0.05';
        el.eyeCenter.setAttribute('fill', '#aaffff');
        setHead(4, 0, -8, 1.06, 1.0); 
        setBaseLid(0.1, 0.4); 
        setPupil(0, -3);
        setLEDs('#00ccff', '1');
        setBodySwivel(-2, 1, 1.4);
        
      } else if (state === 'processing') {
        el.eyeLayerProcess.style.opacity = '1';
        el.eyeHalo.style.transition = 'fill 0.8s ease-in-out, opacity 0.8s';
        el.eyeHalo.setAttribute('fill', '#ff6600'); 
        el.eyeHalo.style.opacity = '0.05';
        el.eyeCenter.setAttribute('fill', '#ffddaa');
        setHead(-2, 0, 10, 0.96, 1.4); 
        setBaseLid(0.65, 0.5); 
        setLEDs('#ff6600', '1');
        setBodySwivel(1, 0.98, 1.8);
        el.ledMatrices.forEach(m => m.classList.add('pulsing'));
        startLidBehavior();
        const dart = () => {
          if (stateNow !== 'processing') return;
          setPupil((Math.random() - 0.5) * 12, 4);
          this.pupilTimer = setTimeout(dart, 200 + Math.random() * 600);
        };
        dart();
        
      } else if (state === 'responding') {
        el.eyeLayerRespond.style.opacity = '1';
        el.eyeHalo.style.transition = 'fill 0.8s ease-in-out, opacity 0.8s';
        el.eyeHalo.setAttribute('fill', '#ff2200'); 
        el.eyeHalo.style.opacity = '0.05';
        el.eyeCenter.setAttribute('fill', '#ffaaaa');
        if (el.dangerRing) el.dangerRing.setAttribute('opacity', '1');
        setLEDs('#ff2200', '1');
        setBodySwivel(0, 1, 0.8);
        startTalkAnim();
      }
    };

    this.applyState = (raw, bpm) => {
      const s = (raw || 'idle').toLowerCase();
      let mapped = 'idle';
      if (s.includes('respond') || s.includes('speak') || s.includes('tts')) mapped = 'responding';
      else if (s.includes('listen') || s.includes('wake')) mapped = 'listening';
      else if (s.includes('process') || s.includes('think')) mapped = 'processing';
      else if (s === 'dancing') mapped = 'dancing';

      if (this.respondTimer) {
        clearTimeout(this.respondTimer);
        this.respondTimer = null;
      }

      const delaySeconds = config.respond_delay !== undefined ? parseFloat(config.respond_delay) : 0;

      if (mapped === 'responding' && this._lastEffectiveState !== 'responding' && delaySeconds > 0) {
        this.respondTimer = setTimeout(() => {
          this._lastEffectiveState = 'responding';
          animateGlaDOS('responding', bpm);
        }, delaySeconds * 1000);
        return; 
      }

      this._lastEffectiveState = mapped;
      animateGlaDOS(mapped, bpm);
    };

    this.applyState('idle', 120);
  }

  disconnectedCallback() {
    if (this.stopIdleCycle) this.stopIdleCycle();
    if (this.stopDanceCycle) this.stopDanceCycle();
    if (this.respondTimer) clearTimeout(this.respondTimer);
    if (this.lidTimer) clearTimeout(this.lidTimer);
    if (this.talkAnim) clearTimeout(this.talkAnim);
  }
}

class GladosCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  setConfig(config) {
    this._config = config;
    this.render();
  }

  set hass(hass) {
    this._hass = hass;
    const pickers = this.shadowRoot.querySelectorAll('ha-entity-picker');
    if (pickers.length > 0) {
      pickers.forEach(picker => { picker.hass = hass; });
    } else {
      this.render();
    }
  }

  configChanged(configKey, value) {
    if (!this._config) return;

    const newConfig = { ...this._config };
    if (value === '' || value === undefined || value === null) {
       delete newConfig[configKey];
    } else {
       newConfig[configKey] = value;
    }

    this._config = newConfig;

    this.dispatchEvent(new CustomEvent('config-changed', {
      detail: { config: this._config },
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    if (!this._config || !this._hass) return;

    this.shadowRoot.innerHTML = `
      <style>
        .card-config {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .side-by-side {
          display: flex;
          gap: 16px;
          margin-top: 8px;
        }
        .side-by-side > div {
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        label {
          font-family: var(--paper-font-body1_-_font-family, sans-serif);
          font-size: 14px;
          color: var(--primary-text-color);
        }
        .secondary {
          font-size: 12px;
          color: var(--secondary-text-color);
          margin-top: 2px;
        }
      </style>
      <div class="card-config">
        <ha-entity-picker
          id="entity-picker"
          label="Voice Assistant Entity (Required)"
          allow-custom-entity
        ></ha-entity-picker>

        <ha-entity-picker
          id="media-picker"
          label="Media Player Entity (Optional)"
          allow-custom-entity
        ></ha-entity-picker>

        <ha-entity-picker
          id="bpm-picker"
          label="BPM Sensor Entity (Optional)"
          allow-custom-entity
        ></ha-entity-picker>

        <div class="side-by-side">
          <div>
             <label>Response Delay: <span id="delay-val">${this._config.respond_delay !== undefined ? this._config.respond_delay : 0}</span>s</label>
             <div class="secondary">Time before she starts talking.</div>
             <ha-slider
                id="delay-slider"
                min="0" max="16" step="0.5"
                pin
                value="${this._config.respond_delay !== undefined ? this._config.respond_delay : 0}"
             ></ha-slider>
          </div>
          <div>
             <label>Zoom Scale: <span id="zoom-val">${this._config.zoom !== undefined ? this._config.zoom : 85}</span>%</label>
             <ha-slider
                id="zoom-slider"
                min="10" max="200" step="1"
                pin
                value="${this._config.zoom !== undefined ? this._config.zoom : 85}"
             ></ha-slider>
          </div>
        </div>

        <ha-formfield label="Transparent Background">
          <ha-switch id="bg-switch"></ha-switch>
        </ha-formfield>
      </div>
    `;

    const entityPicker = this.shadowRoot.querySelector('#entity-picker');
    entityPicker.hass = this._hass;
    entityPicker.value = this._config.entity;
    entityPicker.includeDomains = ['assist_satellite'];
    entityPicker.addEventListener('value-changed', (ev) => this.configChanged('entity', ev.detail.value));

    const mediaPicker = this.shadowRoot.querySelector('#media-picker');
    mediaPicker.hass = this._hass;
    mediaPicker.value = this._config.media_entity;
    mediaPicker.includeDomains = ['media_player'];
    mediaPicker.addEventListener('value-changed', (ev) => this.configChanged('media_entity', ev.detail.value));

    const bpmPicker = this.shadowRoot.querySelector('#bpm-picker');
    bpmPicker.hass = this._hass;
    bpmPicker.value = this._config.bpm_entity;
    bpmPicker.includeDomains = ['sensor'];
    bpmPicker.addEventListener('value-changed', (ev) => this.configChanged('bpm_entity', ev.detail.value));

    const delaySlider = this.shadowRoot.querySelector('#delay-slider');
    const delayVal = this.shadowRoot.querySelector('#delay-val');
    delaySlider.addEventListener('change', (ev) => {
      delayVal.innerText = ev.target.value;
      this.configChanged('respond_delay', Number(ev.target.value));
    });

    const zoomSlider = this.shadowRoot.querySelector('#zoom-slider');
    const zoomVal = this.shadowRoot.querySelector('#zoom-val');
    zoomSlider.addEventListener('change', (ev) => {
      zoomVal.innerText = ev.target.value;
      this.configChanged('zoom', Number(ev.target.value));
    });

    const bgSwitch = this.shadowRoot.querySelector('#bg-switch');
    bgSwitch.checked = this._config.transparent_bg === true;
    bgSwitch.addEventListener('change', (ev) => {
      this.configChanged('transparent_bg', ev.target.checked);
    });
  }
}

customElements.define('glados-card-editor', GladosCardEditor);
customElements.define('glados-card', GladosCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'glados-card',
  name: 'GLaDOS Custom Card',
  preview: true,
  description: 'A responsive, animated GLaDOS AI assistant card that reacts to voice and dances to music.'
});
