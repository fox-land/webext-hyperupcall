class GHULError extends Error {
	constructor(/** @type {string} */ message) {
		super(message)
		this.name = 'GHULError'
	}
}

function debug(/** @type {string} */ msg) {
	if (false) console.log(`github-user-languages: ${msg}`)
}

const CACHE_THRESHOLD = 36e5 // 1 hour

// Class for handling the fetch of repo and color data, be it from cache or the API
// Allows the content script to be agnostic as to where the data is coming from as this class will use promises
class Data {
	constructor(username, isOrg, token) {
		this.repoDataFromCache = false
		this.emptyAccount = true
		this.username = username
		this.isOrg = isOrg
		this.personalToken = token
	}

	getData() {
		// Gets both the color data and repo data and returns a Promise that will resolve to get both of them
		// Calling .then on this should get back an array of two values color and repo data respectively
		return Promise.all([this.getColorData(), this.getRepoData()])
	}

	async getColorData() {
		const url = chrome.runtime.getURL('./data/github-user-languages.json')
		const data = (await fetch(url)).json()
		return data
	}

	async getRepoData() {
		try {
			// Check if the user's data is in the cache
			const cachedData = await this.checkCache()
			this.repoDataFromCache = true
			return Promise.resolve(cachedData.data)
		} catch (e) {
			// Data wasn't in cache so get new data
			return this.fetchRepoData()
		}
	}

	checkCache() {
		// Create a promise to retrieve the key from cache, or reject if it's not there
		return new Promise((resolve, reject) => {
			// return reject() // Uncomment this to turn off cache reads when in development
			chrome.storage.local.get([this.username], (result) => {
				// If the data isn't there, result will be an empty object
				if (Object.keys(result).length < 1) {
					// If we get to this point, there was nothing in cache or the cache was invalid
					return reject()
				}
				// We have a cached object, so check time of cache
				const cachedData = result[this.username]
				if (new Date().valueOf() - cachedData.cachedAt < CACHE_THRESHOLD) {
					// We can use the cached version
					// Set emptyAccount flag to false here too
					this.emptyAccount = false
					return resolve(cachedData)
				}
				return reject()
			})
		})
	}
	// Fetches the repo data either from cache or from the API and returns a Promise for the data

	updateRepoData(repoData, json) {
		for (const repo of json) {
			if (repo.language === null) {
				continue
			}
			let count = repoData[repo.language] || 0
			count++
			repoData[repo.language] = count
			this.emptyAccount = false
		}
		return repoData
	}

	// Helper method to get the next url to go to
	getNextUrlFromHeader(header) {
		if (header === null) {
			return null
		}
		const regex = /\<(.*)\>/
		// The header can contain many URLs, separated by commas, each with a rel
		// We want only the one that contains rel="next"
		for (const url of header.split(', ')) {
			if (url.includes('rel="next"')) {
				// We need to retrive the actual URL part using regex
				return regex.exec(url)[1]
			}
		}
		return null
	}
	generateAPIURL() {
		// Generate the correct API URL request given the circumstances of the request
		// Circumstances: Org or User page, and if User page, is it the User using the extension
		const urlBase = 'https://api.github.com'
		const query = 'page=1&per_page=50'
		let url
		if (this.isOrg) {
			url = `${urlBase}/orgs/${this.username}/repos?${query}`
		} else if (this.username === this.personalToken.username) {
			// Send the request to list the user's own repos
			url = `${urlBase}/user/repos?${query}&affiliation=owner`
		} else {
			// Send the request to the normal users endpoint
			url = `${urlBase}/users/${this.username}/repos?${query}`
		}
		return url
	}

	// Fetch repository data from the API
	async fetchRepoData() {
		let url = this.generateAPIURL()
		let linkHeader
		let repoData = {}
		const headers = {}
		if (this.personalToken !== null && this.personalToken.username !== null) {
			headers.Authorization = `token ${this.personalToken.token}`
		}
		const headerRegex = /\<(.*)\> rel="next"/
		// Use Promise.resolve to wait for the result
		let response = await fetch(url, { headers })
		linkHeader = response.headers.get('link')
		// Stumbled across this little error tonight
		if (response.status !== 200) {
			console.error(response)
			throw new GHULError(
				`Incorrect status received from GitHub API. Expected 200, received; ${response.status}. ` +
					'See console for more details.',
			)
		}
		let data = await response.json()
		// From this JSON response, compile repoData (to reduce memory usage) and then see if there's more to fetch
		repoData = this.updateRepoData(repoData, data)
		// Now loop through the link headers, fetching more data and updating the repos dict
		url = this.getNextUrlFromHeader(linkHeader)
		while (url !== null) {
			// Send a request and update the repo data again
			response = await fetch(url, { headers })
			linkHeader = response.headers.get('link')
			data = await response.json()
			repoData = this.updateRepoData(repoData, data)
			url = this.getNextUrlFromHeader(linkHeader)
		}
		// Still gonna return a promise
		return Promise.resolve(repoData)
	}
}

