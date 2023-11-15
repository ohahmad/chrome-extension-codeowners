export type CodeOwnersFormat = {
  pattern: string;
  owners: string[];
};

type GitLabBranchesResponse = { name: string; default: boolean }[];
type GitLabCodeOwnersResponse = { content: string };

const parseCodeOwners = (content: string, codeOwnersFilterText: string[]) => {
  const entries: CodeOwnersFormat[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const [content] = line.split('#');
    const trimmed = content?.trim();
    if (trimmed === undefined || trimmed === '') continue;

    // Ignore sections
    if (trimmed.length > 2 && trimmed.startsWith('[') && trimmed.endsWith(']'))
      continue;

    const [pattern, ...owners] = trimmed.split(/\s+/);

    if (pattern === undefined || pattern === '') continue;

    entries.push({
      pattern,
      owners: owners
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

  return entries.reverse();
};

export const getMatchingCodeOwnersForPattern = (
  entries: CodeOwnersFormat[],
  pattern: string
) => {
  const ownersForPattern = entries.find((x) => x.pattern === pattern);
  return ownersForPattern?.owners.join(', ');
};

export const loadCodeOwners = async (
  codeOwnersFilterText: string[],
  projectId: string
) => {
  const branches = await fetch(
    `https://gitlab.com/api/v4/projects/${projectId}/repository/branches`
  );

  if (branches.ok) {
    const result = (await branches.json()) as GitLabBranchesResponse;
    const defaultBranch = result.find((x) => x.default)?.name;

    if (!defaultBranch) return;

    const response = await fetch(
      `https://gitlab.com/api/v4/projects/${projectId}/repository/files/CODEOWNERS?ref=${defaultBranch}`
    );

    if (!response.ok) return;

    const { content: contentBase64 } =
      (await response.json()) as GitLabCodeOwnersResponse;
    const content = atob(contentBase64);

    const codeOwnersParsed = parseCodeOwners(content, codeOwnersFilterText);

    return codeOwnersParsed;
  }
};
