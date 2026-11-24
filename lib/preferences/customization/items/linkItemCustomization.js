import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { __decorate } from '../../../../thirdparty/tslib.js';
import { registerClass } from '../../../common/gjs.js';
import { Icon } from '../../../common/icons.js';
import { bind_enum } from '../../../common/settings.js';
import { makeResettable } from '../../utils.js';
import { ExclusionsGroup } from './exclusions.js';

let LinkExclusionsPage = class LinkExclusionsPage extends Adw.NavigationPage {
	constructor(window) {
		super({
			title: _('Esclusioni link'),
		});
		const toolbarView = new Adw.ToolbarView();
		toolbarView.add_top_bar(new Adw.HeaderBar());
		this.set_child(toolbarView);
		const page = new Adw.PreferencesPage();
		toolbarView.content = page;

		// Link Exclusion Patterns
		const linkPreviewExclusionPatternsGroup = new ExclusionsGroup(
			window,
			_('Aggiungi pattern'),
			_('Inserisci un\'espressione regolare per escludere link dall\'anteprima.'),
			_('Link'),
			false,
			{
				title: _('Pattern di esclusione'),
				description: _('I link corrispondenti non avranno anteprima'),
			},
		);
		page.add(linkPreviewExclusionPatternsGroup);
		this.bind_property(
			'link-preview-exclusion-patterns',
			linkPreviewExclusionPatternsGroup,
			'exclusion-patterns',
			GObject.BindingFlags.BIDIRECTIONAL,
		);
	}
};
LinkExclusionsPage = __decorate(
	[
		registerClass({
			Properties: {
				'link-preview-exclusion-patterns': GObject.ParamSpec.boxed(
					'link-preview-exclusion-patterns',
					null,
					null,
					GObject.ParamFlags.READWRITE,
					GLib.strv_get_type(),
				),
			},
		}),
	],
	LinkExclusionsPage,
);
let LinkItemCustomization = class LinkItemCustomization extends Adw.ExpanderRow {
	constructor(prefs, window) {
		super({
			title: _('Elemento link'),
			subtitle: _('Opzioni per indirizzi web'),
		});
		const showLinkPreview = new Adw.SwitchRow({
			title: _('Anteprima link'),
			subtitle: _('Mostra titolo e descrizione della pagina web'),
		});
		this.add_row(showLinkPreview);
		const showLinkPreviewImage = new Adw.SwitchRow({
			title: _('Immagine anteprima'),
			subtitle: _('Mostra immagine della pagina web'),
		});
		this.add_row(showLinkPreviewImage);
		const linkPreviewImageBackgroundSize = new Adw.ComboRow({
			title: _('Adattamento immagine'),
			subtitle: _('Modalità riempimento anteprima'),
			model: Gtk.StringList.new([_('Riempi (Cover)'), _('Adatta (Contain)')]),
		});
		this.add_row(linkPreviewImageBackgroundSize);
		const linkPreviewOrientation = new Adw.ComboRow({
			title: _('Orientamento anteprima'),
			subtitle: _('Disposizione orizzontale o verticale'),
			model: Gtk.StringList.new([_('Orizzontale'), _('Verticale')]),
		});
		this.add_row(linkPreviewOrientation);
		const linkExclusionsPage = new LinkExclusionsPage(window);
		const configureLinkExclusions = new Adw.ActionRow({
			title: _('Esclusioni link'),
			subtitle: _('Gestisci pattern esclusi dall\'anteprima'),
			activatable: true,
		});
		configureLinkExclusions.add_suffix(new Gtk.Image({ icon_name: Icon.Next }));
		this.add_row(configureLinkExclusions);
		configureLinkExclusions.connect('activated', () => window.push_subpage(linkExclusionsPage));

		// Bind properties
		const settings = prefs.getSettings().get_child('link-item');
		settings.bind('show-link-preview', showLinkPreview, 'active', Gio.SettingsBindFlags.DEFAULT);
		settings.bind('show-link-preview-image', showLinkPreviewImage, 'active', Gio.SettingsBindFlags.DEFAULT);
		bind_enum(settings, 'link-preview-image-background-size', linkPreviewImageBackgroundSize, 'selected');
		bind_enum(settings, 'link-preview-orientation', linkPreviewOrientation, 'selected');
		settings.bind(
			'link-preview-exclusion-patterns',
			linkExclusionsPage,
			'link-preview-exclusion-patterns',
			Gio.SettingsBindFlags.DEFAULT,
		);
		makeResettable(linkPreviewImageBackgroundSize, settings, 'link-preview-image-background-size');
		makeResettable(linkPreviewOrientation, settings, 'link-preview-orientation');
		showLinkPreview.bind_property('active', showLinkPreviewImage, 'sensitive', GObject.BindingFlags.SYNC_CREATE);

		// Background size
		function updateSensitive() {
			const sensitive = showLinkPreviewImage.sensitive && showLinkPreviewImage.active;
			linkPreviewImageBackgroundSize.sensitive = sensitive;
			linkPreviewOrientation.sensitive = sensitive;
		}

		updateSensitive();
		showLinkPreviewImage.connect('notify::sensitive', () => updateSensitive());
		showLinkPreviewImage.connect('notify::active', () => updateSensitive());
	}
};
LinkItemCustomization = __decorate([registerClass()], LinkItemCustomization);

export { LinkItemCustomization };
