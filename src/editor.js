/**
 * editor.js — GladosCardEditor: visual config editor.
 * Self-contained; uses native HA editor components (ha-entity-picker,
 * ha-slider, ha-switch, hui-action-editor, ha-expansion-panel).
 */

export class GladosCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  setConfig(config) {
    this._config = JSON.parse(JSON.stringify(config));

    // Reactive Action Editor Data Pushing
    if (this.shadowRoot) {
      const actionEditor = this.shadowRoot.querySelector('#tap-action-editor');
      if (actionEditor) {
        actionEditor.config = this._config.tap_action || { action: 'none' };
      }

      // Re-sync sliders/switches when config changes externally (mirrors render() logic)
      const c = this._config;
      const q = (sel) => this.shadowRoot.querySelector(sel);
      const setVal = (sel, v) => { const elq = q(sel); if (elq) elq.value = v; };
      const setText = (sel, v) => { const elq = q(sel); if (elq) elq.innerText = v; };
      const setChecked = (sel, v) => { const elq = q(sel); if (elq) elq.checked = v; };

      const delay = c.respond_delay !== undefined ? c.respond_delay : 0;
      setVal('#delay-slider', delay); setText('#delay-val', delay);
      const zoom = c.zoom !== undefined ? c.zoom : 85;
      setVal('#zoom-slider', zoom); setText('#zoom-val', zoom);
      setChecked('#bg-switch', c.transparent_bg === true);
      setChecked('#tap-switch', c.tap_enabled !== false);

      const backendSpeed = c.tap_speed !== undefined ? Number(c.tap_speed) : 0.5;
      const uiValCalc = backendSpeed <= 0.5 ? (backendSpeed / 0.5) : 1.0 + ((backendSpeed - 0.5) / 1.5);
      const uiSpeed = uiValCalc.toFixed(1);
      setVal('#tap-speed-slider', uiSpeed); setText('#tap-speed-val', uiSpeed);

      const intensity = c.tap_intensity !== undefined ? c.tap_intensity : 1.0;
      setVal('#tap-intensity-slider', intensity); setText('#tap-intensity-val', intensity);
      const bounces = c.tap_bounces !== undefined ? c.tap_bounces : 5;
      setVal('#tap-bounces-slider', bounces); setText('#tap-bounces-val', bounces);
    }
  }

  set hass(hass) {
    this._hass = hass;
    if (!this.shadowRoot.querySelector('.card-config')) {
      this.render();
    } else {
      const pickers = this.shadowRoot.querySelectorAll('ha-entity-picker');
      pickers.forEach((picker) => { picker.hass = hass; });
      const actionEditor = this.shadowRoot.querySelector('#tap-action-editor');
      if (actionEditor) { actionEditor.hass = hass; }
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

    // Piecewise Linear Translation (Backend -> UI Slider)
    const backendSpeed = c.tap_speed !== undefined ? Number(c.tap_speed) : 0.5;
    const uiValCalc = backendSpeed <= 0.5 ? (backendSpeed / 0.5) : 1.0 + ((backendSpeed - 0.5) / 1.5);
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
          <div><label>Response Delay: <span id="delay-val">${c.respond_delay !== undefined ? c.respond_delay : 0}</span>s</label><div class="secondary">Time before she starts talking.</div><ha-slider id="delay-slider" min="0" max="16" step="0.5" pin value="${c.respond_delay !== undefined ? c.respond_delay : 0}"></ha-slider></div>
          <div><label>Zoom Scale: <span id="zoom-val">${c.zoom !== undefined ? c.zoom : 85}</span>%</label><ha-slider id="zoom-slider" min="10" max="200" step="1" pin value="${c.zoom !== undefined ? c.zoom : 85}"></ha-slider></div>
        </div>
        <ha-formfield label="Transparent Background"><ha-switch id="bg-switch"></ha-switch></ha-formfield>

        <ha-expansion-panel outlined header="Tap / Press Configuration">
          <div class="card-config" style="padding: 16px 0;">
            <ha-formfield label="Enable Tap to Bop"><ha-switch id="tap-switch"></ha-switch></ha-formfield>

            <hui-action-editor id="tap-action-editor" label="Tap Action"></hui-action-editor>

            <div class="side-by-side">
              <div><label>Animation Speed: <span id="tap-speed-val">${uiSpeed}</span>x</label><div class="secondary">0.1 = slow, 1.0 = normal, 2.0 = fast.</div><ha-slider id="tap-speed-slider" min="0.1" max="2.0" step="0.1" pin value="${uiSpeed}"></ha-slider></div>
              <div><label>Bop Intensity: <span id="tap-intensity-val">${c.tap_intensity !== undefined ? c.tap_intensity : 1.0}</span>x</label><div class="secondary">How far the head pulls back.</div><ha-slider id="tap-intensity-slider" min="0.5" max="2" step="0.1" pin value="${c.tap_intensity !== undefined ? c.tap_intensity : 1.0}"></ha-slider></div>
            </div>
            <div><label>Rebound Bounces: <span id="tap-bounces-val">${c.tap_bounces !== undefined ? c.tap_bounces : 5}</span></label><div class="secondary">Full oscillation cycles before settling.</div><ha-slider id="tap-bounces-slider" min="1" max="20" step="1" pin value="${c.tap_bounces !== undefined ? c.tap_bounces : 5}"></ha-slider></div>
          </div>
        </ha-expansion-panel>
      </div>
    `;

    const ep = this.shadowRoot.querySelector('#entity-picker'); ep.hass = this._hass; ep.value = c.entity; ep.includeDomains = ['assist_satellite'];
    ep.addEventListener('value-changed', (ev) => this.configChanged('entity', ev.detail.value));
    const mp = this.shadowRoot.querySelector('#media-picker'); mp.hass = this._hass; mp.value = c.media_entity; mp.includeDomains = ['media_player'];
    mp.addEventListener('value-changed', (ev) => this.configChanged('media_entity', ev.detail.value));
    const bp = this.shadowRoot.querySelector('#bpm-picker'); bp.hass = this._hass; bp.value = c.bpm_entity; bp.includeDomains = ['sensor'];
    bp.addEventListener('value-changed', (ev) => this.configChanged('bpm_entity', ev.detail.value));
    const delaySlider = this.shadowRoot.querySelector('#delay-slider');
    delaySlider.addEventListener('change', (ev) => { this.shadowRoot.querySelector('#delay-val').innerText = ev.target.value; this.configChanged('respond_delay', Number(ev.target.value)); });
    const zoomSlider = this.shadowRoot.querySelector('#zoom-slider');
    zoomSlider.addEventListener('change', (ev) => { this.shadowRoot.querySelector('#zoom-val').innerText = ev.target.value; this.configChanged('zoom', Number(ev.target.value)); });
    const bgSwitch = this.shadowRoot.querySelector('#bg-switch'); bgSwitch.checked = c.transparent_bg === true;
    bgSwitch.addEventListener('change', (ev) => this.configChanged('transparent_bg', ev.target.checked));

    const tapSwitch = this.shadowRoot.querySelector('#tap-switch'); tapSwitch.checked = c.tap_enabled !== false;
    tapSwitch.addEventListener('change', (ev) => this.configChanged('tap_enabled', ev.target.checked));

    const actionEditor = this.shadowRoot.querySelector('#tap-action-editor');
    if (actionEditor) {
      actionEditor.hass = this._hass;
      actionEditor.config = c.tap_action || { action: 'none' };
      actionEditor.addEventListener('value-changed', (ev) => {
        ev.stopPropagation();
        this.configChanged('tap_action', ev.detail.value);
      });
    }

    const tapSpeedSlider = this.shadowRoot.querySelector('#tap-speed-slider');

    // Piecewise Linear Translation (UI Slider -> Backend Config)
    tapSpeedSlider.addEventListener('change', (ev) => {
      const uiVal = Number(ev.target.value);
      this.shadowRoot.querySelector('#tap-speed-val').innerText = uiVal.toFixed(1);
      let backendVal = uiVal <= 1.0 ? uiVal * 0.5 : 0.5 + ((uiVal - 1.0) * 1.5);
      this.configChanged('tap_speed', Number(backendVal.toFixed(3)));
    });

    const tapIntensitySlider = this.shadowRoot.querySelector('#tap-intensity-slider');
    tapIntensitySlider.addEventListener('change', (ev) => { this.shadowRoot.querySelector('#tap-intensity-val').innerText = ev.target.value; this.configChanged('tap_intensity', Number(ev.target.value)); });

    const tapBouncesSlider = this.shadowRoot.querySelector('#tap-bounces-slider');
    tapBouncesSlider.addEventListener('change', (ev) => { this.shadowRoot.querySelector('#tap-bounces-val').innerText = ev.target.value; this.configChanged('tap_bounces', Number(ev.target.value)); });
  }
}