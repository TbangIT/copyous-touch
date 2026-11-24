import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { __decorate } from '../../../../thirdparty/tslib.js';
import { registerClass } from '../../../common/gjs.js';
import { bind_enum } from '../../../common/settings.js';
import { makeResettable } from '../../utils.js';

let TextItemCustomization = class TextItemCustomization extends Adw.ExpanderRow {
	constructor(prefs) {
		super({
			title: _('Elemento testo'),
			subtitle: _('Opzioni per appunti testuali'),
		});
		const showTextInfo = new Adw.SwitchRow({
			title: _('Informazioni testo'),
			subtitle: _('Mostra conteggio metrico'),
		});
		this.add_row(showTextInfo);
		const textCounter = new Adw.ComboRow({
			title: _('Tipo di conteggio'),
			subtitle: _('Caratteri, parole o righe'),
			model: Gtk.StringList.new([_('Caratteri'), _('Parole'), _('Righe')]),
		});
		this.add_row(textCounter);

		// Bind properties
		const settings = prefs.getSettings().get_child('text-item');
		settings.bind('show-text-info', showTextInfo, 'active', Gio.SettingsBindFlags.DEFAULT);
		bind_enum(settings, 'text-count-mode', textCounter, 'selected');
		makeResettable(textCounter, settings, 'text-count-mode');
		showTextInfo.bind_property('active', textCounter, 'sensitive', GObject.BindingFlags.SYNC_CREATE);
	}
};
TextItemCustomization = __decorate([registerClass()], TextItemCustomization);

export { TextItemCustomization };
