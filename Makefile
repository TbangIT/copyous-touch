NAME := copious-touch
UUID := copious-touch@tbang
INSTALL_DIR := $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
ZIP_FILE := $(UUID).zip

FILES := extension.js prefs.js metadata.json stylesheet.css prefs.css icons images lib locale schemas themes thirdparty

.PHONY: all compile-schemas pack install clean

all: compile-schemas pack

compile-schemas:
	glib-compile-schemas schemas/

pack: compile-schemas
	@rm -f $(ZIP_FILE)
	zip -r $(ZIP_FILE) $(FILES) -x "schemas/gschemas.compiled"

install: compile-schemas
	@mkdir -p $(INSTALL_DIR)
	cp -r $(FILES) $(INSTALL_DIR)/
	glib-compile-schemas $(INSTALL_DIR)/schemas/

clean:
	rm -f $(ZIP_FILE) schemas/gschemas.compiled
