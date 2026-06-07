import { test, expect } from "@playwright/test";

/**
 * E2E: Onboarding wizard flow (skip_llm mode).
 *
 * Walks through the 4-step OnboardingWizard:
 *   Step 1 — Name your company
 *   Step 2 — Create your first agent (adapter selection + config)
 *   Step 3 — Give it something to do (task creation)
 *   Step 4 — Ready to launch (summary + open issue)
 *
 * By default this runs in skip_llm mode: we do NOT assert that an LLM
 * heartbeat fires. Set PAPERCLIP_E2E_SKIP_LLM=false to enable LLM-dependent
 * assertions (requires a valid ANTHROPIC_API_KEY).
 */

const SKIP_LLM = process.env.PAPERCLIP_E2E_SKIP_LLM !== "false";

const COMPANY_NAME = `E2E-Test-${Date.now()}`;
const AGENT_NAME = "CEO";
const TASK_TITLE = "E2E test task";
const LANGUAGE_SWITCHER_SELECTOR =
  'button[aria-label="Switch language"], button[aria-label="切换语言"]';

test.use({
  // This flow asserts English copy throughout; locale switching is covered
  // separately in language-switcher.spec.ts.
  locale: "en-US",
});

test.describe("Onboarding wizard", () => {
  test("keeps the company name field interactive after a modal pointer lock", async ({
    page,
  }) => {
    await page.goto("/onboarding");

    const html = page.locator("html");
    const languageSwitcher = page.locator(LANGUAGE_SWITCHER_SELECTOR).first();
    await expect(languageSwitcher).toBeVisible({ timeout: 15_000 });

    if ((await html.getAttribute("lang")) !== "en") {
      await languageSwitcher.click();
      await page.getByRole("button", { name: "English" }).click();
      await expect(html).toHaveAttribute("lang", "en");
    }

    const wizardHeading = page.locator("h3", { hasText: "Name your company" });
    const startOnboardingBtn = page.getByRole("button", {
      name: "Start Onboarding",
    });
    const newCompanyBtn = page.getByRole("button", { name: "New Company" });

    if (!(await wizardHeading.isVisible())) {
      if (await startOnboardingBtn.isVisible()) {
        await startOnboardingBtn.click();
      } else if (await newCompanyBtn.isVisible()) {
        await newCompanyBtn.click();
      }
    }

    await expect(wizardHeading).toBeVisible({ timeout: 15_000 });

    const companyNameInput = page.locator('input[placeholder="Acme Corp"]');
    const typedName = `Pointer-Lock-${Date.now()}`;

    await page.evaluate(() => {
      document.body.style.pointerEvents = "none";
    });

    await companyNameInput.click();
    await page.keyboard.type(typedName);
    await expect(companyNameInput).toHaveValue(typedName);
  });

  test("completes full wizard flow", async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto("/onboarding");

    const html = page.locator("html");
    const languageSwitcher = page.locator(LANGUAGE_SWITCHER_SELECTOR).first();
    await expect(languageSwitcher).toBeVisible({ timeout: 15_000 });

    if ((await html.getAttribute("lang")) !== "en") {
      await languageSwitcher.click();
      await page.getByRole("button", { name: "English" }).click();
      await expect(html).toHaveAttribute("lang", "en");
    }

    const wizardHeading = page.locator("h3", { hasText: "Name your company" });
    const startOnboardingBtn = page.getByRole("button", {
      name: "Start Onboarding",
    });
    const newCompanyBtn = page.getByRole("button", { name: "New Company" });

    if (!(await wizardHeading.isVisible())) {
      if (await startOnboardingBtn.isVisible()) {
        await startOnboardingBtn.click();
      } else if (await newCompanyBtn.isVisible()) {
        await newCompanyBtn.click();
      }
    }

    await expect(wizardHeading).toBeVisible({ timeout: 15_000 });

    const companyNameInput = page.locator('input[placeholder="Acme Corp"]');
    await companyNameInput.fill(COMPANY_NAME);

    const nextButton = page.getByRole("button", { name: "Next" });
    await nextButton.click();

    await expect(
      page.locator("h3", { hasText: "Create your first agent" })
    ).toBeVisible({ timeout: 30_000 });

    const agentNameInput = page.locator('input[placeholder="CEO"]');
    await expect(agentNameInput).toHaveValue(AGENT_NAME);

    await expect(
      page.locator("button", { hasText: "Claude Code" }).locator("..")
    ).toBeVisible();

    await page.getByRole("button", { name: "More Agent Adapter Types" }).click();
    await expect(page.getByRole("button", { name: "Process" })).toHaveCount(0);

    if (SKIP_LLM) {
      await page.route("**/api/companies/*/adapters/*/test-environment", async (route) => {
        const adapterType = route.request().url().match(/\/adapters\/([^/]+)\/test-environment/)?.[1] ?? "unknown";
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            adapterType,
            status: "pass",
            testedAt: new Date().toISOString(),
            checks: [
              {
                code: "e2e_skip_llm_adapter_probe",
                level: "info",
                message: "Live adapter probe skipped for the skip-LLM onboarding e2e.",
              },
            ],
          }),
        });
      });
    }

    await page.getByRole("button", { name: "Next" }).click();

    await expect(
      page.locator("h3", { hasText: "Give it something to do" })
    ).toBeVisible({ timeout: 60_000 });

    const baseUrl = page.url().split("/").slice(0, 3).join("/");
    if (SKIP_LLM) {
      const companiesAfterAgentRes = await page.request.get(`${baseUrl}/api/companies`);
      expect(companiesAfterAgentRes.ok()).toBe(true);
      const companiesAfterAgent = await companiesAfterAgentRes.json();
      const companyAfterAgent = companiesAfterAgent.find(
        (c: { name: string }) => c.name === COMPANY_NAME
      );
      expect(companyAfterAgent).toBeTruthy();

      const agentsAfterCreateRes = await page.request.get(
        `${baseUrl}/api/companies/${companyAfterAgent.id}/agents`
      );
      expect(agentsAfterCreateRes.ok()).toBe(true);
      const agentsAfterCreate = await agentsAfterCreateRes.json();
      const ceoAgentAfterCreate = agentsAfterCreate.find(
        (a: { name: string }) => a.name === AGENT_NAME
      );
      expect(ceoAgentAfterCreate).toBeTruthy();

      const disableWakeRes = await page.request.patch(
        `${baseUrl}/api/agents/${ceoAgentAfterCreate.id}?companyId=${encodeURIComponent(companyAfterAgent.id)}`,
        {
          data: {
            runtimeConfig: {
              heartbeat: {
                enabled: false,
                intervalSec: 300,
                wakeOnDemand: false,
                cooldownSec: 10,
                maxConcurrentRuns: 5,
              },
            },
          },
        }
      );
      expect(disableWakeRes.ok()).toBe(true);
    }

    const taskTitleInput = page.locator(
      'input[placeholder="e.g. Research competitor pricing"]'
    );
    await taskTitleInput.clear();
    await taskTitleInput.fill(TASK_TITLE);

    await page.getByRole("button", { name: "Next" }).click();

    await expect(
      page.locator("h3", { hasText: "Ready to launch" })
    ).toBeVisible({ timeout: 30_000 });

    await expect(page.locator("text=" + COMPANY_NAME)).toBeVisible();
    await expect(page.locator("text=" + AGENT_NAME)).toBeVisible();
    await expect(page.locator("text=" + TASK_TITLE)).toBeVisible();

    await page.getByRole("button", { name: "Create & Open Issue" }).click();

    await expect(page).toHaveURL(/\/issues\//, { timeout: 30_000 });

    const companiesRes = await page.request.get(`${baseUrl}/api/companies`);
    expect(companiesRes.ok()).toBe(true);
    const companies = await companiesRes.json();
    const company = companies.find(
      (c: { name: string }) => c.name === COMPANY_NAME
    );
    expect(company).toBeTruthy();

    const agentsRes = await page.request.get(
      `${baseUrl}/api/companies/${company.id}/agents`
    );
    expect(agentsRes.ok()).toBe(true);
    const agents = await agentsRes.json();
    const ceoAgent = agents.find(
      (a: { name: string }) => a.name === AGENT_NAME
    );
    expect(ceoAgent).toBeTruthy();
    expect(ceoAgent.role).toBe("ceo");
    expect(ceoAgent.adapterType).not.toBe("process");

    const instructionsBundleRes = await page.request.get(
      `${baseUrl}/api/agents/${ceoAgent.id}/instructions-bundle?companyId=${company.id}`
    );
    expect(instructionsBundleRes.ok()).toBe(true);
    const instructionsBundle = await instructionsBundleRes.json();
    expect(
      instructionsBundle.files.map((file: { path: string }) => file.path).sort()
    ).toEqual(["AGENTS.md", "HEARTBEAT.md", "SOUL.md", "TOOLS.md"]);

    const issuesRes = await page.request.get(
      `${baseUrl}/api/companies/${company.id}/issues`
    );
    expect(issuesRes.ok()).toBe(true);
    const issues = await issuesRes.json();
    const task = issues.find(
      (i: { title: string }) => i.title === TASK_TITLE
    );
    expect(task).toBeTruthy();
    expect(task.assigneeAgentId).toBe(ceoAgent.id);
    expect(task.description).toContain(
      "You are the CEO. You set the direction for the company."
    );
    expect(task.description).not.toContain("github.com/paperclipai/companies");

    if (!SKIP_LLM) {
      await expect(async () => {
        const res = await page.request.get(
          `${baseUrl}/api/issues/${task.id}`
        );
        const issue = await res.json();
        expect(["in_progress", "done"]).toContain(issue.status);
      }).toPass({ timeout: 120_000, intervals: [5_000] });
    } else {
      await expect
        .poll(async () => {
          const runsRes = await page.request.get(
            `${baseUrl}/api/companies/${company.id}/heartbeat-runs?agentId=${ceoAgent.id}`
          );
          expect(runsRes.ok()).toBe(true);
          const runs = await runsRes.json();
          return Array.isArray(runs) ? runs.length : -1;
        }, { timeout: 10_000, intervals: [500, 1_000, 2_000] })
        .toBe(0);
    }
  });
});
