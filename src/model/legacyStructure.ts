interface LegacyJiraIssueMetadata {
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

interface LegacyJiraIssueDates {
  createdDate: string;
  createdTime: string;
  updatedDate: string;
  updatedTime: string;
}

interface LegacyJiraProjectData {
  title: string;
  key: string;
  projectType: string;
  projectLead: string;
  projectCategory: string;
  projectUrl: string;
  metadata: LegacyJiraIssueMetadata;
  dates: LegacyJiraIssueDates;
}

export const LEGACY_JIRA_STRUCTURE: LegacyJiraProjectData[] = [];
