import type { Spell } from './spell.js';
import { formatJson } from './formatJson.js';
import { jsonYaml } from './jsonYaml.js';
import { spellcheck } from './spellcheck.js';
import { quickTranslation } from './quickTranslation.js';
import { changeTone } from './changeTone.js';
import { summarize } from './summarize.js';
import { generateRegex } from './generateRegex.js';

export const SPELLS: readonly Spell[] = [
    formatJson,
    jsonYaml,
    spellcheck,
    quickTranslation,
    changeTone,
    summarize,
    generateRegex,
];
