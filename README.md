# PhotoShare Starter

Local prototype of a photo-sharing app. This first phase stores uploaded photos on the local disk. It does **not** yet use AWS, provide user authentication, or validate image bytes beyond the reported MIME type; do not expose it publicly.

## Requirements
Node.js 20 or newer, npm.

## Run
```bash
npm install
npm start
```
Open http://localhost:3000, upload a JPG/PNG/WEBP/GIF under 5 MB, and refresh the gallery.

## Next stages
Replace disk uploads with private S3 object storage; use signed URLs or authenticated image delivery; persist metadata in RDS; add authentication, private networking, IAM least privilege, Secrets Manager, ALB/Auto Scaling, CloudWatch, and performance tests.
