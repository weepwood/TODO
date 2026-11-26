#!/bin/bash
# Explicit user-level install; never replace an existing executable or shell config.
set -euo pipefail
if [[ $# != 1 || ! -f "$1" || ! -x "$1" ]]; then echo 'Usage: install-local-cli.sh /path/to/verified-todo-native-binary' >&2; exit 2; fi
if command -v todo >/dev/null 2>&1 || [[ -e "$HOME/.local/bin/todo" || -L "$HOME/.local/bin/todo" ]]; then echo 'todo already exists; not overwritten' >&2; exit 2; fi
bin="$1"
help="$("$bin" --cli --help)"
[[ "$help" == 'TODO local CLI'* ]] || { echo 'not a compatible TODO CLI binary' >&2; exit 2; }
digest="$(shasum -a 256 "$bin" | awk '{print $1}')"
lib="$HOME/.local/libexec/todo-cli/$digest"
mkdir -p "$HOME/.local/bin" "$lib"
if [[ ! -e "$lib/todo" ]]; then (set -o noclobber; cat "$bin" > "$lib/todo"); chmod 700 "$lib/todo"; fi
[[ "$(shasum -a 256 "$lib/todo" | awk '{print $1}')" == "$digest" ]]
(set -o noclobber; printf '#!/bin/bash\nexec "$HOME/.local/libexec/todo-cli/%s/todo" --cli "$@"\n' "$digest" > "$HOME/.local/bin/todo")
chmod 700 "$HOME/.local/bin/todo"
echo "Installed $HOME/.local/bin/todo"
