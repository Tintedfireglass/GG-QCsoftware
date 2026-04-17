/**
 * Issues utility — shared logic for flagging QC test results as "issues".
 *
 * Definition: A test result is an ISSUE if:
 *   1. Its test_type is one of the 5 core hardware categories:
 *      CPU, GPU/Graphics, Memory/RAM, Storage, Battery
 *   2. Its score is less than 70
 *   3. For Battery: only if the device actually has a battery (desktops are excluded)
 */

/**
 * Prefixes that identify core hardware test types eligible for issue detection.
 * Only these five categories can be flagged — everything else (thermals, ports,
 * software, peripherals) is excluded.
 */
export const CORE_TEST_PREFIXES = [
    "cpu",
    "gpu",
    "graphics",
    "memory",
    "ram",
    "storage",
    "nvme",
    "ssd",
    "smart",
    "battery",
] as const

/** Score threshold below which a core test is flagged as an issue */
export const ISSUE_SCORE_THRESHOLD = 70

/**
 * Returns true if the test type is one of the 5 core hardware categories.
 */
export function isCoreTestType(testType: string): boolean {
    if (!testType) return false
    const t = testType.trim().toLowerCase()
    return CORE_TEST_PREFIXES.some((prefix) => t === prefix || t.startsWith(prefix + " ") || t.startsWith(prefix + "_") || t.startsWith(prefix + "/") || t === prefix)
}

/**
 * Returns true if the test type is a battery test.
 */
export function isBatteryTestType(testType: string): boolean {
    if (!testType) return false
    return testType.trim().toLowerCase().startsWith("battery")
}

/**
 * Returns true if the test result is an "issue":
 * - test_type is one of the 5 core categories (CPU/GPU/Memory/Storage/Battery)
 * - score < 70
 * - if it's a Battery test, batteryPresent must not be explicitly false
 *   (pass undefined if unknown — it will be treated as potentially present)
 */
export function isIssue(
    test: { test_type?: string; score?: number },
    batteryPresent?: boolean
): boolean {
    if (!test.test_type) return false
    if (!isCoreTestType(test.test_type)) return false

    // Skip battery issues for desktops (no battery)
    if (isBatteryTestType(test.test_type) && batteryPresent === false) return false

    const score = typeof test.score === "number" ? test.score : 0
    return score < ISSUE_SCORE_THRESHOLD
}
