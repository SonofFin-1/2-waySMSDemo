# Quick S3 Deployment Guide

Your project is now ready for AWS S3 deployment!

## Quick Deploy (PowerShell)

1. **Build the project** (already done):
   ```powershell
   npm run build
   ```

2. **Deploy using the script**:
   ```powershell
   .\deploy.ps1 -BucketName "your-bucket-name" -Region "us-east-1"
   ```

## Manual Deploy Steps

1. **Build** (if not already done):
   ```powershell
   npm run build
   ```

2. **Create S3 bucket** (if needed):
   ```powershell
   aws s3 mb s3://your-bucket-name --region us-east-1
   ```

3. **Enable static website hosting**:
   ```powershell
   aws s3 website s3://your-bucket-name --index-document index.html --error-document index.html
   ```

4. **Upload files**:
   ```powershell
   aws s3 sync dist/ s3://your-bucket-name --delete
   ```

5. **Access your site**:
   ```
   http://your-bucket-name.s3-website-us-east-1.amazonaws.com
   ```

## Important Notes

- Replace `your-bucket-name` with your actual bucket name
- Make sure your bucket has public read access for the website to work
- The `dist/` folder contains all files ready for upload
- For production, consider using CloudFront for HTTPS and better performance

## Files Ready for Deployment

All production files are in the `dist/` folder:
- `index.html` - Main HTML file
- `assets/` - CSS and JavaScript bundles
