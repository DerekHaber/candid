const tf = require('@tensorflow/tfjs-node');
const db = require('./db');
const r2 = require('./r2');

// nsfwjs output categories (fixed order from the mobilenet_v2_mid model)
const CATEGORIES = ['Drawing', 'Hentai', 'Neutral', 'Porn', 'Sexy'];
const IMAGE_SIZE = 224;

const THRESHOLDS = {
  Porn:   0.40,
  Hentai: 0.40,
  Sexy:   0.70,
};

let model = null;

async function getModel() {
  if (!model) {
    const port = process.env.PORT || 3000;
    model = await tf.loadGraphModel(
      `http://localhost:${port}/nsfw-model/mobilenet_v2_mid/model.json`
    );
  }
  return model;
}

async function classify(buffer) {
  const m = await getModel();
  const image = tf.node.decodeImage(buffer, 3);
  const input = tf.tidy(() =>
    tf.image.resizeBilinear(image, [IMAGE_SIZE, IMAGE_SIZE], true)
      .toFloat()
      .div(255)
      .expandDims(0)
  );
  image.dispose();

  const output = m.predict(input);
  input.dispose();

  const scores = await output.data();
  output.dispose();

  return CATEGORIES.map((name, i) => ({ className: name, probability: scores[i] }));
}

async function moderatePhoto(photo) {
  if (photo.media_type !== 'photo') {
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

    const predictions = await classify(buffer);
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
      const approvedScores = predictions
        .sort((a, b) => b.probability - a.probability)
        .map(p => `${p.className}: ${(p.probability * 100).toFixed(1)}%`)
        .join(', ');
      console.log(`[moderation] approved photo ${photo.id}: ${approvedScores}`);
      await db.query(
        'UPDATE photos SET moderation_status = $1 WHERE id = $2',
        ['approved', photo.id]
      );
    }
  } catch (err) {
    console.error(`[moderation] error on photo ${photo.id}:`, err.message, err.cause ?? '');
    await db.query(
      'UPDATE photos SET moderation_status = $1 WHERE id = $2',
      ['approved', photo.id]
    );
  }
}

module.exports = { moderatePhoto };
