// How an artifact was generated: the brief it came from and the model each step actually ran on.
// Written once when a run is saved; nothing reads it back at render time.
export interface GenMeta {
    at: string; // ISO, when the run was saved
    models: Record<string, string>; // AiTask → "provider:model", resolved when the step ran
    prompt: string;
    surface: string;
    length?: string;
    imageSource?: string;
    goal?: string;
    audience?: string;
    tone?: string;
    mustInclude?: string[];
    steer?: string;
    source?: string; // pasted or attached context, already clipped by the intake
    beats?: { id: string; label: string; role: string }[];
}
