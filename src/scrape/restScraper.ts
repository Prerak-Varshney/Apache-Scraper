import { JiraApiClient } from '../api/jiraClient';
import { CheckpointManager } from '../utils/checkpointManager';
import { TaskGenerator } from '../utils/taskGenerator';
import { exportToJsonl } from '../utils/exportToJsonl';
import { JiraProjectData, JiraIssueData, JiraComment } from '../model/structure';
// Main scraper using Jira REST API
// Scrapes 3 specific Apache projects with full pagination support

const TARGET_PROJECTS = ['KAFKA', 'SPARK', 'HADOOP'];


const MAX_ISSUES_PER_PROJECT = 100; // Limit for testing, set to null for all issues
const ENABLE_CHECKPOINTING = true;

export class JiraRestScraper {
  private client: JiraApiClient;
  private checkpointManager: CheckpointManager;
  private scrapedData: JiraProjectData[] = [];

  constructor() {
    this.client = new JiraApiClient();
    this.checkpointManager = new CheckpointManager();
  }

  // Main Scraping
  async scrape(resumeFromCheckpoint: boolean = true): Promise<JiraProjectData[]> {
    console.log('Starting Jira REST API Scraper\n');
    console.log(`Target Projects: ${TARGET_PROJECTS.join(', ')}`);
    console.log(`Max Issues per Project: ${MAX_ISSUES_PER_PROJECT || 'All'}\n`);

    // Show checkpoint status if resuming
    if (resumeFromCheckpoint && ENABLE_CHECKPOINTING) {
      this.checkpointManager.printStatus();
    } else if (ENABLE_CHECKPOINTING) {
      console.log('Starting fresh (clearing checkpoint)...\n');
      this.checkpointManager.clear();
    }

    let totalIssuesScraped = 0;
    let totalProjectsScraped = 0;

    // Scrape each target project
    for (const projectKey of TARGET_PROJECTS) {
      try {
        // Skip if already completed
        if (resumeFromCheckpoint && this.checkpointManager.isProjectCompleted(projectKey)) {
          console.log(`Project ${projectKey} already completed (skipping)\n`);
          continue;
        }

        console.log(`${'='.repeat(60)}`);
        console.log(`Processing Project: ${projectKey}`);
        console.log(`${'='.repeat(60)}\n`);

        const projectData = await this.scrapeProject(projectKey);
        
        if (projectData) {
          this.scrapedData.push(projectData);
          totalIssuesScraped += projectData.issues.length;
          totalProjectsScraped++;

          if (ENABLE_CHECKPOINTING) {
            this.checkpointManager.markProjectCompleted(projectKey);
          }

          console.log(`Completed ${projectKey}: ${projectData.issues.length} issues scraped`);
        } else {
          console.log(`Failed to scrape project ${projectKey}`);
        }

      } catch (error: any) {
        console.error(`Error scraping project ${projectKey}:`, error.message);
        
        // Don't stop on error, continue with next project
        continue;
      }
    }

    // Final summary
    console.log('\n' + '='.repeat(60));
    console.log('SCRAPING SUMMARY');
    console.log('='.repeat(60));
    console.log(`Projects scraped: ${totalProjectsScraped}/${TARGET_PROJECTS.length}`);
    console.log(`Total issues: ${totalIssuesScraped}`);
    console.log(`API requests made: ${this.client.getStats().requestCount}`);

    // Export to JSONL
    if (this.scrapedData.length > 0) {
      console.log('Exporting to JSONL format...');
      
      // Flatten data for LLM training (one issue per line)
      const flattenedData = this.flattenForLLMTraining(this.scrapedData);
      exportToJsonl(flattenedData);
      
      console.log(`Export complete!\n`);
    }

    return this.scrapedData;
  }

   // Scrape a single project
   
