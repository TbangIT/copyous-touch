import Adw from 'gi://Adw';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { __decorate } from '../../../thirdparty/tslib.js';
import { registerClass } from '../../common/gjs.js';
import { ShortcutRow } from './shortcutRow.js';

let NavigationShortcuts = class NavigationShortcuts extends Adw.PreferencesGroup {
	constructor() {
		super({
			title: _('Navigazione'),
		});
		this.add(new ShortcutRow(_('Naviga tra schede'), 'Tab Up Down Left Right'));
		this.add(new ShortcutRow(_('Vai alla scheda 0-9'), '<Ctrl>0...9'));
		this.add(new ShortcutRow(_('Vai all\'inizio'), 'Home'));
		this.add(new ShortcutRow(_('Vai alla fine'), 'End'));
		this.add(new ShortcutRow(_('Vai alla ricerca'), '<Ctrl>F'));
	}
};
NavigationShortcuts = __decorate([registerClass()], NavigationShortcuts);

export { NavigationShortcuts };
