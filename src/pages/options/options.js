'use strict'

// TOO: resolve
chrome.management.getAll((/** @type {ExtensionInfo[]} */ result) => {
	const el = document.getElementById('extension-list')

	for (const info of result) {
		const node = document.createElement('li')
		node.innerText = JSON.stringify(info)
		el.appendChild(node)
	}
})

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
	})
}

makeOptionPersist('arxiv-videos', 'enable-arxiv-videos')
makeOptionPersist('arxiv-vanity', 'enable-arxiv-vanity')

function saveOptions(e) {
	if (e.submitter.id === 'revert') {
		chrome.storage.sync.remove('filename_format')
	} else {
		chrome.storage.sync.set({
			filename_format: document.querySelector('#new-filename-format').value,
		})
	}
	e.preventDefault()
	restoreOptions()
}

function restoreOptions() {
	chrome.storage.sync.get(
		{
			filename_format: '${title}, ${firstAuthor} et al., ${publishedYear}.pdf',
		},
		function (res) {
			var filename_format = res.filename_format
			document.querySelector('#filename-format').innerText = filename_format
			document.querySelector('#new-filename-format').value = filename_format
		},
	)
}

document.addEventListener('DOMContentLoaded', restoreOptions)
document.querySelector('form').addEventListener('submit', saveOptions)

function debug(/** @type {string} */ msg) {
	console.log(`DEBUG: ${msg}`)
}

// github-user-languages
;(() => {
	async function getUsernameFromToken(token) {
		if (!token) {
			return null
		}

		let username = null
		try {
			const res = await fetch('https://api.github.com/user', {
				headers: { Authorization: `token ${token}` },
			})
			if (res.ok) {
				const data = await res.json()
				username = data.login
			}
		} catch (err) {
			// TODO
		}

		debug(`getUsernameFromToken: ${username}`)
		return username
	}

	chrome.storage.sync.get(
		['showLegend', 'personalAccessToken', 'personalAccessTokenOwner'],
		(result) => {
			// Show Legend
			const chartLegendCheckEl = document.getElementById('show-legend')
			const showLegend = result.showLegend || false
			chartLegendCheckEl.checked = showLegend
			chartLegendCheckEl.addEventListener(
				'click',
				() => {
					chrome.storage.sync.set({ showLegend: chartLegendCheckEl.checked })
				},
				false,
			)
			chartLegendCheckEl.disabled = false

			// GitHub Token
			const personalTokenInputEl = document.getElementById(
				'personal-access-token',
			)
			const personalAccessToken = result.personalAccessToken || ''
			personalTokenInputEl.value = personalAccessToken
			personalTokenInputEl.addEventListener(
				'change',
				async () => {
					const storedData = {
						personalAccessToken: personalTokenInputEl.value,
						personalAccessTokenOwner: await getUsernameFromToken(token),
					}
					debug('setting data', storedData)
					chrome.storage.sync.set(storedData)
				},
				false,
			)
			personalTokenInputEl.disabled = false
		},
	)
})()
