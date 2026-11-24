import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import { ItemType, getDefaultDatabaseFile } from '../common/constants.js';
import { getLinkImagePath } from '../misc/link.js';
import { JsonDatabase } from './json.js';

export class ClipboardEntryTracker {
	ext;
	_database;
	_entries = new Map();

	constructor(ext) {
		this.ext = ext;
	}

	get shouldInit() {
		return true;
	}

	async init() {
		if (this._database) {
			await this.clear();
			await this.destroy();
		}
		const file = this.getFile();
		this.ext.logger.log('Using JSON database');
		this._database = new JsonDatabase(this.ext, file);
		await this._database.init();
		const entries = await this._database.entries();

		// Track all entries
		this.track(...entries);

		// Delete oldest entries according to settings
		await this.deleteOldest();
		return entries;
	}

	getFile() {
		const location = this.ext.settings.get_string('database-location');
		return location ? Gio.File.new_for_path(location) : getDefaultDatabaseFile(this.ext);
	}

	async clear(history = null) {
		if (!this._database) return;
		history ??= this.ext.settings.get_enum('clipboard-history');
		const deleted = await this._database.clear(history);
		deleted.forEach((id) => this.deleteFromDatabase(id));
	}

	async destroy() {
		await this._database?.close();
		this._database = undefined;
	}

	async insert(type, content, metadata = null) {
		const id = await this._database?.selectConflict({ type, content });
		if (id) {
			const trackedEntry = this._entries.get(id);
			if (trackedEntry) {
				trackedEntry.datetime = GLib.DateTime.new_now_utc();
				return null;
			}
		}
		const entry = await this._database?.insert(type, content, metadata);
		if (!entry) return null;

		this.track(entry);
		await this.deleteOldest();
		return entry;
	}

	checkOldest() {
		const M = this.ext.settings.get_int('history-time');
		if (M === 0) return false;
		const now = GLib.DateTime.new_now_utc();
		const olderThan = now.add_minutes(-M);
		for (const entry of this._entries.values()) {
			if (entry.pinned || entry.tag) continue;
			if (entry.datetime.compare(olderThan) < 0) return true;
		}
		return false;
	}

	async deleteOldest() {
		const N = this.ext.settings.get_int('history-length');
		const M = this.ext.settings.get_int('history-time');
		const deleted = await this._database?.deleteOldest(N, M);
		if (deleted) deleted.forEach((id) => this.deleteFromDatabase(id));
	}

	track(...entries) {
		for (const entry of entries) {
			entry.connect('notify::content', async () => {
				const id = await this._database?.updateProperty(entry, 'content');
				if (id !== undefined && id >= 0) {
					entry.emit('delete');
					const conflicted = this._entries.get(id);
					if (conflicted) {
						conflicted.datetime = entry.datetime;
					}
				}
			});
			entry.connect('notify::pinned', () => this._database?.updateProperty(entry, 'pinned'));
			entry.connect('notify::tag', () => this._database?.updateProperty(entry, 'tag'));
			entry.connect('notify::datetime', () => this._database?.updateProperty(entry, 'datetime'));
			entry.connect('notify::metadata', () => this._database?.updateProperty(entry, 'metadata'));
			entry.connect('notify::title', () => this._database?.updateProperty(entry, 'title'));
			entry.connect('delete', () => this.delete(entry));
			this._entries?.set(entry.id, entry);
		}
	}

	async delete(entry) {
		if (entry.type === ItemType.Image) {
			try {
				const file = Gio.File.new_for_uri(entry.content);
				if (file.query_exists(null)) {
					file.delete(null);
				}
			} catch {
				this.ext.logger.error('Failed to delete image', entry.content);
			}
		} else if (entry.type === ItemType.Link && entry.metadata) {
			const metadata = { image: null, localImage: null, ...entry.metadata };
			try {
				if (metadata.localImage) {
					const f = Gio.File.new_for_uri(metadata.localImage);
					if (f.query_exists(null)) f.delete(null);
				} else if (metadata.image) {
					const file = getLinkImagePath(this.ext, metadata.image);
					if (file?.query_exists(null)) file.delete(null);
				}
			} catch {
				this.ext.logger.error('Failed to delete thumbnail image', metadata.image);
			}
		}

		if (this._entries.has(entry.id)) {
			await this._database?.delete(entry);
			this._entries.delete(entry.id);
		}
	}

	deleteFromDatabase(id) {
		const entry = this._entries.get(id);
		if (entry) {
			this._entries.delete(id);
			entry.emit('delete');
		}
	}
}
