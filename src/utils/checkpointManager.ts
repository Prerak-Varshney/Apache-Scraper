import * as fs from 'fs';
import * as path from 'path';

export interface CheckpointState {
  projectKey: string;
  lastIssueKey: string;
  lastIssueIndex: number;
  totalIssuesProcessed: number;
  timestamp: string;
  completed: boolean;
}

export interface ScraperCheckpoint {
  projects: {
    [projectKey: string]: CheckpointState;
  };
  startTime: string;
  lastUpdateTime: string;
}

export class CheckpointManager {
  private checkpointPath: string;
  private checkpoint: ScraperCheckpoint;

  constructor(checkpointDir: string = 'data/checkpoints') {
    if (!fs.existsSync(checkpointDir)) {
      fs.mkdirSync(checkpointDir, { recursive: true });
    }

    this.checkpointPath = path.join(checkpointDir, 'scraper_state.json');
    this.checkpoint = this.load();
  }

  private load(): ScraperCheckpoint {
    try {
      if (fs.existsSync(this.checkpointPath)) {
        const data = fs.readFileSync(this.checkpointPath, 'utf-8');
        const checkpoint = JSON.parse(data);
        console.log(`Loaded checkpoint from ${this.checkpointPath}`);
        return checkpoint;
      }
    } catch (error) {
      console.warn(`Failed to load checkpoint:`, error);
    }

    return {
      projects: {},
      startTime: new Date().toISOString(),
      lastUpdateTime: new Date().toISOString(),
    };
  }

  private save(): void {
    try {
      this.checkpoint.lastUpdateTime = new Date().toISOString();
      fs.writeFileSync(
        this.checkpointPath,
        JSON.stringify(this.checkpoint, null, 2),
        'utf-8'
      );
    } catch (error) {
      console.error(`Failed to save checkpoint:`, error);
    }
  }

  initProject(projectKey: string): void {
    if (!this.checkpoint.projects[projectKey]) {
      this.checkpoint.projects[projectKey] = {
        projectKey,
        lastIssueKey: '',
        lastIssueIndex: -1,
        totalIssuesProcessed: 0,
        timestamp: new Date().toISOString(),
        completed: false,
      };
      this.save();
    }
  }

  updateProgress(
    projectKey: string,
    issueKey: string,
    issueIndex: number
  ): void {
    if (!this.checkpoint.projects[projectKey]) {
      this.initProject(projectKey);
    }

    this.checkpoint.projects[projectKey].lastIssueKey = issueKey;
    this.checkpoint.projects[projectKey].lastIssueIndex = issueIndex;
    this.checkpoint.projects[projectKey].totalIssuesProcessed++;
    this.checkpoint.projects[projectKey].timestamp = new Date().toISOString();
    
    this.save();
  }

  markProjectCompleted(projectKey: string): void {
    if (this.checkpoint.projects[projectKey]) {
      this.checkpoint.projects[projectKey].completed = true;
      this.save();
      console.log(`Project ${projectKey} marked as completed`);
    }
  }

  getLastIndex(projectKey: string): number {
    return this.checkpoint.projects[projectKey]?.lastIssueIndex ?? -1;
  }

  isProjectCompleted(projectKey: string): boolean {
    return this.checkpoint.projects[projectKey]?.completed ?? false;
  }

  getProjectState(projectKey: string): CheckpointState | null {
    return this.checkpoint.projects[projectKey] || null;
  }

  getAllStates(): ScraperCheckpoint {
    return this.checkpoint;
  }

  clear(): void {
    this.checkpoint = {
      projects: {},
      startTime: new Date().toISOString(),
      lastUpdateTime: new Date().toISOString(),
    };
    this.save();
    console.log(`Checkpoint cleared`);
  }

  getSummary(): {
    totalProjects: number;
    completedProjects: number;
    totalIssuesProcessed: number;
    projects: Array<{ key: string; progress: number; completed: boolean }>;
  } {
    const projects = Object.values(this.checkpoint.projects);
    
    return {
      totalProjects: projects.length,
      completedProjects: projects.filter(p => p.completed).length,
      totalIssuesProcessed: projects.reduce((sum, p) => sum + p.totalIssuesProcessed, 0),
      projects: projects.map(p => ({
        key: p.projectKey,
        progress: p.totalIssuesProcessed,
        completed: p.completed,
      })),
    };
  }

  printStatus(): void {
    const summary = this.getSummary();
    
    console.log('\nCheckpoint Status:');
    console.log(`   Total Projects: ${summary.totalProjects}`);
    console.log(`   Completed: ${summary.completedProjects}/${summary.totalProjects}`);
    console.log(`   Total Issues Processed: ${summary.totalIssuesProcessed}`);
    
    if (summary.projects.length > 0) {
      console.log('\n   Project Progress:');
      summary.projects.forEach(p => {
        const status = p.completed ? '[DONE]' : '[IN PROGRESS]';
        console.log(`     ${status} ${p.key}: ${p.progress} issues`);
      });
    }
    console.log('');
  }
}
