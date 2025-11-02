# Setup Verification & Quick Start

## Pre-flight Checklist

Before running the scraper, verify your setup:

```bash
# 1. Check Node.js version (should be v18+)
node --version

# 2. Verify TypeScript compilation
npx tsc --noEmit

# 3. Check project structure
ls -la src/{api,scrape,utils,model}
```

## Quick Start

### Option 1: Run with default settings (Recommended)
```bash
npm run scrape
```

This will:
- Scrape 3 projects: KAFKA, SPARK, HADOOP
- Fetch up to 100 issues per project
- Save progress with checkpointing
- Export to `data/jira_data_TIMESTAMP.jsonl`

### Option 2: Start fresh (ignore checkpoint)
Edit `src/index.ts`:
```typescript
const resumeFromCheckpoint = false; // Change to false
```

Then run:
```bash
npm run scrape
```

### Option 3: Modify configuration
Edit `src/scrape/restScraper.ts`:

```typescript
// Change target projects
const TARGET_PROJECTS = ['KAFKA', 'SPARK', 'HADOOP', 'CASSANDRA'];

// Change issue limit (null = unlimited)
const MAX_ISSUES_PER_PROJECT = 200; // or null for all

// Disable checkpointing
const ENABLE_CHECKPOINTING = false;
```

## Expected Output

### Console Output
```
============================================================
          Apache Jira REST API Scraper
          LLM Training Data Pipeline
============================================================

Starting Jira REST API Scraper

Target Projects: KAFKA, SPARK, HADOOP
Max Issues per Project: 100

============================================================
Processing Project: KAFKA
============================================================

  Fetching project metadata...
  Project: Apache Kafka
  Lead: Jun Rao
  Type: software

  Fetching issues for project KAFKA...
    Fetched 50/15420 issues
    Fetched 100/15420 issues
    Reached limit of 100 issues

  Processing 100 issues...

    [1/100] KAFKA-17654: Fix async offset commit bug...
    [2/100] KAFKA-17653: Improve consumer performance...
    ...

Completed KAFKA: 100 issues scraped

============================================================
SCRAPING SUMMARY
============================================================
Projects scraped: 3/3
Total issues: 300
API requests made: 42

Exporting to JSONL format...

Exported 300 records to: /path/to/data/jira_data_2025-11-02T12-34-56-789Z.jsonl
File size: 1856.42 KB

Export complete!

Scraping completed successfully!
```

### File Output
```
data/
├── jira_data_2025-11-02T12-34-56-789Z.jsonl    # Main output
└── checkpoints/
    └── scraper_state.json                       # Resume state
```

## Troubleshooting

### Issue: "fetch failed" or network errors
**Solution:** Check internet connection and retry. The scraper will automatically retry with exponential backoff.

### Issue: HTTP 429 (Rate Limit)
**Solution:** The scraper handles this automatically with the Retry-After header. Just wait.

### Issue: Process interrupted
**Solution:** Just run again! Checkpoint will resume from where it stopped.

### Issue: TypeScript compilation errors
**Solution:** 
```bash
npm install --save-dev typescript
npx tsc --noEmit
```

### Issue: Missing dependencies
**Solution:**
```bash
rm -rf node_modules package-lock.json
npm install
```

## Performance Expectations

| Metric | Value |
|--------|-------|
| Time per issue | ~0.2-0.5 seconds |
| 100 issues | ~30-60 seconds |
| 300 issues (3 projects) | ~2-5 minutes |
| Data size (300 issues) | ~2-3 MB |

## Testing

### Test with 1 project, 10 issues
```typescript
// In src/scrape/restScraper.ts
const TARGET_PROJECTS = ['KAFKA'];
const MAX_ISSUES_PER_PROJECT = 10;
```

### Verify output
```bash
# Count lines (should equal number of issues)
wc -l data/jira_data_*.jsonl

# Pretty print first issue
head -1 data/jira_data_*.jsonl | jq '.'

# Check for required fields
head -1 data/jira_data_*.jsonl | jq 'keys'
```

## Next Steps

1. **Load data in Python:**
   ```python
   from datasets import load_dataset
   dataset = load_dataset('json', data_files='data/jira_data_*.jsonl')
   ```

2. **Analyze data:**
   ```python
   import pandas as pd
   df = pd.read_json('data/jira_data_*.jsonl', lines=True)
   print(df.describe())
   ```

3. **Train model:**
   - Use `derived_tasks` field for instruction tuning
   - Use `conversations` field for chat model fine-tuning

## Support

If issues persist:
1. Check the [main README](../README.md)
2. Review error logs
3. Create an issue on GitHub with:
   - Error message
   - Console output
   - System info (OS, Node version)

Happy scraping!
