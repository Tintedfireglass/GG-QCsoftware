"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/components/auth-provider"
import {
    getReleases,
    uploadRelease,
    updateRelease,
    deleteRelease,
    AppRelease,
    ReleasePlatform,
    ReleaseChannel,
    ReleaseArch,
    RELEASE_PLATFORM_ARCHS,
} from "@/lib/api"
import { Input } from "@/components/ui/input"
import {
    UploadCloud,
    RefreshCw,
    Trash2,
    CheckCircle2,
    CircleDashed,
    Download,
    AlertTriangle,
    Apple,
    MonitorDown,
    Laptop,
    Smartphone,
    Terminal,
} from "lucide-react"
import { formatDateTimeDMY } from "@/lib/utils"

function formatBytes(n: number | null): string {
    if (n == null || !Number.isFinite(n) || n <= 0) return "—"
    const units = ["B", "KB", "MB", "GB"]
    let i = 0
    let v = n
    while (v >= 1024 && i < units.length - 1) {
        v /= 1024
        i++
    }
    return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}

function formatDate(value: string | null) {
    return formatDateTimeDMY(value)
}

/** Human label for an arch, tuned to the platform (Intel vs Apple Silicon on mac). */
function archLabel(platform: ReleasePlatform, arch: ReleaseArch): string {
    if (arch === "universal") return "Universal"
    if (arch === "x64") return platform === "mac" ? "Intel (x64)" : "x64 (Intel/AMD)"
    // arm64
    if (platform === "mac") return "Apple Silicon (arm64)"
    if (platform === "windows") return "ARM64"
    return "arm64"
}

const PLATFORM_META: Record<ReleasePlatform, { label: string; icon: React.ComponentType<{ className?: string }>; accept: string; note?: string }> = {
    windows: { label: "Windows", icon: MonitorDown, accept: ".exe,.msi" },
    mac: { label: "macOS", icon: Laptop, accept: ".dmg,.pkg,.zip" },
    linux: { label: "Linux", icon: Terminal, accept: ".appimage,.deb,.rpm,.tar.gz" },
    android: {
        label: "Android",
        icon: Smartphone,
        accept: ".apk,.aab",
        note: "Self-hosted APK update (sideload). Requires “install from unknown sources” — this is not a Play Store update.",
    },
    ios: {
        label: "iPhone / iOS",
        icon: Apple,
        accept: ".ipa",
        note: "Self-hosted .ipa installs only on enterprise/ad-hoc-signed or TestFlight builds. App Store apps cannot be self-distributed — the manifest can only point users to the App Store.",
    },
}

