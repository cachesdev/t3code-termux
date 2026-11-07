#!/data/data/com.termux/files/usr/bin/bash
# Installs native dependencies into a staged t3code-termux package and packs it.
# Runs inside Termux on arm64, so npm picks the android-arm64 binaries.
#
#   bash finalize.sh <staged-dir> <output-dir>

set -euo pipefail

stage="$(realpath "$1")"
out="$(realpath "$2")"
cd "$stage"

npm install --omit=dev --no-audit --no-fund

for patch_file in patches/*.patch; do
  [[ -e "$patch_file" ]] || continue
  package="$(basename "$patch_file" .patch)"
  package="${package//__//}"
  echo "Patching $package"
  patch --quiet --forward -p1 -d "node_modules/$package" < "$patch_file"
done

# The prebuilt ffi-rs addon imports __clear_cache, which Android's libc does not export.
# Build a library that exports only that function from clang's runtime, and link the addon to it.
ffi_dir=node_modules/@yuuang/ffi-rs-android-arm64
ffi="$(echo "$ffi_dir"/*.node)"
clear_cache="$ffi_dir/libclear_cache.so"
echo '{ global: __clear_cache; local: *; };' > "$TMPDIR/clear_cache.map"
clang -shared -o "$clear_cache" \
  -Wl,--undefined=__clear_cache -Wl,--version-script="$TMPDIR/clear_cache.map" \
  "$(clang -print-libgcc-file-name)"
patchelf --add-needed libclear_cache.so --set-rpath '$ORIGIN' "$ffi"

pty=node_modules/node-pty
if [[ ! -f "$pty/build/Release/pty.node" ]]; then
  echo "node-pty did not compile" >&2
  exit 1
fi

# npm packs node-pty with its own file list, which has prebuilds/ but not build/.
# The loader checks prebuilds/<platform>-<arch> too.
prebuild="$pty/prebuilds/$(node -p 'process.platform + "-" + process.arch')"
mkdir -p "$prebuild"
mv "$pty/build/Release/pty.node" "$prebuild/"
# Remove everything npm could use to rebuild it.
rm -r "$pty/build" "$pty/binding.gyp"

# Ship node_modules inside the package, so installs need no compiler.
# npm packs bundled packages with their own file lists, so add the new library to ffi-rs's list.
node -e '
  const fs = require("node:fs");
  const edit = (file, change) => {
    const json = JSON.parse(fs.readFileSync(file, "utf8"));
    change(json);
    fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
  };
  edit(process.argv[1], (pty) => {
    delete pty.scripts;
    pty.gypfile = false;
  });
  edit(process.argv[2], (ffi) => {
    ffi.files.push("libclear_cache.so");
  });
  edit("package.json", (pkg) => {
    delete pkg.allowScripts;
    pkg.bundleDependencies = Object.keys(pkg.dependencies);
  });
' "$pty/package.json" "$ffi_dir/package.json"

rm -rf patches package-lock.json

npm pack --pack-destination "$out"
