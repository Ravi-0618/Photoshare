
const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

const {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand
} = require('@aws-sdk/client-s3');

const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const app = express();
const PORT = process.env.PORT || 3000;
const BUCKET = 'photoshare-uta-project-2026';

const s3 = new S3Client({ region: 'us-east-2' });

const types = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif']
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) =>
    cb(null, types.has(file.mimetype))
});

app.disable('x-powered-by');
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// List photos stored in S3
app.get('/api/photos', async (_req, res, next) => {
  try {
    const photos = [];
    let token;

    do {
      const result = await s3.send(new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: 'photos/',
        ContinuationToken: token
      }));

      for (const item of result.Contents || []) {
        if (!item.Key || !/\.(jpg|png|webp|gif)$/i.test(item.Key)) {
          continue;
        }

        const url = await getSignedUrl(
          s3,
          new GetObjectCommand({
            Bucket: BUCKET,
            Key: item.Key
          }),
          { expiresIn: 3600 }
        );

        photos.push({
          name: path.basename(item.Key),
          url,
          created: item.LastModified
            ? item.LastModified.getTime()
            : 0
        });
      }

      token = result.IsTruncated
        ? result.NextContinuationToken
        : undefined;
    } while (token);

    photos.sort((a, b) => b.created - a.created);
    res.json(photos);
  } catch (err) {
    next(err);
  }
});

// Upload photos directly to S3
app.post('/api/photos', upload.single('photo'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'Choose a JPG, PNG, WEBP, or GIF image.'
      });
    }

    const key = 'photos/' +
      crypto.randomUUID() +
      types.get(req.file.mimetype);

    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype
    }));

    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: BUCKET,
        Key: key
      }),
      { expiresIn: 3600 }
    );

    res.status(201).json({ url });
  } catch (err) {
    next(err);
  }
});

app.use((err, _req, res, _next) => {
  console.error(err);

  res.status(
    err instanceof multer.MulterError &&
    err.code === 'LIMIT_FILE_SIZE'
      ? 413
      : 500
  ).json({
    error: err instanceof multer.MulterError
      ? err.message
      : 'Server error'
  });
});

app.listen(PORT, () => {
  console.log(`PhotoShare running at http://localhost:${PORT}`);
});
