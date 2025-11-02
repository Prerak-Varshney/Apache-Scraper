import { Page } from "playwright";
import { Filters } from "../types";
import { LEGACY_JIRA_STRUCTURE } from "../model/legacyStructure";
import { parseJiraDateTime } from "../utils/parseJiraDateTime";
import { exportToJsonl } from "../utils/exportToJsonl";

/**
 * LEGACY HTML SCRAPER
 * This is the old implementation using Playwright for HTML scraping
 * For production use, see restScraper.ts which uses Jira REST API
 */

// Helper function to add delay between requests
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Optional: Set a limit for testing (set to null for unlimited)
const MAX_PROJECTS_TO_SCRAPE: number | null = 1; // Set to 5 for testing, null for production

export const scrapePage = async (page: Page, filters: Filters) => {
  console.log("Scraping Begins...");

  await page.waitForSelector(".projects-list");

  // Scrape all projects
  const projects = await page.$$eval(
    "tbody.projects-list tr",
    (rows, filters) => {
      return rows.map((row) => {
        const nameTag = row.querySelector("td.cell-type-name a");
        const keyTag = row.querySelector("td.cell-type-key");
        const leadTag = row.querySelector("td.cell-type-user a");
        const urlTag = row.querySelector("td.cell-type-url a");

        const projectKey = keyTag?.textContent?.trim() || "N/A";
        const projectUrl = urlTag?.getAttribute("href") || "N/A";

        return {
          title: nameTag?.textContent?.trim() || "N/A",
          key: projectKey,
          projectLead: leadTag?.textContent?.trim() || "N/A",
          projectType: "N/A",
          projectCategory: filters.category || "N/A",
          projectUrl,
          issuesUrl:
            projectKey !== "N/A"
              ? `https://issues.apache.org/jira/projects/${projectKey}/issues/${projectKey}-1?filter=allopenissues`
              : "N/A",
        };
      });
    },
    filters
  );

  console.log(`Found ${projects.length} projects`);
  console.table(projects.slice(0, 5));

  let successCount = 0;
  let failureCount = 0;
  
  // Apply limit if set
  const projectsToProcess = MAX_PROJECTS_TO_SCRAPE 
    ? projects.slice(0, MAX_PROJECTS_TO_SCRAPE)
    : projects;
  
  if (MAX_PROJECTS_TO_SCRAPE) {
    console.log(`\n  Testing mode: Processing only first ${MAX_PROJECTS_TO_SCRAPE} projects\n`);
  }

  // Loop through projects and fetch issue metadata
  for (let i = 0; i < projectsToProcess.length; i++) {
    const project = projectsToProcess[i];
    if (project.issuesUrl === "N/A") continue;

    console.log(`\n[${i + 1}/${projectsToProcess.length}] Processing: ${project.key}`);

    try {
      // Check if browser is still connected
      if (!page || page.isClosed()) {
        console.warn(` Browser was closed. Stopping scrape.`);
        break;
      }

      if (i > 0) {
        await delay(1000); 
      }

      // Retry logic for page navigation with fallback strategies
      let navigationSuccess = false;
      let retries = 2;
      let currentStrategy = 0;
      const strategies = [
        { waitUntil: "domcontentloaded" as const, timeout: 60000, name: "DOM loaded" },
        { waitUntil: "load" as const, timeout: 90000, name: "Full load" },
        { waitUntil: "domcontentloaded" as const, timeout: 30000, name: "Quick DOM" },
      ];
      
      while (!navigationSuccess && retries > 0) {
        try {
          const strategy = strategies[currentStrategy];
          await page.goto(project.issuesUrl, {
            waitUntil: strategy.waitUntil,
            timeout: strategy.timeout,
          });
          navigationSuccess = true;
        } catch (navError: any) {
          retries--;
          currentStrategy = Math.min(currentStrategy + 1, strategies.length - 1);
          if (retries > 0) {
            console.log(`  ⏳ Retrying with different strategy... (${retries} attempts left)`);
            await delay(2000); // Wait 2 seconds before retry
          } else {
            throw navError; // Re-throw if all retries exhausted
          }
        }
      }

      console.log(`  ✓ Opened: ${project.issuesUrl}`);

      // Wait a moment for any dynamic content to load
      await delay(1500);

      // Debug: Log page title to understand what we're looking at
      const pageTitle = await page.title();
      console.log(`  📄 Page title: ${pageTitle}`);

      try {
        await page.waitForSelector("#jira", { timeout: 20000 });
      } catch (e) {
        console.warn(` Could not find main content for ${project.key}. Skipping...`);
        failureCount++;
        continue;
      }

      const pageBodyText = await page.textContent("body");

      if (
        pageBodyText &&
        /Permission Violation|not found|Project does not exist/i.test(pageBodyText)
      ) {
        console.warn(`    Skipping ${project.key} — inaccessible`);
        failureCount++;
        continue;
      }

      // Check if we're on a list view or detail view
      const isListView = await page.locator(".issue-list, .split-view").count() > 0;
      
      if (isListView) {
        // We're in list view, try to click the first issue
        try {
          const firstIssue = await page.waitForSelector(".issue-list li:first-child a, .splitview-issue-link:first-of-type", { timeout: 5000 });
          if (firstIssue) {
            await firstIssue.click();
            await page.waitForSelector("#issuedetails, #issue-content", { timeout: 10000 });
          }
        } catch (e) {
          console.warn(` ${project.key}: Could not navigate to issue details`);
          failureCount++;
          continue;
        }
      }

      const hasIssue = await page
        .waitForSelector("#summary-val, #issue-content, .issue-header", { timeout: 7000 })
        .then(() => true)
        .catch(() => false);

      if (!hasIssue) {
        console.warn(`    ${project.key}: No issue content found`);
        failureCount++;
        continue;
      }

      // Use Playwright's locator methods instead of page.evaluate to avoid __name conflicts
      const summary = await page.locator("#summary-val").textContent().catch(() => "N/A");
      const status = await page.locator("#status-val span").first().textContent().catch(() => "N/A");
      const assignee = await page.locator("#assignee-val").textContent().catch(() => "N/A");
      const reporter = await page.locator("#reporter-val").textContent().catch(() => "N/A");
      const priority = await page.locator("#priority-val span").first().textContent().catch(() => "N/A");
      const resolution = await page.locator("#resolution-val span").first().textContent().catch(() => "N/A");
      
      // Get watcher data
      const watcherData = await page.locator("#watcher-data").textContent().catch(() => "0");
      const watchers = parseInt(watcherData?.trim() || "0", 10) || 0;
      
      // Get dates from the page text
      const bodyText = await page.locator("body").textContent().catch(() => "");
      const created = bodyText?.match(/Created:\s*([0-9]{2}\/[A-Za-z]{3}\/[0-9]{2}\s+[0-9]{2}:[0-9]{2})/)?.[1] || "N/A";
      const updated = bodyText?.match(/Updated:\s*([0-9]{2}\/[A-Za-z]{3}\/[0-9]{2}\s+[0-9]{2}:[0-9]{2})/)?.[1] || "N/A";

      const rawData = {
        summary: summary?.trim() || "N/A",
        status: status?.trim() || "N/A",
        assignee: assignee?.trim() || "N/A",
        reporter: reporter?.trim() || "N/A",
        priority: priority?.trim() || "N/A",
        resolution: resolution?.trim() || "N/A",
        created,
        updated,
      };

      // Validate that we got some data
      if (rawData.summary === "N/A" && rawData.status === "N/A") {
        console.warn(` ${project.key}: Could not extract issue data (page might have a different layout)`);
        
        failureCount++;
        continue;
      }

      // Parse dates *outside* browser context
      const parsedCreated = parseJiraDateTime(rawData.created);
      const parsedUpdated = parseJiraDateTime(rawData.updated);

      // Build nested structure
      const structuredData = {
        title: project.title,
        key: project.key,
        projectType: project.projectType,
        projectLead: project.projectLead,
        projectCategory: project.projectCategory,
        projectUrl: project.projectUrl,
        metadata: {
          type: rawData.summary,
          status: rawData.status,
          priority: rawData.priority,
          resolution: rawData.resolution,
          labels: [], 
          assignee: rawData.assignee,
          reporter: rawData.reporter,
          votes: 0,
          watchers: watchers,
        },
        dates: {
          createdDate: parsedCreated.date,
          createdTime: parsedCreated.time,
          updatedDate: parsedUpdated.date,
          updatedTime: parsedUpdated.time,
        },
      };

      LEGACY_JIRA_STRUCTURE.push(structuredData);

      console.log(`   ${project.key}: ${structuredData.metadata.status}`);
      console.log('metadata:', structuredData.metadata);
      successCount++;
    } catch (err) {
      const error = err as Error;
      
      // Check if it's a browser closure error
      if (error.message.includes("Target page, context or browser has been closed")) {
        console.warn(`\n Browser was closed. Stopping scrape.`);
        break;
      }
      
      // Better error message for timeouts
      if (error.message.includes("Timeout")) {
        console.warn(`    Timeout: ${project.key} - Page took too long to load, skipping...`);
      } else {
        console.warn(`    Failed: ${project.key} - ${error.message.split('\n')[0]}`);
      }
      failureCount++;
    }
  }

  console.log("\n Scraping Ends...");
  console.log(`\nResults Summary:`);
  console.log(` Successfully scraped: ${successCount} projects`);
  console.log(`  Failed to scrape: ${failureCount} projects`);
  console.log(` Total collected: ${LEGACY_JIRA_STRUCTURE.length} projects\n`);
  console.table(LEGACY_JIRA_STRUCTURE.slice(0, 5));
  console.log('metadata', LEGACY_JIRA_STRUCTURE.map(proj => JSON.stringify(proj.metadata)).slice(0, 5));
  console.log('dates', LEGACY_JIRA_STRUCTURE.map(proj => JSON.stringify(proj.dates)).slice(0, 5));

  // Export to JSONL format for LLM training
  if (LEGACY_JIRA_STRUCTURE.length > 0) {
    exportToJsonl(LEGACY_JIRA_STRUCTURE);
  }

  return LEGACY_JIRA_STRUCTURE
};