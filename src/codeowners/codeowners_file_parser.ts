export type CodeOwnersFormat = {
  pattern: string;
  owners: Array<string>;
};

const parseCodeOwners = (content: string, codeOwnersFilterText: string[]) => {
  let entries: CodeOwnersFormat[] = [];
  let lines = content.split("\n");

  for (let line of lines) {
    let [content] = line.split("#");
    let trimmed = content.trim();
    if (trimmed === "") continue;
    // Ignore sections
    if (
      trimmed.length > 2 &&
      trimmed[0] == "[" &&
      trimmed[trimmed.length - 1] == "]"
    )
      continue;

    let [pattern, ...owners] = trimmed.split(/\s+/);
    entries.push({
      pattern,
      owners: owners.map((codeOwner) => {
        let updatedValue = codeOwner;
        codeOwnersFilterText.forEach((removalText) => {
          updatedValue = updatedValue.replace(removalText, "");
        });
        return updatedValue;
      }),
    });
  }

  return entries.reverse();
};

export const getMatchingCodeOwnersForPattern = (
  entries: CodeOwnersFormat[],
  pattern: string
) => {
  const ownersForPattern = entries.find((x) => x.pattern === pattern);
  return ownersForPattern?.owners.join(", ");
};

export const loadCodeOwners = async (
  codeOwnersFilterText: string[],
  projectId: string
) => {
  const branches = await fetch(
    `https://gitlab.com/api/v4/projects/${projectId}/repository/branches`
  );

  if (branches.ok) {
    const result: { name: string; default: boolean }[] = await branches.json();
    const defaultBranch = result.find((x) => x.default)?.name;

    if (!defaultBranch) return;

    const response = await fetch(
      `https://gitlab.com/api/v4/projects/${projectId}/repository/files/CODEOWNERS?ref=${defaultBranch}`
    );

    if (!response.ok) return;

    const { content: contentBase64 } = await response.json();
    const content = atob(contentBase64);

    const codeOwnersParsed = parseCodeOwners(content, codeOwnersFilterText);

    return codeOwnersParsed;
  }
};
