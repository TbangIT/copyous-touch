import Adw from 'gi://Adw';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { __decorate } from '../../../thirdparty/tslib.js';
import { registerClass } from '../../common/gjs.js';
import { ShortcutRow } from './shortcutRow.js';

let PopupMenuShortcuts = class PopupMenuShortcuts extends Adw.PreferencesGroup {
	constructor() {
		super({ title: _('Menu a comparsa') });
		this.add(new ShortcutRow(_('Seleziona tipo elemento'), '0...9'));
	}
};
PopupMenuShortcuts = __decorate([registerClass()], PopupMenuShortcuts);

export { PopupMenuShortcuts };
