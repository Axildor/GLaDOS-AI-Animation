/**
 * index.js — Bundle entry point.
 * Registers the custom elements and the HACS/HA card picker entry.
 */

import { GladosCard } from './glados-card.js';
import { GladosCardEditor } from './editor.js';

customElements.define('glados-card-editor', GladosCardEditor);
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