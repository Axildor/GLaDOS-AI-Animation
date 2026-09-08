/**
 * index.js — Bundle entry point.
 * Registers the card element and the HACS/HA card picker entry.
 * The visual editor is HA's native getConfigForm() form (schema in
 * editor.js) — no custom editor element is registered.
 */

import { GladosCard } from './glados-card.js';

customElements.define('glados-card', GladosCard);

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === 'glados-card')) {
  window.customCards.push({
    type: 'glados-card',
    name: 'GLaDOS Custom Card',
    preview: true,
    description: 'A responsive, animated GLaDOS AI assistant card that reacts to voice and dances to music.',
    documentationURL: 'https://github.com/adix992/GLaDOS-AI-Animation',
  });
}