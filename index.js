import { Generate, extension_prompt_types, sendMessageAsUser, setExtensionPrompt, saveSettingsDebounced } from "../../../../script.js";
import { renderExtensionTemplateAsync, extension_settings } from '../../../extensions.js';

const DEFAULT_INSTRUCTIONS = `<instructions>
**INPUTS**: Always use the \`<button>\` tag for buttons. Keep related inputs in the same div. Use \`<label>\` for text that's related to the input. Always use the \`for\` attribute on labels to specify which input the label is for. Example:
\`\`\`
<input type="radio" name="l" id="radio1">
<label for="radio1">Lorem ipsum</label>
\`\`\`
If there is supposed to be a button to apply changes, add the \`data-submit\` attribute to it. Example:
\`\`\`
<input type="checkbox">Some setting</input>
<button data-submit>Press me to submit changes.</button>
\`\`\`
You may override the text displayed on the button with the text in the \`data-title\` attribute. Example:
\`\`\`
<button data-title="User sees this text">This text will be sent.</button>
\`\`\`
</instructions>`;

const ELEMENT_CLICKABLE_ATTRIBUTE = "data-made-clickable";
const ELEMENT_LLM_SUBMIT_ATTRIBUTE = "data-submit";

function findLabelForInput(input, parentDiv) {
    if (!input.id) return "";
    return jQuery(parentDiv).find(`label[for="${input.id}"]`).text() || "";
}

/**
 * 
 * @param {HTMLElement} element 
 */
function getDivJustBeforeMesText(element) {
    let previous = element;
    while (!element.classList.contains("mes_text")) {
        previous = element;
        element = element.parentElement;
    }
    return previous;
}

/**
 * 
 * @param {HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement} input 
 * @returns 
 */
function inputToString(input) {
    if (["radio"].includes(input.getAttribute("type")) && !input.checked) return "";

    let modifier = "";
    if (input.getAttribute("type") === "range")
        modifier = "/" + (input.getAttribute("max") || "100");

    let value = input.value;
    if (input.tagName === "SELECT")
        // @ts-ignore
        value = input.options[input.selectedIndex].text;
    if (input.getAttribute("type") === "checkbox")
        value = input.checked ? "on" : "off";

    const labelForInput = findLabelForInput(input, getDivJustBeforeMesText(input));
    if (!labelForInput) return "";

    return `${labelForInput}${labelForInput.endsWith(":") ? "" : ":"} ${value}${modifier}\n`;
}

/**
 * 
 * @param {HTMLElement} parent 
 */
function extractDataInputs(parent) {
    let output = "";
 
    for (const child of parent.children) {
        jQuery(child).find('input, select, textarea').each((i, obj) => {
            output += inputToString(obj);
        });
    }

    return output;
}

/**
 * 
 * @param {Element} parent 
 */
function getChildrenOfTagName(parent, tagName, recursive = false) {
    let elems = [];

    for (const child of parent.children) {
        if (child.tagName === tagName)
            elems.push(child);
        if (recursive)
            elems = elems.concat(getChildrenOfTagName(child, tagName, recursive));
    }

    return elems;
}

/**
 * 
 * @param {HTMLElement} element 
 */
function getParentDivThatHasThisDiv(element) {
    let parent = element;
    while (!getChildrenOfTagName(parent, "DIV").length && !parent.classList.contains("mes_text")) {
        parent = parent.parentElement;
    }
    return parent;
}

/**
 * 
 * @param {PointerEvent} event 
 */
async function clickEvent(event) {
    /**
     * @type {HTMLElement}
     */
    // @ts-ignore
	// Could use event.currentTarget here
    const element = event.target.closest("button") || event.target;

    console.log("clicked on", element.textContent);

    let output = element.hasAttribute(ELEMENT_LLM_SUBMIT_ATTRIBUTE)
        ? extractDataInputs(getDivJustBeforeMesText(element))
        : ""; // Only add other fields if it's a submit action
    output += element.textContent;

    await sendMessageAsUser(output, "");
    await Generate("normal");

    event.preventDefault();
}

/**
 * 
 * @param {Event} event 
 */
async function inputChangeEvent(event) {
    /**
     * @type {HTMLElement}
     */
    // @ts-ignore
    const element = event.target;

    // @ts-ignore
    let output = inputToString(element);

    const logicalParent = getDivJustBeforeMesText(element);
    if (getChildrenOfTagName(logicalParent, 'BUTTON', true)
        .filter(b => b.hasAttribute(ELEMENT_LLM_SUBMIT_ATTRIBUTE))
        .length)
        return; // Have submit button, nothing to do

    console.log(output);

    event.preventDefault();
}

