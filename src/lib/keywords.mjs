export function addKeyword(groups, entry, order) {
    const keyword = groups.get(entry.key) || { key: entry.key, referenceIds: new Set(), order };
    keyword.referenceIds.add(entry.referenceId);
    groups.set(entry.key, keyword);
    return groups;
}
export function collectKeywords(references) {
    const entries = references.flatMap(reference => [...new Set(reference.keywords || [])].map(key => ({ key, referenceId: reference.refId })));
    const groups = entries.reduce((result, entry, index) => addKeyword(result, entry, index), new Map());
    return [...groups.values()]
        .sort((first, second) => second.referenceIds.size - first.referenceIds.size || first.order - second.order)
        .map(({ key, referenceIds }) => ({ key, people: referenceIds.size }));
}
