import { OllamaProvider } from './ollamaProvider.js';
import type { Provider } from './providerInterface.js';
import type { Settings } from '../settings.js';

export class ProviderRouter {
    private ollama: OllamaProvider;

    constructor(private settings: Settings) {
        this.ollama = new OllamaProvider(settings.ollamaHost);
    }

    /** Re-read host from settings (call when settings change). */
    refresh(): void {
        this.ollama.setHost(this.settings.ollamaHost);
    }

    get provider(): Provider {
        return this.ollama;
    }

    get model(): string {
        return this.settings.defaultModel;
    }

    /** AI is usable only once a model has been chosen. */
    hasModel(): boolean {
        return this.settings.defaultModel.trim().length > 0;
    }
}
