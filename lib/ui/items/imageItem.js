import Gio from 'gi://Gio';
import GObject from 'gi://GObject';

import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import { __decorate } from '../../../thirdparty/tslib.js';
import { registerClass } from '../../common/gjs.js';
import { Icon } from '../../common/icons.js';
import { ImagePreview } from '../components/contentPreview.js';
import { ClipboardItem } from './clipboardItem.js';

let ImageItem = class ImageItem extends ClipboardItem {
	imageItemSettings;
	_imagePreview;

	constructor(ext, entry) {
		super(ext, entry, Icon.Image, _('Image'));
		this.imageItemSettings = this.ext.settings.get_child('image-item');
		this.add_style_class_name('image-item');
		const file = Gio.File.new_for_uri(entry.content);
		this._imagePreview = new ImagePreview(ext, file);
		this._content.add_child(this._imagePreview);

		// Bind properties
		this.imageItemSettings.connectObject(
			'changed::show-image-info',
			this.updateSettings.bind(this),
			'changed::background-size',
			this.updateSettings.bind(this),
			this,
		);
		this.updateSettings();

		// Hover effect
		this.bind_property('active', this._imagePreview, 'active', GObject.BindingFlags.DEFAULT);
	}

	search(query) {
		this.visible = query.matchesEntry(this.visible, this.entry);
	}

	updateSettings() {
		this._imagePreview.backgroundSize = this.imageItemSettings.get_enum('background-size');
		this.updateBadge();
	}

	destroy() {
		this.imageItemSettings.disconnectObject(this);
		super.destroy();
	}
};
ImageItem = __decorate([registerClass()], ImageItem);

export { ImageItem };
