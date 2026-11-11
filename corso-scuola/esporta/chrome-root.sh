#!/bin/sh
# starlight-to-pdf lancia Chrome senza --no-sandbox, che da root non parte: lo aggiunge questo involucro.
# Usato solo da esporta.sh, su pagine del corso servite in locale.
exec google-chrome --no-sandbox "$@"
