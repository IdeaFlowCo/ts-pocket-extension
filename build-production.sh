#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

echo "Building IdeaPocket for production..."

# 1. Clean the output directory and run the unified build script
echo "Running the build process..."
npm run build

# 2. Create the production zip file from the 'dist' directory
echo "Creating production zip file..."
cd dist
zip -r ../ideapocket-production.zip . -x "*.DS_Store"
cd ..

echo ""
echo "✅ Production build complete!"
echo "📦 Output: ideapocket-production.zip"
echo "🚀 The 'dist' directory is ready to be loaded as an unpacked extension for testing."
