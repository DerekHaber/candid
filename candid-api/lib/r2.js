const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
  // R2 does not support AWS checksum extensions — disable them
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

const BUCKET = () => process.env.R2_BUCKET_NAME;

async function getUploadUrl(key, contentType) {
  // ContentType excluded from signed command so it isn't part of the signature —
  // the client still sends it as a header, R2 just won't verify it matches.
  const cmd = new PutObjectCommand({ Bucket: BUCKET(), Key: key });
  return getSignedUrl(client, cmd, { expiresIn: 900 });
}

async function getReadUrl(key) {
  const cmd = new GetObjectCommand({ Bucket: BUCKET(), Key: key });
  return getSignedUrl(client, cmd, { expiresIn: 3600 });
}

async function getReadUrls(keys) {
  return Promise.all(
    keys.map(async key => ({ path: key, signedUrl: await getReadUrl(key) }))
  );
}

async function deleteObject(key) {
  const cmd = new DeleteObjectCommand({ Bucket: BUCKET(), Key: key });
  return client.send(cmd);
}

module.exports = { getUploadUrl, getReadUrl, getReadUrls, deleteObject };
