export interface ParsedGitHubReference {
  repositoryFullName: string;
  issueNumber: number;
  issueUrl: string;
  referenceKind: "issue" | "pull";
}

export function parseGitHubIssueOrPullUrl(value: string): ParsedGitHubReference | null {
  try {
    const parsedUrl = new URL(value.trim());
    if (parsedUrl.hostname !== "github.com") {
      return null;
    }

    const [owner, repository, referenceType, referenceNumber] = parsedUrl.pathname
      .split("/")
      .filter(Boolean);
    const issueNumber = Number.parseInt(referenceNumber, 10);

    if (
      owner === undefined ||
      repository === undefined ||
      !["issues", "pull"].includes(referenceType) ||
      !Number.isInteger(issueNumber) ||
      issueNumber <= 0
    ) {
      return null;
    }

    return {
      repositoryFullName: `${owner}/${repository}`,
      issueNumber,
      issueUrl: parsedUrl.toString(),
      referenceKind: referenceType === "pull" ? "pull" : "issue"
    };
  } catch {
    return null;
  }
}

