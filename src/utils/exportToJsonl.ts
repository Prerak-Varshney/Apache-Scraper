import * as fs from "fs";
import * as path from "path";

export const exportToJsonl = (data: any[], outputPath?: string): string => {
  // Default output path: data/output_TIMESTAMP.jsonl
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const defaultPath = path.join(process.cwd(), "data", `jira_data_${timestamp}.jsonl`);
  const filePath = outputPath || defaultPath;

  // Ensure directory exists
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Convert each object to a JSON string and join with newlines
  const jsonlContent = data.map(item => JSON.stringify(item)).join("\n");

  // Write to file
  fs.writeFileSync(filePath, jsonlContent, "utf-8");

  console.log(`\n✅ Exported ${data.length} records to: ${filePath}`);
  console.log(`📊 File size: ${(fs.statSync(filePath).size / 1024).toFixed(2)} KB`);

  return filePath;
};

/**
 * Reads JSONL file and returns array of objects
 */
export const readJsonl = (filePath: string): any[] => {
  const content = fs.readFileSync(filePath, "utf-8");
  return content
    .split("\n")
    .filter(line => line.trim())
    .map(line => JSON.parse(line));
};
