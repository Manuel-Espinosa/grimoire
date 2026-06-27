import type Gio from 'gi://Gio';

export const KEY_OLLAMA_HOST = 'ollama-host';
export const KEY_DEFAULT_MODEL = 'default-model';
export const KEY_MAX_HISTORY = 'max-history-items';
export const KEY_TRANSLATE_PRIMARY = 'translate-primary-language';
export const KEY_TRANSLATE_SECONDARY = 'translate-secondary-language';
export const KEY_CHAT_X = 'chat-x';
export const KEY_CHAT_Y = 'chat-y';
export const KEY_CHAT_WIDTH = 'chat-width';
export const KEY_CHAT_HEIGHT = 'chat-height';

export class Settings {
    constructor(private readonly gs: Gio.Settings) {}

    get raw(): Gio.Settings {
        return this.gs;
    }

    get ollamaHost(): string {
        return this.gs.get_string(KEY_OLLAMA_HOST).replace(/\/+$/, '');
    }
    set ollamaHost(v: string) {
        this.gs.set_string(KEY_OLLAMA_HOST, v);
    }

    get defaultModel(): string {
        return this.gs.get_string(KEY_DEFAULT_MODEL);
    }
    set defaultModel(v: string) {
        this.gs.set_string(KEY_DEFAULT_MODEL, v);
    }

    get maxHistoryItems(): number {
        return this.gs.get_int(KEY_MAX_HISTORY);
    }
    set maxHistoryItems(v: number) {
        this.gs.set_int(KEY_MAX_HISTORY, v);
    }

    /** Quick Translation: ordered language pair (primary first). */
    get translatePrimaryLanguage(): string {
        return this.gs.get_string(KEY_TRANSLATE_PRIMARY);
    }
    set translatePrimaryLanguage(v: string) {
        this.gs.set_string(KEY_TRANSLATE_PRIMARY, v);
    }

    get translateSecondaryLanguage(): string {
        return this.gs.get_string(KEY_TRANSLATE_SECONDARY);
    }
    set translateSecondaryLanguage(v: string) {
        this.gs.set_string(KEY_TRANSLATE_SECONDARY, v);
    }

    /** Chat window geometry (x/y are -1 when never positioned → center). */
    get chatX(): number {
        return this.gs.get_int(KEY_CHAT_X);
    }
    set chatX(v: number) {
        this.gs.set_int(KEY_CHAT_X, v);
    }
    get chatY(): number {
        return this.gs.get_int(KEY_CHAT_Y);
    }
    set chatY(v: number) {
        this.gs.set_int(KEY_CHAT_Y, v);
    }
    get chatWidth(): number {
        return this.gs.get_int(KEY_CHAT_WIDTH);
    }
    set chatWidth(v: number) {
        this.gs.set_int(KEY_CHAT_WIDTH, v);
    }
    get chatHeight(): number {
        return this.gs.get_int(KEY_CHAT_HEIGHT);
    }
    set chatHeight(v: number) {
        this.gs.set_int(KEY_CHAT_HEIGHT, v);
    }

    connect(signal: string, cb: () => void): number {
        return this.gs.connect(signal, cb);
    }
    disconnect(id: number): void {
        this.gs.disconnect(id);
    }
}
