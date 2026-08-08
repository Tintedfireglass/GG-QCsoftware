"use client"

import { useRef } from "react"
import { AlertTriangle, Globe, ImageUp, RotateCcw, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    DEFAULT_PRIMARY_COLOR,
    contrastWithWhite,
    hoverColorFor,
    normalizeHexColor,
} from "@/lib/shared/branding-color"
import { normalizeAssignableDomain } from "@/lib/shared/branding-host"

/** Branding an admin is composing for a reseller, before it is persisted. */
export interface ResellerBrandingDraft {
    /** Host the branding applies on; '' means it applies nowhere. */
    domain: string
    /** Always a `#rrggbb` value; the platform purple until changed. */
    primaryColor: string
    /** Newly picked logo, not yet uploaded. */
    logoFile: File | null
    /** Logo already saved on the reseller, or '' when it inherits the platform. */
    existingLogoUrl: string
    /** Newly picked tab icon, not yet uploaded. */
    faviconFile: File | null
    /** Favicon already saved on the reseller, or '' when it inherits the platform. */
    existingFaviconUrl: string
}

export function emptyBrandingDraft(): ResellerBrandingDraft {
    return {
        domain: "",
        primaryColor: DEFAULT_PRIMARY_COLOR,
        logoFile: null,
        existingLogoUrl: "",
        faviconFile: null,
        existingFaviconUrl: "",
    }
}

/** Starting points so admins are not forced to think in hex. */
const PRESETS: { color: string; label: string }[] = [
    { color: DEFAULT_PRIMARY_COLOR, label: "Pramaan Purple" },
    { color: "#1d4ed8", label: "Blue" },
    { color: "#0f766e", label: "Teal" },
    { color: "#b91c1c", label: "Red" },
    { color: "#c2410c", label: "Orange" },
    { color: "#15803d", label: "Green" },
    { color: "#334155", label: "Slate" },
]

/** Buttons carry white labels, so a pale brand colour renders unreadable text. */
const MIN_CONTRAST = 3

/**
 * One artwork slot: preview, file picker and undo. Shared by the wordmark and
 * the favicon, which differ only in what they accept and how they preview.
 */
function AssetUpload({
    label,
    accept,
    hint,
    file,
    existingUrl,
    onPick,
    storageConfigured,
    disabled,
    previewClassName,
    previewBoxClassName,
}: {
    label: string
    accept: string
    hint: string
    file: File | null
    existingUrl: string
    onPick: (file: File | null) => void
    storageConfigured: boolean
    disabled: boolean
    previewClassName: string
    previewBoxClassName: string
}) {
    const input = useRef<HTMLInputElement>(null)
    const preview = file ? URL.createObjectURL(file) : existingUrl

    return (
        <div>
            <div className="text-xs font-semibold text-slate-600 mb-2">{label}</div>
            <div className="flex items-center gap-4 p-4 rounded-xl border-2 border-slate-100 bg-white">
                <div className={`shrink-0 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden ${previewBoxClassName}`}>
                    {preview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={preview} alt={`${label} preview`} className={previewClassName} />
                    ) : (
                        <span className="text-[10px] text-slate-400 text-center px-2">Platform</span>
                    )}
                </div>
                <div className="min-w-0">
                    <input
                        ref={input}
                        type="file"
                        accept={accept}
                        className="hidden"
                        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
                    />
                    <Button
                        type="button"
                        variant="outline"
                        disabled={disabled || !storageConfigured}
                        onClick={() => input.current?.click()}
                        className="h-9 px-3 text-xs gap-1.5"
                    >
                        <ImageUp className="h-3.5 w-3.5" />
                        {preview ? "Replace" : "Upload"}
                    </Button>
                    {file && (
                        <button
                            type="button"
                            onClick={() => {
                                if (input.current) input.current.value = ""
                                onPick(null)
                            }}
                            className="ml-2 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
                        >
                            <X className="h-3 w-3" /> Undo
                        </button>
                    )}
                    <p className="text-[11px] text-slate-500 mt-2 truncate">
                        {!storageConfigured
                            ? "Uploads unavailable — object storage is not configured."
                            : file
                                ? file.name
                                : hint}
                    </p>
                </div>
            </div>
        </div>
    )
}

interface Props {
    value: ResellerBrandingDraft
    onChange: (next: ResellerBrandingDraft) => void
    /** False when SPACES_* is unset — colour still works, uploads do not. */
    storageConfigured?: boolean
    /** Shown on the edit form: revert this reseller to the platform branding. */
    onReset?: () => void
    resetting?: boolean
    disabled?: boolean
}

/**
 * Logo + primary colour editor for a Reseller account.
 *
 * Purely presentational: the parent decides when to persist, because on the
 * create form the reseller does not exist yet when these fields are filled in.
 */
