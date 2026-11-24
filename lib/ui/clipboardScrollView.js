import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import { __decorate } from '../../thirdparty/tslib.js';
import { enumParamSpec, registerClass } from '../common/gjs.js';
import { get_first_visible_child, get_last_visible_child } from '../misc/actor.js';
import { ClipboardScrollContainer } from './clipboardScrollContainer.js';

let ClipboardScrollView = class ClipboardScrollView extends St.ScrollView {
	ext;
	_orientation = Clutter.Orientation.HORIZONTAL;
	_itemWidth = 0;
	_itemHeight = 0;
	_scrollContainer;
	_fade;

	// Touch gesture tracking
	_touchActive = false;
	_isSwiping = false;
	_touchSlot = null;
	_touchSequence = null;
	_touchStartX = 0;
	_touchStartY = 0;
	_touchLastX = 0;
	_touchLastY = 0;
	_touchLastTime = 0;
	_touchVelocity = 0;
	_startAdj = 0;
	_longPressTimer = 0;
	_longPressed = false;
	_touchDismissedMenu = false;
	_touchedItem = null;

	constructor(ext) {
		const fade = new St.ScrollViewFade({
			fade_margins: new Clutter.Margin({ top: 0, bottom: 0, left: 12, right: 12 }),
		});
		super({
			style_class: 'clipboard-scroll-view',
			hscrollbar_policy: St.PolicyType.AUTOMATIC,
			vscrollbar_policy: St.PolicyType.NEVER,
			overlay_scrollbars: true,
			min_height: 0,
			effect: fade,
		});
		this._fade = fade;
		this.ext = ext;
		this._scrollContainer = new ClipboardScrollContainer(ext);
		this.set_child(this._scrollContainer);
		this.connect('notify::width', this.scrollbarWorkaround.bind(this));
		this._scrollContainer.connect('notify::width', this.scrollbarWorkaround.bind(this));

		// Touch swipe & gesture support
		this.connect('captured-event', this._onCapturedTouch.bind(this));

		// Connect properties
		this.ext.settings.connectObject(
			'changed::show-scrollbar',
			this.updateScrollbar.bind(this),
			'changed::item-width',
			this.updateSize.bind(this),
			'changed::item-height',
			this.updateSize.bind(this),
			this,
		);
		this.updateSize();
		this.updateScrollbar();
		this.bind_property('orientation', this._scrollContainer, 'orientation', GObject.BindingFlags.SYNC_CREATE);
	}

	get orientation() {
		return this._orientation;
	}

	set orientation(value) {
		if (this._orientation === value) return;
		this._orientation = value;
		// Dissolvenza solo sull'asse di scorrimento: niente sfumatura inutile sul bordo superiore/inferiore
		const horizontal = value === Clutter.Orientation.HORIZONTAL;
		this._fade.fade_margins = new Clutter.Margin({
			top: horizontal ? 0 : 12,
			bottom: horizontal ? 0 : 12,
			left: horizontal ? 12 : 0,
			right: horizontal ? 12 : 0,
		});
		this.notify('orientation');
		this.updateScrollbar();
	}

	addItem(item) {
		this._scrollContainer.addItem(item);
	}

	clearItems() {
		this._scrollContainer.clearItems();
	}

	selectItem(index) {
		return this._scrollContainer.selectItem(index);
	}

	selectNextItem() {
		this._scrollContainer.selectNextItem();
	}

	search(query) {
		this._scrollContainer.search(query);
	}

	activateFirst() {
		this._scrollContainer.activateFirst();
	}

	updateSize() {
		this._itemWidth = this.ext.settings.get_int('item-width');
		this._itemHeight = this.ext.settings.get_int('item-height');
	}

	updateScrollbar() {
		const show = this.ext.settings.get_boolean('show-scrollbar');
		if (!show) {
			this.vscrollbarPolicy = St.PolicyType.NEVER;
			this.hscrollbarPolicy = St.PolicyType.NEVER;
		} else if (this._orientation === Clutter.Orientation.HORIZONTAL) {
			this.vscrollbarPolicy = St.PolicyType.NEVER;
			this.hscrollbarPolicy = St.PolicyType.AUTOMATIC;
		} else {
			this.vscrollbarPolicy = St.PolicyType.AUTOMATIC;
			this.hscrollbarPolicy = St.PolicyType.NEVER;
		}
	}

	scrollbarWorkaround() {
		const show = this.ext.settings.get_boolean('show-scrollbar');
		if (show && this.orientation === Clutter.Orientation.HORIZONTAL) {
			if (this.allocation.get_width() > this._scrollContainer.allocation.get_width()) {
				this.hscrollbarPolicy = St.PolicyType.EXTERNAL;
			} else {
				this.hscrollbarPolicy = St.PolicyType.AUTOMATIC;
			}
		}
	}

	_getAdjustment() {
		return this._orientation === Clutter.Orientation.HORIZONTAL
			? this.hadjustment
			: this.vadjustment;
	}

	_findItemAt(x, y) {
		// Percorso ultra-rapido: scene graph picking di Clutter a livello di stage (O(1))
		let actor = global.stage.get_actor_at_pos(Clutter.PickMode.ALL, x, y);
		while (actor) {
			if (actor.get_parent() === this._scrollContainer) {
				return typeof actor.handleTouchTap === 'function' ? actor : null;
			}
			actor = actor.get_parent();
		}

		// Fallback con bounding box esatto
		for (const child of this._scrollContainer.get_children()) {
			if (child.visible && typeof child.handleTouchTap === 'function' && typeof child.get_transformed_position === 'function') {
				const [cx, cy] = child.get_transformed_position();
				const [cw, ch] = child.get_transformed_size();
				if (x >= cx && x <= cx + cw && y >= cy && y <= cy + ch) {
					return child;
				}
			}
		}

		// Tolleranza per tocchi nello spazio vuoto (gap di 6px) tra le schede
		const pad = 6;
		for (const child of this._scrollContainer.get_children()) {
			if (child.visible && typeof child.handleTouchTap === 'function' && typeof child.get_transformed_position === 'function') {
				const [cx, cy] = child.get_transformed_position();
				const [cw, ch] = child.get_transformed_size();
				if (x >= cx - pad && x <= cx + cw + pad && y >= cy - pad && y <= cy + ch + pad) {
					return child;
				}
			}
		}
		return null;
	}

	_clearTouchStates() {
		if (this._touchedItem) {
			const item = this._touchedItem;
			this._touchedItem = null;
			if (typeof item.fake_release === 'function') item.fake_release();
			if (typeof item.remove_style_pseudo_class === 'function') {
				item.remove_style_pseudo_class('active');
				item.remove_style_pseudo_class('hover');
			}
			if (typeof item.sync_hover === 'function') item.sync_hover();
			if (typeof item.notify === 'function') item.notify('active');
			const menuBtn = item._header?._menuButton;
			if (menuBtn) {
				if (typeof menuBtn.fake_release === 'function') menuBtn.fake_release();
				if (typeof menuBtn.remove_style_pseudo_class === 'function') {
					menuBtn.remove_style_pseudo_class('active');
					menuBtn.remove_style_pseudo_class('hover');
				}
				if (typeof menuBtn.sync_hover === 'function') menuBtn.sync_hover();
			}
		}
	}

	_resetAllItemStates() {
		this._clearTouchStates();
		for (const child of this._scrollContainer.get_children()) {
			if (typeof child.fake_release === 'function') child.fake_release();
			if (typeof child.remove_style_pseudo_class === 'function') {
				child.remove_style_pseudo_class('active');
				child.remove_style_pseudo_class('hover');
			}
			if (typeof child.sync_hover === 'function') child.sync_hover();
			if (typeof child.notify === 'function') child.notify('active');
			const menuBtn = child._header?._menuButton;
			if (menuBtn) {
				if (typeof menuBtn.fake_release === 'function') menuBtn.fake_release();
				if (typeof menuBtn.remove_style_pseudo_class === 'function') {
					menuBtn.remove_style_pseudo_class('active');
					menuBtn.remove_style_pseudo_class('hover');
				}
				if (typeof menuBtn.sync_hover === 'function') menuBtn.sync_hover();
			}
		}
	}

	_onCapturedTouch(actor, event) {
		const type = event.type();

		if (type === Clutter.EventType.TOUCH_BEGIN) {
			this._clearTouchStates();
			if (this._longPressTimer) {
				GLib.source_remove(this._longPressTimer);
				this._longPressTimer = 0;
			}
			const menuWasOpen = Boolean(this.ext.clipboardDialog?._clipboardItemMenu?.isOpen);
			if (menuWasOpen) {
				this.ext.clipboardDialog._clipboardItemMenu.close(BoxPointer.PopupAnimation.NONE);
				this._touchDismissedMenu = true;
			} else {
				this._touchDismissedMenu = false;
			}

			const [x, y] = event.get_coords();
			const seq = (typeof event.get_event_sequence === 'function') ? event.get_event_sequence() : null;
			this._touchSlot = seq?.get_slot?.() ?? 0;
			this._touchSequence = seq;
			this._touchStartX = x;
			this._touchStartY = y;
			this._touchLastX = x;
			this._touchLastY = y;
			const now = GLib.get_monotonic_time();
			this._touchLastTime = now;
			const startPos = this._orientation === Clutter.Orientation.HORIZONTAL ? x : y;
			this._touchHistory = [{ pos: startPos, time: now }];
			this._isSwiping = false;
			this._touchActive = true;
			this._longPressed = false;

			const adj = this._getAdjustment();
			this._startAdj = adj.value;
			adj.remove_transition('value');

			// Evidenzia la scheda toccata per feedback visivo istantaneo
			if (!this._touchDismissedMenu) {
				const item = this._findItemAt(x, y);
				if (item && !item._header?.isEditing) {
					this._touchedItem = item;
					item.add_style_pseudo_class('active');
					item.notify('active');
				}
			}

			// Rilevamento pressione prolungata (600ms) per aprire il menu contestuale su touch
			this._longPressTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 600, () => {
				this._longPressTimer = 0;
				if (!this._isSwiping && this._touchActive && !this.ext.clipboardDialog?._clipboardItemMenu?.isOpen) {
					const item = this._findItemAt(this._touchStartX, this._touchStartY);
					if (item && typeof item.emit === 'function') {
						this._clearTouchStates();
						item.emit('open-menu', Math.round(this._touchStartX), Math.round(this._touchStartY), 0, 0);
						this._longPressed = true;
					}
				}
				return GLib.SOURCE_REMOVE;
			});
			return Clutter.EVENT_PROPAGATE;
		}

		if (type === Clutter.EventType.TOUCH_UPDATE) {
			if (!this._touchActive) return Clutter.EVENT_PROPAGATE;
			const seq = (typeof event.get_event_sequence === 'function') ? event.get_event_sequence() : null;
			const slot = seq?.get_slot?.() ?? 0;
			if (this._touchSlot !== null && slot !== this._touchSlot) {
				return Clutter.EVENT_PROPAGATE;
			}
			const [x, y] = event.get_coords();
			const dx = x - this._touchStartX;
			const dy = y - this._touchStartY;
			const delta = this._orientation === Clutter.Orientation.HORIZONTAL ? dx : dy;

			if (!this._isSwiping && Math.abs(delta) > 8) {
				this._isSwiping = true;
				if (this._longPressTimer) {
					GLib.source_remove(this._longPressTimer);
					this._longPressTimer = 0;
				}
				this._clearTouchStates();
			}

			if (this._isSwiping) {
				const now = GLib.get_monotonic_time();
				const currentPos = this._orientation === Clutter.Orientation.HORIZONTAL ? x : y;
				this._touchHistory.push({ pos: currentPos, time: now });
				// Finestra mobile degli ultimi 120ms per calcolare l'inerzia
				const cutoff = now - 120000;
				while (this._touchHistory.length > 2 && this._touchHistory[0].time < cutoff) {
					this._touchHistory.shift();
				}

				this._touchLastX = x;
				this._touchLastY = y;
				this._touchLastTime = now;

				const adj = this._getAdjustment();
				const target = this._startAdj - delta;
				const maxVal = Math.max(adj.lower, adj.upper - adj.page_size);
				adj.value = Math.clamp(target, adj.lower, maxVal);
				return Clutter.EVENT_STOP;
			}
			return Clutter.EVENT_PROPAGATE;
		}

		if (type === Clutter.EventType.TOUCH_END || type === Clutter.EventType.TOUCH_CANCEL) {
			if (this._longPressTimer) {
				GLib.source_remove(this._longPressTimer);
				this._longPressTimer = 0;
			}
			const wasSwiping = this._isSwiping;
			const wasLongPressed = this._longPressed;
			const dismissedMenu = this._touchDismissedMenu;
			const touchHistory = this._touchHistory || [];
			const [endX, endY] = event.get_coords();
			const startX = this._touchStartX;
			const startY = this._touchStartY;

			this._touchActive = false;
			this._isSwiping = false;
			this._longPressed = false;
			this._touchDismissedMenu = false;
			this._touchSlot = null;
			this._touchSequence = null;
			this._touchHistory = [];

			if (wasLongPressed) {
				this._clearTouchStates();
				return Clutter.EVENT_STOP;
			}

			if (dismissedMenu) {
				this._clearTouchStates();
				return Clutter.EVENT_STOP;
			}

			if (wasSwiping) {
				this._clearTouchStates();
				let velocity = 0;
				if (touchHistory.length >= 2) {
					const oldest = touchHistory[0];
					const newest = touchHistory[touchHistory.length - 1];
					const dt = (newest.time - oldest.time) / 1000000.0;
					if (dt > 0.005) {
						velocity = (newest.pos - oldest.pos) / dt;
					}
				}

				const adj = this._getAdjustment();
				const maxVal = Math.max(adj.lower, adj.upper - adj.page_size);

				if (Math.abs(velocity) > 70) {
					// Scorrimento naturale a inerzia fisica
					const momentum = -velocity * 0.58;
					const target = Math.clamp(adj.value + momentum, adj.lower, maxVal);
					const distance = Math.abs(target - adj.value);
					if (distance > 8) {
						const duration = Math.min(1200, Math.max(380, distance * 0.75 + Math.abs(velocity) * 0.22));
						adj.ease(target, {
							duration,
							mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
						});
					}
				}
				return Clutter.EVENT_STOP;
			}

			// Tap su touch: seleziona/attiva la scheda toccata o gestisce il pulsante 3 puntini
			if (type === Clutter.EventType.TOUCH_END && startX != null && startY != null) {
				const item = this._touchedItem || this._findItemAt(endX, endY) || this._findItemAt(startX, startY);
				this._clearTouchStates();
				if (item && typeof item.handleTouchTap === 'function') {
					if (item.handleTouchTap(startX, startY, event)) {
						return Clutter.EVENT_STOP;
					}
				}
			}

			this._clearTouchStates();
			return Clutter.EVENT_PROPAGATE;
		}

		return Clutter.EVENT_PROPAGATE;
	}

	vfunc_key_press_event(event) {
		const key = event.get_key_symbol();

		// Home
		if (key === Clutter.KEY_Home) {
			const child = get_first_visible_child(this._scrollContainer);
			if (child) {
				this._scrollContainer.focusChild(child);
			}
			return Clutter.EVENT_STOP;
		}

		// End
		if (key === Clutter.KEY_End) {
			const child = get_last_visible_child(this._scrollContainer);
			if (child) {
				this._scrollContainer.focusChild(child);
			}
			return Clutter.EVENT_STOP;
		}
		return super.vfunc_key_press_event(event);
	}

	vfunc_scroll_event(event) {
		if (this.ext.clipboardDialog?._clipboardItemMenu?.isOpen) {
			this.ext.clipboardDialog._clipboardItemMenu.close(BoxPointer.PopupAnimation.NONE);
		}
		let delta = 0;
		let animate = false;
		const scrollSource = event.get_scroll_source();
		const direction = event.get_scroll_direction();
		if (scrollSource === Clutter.ScrollSource.WHEEL || scrollSource === Clutter.ScrollSource.UNKNOWN) {
			if (direction === Clutter.ScrollDirection.UP || direction === Clutter.ScrollDirection.LEFT) {
				delta = -1;
			} else if (direction === Clutter.ScrollDirection.DOWN || direction === Clutter.ScrollDirection.RIGHT) {
				delta = 1;
			}
			animate = true;
		} else if (direction === Clutter.ScrollDirection.SMOOTH) {
			delta = event.get_scroll_delta()[this.orientation];
		}
		if (delta === 0) return Clutter.EVENT_STOP;
		const spacing = this._scrollContainer.get_layout_manager().spacing;
		let adjustment;
		let step;
		if (this._orientation === Clutter.Orientation.HORIZONTAL) {
			adjustment = this.hadjustment;
			step = this._itemWidth + spacing;
		} else {
			adjustment = this.vadjustment;
			step = this._itemHeight + spacing;
		}

		// Extend previous animation or current value
		const transition = adjustment.get_transition('value');
		let start = transition?.interval.final ?? adjustment.value;
		if ((start < adjustment.value && delta > 0) || (start > adjustment.value && delta < 0)) {
			start = adjustment.value;
		}
		const value = Math.clamp(start + delta * step, adjustment.lower, adjustment.upper);
		if (value === adjustment.value) return Clutter.EVENT_STOP;
		if (animate) {
			adjustment.ease(value, {
				duration: 150,
				mode: Clutter.AnimationMode.EASE_OUT_QUAD,
			});
		} else {
			adjustment.value = value;
		}
		return Clutter.EVENT_STOP;
	}

	destroy() {
		if (this._longPressTimer) {
			GLib.source_remove(this._longPressTimer);
			this._longPressTimer = 0;
		}
		this.ext.settings.disconnectObject(this);
		super.destroy();
	}
};

ClipboardScrollView = __decorate(
	[
		registerClass({
			Properties: {
				orientation: enumParamSpec(
					'orientation',
					GObject.ParamFlags.READWRITE,
					Clutter.Orientation,
					Clutter.Orientation.HORIZONTAL,
				),
			},
		}),
	],
	ClipboardScrollView,
);

export { ClipboardScrollView };
