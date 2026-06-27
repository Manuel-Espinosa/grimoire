import yaml from 'js-yaml';
import type { Spell } from './spell.js';

export const jsonYaml: Spell = {
    id: 'json-yaml',
    label: 'JSON ⇄ YAML',
    icon: 'view-refresh-symbolic',
    usesAI: false,
    run(input: string): Promise<string> {
        const t = input.trim();
        try {
            if (t.startsWith('{') || t.startsWith('[')) {
                const obj = JSON.parse(t);
                return Promise.resolve(
                    yaml.dump(obj, { indent: 2, lineWidth: -1 }),
                );
            }
            const obj = yaml.load(t);
            return Promise.resolve(JSON.stringify(obj, null, 2));
        } catch (_e) {
            return Promise.reject(
                new Error('Input is not valid JSON or YAML.'),
            );
        }
    },
};
