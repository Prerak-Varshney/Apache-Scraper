import playwright from "playwright";
import { Filters } from "../types/index";

async function browserConfig(
	url: string,
	guiEnabled = false,
	cb?: (page?: playwright.Page, filters?: Filters) => void,
) {
	for (const browserType of ["chromium"] as const) {
		const browser = await playwright[browserType].launch({
			headless: !guiEnabled,
			args: [
				'--disable-blink-features=AutomationControlled', // Avoid detection
				'--disable-dev-shm-usage', // Overcome limited resource problems
				'--no-sandbox', // Required for some environments
			]
		});
		const context = await browser.newContext({
			userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
		});
		const page = await context.newPage();
		
		// Set reasonable timeouts
		page.setDefaultTimeout(60000); 
		page.setDefaultNavigationTimeout(60000); 
		
		await page.goto(url, { 
			waitUntil: "domcontentloaded",
			timeout: 60000 
		});
		console.log(`${browserType} page title:`, await page.title());

        if(cb){
            try {
                await cb(page);
            } catch (error) {
                console.error("Error during scraping:", error);
            }
        }

		await browser.close();
	}
}

export { browserConfig };