# 🚀 BioDigital Player - INSTANT BUILD GUIDE

## ⚡ Problem Identified
**Codespace doesn't have Android SDK.** Build MUST run on your local machine.

---

## ✅ Solution: 3-Command Build

### On YOUR LOCAL MACHINE:

```bash
# Clone the project
git clone <your-repo-url>
cd BioDigital-Player

# ONE LINE BUILD (copy this entire thing):
npm install && npx expo prebuild --clean && cd android && ./gradlew assembleRelease && curl --upload-file app/build/outputs/apk/release/app-release.apk https://transfer.sh/BioDigital-Player.apk
```

**That's it!** You'll get your download link automatically.

---

## 📋 Prerequisites Checklist

Before running above, verify you have:

- [ ] **Java 21** - Check: `java -version` (should show 21.x.x)
- [ ] **Android SDK** - Check: `echo $ANDROID_HOME` (should show path)
- [ ] **Node.js 18+** - Check: `node -v` (should show v18+)

### If Missing, Install:

**Java 21:**
```bash
# Windows: Download from https://www.oracle.com/java/technologies/javase/jdk21-archive-downloads.html
# Mac: brew install java21
# Linux: sudo apt install openjdk-21-jdk
```

**Android Studio (includes SDK):**
```bash
# Download from https://developer.android.com/studio
# Run installer
# During setup, let it install SDK automatically
```

**Node.js:**
```bash
# Download from https://nodejs.org/ (get v18 or newer)
```

---

## 🎯 Step-by-Step Process

### Step 1: Prepare Environment (5 min)

**Windows (PowerShell):**
```powershell
$env:JAVA_HOME = "C:\Program Files\Java\jdk-21.0.9"
$env:ANDROID_HOME = "$env:USERPROFILE\AppData\Local\Android\Sdk"
```

**Mac/Linux:**
```bash
export JAVA_HOME=/usr/libexec/java_home -v 21
export ANDROID_HOME=$HOME/Android/Sdk
```

Verify:
```bash
java -version
echo $ANDROID_HOME
```

### Step 2: Clone Repository (1 min)

```bash
git clone https://github.com/your-username/BioDigital-Player.git
cd BioDigital-Player
```

### Step 3: Install Dependencies (3 min)

```bash
npm install
```

Output should show: `added 658 packages, 0 vulnerabilities`

### Step 4: Generate Native Code (2 min)

```bash
npx expo prebuild --clean
```

This creates the `android/` folder with all native code.

### Step 5: Build APK (15-25 min FIRST TIME)

```bash
cd android
./gradlew assembleRelease
```

**Status messages:**
- ✅ `Downloading gradle wrapper` - Normal, 1-2 min
- ✅ `Downloading dependencies` - Normal, takes time
- ✅ `Compiling Kotlin` - Normal, several minutes
- ✅ `BUILD SUCCESSFUL` - APK is ready!

### Step 6: Upload to transfer.sh (1 min)

```bash
curl --upload-file app/build/outputs/apk/release/app-release.apk \
  https://transfer.sh/BioDigital-Player-1.0.0.apk
```

You'll see: `https://transfer.sh/xxxxx/BioDigital-Player-1.0.0.apk`

**Copy that URL - that's your download link!** 📥

---

## 🐛 Troubleshooting

### "ANDROID_HOME not set"
```bash
# Set it:
export ANDROID_HOME=$HOME/Android/Sdk

# Verify:
echo $ANDROID_HOME
# Should print path, not empty
```

### "Cannot find JAVA_HOME"
```bash
# Check Java:
java -version

# Set Java:
export JAVA_HOME=/usr/libexec/java_home -v 21

# Verify:
$JAVA_HOME/bin/java -version
```

### Gradle build hangs/stuck
- **Normal!** First build takes 15-25 minutes
- Don't close terminal
- Check internet connection
- If it fails after 30 min, run: `./gradlew clean`

### "Unsupported class file major version"
```bash
# Wrong Java version. Use Java 21:
java -version
# If not 21, set JAVA_HOME correctly
```

### "Build failed" or Gradle errors
```bash
# Clear cache and retry:
cd android
./gradlew clean
./gradlew assembleRelease
```

---

## 📊 Expected Output Timeline

```
0:00 - 0:05  ✓ npm install (658 packages)
0:05 - 0:07  ✓ npx expo prebuild (generates android/ folder)
0:07 - 1:30  ✓ First ./gradlew assembleRelease
           - Gradle downloads (~50MB)
           - Dependencies download (~3GB)
           - Compilation happens
1:30 - 1:35  ✓ BUILD SUCCESSFUL
1:35 - 1:36  ✓ Upload to transfer.sh
1:36+        ✅ DOWNLOAD LINK READY
```

---

## ✅ Success Indicators

### During Build:
```
:app:compileReleaseKotlin
:app:compileReleaseResources
:app:mergeReleaseResources
:app:packageRelease
:app:alignReleaseApk
:app:zipAlignReleaseApk

BUILD SUCCESSFUL in 8m 45s
50 actionable tasks: 1 executed, 49 up-to-date
```

### After Upload:
```
https://transfer.sh/xxxxx/BioDigital-Player-1.0.0.apk
```

---

## 📱 Install APK After Getting Link

### Option A: Direct Download
1. Copy the transfer.sh link
2. Download on Android phone
3. Enable "Unknown Sources" in Settings > Security
4. Tap to install

### Option B: ADB Install
```bash
adb devices  # Verify phone is connected
adb install app/build/outputs/apk/release/app-release.apk
```

### Option C: Share the Link
Send the transfer.sh link to anyone to install!

---

## 🎁 You're Getting

✅ Full React Native app (7 screens)  
✅ YouTube-DL integration (Kotlin)  
✅ Multi-quality video support  
✅ Material Design UI  
✅ Production-ready code  

**Size:** ~60-80 MB APK  
**Requires:** Android 8.0+ (API 24)  

---

## 💡 Pro Tips

- **First build slow?** Normal! Cache speeds up next builds to 5-10 min
- **Want debug APK faster?** Use: `./gradlew assembleDebug` (~5 min, larger file)
- **Build in background?** Use `nohup` or `screen` on Linux/Mac
- **Share with team?** Just send the transfer.sh link!

---

## ✨ What's Included in APK

🎬 **Features:**
- Download YouTube videos
- Multi-quality support (360p to 4320p)
- Stream videos
- Offline playback
- Playlist management
- Watch history
- Beautiful UI

🛠️ **Tech:**
- React Native + Expo
- Kotlin native bridge
- YouTube-DL (yt-dlp v0.16)
- Material Design

---

## 🚀 Ready?

Run this command and come back in 30 minutes with your download link:

```bash
npm install && npx expo prebuild --clean && cd android && ./gradlew assembleRelease && curl --upload-file app/build/outputs/apk/release/app-release.apk https://transfer.sh/BioDigital-Player.apk
```

**Good luck! 🎉**
