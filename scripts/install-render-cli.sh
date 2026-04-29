#!/usr/bin/env bash

set -euo pipefail

VERSION_INPUT="${1:-${RENDER_CLI_VERSION:-2.16.0}}"
VERSION="${VERSION_INPUT#v}"
INSTALL_DIR="${RENDER_CLI_INSTALL_DIR:-$HOME/.local/bin}"

for required_cmd in curl unzip install uname; do
  if ! command -v "$required_cmd" >/dev/null 2>&1; then
    echo "Missing required command: $required_cmd" >&2
    exit 1
  fi
done

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH_RAW="$(uname -m)"

case "$ARCH_RAW" in
  x86_64|amd64) ARCH="amd64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  armv7l|armv6l) ARCH="arm" ;;
  i386|i686) ARCH="386" ;;
  *)
    echo "Unsupported architecture: $ARCH_RAW" >&2
    exit 1
    ;;
esac

if [[ "$OS" != "linux" && "$OS" != "darwin" && "$OS" != "freebsd" ]]; then
  echo "Unsupported operating system: $OS" >&2
  exit 1
fi

ASSET="cli_${VERSION}_${OS}_${ARCH}.zip"
URL="https://github.com/render-oss/cli/releases/download/v${VERSION}/${ASSET}"
TMP_DIR="$(mktemp -d)"
ARCHIVE_PATH="$TMP_DIR/render-cli.zip"
BINARY_PATH="$TMP_DIR/cli_v${VERSION}"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

mkdir -p "$INSTALL_DIR"

echo "Downloading Render CLI v${VERSION} for ${OS}/${ARCH}..."
curl -fsSL "$URL" -o "$ARCHIVE_PATH"
unzip -q "$ARCHIVE_PATH" -d "$TMP_DIR"

if [[ ! -f "$BINARY_PATH" ]]; then
  echo "Expected binary not found in archive: $BINARY_PATH" >&2
  exit 1
fi

install -m 0755 "$BINARY_PATH" "$INSTALL_DIR/render"

echo "Installed Render CLI to $INSTALL_DIR/render"
"$INSTALL_DIR/render" --version

case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *)
    echo "Note: $INSTALL_DIR is not currently on PATH." >&2
    ;;
esac
