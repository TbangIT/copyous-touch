import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';

import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { __decorate } from '../../../thirdparty/tslib.js';
import {
	ActionOutput,
	findActionById,
	findDefaultAction,
	instanceofAction,
	instanceofActionSubmenu,
	instanceofColorAction,
	instanceofCommandAction,
	isDefaultAction,
	loadConfig,
	matchAction,
	testAction,
} from '../../common/actions.js';
import { Color } from '../../common/color.js';
import { getActionsConfigPath } from '../../common/constants.js';
import { registerClass } from '../../common/gjs.js';
import { trim } from './label.js';
import { ShortcutLabel } from './shortcutLabel.js';

Gio._promisify(Gio.Subprocess.prototype, 'wait_async');
Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async');
let ActionSubmenuMenuItem = class ActionSubmenuMenuItem extends PopupMenu.PopupSubMenuMenuItem {
	menuActions;

	constructor(action) {
		super(action.name);
		this.menu.actor.add_style_class_name('clipboard-action-submenu');
		this.menu.box.add_style_class_name('popup-sub-menu'); // Workaround for bad animation
		this.menuActions = action.actions.map((a) => new ActionMenuItem(a));
		for (const a of this.menuActions) {
			this.menu.addMenuItem(a);
			a.connect('run', (_action, act) => this.emit('run', act));
		}
		this.menu.connectObject('activate', () => this.emit('activate', Clutter.get_current_event()), this);
	}

	update(config, entry) {
		this.visible = this.menuActions.map((a) => a.update(config, entry)).some((v) => v);
		return this.visible;
	}
};
ActionSubmenuMenuItem = __decorate(
	[
		registerClass({
			Signals: {
				run: { param_types: [GObject.TYPE_JSOBJECT] },
			},
		}),
	],
	ActionSubmenuMenuItem,
);
let ActionMenuItem = class ActionMenuItem extends PopupMenu.PopupMenuItem {
	action;
	_shortcutLabel;

	constructor(action) {
		super(action.name);
		this.action = action;
		this.set_child_above_sibling(this._ornamentIcon, this.label);
		this._ornamentIcon.x_align = Clutter.ActorAlign.END;
		this._ornamentIcon.x_expand = true;
		this._shortcutLabel = new ShortcutLabel(action.shortcut?.[0] ?? '', {
			x_expand: true,
			y_expand: true,
			x_align: Clutter.ActorAlign.END,
			y_align: Clutter.ActorAlign.CENTER,
			opacity: 180,
		});
		this.add_child(this._shortcutLabel);

		this.actor.connect('touch-event', (_actor, event) => {
			const type = event.type();
			if (type === Clutter.EventType.TOUCH_BEGIN) {
				this.actor.add_style_pseudo_class('active');
				return Clutter.EVENT_PROPAGATE;
			} else if (type === Clutter.EventType.TOUCH_END) {
				this.actor.remove_style_pseudo_class('active');
				const [x, y] = event.get_coords();
				const [ix, iy] = this.actor.get_transformed_position();
				const [iw, ih] = this.actor.get_transformed_size();
				if (x >= ix - 10 && x <= ix + iw + 10 && y >= iy - 10 && y <= iy + ih + 10) {
					this.activate(event);
					return Clutter.EVENT_STOP;
				}
			} else if (type === Clutter.EventType.TOUCH_CANCEL) {
				this.actor.remove_style_pseudo_class('active');
			}
			return Clutter.EVENT_PROPAGATE;
		});
	}

	on_activate() {
		this.emit('run', this.action);
	}

	update(config, entry) {
		const defaultAction = isDefaultAction(config, entry, this.action);
		this.setOrnament(defaultAction ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.HIDDEN);
		this._shortcutLabel.visible = !defaultAction;
		this.visible = testAction(entry, this.action);
		return this.visible;
	}
};
ActionMenuItem = __decorate(
	[
		registerClass({
			Signals: {
				run: { param_types: [GObject.TYPE_JSOBJECT] },
			},
		}),
	],
	ActionMenuItem,
);

