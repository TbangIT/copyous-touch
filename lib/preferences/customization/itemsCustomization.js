import Adw from 'gi://Adw';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { __decorate } from '../../../thirdparty/tslib.js';
import { registerClass } from '../../common/gjs.js';
import { CodeItemCustomization } from './items/codeItemCustomization.js';
import { FileItemCustomization } from './items/fileItemCustomization.js';
import { ImageItemCustomization } from './items/imageItemCustomization.js';
import { LinkItemCustomization } from './items/linkItemCustomization.js';
import { TextItemCustomization } from './items/textItemCustomization.js';

let ItemsCustomization = class ItemsCustomization extends Adw.PreferencesGroup {
	constructor(prefs, window) {
		super({
			title: _('Elementi e contenuti'),
		});
		this.add(new TextItemCustomization(prefs));
		this.add(new CodeItemCustomization(prefs));
		this.add(new ImageItemCustomization(prefs));
		this.add(new FileItemCustomization(prefs, window));
		this.add(new LinkItemCustomization(prefs, window));
	}
};

ItemsCustomization = __decorate([registerClass()], ItemsCustomization);

export { ItemsCustomization };
