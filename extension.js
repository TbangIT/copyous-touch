import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { DbusService } from './lib/common/dbus.js';
import { migrateSettings } from './lib/common/settings.js';
import { ClipboardEntryTracker } from './lib/database/entryTracker.js';
import { closeLinkSession } from './lib/misc/link.js';
import { ClipboardManager } from './lib/misc/clipboard.js';
import { NotificationManager } from './lib/misc/notifications.js';
import { ShortcutManager } from './lib/misc/shortcuts.js';
import { ClipboardDialog } from './lib/ui/clipboardDialog.js';
import { ClipboardIndicator } from './lib/ui/indicator.js';
import { ThemeManager } from './lib/ui/theme.js';

export default class CopiousTouchExtension extends Extension {
	settings;
	logger;
	clipboardDialog;
	theme;
	indicator;
	_savedTrayBindings = null;
	dbus;
	notificationManager;
	shortcutsManager;
	entryTracker;
	historyTimeoutId = -1;
	updateHistory = false;
	clipboardManager;

	enable() {
		this.settings = this.getSettings();
		migrateSettings(this.settings);
		this.logger = this.getLogger();
		const error = this.logger.error.bind(this.logger);

		// Libera la scorciatoia di apertura se è occupata dal tray dei messaggi di GNOME (di default <Super>v)
		this.claimShortcut();

		// Tema (deve esistere prima di cassetto e menu, che vi si registrano)
		this.theme = new ThemeManager(this);

		// UI - Drawer Dialog
		this.clipboardDialog = new ClipboardDialog(this);
		this.clipboardDialog.connectObject(
			'notify::opened',
			async () => {
				if (!this.clipboardDialog?.opened && this.updateHistory) {
					await this.entryTracker?.deleteOldest();
				}
			},
			'copy',
			async (_, entry) => {
				await this.clipboardManager?.copyEntry(entry);
				this.indicator?.showEntry(entry);
			},
			'paste',
			async (_, entry) => {
				await this.clipboardManager?.pasteEntry(entry);
				this.indicator?.showEntry(entry);
			},
			'clear-history',
			(_, history) => this.entryTracker?.clear(history),
			this,
		);

		// Top panel indicator
		this.indicator = new ClipboardIndicator(this);
		this.indicator.connectObject(
			'open-dialog',
			() => this.clipboardDialog?.open(),
			'clear-history',
			(_, history) => this.entryTracker?.clear(history),
			this,
		);

		// DBus Service
		this.dbus = new DbusService();
		this.dbus.connectObject(
			'toggle',
			() => this.clipboardDialog?.toggle(),
			'show',
			() => this.clipboardDialog?.open(),
			'hide',
			() => this.clipboardDialog?.close(),
			'clear-history',
			(_, history) => this.entryTracker?.clear(history === -1 ? null : history),
			this,
		);

		// Notifications
		this.notificationManager = new NotificationManager(this);

		// Shortcuts
		this.shortcutsManager = new ShortcutManager(this, this.clipboardDialog);
		this.shortcutsManager.connectObject(
			'open-clipboard-dialog',
			() => this.clipboardDialog?.dialogShortcut(),
			'toggle-incognito-mode',
			() => this.indicator?.toggleIncognito(),
			this,
		);

		// Database / JSON Storage
		this.entryTracker = new ClipboardEntryTracker(this);
		this.initEntryTracker().catch(error);
		this.initHistoryTimeout().catch(error);
		this.settings.connectObject(
			'changed::database-location',
			this.initEntryTracker.bind(this),
			'changed::history-time',
			this.initHistoryTimeout.bind(this),
			this,
		);

		// Clipboard Listener
		this.clipboardManager = new ClipboardManager(this, this.entryTracker);
		this.clipboardManager.connectObject(
			'clipboard',
			(_, entry) => {
				this.clipboardDialog?.addEntry(entry);
				this.indicator?.showEntry(entry);
				this.indicator?.animate();
				this.notificationManager?.notification(entry);
			},
			'text',
			(_, text) => {
				this.indicator?.showText(text);
				this.indicator?.animate();
				this.notificationManager?.textNotification(text);
			},
			'image',
			(_, image, width, height) => {
				this.indicator?.showImageBytes(image);
				this.indicator?.animate();
				this.notificationManager?.imageNotification(image, width, height);
			},
			this,
		);
	}