class LanguageDisplay {
	constructor(username) {
		let isOrg = false

		// parent
		let parent = document.querySelector(
			'div[itemtype="http://schema.org/Person"]',
		)
		if (!parent) {
			isOrg = true
			const orgLanguagesHeader = document.evaluate(
				'//*[text() = "Top languages"]',
				document,
				null,
				XPathResult.FIRST_ORDERED_NODE_TYPE,
				null,
			).singleNodeValue
			parent = orgLanguagesHeader.parentElement.parentElement.parentElement
		}
		this.parent = parent

		this.username = username
		this.canvas = null
		this.container = null

		chrome.storage.sync.get(
			['personalAccessToken', 'personalAccessTokenOwner'],
			async (result) => {
				const token = result.personalAccessToken || ''
				const tokenOwner = result.personalAccessTokenOwner || null

				debug(`${token} and ${tokenOwner}`)
				this.data = new Data(username, isOrg, {
					token,
					username: tokenOwner,
				})

				try {
					const values = await this.data.getData()
					const colorData = values[0] // color data
					const repoData = values[1] // repo data
					// If the repoData is empty, don't go any further
					if (this.data.emptyAccount) {
						return
					}
					// Cache the repoData we just got, if we need to
					if (!this.data.repoDataFromCache) {
						this.cacheData(repoData)
					}

					this.build(colorData, repoData)
				} catch (err) {
					debug(`Error: ${err}`)

					let message =
						'Failed to fetch data from the GitHub API. Create a Personal Access Token to fix this'
					if (err instanceof GHULError) {
						message = err.message
					}

					this.container = this.createContainer()
					this.parent.appendChild(document.createTextNode(message))
				}
			},
		)
	}

	cacheData(data) {
		// Store the repo data in the cache for the username
		const cachedAt = new Date().valueOf()
		const value = {
			cachedAt,
			data,
		}
		const cacheData = {}
		cacheData[this.username] = value
		chrome.storage.local.set(cacheData)
	}

	createContainer() {
		const div = document.createElement('div')
		const header = document.createElement('h4')
		const headerText = document.createTextNode('Languages')
		header.appendChild(headerText)
		div.classList.add(
			'border-top',
			'color-border-secondary',
			'pt-3',
			'mt-3',
			'clearfix',
			'hide-sm',
			'hide-md',
		)
		header.classList.add('mb-2', 'h4')
		div.appendChild(header)
		// Append the container to the parent
		this.parent.appendChild(div)
		return div
	}
	createCanvas(width) {
		// Round width down to the nearest 50
		width = Math.floor(width / 50) * 50
		// Create the canvas to put the chart in
		const canvas = document.createElement('canvas')
		// Before creating the Charts.js thing ensure that we set the
		// width and height to be the computed width of the containing div
		canvas.id = 'github-user-languages-language-chart'
		canvas.width = width
		canvas.height = width
		// Save the canvas
		return canvas
	}

	build(colorData, repoData) {
		this.container = this.createContainer()
		// Get the width and height of the container and use it to build the canvas
		const width = +window.getComputedStyle(this.container).width.split('px')[0]
		this.canvas = this.createCanvas(width)
		this.container.appendChild(this.canvas)
		// Get whether or not we should draw the legend from the sync storage and draw the chart
		chrome.storage.sync.get(['showLegend'], (result) => {
			const showLegend = result.showLegend || false
			this.draw(colorData, repoData, showLegend)
		})
	}

	draw(colorData, repoData, showLegend) {
		// Create the pie chart and populate it with the repo data
		const counts = []
		const colors = []
		const langs = []
		for (const prop of Object.keys(repoData).sort()) {
			if (repoData.hasOwnProperty(prop)) {
				// Prop is one of the languages
				langs.push(prop)
				counts.push(repoData[prop])
				colors.push(colorData[prop] || '#ededed')
			}
		}
		// Update the canvas height based on the number of languages
		this.canvas.height += 20 * Math.ceil(langs.length / 2)
		const chart = new Chart(this.canvas, {
			data: {
				datasets: [
					{
						backgroundColor: colors,
						data: counts,
						label: 'Repo Count',
					},
				],
				labels: langs,
			},
			options: {
				plugins: {
					legend: {
						display: showLegend,
					},
				},
			},
			type: 'pie',
		})
		// Add event listeners to get the slice that was clicked on
		// Will redirect to a list of the user's repos of that language
		this.canvas.onclick = (e) => {
			const slice = chart.getElementsAtEventForMode(
				e,
				'nearest',
				{ intersect: true },
				true,
			)[0]
			if (slice === undefined) {
				return
			}
			// Have to encode it in case of C++ and C#
			const language = encodeURIComponent(langs[slice.index].toLowerCase())
			// Redirect to the user's list of that language
			window.location.href = `https://github.com/${this.username}?tab=repositories&language=${language}`
		}
		// Set up a listener for changes to the `showLegend` key of storage
		chrome.storage.onChanged.addListener((changes, namespace) => {
			if ('showLegend' in changes) {
				// Update the chart to set the legend display to the newValue of the storage
				chart.options.plugins.legend.display = changes.showLegend.newValue
				chart.update()
			}
		})
	}
}

Chart.Chart.register(
	Chart.PieController,
	Chart.Tooltip,
	Chart.Legend,
	Chart.ArcElement,
	LineElement,
)

if (/^https:\/\/github.com\/[a-z-]+$/u.test(window.location.href)) {
	const profileName = window.location.pathname.slice(1)
	debug(`profileName: ${profileName}`)
	const graph = new LanguageDisplay(profileName)
}
