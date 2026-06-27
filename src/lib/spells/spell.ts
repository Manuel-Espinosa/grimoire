import type { ProviderRouter } from '../providers/providerRouter.js';
import type { Settings } from '../settings.js';

export interface SpellContext {
    router: ProviderRouter;
    // Persistent config a Spell may read (e.g. Quick Translation's language
    // pair). Most Spells only need router; config-driven ones use this.
    settings: Settings;
}

// A fixed choice a Spell offers before casting (e.g. a target language for
// Translate, a direction for Change Tone). The popup turns these into a
// submenu and passes the chosen id back to run().
export interface SpellVariant {
    readonly id: string;
    readonly label: string;
}

export interface Spell {
    readonly id: string;
    readonly label: string;
    readonly icon: string; // symbolic icon name
    readonly usesAI: boolean;
    // Present only when the cast needs the user to pick an option first.
    readonly variants?: readonly SpellVariant[];
    run(input: string, ctx: SpellContext, variantId?: string): Promise<string>;
}
