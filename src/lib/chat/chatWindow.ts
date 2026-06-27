import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import type { ProviderRouter } from '../providers/providerRouter.js';
import type { Settings } from '../settings.js';
import type { ChatMessage, StreamHandle } from '../providers/providerInterface.js';
import {
    ConversationStore,
    type Conversation,
} from './conversationStore.js';

// In GJS, `global` is Shell.Global — declare it for TypeScript.
declare const global: { stage: Clutter.Stage };

const ALDRIC_SYSTEM =
    "You are Aldric, a concise and friendly wizard-themed assistant living in " +
    "the user's GNOME desktop. Answer helpfully and directly, in the user's " +
    'language. Keep replies tight unless asked to elaborate.';

const MIN_W = 380;
const MIN_H = 320;
const DEFAULT_W = 760;
const DEFAULT_H = 520;
const NARROW_THRESHOLD = 480; // below this, the sidebar becomes an overlay
const SIDEBAR_W = 200;

type GrabKind = 'drag' | 'resize';
interface GrabState {
    kind: GrabKind;
    px: number;
    py: number;
    ox: number; // origin x / width
    oy: number; // origin y / height
}

const clamp = (v: number, lo: number, hi: number): number =>
    Math.max(lo, Math.min(hi, v));

export class ChatWindow {
    private root: St.BoxLayout;
    private header: St.BoxLayout;
    private title!: St.Label;
    private hamburger!: St.Button;
    private chatArea: St.BoxLayout;
    private sidebar: St.ScrollView;
    private grip: St.Widget;
    private sidebarBox: St.BoxLayout;
    private messagesBox: St.BoxLayout;
    private messagesScroll: St.ScrollView;
    private entry: St.Entry;
    private sendBtn: St.Button;
    private activeId: string | null = null;
    private busy = false;
    private stream: StreamHandle | null = null;
    private unsub: () => void;
    private visible = false;

    private grab: GrabState | null = null;
    private clutterGrab: Clutter.Grab | null = null;
    private capturedEventId = 0;
    private narrow = false;
    private sidebarOpen = true;
    private w = DEFAULT_W;
    private h = DEFAULT_H;

