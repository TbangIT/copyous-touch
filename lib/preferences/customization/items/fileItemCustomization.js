import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { __decorate } from '../../../../thirdparty/tslib.js';
import { flagsParamSpec, registerClass } from '../../../common/gjs.js';
import { Icon } from '../../../common/icons.js';
import { bind_enum, bind_flags } from '../../../common/settings.js';
import { makeResettable } from '../../utils.js';
import { ExclusionsGroup } from './exclusions.js';

const FilePreviewType = {
	None: 0,
	Text: 0b001,
	Image: 0b010,
	Thumbnail: 0b100,
	All: 0b111,
};
let FileExclusionsPage = class FileExclusionsPage extends Adw.NavigationPage {
	_filePreviewTypes = FilePreviewType.All;
	_textPreview;
	_imagePreview;
	_thumbnailPreview;

	constructor(window) {
		super({
			title: _('Esclusioni file'),
		});
		const toolbarView = new Adw.ToolbarView();
		toolbarView.add_top_bar(new Adw.HeaderBar());
		this.set_child(toolbarView);
		const page = new Adw.PreferencesPage();
		toolbarView.content = page;

		// File Preview Type
		const filePreviewType = new Adw.PreferencesGroup({
			title: _('Tipi di anteprima'),
		});
		page.add(filePreviewType);
		this._textPreview = new Adw.SwitchRow({
			title: _('Testo'),
			subtitle: _('Anteprima per file testuali'),
			active: true,
		});
		this._textPreview.connect('notify::active', () =>
			this.setFilePreviewType(FilePreviewType.Text, this._textPreview.active),
		);
		filePreviewType.add(this._textPreview);
		this._imagePreview = new Adw.SwitchRow({
			title: _('Immagine'),
			subtitle: _('Anteprima per immagini'),
			active: true,
		});
		this._imagePreview.connect('notify::active', () =>
			this.setFilePreviewType(FilePreviewType.Image, this._imagePreview.active),
		);
		filePreviewType.add(this._imagePreview);
		this._thumbnailPreview = new Adw.SwitchRow({
			title: _('Miniatura'),
			subtitle: _('Anteprima da miniature generate'),
			active: true,
		});
		this._thumbnailPreview.connect('notify::active', () =>
			this.setFilePreviewType(FilePreviewType.Thumbnail, this._thumbnailPreview.active),
		);
		filePreviewType.add(this._thumbnailPreview);

		// File Exclusion Patterns
		const filePreviewExclusionPatternsGroup = new ExclusionsGroup(
			window,
			_('Aggiungi pattern'),
			_('Inserisci un pattern glob per escludere file dall\'anteprima.'),
			_('Percorso'),
			true,
			{
				title: _('Pattern di esclusione'),
				description: _('I file corrispondenti non avranno anteprima'),
			},
		);
		page.add(filePreviewExclusionPatternsGroup);
		this.bind_property(
			'file-preview-exclusion-patterns',
			filePreviewExclusionPatternsGroup,
			'exclusion-patterns',
			GObject.BindingFlags.BIDIRECTIONAL,
		);
	}

	get filePreviewTypes() {
		return this._filePreviewTypes;
	}

	set filePreviewTypes(types) {
		if (this._filePreviewTypes === types) return;
		this._filePreviewTypes = types;
		this._textPreview.active = (types & FilePreviewType.Text) > 0;
		this._imagePreview.active = (types & FilePreviewType.Image) > 0;
		this._thumbnailPreview.active = (types & FilePreviewType.Thumbnail) > 0;
		this.notify('file-preview-types');
	}

	setFilePreviewType(type, active) {
		if (active) {
			this.filePreviewTypes |= type;
		} else {
			this.filePreviewTypes &= ~type;
		}
	}
};
FileExclusionsPage = __decorate(
	[
		registerClass({
			Properties: {
				'file-preview-types': flagsParamSpec(
					'file-preview-types',
					GObject.ParamFlags.READWRITE,
					FilePreviewType,
					FilePreviewType.All,
				),
				'file-preview-exclusion-patterns': GObject.ParamSpec.boxed(
					'file-preview-exclusion-patterns',
					null,
					null,
					GObject.ParamFlags.READWRITE,
					GLib.strv_get_type(),
				),
			},
		}),
	],
	FileExclusionsPage,
);
let FileItemCustomization = class FileItemCustomization extends Adw.ExpanderRow {
	constructor(prefs, window) {
		super({
			title: _('Elemento file'),
			subtitle: _('Opzioni per file copiati'),
		});
		const filePreviewVisibility = new Adw.ComboRow({
			title: _('Visibilità anteprima'),
			subtitle: _('Mostra anteprima del contenuto o informazioni del file'),
			model: Gtk.StringList.new([
				_('Anteprima'),
				_('Info file'),
				_('Anteprima o info'),
				_('Anteprima e info'),
				_('Nascosto'),
			]),
		});
		this.add_row(filePreviewVisibility);
		const fileExclusionsPage = new FileExclusionsPage(window);
		const backgroundSize = new Adw.ComboRow({
			title: _('Adattamento sfondo'),
			subtitle: _('Modalità ridimensionamento anteprima immagine'),
			model: Gtk.StringList.new([_('Riempi (Cover)'), _('Adatta (Contain)')]),
		});
		this.add_row(backgroundSize);
		const syntaxHighlighting = new Adw.SwitchRow({
			title: _('Evidenziazione sintassi'),
			subtitle: _('Colora sintassi nei file di testo'),
		});
		this.add_row(syntaxHighlighting);
		const showLineNumbers = new Adw.SwitchRow({
			title: _('Numeri di riga'),
			subtitle: _('Mostra numerazione righe nei file di testo'),
		});
		this.add_row(showLineNumbers);
		const configureFileExclusions = new Adw.ActionRow({
			title: _('Esclusioni file'),
			subtitle: _('Gestisci tipi e pattern esclusi dall\'anteprima'),
			activatable: true,
		});
		configureFileExclusions.add_suffix(new Gtk.Image({ icon_name: Icon.Next }));
		this.add_row(configureFileExclusions);
		configureFileExclusions.connect('activated', () => window.push_subpage(fileExclusionsPage));

		// Bind properties
		const settings = prefs.getSettings().get_child('file-item');
		bind_enum(settings, 'file-preview-visibility', filePreviewVisibility, 'selected');
		bind_flags(settings, 'file-preview-types', fileExclusionsPage, 'file-preview-types');
		settings.bind(
			'file-preview-exclusion-patterns',
			fileExclusionsPage,
			'file-preview-exclusion-patterns',
			Gio.SettingsBindFlags.DEFAULT,
		);
		bind_enum(settings, 'background-size', backgroundSize, 'selected');
		settings.bind('syntax-highlighting', syntaxHighlighting, 'active', Gio.SettingsBindFlags.DEFAULT);
		settings.bind('show-line-numbers', showLineNumbers, 'active', Gio.SettingsBindFlags.DEFAULT);
		makeResettable(filePreviewVisibility, settings, 'file-preview-visibility');
		makeResettable(backgroundSize, settings, 'background-size');
	}
};
FileItemCustomization = __decorate([registerClass()], FileItemCustomization);

export { FileItemCustomization };
