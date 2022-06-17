console.log('popup.js')
const browser = chrome

const port = browser.runtime.connectNative('ping_pong')

port.onMessage.addListener((response) => {
	console.log('Received: ' + response)
})

browser.browserAction.onClicked.addListener(() => {
	console.log('Sending:  ping')
	port.postMessage('ping')
})

document.addEventListener('DOMContentLoaded', () => {
	document.getElementById('changeColor').addEventListener('click', () => {
		console.log('Sendingq:  pingq')
		port.postMessage('pingq')
	})
})

// chrome.storage.sync.get('color', ({ color }) => {
// 	let changeColor = document.getElementById('changeColor')
// 	changeColor.style.backgroundColor = color
// })
