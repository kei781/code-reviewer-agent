#!/bin/sh
set -eu

NODE_VERSION="${NODE_VERSION:-24.14.0}"
SCRIPT_DIR=$(CDPATH= cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd "$SCRIPT_DIR/.." && pwd)
TOOLS_DIR="$REPO_ROOT/.tools/node"

log() {
  printf '[setup] %s\n' "$*" >&2
}

fail() {
  printf '[setup] ERROR: %s\n' "$*" >&2
  exit 1
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

node_major_version() {
  "$1" -p 'Number.parseInt(process.versions.node.split(".")[0], 10)'
}

detect_platform() {
  case "$(uname -s)" in
    Darwin) printf 'darwin' ;;
    Linux) printf 'linux' ;;
    *) fail "Unsupported OS: $(uname -s). Install Node.js >=24 manually, then run npm run setup." ;;
  esac
}

detect_arch() {
  case "$(uname -m)" in
    x86_64 | amd64) printf 'x64' ;;
    arm64 | aarch64) printf 'arm64' ;;
    *) fail "Unsupported CPU architecture: $(uname -m). Install Node.js >=24 manually, then run npm run setup." ;;
  esac
}

download_file() {
  url="$1"
  output="$2"

  if command_exists curl; then
    curl -fsSL "$url" -o "$output"
    return
  fi

  if command_exists wget; then
    wget -q "$url" -O "$output"
    return
  fi

  fail "curl or wget is required to download Node.js."
}

verify_checksum() {
  checksums_file="$1"
  archive_name="$2"

  if command_exists sha256sum; then
    grep " $archive_name\$" "$checksums_file" | (cd "$(dirname "$checksums_file")" && sha256sum -c -)
    return
  fi

  if command_exists shasum; then
    grep " $archive_name\$" "$checksums_file" | (cd "$(dirname "$checksums_file")" && shasum -a 256 -c -)
    return
  fi

  log "No SHA-256 checker found; skipping archive checksum verification"
}

ensure_local_node() {
  platform=$(detect_platform)
  arch=$(detect_arch)
  package="node-v$NODE_VERSION-$platform-$arch"
  node_home="$TOOLS_DIR/$package"
  node_bin="$node_home/bin/node"

  if [ -x "$node_bin" ]; then
    printf '%s\n' "$node_home"
    return
  fi

  archive_name="$package.tar.gz"
  download_dir="$TOOLS_DIR/downloads"
  archive_path="$download_dir/$archive_name"
  checksums_path="$download_dir/SHASUMS256.txt"
  base_url="https://nodejs.org/dist/v$NODE_VERSION"

  mkdir -p "$download_dir"
  log "Downloading Node.js $NODE_VERSION for $platform-$arch"
  download_file "$base_url/$archive_name" "$archive_path"
  download_file "$base_url/SHASUMS256.txt" "$checksums_path"
  verify_checksum "$checksums_path" "$archive_name"

  mkdir -p "$TOOLS_DIR"
  tar -xzf "$archive_path" -C "$TOOLS_DIR"

  [ -x "$node_bin" ] || fail "Downloaded Node.js binary was not found at $node_bin"
  printf '%s\n' "$node_home"
}

select_node_home() {
  if command_exists node; then
    existing_node=$(command -v node)
    major=$(node_major_version "$existing_node")

    if [ "$major" -ge 24 ]; then
      dirname "$(dirname "$existing_node")"
      return
    fi

    log "Existing Node.js is v$(node -p 'process.versions.node'); installing local Node.js $NODE_VERSION"
  fi

  ensure_local_node
}

NODE_HOME=$(select_node_home)
PATH="$NODE_HOME/bin:$PATH"
export PATH

log "Using Node.js $("$NODE_HOME/bin/node" -p 'process.versions.node')"
"$NODE_HOME/bin/node" "$REPO_ROOT/scripts/setup.mjs"
