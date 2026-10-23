export function updateToggleButton(button: HTMLButtonElement, labelSelector: string, enabled: boolean) {
    const label = (enabled ? button.dataset.labelOn : button.dataset.labelOff) || '';
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-label', label);
    button.querySelector(labelSelector)!.textContent = label;
}
export function syncToggleButtons(selector: string, labelSelector: string, enabled: boolean) {
    document.querySelectorAll<HTMLButtonElement>(selector).forEach(button => updateToggleButton(button, labelSelector, enabled));
}
