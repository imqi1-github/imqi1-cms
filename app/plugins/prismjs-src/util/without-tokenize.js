/**
 * @param {Grammar} grammar
 * @returns {Grammar}
 */
export function withoutTokenize (grammar) {
	if (!grammar.$tokenize) {
		return grammar;
	}

	const copy = { ...grammar };
	delete copy.$tokenize;
	return copy;
}

/**
 * @typedef {import('../types').Grammar} Grammar
 */
