import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { __decorate } from '../../../thirdparty/tslib.js';
import { Tags } from '../../common/constants.js';
import { registerClass } from '../../common/gjs.js';

let TagButton = class TagButton extends St.Button {
	tag;

	constructor(tag) {
		super({
			style_class: `tag-button ${tag}`,
			y_align: Clutter.ActorAlign.FILL,
			x_align: Clutter.ActorAlign.FILL,
			x_expand: true,
			y_expand: true,
			toggle_mode: true,
			can_focus: true,
		});
		this.tag = tag;
		this.child = new St.Bin({
			style_class: 'inner',
			y_align: Clutter.ActorAlign.CENTER,
			x_align: Clutter.ActorAlign.CENTER,
			x_expand: true,
			y_expand: true,
			child: new St.Bin({
				style_class: 'tag',
				y_align: Clutter.ActorAlign.CENTER,
				x_align: Clutter.ActorAlign.CENTER,
			}),
		});
	}

	vfunc_key_press_event(event) {
		const key = event.get_key_symbol();
		if (key === Clutter.KEY_Left || key === Clutter.KEY_Right) {
			const direction = key === Clutter.KEY_Left ? St.DirectionType.LEFT : St.DirectionType.RIGHT;
			this.get_parent().navigate_focus(this, direction, true);
			return Clutter.EVENT_STOP;
		}
		return super.vfunc_key_press_event(event);
	}
};
TagButton = __decorate([registerClass()], TagButton);

let TagsItem = class TagsItem extends PopupMenu.PopupBaseMenuItem {
	_tag = null;
	_tagsBox;

	constructor() {
		super({
			style_class: 'tags-item',
			activate: false,
		});
		this.track_hover = false;

		this._tagsBox = new St.BoxLayout({
			style_class: 'tags-box',
			x_align: Clutter.ActorAlign.FILL,
			y_align: Clutter.ActorAlign.FILL,
			x_expand: true,
			y_expand: true,
		});
		this.actor.add_child(this._tagsBox);
		Tags.forEach((tag) => this.addTag(tag));

		// Riconoscimento tocco fluido per touchscreen: intercetta il tocco su tutta l'altezza della riga
		// e seleziona il colore più vicino senza "arrestare a metà l'input"
		this.actor.connect('captured-event', (_actor, event) => {
			const type = event.type();
			if (type === Clutter.EventType.TOUCH_BEGIN || type === Clutter.EventType.TOUCH_UPDATE) {
				const [x, y] = event.get_coords();
				const targetBtn = this._findClosestTagButton(x, y);
				for (const btn of this._tagsBox.get_children()) {
					if (btn === targetBtn) btn.add_style_pseudo_class('active');
					else btn.remove_style_pseudo_class('active');
				}
				return Clutter.EVENT_STOP;
			} else if (type === Clutter.EventType.TOUCH_END) {
				const [x, y] = event.get_coords();
				for (const btn of this._tagsBox.get_children()) {
					btn.remove_style_pseudo_class('active');
				}
				const targetBtn = this._findClosestTagButton(x, y);
				if (targetBtn) {
					this._selectTagButton(targetBtn);
				}
				return Clutter.EVENT_STOP;
			} else if (type === Clutter.EventType.TOUCH_CANCEL) {
				for (const btn of this._tagsBox.get_children()) {
					btn.remove_style_pseudo_class('active');
				}
			}
			return Clutter.EVENT_PROPAGATE;
		});
	}

	_findClosestTagButton(x, y) {
		const children = this._tagsBox.get_children();
		if (children.length === 0) return null;
		let closest = null;
		let minDistance = Infinity;
		for (const child of children) {
			if (!child.visible) continue;
			const [cx, cy] = child.get_transformed_position();
			const [cw, ch] = child.get_transformed_size();
			const midX = cx + cw / 2;
			const midY = cy + ch / 2;
			const dist = Math.hypot(x - midX, y - midY);
			if (dist < minDistance) {
				minDistance = dist;
				closest = child;
			}
		}
		return closest;
	}

	_selectTagButton(button) {
		const wasChecked = button.checked;
		for (const btn of this._tagsBox.get_children()) {
			btn.checked = btn === button && !wasChecked;
		}
		this._tag = !wasChecked ? button.tag : null;
		this.emit('tag-changed');
		this.notify('tag');
	}

	get tag() {
		return this._tag;
	}

	set tag(tag) {
		if (this._tag === tag) return;
		this._tag = tag;
		const index = tag ? Tags.indexOf(tag) : -1;
		for (const [i, btn] of this._tagsBox.get_children().entries()) {
			btn.checked = i === index;
		}
		this.notify('tag');
	}

	addTag(tag) {
		const button = new TagButton(tag);
		this._tagsBox.add_child(button);
		button.connect('clicked', () => {
			this._selectTagButton(button);
		});
	}

	vfunc_key_focus_in() {
		const index = this._tag ? Tags.indexOf(this._tag) : -1;
		const button = this._tagsBox.get_child_at_index(index) ?? this._tagsBox.first_child;
		button?.grab_key_focus();
	}
};
TagsItem = __decorate(
	[
		registerClass({
			Properties: {
				tag: GObject.ParamSpec.string('tag', null, null, GObject.ParamFlags.READWRITE, ''),
			},
			Signals: {
				'tag-changed': {},
			},
		}),
	],
	TagsItem,
);

export { TagsItem };
