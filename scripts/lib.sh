#!/usr/bin/env bash
# Funciones compartidas por los scripts de instalación. No se ejecuta solo.

titulo() { printf '\n\033[1m%s\033[0m\n' "$*"; }
aviso() { printf '\033[33m%s\033[0m\n' "$*"; }
falla() { printf '\033[31m%s\033[0m\n' "$*" >&2; exit 1; }
azar() { openssl rand -hex "${1:-24}"; }

# Lee un valor de .env (sin las comillas)
leer_env() {
  grep -E "^$1=" .env 2>/dev/null | head -n1 | cut -d= -f2- | sed -e "s/^'//" -e "s/'\$//"
}

# Escribe o cambia un valor en .env. Va entre comillas simples para que los $ no se interpreten.
poner_env() {
  local k="$1" v="$2" tmp
  case "$v" in *"'"*|*$'\n'*) falla "El valor de $k no puede llevar comillas simples ni saltos de línea." ;; esac
  tmp="$(mktemp)"
  grep -v -E "^$k=" .env > "$tmp" || true
  printf "%s='%s'\n" "$k" "$v" >> "$tmp"
  cat "$tmp" > .env
  rm -f "$tmp"
  chmod 600 .env
}

# Pregunta algo. Si la variable ya viene definida en el entorno, no pregunta.
preguntar() { # nombre_variable "texto" [secreto]
  local var="$1" texto="$2" secreto="${3:-}" valor="${!1:-}"
  if [ -z "$valor" ]; then
    if [ "${NO_PROMPT:-}" = 1 ]; then falla "Falta $var."; fi
    if [ -n "$secreto" ]; then read -r -s -p "$texto: " valor; echo; else read -r -p "$texto: " valor; fi
  fi
  printf -v "$var" '%s' "$valor"
}
