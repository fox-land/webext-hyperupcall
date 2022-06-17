'use strict'

function p(fn) {
	return (...args) => {
		return new Promise((resolve, reject) => {
			fn(...args, (value) => {
				if (value instanceof Error) return reject(value)
				return resolve(value)
			})
		})
	}
}

function makeOptionPersist(
	/** @type {string} */ elementId,
	/** @type {string} */ key,
) {
	// Default to true // TODO: async and wait
	chrome.storage.local.set({ [key]: true })

	document.getElementById(elementId).addEventListener('change', async (ev) => {
		if (ev.target.checked) {
			await p(chrome.storage.local.set.bind(chrome.storage.local))({
				[key]: true,
			})
		} else {
			await p(chrome.storage.local.set.bind(chrome.storage.local))({
				[key]: false,
			})
		}

		chrome.storage.local.get(key, (value) => {
			console.log('ffffffff', value)
		})
	})
}

makeOptionPersist('arxiv-videos', 'enable-arxiv-videos')
