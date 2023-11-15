// This is the wrapper for entire approvals section - we observe mutations under here.
const approvalsSectionClassName = 'js-mr-approvals';
// This is the first element to render in gitlab when expanding the approvals section in an MR
const approvalsFooterTestId = 'approvals-footer';
// Gitlab render these - one per code owner
const approvalRowsTestId = 'approval-rules-row';
// The selector for the literal 'Code Owners' text - one per code owner
const codeOwnersTitleTestId = 'rule-section';

export const projectId = document.body.getAttribute('data-project-id');

// We don't care about anything which isn't a HTML element.
// Everything we need to scrape is either a div (approvalsFooterTestId) or inside a table - approvalRowsTestId
const isWorthScraping = (node: Node) =>
  node instanceof HTMLElement &&
  (node.nodeName === 'DIV' || node.nodeName === 'TBODY');

export const getApprovalsContainer = () =>
  document.getElementsByClassName(approvalsSectionClassName)[0];

export const containsApprovalsFooterSection = (node: Node) =>
  isWorthScraping(node) &&
  (node as HTMLElement).getAttribute('data-testid') === approvalsFooterTestId;

// Let's get all the rows which contain a code owner section
export const getApprovalRows = (node: Node) =>
  isWorthScraping(node) &&
  (node as HTMLElement).querySelectorAll(`[data-testid=${approvalRowsTestId}]`);

// Grab the element which contains the approval row header text.
// The immediate sibling has the actual pattern e.g. 'libs/ui/' - sadly the pattern element itself
// has no identifiable selector in the DOM.
export const getApprovalRowHeaderElement = (approvalRow: Node) =>
  (approvalRow as HTMLElement).querySelector(
    `[data-testid=${codeOwnersTitleTestId}]`
  );

export const getOverviewTab = () => document.getElementById('notes');
