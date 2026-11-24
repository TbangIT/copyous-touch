import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { __decorate } from '../../../../thirdparty/tslib.js';
import { registerClass } from '../../../common/gjs.js';
import { bind_enum } from '../../../common/settings.js';
import { makeResettable } from '../../utils.js';

let ImageItemCustomization = class ImageItemCustomization extends Adw.ExpanderRow {
	constructor(prefs) {
		super({
			title: _('Elemento immagine'),
			subtitle: _('Opzioni per immagini copiate'),
		});
		const backgroundSize = new Adw.ComboRow({
			title: _('Visualizzazione anteprima'),
			subtitle: _('Riempi la scheda o mostra l\'intera immagine'),
			model: Gtk.StringList.new([_('Riempi scheda (Filled / Cover)'), _('Non riempito (Adatta / Contain)')]),
		});
		this.add_row(backgroundSize);

		// Bind properties
		const settings = prefs.getSettings().get_child('image-item');
		bind_enum(settings, 'background-size', backgroundSize, 'selected');
		makeResettable(backgroundSize, settings, 'background-size');
	}
};
ImageItemCustomization = __decorate([registerClass()], ImageItemCustomization);

export { ImageItemCustomization };
