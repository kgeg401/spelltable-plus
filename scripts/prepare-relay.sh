#!/bin/sh
# Run in the existing Ubuntu 24.04 WSL distro. Extracts into the supplied folder.
set -eu
target=${1:?Supply the absolute project .recognition/coturn directory}
mkdir -p "$target/lists/partial"
cd "$target"
apt-get -o "Dir::State::lists=$target/lists" -o "Dir::Cache::pkgcache=$target/pkgcache.bin" -o "Dir::Cache::srcpkgcache=$target/srcpkgcache.bin" update
apt-get -o "Dir::State::lists=$target/lists" download coturn libpq5 libmysqlclient21 libhiredis1.1.0 libevent-extra-2.1-7t64 libevent-openssl-2.1-7t64 libevent-pthreads-2.1-7t64
for package in ./*.deb; do dpkg-deb -x "$package" root; done
LD_LIBRARY_PATH="$target/root/usr/lib/x86_64-linux-gnu" ldd root/usr/bin/turnserver
