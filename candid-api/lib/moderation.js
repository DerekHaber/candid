const db = require('./db');
const r2 = require('./r2');

// Lazy-load heavy deps so they don't slow down server startup
let tf = null;
let nsfw = null;
let model = null;

async function getModel() {
  if (!tf) tf = require('@tensorflow/tfjs-node');
  if (!nsfw) nsfw = require('nsfwjs');
  if (!model) {
    const path = require('path');
    const modelPath = `file://${path.join(__dirname, '../nsfw-model/')}/`;
    model = await nsfw.load(modelPath);
  }
  return model;
}

// Thresholds for a 13+ app
const THRESHOLDS = {
  Porn:   0.60,
  Hentai: 0.60,
  Sexy:   0.85,
};

async function moderatePhoto(photo) {
  if (photo.media_type !== 'photo') {
    // Videos can't be run through nsfwjs — queue for manual admin review
    await db.query(
      'UPDATE photos SET moderation_status = $1 WHERE id = $2',
      ['pending_review', photo.id]
    );
    return;
  }

  try {
    const url = r2.getReadUrl(photo.storage_path);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`R2 fetch failed: ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());

    const m = await getModel();
    const image = tf.node.decodeImage(buffer, 3);
    const predictions = await m.classify(image);
    image.dispose();

    const score = name => predictions.find(p => p.className === name)?.probability ?? 0;
    const flagged = Object.entries(THRESHOLDS).some(([name, threshold]) => score(name) > threshold);

    if (flagged) {
      const reason = predictions
        .sort((a, b) => b.probability - a.probability)
        .map(p => `${p.className}: ${(p.probability * 100).toFixed(1)}%`)
        .join(', ');
      await db.query(
        'UPDATE photos SET moderation_status = $1, moderation_reason = $2 WHERE id = $3',
        ['flagged', reason, photo.id]
      );
      console.log(`[moderation] flagged photo ${photo.id}: ${reason}`);
    } else {
      await db.query(
        'UPDATE photos SET moderation_status = $1 WHERE id = $2',
        ['approved', photo.id]
      );
    }
  } catch (err) {
    console.error(`[moderation] error on photo ${photo.id}:`, err.message);
    // Fail open — approve on error to avoid blocking legitimate content
    await db.query(
      'UPDATE photos SET moderation_status = $1 WHERE id = $2',
      ['approved', photo.id]
    );
  }
}

module.exports = { moderatePhoto };
