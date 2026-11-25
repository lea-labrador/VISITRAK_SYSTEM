// Standalone page for helpers: /encode?l=<linkId>
// No sidebar, no topbar, no other pages - only the Manual Feedback form.
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, Loader2, ShieldCheck } from "lucide-react";
import { ManualFeedbackForm } from "./ManualFeedback";
import {
    ensureEncoderSession,
    fetchEncoderLink,
    getEncoderLinkState,
} from "../lib/encoderLinks.services";
import logo from "../assets/visitrakLogo.png";

const MESSAGES = {
    missing: "This encoder link is not valid. Please ask the administrator for a new QR code.",
    revoked: "This encoder link was turned off by the administrator.",
    expired: "This encoder link has expired. Please ask the administrator for a new QR code.",
};

const Shell = ({ children }) => (
    <div className="min-h-screen bg-[#f3effa] px-3 py-4 sm:px-6">{children}</div>
);

// eslint-disable-next-line no-unused-vars
const Notice = ({ icon: Icon, title, text, tone = "red" }) => (
    <Shell>
        <div className="mx-auto mt-16 max-w-md rounded-2xl bg-white p-6 text-center shadow-xl">
            <Icon className={`mx-auto h-10 w-10 ${tone === "red" ? "text-red-500" : "text-[#7400EA]"}`} />
            <h1 className="mt-3 text-lg font-semibold text-gray-900">{title}</h1>
            <p className="mt-2 text-sm text-gray-600">{text}</p>
        </div>
    </Shell>
);

const EncoderPage = () => {
    const [params] = useSearchParams();
    const linkId = (params.get("l") || "").trim();

    const [state, setState] = useState({ phase: "checking", message: "", link: null, uid: "" });

    useEffect(() => {
        let cancelled = false;

        const run = async () => {
            if (!/^[0-9a-f]{32}$/i.test(linkId)) {
                setState({ phase: "error", message: MESSAGES.missing, link: null, uid: "" });
                return;
            }

            try {
                const user = await ensureEncoderSession();
                const link = await fetchEncoderLink(linkId);
                const linkState = getEncoderLinkState(link);

                if (cancelled) return;

                if (linkState !== "active") {
                    setState({ phase: "error", message: MESSAGES[linkState], link: null, uid: "" });
                    return;
                }

                setState({ phase: "ready", message: "", link, uid: user.uid });
            } catch (err) {
                if (cancelled) return;

                let message = "Could not open the encoder page. Please check your internet and try again.";
                if (err?.code === "visitrak/admin-session") {
                    message =
                        "You are signed in as an admin in this browser. Open this link in a private/incognito window or on another device.";
                } else if (
                    err?.code === "auth/operation-not-allowed" ||
                    err?.code === "auth/admin-restricted-operation"
                ) {
                    message =
                        "Anonymous sign-in is not enabled yet. Enable it in Firebase Console > Authentication > Sign-in method > Anonymous.";
                } else if (err?.code === "permission-denied") {
                    message = MESSAGES.missing;
                }
                setState({ phase: "error", message, link: null, uid: "" });
            }
        };

        run();
        return () => {
            cancelled = true;
        };
    }, [linkId]);

    const encoder = useMemo(
        () =>
            state.link
                ? {
                    linkId: state.link.id,
                    office: state.link.office || "",
                    label: state.link.label || "",
                    uid: state.uid,
                }
                : null,
        [state.link, state.uid]
    );

    if (state.phase === "checking") {
        return (
            <Notice
                icon={Loader2}
                tone="purple"
                title="Opening encoder..."
                text="Please wait a moment."
            />
        );
    }

    if (state.phase === "error") {
        return <Notice icon={AlertTriangle} title="Encoder link unavailable" text={state.message} />;
    }

    const expires = state.link.expiresAt?.toDate?.();

    return (
        <Shell>
            <div className="mx-auto mb-4 flex max-w-5xl items-center gap-3 rounded-xl border border-[#7400EA] bg-white p-3 shadow-sm">
                <img src={logo} alt="VisiTrak" className="h-10 w-auto object-contain" />
                <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                        <ShieldCheck className="h-4 w-4 text-[#7400EA]" />
                        Manual Feedback Encoder
                    </p>
                    <p className="truncate text-xs text-gray-600">
                        {state.link.label ? `${state.link.label} · ` : ""}
                        {state.link.office ? `Office: ${state.link.office}` : "All offices"}
                        {expires ? ` · Valid until ${expires.toLocaleString()}` : ""}
                    </p>
                </div>
            </div>

            <ManualFeedbackForm user={null} encoder={encoder} />
        </Shell>
    );
};

export default EncoderPage;