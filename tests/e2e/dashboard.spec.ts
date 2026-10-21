import { expect, test } from '@playwright/test';

test('browses stored jobs with clear sample labels and captures the dashboard', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Opportunity radar', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '3 opportunities', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View Senior Backend Engineer - Platform at Northstar Fictional Systems', exact: true })).toBeVisible();
  await expect(page.getByLabel('Workspace totals')).toContainText('Stored postings');
  await page.screenshot({ path: `test-results/career-radar-${testInfo.project.name}.png`, fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
  expect(errors).toEqual([]);
});

test('searches titles, clears filters, and paginates a stable fixture set', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Job title', exact: true }).fill('Distributed');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('heading', { name: '1 opportunity', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View Distributed Systems Engineer at Northstar Fictional Systems', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Clear filters', exact: true }).click();
  await expect(page.getByRole('heading', { name: '3 opportunities', exact: true })).toBeVisible();
  await page.goto('/?limit=2');
  await expect(page.getByLabel('Pagination')).toContainText('Page 1 of 2');
  await page.getByRole('link', { name: 'Next page', exact: true }).click();
  await expect(page.getByLabel('Pagination')).toContainText('Page 2 of 2');
  await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeDisabled();
});

test('opens explicit evidence, preserved history and safe original links', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'View Senior Backend Engineer - Platform at Northstar Fictional Systems', exact: true }).click();
  await expect(page.getByLabel('Posting details').getByRole('heading', { name: 'Senior Backend Engineer - Platform', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Evidence', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Evidence', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel')).toContainText('This role may be performed remotely from India.');
  await expect(page.getByRole('tabpanel')).toContainText('Work authorization, sponsorship');
  await page.getByRole('tab', { name: 'History 2', exact: true }).click();
  await expect(page.getByRole('tabpanel')).toContainText('Version 2');
  await expect(page.getByRole('tabpanel')).toContainText('Version 1');
  await expect(page.getByRole('link', { name: 'View original posting', exact: true })).toHaveAttribute('href', 'https://jobs.example.com/northstar/backend-001');
  await expect(page.getByRole('link', { name: 'View original posting', exact: true })).toHaveAttribute('rel', 'noopener noreferrer');
});

test('shows empty results, invalid filters and unrun source state honestly', async ({ page }) => {
  await page.goto('/?title=NoSuchRoleAnywhere');
  await expect(page.getByRole('heading', { name: 'No matches in this part of the radar', exact: true })).toBeVisible();
  await page.goto('/?page=0');
  await expect(page.getByRole('heading', { name: 'These filters couldn’t be read', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Reset filters', exact: true }).click();
  await page.getByRole('link', { name: 'Sources', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your sources', exact: true })).toBeVisible();
  await expect(page.getByLabel('Configured sources')).toContainText('Partial collection');
  await expect(page.getByLabel('Configured sources')).toContainText('Waiting Fictional Source');
  await expect(page.getByLabel('Configured sources')).toContainText('Not run yet');
});