    constructor(
        private router: ProviderRouter,
        private store: ConversationStore,
        private settings: Settings,
    ) {
        this.root = new St.BoxLayout({
            vertical: true,
            style_class: 'grimoire-chat',
            reactive: true,
            can_focus: true,
            visible: false,
        });

        this.header = this.buildHeader();
        this.root.add_child(this.header);

        // Body region: chat fills it; the sidebar overlays the left edge.
        const stack = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            x_expand: true,
            y_expand: true,
        });
        this.root.add_child(stack);

        this.chatArea = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
        });
        stack.add_child(this.chatArea);

        this.messagesScroll = new St.ScrollView({
            style_class: 'grimoire-chat-messages',
            x_expand: true,
            y_expand: true,
            reactive: true,
        });
        this.messagesBox = new St.BoxLayout({ vertical: true, x_expand: true });
        setScrollChild(this.messagesScroll, this.messagesBox);
        this.chatArea.add_child(this.messagesScroll);
        // Tapping the chat dismisses the overlay sidebar in narrow mode.
        this.messagesScroll.connect('button-press-event', () => {
            this.closeOverlay();
            return Clutter.EVENT_PROPAGATE;
        });

        const inputRow = new St.BoxLayout({ vertical: false, style_class: 'grimoire-chat-input' });
        this.entry = new St.Entry({
            hint_text: 'Message Aldric…',
            can_focus: true,
            x_expand: true,
        });
        this.entry.clutter_text.connect('activate', () => this.send());
        this.entry.clutter_text.connect('key-press-event', (_a, ev: Clutter.Event) => {
            if (ev.get_key_symbol() === Clutter.KEY_Escape) {
                this.hide();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        this.sendBtn = new St.Button({ label: 'Send', style_class: 'button grimoire-btn' });
        this.sendBtn.connect('clicked', () => this.send());
        inputRow.add_child(this.entry);
        inputRow.add_child(this.sendBtn);
        this.chatArea.add_child(inputRow);

        // Sidebar overlay (conversation list).
        this.sidebar = new St.ScrollView({
            style_class: 'grimoire-chat-sidebar',
            y_expand: true,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.FILL,
        });
        this.sidebar.set_width(SIDEBAR_W);
        this.sidebarBox = new St.BoxLayout({ vertical: true, x_expand: true });
        setScrollChild(this.sidebar, this.sidebarBox);
        stack.add_child(this.sidebar);

        this.wireDrag();

        Main.layoutManager.uiGroup.add_child(this.root);

        // Resize grip lives directly in uiGroup (same layer as root) so no
        // parent layout manager can shrink it to 0×0. Position is kept in sync
        // manually via updateGripPosition().
        this.grip = new St.Widget({
            style_class: 'grimoire-chat-grip',
            reactive: true,
            visible: false,
        });
        this.grip.set_size(24, 24);
        this.grip.set_cursor_type(Clutter.CursorType.SE_RESIZE);
        Main.layoutManager.uiGroup.add_child(this.grip);

        this.wireResize();

        this.unsub = this.store.onChanged(() => this.renderSidebar());
    }

    private buildHeader(): St.BoxLayout {
        const header = new St.BoxLayout({
            vertical: false,
            style_class: 'grimoire-chat-header',
            reactive: true,
        });
        this.hamburger = new St.Button({ label: '☰', style_class: 'button grimoire-btn' });
        this.hamburger.connect('clicked', () => this.toggleSidebar());
        this.title = new St.Label({ text: 'Aldric', x_expand: true, style_class: 'grimoire-chat-title', reactive: true });
        const newBtn = new St.Button({ label: '+ New', style_class: 'button grimoire-btn' });
        newBtn.connect('clicked', () => this.newConversation());
        const closeBtn = new St.Button({ label: '✕', style_class: 'button grimoire-btn' });
        closeBtn.connect('clicked', () => this.hide());
        header.add_child(this.hamburger);
        header.add_child(this.title);
        header.add_child(newBtn);
        header.add_child(closeBtn);
        return header;
    }

    // --- drag & resize ----------------------------------------------------

    private wireDrag(): void {
        this.title.connect('button-press-event', (_a, ev: Clutter.Event) => {
            log(`[grimoire] title button-press`);
            const [cx, cy] = ev.get_coords();
            return this.beginGrab('drag', cx, cy, this.root.get_x(), this.root.get_y());
        });
    }

    private wireResize(): void {
        this.grip.connect('enter-event', () => {
            log(`[grimoire] grip enter`);
            return Clutter.EVENT_PROPAGATE;
        });
        this.grip.connect('button-press-event', (_a, ev: Clutter.Event) => {
            log(`[grimoire] grip button-press`);
            const [cx, cy] = ev.get_coords();
            return this.beginGrab('resize', cx, cy, this.w, this.h);
        });
    }

    private beginGrab(kind: GrabKind, px: number, py: number, ox: number, oy: number): boolean {
        log(`[grimoire] beginGrab kind=${kind} px=${px} py=${py}`);
        this.grab = { kind, px, py, ox, oy };
        this.clutterGrab = global.stage.grab(this.root);
        log(`[grimoire] clutter grab established`);
        this.capturedEventId = this.root.connect('captured-event', (_a: Clutter.Actor, ev: Clutter.Event) => {
            const t = ev.type();
            if (t === Clutter.EventType.MOTION) {
                if (this.grab?.kind === 'drag') return this.onDragMotion(ev);
                if (this.grab?.kind === 'resize') return this.onResizeMotion(ev);
            } else if (t === Clutter.EventType.BUTTON_RELEASE) {
                return this.endGrab();
            }
            return Clutter.EVENT_PROPAGATE;
        });
        return Clutter.EVENT_STOP;
    }

    private onDragMotion(ev: Clutter.Event): boolean {
        if (this.grab?.kind !== 'drag') return Clutter.EVENT_PROPAGATE;
        const [cx, cy] = ev.get_coords();
        this.root.set_position(
            Math.round(this.grab.ox + (cx - this.grab.px)),
            Math.round(this.grab.oy + (cy - this.grab.py)),
        );
        this.updateGripPosition();
        return Clutter.EVENT_STOP;
    }

    private onResizeMotion(ev: Clutter.Event): boolean {
        if (this.grab?.kind !== 'resize') return Clutter.EVENT_PROPAGATE;
        const mon = Main.layoutManager.primaryMonitor;
        const [cx, cy] = ev.get_coords();
        this.w = clamp(Math.round(this.grab.ox + (cx - this.grab.px)), MIN_W, mon ? mon.width : 4000);
        this.h = clamp(Math.round(this.grab.oy + (cy - this.grab.py)), MIN_H, mon ? mon.height : 4000);
        this.root.set_size(this.w, this.h);
        this.updateGripPosition();
        this.applyResponsive();
        return Clutter.EVENT_STOP;
    }

    private endGrab(): boolean {
        log(`[grimoire] endGrab`);
        if (!this.grab) return Clutter.EVENT_PROPAGATE;
        this.grab = null;
        if (this.capturedEventId) { this.root.disconnect(this.capturedEventId); this.capturedEventId = 0; }
        if (this.clutterGrab) { this.clutterGrab.dismiss(); this.clutterGrab = null; }
        this.saveGeometry();
        return Clutter.EVENT_STOP;
    }

    // --- geometry & responsive layout -------------------------------------

    private applyGeometry(): void {
        const mon = Main.layoutManager.primaryMonitor;
        if (!mon) return;
        this.w = clamp(this.settings.chatWidth || DEFAULT_W, MIN_W, mon.width);
        this.h = clamp(this.settings.chatHeight || DEFAULT_H, MIN_H, mon.height);
        this.root.set_size(this.w, this.h);

        let x = this.settings.chatX;
        let y = this.settings.chatY;
        if (x < 0 || y < 0) {
            x = mon.x + Math.round((mon.width - this.w) / 2);
            y = mon.y + Math.round((mon.height - this.h) / 2);
        } else {
            // Clamp a remembered position back onto the visible monitor.
            x = clamp(x, mon.x, mon.x + mon.width - this.w);
            y = clamp(y, mon.y, mon.y + mon.height - this.h);
        }
        this.root.set_position(x, y);
        this.updateGripPosition();
        this.applyResponsive();
    }

    private updateGripPosition(): void {
        this.grip.set_position(
            Math.round(this.root.get_x() + this.w - 24),
            Math.round(this.root.get_y() + this.h - 24),
        );
    }

    private applyResponsive(): void {
        this.narrow = this.w < NARROW_THRESHOLD;
        if (this.sidebarOpen) {
            this.sidebar.visible = true;
            this.chatArea.add_style_class_name('grimoire-chat-docked');
        } else {
            this.sidebar.visible = false;
            this.chatArea.remove_style_class_name('grimoire-chat-docked');
        }
        // In narrow mode the sidebar overlays the chat rather than pushing it.
        if (this.narrow && this.sidebarOpen) {
            this.chatArea.remove_style_class_name('grimoire-chat-docked');
        }
    }

    private toggleSidebar(): void {
        this.sidebarOpen = !this.sidebarOpen;
        this.applyResponsive();
    }

    private closeOverlay(): void {
        if (this.narrow && this.sidebarOpen) {
            this.sidebarOpen = false;
            this.applyResponsive();
        }
    }

    private saveGeometry(): void {
        this.settings.chatX = Math.round(this.root.get_x());
        this.settings.chatY = Math.round(this.root.get_y());
        this.settings.chatWidth = this.w;
        this.settings.chatHeight = this.h;
    }

    // --- visibility -------------------------------------------------------

    toggle(): void {
        if (this.visible) this.hide();
        else this.show();
    }

    show(): void {
        if (this.activeId === null) {
            const list = this.store.list();
            if (list.length > 0) this.setActive(list[0].id);
            else this.newConversation();
        }
        this.renderSidebar();
        this.applyGeometry();
        this.root.show();
        this.grip.show();
        this.visible = true;
        this.entry.grab_key_focus();
    }

    hide(): void {
        this.root.hide();
        this.grip.hide();
        this.visible = false;
    }

    // --- conversations ----------------------------------------------------

    private newConversation(): void {
        const c = this.store.create();
        this.setActive(c.id);
    }

    private setActive(id: string): void {
        this.activeId = id;
        this.closeOverlay();
        this.renderMessages();
        this.renderSidebar();
    }

    private renderSidebar(): void {
        this.sidebarBox.destroy_all_children();
        for (const c of this.store.list()) {
            const row = new St.BoxLayout({ vertical: false, style_class: 'grimoire-convo-row' });
            const pick = new St.Button({
                label: c.title,
                x_expand: true,
                style_class:
                    'grimoire-convo-pick' + (c.id === this.activeId ? ' grimoire-convo-active' : ''),
            });
            pick.connect('clicked', () => this.setActive(c.id));
            const del = new St.Button({ label: '✕', style_class: 'grimoire-convo-del' });
            del.connect('clicked', () => this.deleteConversation(c.id));
            row.add_child(pick);
            row.add_child(del);
            this.sidebarBox.add_child(row);
        }
    }

    private deleteConversation(id: string): void {
        this.store.delete(id);
        if (this.activeId === id) {
            this.activeId = null;
            const list = this.store.list();
            if (list.length > 0) this.setActive(list[0].id);
            else this.newConversation();
        }
    }

    // --- messages ---------------------------------------------------------

    private renderMessages(): void {
        this.messagesBox.destroy_all_children();
        const conv = this.active();
        if (!conv) return;
        for (const m of conv.messages) this.appendBubble(m.role, m.content);
        this.scrollToBottom();
    }

    private appendBubble(role: 'user' | 'assistant', text: string): St.Label {
        const wrap = new St.BoxLayout({
            vertical: false,
            x_expand: true,
            style_class: 'grimoire-msg-row ' + (role === 'user' ? 'grimoire-row-user' : 'grimoire-row-assistant'),
        });
        // Flexible spacer pushes user bubbles to the right side.
        if (role === 'user') wrap.add_child(new St.Widget({ x_expand: true }));
        const label = new St.Label({
            text,
            style_class: 'grimoire-msg ' + (role === 'user' ? 'grimoire-msg-user' : 'grimoire-msg-assistant'),
        });
        label.clutter_text.line_wrap = true;
        label.clutter_text.line_wrap_mode = 2; // PangoWrapMode.WORD_CHAR
        label.clutter_text.ellipsize = 0;      // PangoEllipsizeMode.NONE
        wrap.add_child(label);
        this.messagesBox.add_child(wrap);
        return label;
    }

    private send(): void {
        if (this.busy) return;
        const text = this.entry.get_text().trim();
        if (!text) return;
        const conv = this.active();
        if (!conv) return;

        if (!this.router.hasModel()) {
            this.appendBubble(
                'assistant',
                '⚠ No AI model configured. Open Grimoire settings, set your Ollama host and pick a model.',
            );
            this.scrollToBottom();
            return;
        }

        this.entry.set_text('');
        this.store.addMessage(conv.id, 'user', text);
        this.appendBubble('user', text);
        const assistantLabel = this.appendBubble('assistant', '…');
        this.scrollToBottom();

        const messages: ChatMessage[] = [
            { role: 'system', content: ALDRIC_SYSTEM },
            ...conv.messages.map((m) => ({ role: m.role, content: m.content })),
        ];

        this.busy = true;
        this.sendBtn.reactive = false;
        let acc = '';
        this.stream = this.router.provider.stream(messages, this.router.model, {
            onToken: (tok) => {
                acc += tok;
                assistantLabel.set_text(acc);
                this.scrollToBottom();
            },
            onDone: (full) => {
                assistantLabel.set_text(full || acc);
                this.store.addMessage(conv.id, 'assistant', full || acc);
                this.endStream();
            },
            onError: (err) => {
                assistantLabel.set_text('⚠ ' + err.message);
                this.endStream();
            },
        });
    }

    private endStream(): void {
        this.busy = false;
        this.sendBtn.reactive = true;
        this.stream = null;
    }

    private active(): Conversation | undefined {
        return this.activeId ? this.store.get(this.activeId) : undefined;
    }

    private scrollToBottom(): void {
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            const adj = this.messagesScroll.get_vadjustment();
            if (adj) adj.set_value(adj.get_upper() - adj.get_page_size());
            return GLib.SOURCE_REMOVE;
        });
    }

    destroy(): void {
        this.stream?.cancel();
        if (this.capturedEventId) { this.root.disconnect(this.capturedEventId); this.capturedEventId = 0; }
        if (this.clutterGrab) { this.clutterGrab.dismiss(); this.clutterGrab = null; }
        this.unsub();
        this.grip.destroy();
        this.root.destroy();
    }
}

function setScrollChild(scroll: St.ScrollView, child: Clutter.Actor): void {
    // GNOME 46+ uses set_child; fall back to add_child for safety.
    const s = scroll as unknown as {
        set_child?: (c: Clutter.Actor) => void;
        add_child?: (c: Clutter.Actor) => void;
    };
    if (typeof s.set_child === 'function') s.set_child(child);
    else s.add_child?.(child);
}
