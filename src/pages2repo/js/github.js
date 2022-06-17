function queryRepo(username, repository, tabId) {
	chrome.storage.sync.get('token', function (token) {
		// No token, retrieve
		if (!token.hasOwnProperty('token')) {
			chrome.tabs.create({
				url: 'pages2repo/pages/token.html',
			})
		} else {
			// Already have token, carry on
			var request = new XMLHttpRequest()
			request.open(
				'GET',
				'https://api.github.com/repos/' +
					username +
					'/' +
					repository +
					'?access_token=' +
					token.token,
				true,
			)

			request.onload = function () {
				if (this.status >= 200 && this.status < 400) {
					var response = JSON.parse(this.response)
					// console.log('response repo', response);

					//Set the title of the page action
					chrome.pageAction.setTitle({
						tabId: tabId,
						title: response.full_name,
					})

					var full_name = response.full_name
						.toLowerCase()
						.replace(/(\.|\/)/g, '_')

					var storageObj = {
						full_name: response.full_name,
						description: response.description,
						stars: response.stargazers_count,
						watchers: response.subscribers_count,
						forks: response.forks,
						issues: response.open_issues,
						image: response.owner.avatar_url,
						ssh: response.ssh_url,
						https: response.clone_url,
						url: response.html_url,
						owner_url: response.owner.html_url,
						time_accessed: Date.now(),
					}

					var repoObj = {}
					repoObj[full_name] = storageObj
					// console.log('repoObj', repoObj);

					//Save object and enable the page action button
					chrome.storage.local.set(repoObj, function () {
						chrome.pageAction.show(tabId)
					})
				} else {
					console.log('Error retrieving repo info', this)
				}
			}

			request.onerror = function () {
				console.log('Error retrieving repo info', this)
			}

			request.send()
		}
	})
}
