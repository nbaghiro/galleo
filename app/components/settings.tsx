import type { Accessor, Component, JSX } from "solid-js";
import { useNavigate, useParams } from "@solidjs/router";
import type { TabItem } from "@ui/tabs";
import { Eyebrow } from "@ui/button";

// The chrome both settings pages share: a titled block, and the tab the route is on. Defined once
// here rather than privately in each view, which is how the two drifted apart in the first place.

export const SettingsSection: Component<{ title: string; children: JSX.Element }> = (props) => (
    <section class="mb-8">
        <Eyebrow as="div" class="mb-2">
            {props.title}
        </Eyebrow>
        {props.children}
    </section>
);

/**
 * The tab a settings route is showing, and how to move to another one. The tab is in the URL so it
 * is linkable and survives a reload, and an unknown or absent one falls back to the first rather
 * than rendering a page with nothing on it.
 *
 * `replace` on navigation, because flipping tabs is not a step someone wants to walk back through.
 */
export function useSettingsTab(
    base: string,
    tabs: readonly TabItem[],
): [Accessor<string>, (id: string) => void] {
    const params = useParams();
    const navigate = useNavigate();
    const active = (): string => {
        const asked = params.tab;
        return tabs.some((t) => t.id === asked) ? asked! : tabs[0]!.id;
    };
    return [active, (id) => navigate(`${base}/${id}`, { replace: true })];
}
