/**
 * Minimal semver comparison for release ordering. Handles MAJOR.MINOR.PATCH
 * plus an optional prerelease tag — a prerelease sorts BELOW its release
 * (1.4.0-beta.1 < 1.4.0), matching semver precedence rules closely enough
 * for "is the client behind the latest published build?" decisions.
 */
export function compareVersions(a: string, b: string): number {
    const pa = parseVersion(a);
    const pb = parseVersion(b);

    for (let i = 0; i < 3; i++) {
        if (pa.nums[i] !== pb.nums[i]) return pa.nums[i] < pb.nums[i] ? -1 : 1;
    }
    // Equal core: a build with no prerelease outranks one with a prerelease.
    if (pa.pre === pb.pre) return 0;
    if (!pa.pre) return 1;
    if (!pb.pre) return -1;
    return pa.pre < pb.pre ? -1 : 1;
}

function parseVersion(v: string): { nums: [number, number, number]; pre: string } {
    const [core, ...preParts] = String(v).trim().split('-');
    const [maj, min, pat] = core.split('.').map((n) => parseInt(n, 10) || 0);
    return { nums: [maj, min, pat], pre: preParts.join('-') };
}

/** True when `current` is strictly older than `latest`. */
export function isOutdated(current: string | undefined, latest: string): boolean {
    if (!current) return true;
    return compareVersions(current, latest) < 0;
}
