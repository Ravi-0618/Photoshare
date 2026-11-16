
const express = require('express');
const multer = require('multer');

const fs = require('node:fs/promises');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

async function convertHeicToJpeg(buffer) {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'photoshare-heic-')
  );

  const inputPath = path.join(tempDir, 'input.heic');
  const outputPath = path.join(tempDir, 'output.jpg');

  try {
    await fs.writeFile(inputPath, buffer);

 await execFileAsync(
  '/usr/bin/prlimit',
  [
    '--as=536870912',
    '--',
    '/usr/bin/heif-convert',
    inputPath,
    outputPath
  ],
  {
    timeout: 30000,
    maxBuffer: 1024 * 1024,
    killSignal: 'SIGKILL'
  }
);

    const jpegBuffer = await fs.readFile(outputPath);

    if (jpegBuffer.length > 10 * 1024 * 1024) {
      throw new Error('Converted JPEG exceeds 10 MB.');
    }

    return jpegBuffer;
  } finally {
    await fs.rm(tempDir, {
      recursive: true,
      force: true
    });
  }
}

const path = require('path');
const crypto = require('crypto');
const { CognitoJwtVerifier } = require('aws-jwt-verify');
const {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  TransactWriteCommand
} = require('@aws-sdk/lib-dynamodb');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');

const {
  SchedulerClient,
  CreateScheduleCommand
} = require('@aws-sdk/client-scheduler');

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

const scheduler = new SchedulerClient({ region: 'us-east-2' });

const dynamo = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: 'us-east-2' })
);

const ROOMS_TABLE = 'PhotoShareRooms';

const CLEANUP_LAMBDA_ARN =
  'arn:aws:lambda:us-east-2:822449125283:function:PhotoShare-Room-Cleanup';

const SCHEDULER_ROLE_ARN =
  'arn:aws:iam::822449125283:role/PhotoShare-Scheduler-Lambda-Role';

async function scheduleRoomCleanup(roomId, expiresAt) {
  const scheduleDate = new Date(expiresAt * 1000);

  const scheduleTime = scheduleDate
    .toISOString()
    .slice(0, 19);

  return scheduler.send(new CreateScheduleCommand({
    Name: `photoshare-cleanup-${roomId}`,
    GroupName: 'default',
    ScheduleExpression: `at(${scheduleTime})`,
    ScheduleExpressionTimezone: 'UTC',
    FlexibleTimeWindow: {
      Mode: 'OFF'
    },
    Target: {
      Arn: CLEANUP_LAMBDA_ARN,
      RoleArn: SCHEDULER_ROLE_ARN,
      Input: JSON.stringify({
        roomId,
        expiresAt
      })
    },
    ActionAfterCompletion: 'DELETE',
    State: 'ENABLED'
  }));
}

const verifier = CognitoJwtVerifier.create({
  userPoolId: 'us-east-2_1FDmivh02',
  tokenUse: 'access',
  clientId: '5a5vliehdl6ek4et6cqc9u1b7l'
});

async function requireAuth(req, res, next) {
  const authorization = req.headers.authorization || '';
  const match = /^Bearer (.+)$/i.exec(authorization);

  if (!match) {
    return res.status(401).json({
      error: 'Please sign in to continue.'
    });
  }

  try {
    req.user = await verifier.verify(match[1]);
    next();
  } catch (err) {
    console.error('Authentication failed:', err.message);
    res.status(401).json({
      error: 'Invalid or expired login session.'
    });
  }
}
const types = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
  ['image/heic', '.heic'],
  ['image/heif', '.heif'],
  ['image/heic-sequence', '.heic'],
  ['image/heif-sequence', '.heif']
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
  fileSize: 10 * 1024 * 1024,
  files: 10
},


fileFilter: (_req, file, cb) => {
  const isHeicName = /\.(heic|heif)$/i.test(file.originalname);

  const isHeicMime = [
    'image/heic',
    'image/heif',
    'image/heic-sequence',
    'image/heif-sequence'
  ].includes(file.mimetype);

  const allowed = isHeicName
    ? isHeicMime || file.mimetype === 'application/octet-stream'
    : types.has(file.mimetype) && !isHeicMime;

  cb(null, allowed);
}


});

