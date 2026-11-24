import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Soup from 'gi://Soup';

import { UserAgent, getLinkImagesPath } from '../common/constants.js';

// NB: send_and_read_async e read_bytes_async DEVONO essere promisificate, altrimenti la chiamata
// senza callback fallisce in silenzio (era la causa dell'anteprima immagine dei link mai mostrata).
Gio._promisify(Soup.Session.prototype, 'send_async');
Gio._promisify(Gio.InputStream.prototype, 'read_bytes_async');
Gio._promisify(Gio.InputStream.prototype, 'close_async');
Gio._promisify(Gio.File.prototype, 'replace_async');
Gio._promisify(Gio.OutputStream.prototype, 'splice_async');

const MAX_HTML_BYTES = 512 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_PARALLEL = 4;

/** Una sola sessione condivisa (keep-alive e connessioni riutilizzate) invece di una per richiesta. */
let session = null;
function getSession() {
	session ??= new Soup.Session({ user_agent: UserAgent, timeout: 10, idle_timeout: 10 });
	return session;
}

export function closeLinkSession() {
	session?.abort();
	session = null;
	waiting.length = 0;
	active = 0;
}

/** Limita le richieste simultanee: all'avvio molte schede link potrebbero chiedere i metadati insieme. */
let active = 0;
const waiting = [];
async function acquire() {
	if (active >= MAX_PARALLEL) await new Promise((resolve) => waiting.push(resolve));
	active++;
}
function release() {
	active = Math.max(0, active - 1);
	waiting.shift()?.();
}

function parseHttpUri(url) {
	let clean = url.trim();
	let uri = GLib.uri_parse(clean, GLib.UriFlags.NONE);
	const scheme = uri.get_scheme();
	if (scheme !== 'http' && scheme !== 'https') throw new Error(`Unsupported scheme: ${scheme}`);
	if (!uri.get_path()) {
		uri = GLib.uri_parse(`${clean}/`, GLib.UriFlags.NONE);
	}
	return uri;
}

async function request(uri, accept, cancellable) {
	const message = Soup.Message.new_from_uri('GET', uri);
	message.set_force_http1(true);
	message.request_headers.append('Accept', accept);
	const stream = await getSession().send_async(message, GLib.PRIORITY_DEFAULT, cancellable);
	return { message, stream };
}

async function closeStream(stream) {
	try {
		await stream.close_async(GLib.PRIORITY_DEFAULT, null);
	} catch {
		// Già chiuso
	}
}

/** Scrive lo stream nella cache senza tenerlo tutto in memoria. */
async function cacheStream(stream, file, cancellable) {
	const out = await file.replace_async(null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, GLib.PRIORITY_DEFAULT, cancellable);
	await out.splice_async(
		stream,
		Gio.OutputStreamSpliceFlags.CLOSE_SOURCE | Gio.OutputStreamSpliceFlags.CLOSE_TARGET,
		GLib.PRIORITY_DEFAULT,
		cancellable,
	);
}

/** Legge l'HTML solo fino a </head> (o al limite), senza scaricare pagine intere. */
async function readHead(stream, cancellable) {
	const chunks = [];
	let total = 0;
	let tail = '';
	const decoder = new TextDecoder('utf-8', { fatal: false });
	while (total < MAX_HTML_BYTES) {
		const bytes = await stream.read_bytes_async(32768, GLib.PRIORITY_DEFAULT, cancellable);
		const data = bytes.get_data();
		if (!data || data.length === 0) break;
		chunks.push(data);
		total += data.length;
		tail = (tail + decoder.decode(data)).slice(-32);
		if (/<\/head\s*>/i.test(tail)) break;
	}
	await closeStream(stream);
	const all = new Uint8Array(total);
	let offset = 0;
	for (const c of chunks) {
		all.set(c, offset);
		offset += c.length;
	}
	return all;
}

function decodeBytes(bytes, charset) {
	try {
		return new TextDecoder(charset ?? 'utf-8').decode(bytes);
	} catch {
		return new TextDecoder('utf-8').decode(bytes);
	}
}

