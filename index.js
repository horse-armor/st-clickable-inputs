import { Generate, extension_prompt_types, sendMessageAsUser, setExtensionPrompt } from "../../../../script.js";

const INPUT_SCRIPT_INSTRUCTIONS = `<instructions>
**INPUTS**: Always use the \`<button>\` tag for buttons. Keep related inputs in the same div. Use \`<label>\` for text that's related to the input. Always use the \`for\` attribute on labels to specify which input the label is for. Example:
\`\`\`
<input type="radio" name="l" id="radio1">
<label for="radio1">Lorem ipsum</label>
\`\`\`
If there is supposed to be a button to apply changes, add the \`data-submit\` class to it. Example:
\`\`\`
<input type="checkbox">Some setting</input>
<button class="data-submit">Press me to submit changes.</button>
\`\`\`
</instructions>`;

const ELEMENT_CLICKABLE_ATTRIBUTE = "data-made-clickable";
const ELEMENT_LLM_SUBMIT_CLASS = "custom-data-submit"; // "custom-" prefix is added by ST sanitisation

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
    let modifier = "";
    if (input.getAttribute("type") === "range")
        modifier = "/" + (input.getAttribute("max") || "100");

    let value = input.value;
    if (input.tagName === "SELECT")
        // @ts-ignore
        value = input.options[input.selectedIndex].text;

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
        jQuery(child).find('*').each((i, obj) => {
            if (obj.tagName === "INPUT" || obj.tagName === "SELECT" || obj.tagName == "TEXTAREA")
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
    const element = event.target;

    console.log("clicked on", element.innerText);

    let output = element.classList.contains(ELEMENT_LLM_SUBMIT_CLASS) 
        ? extractDataInputs(getDivJustBeforeMesText(element))
        : ""; // Only add other fields if it's a submit action
    output += element.innerText;

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
        .filter(b => b.classList.contains(ELEMENT_LLM_SUBMIT_CLASS))
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

function processMessageDiv(i, obj) {
    jQuery(obj).find('button, input, select, textarea').each((i, obj) => {
        if (!obj.getAttribute(ELEMENT_CLICKABLE_ATTRIBUTE)) makeClickable(obj);
    });
}

function processMessageTextBlock(i, obj) {
    jQuery(obj).find('div').each(processMessageDiv);
}

function updateInputs() {
    jQuery(".mes_text").each(processMessageTextBlock);
    setExtensionPrompt("CLICKABLE_GENEREATED_INPUTS", INPUT_SCRIPT_INSTRUCTIONS, extension_prompt_types.IN_CHAT, 0);
}

jQuery(() => {
    // TODO use events (currently unstable for some reason)
    setInterval(updateInputs, 1000);
    updateInputs();
});