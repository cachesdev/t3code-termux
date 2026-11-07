#!/usr/bin/env bash
# Runs finalize.sh and smoke.sh in a Termux Docker container.
#
#   bash packaging/termux/package.sh <staged-dir> <output-dir> [image]
#
# The default image is the arm64 one, which needs an arm64 host.

set -euo pipefail

stage="$(realpath "$1")"
mkdir -p "$2"
out="$(realpath "$2")"
image="${3:-termux/termux-docker:aarch64}"
scripts="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

home=/data/data/com.termux/files/home
# Deny hard links with EACCES, as Android's SELinux policy does in app storage.
container="$(docker run --detach --security-opt seccomp="$scripts/android-seccomp.json" "$image" sleep infinity)"
trap 'docker rm --force "$container" > /dev/null' EXIT

docker cp "$stage" "$container:$home/stage"
docker cp "$scripts/finalize.sh" "$container:$home/finalize.sh"
docker cp "$scripts/smoke.sh" "$container:$home/smoke.sh"
docker exec "$container" chown -R 1000:1000 "$home"

termux() {
  docker exec --user 1000:1000 "$container" /data/data/com.termux/files/usr/bin/login -c "$1"
}

termux 'yes | pkg upgrade -y > /dev/null && pkg install -y nodejs python make clang patch patchelf > /dev/null'
termux 'mkdir -p ~/out && bash ~/finalize.sh ~/stage ~/out'
termux 'bash ~/smoke.sh ~/out/t3code-termux-*.tgz'

docker cp "$container:$home/out/." "$out"
ls -l "$out"
