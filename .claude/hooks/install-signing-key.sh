#!/bin/bash
# Кладёт SSH-ключ подписи коммитов из GIT_SIGNING_KEY_B64 туда, куда смотрит
# user.signingkey. Никогда не печатает ключ и никогда не валит хук.
set -u

log() { echo "signing key: $*" >&2; }

[ -n "${GIT_SIGNING_KEY_B64:-}" ] || exit 0

key_path=$(git config --get user.signingkey 2>/dev/null || true)
key_path=${key_path:-/etc/rpr/rpr-agent-sign}
case "$key_path" in
  /*) ;;
  *) log "user.signingkey is not a file path, skipped"; exit 0 ;;
esac

[ -e "$key_path" ] && exit 0

if ! command -v ssh-keygen >/dev/null 2>&1; then
  log "ssh-keygen not found, skipped"
  exit 0
fi

umask 077
if ! mkdir -p "$(dirname "$key_path")" 2>/dev/null; then
  log "cannot create $(dirname "$key_path"), skipped"
  exit 0
fi

tmp="$key_path.tmp.$$"
trap 'rm -f "$tmp"' EXIT

# Секрет в UI окружения мог вставиться с переносами строк.
if ! printf '%s' "$GIT_SIGNING_KEY_B64" | tr -d ' \t\r\n' | base64 -d >"$tmp" 2>/dev/null; then
  log "GIT_SIGNING_KEY_B64 is not valid base64, skipped"
  exit 0
fi
chmod 600 "$tmp"

# -P '' не даёт ssh-keygen ждать пароль, если ключ зашифрован.
if ! ssh-keygen -y -P '' -f "$tmp" >/dev/null 2>&1; then
  log "decoded value is not a usable private key, skipped"
  exit 0
fi

if mv "$tmp" "$key_path"; then
  log "installed at $key_path"
else
  log "cannot write $key_path, skipped"
fi
exit 0
