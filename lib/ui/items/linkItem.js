import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Pango from 'gi://Pango';
import St from 'gi://St';

import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import { __decorate } from '../../../thirdparty/tslib.js';
import { ActiveState } from '../../common/constants.js';
import { enumParamSpec, flagsParamSpec, registerClass } from '../../common/gjs.js';
import { Icon } from '../../common/icons.js';
import { BackgroundSize } from '../../common/settings.js';
import { tryGetLinkImage, tryGetMetadata } from '../../misc/link.js';
import { ImagePreview } from '../components/contentPreview.js';
import { ClipboardItem } from './clipboardItem.js';

// Dopo un controllo senza risultati si riprova solo dopo un'ora
const METADATA_RETRY_MS = 60 * 60 * 1000;
const SPACING = 3;
const IMAGE_SPACING = 6;
let LinkPreview = class LinkPreview extends St.Widget {
	ext;
	_metadata = null;
	_showImage = false;
	_backgroundSize = BackgroundSize.Contain;
	_orientation = Clutter.Orientation.VERTICAL;
	_topPadding = false;
	_image;
	_title;
	_description;
	_url;
	_singleUrl;
	_cancellable = new Gio.Cancellable();

	constructor(ext, url) {
		super({
			style_class: 'link-preview',
			y_expand: true,
			y_align: Clutter.ActorAlign.FILL,
		});
		this.ext = ext;
		this._title = new St.Label({ style_class: 'link-title', visible: false });
		this.add_child(this._title);
		this._description = new St.Label({ style_class: 'link-description', visible: false });
		this._description.clutter_text.line_wrap = true;
		this._description.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
		this.add_child(this._description);
		this._url = new St.Label({ style_class: 'link-url small', text: url });
		this._url.clutter_text.line_wrap = true;
		this._url.clutter_text.line_wrap_mode = Pango.WrapMode.CHAR;
		this.add_child(this._url);
		this._singleUrl = new St.Label({ style_class: 'link-url', text: url });
		this._singleUrl.clutter_text.line_wrap = true;
		this._singleUrl.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
		this.add_child(this._singleUrl);
		this.configureMetadata();
	}

	get metadata() {
		return this._metadata;
	}

	set metadata(metadata) {
		this._metadata = metadata;
		this._title.text = metadata.title ?? _('No Title');
		this._title.style_class = metadata.title ? 'link-title' : 'link-title no-title';
		this._description.text = metadata.description ?? _('No Description');
		this._description.style_class = metadata.description ? 'link-description' : 'link-description no-description';
		this.configureMetadata();
		this.notify('metadata');
	}

	get showImage() {
		return this._showImage;
	}

	set showImage(showImage) {
		if (this._showImage === showImage) return;
		this._showImage = showImage;
		this.configureMetadata();
		this.notify('show-image');
	}

	get backgroundSize() {
		return this._backgroundSize;
	}

	set backgroundSize(backgroundSize) {
		if (this._backgroundSize === backgroundSize) return;
		this._backgroundSize = backgroundSize;
		if (this._image) this._image.backgroundSize = backgroundSize;
		this.notify('background-size');
	}

	get orientation() {
		return this._orientation;
	}

	set orientation(orientation) {
		if (this._orientation === orientation) return;
		this._orientation = orientation;
		this.notify('orientation');
	}

	set active(active) {
		if (this._image) this._image.active = active;
		this.notify('active');
	}

	set topPadding(topPadding) {
		if (this._topPadding === topPadding) return;
		this._topPadding = topPadding;
		this.notify('top-padding');
	}

	configureMetadata() {
		if (this._image) {
			this._image.visible = this._showImage;
		} else if (this._showImage) {
			// 1. Prova prima il file immagine locale permanente
			if (this._metadata?.localImage) {
				try {
					const localFile = Gio.File.new_for_uri(this._metadata.localImage);
					if (localFile.query_exists(null)) {
						this._image = new ImagePreview(this.ext, localFile);
						this._image.backgroundSize = this._backgroundSize;
						this._image.visible = this._showImage;
						this.insert_child_at_index(this._image, 0);
						this.queue_relayout();
					}
				} catch {
					// Fallback al download se il file locale non è leggibile
				}
			}

			// 2. Se non ancora caricata e c'è un'URL immagine, recupera e salva
			if (!this._image && this._metadata?.image && !this._imageFetching) {
				this._imageFetching = true;
				tryGetLinkImage(this.ext, this._metadata.image, this._cancellable)
					.then((image) => {
						this._imageFetching = false;
						if (image && !this._image) {
							this._image = new ImagePreview(this.ext, image);
							this._image.backgroundSize = this._backgroundSize;
							this._image.visible = this._showImage;
							this.insert_child_at_index(this._image, 0);
							this.queue_relayout();
							if (this._metadata) {
								this._metadata.localImage = image.get_uri();
								this.notify('metadata');
							}
						}
					})
					.catch(() => {
						this._imageFetching = false;
					});
			}
		}
		this._title.visible = this._metadata?.title != null || this._metadata?.description != null;
		this._description.visible = this._metadata?.title != null && this._metadata?.description != null;
		this.queue_relayout();
	}

	retryImageIfNeeded() {
		if (!this._image && this._metadata?.image && !this._imageFetching) {
			this.configureMetadata();
		}
	}

	vfunc_get_preferred_height(for_width) {
		const [, nat0] = this._image?.visible ? this._image.get_preferred_height(for_width) : [0, 0];
		const [, nat1] = this._title.visible ? this._title.get_preferred_height(for_width) : [0, 0];
		const [min2, nat2] = this._description.visible ? this._description.get_preferred_height(for_width) : [0, 0];
		const [min3, nat3] = this._url.get_preferred_height(for_width);
		const [min4, nat4] = this._singleUrl.get_preferred_height(for_width);
		const vertical = this.orientation === Clutter.Orientation.VERTICAL;
		if (vertical && nat0 > 0) {
			const nat = nat0 + nat1 + Math.min(nat2, min2) + min3 + IMAGE_SPACING;
			return [min4, Math.max(nat, nat4)];
		}
		const nat = nat1 + Math.min(nat2, min2 * 2) + nat3 + (this._topPadding ? SPACING : 0);
		return [min4, Math.max(nat, nat4)];
	}

	vfunc_allocate(box) {
		super.vfunc_allocate(box);
		const vertical = this.orientation === Clutter.Orientation.VERTICAL;
		const width = box.get_width();
		const height = box.get_height();
		const [, nat0] = this._image?.visible ? this._image.get_preferred_height(width) : [0, 0];
		let imageWidth, x;
		if (nat0 > 0) {
			imageWidth = vertical ? width : Math.min(height, Math.floor(width / 2 - IMAGE_SPACING));
			x = vertical ? 0 : imageWidth + IMAGE_SPACING * 2;
		} else {
			imageWidth = 0;
			x = 0;
		}
		const [min1, nat1] = this._title.get_preferred_height(width - x);
		const [min2, nat2] = this._description.get_preferred_height(width - x);
		const [min3, nat3] = this._url.get_preferred_height(width - x);

		// Add top padding for when the header is hidden
		let spacing = this._topPadding ? SPACING : 0;

		// Set minimum height to minimum of url
		let h = min3 + spacing;

		// Title
		let h1 = 0;
		if (this._title.visible) {
			if (h + nat1 <= height) {
				h1 = nat1;
			} else if (h + min1 <= height) {
				h1 = min1;
			}
		}
		this._title.opacity = h1 > 0 ? 255 : 0;
		h += h1;

		// Description
		let h2 = 0;
		if (this._description.visible) {
			if (vertical && nat0 > 0 && h + min2 <= height) {
				h2 = min2;
			} else if (h + min2 * 2 <= height) {
				h2 = Math.min(nat2, min2 * 2);
			} else if (h + min2 <= height) {
				h2 = min2;
			}
		}
		this._description.opacity = h2 > 0 ? 255 : 0;
		h += h2;

		// Image
		let h0 = 0;
		if (nat0 > 0) {
			if (!vertical) {
				h0 = height;
			} else if (height - h > 30) {
				spacing = IMAGE_SPACING;
				h0 = height - h - spacing;
			}
		}
		if (this._image) this._image.opacity = h0 > 0 ? 255 : 0;
		if (vertical) h += h0;

		// Url
		const line3 = min3 - this._url.get_theme_node().get_vertical_padding();
		const h3 = Math.min(min3 + Math.max(Math.floor((height - h) / line3) * line3, 0), nat3);

		// Allocate
		this._image?.allocate(Clutter.ActorBox.new(0, 0, imageWidth, h0));
		let y = vertical ? h0 + spacing : spacing;
		this._title.allocate(Clutter.ActorBox.new(x, y, width, y + h1));
		y += h1;
		this._description.allocate(Clutter.ActorBox.new(x, y, width, y + h2));
		y += h2;

		// If image, title and description are hidden, show larger url
		if (y > SPACING) {
			this._url.opacity = 255;
			this._singleUrl.opacity = 0;
			this._url.allocate(Clutter.ActorBox.new(x, y, width, y + h3));
		} else {
			// Add extra top padding for same alignment as text item
			if (this._topPadding) y += SPACING;
			this._url.opacity = 0;
			this._singleUrl.opacity = 255;
			this._singleUrl.allocate(Clutter.ActorBox.new(x, y, width, height));
		}
	}

	destroy() {
		this._cancellable.cancel();
		super.destroy();
	}
};
LinkPreview = __decorate(
	[
		registerClass({
			Properties: {
				'metadata': GObject.ParamSpec.jsobject('metadata', null, null, GObject.ParamFlags.READWRITE),
				'show-image': GObject.ParamSpec.boolean('show-image', null, null, GObject.ParamFlags.READWRITE, false),
				'background-size': enumParamSpec(
					'background-size',
					GObject.ParamFlags.READWRITE,
					BackgroundSize,
					BackgroundSize.Contain,
				),
				'orientation': enumParamSpec(
					'orientation',
					GObject.ParamFlags.READWRITE,
					Clutter.Orientation,
					Clutter.Orientation.VERTICAL,
				),
				'active': flagsParamSpec('active', GObject.ParamFlags.WRITABLE, ActiveState, ActiveState.None),
				'top-padding': GObject.ParamSpec.boolean('top-padding', null, null, GObject.ParamFlags.WRITABLE, false),
			},
		}),
	],
	LinkPreview,
);

