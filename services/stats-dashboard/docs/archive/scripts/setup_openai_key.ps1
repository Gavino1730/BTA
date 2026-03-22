# OpenAI API Key Setup Script
# Run this script to set your OpenAI API key as a system environment variable

param(
    [string]$ApiKey = ""
)

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
    Write-Host "Usage: .\setup_openai_key.ps1 -ApiKey 'your-api-key-here'" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Steps:" -ForegroundColor Cyan
    Write-Host "1. Go to https://platform.openai.com/api/account/api-keys"
    Write-Host "2. Create or copy your API key"
    Write-Host "3. Run this command:" -ForegroundColor Green
    Write-Host "   .\setup_openai_key.ps1 -ApiKey 'sk-...your-key-here...'" -ForegroundColor Green
    exit
}

try {
    # Set environment variable permanently for current user
    [Environment]::SetEnvironmentVariable("OPENAI_API_KEY", $ApiKey, "User")
    
    # Also set for current session
    $env:OPENAI_API_KEY = $ApiKey
    
    Write-Host "✓ OpenAI API key set successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Key set for:" -ForegroundColor Cyan
    Write-Host "  • Current session: ✓"
    Write-Host "  • System (permanent): ✓"
    Write-Host ""
    Write-Host "You can now restart your Flask server to use the AI features." -ForegroundColor Yellow
    Write-Host "Run: python app.py" -ForegroundColor Green
}
catch {
    Write-Host "Error: $_" -ForegroundColor Red
    exit 1
}
