/**
 * index.js — Bundle entry point.
 * Registers the card element and the HACS/HA card picker entry.
 * The visual editor is HA's native getConfigForm() form (schema in
 * editor.js) — no custom editor element is registered.
 */

import { AxidosCard } from './axidos-card.js';

customElements.define('axidos-card', AxidosCard);

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === 'axidos-card')) {
  window.customCards.push({
    type: 'axidos-card',
    name: 'AXiDOS Avatar Card',
    preview: true,
    description: 'A responsive, animated AXiDOS avatar card that reacts to voice and dances to music.',
    documentationURL: 'https://github.com/Axildor/AXiDOS-Avatar-Card',
  });
}