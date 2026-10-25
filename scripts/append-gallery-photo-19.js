#!/usr/bin/env node
'use strict';
// Append ONLY four photos to the gallery array inside the existing encrypted wedding invitation.
// Uses Node built-ins; does not change the cover or other invitation sections.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const assert = require('node:assert/strict');

const [,, encryptedFile, imageDirectory, entryFile] = process.argv;
if (!encryptedFile || !imageDirectory || !entryFile) {
  console.error('Usage: node replace-gallery-webp.js docs/assets/invitation.enc path/to/photos docs/index.html');
  process.exit(2);
}

function passphraseFromIndex(html) {
  // Preserve the repository's existing loader passphrase, without recording it.
  const match = html.match(/const j=\[([\d,\s]+)\],w=\[([\d,\s]+)\],s=String\.fromCharCode/);
  assert(match, 'Unable to locate the established invitation password arrays in the current entry file.');
  const j = match[1].split(',').map(s => Number(s.trim()));
  const w = match[2].split(',').map(s => Number(s.trim()));
  assert(j.length === w.length && j.length > 0, 'Invalid password loader arrays.');
  return String.fromCharCode(...j.map((n, i) => n ^ w[i]));
}

function decrypt(content, passphrase) {
  assert.equal(content.subarray(0, 8).toString(), 'WEDLOCK1', 'Unrecognized encrypted invitation header.');
  const iterations = content.readUInt32BE(8);
  const salt = content.subarray(12, 28);
  const iv = content.subarray(28, 40);
  const tag = content.subarray(40, 56);
  const ciphertext = content.subarray(56);
  const key = crypto.pbkdf2Sync(passphrase.normalize('NFKC'), salt, iterations, 32, 'sha256');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(Buffer.from('wedding-card-v1'));
  decipher.setAuthTag(tag);
  return {html:zlib.gunzipSync(Buffer.concat([decipher.update(ciphertext), decipher.final()])).toString('utf8'), iterations};
}

function encrypt(html, passphrase, iterations) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(passphrase.normalize('NFKC'), salt, iterations, 32, 'sha256');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from('wedding-card-v1'));
  const ciphertext = Buffer.concat([cipher.update(zlib.gzipSync(Buffer.from(html, 'utf8'))), cipher.final()]);
  const header = Buffer.alloc(12);
  header.write('WEDLOCK1');
  header.writeUInt32BE(iterations, 8);
  return Buffer.concat([header, salt, iv, cipher.getAuthTag(), ciphertext]);
}

function main() {
  const expected = ['19-blue-dress-bouquet-close-couple.webp'];
  const names = fs.readdirSync(imageDirectory).filter(name => /\.webp$/i.test(name)).sort();
  assert.deepEqual(names, expected, 'Only the three intended additions may be present');
  const extra = names.map(name => {
    const buf = fs.readFileSync(path.join(imageDirectory, name));
    assert.equal(buf.subarray(0,4).toString(), 'RIFF', 'Invalid RIFF signature');
    assert.equal(buf.subarray(8,12).toString(), 'WEBP', 'Invalid WebP signature');
    assert(buf.length < 1024 * 1024, 'Too large for gallery image: ' + name);
    return '      "data:image/webp;base64,' + buf.toString('base64') + '"';
  });
  const index = fs.readFileSync(entryFile, 'utf8');
  const passphrase = process.env.INVITATION_PASSPHRASE || passphraseFromIndex(index);
  const original = fs.readFileSync(encryptedFile);
  const { html, iterations } = decrypt(original, passphrase);
  const regex = /gallery:\s*\[([\s\S]*?)\],\s*\n\s*map:/g;
  const matches = [...html.matchAll(regex)];
  assert.equal(matches.length, 1, 'Expected exactly one gallery configuration');
  const currentItems = [...matches[0][1].matchAll(/"data:image\/webp;base64,[A-Za-z0-9+/=]+"/g)].map(m=>m[0]);
  assert.equal(currentItems.length, 18, 'Existing gallery must have exactly eighteen photos');
  assert.equal(matches[0][1].replace(/"data:image\/webp;base64,[A-Za-z0-9+/=]+"/g,'').replace(/[\s,]/g,''), '', 'Unexpected gallery syntax');
  assert(!matches[0][1].includes('data:image/jpeg;base64,'), 'Legacy JPEG unexpectedly present');
  for (const image of extra) assert(!currentItems.includes(image.trim()), 'Image already exists');
  const replacement = 'gallery: [' + matches[0][1].trimEnd() + ',\n' + extra.join(',\n') + '\n    ],\n    map:';
  const updated = html.replace(regex, replacement);
  const updatedMatch = [...updated.matchAll(regex)];
  assert.equal(updatedMatch.length,1,'Updated gallery configuration missing');
  const allItems = [...updatedMatch[0][1].matchAll(/"data:image\/webp;base64,[A-Za-z0-9+/=]+"/g)].map(m=>m[0]);
  assert.equal(allItems.length, 19, 'Gallery must contain exactly 19 photos');
  assert.deepEqual(allItems.slice(0, 18), currentItems, 'Original 18 photos must be unchanged');
  assert.deepEqual(updated.replace(replacement, '[GALLERY]'), html.replace(matches[0][0], '[GALLERY]'), 'Other invitation content changed');
  assert(updated.includes('gallery-lightbox'), 'Existing gallery lightbox missing');
  assert(updated.includes('<section class="hero" id="home"'), 'Existing hero missing');
  const output = encrypt(updated, passphrase, iterations);
  assert.equal(decrypt(output, passphrase).html, updated, 'Encryption roundtrip failure');
  fs.writeFileSync(encryptedFile, output);
  console.log('Success: appended 1 WebP photo to existing 18; now exactly 19. Invitation encryption and all other sections preserved.');
}
try { main(); } catch (err) { console.error('Gallery addition aborted: ' + err.message); process.exit(1); }
