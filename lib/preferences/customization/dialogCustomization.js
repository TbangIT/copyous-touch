import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { __decorate } from '../../../thirdparty/tslib.js';
import { registerClass } from '../../common/gjs.js';
import { bind_enum } from '../../common/settings.js';
import { makeResettable } from '../utils.js';

let DialogCustomization = class DialogCustomization extends Adw.PreferencesGroup {
	_showAtPointer;
	_showAtCursor;
	_orientation;
	_horizontal;
	_horizontalPosition;
	_vertical;
	_verticalPosition;
	_size;

	constructor(prefs) {
		super({
			title: _('Cassetto'),
		});
		const position = new Adw.ExpanderRow({
			title: _('Posizionamento'),
			subtitle: _('Allineamento e orientamento del cassetto'),
		});
		this.add(position);
		this._showAtPointer = new Adw.SwitchRow({
			title: _('Segui puntatore'),
			subtitle: _('Mostra il cassetto alla posizione del mouse'),
		});
		position.add_row(this._showAtPointer);
		this._showAtPointer.connect('notify::active', this.updateShowAtPointer.bind(this));
		this._showAtCursor = new Adw.SwitchRow({
			title: _('Segui cursore testo'),
			subtitle: _('Mostra alla posizione del cursore di digitazione'),
		});
		position.add_row(this._showAtCursor);
		this._orientation = new Adw.ComboRow({
			title: _('Orientamento'),
			subtitle: _('Disposizione orizzontale o verticale'),
			model: Gtk.StringList.new([_('Orizzontale'), _('Verticale')]),
		});
		position.add_row(this._orientation);
		this._orientation.connect('notify::selected', this.updateOrientation.bind(this));
		this._vertical = Gtk.StringList.new([_('In alto'), _('Al centro'), _('In basso'), _('Espanso')]);
		this._verticalPosition = new Adw.ComboRow({
			title: _('Posizione verticale'),
			subtitle: _('Allineamento verticale sullo schermo'),
			model: this._vertical,
		});
		position.add_row(this._verticalPosition);
		this._verticalPosition.connect('notify::selected', this.updatePosition.bind(this));
		this._horizontal = Gtk.StringList.new([_('A sinistra'), _('Al centro'), _('A destra'), _('Espanso')]);
		this._horizontalPosition = new Adw.ComboRow({
			title: _('Posizione orizzontale'),
			subtitle: _('Allineamento orizzontale sullo schermo'),
			model: this._horizontal,
		});
		position.add_row(this._horizontalPosition);
		this._horizontalPosition.connect('notify::selected', this.updatePosition.bind(this));
		this._size = new Adw.SpinRow({
			adjustment: new Gtk.Adjustment({ lower: 200, upper: 10000, step_increment: 1, value: 500 }),
		});
		position.add_row(this._size);
		const margins = new Adw.ExpanderRow({
			title: _('Margini schermo'),
			subtitle: _('Distanza dai bordi del display'),
		});
		this.add(margins);
		const topMargin = new Adw.SpinRow({
			title: _('Alto'),
			subtitle: _('Pixel dal bordo superiore'),
			adjustment: new Gtk.Adjustment({ lower: 0, upper: 1000, step_increment: 1, value: 0 }),
		});
		margins.add_row(topMargin);
		const rightMargin = new Adw.SpinRow({
			title: _('Destra'),
			subtitle: _('Pixel dal bordo destro'),
			adjustment: new Gtk.Adjustment({ lower: 0, upper: 1000, step_increment: 1, value: 0 }),
		});
		margins.add_row(rightMargin);
		const bottomMargin = new Adw.SpinRow({
			title: _('Basso'),
			subtitle: _('Pixel dal bordo inferiore'),
			adjustment: new Gtk.Adjustment({ lower: 0, upper: 1000, step_increment: 1, value: 4 }),
		});
		margins.add_row(bottomMargin);
		const leftMargin = new Adw.SpinRow({
			title: _('Sinistra'),
			subtitle: _('Pixel dal bordo sinistro'),
			adjustment: new Gtk.Adjustment({ lower: 0, upper: 1000, step_increment: 1, value: 0 }),
		});
		margins.add_row(leftMargin);
		const autoHideSearch = new Adw.SwitchRow({
			title: _('Comprimi ricerca'),
			subtitle: _('Comprimi la barra di ricerca quando non attiva'),
		});
		this.add(autoHideSearch);
		const showScrollbar = new Adw.SwitchRow({
			title: _('Barra di scorrimento'),
			subtitle: _('Visualizza indicatore di scorrimento schede'),
		});
		this.add(showScrollbar);

		// Bind properties
		const settings = prefs.getSettings();
		settings.bind('show-at-pointer', this._showAtPointer, 'active', Gio.SettingsBindFlags.DEFAULT);
		settings.bind('show-at-cursor', this._showAtCursor, 'active', Gio.SettingsBindFlags.DEFAULT);
		bind_enum(settings, 'clipboard-orientation', this._orientation, 'selected');
		bind_enum(settings, 'clipboard-position-vertical', this._verticalPosition, 'selected');
		bind_enum(settings, 'clipboard-position-horizontal', this._horizontalPosition, 'selected');
		settings.bind('clipboard-size', this._size, 'value', Gio.SettingsBindFlags.DEFAULT);
		settings.bind('clipboard-margin-top', topMargin, 'value', Gio.SettingsBindFlags.DEFAULT);
		settings.bind('clipboard-margin-right', rightMargin, 'value', Gio.SettingsBindFlags.DEFAULT);
		settings.bind('clipboard-margin-bottom', bottomMargin, 'value', Gio.SettingsBindFlags.DEFAULT);
		settings.bind('clipboard-margin-left', leftMargin, 'value', Gio.SettingsBindFlags.DEFAULT);
		settings.bind('auto-hide-search', autoHideSearch, 'active', Gio.SettingsBindFlags.DEFAULT);
		settings.bind('show-scrollbar', showScrollbar, 'active', Gio.SettingsBindFlags.DEFAULT);
		makeResettable(
			position,
			settings,
			'show-at-pointer',
			'show-at-cursor',
			'clipboard-orientation',
			'clipboard-position-vertical',
			'clipboard-position-horizontal',
			'clipboard-size',
		);
		makeResettable(
			margins,
			settings,
			'clipboard-margin-top',
			'clipboard-margin-right',
			'clipboard-margin-bottom',
			'clipboard-margin-left',
		);
		makeResettable(topMargin, settings, 'clipboard-margin-top');
		makeResettable(rightMargin, settings, 'clipboard-margin-right');
		makeResettable(bottomMargin, settings, 'clipboard-margin-bottom');
		makeResettable(leftMargin, settings, 'clipboard-margin-left');

		// Update
		this.updateShowAtPointer();
		this.updateOrientation();
		this.updatePosition();
	}

	updateShowAtPointer() {
		this._horizontalPosition.sensitive = !this._showAtPointer.active;
		this._verticalPosition.sensitive = !this._showAtPointer.active;
		this._showAtCursor.sensitive = this._showAtPointer.active;
		this.updatePosition();
	}

	updateOrientation() {
		const horizontal = this._orientation.selected === 0;

		const horizontalPosition = this._horizontalPosition.selected;
		const verticalPosition = this._verticalPosition.selected;

		const horizontalFill = this._horizontal.get_item(3) !== null;
		const verticalFill = this._vertical.get_item(3) !== null;
		if (horizontal) {
			if (!horizontalFill) this._horizontal.append(_('Espanso'));
			if (verticalFill) this._vertical.remove(3);
		} else {
			if (horizontalFill) this._horizontal.remove(3);
			if (!verticalFill) this._vertical.append(_('Espanso'));
		}

		if (horizontal && verticalPosition === 3) {
			this._verticalPosition.selected = horizontalPosition;
			this._horizontalPosition.selected = 3;
		} else if (!horizontal && horizontalPosition === 3) {
			this._horizontalPosition.selected = verticalPosition;
			this._verticalPosition.selected = 3;
		}

		if (horizontal) {
			this._size.title = _('Larghezza');
			this._size.subtitle = _('Larghezza del cassetto');
		} else {
			this._size.title = _('Altezza');
			this._size.subtitle = _('Altezza del cassetto');
		}
	}

	updatePosition() {
		const fill = this._verticalPosition.selected === 3 || this._horizontalPosition.selected === 3;
		this._size.sensitive = !fill || this._showAtPointer.active;
	}
};
DialogCustomization = __decorate([registerClass()], DialogCustomization);

export { DialogCustomization };
