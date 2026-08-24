#!/usr/bin/env bash
# 一键构建安卓 APK：需要本机已装 JDK 17+ / Android SDK（ANDROID_HOME 已配置）
set -e
cd "$(dirname "$0")/.."

echo "① 构建 web 资源…"
npm run build

echo "② 同步到安卓工程…"
npx cap sync android

echo "③ 打包 debug APK（免签名，可直接侧载安装）…"
cd android
./gradlew assembleDebug

echo ""
echo "✅ 完成！APK 位置：android/app/build/outputs/apk/debug/app-debug.apk"
echo "   传到手机后点击安装即可（需允许「安装未知来源应用」）。"
