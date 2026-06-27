import { runAISpell } from './promptEnvelope.js';
import type { Spell, SpellContext } from './spell.js';

const TASK =
    'Fix spelling, grammar, and punctuation in the following English text. ' +
    'Preserve the original meaning, tone, and formatting. ' +
    'Return only the corrected text, with no notes about what changed.';

export const spellcheck: Spell = {
    id: 'spellcheck',
    label: 'Spellcheck (AI)',
    icon: 'tools-check-spelling-symbolic',
    usesAI: true,
    run(input: string, ctx: SpellContext): Promise<string> {
        return runAISpell(ctx, TASK, input);
    },
};
