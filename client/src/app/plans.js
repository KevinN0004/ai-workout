const hasNotesHeading = (line) =>
  /^(coach\s*notes?|coach's\s*notes?|tips?|notes?)\b/i.test(line);

export const parsePlanSections = (result) => {
  if (!result) return { days: [], notes: [] };
  const rawLines = String(result)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const notesStart = rawLines.findIndex((line) => hasNotesHeading(line));

  let lines = rawLines;
  let notes = [];

  if (notesStart >= 0) {
    const headerLine = rawLines[notesStart];
    const strippedHeader = headerLine.replace(
      /^(coach\s*notes?|coach's\s*notes?|tips?|notes?)\s*[:\-]?\s*/i,
      ""
    );
    notes = [
      ...[strippedHeader].filter((line) => line),
      ...rawLines.slice(notesStart + 1)
    ];
    lines = rawLines.slice(0, notesStart);
  }

  const weekdayMap = [
    ["monday", "Monday"],
    ["tuesday", "Tuesday"],
    ["wednesday", "Wednesday"],
    ["thursday", "Thursday"],
    ["friday", "Friday"],
    ["saturday", "Saturday"],
    ["sunday", "Sunday"]
  ];
  const isWeekdayHeader = (line) =>
    weekdayMap.some(([key]) => line.toLowerCase().startsWith(key));

  const dayIndices = lines
    .map((line, index) => (isWeekdayHeader(line) ? index : -1))
    .filter((index) => index >= 0);

  const days = dayIndices.length
    ? dayIndices.map((start, index) => {
        const end = dayIndices[index + 1] ?? lines.length;
        const title = lines[start];
        const dayLines = lines.slice(start + 1, end);
        return { title, lines: dayLines };
      })
    : lines.length
    ? [{ title: "Your plan", lines }]
    : [];

  return { days, notes };
};

export const extractLatestPlanByWeekday = (dashboard) => {
  const plans = dashboard?.plans || [];
  if (!plans.length) return {};
  const source = plans[0]?.plan || "";
  const lines = String(source)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const notesStart = lines.findIndex((line) => hasNotesHeading(line));
  const planLines = notesStart >= 0 ? lines.slice(0, notesStart) : lines;
  const week = {};
  let current = null;
  planLines.forEach((line) => {
    const lower = line.toLowerCase();
    if (lower.startsWith("monday")) current = "Monday";
    else if (lower.startsWith("tuesday")) current = "Tuesday";
    else if (lower.startsWith("wednesday")) current = "Wednesday";
    else if (lower.startsWith("thursday")) current = "Thursday";
    else if (lower.startsWith("friday")) current = "Friday";
    else if (lower.startsWith("saturday")) current = "Saturday";
    else if (lower.startsWith("sunday")) current = "Sunday";
    else if (current) {
      if (!week[current]) week[current] = [];
      week[current].push(line);
    }
  });
  return week;
};
