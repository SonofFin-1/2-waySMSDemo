# Deploy to AWS S3

This guide will help you deploy your 2-Way SMS Demo to AWS S3. The `dist` folder is built with relative paths and embedded env so it works when uploaded to S3.

## Prerequisites

1. AWS CLI installed and configured
2. An S3 bucket created for hosting
3. AWS credentials configured

## Environment variables (available in S3)

Create a `.env` file from `.env.example` in the `vite-project` folder and set `VITE_OPENAI_API_KEY`. Vite embeds `VITE_*` variables at **build time** into the JavaScript bundle, so they are available in the deployed S3 site. Run the build **before** uploading so the contents of `.env` are included in `dist`.

## Steps

### 1. Build the Project (S3-ready dist)

From the `vite-project` folder:

```bash
cd vite-project
# Ensure .env exists with VITE_OPENAI_API_KEY so it is embedded in the build
npm run build
```

This creates a `dist` folder with:
- Relative asset paths (`base: './'`) so it works when served from S3
- `VITE_*` env variables from `.env` embedded in the bundle

### 2. Create S3 Bucket (if not already created)

```bash
aws s3 mb s3://your-bucket-name --region us-east-1
```

### 3. Enable Static Website Hosting

```bash
aws s3 website s3://your-bucket-name \
  --index-document index.html \
  --error-document index.html
```

### 4. Set Bucket Policy for Public Access

Create a file `bucket-policy.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::your-bucket-name/*"
    }
  ]
}
```

Apply the policy:

```bash
aws s3api put-bucket-policy --bucket your-bucket-name --policy file://bucket-policy.json
```

### 5. Upload Files to S3

```bash
aws s3 sync dist/ s3://your-bucket-name --delete
```

### 6. Access Your Website

Your website will be available at:
```
http://your-bucket-name.s3-website-us-east-1.amazonaws.com
```

Or if you have a custom domain configured:
```
http://your-custom-domain.com
```

## Automated Deployment Script

You can also use the provided `deploy.sh` or `deploy.ps1` script for easier deployment.

## Notes

- Make sure to replace `your-bucket-name` with your actual bucket name
- The `--delete` flag removes files from S3 that no longer exist in the dist folder
- For production, consider using CloudFront for better performance and HTTPS
