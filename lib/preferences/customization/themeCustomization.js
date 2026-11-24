import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { __decorate } from '../../../thirdparty/tslib.js';
import { registerClass } from '../../common/gjs.js';
import { bind_enum } from '../../common/settings.js';
import { makeResettable } from '../utils.js';

let ThemeCustomization = class ThemeCustomization extends Adw.PreferencesGroup {
	constructor(prefs) {
		super({
			title: _('Tema cassetto'),
		});
		const themeRow = new Adw.ComboRow({
			title: _('Tema'),
			subtitle: _('Si applica a cassetto, menu delle schede, menu di ricerca e sottomenu'),
			model: Gtk.StringList.new([
				_('GTK / Adwaita (solido)'),
				_('Personalizzato (traslucido)'),
			]),
		});
		this.add(themeRow);

		const settings = prefs.getSettings();
		bind_enum(settings, 'drawer-theme', themeRow, 'selected');
		makeResettable(themeRow, settings, 'drawer-theme');
	}
};
ThemeCustomization = __decorate([registerClass()], ThemeCustomization);

export { ThemeCustomization };