export default function ReleasesPage() {
    const router = useRouter()
    const { user, isLoading: authLoading } = useAuth()
    const [releases, setReleases] = useState<AppRelease[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Upload form state
    const [platform, setPlatform] = useState<ReleasePlatform>("windows")
    const [arch, setArch] = useState<ReleaseArch>(RELEASE_PLATFORM_ARCHS.windows[0])
    const [channel, setChannel] = useState<ReleaseChannel>("stable")
    const [version, setVersion] = useState("")
    const [notes, setNotes] = useState("")
    const [mandatory, setMandatory] = useState(false)
    const [publish, setPublish] = useState(true)
    const [storeUrl, setStoreUrl] = useState("")
    const [file, setFile] = useState<File | null>(null)
    const [uploading, setUploading] = useState(false)

    useEffect(() => {
        if (!authLoading && user && user.role !== "SuperAdmin") router.replace("/dashboard")
    }, [authLoading, user, router])

    const load = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const data = await getReleases()
            setReleases(data.releases)
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load releases")
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        void load()
    }, [load])

    const onUpload = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!file && !storeUrl.trim()) {
            setError("Provide an installer file or a store URL")
            return
        }
        setUploading(true)
        setError(null)
        try {
            const form = new FormData()
            form.append("platform", platform)
            form.append("arch", arch)
            form.append("channel", channel)
            form.append("version", version.trim())
            form.append("notes", notes.trim())
            form.append("mandatory", String(mandatory))
            form.append("publish", String(publish))
            if (storeUrl.trim()) form.append("storeUrl", storeUrl.trim())
            if (file) form.append("file", file)
            await uploadRelease(form)
            setVersion("")
            setNotes("")
            setStoreUrl("")
            setMandatory(false)
            setFile(null)
            const fileInput = document.getElementById("release-file") as HTMLInputElement | null
            if (fileInput) fileInput.value = ""
            await load()
        } catch (e) {
            setError(e instanceof Error ? e.message : "Upload failed")
        } finally {
            setUploading(false)
        }
    }

    const togglePublish = async (r: AppRelease) => {
        try {
            const updated = await updateRelease(r.id, { isPublished: !r.is_published })
            setReleases((prev) => prev.map((x) => (x.id === r.id ? { ...x, ...updated } : x)))
        } catch (e) {
            setError(e instanceof Error ? e.message : "Update failed")
        }
    }

    const toggleMandatory = async (r: AppRelease) => {
        try {
            const updated = await updateRelease(r.id, { mandatory: !r.mandatory })
            setReleases((prev) => prev.map((x) => (x.id === r.id ? { ...x, ...updated } : x)))
        } catch (e) {
            setError(e instanceof Error ? e.message : "Update failed")
        }
    }

    const onDelete = async (r: AppRelease) => {
        if (!confirm(`Delete ${r.platform} ${r.version}? This removes the installer file permanently.`)) return
        try {
            await deleteRelease(r.id)
            setReleases((prev) => prev.filter((x) => x.id !== r.id))
        } catch (e) {
            setError(e instanceof Error ? e.message : "Delete failed")
        }
    }

    const grouped = useMemo(() => {
        const by = Object.fromEntries(
            (Object.keys(PLATFORM_META) as ReleasePlatform[]).map((p) => [p, [] as AppRelease[]])
        ) as Record<ReleasePlatform, AppRelease[]>
        for (const r of releases) (by[r.platform] ?? (by[r.platform] = [])).push(r)
        return by
    }, [releases])

    return (
        <div className="p-8 max-w-6xl mx-auto space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">App Updates</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Upload and publish desktop installers. Clients poll{" "}
                        <code className="px-1.5 py-0.5 bg-slate-100 rounded text-xs">/api/updates/{`{platform}`}/latest</code>{" "}
                        to auto-update.
                    </p>
                </div>
                <button
                    onClick={load}
                    className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-md border border-slate-200"
                >
                    <RefreshCw className="h-4 w-4" /> Refresh
                </button>
            </div>

            {error && (
                <div className="flex items-center gap-2 rounded-md bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
                    <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
                </div>
            )}

            {/* Upload form */}
            <form onSubmit={onUpload} className="rounded-lg border border-slate-200 bg-white p-6 space-y-4">
                <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                    <UploadCloud className="h-5 w-5 text-[var(--brand-purple)]" /> Upload new version
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <label className="space-y-1">
                        <span className="text-xs font-medium text-slate-600">Platform</span>
                        <select
                            value={platform}
                            onChange={(e) => {
                                const next = e.target.value as ReleasePlatform
                                setPlatform(next)
                                // Keep arch valid for the newly-selected platform.
                                setArch(RELEASE_PLATFORM_ARCHS[next][0])
                            }}
                            className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm"
                        >
                            <option value="windows">Windows (.exe / .msi)</option>
                            <option value="mac">macOS (.dmg / .pkg / .zip)</option>
                            <option value="linux">Linux (.AppImage / .deb / .rpm / .tar.gz)</option>
                            <option value="android">Android (.apk / .aab or store link)</option>
                            <option value="ios">iPhone / iOS (App Store link)</option>
                        </select>
                    </label>
                    <label className="space-y-1">
                        <span className="text-xs font-medium text-slate-600">Architecture</span>
                        <select
                            value={arch}
                            onChange={(e) => setArch(e.target.value as ReleaseArch)}
                            disabled={RELEASE_PLATFORM_ARCHS[platform].length <= 1}
                            className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                        >
                            {RELEASE_PLATFORM_ARCHS[platform].map((a) => (
                                <option key={a} value={a}>
                                    {archLabel(platform, a)}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="space-y-1">
                        <span className="text-xs font-medium text-slate-600">Channel</span>
                        <select
                            value={channel}
                            onChange={(e) => setChannel(e.target.value as ReleaseChannel)}
                            className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm"
                        >
                            <option value="stable">stable</option>
                            <option value="beta">beta</option>
                        </select>
                    </label>
                    <label className="space-y-1">
                        <span className="text-xs font-medium text-slate-600">Version (semver)</span>
                        <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.4.0" required />
                    </label>
                </div>
                {PLATFORM_META[platform].note && (
                    <p className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {PLATFORM_META[platform].note}
                    </p>
                )}
                <label className="space-y-1 block">
                    <span className="text-xs font-medium text-slate-600">Release notes</span>
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={3}
                        placeholder="What changed in this version…"
                        className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    />
                </label>
                <label className="space-y-1 block">
                    <span className="text-xs font-medium text-slate-600">
                        Store / update URL <span className="text-slate-400">(Play Store / App Store link — optional)</span>
                    </span>
                    <Input
                        value={storeUrl}
                        onChange={(e) => setStoreUrl(e.target.value)}
                        placeholder="https://play.google.com/store/apps/details?id=…"
                    />
                </label>
                <div className="flex flex-wrap items-center gap-6">
                    <label className="space-y-1">
                        <span className="text-xs font-medium text-slate-600 block">
                            Installer file <span className="text-slate-400">(optional if a store URL is set)</span>
                        </span>
                        <input
                            id="release-file"
                            type="file"
                            accept={PLATFORM_META[platform].accept}
                            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                            className="text-sm"
                        />
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input type="checkbox" checked={mandatory} onChange={(e) => setMandatory(e.target.checked)} />
                        Mandatory update
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
                        Publish immediately
                    </label>
                    <button
                        type="submit"
                        disabled={uploading}
                        className="ml-auto flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[var(--brand-purple)] rounded-md disabled:opacity-60"
                    >
                        {uploading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                        {uploading ? "Uploading…" : "Upload"}
                    </button>
                </div>
            </form>

            {/* Release lists */}
            {loading ? (
                <p className="text-sm text-slate-500">Loading…</p>
            ) : (
                (Object.keys(PLATFORM_META) as ReleasePlatform[]).map((p) => {
                    const Meta = PLATFORM_META[p]
                    const list = grouped[p] ?? []
                    return (
                        <div key={p} className="space-y-3">
                            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                                <Meta.icon className="h-5 w-5 text-slate-500" /> {Meta.label}
                                <span className="text-sm font-normal text-slate-400">({list.length})</span>
                            </h2>
                            {list.length === 0 ? (
                                <p className="text-sm text-slate-400">No releases uploaded yet.</p>
                            ) : (
                                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                                    <table className="w-full text-sm">
                                        <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                                            <tr>
                                                <th className="text-left px-4 py-3">Version</th>
                                                <th className="text-left px-4 py-3">Arch</th>
                                                <th className="text-left px-4 py-3">Channel</th>
                                                <th className="text-left px-4 py-3">Size</th>
                                                <th className="text-left px-4 py-3">Downloads</th>
                                                <th className="text-left px-4 py-3">Uploaded</th>
                                                <th className="text-left px-4 py-3">Status</th>
                                                <th className="px-4 py-3"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {list.map((r) => (
                                                <tr key={r.id} className="hover:bg-slate-50/50">
                                                    <td className="px-4 py-3 font-medium text-slate-900">
                                                        {r.version}
                                                        {r.mandatory && (
                                                            <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[10px] font-semibold">
                                                                MANDATORY
                                                            </span>
                                                        )}
                                                        <div className="text-xs text-slate-400 truncate max-w-[220px]" title={r.file_name ?? r.store_url ?? undefined}>
                                                            {r.file_name ?? (r.store_url
                                                                ? <a href={r.store_url} target="_blank" rel="noreferrer" className="text-[var(--brand-purple)] hover:underline">store link ↗</a>
                                                                : "version pointer")}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-xs font-medium">
                                                            {archLabel(r.platform, r.arch ?? "universal")}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-slate-600">{r.channel}</td>
                                                    <td className="px-4 py-3 text-slate-600">{r.file_name ? formatBytes(r.file_size) : "—"}</td>
                                                    <td className="px-4 py-3 text-slate-600">
                                                        <span className="inline-flex items-center gap-1">
                                                            <Download className="h-3.5 w-3.5 text-slate-400" />
                                                            {r.download_count}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-slate-500">{formatDate(r.created_at)}</td>
                                                    <td className="px-4 py-3">
                                                        {r.is_published ? (
                                                            <span className="inline-flex items-center gap-1 text-emerald-700">
                                                                <CheckCircle2 className="h-4 w-4" /> Published
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 text-slate-400">
                                                                <CircleDashed className="h-4 w-4" /> Draft
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center justify-end gap-2">
                                                            <button
                                                                onClick={() => togglePublish(r)}
                                                                className="px-2.5 py-1 text-xs rounded border border-slate-200 hover:bg-slate-100"
                                                            >
                                                                {r.is_published ? "Unpublish" : "Publish"}
                                                            </button>
                                                            <button
                                                                onClick={() => toggleMandatory(r)}
                                                                className="px-2.5 py-1 text-xs rounded border border-slate-200 hover:bg-slate-100"
                                                            >
                                                                {r.mandatory ? "Optional" : "Force"}
                                                            </button>
                                                            <button
                                                                onClick={() => onDelete(r)}
                                                                className="p-1.5 rounded text-rose-500 hover:bg-rose-50"
                                                                title="Delete"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )
                })
            )}
        </div>
    )
}
