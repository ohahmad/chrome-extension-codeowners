import { branch, projectId } from './gitlab_dom_helper';

export type CodeOwnersFormat = {
  pattern: string;
  owners: string[];
};

type GitLabBranchResponse = { name: string; default: boolean };
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

const fetchBranch = async (branchName: string) =>
  await fetch(
    `https://gitlab.com/api/v4/projects/${projectId}/repository/branches/${branchName}`
  );

export const loadCodeOwners = async (codeOwnersFilterText: string[]) => {
  let branchResponse = await fetchBranch(branch);

  if (!branchResponse.ok) {
    branchResponse = await fetchBranch('master');
  }

  if (!branchResponse.ok) {
    branchResponse = await fetchBranch('main');
  }

  if (!branchResponse.ok) {
    branchResponse = await fetchBranch('qa');
  }

  if (branchResponse.ok) {
    const result = (await branchResponse.json()) as GitLabBranchResponse;
    const branchName = result.name;

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
