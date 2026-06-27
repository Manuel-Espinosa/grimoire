import { runAISpell } from './promptEnvelope.js';
import type { Spell, SpellContext } from './spell.js';

const TASKS: Record<string, string> = {
    formal:
        'Rewrite the following text in a more formal, professional tone. ' +
        'Preserve the original meaning and language. ' +
        'Return only the rewritten text.',
    casual:
        'Rewrite the following text in a more casual, friendly, conversational ' +
        'tone. Preserve the original meaning and language. ' +
        'Return only the rewritten text.',
};

export const changeTone: Spell = {
    id: 'change-tone',
    label: 'Change tone (AI)',
    icon: 'document-edit-symbolic',
    usesAI: true,
    variants: [
        { id: 'formal', label: 'More formal' },
        { id: 'casual', label: 'More casual' },
    ],
    run(input: string, ctx: SpellContext, variantId?: string): Promise<string> {
        const task = TASKS[variantId ?? 'formal'] ?? TASKS.formal;
        return runAISpell(ctx, task, input);
    },
};
