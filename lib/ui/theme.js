import Gio from 'gi://Gio';
import St from 'gi://St';

/**
 * Gestione centralizzata del tema.
 *
 * - `stylesheet.css` contiene solo struttura e metriche (nessun colore di tema).
 * - `themes/<nome>.css` contiene i colori di UN tema; viene caricato solo quello attivo,
 *   quindi St valuta meno selettori e i due temi non si mescolano mai.
 * - Ogni attore registrato (cassetto, menu elemento, menu ricerca...) riceve la classe
 *   `theme-<nome>`, così anche i popup, che vivono in uiGroup e NON sono figli del cassetto,
 *   seguono lo stesso tema.
 *
 * Valori dell'enum `drawer-theme`: 0 = solid -> "gtk", 1 = transparent -> "custom".
 */
const THEMES = ['gtk', 'custom'];

export class ThemeManager {
	_ext;
	_actors = new Set();
	_current = -1;
	_loaded = null;

	constructor(ext) {
		this._ext = ext;
		ext.settings.connectObject('changed::drawer-theme', () => this.update(), this);
		this.update();
	}

	get themeName() {
		return THEMES[this._current] ?? THEMES[0];
	}

	update() {
		const index = this._ext.settings.get_enum('drawer-theme') === 1 ? 1 : 0;
		if (index === this._current) return;
		const previous = THEMES[this._current];
		this._current = index;
		this._loadStylesheet(THEMES[index]);
		for (const actor of this._actors) this._apply(actor, previous);
	}

	/**
	 * Registra un attore: riceve subito la classe del tema e viene aggiornato ai cambi di tema.
	 */
	register(actor) {
		if (this._actors.has(actor)) return;
		this._actors.add(actor);
		actor.connect('destroy', () => this._actors.delete(actor));
		this._apply(actor, null);
	}

	_apply(actor, previous) {
		if (previous) actor.remove_style_class_name(`theme-${previous}`);
		actor.add_style_class_name(`theme-${this.themeName}`);
	}

	_loadStylesheet(name) {
		const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
		if (this._loaded) {
			try {
				theme.unload_stylesheet(this._loaded);
			} catch {
				// Già scaricato (es. cambio tema del sistema)
			}
			this._loaded = null;
		}
		try {
			const file = this._ext.dir.get_child('themes').get_child(`${name}.css`);
			theme.load_stylesheet(file);
			this._loaded = file;
		} catch (e) {
			this._ext.logger?.error(`Impossibile caricare il tema "${name}"`, e);
		}
	}

	destroy() {
		this._ext.settings?.disconnectObject(this);
		if (this._loaded) {
			try {
				St.ThemeContext.get_for_stage(global.stage).get_theme().unload_stylesheet(this._loaded);
			} catch {
				// Ignora
			}
			this._loaded = null;
		}
		this._actors.clear();
	}
}
