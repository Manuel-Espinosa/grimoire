import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { OllamaProvider } from './lib/providers/ollamaProvider.js';
import { LANGUAGES } from './lib/spells/languages.js';

export default class GrimoirePrefs extends ExtensionPreferences {
    fillPreferencesWindow(window: Adw.PreferencesWindow): Promise<void> {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage();
        window.add(page);

        // --- Provider ----------------------------------------------------
        const provGroup = new Adw.PreferencesGroup({
            title: 'Ollama Provider',
            description:
                'AI is optional. The clipboard manager and non-AI spells work without this.',
        });
        page.add(provGroup);

        const hostRow = new Adw.EntryRow({ title: 'Host (e.g. http://localhost:11434)' });
        settings.bind('ollama-host', hostRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        provGroup.add(hostRow);

        const modelList = new Gtk.StringList();
        const modelRow = new Adw.ComboRow({ title: 'Default model', model: modelList });
        provGroup.add(modelRow);

        const statusRow = new Adw.ActionRow({
            title: 'Connection',
            subtitle: 'Not tested yet',
        });
        const refreshBtn = new Gtk.Button({
            label: 'Test & refresh models',
            valign: Gtk.Align.CENTER,
        });
        statusRow.add_suffix(refreshBtn);
        statusRow.activatable_widget = refreshBtn;
        provGroup.add(statusRow);

        let suppress = false;
        const populate = (models: string[]): void => {
            suppress = true;
            while (modelList.get_n_items() > 0) modelList.remove(0);
            const current = settings.get_string('default-model');
            if (current && !models.includes(current)) models.unshift(current);
            for (const m of models) modelList.append(m);
            const idx = models.indexOf(current);
            modelRow.selected = idx >= 0 ? idx : 0;
            suppress = false;
        };

        // Seed with whatever is already saved so the row isn't empty.
        populate([]);

        modelRow.connect('notify::selected', () => {
            if (suppress) return;
            const sel = modelRow.selected;
            const str = sel >= 0 ? modelList.get_string(sel) : '';
            if (str) settings.set_string('default-model', str);
        });

        refreshBtn.connect('clicked', () => {
            statusRow.subtitle = 'Connecting…';
            const provider = new OllamaProvider(settings.get_string('ollama-host'));
            provider
                .listModels()
                .then((models) => {
                    if (models.length === 0) {
                        statusRow.subtitle =
                            'Connected, but no models installed. Pull one, e.g. `ollama pull llama3.2`';
                        return;
                    }
                    populate(models);
                    statusRow.subtitle = `Connected — ${models.length} model(s) available`;
                })
                .catch((e: unknown) => {
                    statusRow.subtitle = `Could not reach host: ${
                        e instanceof Error ? e.message : String(e)
                    }`;
                });
        });

        // --- Clipboard ---------------------------------------------------
        const clipGroup = new Adw.PreferencesGroup({ title: 'Clipboard History' });
        page.add(clipGroup);

        const maxRow = new Adw.SpinRow({
            title: 'Maximum items',
            adjustment: new Gtk.Adjustment({
                lower: 1,
                upper: 500,
                step_increment: 1,
                page_increment: 10,
            }),
        });
        settings.bind('max-history-items', maxRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        clipGroup.add(maxRow);

        // --- Spells ------------------------------------------------------
        const spellGroup = new Adw.PreferencesGroup({
            title: 'Spells',
            description:
                'Quick Translation translates between these two languages (the input language is detected automatically). For other languages, use the chat.',
        });
        page.add(spellGroup);

        const makeLangRow = (title: string, key: string): Adw.ComboRow => {
            const list = new Gtk.StringList();
            for (const l of LANGUAGES) list.append(l);
            // Keep a previously-saved off-list value selectable instead of
            // silently dropping it.
            const current = settings.get_string(key);
            let idx = LANGUAGES.indexOf(current);
            if (idx < 0 && current) {
                list.append(current);
                idx = LANGUAGES.length;
            }
            const row = new Adw.ComboRow({ title, model: list });
            row.selected = idx >= 0 ? idx : 0;
            row.connect('notify::selected', () => {
                const sel = row.selected;
                const str = sel >= 0 ? list.get_string(sel) : '';
                if (str) settings.set_string(key, str);
            });
            return row;
        };

        spellGroup.add(makeLangRow('Primary language', 'translate-primary-language'));
        spellGroup.add(makeLangRow('Secondary language', 'translate-secondary-language'));

        return Promise.resolve();
    }
}
