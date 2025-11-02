export function parseJiraDateTime(raw: string) {
  // Example: "04/Jul/22 06:49"
  // Output: { date: "2022-07-04", time: "06:49" }
  try {
    const [datePart, timePart] = raw.split(" ");
    const [day, monthStr, yearShort] = datePart.split("/");

    const months: Record<string, string> = {
      Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
      Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12"
    };

    const month = months[monthStr];
    const year = `20${yearShort}`; // "22" → "2022"

    const formattedDate = `${year}-${month}-${day}`;
    const formattedTime = timePart ?? "00:00";

    return {
      date: formattedDate,
      time: formattedTime
    };
  } catch {
    // In case of bad input
    return { date: "", time: "" };
  }
}