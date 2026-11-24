import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import { __decorate } from '../../../thirdparty/tslib.js';
import { registerClass } from '../../common/gjs.js';
import { normalizeIndentation, trim } from './label.js';

const KEYWORDS = new Set([
	'function', 'return', 'const', 'let', 'var', 'class', 'import', 'export', 'from', 'default',
	'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
	'try', 'catch', 'finally', 'throw', 'async', 'await', 'new', 'this', 'typeof', 'instanceof',
	'def', 'elif', 'yield', 'lambda', 'with', 'pass', 'None', 'True', 'False',
	'public', 'private', 'protected', 'static', 'interface', 'implements', 'extends', 'struct', 'enum',
	'fn', 'mut', 'impl', 'pub', 'trait', 'match',
]);

function highlightCode(escapedText) {
	const tokenRegex = /(\/\/[^\n]*|#[^\n]*)|(&quot;[^&]*?&quot;|&apos;[^&]*?&apos;|`[^`]*?`)|(\b\d+(?:\.\d+)?\b)|(\b[a-zA-Z_]\w*\b)/g;
	return escapedText.replace(tokenRegex, (match, comment, str, num, ident) => {
		if (comment) return `<span color="#777777">${comment}</span>`;
		if (str) return `<span color="#5bc8af">${str}</span>`;
		if (num) return `<span color="#7d8ac7">${num}</span>`;
		if (ident && KEYWORDS.has(ident)) return `<span color="#ffa348" weight="bold">${ident}</span>`;
		return match;
	});
}

let CodeLabel = class CodeLabel extends St.Label {
	ext;
	_code = '';
	_language = null;
	_syntaxHighlighting = true;
	_showLineNumbers = true;
	_tabWidth = 4;

	constructor(ext, props = {}) {
		super({
			style_class: props.style_class ?? 'code-item-content',
			y_align: props.y_align ?? 0,
			y_expand: props.y_expand ?? true,
		});
		this.ext = ext;
		this.clutter_text.line_wrap = false;
		this.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
		this._code = props.code ?? '';
		this._language = props.language ?? null;
		this._syntaxHighlighting = props.syntaxHighlighting ?? true;
		this._showLineNumbers = props.showLineNumbers ?? true;
		this._tabWidth = props.tabWidth ?? 4;
		this.updateText();
	}

	get code() {
		return this._code;
	}

	set code(val) {
		if (this._code === val) return;
		this._code = val ?? '';
		this.updateText();
		this.notify('code');
	}

	get language() {
		return this._language;
	}

	set language(val) {
		if (this._language === val) return;
		this._language = val;
		this.updateText();
		this.notify('language');
	}

	get syntaxHighlighting() {
		return this._syntaxHighlighting;
	}

	set syntaxHighlighting(val) {
		if (this._syntaxHighlighting === val) return;
		this._syntaxHighlighting = val;
		this.updateText();
		this.notify('syntax-highlighting');
	}

	get showLineNumbers() {
		return this._showLineNumbers;
	}

	set showLineNumbers(val) {
		if (this._showLineNumbers === val) return;
		this._showLineNumbers = val;
		this.updateText();
		this.notify('show-line-numbers');
	}

	get tabWidth() {
		return this._tabWidth;
	}

	set tabWidth(val) {
		if (this._tabWidth === val) return;
		this._tabWidth = val;
		this.updateText();
		this.notify('tab-width');
	}

	updateText() {
		if (!this._code) {
			this.clutter_text.set_text('');
			return;
		}
		let text = normalizeIndentation(trim(this._code), this._tabWidth);
		const lines = text.split('\n');
		this.clutter_text.line_wrap = lines.length <= 1;

		let formattedLines = lines.map((line, idx) => {
			let escaped = GLib.markup_escape_text(line, -1);
			if (this._syntaxHighlighting) {
				escaped = highlightCode(escaped);
			}
			if (this._showLineNumbers && lines.length > 1) {
				const num = (idx + 1).toString().padStart(2, ' ');
				return `<span color="#777777" alpha="50%">${num}</span>  ${escaped}`;
			}
			return escaped;
		});

		try {
			this.clutter_text.set_markup(formattedLines.join('\n'));
		} catch {
			this.clutter_text.set_text(text);
		}
	}
};

CodeLabel = __decorate(
	[
		registerClass({
			Properties: {
				'code': GObject.ParamSpec.string('code', null, null, GObject.ParamFlags.READWRITE, ''),
				'language': GObject.ParamSpec.jsobject('language', null, null, GObject.ParamFlags.READWRITE),
				'syntax-highlighting': GObject.ParamSpec.boolean(
					'syntax-highlighting',
					null,
					null,
					GObject.ParamFlags.READWRITE,
					true,
				),
				'show-line-numbers': GObject.ParamSpec.boolean(
					'show-line-numbers',
					null,
					null,
					GObject.ParamFlags.READWRITE,
					true,
				),
				'tab-width': GObject.ParamSpec.int('tab-width', null, null, GObject.ParamFlags.READWRITE, 1, 8, 4),
			},
		}),
	],
	CodeLabel,
);

export { CodeLabel };
