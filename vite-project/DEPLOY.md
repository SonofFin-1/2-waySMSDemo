# AWS S3 Deployment Guide

## Important: Environment Variables

**Before deploying**, make sure your `.env` file exists with your API keys:
```
VITE_OPENAI_API_KEY=your-actual-api-key-here
```

The environment variables will be **embedded into the build** at build time, so they'll work in S3 static hosting.

⚠️ **Security Note**: API keys embedded in client-side code are visible to anyone. For production, consider using a backend proxy to hide your API keys.

## Quick Deploy

### Option 1: Using PowerShell Script (Recommended)

```powershell
.\deploy.ps1 -BucketName "your-bucket-name" -Region "us-east-1"
```

The script will automatically:
1. Load your `.env` file
2. Build the project with environment variables embedded
3. Deploy to S3

### Option 2: Manual Deployment

1. **Build the project:**
   ```powershell
   npm run build
   ```

2. **Create S3 bucket (if not exists):**
   ```powershell
   aws s3 mb s3://your-bucket-name --region us-east-1
   ```

3. **Enable static website hosting:**
   ```powershell
   aws s3 website s3://your-bucket-name --index-document index.html --error-document index.html
   ```

4. **Set bucket policy for public access:**
   - Edit `bucket-policy.json` and replace `YOUR-BUCKET-NAME` with your actual bucket name
   - Apply the policy:
   ```powershell
   aws s3api put-bucket-policy --bucket your-bucket-name --policy file://bucket-policy.json
   ```

5. **Upload files:**
   ```powershell
   aws s3 sync dist/ s3://your-bucket-name --delete
   ```

6. **Access your website:**
   ```
   http://your-bucket-name.s3-website-us-east-1.amazonaws.com
   ```

## Important Notes

- Replace `your-bucket-name` with your actual S3 bucket name
- The `--delete` flag removes files from S3 that no longer exist in the dist folder
- Make sure AWS CLI is installed and configured with your credentials
- For production, consider using CloudFront for better performance and HTTPS

## File Structure

After building, the `dist/` folder contains:
- `index.html` - Main HTML file
- `assets/` - JavaScript and CSS files
- `vite.svg` - Icon file

All files are ready for S3 static website hosting.
