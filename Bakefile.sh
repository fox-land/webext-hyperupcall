# shellcheck shell=bash

task.build() {
	yarn run parcel build ./src/manifest.json
}
