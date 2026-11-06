#!/bin/zsh
cd "${0:A:h}"
if [ -d release/macos/墨记.app ]; then
  open release/macos/墨记.app
else
  ./script/build_and_run.sh
fi
