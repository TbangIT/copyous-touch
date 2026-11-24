import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import St from 'gi://St';

import { __decorate } from '../../thirdparty/tslib.js';
import { Color } from '../common/color.js';
import { ItemType, getImagesPath } from '../common/constants.js';
import { detectContentType } from '../common/detector.js';
import { registerClass } from '../common/gjs.js';
import { ClipboardEntry, FileOperation } from '../database/database.js';
import { Keyboard } from './keyboard.js';

Gio._promisify(Gio.File.prototype, 'load_contents_async');
Gio._promisify(Gio.File.prototype, 'replace_contents_async');
Gio._promisify(Gio.MemoryOutputStream.prototype, 'splice_async');
Gio._promisify(Meta.SelectionSource.prototype, 'read_async');
const MimeTypes = {
	Text: ['text/plain;charset=utf-8', 'UTF8_STRING', 'text/plain', 'STRING'],
	Image: [
		'image/png',
		'image/jpeg',
		'image/jpg',
		'image/webp',
		'image/avif',
		'image/gif',
		'image/bmp',
		'image/x-ms-bmp',
		'image/tiff',
		'image/svg+xml',
		'image/jxl',
	],
	File: ['x-special/gnome-copied-files', 'text/uri-list'],
	Sensitive: ['x-kde-passwordManagerHint'],
};

export const ContentType = {
	Text: 0,
	Image: 1,
	File: 2,
};

function contentChecksum(content) {
	switch (content.type) {
		case ContentType.Text:
			return GLib.compute_checksum_for_string(GLib.ChecksumType.MD5, content.text, content.text.length);
		case ContentType.Image:
			return content.checksum;
		case ContentType.File: {
			const s = content.paths.map((f) => decodeURI(f).substring('file://'.length)).join('\n');
			return GLib.compute_checksum_for_string(GLib.ChecksumType.MD5, s, s.length);
		}
	}
}

