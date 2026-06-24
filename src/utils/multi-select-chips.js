export function renderMultiSelectChips(container, candidates, selectedSet, options = {}) {
    const {
        chipClass = "qb-chip",
        selectedClass = "qb-chip-selected",
        emptyHint = "无候选词",
        hintClass = "qb-hint",
        onChange = null,
    } = options;

    container.replaceChildren();

    if (!Array.isArray(candidates) || candidates.length === 0) {
        const hint = document.createElement("span");
        hint.className = hintClass;
        hint.textContent = emptyHint;
        container.appendChild(hint);
        return;
    }

    candidates.forEach((candidate) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = selectedSet.has(candidate) ? `${chipClass} ${selectedClass}` : chipClass;
        chip.textContent = candidate;
        chip.title = "点击选择/取消";
        chip.addEventListener("click", () => {
            if (selectedSet.has(candidate)) {
                selectedSet.delete(candidate);
                chip.classList.remove(selectedClass);
            } else {
                selectedSet.add(candidate);
                chip.classList.add(selectedClass);
            }
            onChange?.();
        });
        container.appendChild(chip);
    });
}

export function collectSelectedKeywords(selectedSet, manualValue) {
    const items = [...selectedSet];
    const manual = String(manualValue || "").trim();
    if (manual && !items.includes(manual)) {
        items.push(manual);
    }
    return items;
}

export function hasQuickBlockSelection(selectedSet, manualValue) {
    return selectedSet.size > 0 || Boolean(String(manualValue || "").trim());
}