  private async scrapeProject(projectKey: string): Promise<JiraProjectData | null> {
    // Get project info
    console.log(`   Fetching project metadata...`);
    const projectInfo = await this.client.getProject(projectKey);
    
    if (!projectInfo) {
      console.warn(`    Could not fetch project info for ${projectKey}`);
      return null;
    }

    console.log(`  ✓ Project: ${projectInfo.name}`);
    console.log(`  ✓ Lead: ${projectInfo.lead.displayName}`);
    console.log(`  ✓ Type: ${projectInfo.projectTypeKey}\n`);

    // Initialize checkpoint
    if (ENABLE_CHECKPOINTING) {
      this.checkpointManager.initProject(projectKey);
    }

    // Get last processed index for resuming
    const lastIndex = ENABLE_CHECKPOINTING 
      ? this.checkpointManager.getLastIndex(projectKey)
      : -1;

    if (lastIndex >= 0) {
      console.log(`   Resuming from issue index ${lastIndex + 1}\n`);
    }

    // Fetch all issues
    const issues = await this.client.getAllIssues(projectKey, MAX_ISSUES_PER_PROJECT);
    
    if (issues.length === 0) {
      console.warn(`    No issues found for ${projectKey}`);
      return null;
    }

    // Filter issues if resuming
    const issuesToProcess = issues.slice(lastIndex + 1);
    console.log(`\n   Processing ${issuesToProcess.length} issues...\n`);

    // Transform issues
    const transformedIssues: JiraIssueData[] = [];
    
    for (let i = 0; i < issuesToProcess.length; i++) {
      const issue = issuesToProcess[i];
      const globalIndex = lastIndex + 1 + i;
      
      try {
        console.log(`    [${i + 1}/${issuesToProcess.length}] ${issue.key}: ${issue.fields.summary.substring(0, 60)}...`);
        
        const transformedIssue = this.transformIssue(issue);
        transformedIssues.push(transformedIssue);

        // Update checkpoint
        if (ENABLE_CHECKPOINTING && (i + 1) % 10 === 0) {
          this.checkpointManager.updateProgress(projectKey, issue.key, globalIndex);
        }

      } catch (error: any) {
        console.warn(`       Failed to transform issue ${issue.key}: ${error.message}`);
        continue;
      }
    }

    // Build project data structure
    const projectData: JiraProjectData = {
      title: projectInfo.name,
      key: projectKey,
      projectType: projectInfo.projectTypeKey,
      projectLead: projectInfo.lead.displayName,
      projectCategory: projectInfo.projectCategory?.name || 'N/A',
      projectUrl: `https://issues.apache.org/jira/projects/${projectKey}`,
      issues: transformedIssues,
    };

    return projectData;
  }

   // Transform raw Jira issue to our format

  private transformIssue(rawIssue: any): JiraIssueData {
    const fields = rawIssue.fields;

    // Extract comments
    const comments: JiraComment[] = (fields.comment?.comments || []).map((c: any) => ({
      id: c.id,
      author: c.author?.displayName || 'Unknown',
      body: this.cleanText(c.body),
      created: c.created,
      updated: c.updated,
    }));

    // Build issue data
    const issueData: JiraIssueData = {
      issueKey: rawIssue.key,
      projectKey: rawIssue.key.split('-')[0],
      summary: this.cleanText(fields.summary),
      description: this.cleanText(fields.description) || 'No description provided.',
      status: fields.status?.name || 'Unknown',
      priority: fields.priority?.name || 'Unknown',
      resolution: fields.resolution?.name || 'Unresolved',
      labels: fields.labels || [],
      assignee: fields.assignee?.displayName || 'Unassigned',
      reporter: fields.reporter?.displayName || 'Unknown',
      votes: fields.votes?.votes || 0,
      watchers: fields.watches?.watchCount || 0,
      created: fields.created,
      updated: fields.updated,
      comments,
      derivedTasks: [],
    };

    // Generate derived tasks for LLM training
    issueData.derivedTasks = TaskGenerator.generateTasks(issueData);

    return issueData;
  }


  private cleanText(text: string | null | undefined): string {
    if (!text) return '';
    
    return text
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/\s+/g, ' ')     // Normalize whitespace
      .trim();
  }

  private flattenForLLMTraining(projects: JiraProjectData[]): any[] {
    const flattened: any[] = [];

    for (const project of projects) {
      for (const issue of project.issues) {
        // Create a complete training example
        flattened.push({
          // Metadata
          project_key: project.key,
          project_name: project.title,
          issue_key: issue.issueKey,
          
          // Issue content
          summary: issue.summary,
          description: issue.description,
          status: issue.status,
          priority: issue.priority,
          resolution: issue.resolution,
          labels: issue.labels,
          assignee: issue.assignee,
          reporter: issue.reporter,
          votes: issue.votes,
          watchers: issue.watchers,
          created: issue.created,
          updated: issue.updated,
          
          // Comments
          comments: issue.comments,
          comment_count: issue.comments.length,
          
          // Derived tasks for training
          derived_tasks: issue.derivedTasks,
          
          // Conversation format (for chat models)
          conversations: TaskGenerator.generateConversationFormat(issue),
        });
      }
    }

    return flattened;
  }
}
