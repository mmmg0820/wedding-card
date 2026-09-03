const crypto = require('crypto');
const fs = require('fs');
const zlib = require('zlib');

const invitationPath = process.argv[2] || 'docs/assets/invitation.enc';
const passphrase = process.env.INVITATION_PASSPHRASE;
if (!passphrase) throw new Error('INVITATION_PASSPHRASE is required');

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected once, found ${count}`);
  return source.replace(before, after);
}

const encrypted = fs.readFileSync(invitationPath);
const iterations = encrypted.readUInt32BE(8);
const key = crypto.pbkdf2Sync(passphrase.normalize('NFKC'), encrypted.subarray(12, 28), iterations, 32, 'sha256');
const decipher = crypto.createDecipheriv('aes-256-gcm', key, encrypted.subarray(28, 40));
decipher.setAAD(Buffer.from('wedding-card-v1'));
decipher.setAuthTag(encrypted.subarray(40, 56));
let html = zlib.gunzipSync(Buffer.concat([decipher.update(encrypted.subarray(56)), decipher.final()])).toString('utf8');

html = replaceOnce(
  html,
  `    galleryEnabled: "ON",
    eventPhoto:`,
  `    galleryEnabled: "ON",
    // "ON": WEDDING DAY 아래 예식장 사진 표시, "OFF": 숨김
    eventPhotoEnabled: "OFF",
    eventPhoto:`,
  'event photo feature switch',
);

html = replaceOnce(
  html,
  `    document.getElementById("img-event").src = CONFIG.eventPhoto;`,
  `    const eventPhotoElement = document.getElementById("img-event");
    const eventPhotoWrapper = eventPhotoElement?.closest('.photo-watermarked');
    const eventPhotoEnabled = String(CONFIG.eventPhotoEnabled).trim().toUpperCase() === "ON";
    if (eventPhotoWrapper) eventPhotoWrapper.hidden = !eventPhotoEnabled;
    if (eventPhotoElement && eventPhotoEnabled) eventPhotoElement.src = CONFIG.eventPhoto;`,
  'event photo rendering',
);

if (!html.includes('eventPhotoEnabled: "OFF"')) throw new Error('event photo is not disabled');
if (!html.includes('eventPhotoWrapper.hidden = !eventPhotoEnabled')) throw new Error('event photo visibility logic missing');

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

console.log('Disabled the event photo while preserving it behind a feature switch.');
