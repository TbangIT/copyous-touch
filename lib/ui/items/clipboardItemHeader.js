import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import { __decorate } from '../../../thirdparty/tslib.js';
import { ActiveState } from '../../common/constants.js';
import { enumParamSpec, flagsParamSpec, registerClass } from '../../common/gjs.js';
import { Icon, loadIcon } from '../../common/icons.js';
import { HeaderControlsVisibility } from '../../common/settings.js';

let ClipboardItemHeader = class ClipboardItemHeader extends St.BoxLayout {
	_pinned = false;
	_headerVisible = true;
	_controlsVisibility = HeaderControlsVisibility.Visible;
	_tag = null;
	_active = ActiveState.None;
	_customTitle = '';
	_defaultTitle = '';
	_isEditing = false;
	_headerIcon;
	_headerContent;
	_headerTitle;
	_titleEntry = null;
	_typeBadge;
	buttons;
	_menuButton;
	_pinnedIndicator;
	_tagIcon;
	_clickCount = 0;
	_lastClickTime = 0;

	constructor(ext, icon, title) {
		super({
			style_class: 'clipboard-item-header',
			y_align: Clutter.ActorAlign.START,
			x_expand: true,
			y_expand: false,
		});
		this._defaultTitle = title;
		this._headerIcon = new St.Icon({
			style_class: 'clipboard-item-header-icon',
			gicon: loadIcon(ext, icon),
			y_align: Clutter.ActorAlign.CENTER,
		});
		this.add_child(this._headerIcon);
		this._headerContent = new St.BoxLayout({
			style_class: 'clipboard-item-header-content',
			y_align: Clutter.ActorAlign.CENTER,
			x_expand: true,
		});
		this.add_child(this._headerContent);

		this._headerTitle = new St.Label({
			style_class: 'clipboard-item-title',
			text: title,
			y_align: Clutter.ActorAlign.CENTER,
			min_width: 0,
			reactive: true,
		});
		this._headerTitle.clutter_text.ellipsize = Pango.EllipsizeMode.END;
		this._headerContent.add_child(this._headerTitle);

		// Handle double-click on title for inline editing
		this._headerTitle.connect('button-press-event', (_actor, event) => {
			if (event.get_button() !== Clutter.BUTTON_PRIMARY) return Clutter.EVENT_PROPAGATE;
			const currentTime = event.get_time();
			const doubleClickTime = Clutter.Settings.get_default()?.double_click_time ?? 400;
			if (currentTime - this._lastClickTime < doubleClickTime) {
				this._clickCount++;
				if (this._clickCount >= 2) {
					this._clickCount = 0;
					this.startEditing();
				}
			} else {
				this._clickCount = 1;
			}
			this._lastClickTime = currentTime;
			return Clutter.EVENT_STOP;
		});
		this._headerTitle.connect('button-release-event', (_actor, event) => {
			if (event.get_button() !== Clutter.BUTTON_PRIMARY) return Clutter.EVENT_PROPAGATE;
			return Clutter.EVENT_STOP;
		});

		// Type badge in header
		this._typeBadge = new St.Label({
			style_class: 'clipboard-item-type-badge',
			text: '',
			y_align: Clutter.ActorAlign.CENTER,
			visible: false,
		});
		this._headerContent.add_child(this._typeBadge);

		// Header buttons container
		this.buttons = new St.BoxLayout({
			style_class: 'clipboard-item-header-buttons',
			x_align: Clutter.ActorAlign.END,
			y_align: Clutter.ActorAlign.CENTER,
		});
		this.add_child(this.buttons);

		// Pinned indicator (icon only)
		this._pinnedIndicator = new St.Icon({
			style_class: 'clipboard-item-pinned-indicator',
			gicon: loadIcon(ext, Icon.Pin),
			icon_size: 13,
			y_align: Clutter.ActorAlign.CENTER,
			visible: false,
		});
		this.buttons.add_child(this._pinnedIndicator);

		// Tag icon
		this._tagIcon = new St.Bin({
			style_class: 'clipboard-item-tag-button',
			y_align: Clutter.ActorAlign.CENTER,
			visible: false,
			child: new St.Icon({ gicon: loadIcon(ext, Icon.Tag), icon_size: 14 }),
		});
		this.buttons.add_child(this._tagIcon);

		// 3-dots Menu button
		this._menuButton = new St.Button({
			style_class: 'clipboard-item-header-button menu-button',
			y_align: Clutter.ActorAlign.CENTER,
			child: new St.Icon({ gicon: loadIcon(ext, Icon.ViewMore), icon_size: 16 }),
		});
		this._menuButton.connect('clicked', () => {
			this._menuButton.fake_release();
			this._menuButton.remove_style_pseudo_class('active');
			this._menuButton.remove_style_pseudo_class('hover');
			this._menuButton.sync_hover();
			const box = this._menuButton.get_transformed_extents();
			this.emit('open-menu', box.get_x(), box.get_y(), box.get_width(), box.get_height());
		});
		this.buttons.add_child(this._menuButton);
	}

	checkMenuButtonTouch(x, y, cardActor = null) {
		if (!this._menuButton?.visible) return false;
		const [bx, by] = this._menuButton.get_transformed_position();
		const [bw, bh] = this._menuButton.get_transformed_size();
		if (bw <= 0 || bh <= 0) return false;

		const parent = cardActor ?? this.get_parent();
		let ix = bx - 14;
		let iy = by - 14;
		let iw = bw + 28;
		let ih = bh + 28;
		if (parent && typeof parent.get_transformed_position === 'function') {
			const [px, py] = parent.get_transformed_position();
			const [pw, ph] = parent.get_transformed_size();
			ix = px;
			iy = py;
			iw = pw;
			ih = ph;
		}

		// Espande l'area touch attorno al centro del pulsante (zoom figura touch)
		// mantenendola rigorosamente entro i bordi del tab.
		const pad = 14;
		const minX = Math.max(ix, bx - pad);
		const maxX = Math.min(ix + iw, bx + bw + pad);
		const minY = Math.max(iy, by - pad);
		const maxY = Math.min(iy + ih, by + bh + pad);

		if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
			this._menuButton.fake_release();
			this._menuButton.remove_style_pseudo_class('active');
			this._menuButton.remove_style_pseudo_class('hover');
			this._menuButton.sync_hover();
			const box = this._menuButton.get_transformed_extents();
			this.emit('open-menu', box.get_x(), box.get_y(), box.get_width(), box.get_height());
			return true;
		}
		return false;
	}

	get isEditing() {
		return this._isEditing;
	}

	get pinned() {
		return this._pinned;
	}

	set pinned(pinned) {
		if (this._pinned === Boolean(pinned)) return;
		this._pinned = Boolean(pinned);
		this.updateHeaderControls();
		this.notify('pinned');
	}

	get typeName() {
		return this._typeBadge.text;
	}

	set typeName(text) {
		this._typeBadge.text = text ?? '';
		this.updateTitleDisplay();
		this.notify('type-name');
	}

	get headerVisible() {
		return this._headerVisible;
	}

	set headerVisible(headerVisible) {
		if (this._headerVisible === headerVisible) return;
		this._headerVisible = headerVisible;
		this.notify('header-visible');
		this.y_expand = !headerVisible;
		this._headerIcon.opacity = headerVisible ? 255 : 0;
		this._headerContent.opacity = headerVisible ? 255 : 0;
	}

	get showTitle() {
		return this._headerTitle.visible;
	}

	set showTitle(showTitle) {
		this._headerTitle.visible = showTitle;
		this.notify('show-title');
	}

	get controlsVisibility() {
		return this._controlsVisibility;
	}

	set controlsVisibility(controlsVisibility) {
		this._controlsVisibility = controlsVisibility;
		this.updateHeaderControls();
		this.notify('controls-visibility');
	}

	get tag() {
		return this._tag;
	}

	set tag(tag) {
		if (this._tag === tag) return;
		this._tag = tag;
		this.notify('tag');
		this.style_class = 'clipboard-item-header' + (tag ? ` ${tag}` : '');
		this.updateHeaderControls();
	}

	get active() {
		return this._active;
	}

	set active(active) {
		this._active = active;
		this.updateHeaderControls();
		this.notify('active');
	}

	get customTitle() {
		return this._customTitle;
	}

	set customTitle(customTitle) {
		if (this._customTitle === customTitle) return;
		this._customTitle = customTitle;
		this.updateTitleDisplay();
		this.notify('custom-title');
	}

	get defaultTitle() {
		return this._defaultTitle;
	}

	set defaultTitle(defaultTitle) {
		if (this._defaultTitle === defaultTitle) return;
		this._defaultTitle = defaultTitle;
		this.updateTitleDisplay();
		this.notify('default-title');
	}

	startEditing() {
		if (this._isEditing) return;
		this._isEditing = true;
		this.updateHeaderControls();
		this.updateTitleDisplay();

		this._titleEntry = new St.Entry({
			style_class: 'clipboard-item-title-entry',
			text: this._customTitle || this._defaultTitle,
			y_align: Clutter.ActorAlign.CENTER,
		});

		this._titleEntry.clutter_text.set_selection(0, -1);
		this._titleEntry.clutter_text.connect('key-press-event', (_text, event) => {
			const key = event.get_key_symbol();
			if (key === Clutter.KEY_Return || key === Clutter.KEY_KP_Enter) {
				this.finishEditing(true);
				return Clutter.EVENT_STOP;
			} else if (key === Clutter.KEY_Escape) {
				this.finishEditing(false);
				return Clutter.EVENT_STOP;
			}
			return Clutter.EVENT_PROPAGATE;
		});
		this._titleEntry.clutter_text.connect('key-focus-out', () => {
			if (this._isEditing) {
				this.finishEditing(true);
			}
		});

		this._headerContent.insert_child_below(this._titleEntry, this._typeBadge);
		this._titleEntry.grab_key_focus();
	}

	finishEditing(save) {
		if (!this._isEditing || !this._titleEntry) return;
		this._isEditing = false;
		this.updateHeaderControls();
		this.updateTitleDisplay();

		const entry = this._titleEntry;
		this._titleEntry = null;
		if (save) {
			const newTitle = entry.text.trim();
			if (newTitle === '' || newTitle === this._defaultTitle) {
				this.customTitle = '';
			} else {
				this.customTitle = newTitle;
			}
		}

		this._headerContent.remove_child(entry);
		this.emit('editing-finished');
	}

	updateTitleDisplay() {
		if (this._isEditing) {
			this._headerTitle.hide();
			this._typeBadge.hide();
		} else {
			this._headerTitle.show();
			this._headerTitle.text = this.customTitle || this._defaultTitle;
			this._typeBadge.visible = !this.customTitle && Boolean(this._typeBadge.text);
		}
	}

	updateHeaderControls() {
		let visible = true;
		if (this._isEditing) {
			visible = false;
		} else if (this._controlsVisibility === HeaderControlsVisibility.Hidden) {
			visible = false;
		}
		this._menuButton.visible = visible;
		this._pinnedIndicator.visible = this._pinned;
		this._tagIcon.visible = this._tag !== null;
	}
};

