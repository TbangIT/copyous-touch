import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { loadConfig } from './lib/common/actions.js';
import { Icon } from './lib/common/icons.js';
import { migrateSettings } from './lib/common/settings.js';
import { ActionsPage } from './lib/preferences/actions/actionsPage.js';
import { DialogCustomization } from './lib/preferences/customization/dialogCustomization.js';
import { HeaderCustomization } from './lib/preferences/customization/headerCustomization.js';
import { ItemCustomization } from './lib/preferences/customization/itemCustomization.js';
import { ItemsCustomization } from './lib/preferences/customization/itemsCustomization.js';
import { Profiles } from './lib/preferences/customization/profiles.js';
import { ThemeCustomization } from './lib/preferences/customization/themeCustomization.js';
import { AppExclusionSettings } from './lib/preferences/general/appExclusionSettings.js';
import { BehaviorSettings } from './lib/preferences/general/behaviorSettings.js';
import { FeedbackSettings } from './lib/preferences/general/feedbackSettings.js';
import { HistorySettings } from './lib/preferences/general/historySettings.js';
import { LocationsGroup } from './lib/preferences/general/locationsGroup.js';
import { VersionSettings } from './lib/preferences/general/versionSettings.js';
import { DialogShortcuts } from './lib/preferences/shortcuts/dialogShortcuts.js';
import { ItemActivationShortcuts, ItemShortcuts } from './lib/preferences/shortcuts/itemShortcuts.js';
import { NavigationShortcuts } from './lib/preferences/shortcuts/navigationShortcuts.js';
import { PopupMenuShortcuts } from './lib/preferences/shortcuts/popupMenuShortcuts.js';
import {
	SearchNavigationShortcuts,
	SearchScrollShortcuts,
	SearchShortcuts,
} from './lib/preferences/shortcuts/searchShortcuts.js';

export default class Preferences extends ExtensionPreferences {
	async fillPreferencesWindow(window) {
		window.default_height = 800;
		window.default_width = 820;

		// Enable search
		window.search_enabled = true;

		// Migrate settings
		migrateSettings(this.getSettings());

		// General page
		const general = new Adw.PreferencesPage({
			name: 'general',
			title: _('Generale'),
			icon_name: Icon.Settings,
		});
		window.add(general);
		general.add(new HistorySettings(this, window));
		general.add(new FeedbackSettings(this, window));
		general.add(new BehaviorSettings(this));
		general.add(new AppExclusionSettings(this, window));
		general.add(new LocationsGroup(this, window));
		general.add(new VersionSettings(this, window));

		// Customization page
		const customization = new Adw.PreferencesPage({
			name: 'customization',
			title: _('Personalizzazione'),
			icon_name: Icon.Image,
		});
		window.add(customization);
		customization.add(new Profiles(this));
		customization.add(new ThemeCustomization(this));
		customization.add(new DialogCustomization(this));
		customization.add(new ItemCustomization(this));
		customization.add(new HeaderCustomization(this));
		customization.add(new ItemsCustomization(this, window));

		// Shortcuts page
		const shortcuts = new Adw.PreferencesPage({
			name: 'shortcuts',
			title: _('Scorciatoie'),
			icon_name: Icon.Keyboard,
		});
		window.add(shortcuts);
		shortcuts.add(new DialogShortcuts(this));
		shortcuts.add(new ItemShortcuts(this));
		shortcuts.add(new ItemActivationShortcuts(this));
		shortcuts.add(new PopupMenuShortcuts());
		shortcuts.add(new NavigationShortcuts());
		shortcuts.add(new SearchShortcuts(this));
		shortcuts.add(new SearchNavigationShortcuts());
		shortcuts.add(new SearchScrollShortcuts(this));

		// Actions page
		const config = await loadConfig(this);
		const actions = new ActionsPage(this, window, config);
		window.add(actions);

		// Register icons
		const display = Gdk.Display.get_default();
		const iconTheme = Gtk.IconTheme.get_for_display(display);
		iconTheme.add_search_path(`${this.dir.get_path()}/icons`);

		// Register css
		const provider = new Gtk.CssProvider();
		provider.load_from_path(`${this.dir.get_path()}/prefs.css`);
		Gtk.StyleContext.add_provider_for_display(display, provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);

		window.connect('destroy', () => {
			Gtk.StyleContext.remove_provider_for_display(display, provider);
		});
		return Promise.resolve();
	}
}
