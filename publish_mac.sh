#!/usr/bin/env bash
# publish_mac.sh — Build PRAMAAN QC Tool for macOS
# Usage:
#   chmod +x publish_mac.sh
#   ./publish_mac.sh [arm64|x64|both]        (default: both)
#
# Outputs:
#   publish/osx-arm64/Pramaan.app    (Apple Silicon)
#   publish/osx-x64/Pramaan.app      (Intel)
#   publish/Pramaan_QC_Tool_macOS_arm64.zip
#   publish/Pramaan_QC_Tool_macOS_x64.zip

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT="$SCRIPT_DIR/src/Pramaan.Avalonia/Pramaan.Avalonia.csproj"
OUT_BASE="$SCRIPT_DIR/publish"
APP_NAME="PRAMAAN"
BUNDLE_ID="com.pramaan.qctool"
VERSION="1.0.0"
ARCH="${1:-both}"

build_arch() {
    local rid="$1"
    local out_dir="$OUT_BASE/$rid"
    local app_dir="$out_dir/$APP_NAME.app"
    local zip_name="Pramaan_QC_Tool_macOS_${rid#osx-}.zip"
    local zip_path="$OUT_BASE/$zip_name"

    echo ""
    echo "══════════════════════════════════════════"
    echo "  Building for $rid"
    echo "══════════════════════════════════════════"

    # Clean previous output
    rm -rf "$app_dir"
    mkdir -p "$app_dir/Contents/MacOS"
    mkdir -p "$app_dir/Contents/Resources"

    # Publish self-contained single-file
    dotnet publish "$PROJECT" \
        -c Release \
        -r "$rid" \
        --self-contained true \
        -p:PublishSingleFile=true \
        -p:PublishTrimmed=false \
        -p:IncludeNativeLibrariesForSelfExtract=true \
        -o "$app_dir/Contents/MacOS"

    # Copy Info.plist
    local plist_src="$SCRIPT_DIR/Info.plist"
    if [ -f "$plist_src" ]; then
        cp "$plist_src" "$app_dir/Contents/Info.plist"
    else
        echo "⚠  Info.plist not found at $plist_src — generating minimal one"
        cat > "$app_dir/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>         <string>$APP_NAME</string>
    <key>CFBundleIdentifier</key>   <string>$BUNDLE_ID</string>
    <key>CFBundleVersion</key>      <string>$VERSION</string>
    <key>CFBundleShortVersionString</key> <string>$VERSION</string>
    <key>CFBundleExecutable</key>   <string>Pramaan.Avalonia</string>
    <key>CFBundlePackageType</key>  <string>APPL</string>
    <key>NSHighResolutionCapable</key> <true/>
    <key>LSMinimumSystemVersion</key> <string>12.0</string>
</dict>
</plist>
PLIST
    fi

    # Copy app icon if available
    if [ -f "$SCRIPT_DIR/src/Pramaan.Avalonia/Assets/app_icon.icns" ]; then
        cp "$SCRIPT_DIR/src/Pramaan.Avalonia/Assets/app_icon.icns" \
           "$app_dir/Contents/Resources/AppIcon.icns"
        # Patch icon reference into Info.plist
        /usr/libexec/PlistBuddy -c "Set :CFBundleIconFile AppIcon" \
            "$app_dir/Contents/Info.plist" 2>/dev/null || true
    fi

    # Make the binary executable
    chmod +x "$app_dir/Contents/MacOS/Pramaan.Avalonia" 2>/dev/null || true

    # Attempt ad-hoc code sign (required on macOS 11+ to run unsigned apps)
    if command -v codesign &>/dev/null; then
        echo "  → Ad-hoc signing $APP_NAME.app ..."
        codesign --force --deep --sign - "$app_dir" 2>/dev/null && \
            echo "  ✓ Signed (ad-hoc)" || \
            echo "  ⚠  codesign failed — app may require Gatekeeper bypass on target machine"
    else
        echo "  ⚠  codesign not available — skipping signing"
    fi

    # Package the app bundle as a single zip file for GitHub Actions artifacts.
    rm -f "$zip_path"
    ditto -c -k --sequesterRsrc --keepParent "$app_dir" "$zip_path"

    echo "  ✓ Done → $app_dir"
    echo "  ✓ Packaged → $zip_path"
}

case "$ARCH" in
    arm64) build_arch "osx-arm64" ;;
    x64)   build_arch "osx-x64" ;;
    both)
        build_arch "osx-arm64"
        build_arch "osx-x64"
        ;;
    *)
        echo "Unknown arch '$ARCH'. Use: arm64, x64, or both"
        exit 1
        ;;
esac

echo ""
echo "══════════════════════════════════════════"
echo "  Build complete!"
echo "  Output: $OUT_BASE"
echo ""
echo "  To run on macOS (bypass Gatekeeper for unsigned builds):"
echo "    xattr -cr publish/osx-arm64/$APP_NAME.app"
echo "    open   publish/osx-arm64/$APP_NAME.app"
echo "══════════════════════════════════════════"
