import {getParentPre} from '../../shared/dom-util.js';
import {getTitle} from '../../shared/meta/title-data.js';
import toolbar from '../toolbar/toolbar.js';

const LanguageIcons = {
	bash: "bash.svg",
	sh: "bash.svg",
	shell: "bash.svg",
	powershell: "powershell.svg",
	css: "css.svg",
	html: "html.svg",
	ini: "ini.svg",
	java: "java.svg",
	js: "javascript.svg",
	javascript: "javascript.svg",
	json: "json.svg",
	php: "php.svg",
	py: "python.svg",
	python: "python.svg",
	sql: "sql.svg",
	svg: "svg.svg",
	ts: "typescript.svg",
	typescript: "typescript.svg",
	xml: "xml.svg",
	yaml: "yaml.svg",
	yml: "yaml.svg",
};

/** @type {import('../../types.d.ts').PluginProto<'show-language'>} */
const Self = {
	id: 'show-language',
	require: toolbar,
	effect (Prism) {
		/** @type {import('../toolbar/toolbar.js').Toolbar} */
		const toolbar = Prism.pluginRegistry.peek('toolbar')?.plugin;

		return toolbar.registerButton('show-language', env => {
			const pre = getParentPre(env.element);
			if (!pre) {
				return;
			}

			const title = pre.getAttribute('data-language') || getTitle(env.language);
			if (!title) {
				return;
			}

			const language = env.language;
			let element;

			if (language.includes("+")) {
				let icon = LanguageIcons[language.split("+")[0]];
				env.element.parentNode.classList.add("show-title");
				element = document.createElement("div");
				if (icon) {
					let image = document.createElement("img");
					image.src = `${Prism.prefix()}/icons/${icon}`
					image.alt = language;
					image.className = "prism-title-icon";
					element.appendChild(image);
				}
				let title = document.createElement("span");
				title.textContent = language.split("+")[1];
				title.className = "prism-title-content";
				element.appendChild(title);
				element.classList.add("prism-title");
				return element;
			}

			let icon = LanguageIcons[language];

			if (icon) {
				let iconPath = `${Prism.prefix()}/icons/${icon}`;
				let img = document.createElement("img");
				img.src = iconPath;
				img.alt = language;
				img.className = "prism-icon";

				return img;
			} else {
				element = document.createElement("span");
				element.className = "prism-language";
				element.textContent = language;
			}

			return element;
		});
	},
};

export default Self;