export { LinkPreview };

let LinkItem = class LinkItem extends ClipboardItem {
	linkItemSettings;
	_linkPreview;
	_url;
	_fetching = false;
	_cancellable = new Gio.Cancellable();

	constructor(ext, entry) {
		super(ext, entry, Icon.Link, _('Link'));
		this.linkItemSettings = this.ext.settings.get_child('link-item');
		this.add_style_class_name('link-item');
		this._linkPreview = new LinkPreview(ext, this.entry.content.trim());
		this._content.add_child(this._linkPreview);
		this._url = new St.Label({ style_class: 'link-url', text: this.entry.content.trim() });
		this._url.clutter_text.line_wrap = true;
		this._url.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
		this._content.add_child(this._url);

		// Bind properties
		this.linkItemSettings.connectObject('changed', this.updateLinkPreview.bind(this), this);
		this.ext.settings.connectObject('changed::show-header', this.updateLinkPreview.bind(this), this);
		this._linkPreview.connectObject(
			'notify::metadata',
			() => {
				const meta = this._linkPreview.metadata;
				if (meta?.localImage && this.entry.metadata?.localImage !== meta.localImage) {
					this.entry.metadata = { ...this.entry.metadata, localImage: meta.localImage };
				}
			},
			this,
		);
		this.entry.connectObject(
			'notify::datetime',
			() => {
				const s = this.entry.metadata;
				if (!s?.title || !s?.image) this.updateLinkPreview().catch(() => {});
			},
			this,
		);
		this.bind_property('active', this._linkPreview, 'active', GObject.BindingFlags.DEFAULT);
		this.updateLinkPreview().catch(() => {});
	}

	vfunc_map() {
		super.vfunc_map();
		const s = this.entry.metadata;
		if (!s?.title || !s?.image) {
			this.updateLinkPreview().catch(() => {});
		} else if (this._linkPreview) {
			this._linkPreview.retryImageIfNeeded();
		}
	}

	search(query) {
		const metadata = { title: null, description: null, image: null, ...this.entry.metadata };
		const searchTexts = [this.entry.content];
		if (metadata.title) searchTexts.push(metadata.title);
		if (metadata.description) searchTexts.push(metadata.description);
		this.visible = query.matchesEntry(this.visible, this.entry, ...searchTexts);
	}

	async updateLinkPreview() {
		const patterns = this.linkItemSettings.get_strv('link-preview-exclusion-patterns');
		let regex = null;
		if (patterns.length > 0) {
			try {
				regex = new RegExp(patterns.join('|'));
			} catch {
				// Ignore
			}
		}
		const url = this.entry.content.trim();
		const showLinkPreview = this.linkItemSettings.get_boolean('show-link-preview');
		const showLinkPreviewImage = this.linkItemSettings.get_boolean('show-link-preview-image');
		const backgroundSize = this.linkItemSettings.get_enum('link-preview-image-background-size');
		const orientation = this.linkItemSettings.get_enum('link-preview-orientation');
		const showHeader = this.ext.settings.get_boolean('show-header');
		const show = showLinkPreview && !regex?.test(url);
		this._linkPreview.visible = show;
		this._linkPreview.showImage = showLinkPreviewImage;
		this._linkPreview.backgroundSize = backgroundSize;
		this._linkPreview.orientation = orientation;
		this._linkPreview.topPadding = !showHeader;
		this._url.visible = !show;
		const stored = this.entry.metadata;
		const hasData = stored && stored.title && (stored.image || stored.description);
		if (hasData) {
			this._linkPreview.metadata = { title: null, description: null, image: null, ...stored };
			if (stored.image && !stored.localImage) {
				tryGetLinkImage(this.ext, stored.image, this._cancellable)
					.then((imgFile) => {
						if (imgFile) {
							this.entry.metadata = { ...this.entry.metadata, localImage: imgFile.get_uri() };
							this._linkPreview.metadata = this.entry.metadata;
						}
					})
					.catch(() => {});
			}
		} else if (show && !this._fetching) {
			this._fetching = true;
			try {
				const metadata = await tryGetMetadata(this.ext, url, this._cancellable);
				if (metadata) {
					this.entry.metadata = { ...this.entry.metadata, ...metadata };
					this._linkPreview.metadata = this.entry.metadata;
					if (metadata.image) {
						tryGetLinkImage(this.ext, metadata.image, this._cancellable)
							.then((imgFile) => {
								if (imgFile) {
									this.entry.metadata = { ...this.entry.metadata, localImage: imgFile.get_uri() };
									this._linkPreview.metadata = this.entry.metadata;
								}
							})
							.catch(() => {});
					}
				}
			} finally {
				this._fetching = false;
			}
		}
	}

	destroy() {
		this._linkPreview?.disconnectObject(this);
		this.entry.disconnectObject(this);
		this.linkItemSettings.disconnectObject(this);
		this._cancellable.cancel();
		super.destroy();
	}
};
LinkItem = __decorate([registerClass()], LinkItem);

export { LinkItem };
