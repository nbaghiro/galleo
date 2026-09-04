import { expect, test } from "@e2e/fixtures";

// Picking a template as a SHAPE rather than as a starting point. The wiring runs through four
// components and a store before it reaches the wire, and none of that is provable from a unit test:
// the first version of this read a disposed <Show> accessor and lost the pick silently.

const SHAPE = "Startup Pitch Deck";

test("a picked shape reaches the plan turn, and says so on the way", async ({ page }) => {
    await page.goto("/");
    await page
        .getByRole("button", { name: /New artifact/i })
        .first()
        .click();
    await expect(page.getByText("What are we making?")).toBeVisible();
    await expect(page.getByText("Popular templates")).toBeVisible();

    // the strip loads its bodies asynchronously, and a card with no body yet no-ops on click
    await expect(async () => {
        await page.getByText(SHAPE, { exact: true }).first().click();
        await expect(page.getByRole("button", { name: "Match this shape" })).toBeVisible({
            timeout: 1500,
        });
    }).toPass({ timeout: 15000 });

    // the preview offers both meanings of a template card side by side
    await expect(page.getByRole("button", { name: /Use template/ })).toBeVisible();
    await page.getByRole("button", { name: "Match this shape" }).click();

    // the chip is what tells the reader the run is carrying a shape, and how many designs it lends
    const chip = page.getByTitle("Its designs and its theme. None of its words.");
    await expect(chip).toBeVisible();
    await expect(chip).toContainText(SHAPE);
    await expect(chip).toContainText("13 designs");
    // A shape lends designs, not a running order, so the length stays where the reader left it. The
    // two counts are allowed to differ; only the chosen length reaches the prompt.
    await expect(page.getByText("Standard length")).toBeVisible();

    await page.locator("textarea").first().fill("A launch deck for a calm operating system");

    // Answered rather than aborted: a killed request logs a console error, and the fixture fails a
    // spec that leaves any behind. Planning is two tool calls, start-generation and then plan-outline,
    // and each is answered with the frames its caller reads: the started generation as the first
    // call's result, the outline as a patch on the second.
    const generation = {
        id: "g-e2e",
        workspaceId: "w",
        artifactId: "a-e2e",
        stage: "briefed",
        brief: { prompt: "A launch deck", surface: "deck", theme: "studio", set: {} },
        briefVersion: 1,
        outline: null,
        plannedAgainst: null,
        steer: "",
        clarify: null,
        beats: {},
        seq: 1,
    };
    const framesFor = (tool: string) =>
        tool === "start-generation"
            ? [
                  { seq: 0, event: { type: "turn.start", tool } },
                  { seq: 1, event: { type: "turn.done", result: generation } },
              ]
            : [
                  { seq: 0, event: { type: "turn.start", tool } },
                  {
                      seq: 1,
                      event: {
                          type: "patch",
                          seq: 2,
                          patch: {
                              generation: [
                                  {
                                      op: "setOutline",
                                      title: "A scripted plan",
                                      beats: [
                                          {
                                              id: "s1",
                                              label: "Cover",
                                              role: "scene",
                                              layout: "full",
                                          },
                                      ],
                                  },
                                  { op: "setStage", stage: "outlined" },
                              ],
                          },
                      },
                  },
                  { seq: 2, event: { type: "turn.done", summary: "planned" } },
              ];
    // Typed where it is captured rather than re-asserted at the read: postDataJSON() hands back
    // `any`, so one assertion here is the whole narrowing, and no second cast is needed below.
    interface SentCall {
        tool: string;
        input: Record<string, unknown>;
    }
    const sent: SentCall[] = [];
    await page.route("**/api/ai/turn", async (route) => {
        const call = route.request().postDataJSON() as SentCall;
        sent.push(call);
        await route.fulfill({
            status: 200,
            contentType: "text/event-stream",
            body: framesFor(call.tool)
                .map((f) => `data: ${JSON.stringify(f)}\n\n`)
                .join(""),
        });
    });
    await page.getByRole("button", { name: /Plan the outline/ }).click();

    await expect.poll(() => sent.length).toBeGreaterThanOrEqual(1);
    const started = sent[0]!;
    expect(started.tool).toBe("start-generation");
    expect(started.input.shapeTemplateId).toBe("startup-pitch");
    expect(started.input.length).toBe("Standard");
    // the shape travels as an id, never as the starter's copy: that is the whole difference
    expect(started.input.source).toBeFalsy();
    // and the plan is asked for on the generation the first call opened
    await expect.poll(() => sent[1]?.tool).toBe("plan-outline");
    expect(sent[1]!.input.generationId).toBe("g-e2e");

    // and the run leaves the intake for the board, so the pick is not a dead end
    await expect(page.getByText("What are we making?")).toBeHidden();
});
