import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Graphene from 'gi://Graphene';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as IBusManager from 'resource:///org/gnome/shell/misc/ibusManager.js';
import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import * as Layout from 'resource:///org/gnome/shell/ui/layout.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { __decorate } from '../../thirdparty/tslib.js';
import { ItemType } from '../common/constants.js';
import { registerClass } from '../common/gjs.js';
import { Icon, loadIcon } from '../common/icons.js';
import { OpenClipboardDialogBehavior } from '../common/settings.js';
import { VERSION } from '../misc/compatibility.js';
import { Shortcut } from '../misc/shortcuts.js';
import { ClipboardScrollView } from './clipboardScrollView.js';
import { ClipboardItemMenu } from './components/clipboardItemMenu.js';
import { ConfirmClearHistoryDialog } from './indicator.js';
import { CodeItem } from './items/codeItem.js';
import { FileItem } from './items/fileItem.js';
import { FilesItem } from './items/filesItem.js';
import { ImageItem } from './items/imageItem.js';
import { LinkItem } from './items/linkItem.js';
import { TextItem } from './items/textItem.js';
import { CenterBox, CollapsibleHeaderLayout, FitConstraint } from './layout.js';
import { SearchEntry } from './searchEntry.js';

const ANIMATION_TIME = 150;
let IncognitoButton = class IncognitoButton extends St.Button {
	ext;
	_incognitoIcon;
	_incognitoDisabledIcon;
	_icon;

	constructor(ext, props) {
		super({ ...props, toggle_mode: true, can_focus: true });
		this.ext = ext;
		this._incognitoIcon = loadIcon(ext, Icon.Incognito);
		this._incognitoDisabledIcon = loadIcon(ext, Icon.IncognitoDisabled);
		this._icon = new St.Icon({ gicon: this._incognitoDisabledIcon, icon_size: 14 });
		this.child = this._icon;
		this.ext.settings.connectObject('changed::incognito', this.update.bind(this), this);
		this.connect('notify::checked', () => {
			this.ext.settings.set_boolean('incognito', this.checked);
			this.update();
		});
		this.update();
	}

	destroy() {
		this.ext.settings.disconnectObject(this);
		super.destroy();
	}

	update() {
		const incognito = this.ext.settings.get_boolean('incognito');
		this.checked = incognito;
		this._icon.gicon = incognito ? this._incognitoIcon : this._incognitoDisabledIcon;
	}
};
IncognitoButton = __decorate([registerClass()], IncognitoButton);
let ClipboardDialogHeader = class ClipboardDialogHeader extends St.Widget {
	ext;
	_headerBox;
	_settingsButton;
	_incognitoButton;
	_clearButton;
	_searchButton;
	_centerContainer;
	searchEntry;
	_headerVisible = true;
	_searchExpanded = false;
	_collapseId = 0;

	constructor(ext) {
		super({
			style_class: 'dialog-header',
			clip_to_allocation: true,
			x_expand: true,
			y_expand: false,
			y_align: Clutter.ActorAlign.START,
		});
		this.ext = ext;
		this.layout_manager = new Clutter.BinLayout();
		this._headerBox = new CenterBox({
			style_class: 'dialog-header-box',
			x_expand: true,
			y_expand: false,
			y_align: Clutter.ActorAlign.CENTER,
		});
		this.add_child(this._headerBox);

		// Start (Impostazioni + Incognito)
		this._settingsButton = new St.Button({
			style_class: 'dialog-header-icon-button',
			child: new St.Icon({ gicon: loadIcon(ext, Icon.Settings), icon_size: 14 }),
			can_focus: true,
		});
		this._settingsButton.connect('clicked', () => this.emit('open-settings'));
		this._headerBox.addPrefix(this._settingsButton);
		this._incognitoButton = new IncognitoButton(ext, { style_class: 'dialog-header-icon-button' });
		this._headerBox.addPrefix(this._incognitoButton);

		// Center: barra di ricerca oppure, se "comprimi ricerca" è attivo, un pulsante che la espande
		this._centerContainer = new St.BoxLayout({
			style_class: 'dialog-header-center',
			y_align: Clutter.ActorAlign.CENTER,
			x_align: Clutter.ActorAlign.CENTER,
		});
		this._searchButton = new St.Button({
			style_class: 'dialog-header-icon-button search-toggle-button',
			child: new St.Icon({ gicon: loadIcon(ext, Icon.Search), icon_size: 14 }),
			can_focus: true,
			visible: false,
		});
		this._searchButton.connect('clicked', () => this.expandSearch(true));
		this._centerContainer.add_child(this._searchButton);
		this.searchEntry = new SearchEntry(ext);
		this._centerContainer.add_child(this.searchEntry);
		this._headerBox.centerWidget = this._centerContainer;

		// Il collasso avviene solo quando il focus esce DAVVERO dalla barra (non quando si sposta
		// sui suoi pulsanti interni o sul menu dei filtri) e non ci sono filtri attivi.
		this.searchEntry.clutter_text.connect('key-focus-in', () => this.expandSearch(false));
		this.searchEntry.clutter_text.connect('key-focus-out', () => this._scheduleCollapse());
		this.searchEntry.connect('menu-state-changed', () => this._scheduleCollapse());
		this.searchEntry.connect('search', () => this.syncSearch());

		// End (pulisci cronologia)
		this._clearButton = new St.Button({
			style_class: 'dialog-header-icon-button',
			child: new St.Icon({ icon_name: 'edit-clear-all-symbolic', icon_size: 14 }),
			can_focus: true,
		});
		this._clearButton.connect('clicked', () => this.emit('clear-history'));
		this._headerBox.addSuffix(this._clearButton);

		this.ext.settings.connectObject('changed::auto-hide-search', () => this.syncSearch(), this);
		this.syncSearch();
	}

	destroy() {
		if (this._collapseId) {
			GLib.source_remove(this._collapseId);
			this._collapseId = 0;
		}
		this.ext.settings.disconnectObject(this);
		super.destroy();
	}

	get headerVisible() {
		return this._headerVisible;
	}

	set showButtons(show) {
		this._settingsButton.visible = show;
		this._incognitoButton.visible = show;
		this._clearButton.visible = show;
	}

	/**
	 * Unico punto che decide se mostrare la barra o il pulsante di ricerca.
	 */
	syncSearch() {
		const autoHide = this.ext.settings.get_boolean('auto-hide-search');
		const collapsed = autoHide && !this._searchExpanded && !this.searchEntry.hasFilters;
		this.searchEntry.visible = !collapsed;
		this._searchButton.visible = collapsed;
	}

	_scheduleCollapse() {
		if (this._collapseId) return;
		this._collapseId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
			this._collapseId = 0;
			const focus = global.stage.get_key_focus();
			const inside = focus !== null && (focus === this.searchEntry || this.searchEntry.contains(focus));
			if (!inside && !this.searchEntry.menuOpen) {
				this._searchExpanded = false;
				this.syncSearch();
			}
			return GLib.SOURCE_REMOVE;
		});
	}

	expandSearch(focus = true) {
		this._searchExpanded = true;
		this.syncSearch();
		if (focus) this.searchEntry.clutter_text.grab_key_focus();
	}

	/**
	 * Chiamato all'apertura del cassetto: se la barra è visibile il cursore parte subito al suo interno.
	 * @returns true se il focus è stato dato alla barra di ricerca
	 */
	focusOnOpen() {
		this._searchExpanded = false;
		this.syncSearch();
		if (!this.searchEntry.visible) return false;
		this.searchEntry.clutter_text.grab_key_focus();
		return true;
	}

	updateHeader(show, _animate = true) {
		if (show) {
			this.expandSearch(false);
		} else {
			this._searchExpanded = false;
			this.syncSearch();
		}
	}

	vfunc_navigate_focus(from, direction) {
		const outside = from === null || !this.contains(from);
		if (outside && direction === St.DirectionType.UP) {
			// Salendo dalle schede: il cursore va nella ricerca (espansa se compressa)
			this.expandSearch(true);
			return true;
		}
		if (
			direction === St.DirectionType.UP ||
			direction === St.DirectionType.LEFT ||
			direction === St.DirectionType.RIGHT
		) {
			this.expandSearch(false);
		}
		return super.vfunc_navigate_focus(from, direction);
	}

	vfunc_map() {
		super.vfunc_map();
		this._searchExpanded = false;
		this.syncSearch();
	}
};
ClipboardDialogHeader = __decorate(
	[
		registerClass({
			Properties: {
				'header-visible': GObject.ParamSpec.boolean(
					'header-visible',
					null,
					null,
					GObject.ParamFlags.READABLE,
					true,
				),
			},
			Signals: {
				'open-settings': {},
				'clear-history': {},
			},
		}),
	],
	ClipboardDialogHeader,
);
let ClipboardDialogFooter = class ClipboardDialogFooter extends St.BoxLayout {
	constructor(ext) {
		super({
			style_class: 'dialog-footer',
			y_align: Clutter.ActorAlign.END,
			x_expand: true,
			y_expand: true,
		});
		const settingsButton = new St.Button({
			style_class: 'dialog-footer-icon-button',
			child: new St.Icon({ gicon: loadIcon(ext, Icon.Settings), icon_size: 14 }),
			can_focus: true,
			x_align: Clutter.ActorAlign.START,
		});
		settingsButton.connect('clicked', () => this.emit('open-settings'));
		this.add_child(settingsButton);
		this.add_child(
			new IncognitoButton(ext, {
				style_class: 'dialog-footer-icon-button',
				x_align: Clutter.ActorAlign.START,
			}),
		);
		const clearButton = new St.Button({
			style_class: 'dialog-footer-icon-button',
			child: new St.Icon({ icon_name: 'edit-clear-all-symbolic', icon_size: 14 }),
			can_focus: true,
			x_align: Clutter.ActorAlign.END,
			x_expand: true,
		});
		clearButton.connect('clicked', () => this.emit('clear-history'));
		this.add_child(clearButton);
	}
};
ClipboardDialogFooter = __decorate(
	[
		registerClass({
			Signals: {
				'open-settings': {},
				'clear-history': {},
			},
		}),
	],
	ClipboardDialogFooter,
);
let ClipboardDialog = class ClipboardDialog extends St.Widget {
	ext;
	_grab = null;
	_open = false;
	_closing = false;
	_superDown = false;
	_lastSuperTap = 0;
	_updateCursor = true;
	_nextCursor = null;
	_cursor = null;
	_orientation = Clutter.Orientation.HORIZONTAL;
	_ibusManager;
	_monitorConstraint;
	_fitConstraint;
	_widthConstraint;
	_dialog;
	_header;
	_scrollView;
	_footer;
	_clipboardItemMenu;

	constructor(ext) {
		super({
			layout_manager: new Clutter.BinLayout(),
			x_align: Clutter.ActorAlign.FILL,
			y_align: Clutter.ActorAlign.FILL,
			x_expand: true,
			y_expand: true,
			visible: false,
			reactive: true,
		});
		this.ext = ext;
		this._monitorConstraint = new Layout.MonitorConstraint({ workArea: true });
		this.add_constraint(this._monitorConstraint);
		Main.layoutManager.modalDialogGroup.add_child(this);

		// Dialog
		this._dialog = new St.BoxLayout({
			orientation: Clutter.Orientation.VERTICAL,
			style_class: 'modal-dialog clipboard-dialog horizontal',
			x_align: Clutter.ActorAlign.FILL,
			y_align: Clutter.ActorAlign.CENTER,
			x_expand: true,
			y_expand: true,
		});
		this.add_child(this._dialog);
		ext.theme?.register(this._dialog);
		this._fitConstraint = new FitConstraint(this, false);
		this._dialog.add_constraint(this._fitConstraint);
		global.focus_manager.add_group(this._dialog);

		// Header
		this._header = new ClipboardDialogHeader(ext);
		this._dialog.add_child(this._header);
		this._header.connect('open-settings', this.openSettings.bind(this));
		this._header.connect('clear-history', this.confirmClearHistory.bind(this));
		this._header.searchEntry.connect('search', (_, query) => this._scrollView.search(query));
		this._header.searchEntry.connect('activate', () => this._scrollView.activateFirst());
		this._header.connect('notify::header-visible', () => {
			if (this._header.headerVisible) {
				this._dialog.add_style_class_name('show-header');
			} else {
				this._dialog.remove_style_class_name('show-header');
			}
		});

		// Scrollbox
		this._scrollView = new ClipboardScrollView(ext);
		this._dialog.add_child(this._scrollView);
		this._widthConstraint = new Clutter.BindConstraint({
			coordinate: Clutter.BindCoordinate.WIDTH,
			source: this._scrollView,
			enabled: false,
		});
		this._header.add_constraint(this._widthConstraint);

		// Footer
		this._footer = new ClipboardDialogFooter(ext);
		this._dialog.add_child(this._footer);
		this._footer.connect('open-settings', this.openSettings.bind(this));
		this._footer.connect('clear-history', this.confirmClearHistory.bind(this));

		// Clipboard item menu
		this._clipboardItemMenu = new ClipboardItemMenu(ext);
		const clipboardItemMenuManager = new PopupMenu.PopupMenuManager(this);
		clipboardItemMenuManager.addMenu(this._clipboardItemMenu, 0);
		this._clipboardItemMenu.connectObject(
			'activate',
			(_, item) => {
				// "Fissa" e simili cambiano solo lo stato dell'elemento: il cassetto resta aperto
				if (!this._clipboardItemMenu.isPassiveItem(item)) this.close();
			},
			'copy',
			(_, s) => ext.clipboardManager?.copyText(s),
			'paste',
			(_, s) => ext.clipboardManager?.pasteText(s),
			this,
		);

		// Cursor position
		Main.inputMethod.connectObject('cursor-location-changed', this.updateCursor.bind(this), this);
		this._ibusManager = IBusManager.getIBusManager();
		this._ibusManager.connectObject(
			'focus-in',
			() => {
				// Update cursor after focus in since a focus out can trigger between cursor-location-changed and focus-in
				if (!this._updateCursor) return;
				this._cursor = this._nextCursor;
				this._nextCursor = null;
			},
			'focus-out',
			() => (this._cursor = null),
			this,
		);

		// Bind properties
		// prettier-ignore
		this.ext.settings.connectObject('changed::show-at-pointer', this.updatePosition.bind(this), 'changed::clipboard-orientation', this.updatePosition.bind(this), 'changed::clipboard-position-horizontal', this.updatePosition.bind(this), 'changed::clipboard-position-vertical', this.updatePosition.bind(this), 'changed::clipboard-size', this.updatePosition.bind(this), 'changed::clipboard-margin-top', this.updateMargins.bind(this), 'changed::clipboard-margin-bottom', this.updateMargins.bind(this), 'changed::clipboard-margin-left', this.updateMargins.bind(this), 'changed::clipboard-margin-right', this.updateMargins.bind(this), this);
		this.updatePosition();
		this.updateMargins();

		// Update initial search for when exclude-pinned or exclude-tagged is enabled
		this._scrollView.search(this._header.searchEntry.searchQuery);

		// Intercetta affidabilmente la pressione e il rilascio del tasto Super a livello radice
		this.connect('captured-event', (_actor, event) => {
			const type = event.type();

			// Se il menu a tendina dei 3 puntini è aperto e si tocca/clicca fuori,
			// chiudilo immediatamente e lascia propagare l'evento per consentire
			// l'interazione al volo con schede, pulsanti e scorrimento.
			if (this._clipboardItemMenu?.isOpen) {
				if (type === Clutter.EventType.TOUCH_BEGIN || type === Clutter.EventType.BUTTON_PRESS) {
					const [x, y] = event.get_coords();
					const menuActor = this._clipboardItemMenu.actor;
					let insideMenu = false;
					if (menuActor && menuActor.visible) {
						const [mx, my] = menuActor.get_transformed_position();
						const [mw, mh] = menuActor.get_transformed_size();
						if (x >= mx && x <= mx + mw && y >= my && y <= my + mh) {
							insideMenu = true;
						}
					}
					if (!insideMenu) {
						this._clipboardItemMenu.close(BoxPointer.PopupAnimation.NONE);
					}
				}
			}

			if (type === Clutter.EventType.KEY_PRESS) {
				const key = event.get_key_symbol();
				if (key === Clutter.KEY_Super_L || key === Clutter.KEY_Super_R) {
					this._superDown = true;
					return Clutter.EVENT_PROPAGATE;
				} else {
					this._superDown = false;
				}
			} else if (type === Clutter.EventType.KEY_RELEASE) {
				const key = event.get_key_symbol();
				if ((key === Clutter.KEY_Super_L || key === Clutter.KEY_Super_R) && this._superDown) {
					this._superDown = false;
					this._superTap();
					return Clutter.EVENT_STOP;
				}
			}
			return Clutter.EVENT_PROPAGATE;
		});
	}

	destroy() {
		Main.inputMethod.disconnectObject(this);
		this._ibusManager.disconnectObject(this);
		this.ext.settings.disconnectObject(this);
		super.destroy();
	}

	get opened() {
		return this._open;
	}

	set opened(value) {
		this._open = value;
		this.notify('opened');
	}

	toggle() {
		if (!this.opened) this.open();
		else this.close();
	}

	open() {
		if (this.opened || this._closing) return;
		this._updateCursor = false;
		this._nextCursor = this._cursor;
		const grab = Main.pushModal(this, { actionMode: Shell.ActionMode.POPUP });

		// GNOME 50 (Mutter 18) removed get_seat_state()/GrabState in favor of is_revoked()
		const grabFailed = VERSION >= 50 ? grab.is_revoked() : grab.get_seat_state() !== 1; // Clutter.GrabState.ALL
		if (grabFailed) {
			Main.popModal(grab);
			return;
		}
		this._grab = grab;
		this._monitorConstraint.index = global.display.get_current_monitor();
		this._superDown = false;
		this._dialog.opacity = 0;
		this.show();
		const slide = this._slideOffsets();
		this._dialog.translation_x = slide.x;
		this._dialog.translation_y = slide.y;
		this._dialog.set_pivot_point(slide.pivotX, slide.pivotY);
		let mode = Clutter.AnimationMode.LINEAR;
		if (VERSION >= 49) {
			// Gnome 49 and above uses different animation
			mode = Clutter.AnimationMode.EASE_OUT_QUAD;
			this._dialog.scale_x = 0.96;
			this._dialog.scale_y = 0.96;
		}
		this.opened = true;
		global.compositor.disable_unredirect();
		this._dialog.ease({
			opacity: 255,
			translationX: 0,
			translationY: 0,
			scaleX: 1,
			scaleY: 1,
			duration: ANIMATION_TIME,
			mode,
		});
	}

	/**
	 * Direzione dello scorrimento di apertura/chiusura: il cassetto "esce" dal bordo a cui è agganciato.
	 */
	_slideOffsets() {
		const horizontal = this._orientation === Clutter.Orientation.HORIZONTAL;
		const { x_align: xAlign, y_align: yAlign } = this._dialog;
		const START = Clutter.ActorAlign.START;
		const END = Clutter.ActorAlign.END;
		if (horizontal && yAlign === END) return { x: 0, y: 6, pivotX: 0.5, pivotY: 1 };
		if (!horizontal && xAlign === START) return { x: -6, y: 0, pivotX: 0, pivotY: 0.5 };
		if (!horizontal && xAlign === END) return { x: 6, y: 0, pivotX: 1, pivotY: 0.5 };
		return { x: 0, y: -6, pivotX: 0.5, pivotY: 0 };
	}

	close(onClosed = null) {
		if (!this.opened && !this._closing) return;
		if (this._closing) return;
		this._closing = true;
		this.opened = false;
		this._superDown = false;
		this._updateCursor = true;
		this._clipboardItemMenu.close();
		if (this._grab) {
			Main.popModal(this._grab);
			this._grab = null;
		}
		let mode = Clutter.AnimationMode.LINEAR;
		let easeArgs = {};
		if (VERSION >= 49) {
			// Gnome 49 and above uses different animation
			mode = Clutter.AnimationMode.EASE_OUT_QUAD;
			easeArgs = {
				scaleX: 0.96,
				scaleY: 0.96,
			};
			const slide = this._slideOffsets();
			easeArgs.translationX = slide.x;
			easeArgs.translationY = slide.y;
			this._dialog.set_pivot_point(slide.pivotX, slide.pivotY);
		}
		this._dialog.ease({
			opacity: 0,
			...easeArgs,
			duration: ANIMATION_TIME,
			mode,
			onComplete: () => {
				this._closing = false;
				this.hide();
				global.compositor.enable_unredirect();
				if (typeof onClosed === 'function') onClosed();
			},
		});
	}

	addEntry(entry) {
		let item;
		try {
			item = (() => {
				switch (entry.type) {
					case ItemType.Character:
					case ItemType.Color:
					case ItemType.Text:
						return new TextItem(this.ext, entry);
					case ItemType.Code:
						return new CodeItem(this.ext, entry);
					case ItemType.Image:
						return new ImageItem(this.ext, entry);
					case ItemType.File:
						return new FileItem(this.ext, entry);
					case ItemType.Files:
						return new FilesItem(this.ext, entry);
					case ItemType.Link:
						return new LinkItem(this.ext, entry);
					default:
						return null;
				}
			})();
			if (!item) {
				this.ext.logger.error('Unknown item type', entry);
				return;
			}
		} catch (e) {
			this.ext.logger.error(e);
			return;
		}

		// Connect edit
		item.connectObject('edit', () => this._clipboardItemMenu.edit(entry), this);

		// Connect item menu
		item.connectObject(
			'open-menu',
			(_, x, y, w, h) => {
				const isSameEntry = this._clipboardItemMenu.isOpen && this._clipboardItemMenu._entry === entry;
				if (this._clipboardItemMenu.isOpen) {
					this._clipboardItemMenu.close(BoxPointer.PopupAnimation.NONE);
					if (isSameEntry) return;
				}
				item.fake_release();
				item.remove_style_pseudo_class('active');
				item.sync_hover();
				item.notify('active');
				if (item._header?._menuButton) {
					item._header._menuButton.fake_release();
					item._header._menuButton.remove_style_pseudo_class('active');
				}
				// Connect the menu signal to update the hover state of the item and remove the signal when the menu is closed
				const signalId = this._clipboardItemMenu.connect('open-state-changed', (_menu, state) => {
					item.fake_release();
					item.remove_style_pseudo_class('active');
					item.sync_hover();
					item.notify('active');
					if (item._header?._menuButton) {
						item._header._menuButton.fake_release();
						item._header._menuButton.remove_style_pseudo_class('active');
					}
					if (!state) {
						this._clipboardItemMenu.disconnect(signalId);
						this._scrollView._clearTouchStates();
					}
					return true;
				});
				this._clipboardItemMenu.arrowAlignment = w === 0 && h === 0 ? 0 : 0.5;

				// Slightly offset the menu to allow immediately clicking and closing the menu
				if (w === 0 && h === 0) {
					x++;
					y++;
				}
				Main.layoutManager.setDummyCursorGeometry(x, y, w, h);
				this._clipboardItemMenu.entry = entry;
				this._clipboardItemMenu.open(BoxPointer.PopupAnimation.SLIDE);
			},
			this,
		);

		// Connect activation
		item.connectObject(
			'activate',
			() => {
				const swap = this.ext.settings.get_boolean('swap-copy-shortcut');
				this.emit(swap ? 'copy' : 'paste', entry);
				this.close();
			},
			'activate-shift',
			() => {
				const swap = this.ext.settings.get_boolean('swap-copy-shortcut');
				this.emit(swap ? 'paste' : 'copy', entry);
				this.close();
			},
			'activate-ctrl',
			() => {
				if (this._clipboardItemMenu.activateDefaultAction(entry)) this.close();
			},
			'activate-action',
			(_, id) => {
				if (this._clipboardItemMenu.activateAction(entry, id)) this.close();
			},
			this,
		);
		this._scrollView.addItem(item);
	}

	/**
	 * Un tap sul tasto Super (premuto e rilasciato da solo mentre il cassetto è aperto) chiude il cassetto
	 * e apre/chiude la panoramica, come farebbe senza il grab modale che altrimenti lo blocca.
	 */
	_superTap() {
		const now = GLib.get_monotonic_time();
		if (now - this._lastSuperTap < 300000) return;
		this._lastSuperTap = now;
		this.close();
		if (Main.sessionMode.hasOverview) Main.overview.toggle();
	}

	dialogShortcut() {
		const behavior = this.ext.settings.get_enum('open-clipboard-dialog-behavior');
		if (behavior === OpenClipboardDialogBehavior.Toggle) {
			this.toggle();
		} else if (behavior === OpenClipboardDialogBehavior.OpenOrSelectNext) {
			if (!this.opened) this.open();
			else this._scrollView.selectNextItem();
		}
	}

	clearEntries() {
		this._scrollView.clearItems();
	}

	openSettings() {
		this.ext.openPreferences();
		this.close();
	}

	confirmClearHistory() {
		const dialog = new ConfirmClearHistoryDialog();
		dialog.connect('clear-history', (_dialog, history) => this.emit('clear-history', history));
		dialog.open();
	}

	updatePosition() {
		const showAtPointer = this.ext.settings.get_boolean('show-at-pointer');
		this._orientation = this.ext.settings.get_enum('clipboard-orientation');
		const positionVertical = this.ext.settings.get_enum('clipboard-position-vertical');
		const positionHorizontal = this.ext.settings.get_enum('clipboard-position-horizontal');
		const size = this.ext.settings.get_int('clipboard-size');
		this._scrollView.orientation = this._orientation;
		this._widthConstraint.enabled = this._orientation === Clutter.Orientation.VERTICAL;
		this._fitConstraint.enabled = showAtPointer;
		if (showAtPointer) {
			this._dialog.x_align = Clutter.ActorAlign.CENTER;
			this._dialog.y_align = Clutter.ActorAlign.CENTER;
		} else {
			this._dialog.x_align = (positionHorizontal + 1) % 4;
			this._dialog.y_align = (positionVertical + 1) % 4;
		}

		// Docking classes for drawer edge alignment
		this._dialog.remove_style_class_name('dock-top');
		this._dialog.remove_style_class_name('dock-bottom');
		this._dialog.remove_style_class_name('dock-left');
		this._dialog.remove_style_class_name('dock-right');
		if (!showAtPointer) {
			if (this._dialog.y_align === Clutter.ActorAlign.START) this._dialog.add_style_class_name('dock-top');
			else if (this._dialog.y_align === Clutter.ActorAlign.END) this._dialog.add_style_class_name('dock-bottom');
			if (this._dialog.x_align === Clutter.ActorAlign.START) this._dialog.add_style_class_name('dock-left');
			else if (this._dialog.x_align === Clutter.ActorAlign.END) this._dialog.add_style_class_name('dock-right');
		}

		if (this._orientation === Clutter.Orientation.HORIZONTAL) {
			this._dialog.add_style_class_name('horizontal');
			this._dialog.remove_style_class_name('vertical');
			this._dialog.set_size(size, -1);
		} else {
			this._dialog.remove_style_class_name('horizontal');
			this._dialog.add_style_class_name('vertical');
			this._dialog.set_size(-1, size);
		}

		// Header / Footer
		this._header.showButtons = this._orientation === Clutter.Orientation.HORIZONTAL;
		this._footer.visible = this._orientation === Clutter.Orientation.VERTICAL;
	}

	updateMargins() {
		const top = this.ext.settings.get_int('clipboard-margin-top');
		const right = this.ext.settings.get_int('clipboard-margin-right');
		const bottom = this.ext.settings.get_int('clipboard-margin-bottom');
		const left = this.ext.settings.get_int('clipboard-margin-left');
		this._dialog.set_style(`margin: ${top}px ${right}px ${bottom}px ${left}px;`);
	}

	updateCursor(_source, rect) {
		if (isNaN(rect.get_x()) || isNaN(rect.get_y()) || !this._updateCursor) return;
		const p = rect.get_bottom_right();
		this._nextCursor = [p.x + 4, p.y + 4];
		this._cursor = [p.x + 4, p.y + 4];
	}

	updateFitConstraint() {
		// Update fit constraint position to current pointer position
		const showAtPointer = this.ext.settings.get_boolean('show-at-pointer');
		if (!showAtPointer) return;
		const showAtCursor = this.ext.settings.get_boolean('show-at-cursor');
		const [x, y] = (showAtCursor ? this._cursor : null) ?? global.get_pointer();
		const ws = global.workspace_manager.get_active_workspace();
		const rect = ws.get_work_area_for_monitor(this._monitorConstraint.index);
		const node = this._dialog.get_theme_node();
		this._fitConstraint.x = Math.max(0, x - rect.x - node.get_margin(St.Side.LEFT) + 1);
		this._fitConstraint.y = Math.max(0, y - rect.y - node.get_margin(St.Side.TOP) + 1);
	}

	shouldTriggerSearch(keysym) {
		if (keysym === Clutter.KEY_Multi_key) return true;
		if (keysym === Clutter.KEY_BackSpace) return true;
		const unicode = Clutter.keysym_to_unicode(keysym);
		if (unicode === 0) return false;
		return String.fromCharCode(unicode).trim().length > 0;
	}

	vfunc_key_press_event(event) {
		const key = event.get_key_symbol();

		// Tap su Super: registra la pressione, qualsiasi altro tasto la annulla
		if (key === Clutter.KEY_Super_L || key === Clutter.KEY_Super_R) {
			this._superDown = true;
			return Clutter.EVENT_PROPAGATE;
		}
		this._superDown = false;

		// Close on escape
		if (key === Clutter.KEY_Escape) {
			this.close();
			return Clutter.EVENT_STOP;
		}

		// Select item: ctrl + 0..9
		const isNum = key >= Clutter.KEY_0 && key <= Clutter.KEY_9;
		if (event.has_control_modifier() && (isNum || (key >= Clutter.KEY_KP_0 && key <= Clutter.KEY_KP_9))) {
			const i = isNum ? key - Clutter.KEY_1 : key - Clutter.KEY_KP_1;
			if (this._scrollView.selectItem((i + 10) % 10)) {
				this._header.updateHeader(false);
			}
			return Clutter.EVENT_STOP;
		}

		// Search on ctrl+f
		if (event.has_control_modifier() && key === Clutter.KEY_f) {
			this._header.expandSearch(true);
			return Clutter.EVENT_STOP;
		}

		// Trigger search
		if (!event.has_control_modifier() && this.shouldTriggerSearch(key)) {
			this._header.expandSearch(true);
			return this._header.searchEntry.clutter_text.event(event, false);
		}

		// Toggle pinned search
		if (
			this.ext.shortcutsManager?.getShortcutForKeyBinding(key, event.get_state()) === Shortcut.TogglePinnedSearch
		) {
			this._header.searchEntry.pinned = !this._header.searchEntry.pinned;
			return Clutter.EVENT_STOP;
		}

		// Select tag: ctrl + shift + 0..9
		const code = event.get_key_code();
		if (event.has_control_modifier() && event.has_shift_modifier() && code >= 10 && code <= 19) {
			this._header.searchEntry.selectTag(code - 10);
			return Clutter.EVENT_STOP;
		}

		// Next tag: ctrl + `
		if (event.has_control_modifier() && key === Clutter.KEY_grave) {
			this._header.searchEntry.nextTag();
			return Clutter.EVENT_STOP;
		}

		// Previous tag: ctrl + shift + `
		if (event.has_control_modifier() && key === Clutter.KEY_asciitilde) {
			this._header.searchEntry.prevTag();
			return Clutter.EVENT_STOP;
		}

		// Next type: ctrl + tab
		if (event.has_control_modifier() && key === Clutter.KEY_Tab) {
			this._header.searchEntry.nextType();
			return Clutter.EVENT_STOP;
		}

		// Previous type: ctrl + shift + tab
		if (event.has_control_modifier() && key === Clutter.KEY_ISO_Left_Tab) {
			this._header.searchEntry.prevType();
			return Clutter.EVENT_STOP;
		}

		// Navigate
		if (global.focus_manager.navigate_from_event) {
			if (global.focus_manager.navigate_from_event(event)) return Clutter.EVENT_STOP;
		} else {
			let direction;
			switch (key) {
				case Clutter.KEY_Up:
				case Clutter.KEY_KP_Up:
					direction = St.DirectionType.UP;
					break;
				case Clutter.KEY_Down:
				case Clutter.KEY_KP_Down:
					direction = St.DirectionType.DOWN;
					break;
				case Clutter.KEY_Left:
				case Clutter.KEY_KP_Left:
					direction = St.DirectionType.LEFT;
					break;
				case Clutter.KEY_Right:
				case Clutter.KEY_KP_Right:
					direction = St.DirectionType.RIGHT;
					break;
				case Clutter.KEY_Tab:
				case Clutter.KEY_KP_Tab:
					direction = event.has_shift_modifier()
						? St.DirectionType.TAB_BACKWARD
						: St.DirectionType.TAB_FORWARD;
					break;
				case Clutter.KEY_ISO_Left_Tab:
					direction = St.DirectionType.TAB_BACKWARD;
					break;
			}
			if (
				direction !== undefined &&
				this._dialog.navigate_focus(global.stage.get_key_focus(), direction, false)
			) {
				return Clutter.EVENT_STOP;
			}
		}
		return Clutter.EVENT_PROPAGATE;
	}

	vfunc_key_release_event(event) {
		const key = event.get_key_symbol();
		if ((key === Clutter.KEY_Super_L || key === Clutter.KEY_Super_R) && this._superDown) {
			this._superDown = false;
			this._superTap();
			return Clutter.EVENT_STOP;
		}
		return Clutter.EVENT_PROPAGATE;
	}

	vfunc_button_press_event(event) {
		const [x, y] = event.get_coords();
		if (this._dialog.get_transformed_extents().contains_point(new Graphene.Point({ x, y }))) {
			return Clutter.EVENT_PROPAGATE;
		}
		this.close();
		return Clutter.EVENT_STOP;
	}

	vfunc_touch_event(event) {
		if (event.type() !== Clutter.EventType.TOUCH_BEGIN) return Clutter.EVENT_PROPAGATE;
		const [x, y] = event.get_coords();
		if (this._dialog.get_transformed_extents().contains_point(new Graphene.Point({ x, y }))) {
			return Clutter.EVENT_PROPAGATE;
		}
		this.close();
		return Clutter.EVENT_STOP;
	}

	vfunc_map() {
		super.vfunc_map();

		// Update fit constraint
		this.updateFitConstraint();

		// Il cursore parte subito nella ricerca; se la ricerca è compressa si va alla prima scheda
		if (!this._header.focusOnOpen() && !this._scrollView.navigate_focus(null, St.DirectionType.DOWN, false)) {
			this._header.expandSearch(true);
		}
	}
};
ClipboardDialog = __decorate(
	[
		registerClass({
			Properties: {
				opened: GObject.ParamSpec.boolean('opened', null, null, GObject.ParamFlags.READABLE, false),
			},
			Signals: {
				'copy': { param_types: [GObject.TYPE_JSOBJECT] },
				'paste': { param_types: [GObject.TYPE_JSOBJECT] },
				'clear-history': { param_types: [GObject.TYPE_INT] },
			},
		}),
	],
	ClipboardDialog,
);

export { ClipboardDialog };
