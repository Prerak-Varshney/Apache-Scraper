interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description: string | null;
    status: { name: string };
    priority: { name: string } | null;
    resolution: { name: string } | null;
    labels: string[];
    assignee: { displayName: string } | null;
    reporter: { displayName: string } | null;
    votes: { votes: number };
    watches: { watchCount: number };
    created: string;
    updated: string;
    comment?: {
      comments: Array<{
        id: string;
        author: { displayName: string };
        body: string;
        created: string;
        updated: string;
      }>;
      total: number;
    };
  };
}

interface JiraSearchResponse {
  issues: JiraIssue[];
  startAt: number;
  maxResults: number;
  total: number;
}

interface JiraProject {
  id: string;
  key: string;
  name: string;
  lead: { displayName: string };
  projectTypeKey: string;
  projectCategory?: { name: string };
}

export class JiraApiClient {
  private baseUrl: string;
  private requestCount: number = 0;
  private lastRequestTime: number = 0;
  private readonly minDelay: number = 1000; // Minimum 1 second between requests
  private readonly maxRetries: number = 3;

  constructor(baseUrl: string = "https://issues.apache.org/jira") {
    this.baseUrl = baseUrl;
  }

  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minDelay) {
      const delayNeeded = this.minDelay - timeSinceLastRequest;
      console.log(`  Rate limiting: waiting ${delayNeeded}ms`);
      await new Promise(resolve => setTimeout(resolve, delayNeeded));
    }
    
    this.lastRequestTime = Date.now();
    this.requestCount++;
  }

  private async fetchWithRetry(
    url: string,
    options: RequestInit = {},
    retryCount: number = 0
  ): Promise<Response> {
    await this.rateLimit();

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      // Handle rate limiting (429)
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, retryCount) * 1000;
        
        console.warn(`  Rate limit hit (429). Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        
        if (retryCount < this.maxRetries) {
          return this.fetchWithRetry(url, options, retryCount + 1);
        }
        throw new Error(`Rate limit exceeded after ${this.maxRetries} retries`);
      }

      if (response.status >= 500 && response.status < 600) {
        const waitTime = Math.pow(2, retryCount) * 1000;
        
        console.warn(`  Server error (${response.status}). Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        
        if (retryCount < this.maxRetries) {
          return this.fetchWithRetry(url, options, retryCount + 1);
        }
        throw new Error(`Server error ${response.status} after ${this.maxRetries} retries`);
      }

      if (response.status >= 400 && response.status < 500) {
        const errorText = await response.text();
        throw new Error(`Client error ${response.status}: ${errorText}`);
      }

      return response;
    } catch (error: any) {
      if (error.message.includes('fetch failed') || error.message.includes('network')) {
        const waitTime = Math.pow(2, retryCount) * 1000;
        console.warn(`  Network error. Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        
        if (retryCount < this.maxRetries) {
          return this.fetchWithRetry(url, options, retryCount + 1);
        }
      }
      throw error;
    }
  }

  async getProject(projectKey: string): Promise<JiraProject | null> {
    try {
      const url = `${this.baseUrl}/rest/api/2/project/${projectKey}`;
      const response = await this.fetchWithRetry(url);
      
      if (!response.ok) {
        return null;
      }

      return await response.json() as JiraProject;
    } catch (error) {
      console.error(`Failed to fetch project ${projectKey}:`, error);
      return null;
    }
  }

  async searchIssues(
    projectKey: string,
    startAt: number = 0,
    maxResults: number = 50
  ): Promise<JiraSearchResponse | null> {
    try {
      const jql = `project=${projectKey} ORDER BY created DESC`;
      const fields = [
        'summary',
        'description',
        'status',
        'priority',
        'resolution',
        'labels',
        'assignee',
        'reporter',
        'votes',
        'watches',
        'created',
        'updated',
        'comment'
      ].join(',');

      const params = new URLSearchParams({
        jql,
        startAt: startAt.toString(),
        maxResults: maxResults.toString(),
        fields,
        expand: 'renderedFields,names,schema,transitions,operations,editmeta,changelog'
      });

      const url = `${this.baseUrl}/rest/api/2/search?${params}`;
      const response = await this.fetchWithRetry(url);
      
      if (!response.ok) {
        console.warn(`  Failed to search issues for ${projectKey}: ${response.status}`);
        return null;
      }

      return await response.json() as JiraSearchResponse;
    } catch (error) {
      console.error(`Failed to search issues for ${projectKey}:`, error);
      return null;
    }
  }

  async getAllIssues(projectKey: string, limit: number | null = null): Promise<JiraIssue[]> {
    const allIssues: JiraIssue[] = [];
    let startAt = 0;
    const maxResults = 50;
    let hasMore = true;

    console.log(`  Fetching issues for project ${projectKey}...`);

    while (hasMore) {
      const response = await this.searchIssues(projectKey, startAt, maxResults);
      
      if (!response) {
        break;
      }

      allIssues.push(...response.issues);
      console.log(`    Fetched ${allIssues.length}/${response.total} issues`);

      if (limit && allIssues.length >= limit) {
        console.log(`    Reached limit of ${limit} issues`);
        return allIssues.slice(0, limit);
      }

      hasMore = startAt + maxResults < response.total;
      startAt += maxResults;

      if (startAt >= response.total) {
        hasMore = false;
      }
    }

    console.log(`  Total issues fetched: ${allIssues.length}`);
    return allIssues;
  }

  getStats() {
    return {
      requestCount: this.requestCount,
      averageDelay: this.minDelay,
    };
  }
}
