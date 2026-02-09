# PowerShell script to deploy to AWS S3
# Run from vite-project: .\deploy.ps1 -BucketName "your-bucket-name"
# .env in this folder is read at build time; VITE_* vars are embedded into dist for S3.
param(
    [Parameter(Mandatory=$true)]
    [string]$BucketName,
    
    [Parameter(Mandatory=$false)]
    [string]$Region = "us-east-1"
)

# Ensure we're in the project directory (where package.json and .env live)
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $scriptDir

Write-Host "Checking for .env file..." -ForegroundColor Green
if (Test-Path ".env") {
    Write-Host ".env file found - VITE_* variables will be embedded in the build for S3" -ForegroundColor Cyan
    Get-Content .env | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim()
            [Environment]::SetEnvironmentVariable($key, $value, "Process")
        }
    }
} else {
    Write-Host "Warning: .env file not found. Copy .env.example to .env and set VITE_OPENAI_API_KEY so it is available in the S3 build." -ForegroundColor Yellow
}

Write-Host "Building project (dist will be S3-ready with relative paths)..." -ForegroundColor Green
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    Pop-Location
    exit 1
}

Write-Host "Checking if bucket exists..." -ForegroundColor Green
$bucketExists = aws s3 ls "s3://$BucketName" 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "Bucket does not exist. Creating bucket..." -ForegroundColor Yellow
    aws s3 mb "s3://$BucketName" --region $Region
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to create bucket!" -ForegroundColor Red
        Pop-Location
        exit 1
    }
    
    Write-Host "Configuring bucket for static website hosting..." -ForegroundColor Green
    aws s3 website "s3://$BucketName" --index-document index.html --error-document index.html
}

Write-Host "Uploading dist/ to S3..." -ForegroundColor Green
aws s3 sync dist/ "s3://$BucketName" --delete

# Ensure index.html is not cached so users get updates
if (Test-Path "dist/index.html") {
    aws s3 cp "dist/index.html" "s3://$BucketName/index.html" --cache-control "no-cache, no-store, must-revalidate" --content-type "text/html"
}

Pop-Location

if ($LASTEXITCODE -eq 0) {
    Write-Host "Deployment successful!" -ForegroundColor Green
    Write-Host "Website URL: http://$BucketName.s3-website-$Region.amazonaws.com" -ForegroundColor Cyan
} else {
    Write-Host "Deployment failed!" -ForegroundColor Red
    exit 1
}