export function ResellerBrandingFields({
    value,
    onChange,
    storageConfigured = true,
    onReset,
    resetting = false,
    disabled = false,
}: Props) {
    const color = normalizeHexColor(value.primaryColor) ?? DEFAULT_PRIMARY_COLOR
    const hover = hoverColorFor(color)
    const lowContrast = contrastWithWhite(color) < MIN_CONTRAST
    const hasArtwork = Boolean(value.existingLogoUrl) || Boolean(value.logoFile)
        || Boolean(value.existingFaviconUrl) || Boolean(value.faviconFile)
    const customColor = color.toLowerCase() !== DEFAULT_PRIMARY_COLOR.toLowerCase()
    const isCustomised = customColor || hasArtwork || Boolean(value.domain)

    const domainTyped = value.domain.trim()
    const normalizedDomain = normalizeAssignableDomain(domainTyped)
    const domainInvalid = domainTyped !== "" && normalizedDomain == null
    // Without a domain the artwork and colour are stored but never rendered.
    const brandingDormant = !domainTyped && (hasArtwork || customColor)

    return (
        <div className="pt-6 border-t border-slate-100">
            <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                    <label className="block text-sm font-semibold text-slate-700">Reseller Branding</label>
                    <p className="text-xs text-slate-500 mt-1">
                        Applied only when the panel is opened on this reseller&apos;s domain. Every other
                        address — including the main one — keeps the default Pramaan branding.
                    </p>
                </div>
                {onReset && isCustomised && (
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={onReset}
                        disabled={disabled || resetting}
                        className="shrink-0 h-9 px-3 text-slate-500 hover:text-slate-900 text-xs gap-1.5"
                    >
                        <RotateCcw className="h-3.5 w-3.5" />
                        {resetting ? "Resetting…" : "Reset to platform"}
                    </Button>
                )}
            </div>

            {/* Domain — the switch that decides where the branding below applies */}
            <div className="mb-6">
                <div className="text-xs font-semibold text-slate-600 mb-2">Domain</div>
                <div className="relative">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                        type="text"
                        value={value.domain}
                        disabled={disabled}
                        onChange={(e) => onChange({ ...value, domain: e.target.value })}
                        placeholder="qc.acme.com"
                        spellCheck={false}
                        autoCapitalize="none"
                        className={`h-11 pl-9 font-mono text-sm ${domainInvalid ? "border-rose-300 focus-visible:ring-rose-400" : ""}`}
                    />
                </div>
                {domainInvalid ? (
                    <p className="text-[11px] text-rose-600 mt-1.5">
                        Enter a domain like qc.acme.com — no https://, port or path.
                    </p>
                ) : (
                    <p className="text-[11px] text-slate-500 mt-1.5">
                        {normalizedDomain && normalizedDomain !== domainTyped.toLowerCase()
                            ? <>Will be saved as <span className="font-mono">{normalizedDomain}</span>. </>
                            : null}
                        One domain per reseller. It must already point at this deployment — assigning it
                        here themes the panel, it does not configure DNS or TLS.
                    </p>
                )}
                {brandingDormant && (
                    <p className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-2 mt-2">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
                        Without a domain this branding is saved but never shown — the reseller sees the
                        default Pramaan branding everywhere.
                    </p>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Artwork */}
                <div className="space-y-4">
                    <AssetUpload
                        label="Company logo"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        hint="PNG, JPEG, WebP or SVG, up to 2MB."
                        file={value.logoFile}
                        existingUrl={value.existingLogoUrl}
                        onPick={(logoFile) => onChange({ ...value, logoFile })}
                        storageConfigured={storageConfigured}
                        disabled={disabled}
                        previewBoxClassName="h-14 w-28"
                        previewClassName="max-h-12 max-w-24 object-contain"
                    />
                    <AssetUpload
                        label="Favicon (browser tab icon)"
                        accept="image/png,image/x-icon,image/vnd.microsoft.icon,image/svg+xml,.ico"
                        hint="Square ICO, PNG or SVG — 32×32 or larger."
                        file={value.faviconFile}
                        existingUrl={value.existingFaviconUrl}
                        onPick={(faviconFile) => onChange({ ...value, faviconFile })}
                        storageConfigured={storageConfigured}
                        disabled={disabled}
                        previewBoxClassName="h-14 w-14"
                        previewClassName="max-h-8 max-w-8 object-contain"
                    />
                </div>

                {/* Primary colour */}
                <div>
                    <div className="text-xs font-semibold text-slate-600 mb-2">Primary colour</div>
                    <div className="p-4 rounded-xl border-2 border-slate-100 bg-white space-y-3">
                        <div className="flex items-center gap-2">
                            <input
                                type="color"
                                value={color}
                                disabled={disabled}
                                onChange={(e) => onChange({ ...value, primaryColor: e.target.value })}
                                className="h-10 w-12 rounded-lg border border-slate-200 bg-white p-1 cursor-pointer"
                                aria-label="Primary colour"
                            />
                            <Input
                                type="text"
                                value={value.primaryColor}
                                disabled={disabled}
                                onChange={(e) => onChange({ ...value, primaryColor: e.target.value })}
                                placeholder={DEFAULT_PRIMARY_COLOR}
                                className="h-10 font-mono text-sm uppercase"
                            />
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                            {PRESETS.map((preset) => (
                                <button
                                    key={preset.color}
                                    type="button"
                                    title={preset.label}
                                    disabled={disabled}
                                    onClick={() => onChange({ ...value, primaryColor: preset.color })}
                                    style={{ backgroundColor: preset.color }}
                                    className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${color.toLowerCase() === preset.color.toLowerCase()
                                        ? "border-slate-900"
                                        : "border-white shadow-sm ring-1 ring-slate-200"
                                        }`}
                                />
                            ))}
                        </div>

                        {/* What the colour actually looks like where it is used most. */}
                        <div className="flex items-center gap-2 pt-1">
                            <span
                                className="inline-flex items-center h-8 px-3 rounded-md text-white text-xs font-medium"
                                style={{ backgroundColor: color }}
                            >
                                Button
                            </span>
                            <span className="text-xs font-medium" style={{ color }}>Link</span>
                            <span className="text-[11px] text-slate-400 font-mono ml-auto">hover {hover}</span>
                        </div>

                        {lowContrast && (
                            <p className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-2">
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
                                This colour is light — white button text on it will be hard to read. A darker
                                shade is recommended.
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
