require('@rushstack/eslint-patch/modern-module-resolution')

/** @type {import('eslint').ESLint.ConfigData} */
module.exports = {
	extends: ['@hyperupcall/eslint-config'],
	env: {
		browser: true,
		node: true,
		webextensions: true,
	},
	rules: {
		'generator-star-spacing': 'off',
		'no-multiple-empty-lines': 'off',
		'no-bitwise': 'off',
		'no-useless-escape': 'off',
		'react/jsx-no-bind': 'off',
		'react/no-unknown-property': ['warn', { ignore: ['class', 'for'] }],
	},
}
