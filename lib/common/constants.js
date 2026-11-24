import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

export const ItemType = {
	Text: 'Text',
	Code: 'Code',
	Image: 'Image',
	File: 'File',
	Files: 'Files',
	Link: 'Link',
};

export const ItemTypes = [
	ItemType.Text,
	ItemType.Code,
	ItemType.Image,
	ItemType.File,
	ItemType.Files,
	ItemType.Link,
];

export const Tag = {
	Blue: 'blue',
	Teal: 'teal',
	Green: 'green',
	Yellow: 'yellow',
	Orange: 'orange',
	Red: 'red',
	Pink: 'pink',
	Purple: 'purple',
	Slate: 'slate',
};

export const Tags = [Tag.Blue, Tag.Teal, Tag.Green, Tag.Yellow, Tag.Orange, Tag.Red, Tag.Pink, Tag.Purple, Tag.Slate];

export const ActiveState = {
	None: 0,
	Focus: 1,
	Hover: 2,
	FocusHover: 3,
	Active: 4,
};

export const UserAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15 (compatible; Twitterbot/1.0; facebookexternalhit/1.1)';

export function getCachePath(ext) {
	return Gio.file_new_build_filenamev([GLib.get_user_cache_dir(), ext.uuid]);
}

export function getDataPath(ext) {
	return Gio.file_new_build_filenamev([GLib.get_user_data_dir(), ext.uuid]);
}

export function getImagesPath(ext) {
	return getDataPath(ext).get_child('images');
}

export function getLinkImagesPath(ext) {
	return getDataPath(ext).get_child('link-images');
}

export function getConfigPath(ext) {
	return Gio.file_new_build_filenamev([GLib.get_user_config_dir(), ext.uuid]);
}

export function getActionsConfigPath(ext) {
	return getConfigPath(ext).get_child('actions.json');
}

export function getDefaultDatabaseFile(ext) {
	return getDataPath(ext).get_child('clipboard.json');
}
