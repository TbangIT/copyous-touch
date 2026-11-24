import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { __decorate } from '../../../../thirdparty/tslib.js';
import { registerClass } from '../../../common/gjs.js';
import { bind_enum } from '../../../common/settings.js';
import { makeResettable } from '../../utils.js';

let CodeItemCustomization = class CodeItemCustomization extends Adw.ExpanderRow {
	constructor(prefs) {
		super({
			title: _('Elemento codice'),
			subtitle: _('Opzioni per snippet di codice'),
		});
		const syntaxHighlighting = new Adw.SwitchRow({
			title: _('Evidenziazione sintassi'),
			subtitle: _('Colora parole chiave e sintassi'),
		});
		this.add_row(syntaxHighlighting);
		const showLineNumbers = new Adw.SwitchRow({
			title: _('Numeri di riga'),
			subtitle: _('Mostra numerazione righe'),
		});
		this.add_row(showLineNumbers);
		const showCodeInfo = new Adw.SwitchRow({
			title: _('Informazioni codice'),
			subtitle: _('Mostra conteggio metrico'),
		});
		this.add_row(showCodeInfo);
		const textCounter = new Adw.ComboRow({
			title: _('Tipo di conteggio'),
			subtitle: _('Caratteri, parole o righe'),
			model: Gtk.StringList.new([_('Caratteri'), _('Parole'), _('Righe')]),
		});
		this.add_row(textCounter);

		// Bind properties
		const settings = prefs.getSettings().get_child('code-item');
		settings.bind('syntax-highlighting', syntaxHighlighting, 'active', Gio.SettingsBindFlags.DEFAULT);
		settings.bind('show-line-numbers', showLineNumbers, 'active', Gio.SettingsBindFlags.DEFAULT);
		settings.bind('show-code-info', showCodeInfo, 'active', Gio.SettingsBindFlags.DEFAULT);
		bind_enum(settings, 'text-count-mode', textCounter, 'selected');
		makeResettable(textCounter, settings, 'text-count-mode');
		showCodeInfo.bind_property('active', textCounter, 'sensitive', GObject.BindingFlags.SYNC_CREATE);
	}
};
CodeItemCustomization = __decorate([registerClass()], CodeItemCustomization);

export { CodeItemCustomization };
