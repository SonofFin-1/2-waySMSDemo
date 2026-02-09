# S3 Deployment with Environment Variables

This guide explains how to deploy your app to S3 with environment variables working.

## How It Works

Vite automatically embeds environment variables prefixed with `VITE_` into your build at build time. This means:
- Your `.env` file is read during `npm run build`
- The `VITE_OPENAI_API_KEY` value is embedded into the JavaScript bundle
- The API key will work in S3 static hosting

## Setup Steps

### 1. Ensure .env File Exists

Make sure you have a `.env` file in the `vite-project` directory:

```env
VITE_OPENAI_API_KEY=sk-proj-your-actual-api-key-here
```

### 2. Build the Project

The build process will automatically read your `.env` file and embed the variables:

```powershell
cd vite-project
npm run build
```

### 3. Deploy to S3

#### Option A: Using the Deployment Script (Recommended)

```powershell
.\deploy.ps1 -BucketName "your-bucket-name" -Region "us-east-1"
```

The script will:
- Check for `.env` file
- Load environment variables
- Build the project (with env vars embedded)
- Deploy to S3

#### Option B: Manual Deployment

```powershell
# Build (env vars will be embedded)
npm run build

# Deploy to S3
aws s3 sync dist/ s3://your-bucket-name --delete
```

## Verifying Environment Variables

After building, you can verify the API key is embedded by:

1. Open `dist/assets/index-*.js` (the main bundle)
2. Search for `VITE_OPENAI_API_KEY` or your API key
3. You should see it embedded in the code

## Important Security Notes

⚠️ **Warning**: When you embed API keys in client-side JavaScript:
- **Anyone can see your API key** by viewing the page source or browser dev tools
- **Anyone can use your API key** and consume your credits
- This is **not recommended for production** with sensitive keys

### Better Alternatives for Production:

1. **Use a Backend Proxy**: Create an API endpoint that calls OpenAI server-side
2. **Use AWS Lambda**: Create a serverless function to proxy OpenAI requests
3. **Use API Gateway**: Set up an API Gateway with Lambda to hide your keys
4. **Use Environment-Specific Keys**: Use separate, limited API keys for demo/production

## Testing After Deployment

1. Visit your S3 website URL
2. Open browser DevTools (F12)
3. Go to Console tab
4. Type a message in Version A
5. Check console logs - you should see:
   - `API Key loaded: Yes (length: ...)`
   - `🤖 Calling OpenAI API for: [your message]`

If you see `⚠️ No API key found`, the environment variable wasn't embedded during build.

## Troubleshooting

### API Key Not Working in S3

1. **Check .env file exists** before building
2. **Verify variable name** starts with `VITE_`
3. **Rebuild** after changing .env file
4. **Check build output** - look for the key in dist/assets/*.js
5. **Clear browser cache** after redeploying

### Build Not Including Env Vars

- Make sure `.env` file is in the `vite-project` directory (same level as `package.json`)
- Variable must be prefixed with `VITE_`
- Restart dev server or rebuild after changing `.env`

## Example .env File

```env
# OpenAI API Key
VITE_OPENAI_API_KEY=sk-proj-YOUR_API_KEY_HERE
```

## Next Steps

After deployment:
1. Test the AI categorization in Version A
2. Monitor OpenAI API usage
3. Consider setting up CloudFront for HTTPS
4. For production, implement a backend proxy for API keys
