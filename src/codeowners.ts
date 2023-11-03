type CodeOwnersFormat = {
  pattern: string;
  owners: Array<string>;
};

let codeOwnersData: CodeOwnersFormat[];
let codeOwnersTextRemove: string[] = [];

// This is the first element to render in gitlab when expanding the approvals section in an MR
const approvalsFooterTestId = "approvals-footer";
// Gitlab render these - one per code owner
const approvalRowsTestId = "approval-rules-row";
// The selector for the literal 'Code Owners' text - one per code owner
const codeOwnersTitleTestId = "rule-section";

let projectId = document.body.getAttribute("data-project-id");

// Let's use the branch for which the MR relates too. I tried master but we also have qa branches as defaults.
let branch = document
  .querySelector(".js-source-branch-copy")
  ?.getAttribute("data-clipboard-text");

const getValueFromStorage = async (key: string): Promise<string> => {
  return new Promise(function (resolve, reject) {
    chrome.storage.local.get(key, function (items) {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError.message);
      } else {
        resolve(items[key] as string);
      }
    });
  });
};

const parseCodeOwners = (content: string) => {
  let entries: CodeOwnersFormat[] = [];
  let lines = content.split("\n");

  for (let line of lines) {
    let [content, comment] = line.split("#");
    let trimmed = content.trim();
    if (trimmed === "") continue;
    let [pattern, ...owners] = trimmed.split(/\s+/);
    entries.push({
      pattern,
      owners: owners.map((codeOwner) => {
        let updatedValue = codeOwner;
        codeOwnersTextRemove.forEach((removalText) => {
          updatedValue = updatedValue.replace(removalText, "");
        });
        return updatedValue;
      }),
    });
  }

  return entries.reverse();
};

const getMatchingCodeOwnersForPattern = (pattern: string) => {
  const ownersForPattern = codeOwnersData.find((x) => x.pattern === pattern);
  return ownersForPattern?.owners.join(", ");
};

const loadCodeOwners = async () => {
  const response = await fetch(
    `https://gitlab.com/api/v4/projects/${projectId}/repository/files/CODEOWNERS?ref=${
      branch ?? "master"
    }`
  );

  if (response.ok) {
    const { content: contentBase64 } = await response.json();
    const content = atob(contentBase64);

    const codeOwnersParsed = parseCodeOwners(content);

    return codeOwnersParsed;
  }

  if (response.status == 401) {
    alert(
      "Hello. I'm the codeowners extension.\n\nIt looks like your gitlab session may have expired."
    );
  }
};

const observer = new MutationObserver(async (mutations) => {
  try {
    for (const { addedNodes } of mutations) {
      for (const node of addedNodes) {
        // We don't care about anything which isn't a HTML element.
        if (!(node instanceof HTMLElement)) continue;

        // Everything we need to scrape is either a div (approvalsFooterTestId) or inside a table - approvalRowsTestId
        if (!(node.nodeName === "DIV" || node.nodeName === "TBODY")) continue;

        // If we have an approvals section - fetch the codeowners file if we haven't done so already.
        if (
          node.getAttribute("data-testid") === approvalsFooterTestId &&
          !codeOwnersData
        ) {
          const parsedCodeOwnersFile = await loadCodeOwners();

          if (parsedCodeOwnersFile) {
            codeOwnersData = parsedCodeOwnersFile;
          } else {
            // We failed to find the codeowners file so stop observing for any changes.
            observer.disconnect();
          }
        }

        // Let's get all the rows which contain a code owner section
        const approvalRulesElements = node.querySelectorAll(
          `[data-testid=${approvalRowsTestId}]`
        );

        // Replace the shit gitlab UI with legible values for code owners.
        approvalRulesElements.forEach((rule) => {
          // Grab the element which contains the literal 'Code Owners' text.
          // The immediate sibling has the actual pattern e.g. 'libs/ui/' - sadly the pattern element itself
          // has no identifiable selector in the DOM.
          const codeOwnersTitleElement = rule.querySelector(
            `[data-testid=${codeOwnersTitleTestId}]`
          );

          if (codeOwnersTitleElement) {
            const codeOwnersPathElement =
              codeOwnersTitleElement.nextElementSibling as HTMLElement;

            // Let's replace the pattern e.g. libs/ui/ with the actual owners e.g.
            if (codeOwnersPathElement) {
              codeOwnersPathElement.innerText =
                getMatchingCodeOwnersForPattern(
                  codeOwnersPathElement.innerText
                ) || codeOwnersPathElement.innerText;
            }
          }
        });
      }
    }
  } catch {}
});

// update UI when storage changes
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;

  if (changes.codeOwnersRemove) {
    codeOwnersTextRemove = changes.codeOwnersRemove.newValue.split(",");
  }
});

if (branch && projectId) {
  try {
    const startObserving = async () => {
      codeOwnersTextRemove =
        (await getValueFromStorage("codeOwnersRemove"))?.split(",") || [];

      observer.observe(document, {
        childList: true,
        subtree: true,
      });
    };

    startObserving();
  } catch {}
}
