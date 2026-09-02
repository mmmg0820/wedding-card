const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const invitationPath = process.argv[2] || 'docs/assets/invitation.enc';
const photoDirectory = process.argv[3];
const passphrase = process.env.INVITATION_PASSPHRASE;
if (!passphrase) throw new Error('INVITATION_PASSPHRASE is required');
if (!photoDirectory) throw new Error('photo directory is required');

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected once, found ${count}`);
  return source.replace(before, after);
}

// Remove EXIF APP1 blocks without decoding or recompressing the JPEG image.
function stripJpegExif(buffer) {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) throw new Error('not a JPEG image');
  const chunks = [buffer.subarray(0, 2)];
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) throw new Error('invalid JPEG marker');
    const marker = buffer[offset + 1];
    if (marker === 0xda || marker === 0xd9) {
      chunks.push(buffer.subarray(offset));
      break;
    }
    const segmentLength = buffer.readUInt16BE(offset + 2);
    const segmentEnd = offset + 2 + segmentLength;
    if (segmentEnd > buffer.length) throw new Error('invalid JPEG segment length');
    const isExif = marker === 0xe1 && buffer.subarray(offset + 4, offset + 10).toString('ascii') === 'Exif\0\0';
    if (!isExif) chunks.push(buffer.subarray(offset, segmentEnd));
    offset = segmentEnd;
  }
  return Buffer.concat(chunks);
}

const photoFiles = fs.readdirSync(photoDirectory)
  .filter(name => /\.jpe?g$/i.test(name))
  .sort((a, b) => a.localeCompare(b, 'en'));
if (photoFiles.length !== 5) throw new Error(`expected 5 JPEG photos, found ${photoFiles.length}`);

const galleryItems = photoFiles.map(name => {
  const jpeg = stripJpegExif(fs.readFileSync(path.join(photoDirectory, name)));
  return `      "data:image/jpeg;base64,${jpeg.toString('base64')}"`;
});

const encrypted = fs.readFileSync(invitationPath);
const iterations = encrypted.readUInt32BE(8);
const key = crypto.pbkdf2Sync(passphrase.normalize('NFKC'), encrypted.subarray(12, 28), iterations, 32, 'sha256');
const decipher = crypto.createDecipheriv('aes-256-gcm', key, encrypted.subarray(28, 40));
decipher.setAAD(Buffer.from('wedding-card-v1'));
decipher.setAuthTag(encrypted.subarray(40, 56));
let html = zlib.gunzipSync(Buffer.concat([decipher.update(encrypted.subarray(56)), decipher.final()])).toString('utf8');

html = replaceOnce(html, '이야기가 시작된 이 도시에서,<br>', '이야기가 시작된 이 도시에서<br>', 'remove story comma');

const galleryBlock = html.match(/gallery:\s*\[[\s\S]*?\],\n\s*map:/)?.[0];
if (!galleryBlock) throw new Error('gallery configuration block not found');
const newGalleryBlock = `gallery: [\n${galleryItems.join(',\n')}\n    ],\n    map:`;
html = replaceOnce(html, galleryBlock, newGalleryBlock, 'replace gallery photos');

const configuredGallery = html.match(/gallery:\s*\[[\s\S]*?\],\n\s*map:/)?.[0] || '';
if ((configuredGallery.match(/data:image\/jpeg;base64,/g) || []).length !== 5) throw new Error('gallery does not contain exactly 5 images');
if (html.includes('이야기가 시작된 이 도시에서,<br>')) throw new Error('story comma remains');
if (html.includes('아직 뚝딱뚝딱중')) throw new Error('gallery construction overlay returned');

const salt = crypto.randomBytes(16);
const iv = crypto.randomBytes(12);
const outputKey = crypto.pbkdf2Sync(passphrase.normalize('NFKC'), salt, iterations, 32, 'sha256');
const cipher = crypto.createCipheriv('aes-256-gcm', outputKey, iv);
cipher.setAAD(Buffer.from('wedding-card-v1'));
const ciphertext = Buffer.concat([cipher.update(zlib.gzipSync(Buffer.from(html))), cipher.final()]);
const header = Buffer.alloc(12);
header.write('WEDLOCK1');
header.writeUInt32BE(iterations, 8);
fs.writeFileSync(invitationPath, Buffer.concat([header, salt, iv, cipher.getAuthTag(), ciphertext]));

console.log(`Updated story punctuation and replaced the gallery with ${photoFiles.length} EXIF-free photos.`);
