import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

const DIR = GLib.build_filenamev([GLib.get_user_data_dir(), 'grimoire']);

function ensureDir(): void {
    const dir = Gio.File.new_for_path(DIR);
    try {
        dir.make_directory_with_parents(null);
    } catch (_e) {
        // already exists — fine
    }
}

export function readJson<T>(name: string, fallback: T): T {
    try {
        const file = Gio.File.new_for_path(GLib.build_filenamev([DIR, name]));
        const [ok, contents] = file.load_contents(null);
        if (!ok || !contents || contents.length === 0)
            return fallback;
        const text = new TextDecoder().decode(contents);
        return JSON.parse(text) as T;
    } catch (_e) {
        return fallback;
    }
}

/** Save a snippet of text to a timestamped file under the snippets dir, so the
 *  user can keep a Clipboard History Item outside the capped, volatile history.
 *  Returns the absolute path written. */
export function saveSnippet(text: string): string {
    const dir = GLib.build_filenamev([DIR, 'snippets']);
    try {
        Gio.File.new_for_path(dir).make_directory_with_parents(null);
    } catch (_e) {
        // already exists — fine
    }
    const now = GLib.DateTime.new_now_local();
    const stamp = now.format('%Y%m%d-%H%M%S') ?? String(Date.now());
    const path = GLib.build_filenamev([dir, `snippet-${stamp}.txt`]);
    const bytes = new TextEncoder().encode(text);
    Gio.File.new_for_path(path).replace_contents(
        bytes,
        null,
        false,
        Gio.FileCreateFlags.REPLACE_DESTINATION,
        null,
    );
    return path;
}

export function writeJson(name: string, data: unknown): void {
    try {
        ensureDir();
        const file = Gio.File.new_for_path(GLib.build_filenamev([DIR, name]));
        const bytes = new TextEncoder().encode(JSON.stringify(data, null, 2));
        file.replace_contents(
            bytes,
            null,
            false,
            Gio.FileCreateFlags.REPLACE_DESTINATION,
            null,
        );
    } catch (e) {
        logError(e as object, 'Grimoire: failed to persist ' + name);
    }
}