ClipboardItemHeader = __decorate(
	[
		registerClass({
			Properties: {
				'pinned': GObject.ParamSpec.boolean('pinned', null, null, GObject.ParamFlags.READWRITE, false),
				'type-name': GObject.ParamSpec.string('type-name', null, null, GObject.ParamFlags.READWRITE, ''),
				'header-visible': GObject.ParamSpec.boolean(
					'header-visible',
					null,
					null,
					GObject.ParamFlags.READWRITE,
					true,
				),
				'show-title': GObject.ParamSpec.boolean('show-title', null, null, GObject.ParamFlags.READWRITE, true),
				'controls-visibility': enumParamSpec(
					'controls-visibility',
					GObject.ParamFlags.READWRITE,
					HeaderControlsVisibility,
					HeaderControlsVisibility.Visible,
				),
				'tag': GObject.ParamSpec.string('tag', null, null, GObject.ParamFlags.READWRITE, ''),
				'active': flagsParamSpec('active', GObject.ParamFlags.READWRITE, ActiveState, ActiveState.None),
				'custom-title': GObject.ParamSpec.string('custom-title', null, null, GObject.ParamFlags.READWRITE, ''),
				'default-title': GObject.ParamSpec.string(
					'default-title',
					null,
					null,
					GObject.ParamFlags.READWRITE,
					'',
				),
			},
			Signals: {
				'open-menu': {
					param_types: [GObject.TYPE_INT, GObject.TYPE_INT, GObject.TYPE_INT, GObject.TYPE_INT],
				},
				'editing-finished': {},
			},
		}),
	],
	ClipboardItemHeader,
);

export { ClipboardItemHeader };
