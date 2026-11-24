import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import { ItemType } from './constants.js';

/**
 * Rileva il tipo di contenuto specifico e l'etichetta sintetica per la scheda
 * (es. TXT, C, HTML, CSS, JS, Python, Docker Compose, Bash, Link, LaTeX, PNG, ecc.)
 */
export function detectContentType(entry) {
	if (!entry) return { label: 'TXT', ext: '' };

	// 1. Immagine
	if (entry.type === ItemType.Image) {
		const uri = decodeURIComponent(entry.content ?? '');
		const extMatch = uri.match(/\.([a-zA-Z0-9]+)(?:[?#]|$)/);
		let ext = extMatch ? extMatch[1].toUpperCase() : (entry.metadata?.ext?.toUpperCase() ?? 'IMG');
		if (ext === 'JPEG') ext = 'JPG';
		if (ext === 'TIFF') ext = 'TIF';
		return { label: ext, ext };
	}

	// 2. File o File Multipli
	if (entry.type === ItemType.File || entry.type === ItemType.Files) {
		if (entry.type === ItemType.Files) {
			const count = (entry.content ?? '').split('\n').filter(Boolean).length;
			return { label: `${count} File`, ext: 'FILES' };
		}
		const path = entry.content ?? '';
		const extMatch = path.match(/\.([a-zA-Z0-9]+)$/);
		const ext = extMatch ? extMatch[1].toUpperCase() : 'FILE';
		return { label: ext, ext };
	}

	// 3. Link
	if (entry.type === ItemType.Link) {
		return { label: 'Link', ext: 'URL' };
	}

	// 4. Testo e Codice
	const text = (entry.content ?? '').trim();
	if (!text) return { label: 'TXT', ext: 'txt' };

	// Link rilevato nel testo
	if ((text.startsWith('http://') || text.startsWith('https://')) && !text.includes('\n')) {
		return { label: 'Link', ext: 'URL' };
	}

	// Docker Compose
	if (
		(text.includes('services:') && (text.includes('image:') || text.includes('build:'))) ||
		(text.includes('version:') && text.includes('services:')) ||
		text.includes('docker-compose') ||
		(text.includes('container_name:') && text.includes('ports:'))
	) {
		return { label: 'Docker Compose', ext: 'yml' };
	}

	// LaTeX
	if (
		text.includes('\\documentclass') ||
		text.includes('\\begin{') ||
		text.includes('\\usepackage') ||
		text.includes('\\[') ||
		text.includes('\\frac{') ||
		text.includes('\\section{') ||
		text.includes('\\alpha') ||
		text.includes('\\beta') ||
		text.includes('\\sum_') ||
		text.includes('\\int_')
	) {
		return { label: 'LaTeX', ext: 'tex' };
	}

	// HTML
	if (
		/<!DOCTYPE\s+html/i.test(text) ||
		/<html[\s>]/i.test(text) ||
		/<\/?[a-z0-9]+(\s+[^>]+)?>.*<\/[a-z0-9]+>/is.test(text) &&
		(text.includes('</div>') || text.includes('</span>') || text.includes('</p>') || text.includes('</body>') || text.includes('</tr>'))
	) {
		return { label: 'HTML', ext: 'html' };
	}

	// CSS
	if (
		(/^[.#a-zA-Z0-9_\-\s,:]+\s*\{/m.test(text) &&
			(text.includes('margin:') || text.includes('padding:') || text.includes('color:') || text.includes('background:') || text.includes('display:') || text.includes('font-size:'))) ||
		text.includes('@media ') ||
		text.includes('@keyframes ')
	) {
		return { label: 'CSS', ext: 'css' };
	}

	// C / C++
	if (
		text.includes('#include <') ||
		text.includes('#include "') ||
		/\b(int|void|float|double|char)\s+main\s*\(/.test(text) ||
		text.includes('std::') ||
		text.includes('cout <<') ||
		text.includes('cin >>') ||
		text.includes('printf(') ||
		text.includes('nullptr') ||
		/\bstruct\s+[a-zA-Z0-9_]+\s*\{/.test(text) ||
		text.includes('typedef struct')
	) {
		return { label: 'C / C++', ext: 'c' };
	}

	// Python
	if (
		text.startsWith('#!/usr/bin/env python') ||
		text.startsWith('#!/usr/bin/python') ||
		/\bdef\s+[a-zA-Z0-9_]+\s*\(.*?\)\s*:/.test(text) ||
		/\bclass\s+[a-zA-Z0-9_]+(\(.*?\))?\s*:/.test(text) ||
		/\bif\s+__name__\s*==\s*['"]__main__['"]\s*:/.test(text) ||
		/\bfrom\s+[a-zA-Z0-9_.]+\s+import\s+/.test(text) ||
		/\bimport\s+(sys|os|json|time|math|numpy|pandas|re|logging)\b/.test(text) ||
		/\bprint\s*\(.*?\)/.test(text) && /\belif\s+/.test(text)
	) {
		return { label: 'Python', ext: 'py' };
	}

	// Bash / Shell
	if (
		text.startsWith('#!/bin/bash') ||
		text.startsWith('#!/bin/sh') ||
		text.startsWith('#!/usr/bin/env bash') ||
		/\b(sudo\s+apt|sudo\s+dnf|sudo\s+pacman|systemctl\s+|chmod\s+\+x|journalctl\s+)/.test(text) ||
		/\bexport\s+[A-Z_]+=[^\n]+/.test(text) ||
		(/\becho\s+["']/.test(text) && /\b(fi|done|esac)\b/.test(text)) ||
		/\bif\s+\[\[?\s+.*?\s+\]\]?\s*;\s*then\b/.test(text)
	) {
		return { label: 'Bash', ext: 'sh' };
	}

	// JavaScript / TypeScript
	if (
		/\b(const|let|var)\s+[a-zA-Z0-9_$]+\s*=\s*/.test(text) ||
		/\bimport\s+.*?from\s+['"][^'"]+['"]/.test(text) ||
		/\bexport\s+(default|const|let|function|class)\b/.test(text) ||
		/\bconsole\.(log|warn|error|info)\(/.test(text) ||
		/\bfunction\s+[a-zA-Z0-9_$]+\s*\(/.test(text) ||
		/=>\s*\{/.test(text) ||
		/\binterface\s+[A-Z][a-zA-Z0-9_]*\s*\{/.test(text)
	) {
		return { label: 'JavaScript', ext: 'js' };
	}

	// JSON
	if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
		try {
			JSON.parse(text);
			return { label: 'JSON', ext: 'json' };
		} catch {}
	}

	// SQL
	if (/\b(SELECT\s+.*?\s+FROM|INSERT\s+INTO|UPDATE\s+.*?\s+SET|DELETE\s+FROM|CREATE\s+TABLE)\b/i.test(text)) {
		return { label: 'SQL', ext: 'sql' };
	}

	// Markdown
	if (/^#+\s+[^\n]+/m.test(text) || /```[a-z]*\n[\s\S]*?\n```/.test(text)) {
		return { label: 'Markdown', ext: 'md' };
	}

	// Testo generico
	return { label: 'TXT', ext: 'txt' };
}

/**
 * Formattazione compatta del tempo trascorso (es. Adesso, 5m, 1h 20m, 2g)
 */
export function formatCompactTime(datetime) {
	if (!datetime) return '';
	const now = GLib.DateTime.new_now_utc();
	const diffMicroseconds = now.difference(datetime);
	const diffSeconds = Math.max(0, Math.floor(diffMicroseconds / 1000000));
	const diffMinutes = Math.floor(diffSeconds / 60);
	const diffHours = Math.floor(diffMinutes / 60);
	const diffDays = Math.floor(diffHours / 24);

	if (diffMinutes < 1) {
		return 'Adesso';
	}
	if (diffHours < 1) {
		return `${diffMinutes}m`;
	}
	if (diffDays < 1) {
		const remMinutes = diffMinutes % 60;
		return remMinutes > 0 ? `${diffHours}h ${remMinutes}m` : `${diffHours}h`;
	}
	const remHours = diffHours % 24;
	return remHours > 0 ? `${diffDays}g ${remHours}h` : `${diffDays}g`;
}
