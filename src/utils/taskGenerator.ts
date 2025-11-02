import { DerivedTask, JiraIssueData } from '../model/structure';

export class TaskGenerator {
  static generateTasks(issue: JiraIssueData): DerivedTask[] {
    const tasks: DerivedTask[] = [];

    if (issue.description) {
      tasks.push(this.generateSummarizationTask(issue));
    }

    tasks.push(...this.generateClassificationTasks(issue));
    tasks.push(...this.generateQnAPairs(issue));
    tasks.push(...this.generateExtractionTasks(issue));

    if (issue.comments.length > 0) {
      tasks.push(...this.generateCommentTasks(issue));
    }

    return tasks;
  }

  private static generateSummarizationTask(issue: JiraIssueData): DerivedTask {
    const input = `Issue: ${issue.summary}\n\nDescription:\n${issue.description}`;
    
    return {
      taskType: 'summarization',
      instruction: 'Summarize the following Jira issue in 2-3 sentences.',
      input,
      output: issue.summary,
    };
  }

  private static generateClassificationTasks(issue: JiraIssueData): DerivedTask[] {
    const tasks: DerivedTask[] = [];

    tasks.push({
      taskType: 'classification',
      instruction: 'Classify the priority of this issue (Critical, Major, Minor, Trivial, or Blocker).',
      input: `Issue: ${issue.summary}\nDescription: ${issue.description || 'N/A'}`,
      output: issue.priority,
    });

    tasks.push({
      taskType: 'classification',
      instruction: 'Classify the current status of this issue.',
      input: `Issue: ${issue.summary}\nDescription: ${issue.description || 'N/A'}`,
      output: issue.status,
    });

    if (issue.resolution && issue.resolution !== 'Unresolved') {
      tasks.push({
        taskType: 'classification',
        instruction: 'Classify how this issue was resolved.',
        input: `Issue: ${issue.summary}\nDescription: ${issue.description || 'N/A'}`,
        output: issue.resolution,
      });
    }

    return tasks;
  }

  private static generateQnAPairs(issue: JiraIssueData): DerivedTask[] {
    const tasks: DerivedTask[] = [];
    const context = `Issue Key: ${issue.issueKey}\nProject: ${issue.projectKey}\nSummary: ${issue.summary}\nDescription: ${issue.description || 'N/A'}`;

    tasks.push({
      taskType: 'qna',
      instruction: 'Answer the following question based on the Jira issue.',
      input: `Context:\n${context}\n\nQuestion: What is this issue about?`,
      output: issue.summary,
    });

    tasks.push({
      taskType: 'qna',
      instruction: 'Answer the following question based on the Jira issue.',
      input: `Context:\n${context}\n\nQuestion: Who reported this issue?`,
      output: issue.reporter,
    });

    tasks.push({
      taskType: 'qna',
      instruction: 'Answer the following question based on the Jira issue.',
      input: `Context:\n${context}\n\nQuestion: What is the current status of this issue?`,
      output: issue.status,
    });

    tasks.push({
      taskType: 'qna',
      instruction: 'Answer the following question based on the Jira issue.',
      input: `Context:\n${context}\n\nQuestion: Who is assigned to work on this issue?`,
      output: issue.assignee || 'Unassigned',
    });

    tasks.push({
      taskType: 'qna',
      instruction: 'Answer the following question based on the Jira issue.',
      input: `Context:\n${context}\n\nQuestion: What is the priority level of this issue?`,
      output: issue.priority,
    });

    return tasks;
  }

  /**
   * Generate information extraction tasks
   */
  private static generateExtractionTasks(issue: JiraIssueData): DerivedTask[] {
    const tasks: DerivedTask[] = [];

    // Extract labels
    if (issue.labels.length > 0) {
      tasks.push({
        taskType: 'extraction',
        instruction: 'Extract all labels/tags associated with this issue.',
        input: `Issue: ${issue.summary}\nDescription: ${issue.description || 'N/A'}`,
        output: issue.labels.join(', '),
      });
    }

    // Extract key information
    tasks.push({
      taskType: 'extraction',
      instruction: 'Extract the key information from this issue: project, reporter, assignee, and priority.',
        input: `Issue: ${issue.summary}\nDescription: ${issue.description || 'N/A'}`,
      output: JSON.stringify({
        project: issue.projectKey,
        reporter: issue.reporter,
        assignee: issue.assignee,
        priority: issue.priority,
      }),
    });

    return tasks;
  }

  /**
   * Generate comment analysis tasks
   */
  private static generateCommentTasks(issue: JiraIssueData): DerivedTask[] {
    const tasks: DerivedTask[] = [];

    // Summarize discussion
    const discussionText = issue.comments
      .map(c => `${c.author}: ${c.body}`)
      .join('\n\n');

    tasks.push({
      taskType: 'summarization',
      instruction: 'Summarize the discussion in the comments section.',
      input: `Issue: ${issue.summary}\n\nComments:\n${discussionText}`,
    });

    // Count participants
    const uniqueAuthors = new Set(issue.comments.map(c => c.author));
    tasks.push({
      taskType: 'qna',
      instruction: 'Answer the following question based on the Jira issue comments.',
      input: `Issue: ${issue.issueKey}\nComments: ${issue.comments.length} total\n\nQuestion: How many unique people participated in the discussion?`,
      output: uniqueAuthors.size.toString(),
    });

    return tasks;
  }

  /**
   * Generate conversation-style training data
   */
  static generateConversationFormat(issue: JiraIssueData): any[] {
    const conversations = [];

    // Format: User asks about issue, Assistant provides info
    conversations.push({
      messages: [
        {
          role: 'user',
          content: `Tell me about Jira issue ${issue.issueKey}`,
        },
        {
          role: 'assistant',
          content: `${issue.summary}\n\nStatus: ${issue.status}\nPriority: ${issue.priority}\nAssignee: ${issue.assignee}\n\n${issue.description || 'No description provided.'}`,
        },
      ],
    });

    // Format: User asks about status
    conversations.push({
      messages: [
        {
          role: 'user',
          content: `What's the status of ${issue.issueKey}?`,
        },
        {
          role: 'assistant',
          content: `The issue "${issue.summary}" is currently ${issue.status}. ${issue.resolution && issue.resolution !== 'Unresolved' ? `It was resolved as: ${issue.resolution}.` : ''}`,
        },
      ],
    });

    return conversations;
  }
}
