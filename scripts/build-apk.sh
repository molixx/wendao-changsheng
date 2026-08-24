#!/usr/bin/env bash
# 一键构建安卓 APK（debug 版，免签名可侧载）
# 本机 JDK 与 Android SDK 路径已硬编码，无需配置环境变量
set -e
cd "$(dirname "$0")/.."

export JAVA_HOME="/Users/asura/Documents/jdk-21.0.12.1.jdk/Contents/Home"
export PATH="$JAVA_HOME/bin:$PATH"
SDK_DIR="/Users/asura/Documents/AI_问道长生/android-sdk"
ANDROID_USER_HOME="/Users/asura/Documents/AI_问道长生/.android-home"
export GRADLE_USER_HOME="/Users/asura/Documents/AI_问道长生/.gradle-home"

echo "① 检查 JDK / SDK…"
[ -x "$JAVA_HOME/bin/java" ] || { echo "❌ 找不到 JDK：$JAVA_HOME"; exit 1; }
[ -d "$SDK_DIR/platforms/android-36" ] || { echo "❌ 找不到 SDK platform 36：$SDK_DIR"; exit 1; }
echo "   JDK $(java -version 2>&1 | head -1)"

echo "② 写入 local.properties（gradle 找 SDK 用）…"
echo "sdk.dir=$SDK_DIR" > android/local.properties

echo "③ 构建 web 资源…"
npm run build

echo "④ 同步到安卓工程…"
npx cap sync android

echo "⑤ 打包 debug APK…"
cd android
ANDROID_USER_HOME="$ANDROID_USER_HOME" ./gradlew assembleDebug
echo ""
echo "✅ 完成！APK 位置：android/app/build/outputs/apk/debug/app-debug.apk"
echo "   传到手机后点击安装（需允许「安装未知来源应用」）。"
