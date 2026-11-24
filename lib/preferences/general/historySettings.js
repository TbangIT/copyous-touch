import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { __decorate } from '../../../thirdparty/tslib.js';
import { getDataPath, getDefaultDatabaseFile } from '../../common/constants.js';
import { registerClass } from '../../common/gjs.js';
import { bind_enum } from '../../common/settings.js';
import { makeResettable } from '../utils.js';

Gio._promisify(Gtk.FileDialog.prototype, 'open', 'open_finish');

let HistorySettings = class HistorySettings extends Adw.PreferencesGroup {
	prefs;
	window;
	_settings;
	_defaultDatabaseLocation;
	_databaseLocation;
	_clipboardHistory;
	_timeUnit;
	_timeValue;
	_updating = false;

	constructor(prefs, window) {
		super({
			title: _('Cronologia e memoria'),
		});
		this.prefs = prefs;
		this.window = window;
		this._settings = prefs.getSettings();
		this._defaultDatabaseLocation = getDefaultDatabaseFile(prefs).get_path();

		// Politica di conservazione
		this._clipboardHistory = new Adw.ComboRow({
			title: _('Criterio al riavvio'),
			subtitle: _('Gestione degli appunti dopo logout o riavvio'),
			model: Gtk.StringList.new([_('Cancella'), _('Mantieni fissati/taggati'), _('Conserva tutto')]),
		});
		this.add(this._clipboardHistory);

		// Limite elementi
		const historyLength = new Adw.SpinRow({
			title: _('Elementi massimi'),
			subtitle: _('Numero massimo di appunti da conservare'),
			adjustment: new Gtk.Adjustment({ lower: 10, upper: 500, step_increment: 5, page_increment: 10, value: 50 }),
		});
		this.add(historyLength);

		// Unità di tempo conservazione
		this._timeUnit = new Adw.ComboRow({
			title: _('Unità di conservazione'),
			subtitle: _('Scegli minuti, ore, giorni o illimitato'),
			model: Gtk.StringList.new([_('Minuti'), _('Ore'), _('Giorni'), _('Sempre conservati')]),
		});
		this.add(this._timeUnit);

		// Valore durata
		this._timeValue = new Adw.SpinRow({
			title: _('Durata conservazione'),
			subtitle: _('Tempo prima dell\'eliminazione automatica'),
			adjustment: new Gtk.Adjustment({ lower: 1, upper: 365, step_increment: 1, page_increment: 5, value: 1 }),
		});
		this.add(this._timeValue);

		// Percorso database
		this._databaseLocation = new Adw.ActionRow({
			title: _('File di archivio'),
			subtitle: this._defaultDatabaseLocation,
			activatable: true,
		});
		this._databaseLocation.connect('activated', () => this.openDatabaseLocation(window));
		this.add(this._databaseLocation);

		// Collegamenti impostazioni
		this._settings.bind('database-location', this, 'database-location', Gio.SettingsBindFlags.DEFAULT);
		bind_enum(this._settings, 'clipboard-history', this._clipboardHistory, 'selected');
		this._settings.bind('history-length', historyLength, 'value', Gio.SettingsBindFlags.DEFAULT);

		// Sincronizzazione tempo con unità (minuti/ore/giorni/illimitato)
		this._timeUnit.connect('notify::selected', () => this.onTimeInputChanged());
		this._timeValue.connect('notify::value', () => this.onTimeInputChanged());
		this._settings.connect('changed::history-time', () => this.syncFromSettings());
		this.syncFromSettings();

		makeResettable(this._databaseLocation, this._settings, 'database-location');
		makeResettable(this._clipboardHistory, this._settings, 'clipboard-history');
		makeResettable(historyLength, this._settings, 'history-length');
	}

	syncFromSettings() {
		if (this._updating) return;
		this._updating = true;
		const minutes = this._settings.get_int('history-time');
		if (minutes <= 0) {
			this._timeUnit.selected = 3; // Sempre conservati
			this._timeValue.sensitive = false;
		} else if (minutes % 1440 === 0) {
			this._timeUnit.selected = 2; // Giorni
			this._timeValue.adjustment.set_lower(1);
			this._timeValue.adjustment.set_upper(365);
			this._timeValue.value = Math.max(1, Math.round(minutes / 1440));
			this._timeValue.sensitive = true;
		} else if (minutes % 60 === 0) {
			this._timeUnit.selected = 1; // Ore
			this._timeValue.adjustment.set_lower(1);
			this._timeValue.adjustment.set_upper(72);
			this._timeValue.value = Math.max(1, Math.round(minutes / 60));
			this._timeValue.sensitive = true;
		} else {
			this._timeUnit.selected = 0; // Minuti
			this._timeValue.adjustment.set_lower(5);
			this._timeValue.adjustment.set_upper(1440);
			this._timeValue.value = minutes;
			this._timeValue.sensitive = true;
		}
		this._updating = false;
	}

	onTimeInputChanged() {
		if (this._updating) return;
		this._updating = true;
		const unit = this._timeUnit.selected;
		let totalMinutes = 0;
		if (unit === 3) {
			// Sempre conservati
			this._timeValue.sensitive = false;
			totalMinutes = 0;
		} else {
			this._timeValue.sensitive = true;
			if (unit === 2) {
				// Giorni
				this._timeValue.adjustment.set_lower(1);
				this._timeValue.adjustment.set_upper(365);
				totalMinutes = Math.round(this._timeValue.value) * 1440;
			} else if (unit === 1) {
				// Ore
				this._timeValue.adjustment.set_lower(1);
				this._timeValue.adjustment.set_upper(72);
				totalMinutes = Math.round(this._timeValue.value) * 60;
			} else {
				// Minuti
				this._timeValue.adjustment.set_lower(5);
				this._timeValue.adjustment.set_upper(1440);
				totalMinutes = Math.round(this._timeValue.value);
			}
		}
		this._settings.set_int('history-time', totalMinutes);
		this._updating = false;
	}

	get databaseLocation() {
		if (this._databaseLocation.subtitle === this._defaultDatabaseLocation) {
			return '';
		} else {
			return this._databaseLocation.subtitle ?? '';
		}
	}

	set databaseLocation(value) {
		if (value === '') {
			this._databaseLocation.subtitle = this._defaultDatabaseLocation;
		} else {
			this._databaseLocation.subtitle = value;
		}
		this.notify('database-location');
	}

	async openDatabaseLocation(window) {
		const dialog = new Gtk.FileDialog({
			title: _('Scegli cartella archivio'),
			modal: true,
		});
		try {
			const folder = await dialog.open(window, null);
			if (folder) {
				const file = folder.get_child('clipboard.json');
				this.databaseLocation = file.get_path();
			}
		} catch {}
	}
};

HistorySettings = __decorate(
	[
		registerClass({
			Properties: {
				'database-location': GObject.ParamSpec.string(
					'database-location',
					null,
					null,
					GObject.ParamFlags.READWRITE,
					'',
				),
			},
		}),
	],
	HistorySettings,
);

export { HistorySettings };
