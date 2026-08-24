// Google Drive calls for the Slides export: plain fetch against the user's access token, no SDK.

const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const SLIDES_MIME = "application/vnd.google-apps.presentation";

export type DriveUploadResult =
    | { url: string }
    | { error: "unauthorized" | "upload-failed"; detail?: string };

const failDetail = async (res: Response): Promise<string> => {
    const text = await res.text().catch(() => "");
    return `${res.status} ${text.slice(0, 200)}`;
};

/**
 * Uploads PPTX bytes converted-on-arrival to a native Google Slides presentation and returns its
 * editor URL. Resumable protocol in two steps (start + one PUT), which also covers decks past the
 * 5MB multipart cutoff. 401/403 report as "unauthorized" so the route can ask for a reconnect.
 */
export async function driveUploadPresentation(
    accessToken: string,
    name: string,
    bytes: Uint8Array,
): Promise<DriveUploadResult> {
    const auth = { Authorization: `Bearer ${accessToken}` };
    let start: Response;
    try {
        start = await fetch(`${DRIVE_UPLOAD}?uploadType=resumable`, {
            method: "POST",
            headers: {
                ...auth,
                "Content-Type": "application/json; charset=UTF-8",
                "X-Upload-Content-Type": PPTX_MIME,
                "X-Upload-Content-Length": String(bytes.byteLength),
            },
            body: JSON.stringify({ name, mimeType: SLIDES_MIME }),
        });
    } catch (e) {
        return { error: "upload-failed", detail: e instanceof Error ? e.message : "network" };
    }
    if (start.status === 401 || start.status === 403) return { error: "unauthorized" };
    const session = start.headers.get("location");
    if (!start.ok || !session) return { error: "upload-failed", detail: await failDetail(start) };

    let put: Response;
    try {
        put = await fetch(session, {
            method: "PUT",
            headers: { "Content-Type": PPTX_MIME },
            body: new Uint8Array(bytes),
        });
    } catch (e) {
        return { error: "upload-failed", detail: e instanceof Error ? e.message : "network" };
    }
    if (put.status === 401 || put.status === 403) return { error: "unauthorized" };
    if (!put.ok) return { error: "upload-failed", detail: await failDetail(put) };
    const file = (await put.json().catch(() => null)) as { id?: string } | null;
    if (!file?.id) return { error: "upload-failed", detail: "no file id in upload response" };
    return { url: `https://docs.google.com/presentation/d/${file.id}/edit` };
}
