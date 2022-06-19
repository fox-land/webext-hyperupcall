'use strict'

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

runIfEnabled('enable-arxiv-vanity', async () => {
	const linkText = '[arXiv-vanity] Link'

	const div_dl = document.getElementsByClassName('full-text')[0]
	const c = div_dl.childNodes
	for (let i = 0; i < c.length; i++) {
		if (c[i].nodeName == 'UL') {
			const node = document.createElement('li')
			const link = document.createElement('a')
			const t = document.createTextNode(linkText)

			const match = window.location.href.match(/(\d+\.\d+v?\d)/i)
			if (!match) {
				break
			}
			const arxivID = match[0]

			const av_url = 'https://www.arxiv-vanity.com/papers/' + arxivID + '/'
			link.setAttribute('href', av_url)
			link.appendChild(t)
			node.appendChild(link)
			c[i].insertBefore(node, c[i].childNodes[2])
			break
		}
	}
})
