import { z } from 'zod';

export const PLATFORMS = ['windows', 'mac', 'linux', 'android', 'ios'] as const;
export const CHANNELS = ['stable', 'beta'] as const;

export type Platform = (typeof PLATFORMS)[number];
export type Channel = (typeof CHANNELS)[number];

/** Allowed installer extensions per platform (defence-in-depth on upload). */
export const PLATFORM_EXTENSIONS: Record<Platform, string[]> = {
    windows: ['.exe', '.msi'],
    mac: ['.dmg', '.pkg', '.zip'],
    // path.extname() returns only the last segment, so .tar.gz matches via '.gz'.
    linux: ['.appimage', '.deb', '.rpm', '.gz'],
    android: ['.apk', '.aab'],
    ios: ['.ipa'],
};

/** Loose semver: MAJOR.MINOR.PATCH with optional -prerelease (e.g. 1.4.0, 2.0.0-beta.1). */
export const versionSchema = z
    .string()
    .trim()
    .regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, 'version must be semver, e.g. 1.4.0');

export const platformSchema = z.enum(PLATFORMS);
export const channelSchema = z.enum(CHANNELS);

/** Multipart upload metadata (the file itself is validated in the route). */
export const createReleaseSchema = z.object({
    platform: platformSchema,
    channel: channelSchema.default('stable'),
    version: versionSchema,
    notes: z.string().trim().max(10_000).optional(),
    mandatory: z.coerce.boolean().default(false),
    publish: z.coerce.boolean().default(false),
    // Play Store / App Store link for version-only (no-file) releases.
    storeUrl: z.string().trim().url('storeUrl must be a valid URL').optional().or(z.literal('').transform(() => undefined)),
});

export const updateReleaseSchema = z
    .object({
        notes: z.string().trim().max(10_000).nullish(),
        mandatory: z.boolean().optional(),
        isPublished: z.boolean().optional(),
        storeUrl: z.string().trim().url().nullish(),
    })
    .refine((v) => Object.keys(v).length > 0, 'No fields to update');

/** Public update-check query: client reports its current version + channel. */
export const updateCheckQuerySchema = z.object({
    current: z.string().trim().optional(),
    channel: channelSchema.catch('stable'),
});
