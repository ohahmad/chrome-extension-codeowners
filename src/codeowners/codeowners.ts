import {
  CodeOwnersFormat,
  getMatchingCodeOwnersForPattern,
  loadCodeOwners,
} from "./codeowners_file_parser";
import {
  getApprovalRows,
  getApprovalRowHeaderElement,
  containsApprovalsFooterSection,
  projectId,
  getApprovalsContainer,
  getOverviewTab,
} from "./gitlab_dom_helper";
import { getValueFromStorage } from "./storage_helper";

type ApprovalSectionsByOwners = Record<
  string, // the owners string e.g "@company/dev, @company/test"
  {
    // The approval sections for the matched owners - one display per pattern
    approvalSections: HTMLElement[];
    // All the different patterns matching the owners e.g. [path/file1, path/subfolder]
    patterns: string[];
    // The element actually showing the first pattern match found
    patternElement: HTMLElement;
  }
>;

let codeOwnersData: CodeOwnersFormat[] | undefined;
let codeOwnersFilterText: string[] = [];
// The observer for the tabs Overview, Commits, Tabs etc...
let tabsObserver: MutationObserver | undefined;

// Group the patterns by the owners so we can remove duplicates later
// Gitlab UI displays each pattern separately even though they are owned by the same groups.
// e.g. file1 and file2 could both be owned by groups [devTeam, testTeam] but they have separate sections in the UI
// This allows us to group these back into section, simplifying the UI
const addUpdateApprovalSectionForOwners = (
  record: ApprovalSectionsByOwners,
  ownersForPattern: string,
  patternElement: HTMLElement,
  approvalSectionElement: HTMLElement
) => {
  if (record[ownersForPattern] === undefined) {
    record[ownersForPattern] = {
      approvalSections: [approvalSectionElement],
      patterns: [patternElement.innerText],
      patternElement: patternElement,
    };
  } else {
    record[ownersForPattern]?.approvalSections.push(approvalSectionElement);
    record[ownersForPattern]?.patterns.push(patternElement.innerText);
  }
};

// Hide any duplicate sections so the UI doesn't repeat itself per pattern like it currently does.
// Instead we will only display it once and set the title to all the matching patterns found in an MR
const hideDuplicateApprovalSections = (record: ApprovalSectionsByOwners) => {
  for (const key in record) {
    const paths = record[key]?.patterns.join("\n");
    const sectionsForOwner = record[key];
    if (paths && sectionsForOwner) {
      sectionsForOwner.patternElement.title = paths;
    }

    // Hide duplicates
    record[key]?.approvalSections.slice(1).forEach((approvalSection) => {
      approvalSection.style.display = "none";
    });
  }
};

const approvalsSectionObserver = new MutationObserver((mutations) => {
  void (async () => {
    try {
      for (const { addedNodes } of mutations) {
        for (const node of addedNodes) {
          // If we have an approvals section - fetch the codeowners file if we haven't done so already.
          if (containsApprovalsFooterSection(node) && !codeOwnersData) {
            const parsedCodeOwnersFile = await loadCodeOwners(
              codeOwnersFilterText,
              projectId ?? ""
            );

            if (parsedCodeOwnersFile) {
              codeOwnersData = parsedCodeOwnersFile;
            } else {
              // We failed to find the codeowners file so stop observing for any changes.
              approvalsSectionObserver.disconnect();
              tabsObserver?.disconnect();
            }
          }

          // If there's no code owners file - then nothing to update
          if (codeOwnersData) {
            const groupedApprovals: ApprovalSectionsByOwners = {};

            const approvalRows = getApprovalRows(node);

            if (!approvalRows) return;

            // Replace the shit gitlab UI with legible values for code owners.
            approvalRows.forEach((rule) => {
              const header = getApprovalRowHeaderElement(rule);

              if (header) {
                const pattern = header.nextElementSibling as HTMLElement;

                // Let's replace the pattern e.g. libs/ui/ with the actual owners e.g.
                const ownersForPattern =
                  getMatchingCodeOwnersForPattern(
                    codeOwnersData ?? [],
                    pattern.innerText
                  ) ?? pattern.innerText;

                addUpdateApprovalSectionForOwners(
                  groupedApprovals,
                  ownersForPattern,
                  pattern,
                  rule as HTMLElement
                );

                pattern.innerText = ownersForPattern;
              }
            });

            hideDuplicateApprovalSections(groupedApprovals);
          }
        }
      }
      // eslint-disable-next-line no-empty
    } catch {}
  })();
});

// update UI when storage changes
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;

  if (changes.codeOwnersRemove) {
    codeOwnersFilterText = (changes.codeOwnersRemove.newValue as string).split(
      ","
    );
  }
});

const startObservingApprovalsSection = async () => {
  codeOwnersFilterText =
    (await getValueFromStorage("codeOwnersRemove"))?.split(",") ?? [];

  approvalsSectionObserver.observe(getApprovalsContainer() as Node, {
    childList: true,
    subtree: true,
    attributeFilter: ["data-test-id"],
  });
};

if (projectId) {
  try {
    // Let's wait until we have something we're interested in before observing - it's much more lightweight this way.
    const interval = setInterval(() => {
      const approvalsContainer = getApprovalsContainer();

      if (approvalsContainer === undefined) return;

      clearInterval(interval);

      // We can start observing given we're on the correct tab.
      void startObservingApprovalsSection();

      // Since there's no nice way to listen for location changes given they can be via history or pop states - let's start observing the section (tabs) themselves
      // Listen in for when tab switches so we can start / stop observing as needed - no point trying to check for approvals when we're not in the right section.
      const overviewTab = getOverviewTab();
      if (overviewTab) {
        tabsObserver = new MutationObserver((mutations) => {
          const approvalSectionNode = mutations[0]?.target as HTMLElement;
          const styles = window.getComputedStyle(approvalSectionNode);

          // Start observing if we're on the tab with approvals. Otherwise - we've gone elsewhere so stop until we're back again.
          if (styles.display == "block") {
            void startObservingApprovalsSection();
          } else {
            approvalsSectionObserver.disconnect();
          }
        });
        tabsObserver.observe(overviewTab, {
          attributes: true,
          attributeFilter: ["style"],
        });
      }
    }, 1500);
  } catch {
    /* empty */
  }
}
