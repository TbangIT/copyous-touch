import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { __decorate } from '../../../thirdparty/tslib.js';
import { registerClass } from '../../common/gjs.js';
import { makeResettable } from '../utils.js';
import { ShortcutRow } from './shortcutRow.js';

const ShortcutLabel = ('ShortcutLabel' in Gtk && !('ShortcutLabel' in Adw) ? Gtk : Adw).ShortcutLabel;
let ScrollShortcutRow = class ScrollShortcutRow extends Adw.ActionRow {
	_ctrlLabel;

	constructor(title, showCtrl) {
		super({ title });
		const box = new Gtk.Box();
		this.add_suffix(box);
		this._ctrlLabel = new ShortcutLabel({ accelerator: '<Ctrl>&', valign: Gtk.Align.CENTER, visible: showCtrl });
		box.append(this._ctrlLabel);
		const scrollLabel = new Gtk.Box({ css_name: 'shortcut-label', valign: Gtk.Align.CENTER });
		box.append(scrollLabel);
		const scrollKeycap = new Gtk.Label({ css_classes: ['keycap'], label: _('Rotella') });
		scrollLabel.append(scrollKeycap);
	}

	get showCtrl() {
		return this._ctrlLabel.visible;
	}

	set showCtrl(value) {
		this._ctrlLabel.visible = value;
	}
};
ScrollShortcutRow = __decorate(
	[
		registerClass({
			Properties: {
				'show-ctrl': GObject.ParamSpec.boolean('show-ctrl', null, null, GObject.ParamFlags.READWRITE, true),
			},
		}),
	],
	ScrollShortcutRow,
);
let SearchShortcuts = class SearchShortcuts extends Adw.PreferencesGroup {
	constructor(prefs) {
		super({ title: _('Ricerca') });
		const togglePinnedSearch = new ShortcutRow(_('Filtra solo fissati'), '', true);
		this.add(togglePinnedSearch);
		this.add(new ShortcutRow(_('Azzera filtri ricerca'), 'Back'));
		this.add(new ShortcutRow(_('Incolla primo elemento'), 'Return'));
		const settings = prefs.getSettings();
		settings.bind('toggle-pinned-search-shortcut', togglePinnedSearch, 'shortcuts', Gio.SettingsBindFlags.DEFAULT);
		makeResettable(togglePinnedSearch, settings, 'toggle-pinned-search-shortcut');
	}
};
SearchShortcuts = __decorate([registerClass()], SearchShortcuts);

export { SearchShortcuts };

let SearchNavigationShortcuts = class SearchNavigationShortcuts extends Adw.PreferencesGroup {
	constructor() {
		super();
		this.add(new ShortcutRow(_('Tipo successivo'), '<Ctrl>Tab'));
		this.add(new ShortcutRow(_('Tipo precedente'), '<Ctrl><Shift>Tab'));
		this.add(new ShortcutRow(_('Etichetta successiva'), '<Ctrl>grave'));
		this.add(new ShortcutRow(_('Etichetta precedente'), '<Ctrl><Shift>grave'));
		this.add(new ShortcutRow(_('Seleziona etichetta'), '<Ctrl><Shift>0...9'));
	}
};
SearchNavigationShortcuts = __decorate([registerClass()], SearchNavigationShortcuts);

export { SearchNavigationShortcuts };

let SearchScrollShortcuts = class SearchScrollShortcuts extends Adw.PreferencesGroup {
	constructor(prefs) {
		super();
		const swapScrollRow = new Adw.SwitchRow({
			title: _('Inverti rotella mouse'),
			subtitle: _('Scambia la rotella tra scorrimento tipi ed etichette'),
		});
		this.add(swapScrollRow);
		const cycleItemTypeRow = new ScrollShortcutRow(_('Scorri tipi elemento'), swapScrollRow.active);
		this.add(cycleItemTypeRow);
		const cycleItemTagRow = new ScrollShortcutRow(_('Scorri etichette'), !swapScrollRow.active);
		this.add(cycleItemTagRow);

		// Bind properties
		swapScrollRow.bind_property('active', cycleItemTypeRow, 'show-ctrl', GObject.BindingFlags.DEFAULT);
		swapScrollRow.bind_property('active', cycleItemTagRow, 'show-ctrl', GObject.BindingFlags.INVERT_BOOLEAN);
		const settings = prefs.getSettings();
		settings.bind('swap-scroll-shortcut', swapScrollRow, 'active', null);
	}
};
SearchScrollShortcuts = __decorate([registerClass()], SearchScrollShortcuts);

export { SearchScrollShortcuts };
