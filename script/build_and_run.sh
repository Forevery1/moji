#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
export PATH="$HOME/.cargo/bin:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
MODE="${1:-run}"
pkill -x moji >/dev/null 2>&1 || true
npm run build:mac
mkdir -p release/macos
/usr/bin/ditto "src-tauri/target/release/bundle/macos/墨记.app" "release/macos/墨记.app"
APP_BUNDLE="$ROOT_DIR/release/macos/墨记.app"
case "$MODE" in
 run) /usr/bin/open -n "$APP_BUNDLE" ;;
 --verify|verify) /usr/bin/open -n "$APP_BUNDLE"; sleep 2; pgrep -x moji >/dev/null; echo "墨记已启动" ;;
 --debug|debug) lldb -- "$APP_BUNDLE/Contents/MacOS/moji" ;;
 --logs|logs|--telemetry|telemetry) /usr/bin/open -n "$APP_BUNDLE"; /usr/bin/log stream --info --style compact --predicate 'process == "moji"' ;;
 *) echo 'usage: ./script/build_and_run.sh [run|--verify|--debug|--logs|--telemetry]' >&2; exit 2 ;;
esac
