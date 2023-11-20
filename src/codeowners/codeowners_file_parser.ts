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
