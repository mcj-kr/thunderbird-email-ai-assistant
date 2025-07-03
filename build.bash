#!/bin/bash
./node_modules/.bin/web-ext build --overwrite-dest --ignore-files "tmp/" "package.json" "package-lock.json"
