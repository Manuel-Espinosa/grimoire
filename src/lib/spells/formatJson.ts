import type { Spell } from './spell.js';

export const formatJson: Spell = {
    id: 'format-json',
    label: 'Format JSON',
    icon: 'format-justify-left-symbolic',
    usesAI: false,
    run(input: string): Promise<string> {
        try {
            return Promise.resolve(
                JSON.stringify(JSON.parse(input), null, 2),
            );
        } catch (_e) {
            return Promise.reject(
                new Error('Input is not valid JSON.'),
            );
        }
    },
};
