import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Settings } from './lib/settings.js';
import { ProviderRouter } from './lib/providers/providerRouter.js';
import { ClipboardHistory } from './lib/clipboard/clipboardHistory.js';
import { ConversationStore } from './lib/chat/conversationStore.js';
import { ChatWindow } from './lib/chat/chatWindow.js';
import { PanelIndicator } from './lib/ui/panelIndicator.js';

export default class GrimoireExtension extends Extension {
    private _settings?: Settings;
    private _router?: ProviderRouter;
    private _history?: ClipboardHistory;
    private _store?: ConversationStore;
    private _chat?: ChatWindow;
    private _indicator?: PanelIndicator;
    private _hostChangedId = 0;

    enable(): void {
        const settings = new Settings(this.getSettings());
        const router = new ProviderRouter(settings);
        const history = new ClipboardHistory(settings);
        const store = new ConversationStore();
        const chat = new ChatWindow(router, store, settings);

        const indicator = new PanelIndicator({
            history,
            router,
            settings,
            extensionPath: this.path,
            openChat: () => chat.toggle(),
            openPrefs: () => this.openPreferences(),
        });
        Main.panel.addToStatusArea(this.uuid, indicator.button);

        history.start();
        this._hostChangedId = settings.connect('changed::ollama-host', () =>
            router.refresh(),
        );

        this._settings = settings;
        this._router = router;
        this._history = history;
        this._store = store;
        this._chat = chat;
        this._indicator = indicator;
    }

    disable(): void {
        this._history?.stop();
        if (this._hostChangedId && this._settings) {
            this._settings.disconnect(this._hostChangedId);
            this._hostChangedId = 0;
        }
        this._indicator?.destroy();
        this._chat?.destroy();

        this._indicator = undefined;
        this._chat = undefined;
        this._store = undefined;
        this._history = undefined;
        this._router = undefined;
        this._settings = undefined;
    }
}
