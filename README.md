# Copious Touch

Ultra-lightweight, high-performance & touch-ready clipboard history manager for GNOME Shell (48, 49, 50, 51).

Fork of [Copyous](https://github.com/boerdereinar/copyous) re-engineered for minimal resource usage, zero external binary dependencies, and first-class touchscreen usability.

---

## Features & Improvements

- **Full Touchscreen Support**:
  - Instant tap selection and paste for clipboard cards.
  - Real-time tactile `:active` visual press states.
  - Physics-based smooth momentum scrolling on horizontal swipe.
  - Smart tap detection to prevent accidental pastes when dismissing context menus.
  - Touch-ready icon buttons and filter popup menus.
- **Zero Heavy Dependencies**:
  - Direct JSON database storage engine replacing heavy SQLite / `libgda` bindings.
  - Built-in lightweight micro syntax highlighter replacing `highlight.js`.
  - Zero audio library overhead (`gsound` eliminated).
- **Extreme Performance**:
  - Pre-normalized Unicode text matching eliminating search stutter.
  - Clutter stage scene-graph picking for $O(1)$ actor detection.
  - Standalone pure ES Modules runtime without intermediate build or bundle overhead.
- **Clean Theme Support**:
  - Independent modular stylesheets (`gtk.css`, `custom.css`).
  - Full Italian localization included.

---

## Installation

### From Source

1. Clone this repository:
   ```shell
   git clone https://github.com/TbangIT/copyous-touch.git
   cd copyous-touch
   ```

2. Install directly into your local GNOME Shell extensions directory:
   ```shell
   make install
   ```

3. Enable the extension:
   ```shell
   gnome-extensions enable copious-touch@tbang
   ```

*(On Wayland sessions, log out and log back in to reload GNOME Shell after first installation).*

### Building Zip Package

To generate a distributable zip archive:
```shell
make pack
```
This produces `copious-touch@tbang.zip`.

---

## Configuration

Preferences can be opened through the top panel indicator, [Extension Manager](https://flathub.org/en/apps/com.mattjakeman.ExtensionManager), or from the terminal:
```shell
gnome-extensions prefs copious-touch@tbang
```

---

## License

GPL-3.0. Based on [Copyous](https://github.com/boerdereinar/copyous) by Einar de Gruyl.
