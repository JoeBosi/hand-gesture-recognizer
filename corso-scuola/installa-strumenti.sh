#!/usr/bin/env bash
# Installa nella cartella del progetto gli strumenti per costruire il corso: MkDocs (in .venv),
# Quarto e mdBook (in strumenti/, versione fissata, con controllo dell'impronta SHA-256). Niente fuori dal progetto.
set -euo pipefail
cd "$(dirname "$0")/.."
QV=1.10.19
[ -x .venv/bin/mkdocs ] || { python3 -m venv .venv && .venv/bin/pip install -q -r corso-scuola/requirements.txt; }
if [ ! -x "strumenti/quarto-$QV/bin/quarto" ]; then
  mkdir -p strumenti
  (cd strumenti
  BASE=https://github.com/quarto-dev/quarto-cli/releases/download/v$QV
  curl -sfL -o "quarto-$QV-linux-amd64.tar.gz" "$BASE/quarto-$QV-linux-amd64.tar.gz"
  # impronta fissata qui (letta l'11/10/2026 dal checksums.txt della release): un file sostituito non passa
  echo "8e38c2b2df6a6dbd369ea16e15acded6894545258d13a02f777f81ad18fd7973  quarto-$QV-linux-amd64.tar.gz" | sha256sum -c -
  tar xzf "quarto-$QV-linux-amd64.tar.gz" && rm "quarto-$QV-linux-amd64.tar.gz")
fi
MV=0.5.4
if [ ! -x "strumenti/mdbook-$MV/mdbook" ]; then
  mkdir -p "strumenti/mdbook-$MV"
  F=mdbook-v$MV-x86_64-unknown-linux-musl.tar.gz
  curl -sfL -o "strumenti/$F" "https://github.com/rust-lang/mdBook/releases/download/v$MV/$F"
  # impronta pubblicata da GitHub per questo file della release (letta l'11/10/2026)
  echo "5222beabd3e37dc5be0d18ff99b79058469354db5c220153a1b92db5ba12be89  strumenti/$F" | sha256sum -c -
  tar xzf "strumenti/$F" -C "strumenti/mdbook-$MV" && rm "strumenti/$F"
fi
echo "ok: mkdocs $(.venv/bin/mkdocs --version | awk '{print $3}'), quarto $QV, mdbook $MV"
