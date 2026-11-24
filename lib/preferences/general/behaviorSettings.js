import Adw from 'gi://Adw';
import Gio from 'gi://Gio';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { __decorate } from '../../../thirdparty/tslib.js';
import { registerClass } from '../../common/gjs.js';

let BehaviorSettings = class BehaviorSettings extends Adw.PreferencesGroup {
	constructor(prefs) {
		super({
			title: _('Comportamento'),
		});
		const rememberSearch = new Adw.SwitchRow({
			title: _('Ricorda ricerca'),
			subtitle: _('Mantiene il testo cercato alla riapertura'),
		});
		this.add(rememberSearch);
		const excludePinned = new Adw.SwitchRow({
			title: _('Nascondi elementi fissati'),
			subtitle: _('Visibili solo filtrando per fissati'),
		});
		this.add(excludePinned);
		const excludeTagged = new Adw.SwitchRow({
			title: _('Nascondi elementi con etichetta'),
			subtitle: _('Visibili solo filtrando per etichetta'),
		});
		this.add(excludeTagged);
		const protectPinned = new Adw.SwitchRow({
			title: _('Proteggi elementi fissati'),
			subtitle: _('Impedisce l\'eliminazione degli appunti fissati'),
		});
		this.add(protectPinned);
		const protectTagged = new Adw.SwitchRow({
			title: _('Proteggi elementi con etichetta'),
			subtitle: _('Impedisce l\'eliminazione degli appunti con etichetta'),
		});
		this.add(protectTagged);
		const syncPrimary = new Adw.SwitchRow({
			title: _('Sincronizza selezione primaria'),
			subtitle: _('Copia anche negli appunti primari del mouse'),
		});
		this.add(syncPrimary);
		const updateDateOnCopy = new Adw.SwitchRow({
			title: _('Aggiorna data al riutilizzo'),
			subtitle: _('Riporta in cima l\'appunto quando viene incollato'),
		});
		this.add(updateDateOnCopy);

		// Bind properties
		const settings = prefs.getSettings();
		settings.bind('remember-search', rememberSearch, 'active', Gio.SettingsBindFlags.DEFAULT);
		settings.bind('exclude-pinned', excludePinned, 'active', Gio.SettingsBindFlags.DEFAULT);
		settings.bind('exclude-tagged', excludeTagged, 'active', Gio.SettingsBindFlags.DEFAULT);
		settings.bind('protect-pinned', protectPinned, 'active', Gio.SettingsBindFlags.DEFAULT);
		settings.bind('protect-tagged', protectTagged, 'active', Gio.SettingsBindFlags.DEFAULT);
		settings.bind('sync-primary', syncPrimary, 'active', Gio.SettingsBindFlags.DEFAULT);
		settings.bind('update-date-on-copy', updateDateOnCopy, 'active', Gio.SettingsBindFlags.DEFAULT);
	}
};
BehaviorSettings = __decorate([registerClass()], BehaviorSettings);

export { BehaviorSettings };
