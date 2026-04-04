#!/bin/bash
# BioDigital Player - Build & Upload to transfer.sh
# Run on YOUR LOCAL MACHINE after cloning the repo

set -e  # Exit on error

cd "$(dirname "$0")" || exit 1

echo "════════════════════════════════════════════════════════"
echo "🚀 BioDigital Player - Building APK"
echo "════════════════════════════════════════════════════════"
echo ""

# Step 1: Install NPM dependencies
echo "📦 Step 1/4: Installing NPM dependencies..."
echo "   (This takes ~3 minutes, downloading 658 packages)"
npm install --legacy-peer-deps 2>&1 | tail -5

# Step 2: Generate native code
echo ""
echo "🔧 Step 2/4: Generating native Android code..."
echo "   (This takes ~2 minutes)"
npx expo prebuild --clean 2>&1 | grep -E "(✓|✅|Generated|success)" | tail -5

# Step 3: Build APK
echo ""
echo "🏗️  Step 3/4: Building APK..."
echo "   ⚠️  THIS TAKES 15-25 MINUTES ON FIRST BUILD"
echo "   ⚠️  DO NOT INTERRUPT OR CLOSE THE TERMINAL"
echo ""
cd android
./gradlew assembleRelease

# Step 4: Upload to transfer.sh
echo ""
echo "════════════════════════════════════════════════════════"
APK_PATH="app/build/outputs/apk/release/app-release.apk"

if [ -f "$APK_PATH" ]; then
    echo "✅ APK BUILD SUCCESSFUL!"
    echo ""
    echo "📤 Step 4/4: Uploading to transfer.sh..."
    echo ""
    
    DOWNLOAD_URL=$(curl --upload-file "$APK_PATH" https://transfer.sh/BioDigital-Player-1.0.0.apk)
    
    echo ""
    echo "════════════════════════════════════════════════════════"
    echo "✅ SUCCESS! Your download link:"
    echo ""
    echo "🌐 $DOWNLOAD_URL"
    echo ""
    echo "════════════════════════════════════════════════════════"
    echo ""
    echo "📥 Installation Instructions:"
    echo ""
    echo "1. Copy the link above"
    echo "2. Open on your Android phone (or use: adb install <file>)"
    echo "3. Enable 'Unknown Sources' in Settings > Security"
    echo "4. Tap the APK file to install"
    echo ""
    echo "════════════════════════════════════════════════════════"
else
    echo "❌ BUILD FAILED - APK not found at $APK_PATH"
    echo ""
    echo "Troubleshooting:"
    echo "  • Check that Java 21 is installed: java -version"
    echo "  • Check that Android SDK is set: echo \$ANDROID_HOME"
    echo "  • Try: ./gradlew clean && ./gradlew assembleRelease"
    exit 1
fi
