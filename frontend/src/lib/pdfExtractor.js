// Unified client-side text extractor for PDF, DOCX, and EML files.
// Runs entirely in the browser — file bytes never leave the device.

import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';
import mammoth from 'mammoth';

// Pin pdf.js worker to the installed pdfjs-dist version.
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';

// ---------- PDF -----------------------------------------------------------

async function extractPdf(file) {
  const buf = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buf }).promise;
  const parts = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const line = content.items
      .map((it) => (typeof it.str === 'string' ? it.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (line) parts.push(line);
  }
  return parts.join('\n\n');
}

// ---------- DOCX ----------------------------------------------------------

async function extractDocx(file) {
  const buf = await file.arrayBuffer();
  const { value } = await mammoth.extractRawText({ arrayBuffer: buf });
  return (value || '').trim();
}

// ---------- EML -----------------------------------------------------------
// Lightweight parser: pulls From/Subject/Date headers + best text/plain body.
// Handles quoted-printable and base64 for the plain body. HTML fallback strips tags.

function decodeQuotedPrintable(input) {
  const stripped = input.replace(/=(?:\r\n|\r|\n)/g, '');
  // Build a byte array so we can UTF-8 decode multi-byte sequences correctly.
  const bytes = [];
  for (let i = 0; i < stripped.length; i += 1) {
    const ch = stripped[i];
    if (ch === '=' && /[0-9A-Fa-f]{2}/.test(stripped.slice(i + 1, i + 3))) {
      bytes.push(parseInt(stripped.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(ch.charCodeAt(0));
    }
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes));
}

function decodeBase64(input) {
  try {
    const bin = atob(input.replace(/\s+/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return input;
  }
}

function decodeBody(body, encoding) {
  const enc = (encoding || '').toLowerCase();
  if (enc.includes('quoted-printable')) return decodeQuotedPrintable(body);
  if (enc.includes('base64')) return decodeBase64(body);
  return body;
}

function splitHeadersAndBody(raw) {
  const idx = raw.search(/\r?\n\r?\n/);
  if (idx === -1) return { headers: raw, body: '' };
  const boundaryMatch = raw.slice(idx).match(/\r?\n\r?\n/);
  const boundaryLen = boundaryMatch ? boundaryMatch[0].length : 2;
  return { headers: raw.slice(0, idx), body: raw.slice(idx + boundaryLen) };
}

function parseHeaders(rawHeaders) {
  // Unfold continuation lines (RFC 5322).
  const unfolded = rawHeaders.replace(/\r?\n[ \t]+/g, ' ');
  const map = {};
  unfolded.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^([A-Za-z0-9-]+):\s*(.*)$/);
    if (m) map[m[1].toLowerCase()] = m[2];
  });
  return map;
}

function findFirstPart(body, boundary, mimePref) {
  const marker = `--${boundary}`;
  const parts = body.split(marker).filter((p) => p && !p.startsWith('--'));
  // Pick preferred mime first, else first non-empty
  const scored = parts
    .map((p) => {
      const { headers, body: partBody } = splitHeadersAndBody(p.replace(/^\r?\n/, ''));
      const h = parseHeaders(headers);
      const ct = (h['content-type'] || '').toLowerCase();
      return { h, partBody, ct };
    })
    .filter((p) => p.ct.startsWith(mimePref));
  if (scored.length > 0) return scored[0];
  return null;
}

function stripHtml(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function extractEml(file) {
  const raw = await file.text();
  const { headers, body } = splitHeadersAndBody(raw);
  const h = parseHeaders(headers);

  const contentType = (h['content-type'] || 'text/plain').toLowerCase();
  const encoding = h['content-transfer-encoding'] || '';

  let textBody = '';

  if (contentType.startsWith('multipart/')) {
    const bMatch = contentType.match(/boundary="?([^";]+)"?/);
    const boundary = bMatch ? bMatch[1] : null;
    if (boundary) {
      const plain = findFirstPart(body, boundary, 'text/plain');
      if (plain) {
        textBody = decodeBody(plain.partBody, plain.h['content-transfer-encoding']);
      } else {
        const html = findFirstPart(body, boundary, 'text/html');
        if (html) {
          const decoded = decodeBody(html.partBody, html.h['content-transfer-encoding']);
          textBody = stripHtml(decoded);
        }
      }
    }
  } else if (contentType.startsWith('text/html')) {
    textBody = stripHtml(decodeBody(body, encoding));
  } else {
    textBody = decodeBody(body, encoding);
  }

  const header = [
    h.from ? `From: ${h.from}` : null,
    h.subject ? `Subject: ${h.subject}` : null,
    h.date ? `Date: ${h.date}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return `${header}\n\n${textBody}`.trim();
}

// ---------- Public dispatcher --------------------------------------------

export const ACCEPTED_MIME = 'application/pdf,.pdf,.docx,.eml,message/rfc822,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function detectKind(file) {
  const name = (file.name || '').toLowerCase();
  const type = (file.type || '').toLowerCase();
  if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (name.endsWith('.docx') || type.includes('officedocument.wordprocessingml')) return 'docx';
  if (name.endsWith('.eml') || type === 'message/rfc822') return 'eml';
  return null;
}

export async function extractText(file) {
  const kind = detectKind(file);
  if (kind === 'pdf') return extractPdf(file);
  if (kind === 'docx') return extractDocx(file);
  if (kind === 'eml') return extractEml(file);
  throw new Error('Unsupported file type');
}

// Back-compat named export used by earlier code.
export const extractPdfText = extractPdf;