const ATTRIBUTE_REGEX = /([^\s=/"'<>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

/** Estrae i tag <meta> a prescindere da ordine degli attributi e tipo di virgolette. */
function parseMeta(html) {
	const meta = {};
	for (const tag of html.matchAll(/<meta\s+([^>]*?)\/?>/gi)) {
		const attrs = {};
		for (const m of tag[1].matchAll(ATTRIBUTE_REGEX)) {
			attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
		}
		const key = (attrs.property ?? attrs.name ?? '').toLowerCase();
		if (key && attrs.content !== undefined && !(key in meta)) meta[key] = attrs.content;
	}
	return meta;
}

function getFallbackMetadata(uri) {
	const host = uri?.get_host?.() || '';
	const cleanHost = host.replace(/^www\./i, '');
	let title = cleanHost;
	if (cleanHost) {
		const parts = cleanHost.split('.');
		if (parts.length >= 2) {
			title = parts[0].charAt(0).toUpperCase() + parts[0].slice(1) + '.' + parts.slice(1).join('.');
		}
	}
	const path = uri?.get_path?.();
	const desc = path && path !== '/' ? `${cleanHost}${path}` : cleanHost;
	const image = host ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128` : null;
	return {
		title: title || null,
		description: desc || null,
		image,
		checked: Date.now(),
	};
}

/**
 * Recupera titolo, descrizione e immagine di un link.
 * @returns {Promise<{title, description, image, checked}|null>}
 */
export async function tryGetMetadata(ext, url, cancellable) {
	let uri;
	try {
		uri = parseHttpUri(url);
	} catch {
		return null;
	}
	const fallback = getFallbackMetadata(uri);
	await acquire();
	try {
		const { message, stream } = await request(
			uri,
			'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
			cancellable,
		);
		if (message.get_status() !== Soup.Status.OK) {
			await closeStream(stream);
			return fallback;
		}
		const [contentType, params] = message.response_headers.get_content_type() || [];

		// Il link punta direttamente a un'immagine: viene salvata in cache e usata come anteprima
		if (contentType && Gio.content_type_is_a(contentType, 'image/*')) {
			const imagePath = getLinkImagePath(ext, url, contentType);
			if (!imagePath || message.response_headers.get_content_length() > MAX_IMAGE_BYTES) {
				await closeStream(stream);
				return fallback;
			}
			if (imagePath.query_exists(null)) await closeStream(stream);
			else await cacheStream(stream, imagePath, cancellable);
			return { ...fallback, image: url, localImage: imagePath.get_uri() };
		}

		if (!contentType || !Gio.content_type_is_a(contentType, 'text/html')) {
			await closeStream(stream);
			return fallback;
		}

		const bytes = await readHead(stream, cancellable);
		const text = decodeBytes(bytes, params?.charset);
		const meta = parseMeta(text);

		let title = meta['og:title'] ?? meta['twitter:title'] ?? meta['title'] ?? null;
		if (title == null) title = text.match(/<title[^>]*>\s*([\s\S]*?)\s*<\/title>/i)?.[1] ?? null;

		if (title && (title.includes('Just a moment...') || title.includes('Attention Required') || title.includes('Cloudflare'))) {
			title = null;
		}

		let description = meta['og:description'] ?? meta['twitter:description'] ?? meta['description'] ?? null;
		let image =
			meta['og:image'] ??
			meta['og:image:url'] ??
			meta['og:image:secure_url'] ??
			meta['twitter:image'] ??
			meta['twitter:image:src'] ??
			meta['image'] ??
			null;
		if (image) {
			try {
				// Risolve percorsi relativi e URL "//host/img.png"
				image = uri.parse_relative(decodeHtml(image).trim(), GLib.UriFlags.NONE).to_string();
			} catch {
				image = null;
			}
		}

		if (!image) {
			image = fallback.image;
		}

		title = title ? decodeHtml(title).replace(/\s+/g, ' ').trim() : fallback.title;
		description = description ? decodeHtml(description).replace(/\s+/g, ' ').trim() : fallback.description;

		return {
			title: title || fallback.title,
			description: description || fallback.description,
			image: image || fallback.image,
			checked: Date.now(),
		};
	} catch (err) {
		if (!cancellable?.is_cancelled()) ext.logger?.error('Failed to get metadata', err);
		return fallback;
	} finally {
		release();
	}
}

const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…' };

function decodeHtml(html) {
	return html
		.replace(/&amp;(?=#?\w+;)/g, '&') // Doppia codifica (&amp;amp;) comune su molti siti
		.replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
		.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
		.replace(/&([a-z]+);/gi, (m, s) => ENTITIES[s.toLowerCase()] ?? m);
}

function guessImageExtension(url, contentType) {
	if (contentType) {
		const ct = contentType.toLowerCase();
		if (ct.includes('png')) return 'png';
		if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg';
		if (ct.includes('webp')) return 'webp';
		if (ct.includes('gif')) return 'gif';
		if (ct.includes('svg')) return 'svg';
		if (ct.includes('avif')) return 'avif';
		if (ct.includes('x-icon') || ct.includes('vnd.microsoft.icon') || ct.includes('ico')) return 'ico';
	}
	const clean = (url || '').split('?')[0].split('#')[0];
	const match = clean.match(/\.(png|jpe?g|webp|gif|svg|avif|ico)$/i);
	if (match) return match[1].toLowerCase().replace('jpeg', 'jpg');
	return 'png';
}

export function getLinkImagePath(ext, url, contentType = null) {
	if (!url) return null;
	const checksum = GLib.compute_checksum_for_string(GLib.ChecksumType.MD5, url, url.length);
	if (checksum == null) return null;
	const dir = getLinkImagesPath(ext);
	if (!dir.query_exists(null)) dir.make_directory_with_parents(null);

	// Controlla se il file esiste già con una delle estensioni supportate
	for (const extName of ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif', 'ico']) {
		const f = dir.get_child(`${checksum}.${extName}`);
		if (f.query_exists(null)) return f;
	}

	const extStr = guessImageExtension(url, contentType);
	return dir.get_child(`${checksum}.${extStr}`);
}

export async function tryGetLinkImage(ext, url, cancellable) {
	if (!url) return null;
	await acquire();
	try {
		const uri = parseHttpUri(url);

		// Già presente in modo permanente su disco?
		let imagePath = getLinkImagePath(ext, url);
		if (imagePath && imagePath.query_exists(null)) return imagePath;

		const { message, stream } = await request(
			uri,
			'image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.5',
			cancellable,
		);
		const [contentType] = message.response_headers.get_content_type() || [];
		if (
			message.get_status() !== Soup.Status.OK ||
			(contentType && !contentType.startsWith('image/')) ||
			message.response_headers.get_content_length() > MAX_IMAGE_BYTES
		) {
			await closeStream(stream);
			return null;
		}
		imagePath = getLinkImagePath(ext, url, contentType);
		await cacheStream(stream, imagePath, cancellable);
		return imagePath;
	} catch (err) {
		if (!cancellable?.is_cancelled()) ext.logger?.error('Failed to get link image', err);
	} finally {
		release();
	}
	return null;
}
