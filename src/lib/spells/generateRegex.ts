import { runAISpell } from './promptEnvelope.js';
import type { Spell, SpellContext } from './spell.js';

const TASK =
    'Write a single regular expression that matches what the following ' +
    'description asks for, using standard PCRE-compatible syntax. ' +
    'Return only the bare pattern on one line — no slash delimiters, no ' +
    'flags, no quotes, no explanation, and no examples.';

export const generateRegex: Spell = {
    id: 'generate-regex',
    label: 'Generate regex (AI)',
    icon: 'system-search-symbolic',
    usesAI: true,
    run(input: string, ctx: SpellContext): Promise<string> {
        return runAISpell(ctx, TASK, input);
    },
};