export class ActionPopupMenuSection extends PopupMenu.PopupMenuSection {
	ext;
	_config;
	_entry = null;
	_menuActions;
	_monitor;
	_tokens = [];

	constructor(ext) {
		super();
		this.ext = ext;
		this._config = { actions: [] };
		this._menuActions = [];
		this._monitor = getActionsConfigPath(ext).monitor(Gio.FileMonitorFlags.NONE, null);
		this._monitor.connect('changed', async (_source, _file, _otherFile, eventType) => {
			if (eventType === Gio.FileMonitorEvent.CHANGES_DONE_HINT) {
				await this.updateActions();
			}
		});
		this.updateActions(true).catch(() => {});
	}

	set entry(entry) {
		this._menuActions.forEach((a) => a.update(this._config, entry));
		this._entry = entry;
	}

	async updateActions(save = false) {
		this._config = await loadConfig(this.ext, save);
		this._menuActions.forEach((a) => a.destroy());
		this._menuActions = this._config.actions
			.map((a) => {
				if (instanceofAction(a)) {
					return new ActionMenuItem(a);
				} else if (instanceofActionSubmenu(a)) {
					return new ActionSubmenuMenuItem(a);
				} else return null;
			})
			.filter((a) => a !== null);
		for (const action of this._menuActions) {
			this.addMenuItem(action);
			action.connect('run', async (_action, a) => {
				if (this._entry) await this.run(this._entry, a);
			});
		}
		this.emit('actions-changed');
	}

	activateDefaultAction(entry) {
		const defaultAction = findDefaultAction(this._config, entry);
		if (!defaultAction) return false;
		if (!testAction(entry, defaultAction)) return false;
		const logger = this.ext.logger;
		this.run(entry, defaultAction).catch(logger.error.bind(logger));
		return true;
	}

	activateAction(entry, id) {
		const action = findActionById(this._config, id);
		if (!action) return false;
		if (!testAction(entry, action)) return false;
		const logger = this.ext.logger;
		this.run(entry, action).catch(logger.error.bind(logger));
		return true;
	}

	async run(entry, action) {
		if (instanceofCommandAction(action)) await this.runCommandAction(entry, action);
		else if (instanceofColorAction(action)) this.runColorAction(entry, action);
	}

	async runCommandAction(entry, action) {
		const match = matchAction(entry, action)?.map((x) => x ?? '');
		if (!match) return;

		// Timeout after 30 seconds
		const token = new Gio.Cancellable();
		this._tokens.push(token);
		let timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_HIGH, 30, () => {
			timeoutId = -1;
			token.cancel();
			return GLib.SOURCE_REMOVE;
		});
		token.connect(() => {
			if (timeoutId >= 0) GLib.source_remove(timeoutId);
			const i = this._tokens.indexOf(token);
			if (i >= 0) this._tokens.splice(i, 1);
		});
		try {
			const flags =
				Gio.SubprocessFlags.STDIN_PIPE | Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE;
			const process = Gio.Subprocess.new(['sh', '-c', action.command, '_', ...match.slice(1)], flags);

			// Wait for the command to complete and handle the output
			const [stdout, stderr] = await process.communicate_utf8_async(entry.content, token);
			if (process.get_successful()) {
				const output = trim(stdout);
				if (output.length === 0) return;
				switch (action.output) {
					case ActionOutput.Copy:
						this.emit('copy', output);
						break;
					case ActionOutput.Paste:
						this.emit('paste', output);
						break;
				}
			} else {
				this.ext.logger.error(stderr);
			}
		} catch (e) {
			this.ext.logger.error(e);
		} finally {
			token.cancel();
		}
	}

	runColorAction(entry, action) {
		if (!testAction(entry, action)) return;
		const color = Color.parse(entry.content.trim());
		if (!color) return;
		const converted = color.toColor(action.space);
		switch (action.output) {
			case ActionOutput.Copy:
				this.emit('copy', converted.toString());
				break;
			case ActionOutput.Paste:
				this.emit('paste', converted.toString());
				break;
		}
	}

	destroy() {
		this._tokens.forEach((t) => t.cancel());
		this._monitor.cancel();
		super.destroy();
	}
}
