export interface JiraComment {
  id: string;
  author: string;
  body: string;
  created: string;
  updated: string;
}

export interface JiraIssueMetadata {
  type: string;
  status: string;
  priority: string;
  resolution: string;
  labels: string[];
  assignee: string;
  reporter: string;
  votes: number;
  watchers: number;
}

export interface JiraIssueDates {
  createdDate: string; // e.g. "2025-11-01"
  createdTime: string; // e.g. "14:32:55"
  updatedDate: string;
  updatedTime: string;
}

export interface DerivedTask {
  taskType: 'summarization' | 'classification' | 'qna' | 'extraction';
  instruction: string;
  input: string;
  output?: string;
}

export interface JiraIssueData {
  issueKey: string;
  projectKey: string;
  summary: string;
  description: string;
  status: string;
  priority: string;
  resolution: string;
  labels: string[];
  assignee: string;
  reporter: string;
  votes: number;
  watchers: number;
  created: string;
  updated: string;
  comments: JiraComment[];
  derivedTasks: DerivedTask[];
}

export interface JiraProjectData {
  title: string;
  key: string;
  projectType: string;
  projectLead: string;
  projectCategory: string;
  projectUrl: string;
  issues: JiraIssueData[];
}

export const JIRA_STRUCTURE: JiraProjectData[] = [];