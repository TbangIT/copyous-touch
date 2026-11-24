import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { __decorate } from '../../../thirdparty/tslib.js';
import { registerClass } from '../../common/gjs.js';
import { bind_enum } from '../../common/settings.js';
import { makeResettable } from '../utils.js';

let HeaderCustomization = class HeaderCustomization extends Adw.PreferencesGroup {
	constructor(prefs) {
		super({
			title: _('Intestazione schede'),
		});
		const showHeader = new Adw.SwitchRow({
			title: _('Mostra intestazione'),
			subtitle: _('Visualizza barra superiore su ogni card'),
		});
		this.add(showHeader);
		const showItemTitle = new Adw.SwitchRow({
			title: _('Mostra titolo e tipo'),
			subtitle: _('Visualizza etichetta del tipo di appunto o titolo personalizzato'),
		});
		this.add(showItemTitle);
		const headerControlsVisibility = new Adw.ComboRow({
			title: _('Visibilità pulsante menu'),
			subtitle: _('Mostra il tasto 3 pallini sempre, al passaggio o mai'),
			model: Gtk.StringList.new([_('Sempre visibile'), _('Al passaggio del mouse'), _('Nascosto')]),
		});
		this.add(headerControlsVisibility);

		// Bind properties
		const settings = prefs.getSettings();
		settings.bind('show-header', showHeader, 'active', Gio.SettingsBindFlags.DEFAULT);
		bind_enum(settings, 'header-controls-visibility', headerControlsVisibility, 'selected');
		settings.bind('show-item-title', showItemTitle, 'active', Gio.SettingsBindFlags.DEFAULT);
		makeResettable(headerControlsVisibility, settings, 'header-controls-visibility');
		showHeader.bind_property('active', showItemTitle, 'sensitive', GObject.BindingFlags.SYNC_CREATE);
	}
};
HeaderCustomization = __decorate([registerClass()], HeaderCustomization);

export { HeaderCustomization };
