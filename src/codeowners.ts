let codeOwnersData: CodeOwnersFormat[];
let codeOwnersFilterText: string[] = [];
// The observer for the tabs Overview, Commits, Tabs etc...
let tabsObserver: MutationObserver;

// This is the wrapper for entire approvals section - we observe mutations under here.
const approvalsSectionClassName = "js-mr-approvals";
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

type CodeOwnersFormat = {
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

const getMatchingCodeOwnersForPattern = (
  entries: CodeOwnersFormat[],
  pattern: string
) => {
  const ownersForPattern = entries.find((x) => x.pattern === pattern);
  return ownersForPattern?.owners.join(", ");
};

const loadCodeOwners = async (
  codeOwnersFilterText: string[],
  branch: string | undefined | null,
  projectId: string
) => {
  const response = await fetch(
    `https://gitlab.com/api/v4/projects/${projectId}/repository/files/CODEOWNERS?ref=${
      branch ?? "master"
    }`
  );

  if (response.ok) {
    const { content: contentBase64 } = await response.json();
    const content = atob(contentBase64);

    const codeOwnersParsed = parseCodeOwners(content, codeOwnersFilterText);

    return codeOwnersParsed;
  }

  if (response.status == 401) {
    alert(
      "Hello. I'm the codeowners extension.\n\nIt looks like your gitlab session may have expired."
    );
  }
};

const approvalsSectionObserver = new MutationObserver(async (mutations) => {
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
          const parsedCodeOwnersFile = await loadCodeOwners(
            codeOwnersFilterText,
            branch,
            projectId!
          );

          if (parsedCodeOwnersFile) {
            codeOwnersData = parsedCodeOwnersFile;
          } else {
            // We failed to find the codeowners file so stop observing for any changes.
            approvalsSectionObserver.disconnect();
            tabsObserver.disconnect();
          }
        }

        // If there's no code owners file - then nothing to update
        if (codeOwnersData) {
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
                    codeOwnersData,
                    codeOwnersPathElement.innerText
                  ) || codeOwnersPathElement.innerText;
              }
            }
          });
        }
      }
    }
  } catch {}
});

// update UI when storage changes
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;

  if (changes.codeOwnersRemove) {
    codeOwnersFilterText = changes.codeOwnersRemove.newValue.split(",");
  }
});

const startObserving = async () => {
  const approvalSection = document.getElementsByClassName(
    approvalsSectionClassName
  )[0];

  codeOwnersFilterText =
    (await getValueFromStorage("codeOwnersRemove"))?.split(",") || [];

  approvalsSectionObserver.observe(approvalSection, {
    childList: true,
    subtree: true,
    attributeFilter: ["data-test-id"],
  });
};

if (branch && projectId) {
  try {
    // Let's wait until we have something we're interested in before observing - it's much more lightweight this way.
    const interval = setInterval(async () => {
      const approvalSection = document.getElementsByClassName(
        approvalsSectionClassName
      );

      if (!approvalSection.length) return;

      clearInterval(interval);

      // We can start observing given we're on the correct tab.
      approvalSection && startObserving();

      // Since there's no nice way to listen for change given they be via history or pop states - let's start observing the section (tabs) themselves
      // Listen in for when tab switches so we can start / stop observing as needed - no point trying to check for approvals when we're not in the right section.
      const mergeApprovalsSection = document.getElementById("notes");
      if (mergeApprovalsSection) {
        tabsObserver = new MutationObserver(
          ([{ target: approvalSectionNode }]) => {
            const styles = window.getComputedStyle(
              approvalSectionNode as HTMLElement
            );

            // Start observing if we're on the tab with approvals. Otherwise - we've gone elsewhere so stop until we're back again.
            if (styles.display == "block") {
              startObserving();
            } else {
              approvalsSectionObserver.disconnect();
            }
          }
        );
        tabsObserver.observe(mergeApprovalsSection, {
          attributes: true,
          attributeFilter: ["style"],
        });
      }
    }, 1000);
  } catch {}
}