app.disable('x-powered-by');
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});
// Create a new photo-sharing room
app.post('/api/rooms', requireAuth, async (req, res, next) => {
  try {
    const roomId = crypto.randomUUID();
const now = Math.floor(Date.now() / 1000);
const expiresAt = now + 60 * 60;

// Generate a secure random invitation token
const inviteToken = crypto.randomBytes(32).toString('hex');

// Store only a hash of the token in DynamoDB
const inviteTokenHash = crypto
  .createHash('sha256')
  .update(inviteToken)
  .digest('hex');

    const room = {
      PK: `ROOM#${roomId}`,
      SK: 'METADATA',
      roomId,
      ownerId: req.user.sub,
      createdAt: now,
      expiresAt,
      status: 'active',
      inviteTokenHash
    };

    const ownerMembership = {
  PK: `ROOM#${roomId}`,
  SK: `MEMBER#${req.user.sub}`,
  userId: req.user.sub,
  role: 'owner',
  joinedAt: now,
  expiresAt
};

const cleanupRecord = {
  PK: `CLEANUP#${roomId}`,
  SK: 'METADATA',
  roomId,
  roomExpiresAt: expiresAt,
  createdAt: now,
  expiresAt: expiresAt + 24 * 60 * 60
};

await dynamo.send(new TransactWriteCommand({
  TransactItems: [
    {
      Put: {
        TableName: ROOMS_TABLE,
        Item: room,
        ConditionExpression: 'attribute_not_exists(PK)'
      }
    },
    {
      Put: {
        TableName: ROOMS_TABLE,
        Item: ownerMembership,
        ConditionExpression: 'attribute_not_exists(PK)'
      }
    },
{
      Put: {
        TableName: ROOMS_TABLE,
        Item: cleanupRecord,
        ConditionExpression: 'attribute_not_exists(PK)'
      }
    }
  ]
}));

// Schedule automatic cleanup when the room expires
await scheduleRoomCleanup(roomId, expiresAt);

    res.status(201).json({
      roomId,
      expiresAt,
      inviteToken,
      message: 'Room created successfully'
    });
  } catch (err) {
    next(err);
  }
});
// Join a room using a secure invitation token
app.post('/api/rooms/:roomId/join', requireAuth, express.json(), async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const { inviteToken } = req.body || {};

    if (
      !/^[0-9a-f-]{36}$/i.test(roomId) ||
      typeof inviteToken !== 'string' ||
      !/^[0-9a-f]{64}$/i.test(inviteToken)
    ) {
      return res.status(400).json({
        error: 'Invalid invitation.'
      });
    }

    const result = await dynamo.send(new GetCommand({
      TableName: ROOMS_TABLE,
      Key: {
        PK: `ROOM#${roomId}`,
        SK: 'METADATA'
      }
    }));

    const room = result.Item;
    const now = Math.floor(Date.now() / 1000);

    if (
      !room ||
      room.status !== 'active' ||
      room.expiresAt <= now
    ) {
      return res.status(410).json({
        error: 'This room has expired or is unavailable.'
      });
    }

    const suppliedHash = crypto
      .createHash('sha256')
      .update(inviteToken)
      .digest('hex');

    const storedHash = room.inviteTokenHash;

    if (
      typeof storedHash !== 'string' ||
      !/^[0-9a-f]{64}$/.test(storedHash) ||
      !crypto.timingSafeEqual(
        Buffer.from(suppliedHash, 'hex'),
        Buffer.from(storedHash, 'hex')
      )
    ) {
      return res.status(403).json({
        error: 'Invalid invitation token.'
      });
    }

    await dynamo.send(new TransactWriteCommand({
      TransactItems: [
        {
          ConditionCheck: {
            TableName: ROOMS_TABLE,
            Key: {
              PK: `ROOM#${roomId}`,
              SK: 'METADATA'
            },
            ConditionExpression:
              '#status = :active AND expiresAt > :now AND inviteTokenHash = :hash',
            ExpressionAttributeNames: {
              '#status': 'status'
            },
            ExpressionAttributeValues: {
              ':active': 'active',
              ':now': now,
              ':hash': suppliedHash
            }
          }
        },
        {
          Update: {
            TableName: ROOMS_TABLE,
            Key: {
              PK: `ROOM#${roomId}`,
              SK: `MEMBER#${req.user.sub}`
            },
            UpdateExpression:
              'SET userId = if_not_exists(userId, :userId), #role = if_not_exists(#role, :role), joinedAt = if_not_exists(joinedAt, :now), expiresAt = :expiresAt',
            ExpressionAttributeNames: {
              '#role': 'role'
            },
            ExpressionAttributeValues: {
              ':userId': req.user.sub,
              ':role': req.user.sub === room.ownerId ? 'owner' : 'member',
              ':now': now,
              ':expiresAt': room.expiresAt
            }
          }
        }
      ]
    }));

    res.status(201).json({
      message: 'Joined room successfully!',
      roomId,
      expiresAt: room.expiresAt
    });
  } catch (err) {
    if (err.name === 'TransactionCanceledException') {
      return res.status(409).json({
        error: 'Unable to join. You may already be a member, or the room is no longer available.'
      });
    }

    next(err);
  }
});
// Verify that the signed-in user belongs to an active room
async function requireRoomMember(req, res, next) {
  try {
    const { roomId } = req.params;

    // Validate the room ID
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(roomId)
    ) {
      return res.status(400).json({
        error: 'Invalid room ID.'
      });
    }

    const now = Math.floor(Date.now() / 1000);

    // Find the room
    const roomResult = await dynamo.send(new GetCommand({
      TableName: ROOMS_TABLE,
      Key: {
        PK: `ROOM#${roomId}`,
        SK: 'METADATA'
      }
    }));

    const room = roomResult.Item;

    if (
      !room ||
      room.status !== 'active' ||
      room.expiresAt <= now
    ) {
      return res.status(410).json({
        error: 'Room has expired or is unavailable.'
      });
    }

    // Check the current user's membership
    const memberResult = await dynamo.send(new GetCommand({
      TableName: ROOMS_TABLE,
      Key: {
        PK: `ROOM#${roomId}`,
        SK: `MEMBER#${req.user.sub}`
      }
    }));

    const member = memberResult.Item;

    if (!member || member.expiresAt <= now) {
      return res.status(403).json({
        error: 'You are not a member of this room.'
      });
    }

    req.room = room;
    req.roomMember = member;

    next();
  } catch (err) {
    next(err);
  }
}
// List photos belonging to a private room
app.get(
  '/api/rooms/:roomId/photos',
  requireAuth,
  requireRoomMember,
  async (req, res, next) => {
    try {
      const photos = [];
      let token;

      do {
        const result = await s3.send(new ListObjectsV2Command({
          Bucket: BUCKET,
          Prefix: `rooms/${req.params.roomId}/`,
          ContinuationToken: token
        }));

        for (const item of result.Contents || []) {
          if (!item.Key ||
              !/\.(jpg|png|webp|gif)$/i.test(item.Key)) {
            continue;
          }

          const remainingSeconds =
      req.room.expiresAt - Math.floor(Date.now() / 1000);

    if (remainingSeconds <= 0) {
    return res.status(410).json({
        error: 'This room has expired.'
    });
    }

    const url = await getSignedUrl(
    s3,
    new GetObjectCommand({
        Bucket: BUCKET,
        Key: item.Key
    }),
    { expiresIn: Math.min(300, remainingSeconds) }
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
  }
);

// Upload a photo to a private room
app.post(
  '/api/rooms/:roomId/photos',
  requireAuth,
  requireRoomMember,
  upload.array('photo', 10),
  async (req, res, next) => {
    try {
      if (!req.files || req.files.length === 0) {
  return res.status(400).json({
    error: 'Choose JPG, PNG, WEBP, or GIF images.'
  });
}

const roomId = req.params.roomId;
const uploadedPhotos = [];

for (const file of req.files) {
  const remainingSeconds =
    req.room.expiresAt - Math.floor(Date.now() / 1000);

  if (remainingSeconds <= 0) {
    return res.status(410).json({
      error: 'This room has expired.',
      uploaded: uploadedPhotos.length
    });
  }

  const isHeic =
  /\.(heic|heif)$/i.test(file.originalname) ||
  [
    'image/heic',
    'image/heif',
    'image/heic-sequence',
    'image/heif-sequence'
  ].includes(file.mimetype);

let imageBuffer = file.buffer;
let contentType = file.mimetype;
let extension = types.get(file.mimetype);

if (isHeic) {
  // HEIC/HEIF files use an ISO Base Media File Format container.
  const hasFtypBox =
    file.buffer.length >= 12 &&
    file.buffer.toString('ascii', 4, 8) === 'ftyp';

  const brand = file.buffer.toString('ascii', 8, 12);

  const validBrands = [
    'heic', 'heix', 'hevc', 'hevx',
    'heim', 'heis', 'hevm', 'hevs',
    'mif1', 'msf1'
  ];

  if (!hasFtypBox || !validBrands.includes(brand)) {
    return res.status(400).json({
      error: 'Invalid HEIC/HEIF image.'
    });
  }

// Convert HEIC/HEIF into JPEG
try {
  imageBuffer = await convertHeicToJpeg(file.buffer);
} catch (conversionError) {
  console.error('HEIC conversion failed:', conversionError.message);

  return res.status(422).json({
    error: 'Could not convert HEIC/HEIF photo. Please try another image.',
    uploaded: uploadedPhotos.length
  });
}

contentType = 'image/jpeg';
extension = '.jpg';

}

if (!extension) {
  return res.status(400).json({
    error: 'Unsupported image format.'
  });
}

// Check expiration again after conversion
if (Math.floor(Date.now() / 1000) >= req.room.expiresAt) {
  return res.status(410).json({
    error: 'This room has expired.',
    uploaded: uploadedPhotos.length
  });
}

const key = `rooms/${roomId}/` +
  crypto.randomUUID() +
  extension;

await s3.send(new PutObjectCommand({
  Bucket: BUCKET,
  Key: key,
  Body: imageBuffer,
  ContentType: contentType
}));

uploadedPhotos.push(path.basename(key));
}

res.status(201).json({
  message: `${uploadedPhotos.length} photo(s) uploaded successfully!`,
  count: uploadedPhotos.length,
  names: uploadedPhotos
});
    } catch (err) {
      next(err);
    }
  }
);
// Disable the old gallery endpoints.
// Photos must be accessed through a private room.
app.all('/api/photos', requireAuth, (_req, res) => {
  res.status(410).json({
    error: 'The old gallery is disabled. Please use a private room.'
  });
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
