import Clutter from 'gi://Clutter';
import St from 'gi://St';

import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { __decorate } from '../../../thirdparty/tslib.js';
import { ItemType, Tags } from '../../common/constants.js';
import { registerClass } from '../../common/gjs.js';
import { Shortcut } from '../../misc/shortcuts.js';
import { ActionPopupMenuSection } from './actionMenu.js';
import { EditDialog } from './editDialog.js';
import { ShortcutLabel } from './shortcutLabel.js';
import { TagsItem } from './tagsItem.js';

function canEdit(entry) {
	return entry.type === ItemType.Text || entry.type === ItemType.Code || entry.type === ItemType.Link;
}

let PopupMenuShortcutItem = class PopupMenuShortcutItem extends PopupMenu.PopupBaseMenuItem {
	ext;
	_shortcutLabel;

	constructor(ext, text, shortcut, iconName = null) {
		super();
		this.ext = ext;
		if (iconName) {
			const icon = new St.Icon({
				icon_name: iconName,
				icon_size: 14,
				y_align: Clutter.ActorAlign.CENTER,
			});
			this.add_child(icon);
		}
		const label = new St.Label({
			text,
			y_expand: true,
			y_align: Clutter.ActorAlign.CENTER,
		});
		this.add_child(label);
		if (shortcut) {
			this._shortcutLabel = new ShortcutLabel(this.ext.settings.get_strv(shortcut)[0] ?? '', {
				x_expand: true,
				y_expand: true,
				x_align: Clutter.ActorAlign.END,
				y_align: Clutter.ActorAlign.CENTER,
				opacity: 180,
			});
			this.add_child(this._shortcutLabel);
			this.ext.settings.connectObject(
				`changed::${shortcut}`,
				() => (this._shortcutLabel.shortcut = this.ext.settings.get_strv(shortcut)[0] ?? ''),
				this,
			);
		}

		// Supporto touch reattivo: attiva l'opzione senza interrompere l'input se il dito scivola leggermente
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

	destroy() {
		this.ext.settings.disconnectObject(this);
		super.destroy();
	}
};
PopupMenuShortcutItem = __decorate([registerClass()], PopupMenuShortcutItem);

export class ClipboardItemMenu extends PopupMenu.PopupMenu {
	ext;
	_entry = null;
	_tagsItem;
	_pinItem;
	_editSection;
	_actionMenuSection;
	_deleteItem;

	constructor(ext) {
		super(Main.layoutManager.dummyCursor, 0, St.Side.TOP);
		this.ext = ext;
		this.actor.add_style_class_name('clipboard-item-menu');
		this.actor.add_style_class_name('copious-menu');
		this.box.add_style_class_name('clipboard-item-menu-box');
		ext.theme?.register(this.actor);

		// Tags
		this._tagsItem = new TagsItem();
		this.addMenuItem(this._tagsItem);
		this._tagsItem.connect('tag-changed', () => this.close(BoxPointer.PopupAnimation.FADE));
		this._tagsItem.connect('notify::tag', () => {
			if (this._entry) {
				this._entry.tag = this._tagsItem.tag;
			}
		});
		this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

		// Pin Toggle (Fissa)
		this._pinItem = new PopupMenu.PopupSwitchMenuItem(_('Fissa'), false);
		this._pinItem.connect('toggled', (_item, state) => {
			if (this._entry) {
				this._entry.pinned = state;
			}
		});
		this._pinItem.actor.connect('touch-event', (_actor, event) => {
			const type = event.type();
			if (type === Clutter.EventType.TOUCH_BEGIN) {
				this._pinItem.actor.add_style_pseudo_class('active');
				return Clutter.EVENT_PROPAGATE;
			} else if (type === Clutter.EventType.TOUCH_END) {
				this._pinItem.actor.remove_style_pseudo_class('active');
				const [x, y] = event.get_coords();
				const [ix, iy] = this._pinItem.actor.get_transformed_position();
				const [iw, ih] = this._pinItem.actor.get_transformed_size();
				if (x >= ix - 10 && x <= ix + iw + 10 && y >= iy - 10 && y <= iy + ih + 10) {
					this._pinItem.toggle();
					return Clutter.EVENT_STOP;
				}
			} else if (type === Clutter.EventType.TOUCH_CANCEL) {
				this._pinItem.actor.remove_style_pseudo_class('active');
			}
			return Clutter.EVENT_PROPAGATE;
		});
		this.addMenuItem(this._pinItem);

		// Edit
		this._editSection = new PopupMenu.PopupMenuSection();
		this.addMenuItem(this._editSection);
		const menuItem = new PopupMenuShortcutItem(ext, _('Modifica'), Shortcut.Edit, 'document-edit-symbolic');
		menuItem.connect('activate', () => {
			if (this._entry) this.edit(this._entry);
		});
		this._editSection.addMenuItem(menuItem);

		// Action menu
		this._actionMenuSection = new ActionPopupMenuSection(ext);
		this.addMenuItem(this._actionMenuSection);
		this._actionMenuSection.connectObject(
			'activate',
			(_menu, e) => this.emit('activate', e),
			'copy',
			(_menu, s) => this.emit('copy', s),
			'paste',
			(_menu, s) => this.emit('paste', s),
			this,
		);

		this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

		// Delete
		this._deleteItem = new PopupMenuShortcutItem(ext, _('Elimina'), Shortcut.Delete, 'edit-delete-symbolic');
		this._deleteItem.actor.add_style_class_name('delete-menu-item');
		this._deleteItem.connect('activate', () => {
			if (this._entry) {
				this._entry.emit('delete');
				this.close(BoxPointer.PopupAnimation.FADE);
			}
		});
		this.addMenuItem(this._deleteItem);

		// Add to ui
		Main.layoutManager.uiGroup.add_child(this.actor);
		this.actor.hide();
		this.actor.connect('captured-event', (_actor, event) => {
			if (event.type() === Clutter.EventType.KEY_PRESS) {
				const key = event.get_key_symbol();

				// Select tag with number
				if (key === Clutter.KEY_0) {
					this._tagsItem.tag = null;
					this.close(BoxPointer.PopupAnimation.FADE);
					return;
				}
				if (key >= Clutter.KEY_1 && key <= Clutter.KEY_9) {
					let tag = Tags[key - Clutter.KEY_1] ?? null;
					tag = this._tagsItem.tag === tag ? null : tag;
					this._tagsItem.tag = tag;
					this.close(BoxPointer.PopupAnimation.FADE);
					return;
				}

				// Allow action menu to be closed with the action menu shortcut
				const action = ext.shortcutsManager?.getShortcutForKeyBinding(key, event.get_state());
				if (action === Shortcut.Menu) {
					this.close(BoxPointer.PopupAnimation.FADE);
				}
			}
		});
	}

	/**
	 * Voci che modificano solo lo stato dell'elemento (es. "Fissa"): attivarle non deve chiudere il cassetto.
	 */
	isPassiveItem(item) {
		return item === this._pinItem || item === this._tagsItem;
	}

	set arrowAlignment(alignment) {
		this._arrowAlignment = alignment;
	}

	set entry(entry) {
		this._entry = entry;
		this._actionMenuSection.entry = entry;
		this._tagsItem.tag = entry.tag;
		this._pinItem.setToggleState(entry.pinned);
		this._editSection.actor.visible = canEdit(entry);
	}

	edit(entry) {
		if (canEdit(entry)) {
			const editDialog = new EditDialog(this.ext, entry);
			editDialog.open();
		}
	}

	activateDefaultAction(entry) {
		return this._actionMenuSection.activateDefaultAction(entry);
	}

	activateAction(entry, id) {
		return this._actionMenuSection.activateAction(entry, id);
	}
}
