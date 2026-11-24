import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { __decorate } from '../../../thirdparty/tslib.js';
import { registerClass } from '../../common/gjs.js';
import { makeResettable } from '../utils.js';

let ItemCustomization = class ItemCustomization extends Adw.PreferencesGroup {
	constructor(prefs) {
		super({
			title: _('Schede appunti'),
		});
		const itemWidth = new Adw.SpinRow({
			title: _('Larghezza scheda'),
			subtitle: _('Larghezza in pixel di ogni card'),
			adjustment: new Gtk.Adjustment({
				lower: 150,
				upper: 1000,
				step_increment: 5,
				page_increment: 20,
				value: 240,
			}),
		});
		this.add(itemWidth);
		const itemHeight = new Adw.SpinRow({
			title: _('Altezza scheda'),
			subtitle: _('Altezza in pixel di ogni card'),
			adjustment: new Gtk.Adjustment({
				lower: 50,
				upper: 1000,
				step_increment: 5,
				page_increment: 20,
				value: 165,
			}),
		});
		this.add(itemHeight);
		const dynamicHeight = new Adw.SwitchRow({
			title: _('Altezza dinamica'),
			subtitle: _('Adatta l\'altezza in base al contenuto (solo layout verticale)'),
		});
		this.add(dynamicHeight);
		const tabWidth = new Adw.SpinRow({
			title: _('Larghezza tabulazione'),
			subtitle: _('Numero di spazi per carattere tab nei testi'),
			adjustment: new Gtk.Adjustment({ lower: 1, upper: 8, step_increment: 1, value: 4 }),
		});
		this.add(tabWidth);
		const settings = prefs.getSettings();
		settings.bind('item-width', itemWidth, 'value', Gio.SettingsBindFlags.DEFAULT);
		settings.bind('item-height', itemHeight, 'value', Gio.SettingsBindFlags.DEFAULT);
		settings.bind('dynamic-item-height', dynamicHeight, 'active', Gio.SettingsBindFlags.DEFAULT);
		settings.bind('tab-width', tabWidth, 'value', Gio.SettingsBindFlags.DEFAULT);
		dynamicHeight.sensitive = settings.get_enum('clipboard-orientation') === 1;
		settings.connect(
			'changed::clipboard-orientation',
			() => (dynamicHeight.sensitive = settings.get_enum('clipboard-orientation') === 1),
		);
		makeResettable(itemWidth, settings, 'item-width');
		makeResettable(itemHeight, settings, 'item-height');
		makeResettable(tabWidth, settings, 'tab-width');
	}
};
ItemCustomization = __decorate([registerClass()], ItemCustomization);

export { ItemCustomization };
