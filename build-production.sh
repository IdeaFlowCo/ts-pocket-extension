#!/bin/bash

# ⚠️  IMPORTANT: This build script is ONLY for production releases to Chrome Web Store!
# ⚠️  For local development, you do NOT need to run this script.
# ⚠️  Just reload the extension in chrome://extensions after making changes.
#
# CHROME WEB STORE RELEASE PROCESS:
# 1. Update version in manifest.json
# 2. Run: ./build-production.sh
# 3. Test the build/ directory as unpacked extension
# 4. Upload tspocket-production.zip to https://chrome.google.com/webstore/devconsole
# 5. Submit for review and wait 1-3 business days

# Build script for production release
echo "Building TsPocket for production..."

# Check if we're in the right directory
if [ ! -f "manifest.json" ]; then
    echo "Error: manifest.json not found. Run this script from the extension root directory."
    exit 1
fi

# Create build directory
mkdir -p build

# Copy all files except debug and development files
rsync -av --exclude-from='.production-exclude' \
    --exclude='build/' \
    --exclude='.git/' \
    --exclude='.production-exclude' \
    --exclude='build-production.sh' \
    --exclude='tspocket-production.zip' \
    --exclude='tspocket_800.png' \
    . build/

# Create zip for Chrome Web Store
cd build
zip -r ../tspocket-production.zip . -x "*.DS_Store"
cd ..

echo "✅ Production build complete!"
echo "📦 Output: tspocket-production.zip"
echo ""
echo "📋 CHROME WEB STORE UPLOAD INSTRUCTIONS:"
echo "==========================================="
echo ""
echo "1. TEST THE BUILD:"
echo "   - Load the 'build/' directory as unpacked extension"
echo "   - Verify all features work correctly"
echo "   - Check that debug mode is properly hidden"
echo "   - Ensure no sensitive data in console logs"
echo ""
echo "2. UPLOAD TO CHROME WEB STORE:"
echo "   - Go to: https://chrome.google.com/webstore/devconsole"
echo "   - Find your extension (or create new item)"
echo "   - Click 'Package' → 'Upload new package'"
echo "   - Upload: tspocket-production.zip"
echo ""
echo "3. UPDATE STORE LISTING (if needed):"
echo "   - Update version number in description"
echo "   - Add any new screenshots"
echo "   - Update feature list if changed"
echo ""
echo "4. SUBMIT FOR REVIEW:"
echo "   - Fill out any required questionnaires"
echo "   - Submit for review"
echo "   - Review typically takes 1-3 business days"
echo ""
echo "5. POST-PUBLISH:"
echo "   - Tag the release in git: git tag v$(grep '"version"' manifest.json | cut -d'"' -f4)"
echo "   - Push tag: git push origin --tags"
echo ""
echo "==========================================="

# Show what was excluded
echo ""
echo "Files excluded from production:"
cat .production-exclude | grep -v "^#" | grep -v "^$"