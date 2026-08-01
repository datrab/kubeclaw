export function selectDefinedValue(...readers) {
    let lastValue;
    let hasValue = false;
    for (const reader of readers) {
        const value = reader();
        lastValue = value;
        hasValue = true;
        if (value !== undefined && value !== null)
            return value;
    }
    if (hasValue)
        return lastValue;
    return undefined;
}
export function selectTruthyValue(...readers) {
    let lastValue;
    let hasValue = false;
    for (const reader of readers) {
        const value = reader();
        lastValue = value;
        hasValue = true;
        if (value)
            return value;
    }
    if (hasValue)
        return lastValue;
    return undefined;
}
