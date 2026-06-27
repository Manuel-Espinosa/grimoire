import St from 'gi://St';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import type { ClipboardHistory, ClipItem } from '../clipboard/clipboardHistory.js';
import type { ProviderRouter } from '../providers/providerRouter.js';
import type { Settings } from '../settings.js';
import { SPELLS } from '../spells/registry.js';
import type { Spell } from '../spells/spell.js';

export interface IndicatorDeps {
    history: ClipboardHistory;
    router: ProviderRouter;
    settings: Settings;
    extensionPath: string;
    openChat: () => void;
    openPrefs: () => void;
}

type EditState = { id: string; kind: 'text' | 'tag' } | null;

export class PanelIndicator {
    readonly button: InstanceType<typeof PanelMenu.Button>;
    private unsub: () => void;
    private query = '';
    private editing: EditState = null;
    private searchEntry: St.Entry | null = null;
    private itemsSection: PopupMenu.PopupMenuSection | null = null;

    constructor(private deps: IndicatorDeps) {
        this.button = new PanelMenu.Button(0.0, 'Grimoire', false);
        this.button.add_child(
            new St.Icon({
                // Custom symbolic mark (recolours with the panel theme) so
                // Grimoire is distinct from other clipboard extensions.
                gicon: Gio.icon_new_for_string(
                    `${deps.extensionPath}/icons/grimoire-symbolic.svg`,
                ),
                style_class: 'system-status-icon',
            }),
        );

        this.menu.connect('open-state-changed', (_m, open) => {
            if (open) {
                this.buildMenu();
            } else {
                // Reset transient view state so the next open starts clean.
                this.editing = null;
                this.query = '';
            }
            return false;
        });

        // Keep the list fresh while open (new copies, pins, spell results) —
        // but never while editing, which would discard the in-progress entry.
        this.unsub = this.deps.history.onChanged(() => {
            if (this.menu.isOpen && !this.editing) this.renderItems();
        });

        // GNOME 50's PopupMenu.open() returns early (and never emits
        // open-state-changed) when the menu is empty. Our menu is built lazily
        // *in* that handler, so an empty start would deadlock: open() refuses to
        // open, the handler never fires, the menu never gets built. Seed it once
        // here so the first open proceeds; open-state-changed then rebuilds it.
        this.buildMenu();
    }

    // PanelMenu.Button.menu is typed as a union; the real menu is a PopupMenu.
    private get menu(): PopupMenu.PopupMenu {
        return this.button.menu as PopupMenu.PopupMenu;
    }

