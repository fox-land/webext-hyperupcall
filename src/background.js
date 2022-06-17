// import browser from 'webextension-polyfill'
console.log('starting')
var port = chrome.runtime.connectNative('ping_pong')

/*
Listen for messages from the app.
*/
port.onMessage.addListener((response) => {
	console.log('Received: ' + response)
})

/*
On a click on the browser action, send the app a message.
*/
chrome.browserAction.onClicked.addListener(() => {
	console.log('Sending:  ping')
	port.postMessage('ping')
})

let color = '#3aa757'

chrome.runtime.onInstalled.addListener(() => {
	chrome.storage.sync.set({ color })
	console.log('Default background color set to %cgreen', `color: ${color}`)
})
