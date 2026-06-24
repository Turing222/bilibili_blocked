export function safeRegexTest(pattern, value) {
    try {
        return new RegExp(pattern).test(value);
    } catch {
        return false;
    }
}
