import { projectId } from './gitlab_dom_helper';

export type CodeOwnersFormat = {
  pattern: string;
  owners: string[];
};

type GitLabProtectedBranchesResponse = { name: string }[];
type GitLabCodeOwnersResponse = { content: string };

const parseCodeOwners = (content: string, codeOwnersFilterText: string[]) => {
  const entries: CodeOwnersFormat[] = [];
  const lines = content.split('\n');

  let ownersForSection: string[] = [];
  for (const line of lines) {
    // Ignore comments (can be an entire line or inlined after the file pattern definition)
    const [lineExcludingComment] = line.split('#');
    const lineTrimmed = lineExcludingComment?.trim();

    if (lineTrimmed === undefined || lineTrimmed === '') continue;

    // Check if the line is a section i.e does it have []
    const lastIndexOfCloseBracket = lineTrimmed.lastIndexOf(']');
    const isSection =
      lastIndexOfCloseBracket > 0 && lineTrimmed.lastIndexOf('[') > 0;

    // If we're a section - store the owners so we can set them on subsequent file patterns for that section.
    if (isSection) {
      ownersForSection = lineTrimmed
        .substring(lastIndexOfCloseBracket + 2) // +2 to ignore for extra space after ]
        .split(/\s+/);

      // We don't actually want to add the section to the entries so let's skip ahead.
      continue;
    }

    const [filePattern, ...ownersForFilePattern] = lineTrimmed.split(/\s+/);

    if (filePattern === undefined || filePattern === '') continue;

    entries.push({
      pattern: filePattern.startsWith('/')
        ? filePattern.substring(1)
        : filePattern,
      // Owners defined directly for a file pattern (even within a section) always supersede section owners.
      owners: (ownersForFilePattern.length
        ? ownersForFilePattern
        : ownersForSection
      )
        .map((codeOwner) => {
          let updatedValue = codeOwner;
          codeOwnersFilterText.forEach((removalText) => {
            updatedValue = updatedValue.replace(removalText, '');
          });
          return updatedValue;
        })
        .sort()
    });
  }

  // Reversed as last match in a codeowners file wins
  return entries.reverse();
};

export const getMatchingCodeOwnersForPattern = (
  entries: CodeOwnersFormat[],
  pattern: string
) => {
  let formattedPattern = pattern.startsWith('/')
    ? pattern.substring(1)
    : pattern;

  let ownersForPattern = entries.find((x) => x.pattern === formattedPattern);

  // Try and match wildcard entries
  if (ownersForPattern === undefined) {
    ownersForPattern = entries.find((x) => {
      let codeOwnerFilePattern = x.pattern.endsWith('*')
        ? x.pattern.slice(0, -1)
        : x.pattern;

      return codeOwnerFilePattern === pattern;
    });
  }

  return ownersForPattern?.owners.join(', ');
};

const getBranchName = async (): Promise<string | undefined> => {
  const response = await fetch(
    `https://gitlab.com/api/v4/projects/${projectId}/protected_branches?per_page=100`
  );
  if (response.ok) {
    const result = (await response.json()) as GitLabProtectedBranchesResponse;

    if (result.length === 1) {
      return result[0]?.name;
    } else {
      const filteredBranches = result.find((x) =>
        ['master', 'main', 'qa'].includes(x.name)
      );

      return filteredBranches?.name ?? result[0]?.name;
    }
  }
};

export const loadCodeOwners = async (codeOwnersFilterText: string[]) => {
  const branchName = await getBranchName();

  if (branchName) {
    const response = await fetch(
      `https://gitlab.com/api/v4/projects/${projectId}/repository/files/CODEOWNERS?ref=${branchName}`
    );

    if (!response.ok) return;

    const { content: contentBase64 } =
      (await response.json()) as GitLabCodeOwnersResponse;
    const content = atob(contentBase64);

    const codeOwnersParsed = parseCodeOwners(content, codeOwnersFilterText);

    return codeOwnersParsed;
  }
};