/**
 * @param {HTMLElement} obj 
 */
function makeClickable(obj) {
    if (obj instanceof HTMLButtonElement) obj.addEventListener("click", clickEvent);
    else if (obj instanceof HTMLInputElement && obj.getAttribute("type") !== "text" || obj instanceof HTMLSelectElement) obj.addEventListener("change", inputChangeEvent);
    else if (obj instanceof HTMLTextAreaElement || obj instanceof HTMLInputElement && obj.getAttribute("type") === "text") obj.addEventListener("keypress", (e) => {
        if (e.code === "Enter") inputChangeEvent(e);
    });

    obj.setAttribute(ELEMENT_CLICKABLE_ATTRIBUTE, "true");
}

function processMessageTextBlock(i, obj) {
    jQuery(obj).find('button, input, select, textarea').each((i, obj) => {
        if (!obj.getAttribute(ELEMENT_CLICKABLE_ATTRIBUTE)) makeClickable(obj);
    });
}

function updateInputs() {
    if (!isEnabled()) return;

	jQuery("#chat .mes_text:not(:has(.edit_textarea))").each(processMessageTextBlock);
    
	if(shouldAppendPrompt()) {
        setExtensionPrompt("CLICKABLE_GENERATED_INPUTS", prompt(), extension_prompt_types.IN_PROMPT, 1);
	} else {
		// Other extensions do it this way
        setExtensionPrompt("CLICKABLE_GENERATED_INPUTS", "");
	}
}

async function initSettings() {
	// Stupid, yeah
	let _isEnabled = isEnabled();
	let _shouldAppendPrompt = shouldAppendPrompt();
	let _prompt = prompt();

	if(!("clickableInputs" in extension_settings)) {
		// Initialise
		extension_settings.clickableInputs = {
			enabled: _isEnabled,
			appendPrompt: _shouldAppendPrompt,
			prompt: _prompt,
		};
	}

	// Render settings collapsible
	const html = await renderExtensionTemplateAsync("third-party/st-clickable-inputs", "settings");
	jQuery(document.getElementById("extensions_settings")).append(html)

	// Sync settings
	jQuery("#clickable_inputs_enabled").prop("checked", _isEnabled);
	jQuery("#clickable_inputs_prompt_enabled").prop("checked", _shouldAppendPrompt);
	jQuery("#clickable_inputs_prompt").val(_prompt);

	// Disable elements if necessary
	jQuery("#clickable_inputs_prompt_enabled").prop("disabled", !_isEnabled);
	jQuery("#clickable_inputs_prompt").prop("disabled", !_isEnabled || !_shouldAppendPrompt);

	// Add event listeners
	jQuery("#clickable_inputs_enabled").on("change", () => {
		const checked = jQuery("#clickable_inputs_enabled").is(":checked");

		extension_settings.clickableInputs.enabled = checked;
		jQuery("#clickable_inputs_prompt_enabled").prop("disabled", !checked);
		jQuery("#clickable_inputs_prompt").prop("disabled", !checked);

		updateInputs();
		saveSettingsDebounced();
	});

	jQuery("#clickable_inputs_prompt_enabled").on("change", () => {
		extension_settings.clickableInputs.appendPrompt = jQuery("#clickable_inputs_prompt_enabled").is(":checked");

		updateInputs();
		saveSettingsDebounced();
	});

	jQuery("#clickable_inputs_prompt").on("input", () => {
		extension_settings.clickableInputs.prompt = jQuery("#clickable_inputs_prompt").val();

		updateInputs();
		saveSettingsDebounced();
	});

	jQuery("#clickable_inputs_prompt_restore").on("click", () => {
		extension_settings.clickableInputs.prompt = DEFAULT_INSTRUCTIONS;
		jQuery("#clickable_inputs_prompt").val(DEFAULT_INSTRUCTIONS);

		updateInputs();
		saveSettingsDebounced();
	});
}

// Getters
function isEnabled() {
	return extension_settings.clickableInputs?.enabled ?? true;
}

function shouldAppendPrompt() {
	return extension_settings.clickableInputs?.appendPrompt ?? true;
}

function prompt() {
	return extension_settings.clickableInputs?.prompt ?? DEFAULT_INSTRUCTIONS;
}

// Main
jQuery(() => {
    // TODO use events (currently unstable for some reason)
	initSettings()

    setInterval(updateInputs, 1000);
    updateInputs();
});
