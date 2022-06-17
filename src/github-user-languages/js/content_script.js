//
//
//
//
//
//
//
//
//
//
//
//ffff
//FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF
// import { GHULError } from './errors'
class GHULError extends Error {
	constructor(/** @type {string} */ message) {
		super(message)
		this.name = 'GHULError'
	}
}
// This script is excuted directly from inside the page
// import { ArcElement, Chart, Legend, LineElement, PieController, Tooltip } from 'chart.js'

//// dddddddddddd
// import { Data } from './data'
//////////////////////////////////////////////////////////////////////////////////////////ddddddddddddddddddddd
// Class for handling the fetch of repo and color data, be it from cache or the API
// Allows the content script to be agnostic as to where the data is coming from as this class will use promises
// import { GHULError } from './errors'

const CACHE_THRESHOLD = 36e5 // 1 hour
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
		const url = chrome.runtime.getURL('colors.json')
		return (await fetch(url)).json()
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

///////ddddddddddddddddddd
// Register the parts of Chart.js I need
Chart.Chart.register(
	Chart.PieController,
	Chart.Tooltip,
	Chart.Legend,
	Chart.ArcElement,
	LineElement,
)
// Set an XPath syntax to find User and Organisation containers for storing the graph
const ORG_XPATH = '//*[text() = "Top languages"]'
const USER_CONTAINER_SELECTOR = 'div[itemtype="http://schema.org/Person"]'
class LanguageDisplay {
	constructor(username) {
		this.username = username
		this.parent = document.querySelector(USER_CONTAINER_SELECTOR)
		// Maintain a flag to find out of the page is an organisation one or not
		let isOrg = false
		// Handling for orgs
		if (this.parent === null) {
			// Org page, use the XPATH to find the correct node and set flag
			isOrg = true
			const orgLanguagesHeader = document.evaluate(
				ORG_XPATH,
				document,
				null,
				XPathResult.FIRST_ORDERED_NODE_TYPE,
				null,
			).singleNodeValue
			this.parent = orgLanguagesHeader.parentElement.parentElement.parentElement
		}
		this.canvas = null
		this.container = null
		// Get the personal access token from sync storage and fetch data
		chrome.storage.sync.get(
			['personalAccessToken', 'personalAccessTokenOwner'],
			(result) => {
				const token = result.personalAccessToken || ''
				const tokenOwner = result.personalAccessTokenOwner || null
				const tokenData = {
					token,
					username: tokenOwner,
				}
				// Fetch the lang data now
				this.data = new Data(username, isOrg, tokenData)
				this.getData()
			},
		)
	}
	async getData() {
		// Fetch the color data from the json file
		// Use the promise provided by the Data class to get all necessary data
		try {
			const values = await this.data.getData()
			// 0 -> color data, 1 -> repo data
			const colorData = values[0]
			const repoData = values[1]
			// If the repoData is empty, don't go any further
			if (this.data.emptyAccount) {
				return
			}
			// Cache the repoData we just got, if we need to
			if (!this.data.repoDataFromCache) {
				this.cacheData(repoData)
			}
			// Build the graph
			this.build(colorData, repoData)
		} catch (e) {
			console.error(`gh-user-langs: Error creating graph: ${e}`)
			// This is where we need to add the error display
			// Create the container, add it to the page and then add an error message to it
			this.container = this.createContainer()
			// If the error is an api error, just get the message out of it, otherwise insert generic message
			let message =
				'An error occurred when fetching data from the GitHub API. This could be due to rate-limiting.' +
				' Please try again later or add a personal access token for increase API usage, or see console for more info.'
			if (e instanceof GHULError) {
				message = e.message
			}
			this.parent.appendChild(document.createTextNode(message))
		}
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
// Get the profile name for the current page, if the current page is an account page
// The profile name will get retrieved from location.pathname
let profileName = null
let path = window.location.pathname.substr(1)
// Trim the trailing slash if there is one
if (path[path.length - 1] === '/') {
	path = path.slice(0, -1)
}
// The page is correct if the length of path.split is 1 and the first item isn't the empty string
const splitPath = path.split('/')
if (splitPath.length === 1 && splitPath[0].length !== 0) {
	profileName = splitPath[0]
}
// If profileName is not null, draw the chart
if (profileName !== null) {
	const graph = new LanguageDisplay(profileName)
}
