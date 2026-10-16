#!/usr/bin/env node
'use strict';
// Replace ONLY the gallery array inside the existing encrypted wedding invitation.
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
  const names = fs.readdirSync(imageDirectory).filter(f => /\.webp$/i.test(f)).sort();
  assert.equal(names.length, 10, `Expected exactly 10 WebP photos, got ${names.length}`);
  const galleryItems = names.map((name) => {
    const buf = fs.readFileSync(path.join(imageDirectory, name));
    assert(buf.subarray(0,4).toString() === 'RIFF' && buf.subarray(8,12).toString() === 'WEBP', `Not a WebP image: ${name}`);
    assert(buf.length < 1024 * 1024, `Unexpected image size over 1 MB: ${name}`);
    return `      "data:image/webp;base64,${buf.toString('base64')}"`;
  });
  const currentIndex = fs.readFileSync(entryFile, 'utf8');
  const passphrase = process.env.INVITATION_PASSPHRASE || passphraseFromIndex(currentIndex);
  const original = fs.readFileSync(encryptedFile);
  const {html, iterations} = decrypt(original, passphrase);
  const regex = /gallery:\s*\[[\s\S]*?\],\s*\n\s*map:/g;
  const matches = [...html.matchAll(regex)];
  assert.equal(matches.length, 1, `Expected exactly one gallery configuration block; found ${matches.length}`);
  const replacement = `gallery: [\n${galleryItems.join(',\n')}\n    ],\n    map:`;
  const updated = html.replace(regex, replacement);
  const photoCount = (updated.match(/data:image\/webp;base64,/g) || []).length;
  assert(photoCount >= 10, 'WebP images missing from encrypted output');
  const galleryBlock = updated.match(/gallery:\s*\[[\s\S]*?\],\s*\n\s*map:/)?.[0] || '';
  assert.equal((galleryBlock.match(/data:image\/webp;base64,/g) || []).length, 10, 'Gallery should contain exactly 10 WebP images');
  assert(!galleryBlock.includes('data:image/jpeg;base64,'), 'Legacy JPEG gallery image remains');
  assert(updated.includes('gallery-lightbox'), 'Expected existing lightbox functionality is missing');
  assert(updated.includes('<section class="hero" id="home"'), 'Existing hero section has changed');
  const output = encrypt(updated, passphrase, iterations);
  assert.equal(decrypt(output, passphrase).html, updated, 'Encryption round-trip failed');
  const tmp = `${encryptedFile}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, output);
  fs.renameSync(tmp, encryptedFile);
  const inputBytes = names.reduce((sum,name) => sum + fs.statSync(path.join(imageDirectory,name)).size,0);
  console.log(`Success: replaced all previous gallery images with ${names.length} WebP photos (${(inputBytes/1024/1024).toFixed(2)} MiB).`);
  console.log(`Encryption preserved. Hero and other invitation components unchanged. Encoded file: ${(output.length/1024/1024).toFixed(2)} MiB.`);
}

try {main();} catch(err) { console.error(`Gallery update aborted: ${err.message}`); process.exit(1); }