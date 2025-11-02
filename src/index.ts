import { JiraRestScraper } from "./scrape/restScraper";

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║          Apache Jira REST API Scraper                      ║');
  console.log('║          LLM Training Data Pipeline                        ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const scraper = new JiraRestScraper();
  
  try {
    // Set to false to start fresh, true to resume from checkpoint
    const resumeFromCheckpoint = true;
    
    await scraper.scrape(resumeFromCheckpoint);
    
    console.log('✨ Scraping completed successfully!\n');
    process.exit(0);
    
  } catch (error: any) {
    console.error('\nFatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  console.log('Process interrupted by user');
  console.log('Progress has been saved to checkpoint');
  console.log('Run again to resume from last position\n');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Process terminated');
  console.log('Progress has been saved to checkpoint\n');
  process.exit(0);
});

main();