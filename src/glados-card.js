/**
 * glados-card.js — GladosCard: thin lifecycle orchestrator.
 *
 * Owns: config lifecycle, hass state diffing, DOM setup, tap/keyboard
 * handlers, visibility handling, and WebKit reflow fix. All animation work
 * is delegated to GladosAnimator + behavior modules via states.js.
 */

import { sanitizeConfig, getStubConfig } from './config.js';
import { resolveState, parseBpm } from './state-mapper.js';
import { buildTemplate } from './template.js';
import { GladosAnimator } from './animator.js';
import { applyState } from './states.js';
import { bopHead } from './behaviors/bop.js';

export class GladosCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._lastHassVoice = null;
    this._lastHassMedia = null;
    this._lastHassBpm = null;
    this._state = 'idle';
    this._currentBpm = 120;
    this._bopping = false;
    this._bopSpring = null;
    this.animator = null;
    this.contentReady = false;
  }

  static getConfigElement() { return document.createElement('glados-card-editor'); }
  static getStubConfig() { return getStubConfig(); }

  setConfig(config) {
    this.config = sanitizeConfig(config);

    if (this.contentReady) {
      const prevState = this._state;
      this._teardownAnimation();
      this.setupDOM();
      this.initGlados();
      applyState(this, prevState || 'idle', this._currentBpm);
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

    // Firehose gatekeeping: only react when a tracked entity actually changed
    if (this._lastHassVoice === newVoiceState && this._lastHassMedia === newMediaState && this._lastHassBpm === newBpmState) return;

    this._lastHassVoice = newVoiceState;
    this._lastHassMedia = newMediaState;
    this._lastHassBpm = newBpmState;

    const currentBpm = parseBpm(newBpmState);
    const mapped = resolveState(newVoiceState, newMediaState);

    if (this._state !== mapped || (mapped === 'dancing' && this._currentBpm !== currentBpm)) {
      this._currentBpm = currentBpm;
      applyState(this, mapped, currentBpm);
    }
  }

  getCardSize() { return 6; }

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
      document.addEventListener('visibilitychange', this._boundVisibility);
    }
    if (this.contentReady) {
      const pivots = this.shadowRoot.querySelectorAll('#body-pivot, #head-sway-pivot');
      pivots.forEach((p) => { p.style.animation = 'none'; });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          pivots.forEach((p) => { p.style.animation = ''; });
        });
      });
      if (this._state) {
        applyState(this, this._state, this._currentBpm);
      }
    }
  }

  disconnectedCallback() {
    if (this._hitbox) {
      if (this._tapHandler) this._hitbox.removeEventListener('click', this._tapHandler);
      if (this._keyHandler) this._hitbox.removeEventListener('keydown', this._keyHandler);
    }
    this._teardownAnimation();
    if (this._boundVisibility) {
      document.removeEventListener('visibilitychange', this._boundVisibility);
    }
  }

  setupDOM() {
    this.shadowRoot.innerHTML = buildTemplate(this.config);
  }

  initGlados() {
    this.animator = new GladosAnimator(this.shadowRoot);
    this._hitbox = this.animator.el.hitbox;

    // ---- Tap handler: bop + official native HA Lovelace action dispatch ----
    if (this._tapHandler && this._hitbox) {
      this._hitbox.removeEventListener('click', this._tapHandler);
    }
    this._tapHandler = (e) => {
      if (this.config.tap_enabled === false) return;
      e.stopPropagation();
      e.preventDefault();

      bopHead(this);

      const actionObj = this.config.tap_action || { action: 'none' };
      if (actionObj.action === 'none') return;

      const ev = new Event('hass-action', { bubbles: true, composed: true });
      ev.detail = {
        config: this.config,
        action: 'tap',
      };
      this.dispatchEvent(ev);
    };

    if (this.config.tap_enabled !== false) { this._hitbox.style.display = 'block'; }
    this._hitbox.addEventListener('click', this._tapHandler);

    // ---- Keyboard accessibility ----
    if (this._keyHandler && this._hitbox) {
      this._hitbox.removeEventListener('keydown', this._keyHandler);
    }
    this._keyHandler = (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        if (e.key === ' ') e.preventDefault();
        this._tapHandler(e);
      }
    };
    this._hitbox.addEventListener('keydown', this._keyHandler);

    // ---- Tab visibility: pause everything when hidden, resume when visible ----
    this._visibilityHandler = () => {
      if (!this.isConnected) return;
      if (document.hidden) {
        this._teardownAnimation();
        this.animator.el.svg.style.animationPlayState = 'paused';
        this.animator.el.svg.querySelectorAll('#body-pivot, #head-sway-pivot').forEach((e) => { e.style.animationPlayState = 'paused'; });
      } else {
        this.animator.el.svg.style.animationPlayState = '';
        this.animator.el.svg.querySelectorAll('#body-pivot, #head-sway-pivot').forEach((e) => { e.style.animationPlayState = ''; });
        applyState(this, this._state, this._currentBpm || 120);
      }
    };

    if (this._boundVisibility) document.removeEventListener('visibilitychange', this._boundVisibility);
    this._boundVisibility = this._visibilityHandler;
    document.addEventListener('visibilitychange', this._boundVisibility);

    applyState(this, 'idle', 120);
  }
}