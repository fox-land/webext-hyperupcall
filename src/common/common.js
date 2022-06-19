'use strict'

function runIfEnabled(key, fn) {
	chrome.storage.local.get((/** @type {string} */ obj) => {
		const shouldEnable = obj[key]
		if (shouldEnable) fn()
	})
}
