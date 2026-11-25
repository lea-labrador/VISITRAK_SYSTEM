// Super Admin tool: create / view / revoke QR access for helpers who encode manual feedback.
import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import QRCode from "qrcode";
import { Ban, ChevronDown, ChevronUp, Clipboard, Download, QrCode, Trash2 } from "lucide-react";
import { db } from "../lib/firebase";
import {
    EXPIRY_OPTIONS,
    buildEncoderUrl,
    createEncoderLink,
    deleteEncoderLink,
    getEncoderLinkState,
    revokeEncoderLink,
    subscribeEncoderLinks,
} from "../lib/encoderLinks.services";

const STATE_STYLES = {
    active: "bg-emerald-100 text-emerald-800",
    expired: "bg-gray-200 text-gray-700",
    revoked: "bg-red-100 text-red-700",
};

const inputClass =
    "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#7400EA] focus:ring-2 focus:ring-[#7400EA]/25";

const EncoderLinksPanel = ({ user }) => {
    const [open, setOpen] = useState(false);
    const [offices, setOffices] = useState([]);
    const [links, setLinks] = useState([]);
    const [form, setForm] = useState({ label: "", office: "", hours: 24 });
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState("");
    const [shown, setShown] = useState(null); // { id, url, qr }

    useEffect(() => {
        const unsub = onSnapshot(
            collection(db, "offices"),
            (snap) => {
                const list = snap.docs
                    .map((d) => d.data() || {})
                    .filter((o) => (o.role || "office") !== "super" && typeof o.name === "string" && o.name.trim())
                    .map((o) => o.name.trim())
                    .filter((name) => !["all offices", "super admin"].includes(name.toLowerCase()))
                    .sort((a, b) => a.localeCompare(b));
                setOffices(list);
            },
            () => setOffices([])
        );
        return () => unsub();
    }, []);

    useEffect(() => {
        if (!open) return undefined;
        return subscribeEncoderLinks(setLinks, (err) => setError(err?.code || err?.message || "Failed to load links"));
    }, [open]);

    const showQr = async (id) => {
        const url = buildEncoderUrl(id);
        const qr = await QRCode.toDataURL(url, { width: 360, margin: 2, errorCorrectionLevel: "M" });
        setShown({ id, url, qr });
    };

    const handleCreate = async () => {
        if (creating) return;
        setError("");

        if (!form.label.trim()) {
            setError("Give the link a name (for example: Helper - Registrar).");
            return;
        }

        setCreating(true);
        try {
            const id = await createEncoderLink({ ...form, createdBy: user });
            await showQr(id);
            setForm((prev) => ({ ...prev, label: "" }));
        } catch (err) {
            setError(`Failed to create link: ${err?.code || err?.message || "Unknown error"}`);
        } finally {
            setCreating(false);
        }
    };

    const handleCopy = async (url) => {
        try {
            await navigator.clipboard.writeText(url);
            alert("Encoder link copied.");
        } catch {
            alert("Could not copy. Please copy the link manually.");
        }
    };

    const handleDownload = () => {
        if (!shown) return;
        const a = document.createElement("a");
        a.href = shown.qr;
        a.download = "visitrak-encoder-qr.png";
        a.click();
    };

    const handleRevoke = async (link) => {
        if (!window.confirm(`Turn off "${link.label || "this link"}"? The helper will no longer be able to save.`)) return;
        try {
            await revokeEncoderLink(link.id);
            if (shown?.id === link.id) setShown(null);
        } catch (err) {
            alert(`Failed to revoke: ${err?.code || err?.message}`);
        }
    };

    const handleDelete = async (link) => {
        if (!window.confirm("Delete this link permanently? Feedback already encoded stays saved.")) return;
        try {
            await deleteEncoderLink(link.id);
            if (shown?.id === link.id) setShown(null);
        } catch (err) {
            alert(`Failed to delete: ${err?.code || err?.message}`);
        }
    };

    return (
        <div className="mb-4 rounded-xl border border-[#7400EA] bg-white dark:bg-gray-900">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex w-full items-center justify-between gap-3 p-4 text-left"
            >
                <span className="flex items-center gap-2">
                    <QrCode className="h-5 w-5 text-[#7400EA]" />
                    <span>
                        <span className="block text-base font-semibold text-gray-900 dark:text-gray-100">
                            Helper / Encoder Access (QR)
                        </span>
                        <span className="block text-xs text-gray-600 dark:text-gray-300">
                            Let someone help encode paper forms. They only see the Manual Feedback form.
                        </span>
                    </span>
                </span>
                {open ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </button>

            {open && (
                <div className="space-y-4 border-t border-purple-200 p-4 dark:border-purple-900">
                    {error && (
                        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
                    )}

                    {/* Create */}
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <label className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                            Name of helper / link
                            <input
                                type="text"
                                maxLength={80}
                                value={form.label}
                                onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
                                placeholder="e.g. Helper - Registrar"
                                className={`${inputClass} mt-1`}
                            />
                        </label>

                        <label className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                            Office
                            <select
                                value={form.office}
                                onChange={(e) => setForm((p) => ({ ...p, office: e.target.value }))}
                                className={`${inputClass} mt-1`}
                            >
                                <option value="">Any office (helper chooses)</option>
                                {offices.map((name) => (
                                    <option key={name} value={name}>
                                        Only: {name}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                            Valid for
                            <select
                                value={form.hours}
                                onChange={(e) => setForm((p) => ({ ...p, hours: Number(e.target.value) }))}
                                className={`${inputClass} mt-1`}
                            >
                                {EXPIRY_OPTIONS.map((o) => (
                                    <option key={o.hours} value={o.hours}>
                                        {o.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>

                    <button
                        type="button"
                        onClick={handleCreate}
                        disabled={creating}
                        className="rounded-md bg-[#7400EA] px-4 py-2 text-sm font-semibold text-white hover:bg-[#5f00bf] disabled:opacity-60"
                    >
                        {creating ? "Generating..." : "Generate QR code"}
                    </button>

                    {/* Shown QR */}
                    {shown && (
                        <div className="flex flex-col items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 text-center sm:flex-row sm:text-left">
                            <img src={shown.qr} alt="Encoder QR code" className="h-44 w-44" />
                            <div className="min-w-0 flex-1 space-y-2">
                                <p className="text-sm text-gray-700">
                                    Scan this with the helper&apos;s phone, or send them the link. Anyone with it can encode
                                    feedback until it expires or you turn it off.
                                </p>
                                <p className="break-all rounded bg-gray-100 px-2 py-1 text-xs text-gray-700">{shown.url}</p>
                                <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
                                    <button
                                        type="button"
                                        onClick={() => handleCopy(shown.url)}
                                        className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-100"
                                    >
                                        <Clipboard className="h-3.5 w-3.5" /> Copy link
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleDownload}
                                        className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-100"
                                    >
                                        <Download className="h-3.5 w-3.5" /> Download QR
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Existing links */}
                    <div>
                        <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">Existing links</h3>
                        {links.length === 0 ? (
                            <p className="text-xs text-gray-500">No encoder links yet.</p>
                        ) : (
                            <ul className="space-y-2">
                                {links.map((link) => {
                                    const state = getEncoderLinkState(link);
                                    const expires = link.expiresAt?.toDate?.();
                                    return (
                                        <li
                                            key={link.id}
                                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white p-3"
                                        >
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-semibold text-gray-900">
                                                    {link.label || "(no name)"}{" "}
                                                    <span className={`ml-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATE_STYLES[state] || ""}`}>
                                                        {state}
                                                    </span>
                                                </p>
                                                <p className="truncate text-xs text-gray-600">
                                                    {link.office ? `Only: ${link.office}` : "Any office"}
                                                    {expires ? ` · until ${expires.toLocaleString()}` : ""}
                                                </p>
                                            </div>
                                            <div className="flex gap-1.5">
                                                {state === "active" && (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={() => showQr(link.id)}
                                                            className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-100"
                                                        >
                                                            <QrCode className="h-3.5 w-3.5" /> QR
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRevoke(link)}
                                                            className="inline-flex items-center gap-1 rounded-md border border-amber-300 px-2.5 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-50"
                                                        >
                                                            <Ban className="h-3.5 w-3.5" /> Turn off
                                                        </button>
                                                    </>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => handleDelete(link)}
                                                    className="inline-flex items-center gap-1 rounded-md border border-red-300 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default EncoderLinksPanel;