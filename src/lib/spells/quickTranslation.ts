import { runAISpell } from './promptEnvelope.js';
import type { Spell, SpellContext } from './spell.js';

export const quickTranslation: Spell = {
    id: 'quick-translation',
    label: 'Quick Translation (AI)',
    icon: 'preferences-desktop-locale-symbolic',
    usesAI: true,
    run(input: string, ctx: SpellContext): Promise<string> {
        const primary = ctx.settings.translatePrimaryLanguage || 'English';
        const secondary = ctx.settings.translateSecondaryLanguage || 'Spanish';
        const task =
            `You translate between ${primary} and ${secondary}. ` +
            `Detect which of these two languages the text is written in and ` +
            `translate it into the other. If it is in neither ${primary} nor ` +
            `${secondary}, translate it into ${primary}. ` +
            'Preserve the meaning, tone, and formatting. ' +
            'Return only the translation.';
        return runAISpell(ctx, task, input);
    },
};
