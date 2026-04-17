/**
 * Issues utility — shared logic for flagging QC test results as "issues".
 *
 * Definition: A test result is an ISSUE if:
 *   1. It is NOT a peripheral component, AND
 *   2. Its score is less than 70
 */

/**
 * Test types that are considered "peripherals" and are excluded from issue
 * detection. Peripherals are external or optional components whose failure
 * does not represent a core system issue (e.g. keyboard, webcam).
 *
 * Match is case-insensitive and checks if the test_type starts with or equals
 * any entry in this set.
 */
export const PERIPHERAL_TEST_TYPES = new Set([
    "keyboard",
    "touchpad",
    "trackpad",
    "webcam",
    "camera",
    "speakers",
    "speaker",
    "microphone",
    "mic",
    "screen",
    "display",
    "usb",
    "usb port",
    "thunderbolt",
    "hdmi",
    "sd card",
    "sdcard",
    "ethernet",
    "lan",
    "bluetooth",
    "wifi",
    "wi-fi",
    "wireless",
    "ports",
    "physical ports",
    "fingerprint",
    "numpad",
    "number pad",
])

/**
 * Returns true if the given test type is a known peripheral.
 */
export function isPeripheral(testType: string): boolean {
    if (!testType) return false
    const normalized = testType.trim().toLowerCase()
    // Check exact match or starts-with match against peripheral set
    for (const peripheral of PERIPHERAL_TEST_TYPES) {
        if (normalized === peripheral || normalized.startsWith(peripheral)) {
            return true
        }
    }
    return false
}

/**
 * Returns true if the test result is considered an "issue":
 * - not a peripheral, AND
 * - score < 70
 */
export function isIssue(test: { test_type?: string; score?: number }): boolean {
    if (!test.test_type) return false
    if (isPeripheral(test.test_type)) return false
    const score = typeof test.score === "number" ? test.score : 0
    return score < 70
}

/** Score threshold below which a non-peripheral test is flagged as an issue */
export const ISSUE_SCORE_THRESHOLD = 70