	claimShortcut() {
		try {
			const mine = this.settings.get_strv('open-clipboard-dialog-shortcut').map((b) => b.toLowerCase());
			const shell = new Gio.Settings({ schema_id: 'org.gnome.shell.keybindings' });
			const tray = shell.get_strv('toggle-message-tray');
			const conflicts = tray.filter((b) => mine.includes(b.toLowerCase()));
			if (conflicts.length === 0) return;
			this._savedTrayBindings = tray;
			shell.set_strv(
				'toggle-message-tray',
				tray.filter((b) => !conflicts.includes(b)),
			);
		} catch (e) {
			this.logger?.error('Failed to clear conflicting toggle-message-tray shortcut', e);
		}
	}

	restoreShortcut() {
		if (!this._savedTrayBindings) return;
		try {
			// Ripristina quanto tolto in enable(), senza toccare eventuali modifiche fatte nel frattempo dall'utente
			const shell = new Gio.Settings({ schema_id: 'org.gnome.shell.keybindings' });
			const current = shell.get_strv('toggle-message-tray');
			const restored = [...current, ...this._savedTrayBindings.filter((b) => !current.includes(b))];
			shell.set_strv('toggle-message-tray', restored);
		} catch (e) {
			this.logger?.error('Failed to restore toggle-message-tray shortcut', e);
		}
		this._savedTrayBindings = null;
	}

	async initEntryTracker() {
		if (!this.entryTracker || !this.entryTracker.shouldInit) return;
		this.clipboardDialog?.clearEntries();
		const entries = await this.entryTracker.init();
		for (const entry of entries) {
			this.clipboardDialog?.addEntry(entry);
		}
	}

	async initHistoryTimeout() {
		if (this.historyTimeoutId >= 0) GLib.source_remove(this.historyTimeoutId);
		const historyTime = this.settings?.get_int('history-time');
		if (historyTime === undefined || historyTime === 0) return;
		await this.entryTracker?.deleteOldest();
		this.historyTimeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 60, () => {
			this.updateHistory = this.clipboardDialog?.opened ?? false;
			if (this.updateHistory) return GLib.SOURCE_CONTINUE;
			if (this.entryTracker?.checkOldest()) {
				this.entryTracker?.deleteOldest().catch(this.logger.error.bind(this.logger));
			}
			return GLib.SOURCE_CONTINUE;
		});
	}

	disable() {
		// UI
		this.clipboardDialog?.disconnectObject(this);
		this.clipboardDialog?.destroy();
		this.indicator?.disconnectObject(this);
		this.indicator?.destroy();
		this.clipboardDialog = undefined;
		this.indicator = undefined;
		this.theme?.destroy();
		this.theme = undefined;

		// DBus
		this.dbus?.disconnectObject(this);
		this.dbus?.destroy();
		this.dbus = undefined;

		// Feedback
		this.notificationManager = undefined;

		// Shortcuts
		this.shortcutsManager?.disconnectObject(this);
		this.shortcutsManager?.destroy();
		this.shortcutsManager = undefined;

		// Database
		const error = this.logger?.error?.bind(this.logger) ?? console.error;
		this.entryTracker?.destroy().catch(error);
		this.entryTracker = undefined;
		if (this.historyTimeoutId >= 0) GLib.source_remove(this.historyTimeoutId);
		this.historyTimeoutId = -1;

		// Clipboard Manager
		this.clipboardManager?.disconnectObject(this);
		this.clipboardManager?.destroy();
		this.clipboardManager = undefined;

		// Rete e scorciatoie di sistema
		closeLinkSession();
		this.restoreShortcut();

		// Globals
		this.settings?.disconnectObject(this);
		this.settings = undefined;
		this.logger = undefined;
	}
}
