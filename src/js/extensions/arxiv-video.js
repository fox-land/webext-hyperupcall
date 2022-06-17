'use strict'

function runIfEnabled(key, fn) {
	chrome.storage.local.get((/** @type {string} */ obj) => {
		const shouldEnable = obj[key]
		if (shouldEnable) fn()
	})
}

runIfEnabled('enable-arxiv-videos', async () => {
	const res = await fetch(
		chrome.runtime.getURL('/data/arxiv-papers-to-video.json'),
	)
	const paperMapping = await res.json()
	addVideoIcon(paperMapping)

	function addVideoIcon(/** @type {Record<string, unknown> */ mapping) {
		// arxiv.org/abs/2004.1017v1 -> 2004.1017v1
		const rawArxivID = window.location.pathname.split('/').at(-1)

		// Remove versioning info from URL if present
		// Example: 2004.1017v1 -> 2004.1017
		const arxivID = rawArxivID.split('v').at(0)

		if (arxivID in mapping) {
			const videoLink = mapping[arxivID]
			const videoButton = `<a style="padding-left: 3px; color:black; text-decoration: none;" target="_blank" rel="noopener noreferrer" href="${videoLink}">📹</a>`
			const paperTitle = document.querySelector('h1.title')
			paperTitle.innerHTML = paperTitle.innerHTML + videoButton
		}
	}
})
