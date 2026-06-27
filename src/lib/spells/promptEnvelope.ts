import type { ChatMessage } from '../providers/providerInterface.js';
import type { SpellContext } from './spell.js';

const SYSTEM = [
    'You are a text-transformation engine inside a clipboard tool.',
    'Apply the requested transformation and return ONLY the transformed text.',
    'Do not add explanations, preamble, commentary, surrounding quotes, or',
    'markdown code fences unless they are an intrinsic part of the requested',
    'output. Never converse. Your output is pasted directly by the user.',
].join(' ');

export function buildMessages(task: string, input: string): ChatMessage[] {
    return [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `${task}\n\n---\n${input}` },
    ];
}

/** Safety net: strip wrapping code fences / quotes a model may add. */
export function stripChatter(text: string): string {
    let out = text.trim();
    const fence = out.match(/^```[a-zA-Z0-9]*\n([\s\S]*?)\n```$/);
    if (fence) out = fence[1].trim();
    if (
        out.length >= 2 &&
        ((out.startsWith('"') && out.endsWith('"')) ||
            (out.startsWith('“') && out.endsWith('”')))
    )
        out = out.slice(1, -1);
    return out;
}

/** Runs an AI Spell: guards on config, applies the envelope, cleans output. */
export async function runAISpell(
    ctx: SpellContext,
    task: string,
    input: string,
): Promise<string> {
    if (!ctx.router.hasModel())
        throw new Error(
            'No AI model configured. Set an Ollama host and pick a model in Grimoire settings.',
        );
    const raw = await ctx.router.provider.complete(
        buildMessages(task, input),
        ctx.router.model,
    );
    return stripChatter(raw);
}
