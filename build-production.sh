#!/bin/bash

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
    . build/

# Create zip for Chrome Web Store
cd build
zip -r ../tspocket-production.zip . -x "*.DS_Store"
cd ..

echo "✅ Production build complete!"
echo "📦 Output: tspocket-production.zip"
echo ""
echo "⚠️  Before uploading to Chrome Web Store:"
echo "1. Test the extension from the build/ directory"
echo "2. Verify debug features are hidden"
echo "3. Check that no sensitive data is logged"

# Show what was excluded
echo ""
echo "Files excluded from production:"
cat .production-exclude | grep -v "^#" | grep -v "^$"