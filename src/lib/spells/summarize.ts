import { runAISpell } from './promptEnvelope.js';
import type { Spell, SpellContext } from './spell.js';

const TASK =
    'Summarize the following text concisely, capturing its key points. ' +
    'Write the summary in the same language as the input. ' +
    'Return only the summary, with no preamble, title, or notes.';

export const summarize: Spell = {
    id: 'summarize',
    label: 'Summarize (AI)',
    icon: 'format-justify-fill-symbolic',
    usesAI: true,
    run(input: string, ctx: SpellContext): Promise<string> {
        return runAISpell(ctx, TASK, input);
    },
};