    /** Build the whole popup: either the edit panel or the list skeleton. */
    private buildMenu(): void {
        const menu = this.menu;
        menu.removeAll();
        this.searchEntry = null;
        this.itemsSection = null;

        if (this.editing) {
            this.buildEditPanel();
            return;
        }

        const searchItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
        });
        const entry = new St.Entry({
            style_class: 'grimoire-clip-search',
            hint_text: 'Type here to search…',
            x_expand: true,
            can_focus: true,
        });
        entry.set_primary_icon(
            new St.Icon({ icon_name: 'edit-find-symbolic', style_class: 'popup-menu-icon' }),
        );
        entry.clutter_text.connect('text-changed', () => {
            this.query = entry.get_text();
            this.renderItems();
        });
        this.searchEntry = entry;
        searchItem.add_child(entry);
        menu.addMenuItem(searchItem);

        this.itemsSection = new PopupMenu.PopupMenuSection();
        menu.addMenuItem(this.itemsSection);

        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const clear = new PopupMenu.PopupMenuItem('Clear history');
        clear.connect('activate', () => this.deps.history.clear());
        menu.addMenuItem(clear);

        const chat = new PopupMenu.PopupMenuItem('Invoke Aldric (chat)');
        chat.connect('activate', () => this.deps.openChat());
        menu.addMenuItem(chat);

        const prefs = new PopupMenu.PopupMenuItem('Settings');
        prefs.connect('activate', () => this.deps.openPrefs());
        menu.addMenuItem(prefs);

        this.renderItems();
        this.focus(entry);
    }

    /** Refill only the item list — leaves the search field (and its focus). */
    private renderItems(): void {
        const section = this.itemsSection;
        if (!section) return;
        section.removeAll();

        const q = this.query.trim().toLowerCase();
        const items = this.deps.history.all.filter(
            (i) =>
                !q ||
                i.text.toLowerCase().includes(q) ||
                (i.tag?.toLowerCase().includes(q) ?? false),
        );

        if (items.length === 0) {
            const empty = new PopupMenu.PopupMenuItem(
                q ? 'No matches' : 'Clipboard history is empty',
            );
            empty.setSensitive(false);
            section.addMenuItem(empty);
            return;
        }

        for (const item of items) section.addMenuItem(this.buildItem(item));
    }

    private buildItem(item: ClipItem): PopupMenu.PopupSubMenuMenuItem {
        const sub = new PopupMenu.PopupSubMenuMenuItem(preview(item), false);
        if (item.pinned) sub.actor.add_style_class_name('grimoire-clip-pinned');

        const actions = new St.BoxLayout({ style_class: 'grimoire-clip-actions' });
        actions.add_child(
            this.iconBtn('document-edit-symbolic', 'Edit', () =>
                this.startEdit(item.id, 'text'),
            ),
        );
        actions.add_child(
            this.iconBtn('bookmark-new-symbolic', 'Tag', () =>
                this.startEdit(item.id, 'tag'),
            ),
        );
        actions.add_child(
            this.iconBtn(
                'view-pin-symbolic',
                item.pinned ? 'Unpin' : 'Pin',
                () => this.deps.history.togglePin(item.id),
            ),
        );
        actions.add_child(
            this.iconBtn('edit-copy-symbolic', 'Copy', () => {
                this.deps.history.copyBack(item.id);
                this.menu.close();
            }),
        );
        actions.add_child(
            this.iconBtn('document-save-symbolic', 'Export to file', () =>
                this.exportItem(item.id),
            ),
        );
        actions.add_child(
            this.iconBtn('user-trash-symbolic', 'Delete', () =>
                this.deps.history.remove(item.id),
            ),
        );

        // Sit the actions to the left of the submenu's expander triangle.
        const triangle = (sub as unknown as { _triangleBin?: Clutter.Actor })._triangleBin;
        if (triangle) sub.actor.insert_child_below(actions, triangle);
        else sub.actor.add_child(actions);

        sub.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem('Cast a spell'));
        for (const spell of SPELLS) this.addSpellEntry(sub.menu, spell, item.text);

        return sub;
    }

    /** Spell rows for one item. A spell with variants (e.g. Change tone)
     *  expands to one flat row per choice ("Change tone (AI): More formal")
     *  rather than a nested submenu — GNOME's PopupSubMenu does not reliably
     *  host a nested submenu item, and a flat list keeps the popup predictable.
     *  AI spells with no model configured show a single disabled hint row. */
    private addSpellEntry(
        menu: PopupMenu.PopupMenuBase,
        spell: Spell,
        text: string,
    ): void {
        const aiBlocked = spell.usesAI && !this.deps.router.hasModel();

        if (aiBlocked) {
            const it = new PopupMenu.PopupMenuItem(`${spell.label} — configure AI`);
            it.setSensitive(false);
            menu.addMenuItem(it);
            return;
        }

        if (spell.variants && spell.variants.length > 0) {
            for (const variant of spell.variants) {
                const it = new PopupMenu.PopupMenuItem(`${spell.label}: ${variant.label}`);
                it.connect('activate', () => void this.runSpell(spell, text, variant.id));
                menu.addMenuItem(it);
            }
            return;
        }

        const it = new PopupMenu.PopupMenuItem(spell.label);
        it.connect('activate', () => void this.runSpell(spell, text));
        menu.addMenuItem(it);
    }

    /** A small icon button that does not toggle the row's submenu when clicked
     *  (it stops the press/release from bubbling to the parent menu item). */
    private iconBtn(iconName: string, tip: string, onClick: () => void): St.Button {
        const btn = new St.Button({
            style_class: 'grimoire-clip-action',
            child: new St.Icon({ icon_name: iconName, style_class: 'popup-menu-icon' }),
            can_focus: true,
            track_hover: true,
        });
        btn.set_accessible_name(tip);
        btn.connect('button-press-event', () => Clutter.EVENT_STOP);
        btn.connect('button-release-event', () => {
            // Defer: the action re-renders the list, which would destroy this
            // very button while its event is still being delivered.
            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                onClick();
                return GLib.SOURCE_REMOVE;
            });
            return Clutter.EVENT_STOP;
        });
        return btn;
    }

    private startEdit(id: string, kind: 'text' | 'tag'): void {
        this.editing = { id, kind };
        this.buildMenu();
    }

    private buildEditPanel(): void {
        const menu = this.menu;
        const state = this.editing;
        const item = state
            ? this.deps.history.all.find((i) => i.id === state.id)
            : undefined;
        if (!state || !item) {
            this.editing = null;
            this.buildMenu();
            return;
        }
        const isTag = state.kind === 'tag';

        const header = new PopupMenu.PopupMenuItem(isTag ? 'Tag item' : 'Edit item');
        header.setSensitive(false);
        menu.addMenuItem(header);

        const entryItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
        });
        const entry = new St.Entry({
            style_class: 'grimoire-clip-edit',
            x_expand: true,
            can_focus: true,
            text: isTag ? (item.tag ?? '') : item.text,
        });
        if (!isTag) {
            entry.clutter_text.single_line_mode = false;
            entry.clutter_text.line_wrap = true;
        }
        entryItem.add_child(entry);
        menu.addMenuItem(entryItem);

        const done = (): void => {
            this.editing = null;
            this.buildMenu();
        };
        const save = (): void => {
            const value = entry.get_text();
            if (isTag) this.deps.history.setTag(item.id, value);
            else this.deps.history.editText(item.id, value);
            done();
        };
        // A tag is single-line, so Enter confirms it. Item text may be
        // multi-line, so there Enter inserts a newline — use the Save button.
        if (isTag) entry.clutter_text.connect('activate', () => save());

        const btnItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
        });
        const box = new St.BoxLayout({ x_expand: true, style_class: 'grimoire-clip-editbtns' });
        box.add_child(new St.Widget({ x_expand: true }));
        const cancelBtn = new St.Button({ label: 'Cancel', style_class: 'grimoire-btn' });
        cancelBtn.connect('clicked', () => done());
        const saveBtn = new St.Button({
            label: 'Save',
            style_class: 'grimoire-btn grimoire-btn-primary',
        });
        saveBtn.connect('clicked', () => save());
        box.add_child(cancelBtn);
        box.add_child(saveBtn);
        btnItem.add_child(box);
        menu.addMenuItem(btnItem);

        this.focus(entry);
    }

    private exportItem(id: string): void {
        try {
            const path = this.deps.history.exportItem(id);
            if (path) Main.notify('Grimoire', `Saved to ${path}`);
        } catch (e) {
            Main.notifyError('Grimoire', (e as Error).message);
        }
    }

    private async runSpell(spell: Spell, text: string, variantId?: string): Promise<void> {
        try {
            if (spell.usesAI) Main.notify('Grimoire', `Casting ${spell.label}…`);
            const out = await spell.run(
                text,
                { router: this.deps.router, settings: this.deps.settings },
                variantId,
            );
            this.deps.history.addResult(out);
            Main.notify('Grimoire', `${spell.label} applied — result copied to clipboard.`);
        } catch (e) {
            Main.notifyError('Grimoire', (e as Error).message);
        }
    }

    /** Grab key focus on the next idle — the menu grabs focus to itself as it
     *  opens, so setting it synchronously here would be overridden. */
    private focus(actor: St.Widget): void {
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            // Only grab focus when the popup is actually open — buildMenu also
            // runs once at construction (to seed the menu so open() works on
            // GNOME 50), and grabbing focus then would steal it from the user's
            // focused window.
            if (this.menu.isOpen) actor.grab_key_focus();
            return GLib.SOURCE_REMOVE;
        });
    }

    destroy(): void {
        this.unsub();
        this.button.destroy();
    }
}

function preview(item: ClipItem): string {
    const oneLine = item.text.replace(/\s+/g, ' ').trim();
    const body = oneLine.length > 50 ? oneLine.slice(0, 50) + '…' : oneLine;
    return item.tag ? `[${item.tag}] ${body}` : body;
}