const ClipboardManagerSignals = {
	clipboard: {
		param_types: [ClipboardEntry.$gtype],
	},
	text: {
		param_types: [GObject.TYPE_STRING],
	},
	image: {
		param_types: [GObject.TYPE_JSOBJECT, GObject.TYPE_INT, GObject.TYPE_INT],
	},
};
let ClipboardManager = class ClipboardManager extends GObject.Object {
	ext;
	tracker;
	textDecoder = new TextDecoder();
	textEncoder = new TextEncoder();
	graphemeSegmenter = new Intl.Segmenter();
	selection;
	clipboard;
	keyboard;
	signalId = -1;
	pasteSignalId = -1;
	prevClipboard = null;

	constructor(ext, tracker) {
		super();
		this.ext = ext;
		this.tracker = tracker;
		this.selection = global.display.get_selection();
		this.clipboard = St.Clipboard.get_default();
		this.signalId = this.selection.connect('owner-changed', this.ownerChanged.bind(this));
	}

	destroy() {
		this.textDecoder = undefined;
		this.textEncoder = undefined;
		this.graphemeSegmenter = undefined;
		this.keyboard?.destroy();
		this.keyboard = undefined;
		if (this.signalId >= 0) this.selection.disconnect(this.signalId);
		if (this.pasteSignalId >= 0) GLib.source_remove(this.pasteSignalId);
		this.signalId = -1;
		this.pasteSignalId = -1;
	}

	copyContent(content) {
		const checksum = contentChecksum(content);
		if (!checksum) return;
		this.prevClipboard = [content.type, checksum];

		// Text
		if (content.type === ContentType.Text) {
			this.clipboard.set_text(St.ClipboardType.CLIPBOARD, content.text);
			if (this.ext.settings.get_boolean('sync-primary')) {
				this.clipboard.set_text(St.ClipboardType.PRIMARY, content.text);
			}
			return;
		}

		// Image
		if (content.type === ContentType.Image) {
			const bytes = content.data instanceof GLib.Bytes ? content.data : new GLib.Bytes(content.data);
			this.clipboard.set_content(St.ClipboardType.CLIPBOARD, content.mimetype, bytes);
			return;
		}

		// File
		if (content.type === ContentType.File) {
			const s = `${FileOperation.Copy}\n${content.paths.join('\n')}`;
			const bytes = this.textEncoder.encode(s);
			this.clipboard.set_content(St.ClipboardType.CLIPBOARD, MimeTypes.File[0], bytes);
			return;
		}
	}

	pasteContent(content) {
		this.copyContent(content);
		if (this.pasteSignalId >= 0) GLib.source_remove(this.pasteSignalId);
		this.pasteSignalId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
			this.keyboard ??= new Keyboard();

			// https://github.com/Tudmotu/gnome-shell-extension-clipboard-indicator/blob/89c57703641a9d5d15f899f6e780174641911d95/extension.js#L1094
			if (this.keyboard.purpose === Clutter.InputContentPurpose.TERMINAL) {
				this.keyboard.press(Clutter.KEY_Control_L);
				this.keyboard.press(Clutter.KEY_Shift_L);
				this.keyboard.press(Clutter.KEY_Insert);
				this.keyboard.release(Clutter.KEY_Insert);
				this.keyboard.release(Clutter.KEY_Shift_L);
				this.keyboard.release(Clutter.KEY_Control_L);
			} else {
				this.keyboard.press(Clutter.KEY_Shift_L);
				this.keyboard.press(Clutter.KEY_Insert);
				this.keyboard.release(Clutter.KEY_Insert);
				this.keyboard.release(Clutter.KEY_Shift_L);
			}
			this.pasteSignalId = -1;
			return GLib.SOURCE_REMOVE;
		});
	}

	copyText(s) {
		this.copyContent({ type: ContentType.Text, text: s });
		this.emit('text', s);
	}

	pasteText(s) {
		this.pasteContent({ type: ContentType.Text, text: s });
	}

	copyPng(data, width, height) {
		const checksum = GLib.compute_checksum_for_bytes(GLib.ChecksumType.MD5, data);
		if (!checksum) return;
		this.copyContent({ type: ContentType.Image, mimetype: 'image/png', data, checksum });
		this.emit('image', data, width, height);
	}

	async copyEntry(entry) {
		await this.handleEntry(entry, false);
	}

	async pasteEntry(entry) {
		await this.handleEntry(entry, true);
	}

	async handleEntry(entry, paste) {
		const fn = paste ? this.pasteContent.bind(this) : this.copyContent.bind(this);
		if (this.ext.settings.get_boolean('update-date-on-copy')) {
			entry.datetime = GLib.DateTime.new_now_utc();
		}
		switch (entry.type) {
			case ItemType.Text:
			case ItemType.Code:
			case ItemType.Link:
			case ItemType.Character:
			case ItemType.Color:
				return fn({ type: ContentType.Text, text: entry.content });
			case ItemType.Image:
				try {
					const image = Gio.File.new_for_uri(entry.content);
					if (!image.query_exists(null)) {
						this.ext.logger.error('Image file does not exist on disk', entry.content);
						break;
					}
					const [contents, _etag] = await image.load_contents_async(null);
					const [contentType] = Gio.content_type_guess(image.get_path(), contents);
					const mimetype = Gio.content_type_get_mime_type(contentType);
					if (!mimetype) break;
					const bytes = contents instanceof GLib.Bytes ? contents : new GLib.Bytes(contents);
					const checksum = GLib.compute_checksum_for_bytes(GLib.ChecksumType.MD5, bytes);
					if (!checksum) return;
					return fn({ type: ContentType.Image, mimetype, data: bytes, checksum });
				} catch (e) {
					this.ext.logger.error('Failed to load image for paste/copy', e);
					break;
				}
			case ItemType.File:
			case ItemType.Files: {
				const paths = entry.content.split('\n');
				return fn({ type: ContentType.File, paths, operation: FileOperation.Copy });
			}
		}
	}

	shouldSave(mimeTypes) {
		// Mime Type
		if (MimeTypes.Sensitive.some((value) => mimeTypes.includes(value))) {
			return false;
		}

		// WM Class
		const window = global.display.focus_window;
		if (window) {
			const exclusions = this.ext.settings.get_strv('wmclass-exclusions');
			if (window.wm_class && exclusions.includes(window.wm_class)) return false;
		}
		return !this.ext.settings.get_boolean('incognito');
	}

	async ownerChanged(_selection, selectionType, selectionSource) {
		try {
			if (selectionSource === null) return;
			if (selectionType !== Meta.SelectionType.SELECTION_CLIPBOARD) return;
			const mimeTypes = selectionSource.get_mimetypes();
			const content = await this.getContent(selectionSource, mimeTypes);
			if (!content) return;
			const checksum = contentChecksum(content);
			if (!checksum) return;

			// Check duplicate
			if (this.prevClipboard) {
				const [type, prevChecksum] = this.prevClipboard;
				if (type === content.type && prevChecksum === checksum) {
					return;
				}

				// Do not update clipboard when clipboard ownership of a copied file is lost
				// i.e. nautilus is closed
				if (type === ContentType.File && content.type === ContentType.Text && prevChecksum === checksum) {
					return;
				}
			}
			this.prevClipboard = [content.type, checksum];

			// Check if history should be saved after setting the previous clipboard item.
			// This ensures that content copied in incognito mode is not saved to history
			// after copying an item after exiting incognito mode.
			if (!this.shouldSave(mimeTypes)) return;
			const res = await this.convertContent(content);
			if (!res) return;
			const [type, text, metadata] = res;
			const entry = await this.tracker.insert(type, text, metadata);
			if (entry) {
				this.emit('clipboard', entry);
			}
		} catch (e) {
			this.ext.logger.error(e);
		}
	}

	async getContent(selectionSource, mimeTypes) {
		async function getBytes(mimeType) {
			try {
				const source = await selectionSource.read_async(mimeType, null);
				if (!source) return null;
				const out = Gio.MemoryOutputStream.new_resizable();
				await out.splice_async(
					source,
					Gio.OutputStreamSpliceFlags.CLOSE_SOURCE | Gio.OutputStreamSpliceFlags.CLOSE_TARGET,
					GLib.PRIORITY_DEFAULT,
					null,
				);
				return out.steal_as_bytes();
			} catch {
				return null;
			}
		}

		// Image
		const imageMimeType = MimeTypes.Image.find((value) => mimeTypes.includes(value));
		if (imageMimeType) {
			const bytes = await getBytes(imageMimeType);
			if (bytes && bytes.get_size() > 0) {
				const checksum = GLib.compute_checksum_for_bytes(GLib.ChecksumType.MD5, bytes);
				if (!checksum) return null;
				return { type: ContentType.Image, mimetype: imageMimeType, data: bytes, checksum };
			} else {
				return null;
			}
		}

		// File
		const fileMimeType = MimeTypes.File.find((value) => mimeTypes.includes(value));
		if (fileMimeType) {
			const bytes = await getBytes(fileMimeType);
			const text = bytes && bytes.get_size() > 0 ? this.textDecoder.decode(bytes.toArray()).trim() : '';
			if (text) {
				const files = text
					.split('\n')
					.map((f) => f.trim())
					.filter((f) => f.length !== 0);
				const operation = files[0]?.toLowerCase();
				if (operation === FileOperation.Copy || operation === FileOperation.Cut) {
					return { type: ContentType.File, paths: files.slice(1), operation };
				} else {
					return { type: ContentType.File, paths: files, operation: FileOperation.Copy };
				}
			} else {
				return null;
			}
		}

		// Text
		const textMimeType = MimeTypes.Text.find((value) => mimeTypes.includes(value));
		if (textMimeType) {
			const bytes = await getBytes(textMimeType);
			const text = bytes && bytes.get_size() > 0 ? this.textDecoder.decode(bytes.toArray()) : '';
			if (text && text.trim()) {
				return { type: ContentType.Text, text };
			} else {
				return null;
			}
		}
		return null;
	}

	async convertContent(content) {
		if (content.type === ContentType.Text) {
			const detected = detectContentType({ type: ItemType.Text, content: content.text });
			if (detected.label === 'Link') {
				return [ItemType.Link, content.text, { subType: detected.label }];
			}
			if (detected.label !== 'TXT') {
				return [ItemType.Code, content.text, { subType: detected.label, ext: detected.ext }];
			}
			return [ItemType.Text, content.text, { subType: 'TXT' }];
		}

		// Image
		if (content.type === ContentType.Image) {
			try {
				const path = getImagesPath(this.ext);
				if (!path.query_exists(null)) path.make_directory_with_parents(null);
				let extension = 'png';
				if (content.mimetype === 'image/jpeg' || content.mimetype === 'image/jpg') extension = 'jpg';
				else if (content.mimetype === 'image/webp') extension = 'webp';
				else if (content.mimetype === 'image/gif') extension = 'gif';
				else if (content.mimetype === 'image/bmp' || content.mimetype === 'image/x-ms-bmp') extension = 'bmp';
				else if (content.mimetype === 'image/svg+xml') extension = 'svg';
				else if (content.mimetype === 'image/avif') extension = 'avif';
				else if (content.mimetype === 'image/tiff') extension = 'tiff';
				else if (content.mimetype.includes('/')) extension = content.mimetype.split('/')[1].replace(/[^a-zA-Z0-9]/g, '');
				const image = path.get_child(`${content.checksum}.${extension}`);
				if (!image.query_exists(null)) {
					const bytes = content.data instanceof GLib.Bytes ? content.data : new GLib.Bytes(content.data);
					await image.replace_contents_async(
						bytes,
						null,
						false,
						Gio.FileCreateFlags.REPLACE_DESTINATION,
						null,
					);
				}
				return [ItemType.Image, image.get_uri(), null];
			} catch (e) {
				this.ext.logger.error('Failed to save image item', e);
				return null;
			}
		}

		// File
		if (content.type === ContentType.File) {
			const metadata = { operation: content.operation };
			if (content.paths.length === 1) {
				return [ItemType.File, content.paths[0], metadata];
			} else {
				return [ItemType.Files, content.paths.join('\n'), metadata];
			}
		}
		return null;
	}

	looksLikeCode(text) {
		if (!text || text.length > 50000) return false;
		const lines = text.split('\n');
		if (lines.length <= 1) {
			return /^(const|let|var|function|import|export|def|return|class)\s+[a-zA-Z0-9_$]+/.test(text) ||
				(/[{}\[\];]/.test(text) && /(=>|===|!==|==|!=|\+\+|--)/.test(text));
		}
		const patterns = [
			/^(const|let|var|function|class|import|export|def|async|await|return|if|for|while)\b/,
			/[;{}][\s]*$/,
			/(=>|===|!==|->|::)/,
			/<\/?[a-z][\s\S]*>/i,
			/^\s*(public|private|protected|fn|impl|pub|package|struct)\b/,
		];
		let matches = 0;
		for (const line of lines.slice(0, 15)) {
			const t = line.trim();
			if (patterns.some((p) => p.test(t))) matches++;
		}
		return matches >= 2;
	}
};
ClipboardManager = __decorate(
	[
		registerClass({
			Signals: ClipboardManagerSignals,
		}),
	],
	ClipboardManager,
);

export { ClipboardManager };
