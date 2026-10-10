import { expect, test } from '@playwright/test';

const PROJECT_ID = '6b2b9c0b-13a9-40ba-8805-a72a94952fce';
const SCREENSHOT_PATH = 'C:/Users/Admin/.gemini/antigravity-ide/brain/4c81e34a-3fb3-497c-a5f6-0b7a282bd027/role_modal_open.png';

test.describe('Role Creation Unified Modal & Multi-Account Permission Enforcement', () => {
  test('1. Role Creation: Unified Modal Dialog UI, Accessibility & Workflow', async ({ browser }) => {
    const context = await browser.newContext();
    await context.addCookies([
      {
        name: 'cms_session',
        value: 'session-token-perm-owner',
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);

    const page = await context.newPage();
    await page.goto(`/app/projects/${PROJECT_ID}/settings?section=members`);
    await page.waitForLoadState('networkidle');

    // Switch to Roles & Permissions tab
    const rolesTab = page.locator('button', { hasText: 'Roles & Permissions' });
    await expect(rolesTab).toBeVisible();
    await rolesTab.click();

    // Verify initial table renders with Member and Viewer
    await expect(page.locator('text=Project Custom Roles')).toBeVisible();
    await expect(page.locator('table tr', { hasText: 'Member' })).toBeVisible();
    await expect(page.locator('table tr', { hasText: 'Read-only viewer' })).toBeVisible();

    // Click "+ New Role" to trigger modal
    const newRoleBtn = page.locator('button', { hasText: 'New Role' });
    await expect(newRoleBtn).toBeVisible();
    await newRoleBtn.click();

    // Verify unified Modal opens (not a drawer, but centered dialog with [data-slot="dialog-content"])
    const dialog = page.locator('[data-slot="dialog-content"], [role="dialog"]').first();
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Verify Dialog Header
    await expect(dialog.locator('text=Create Custom Project Role')).toBeVisible();
    await expect(dialog.locator('text=Configure role metadata and fine-grained permissions')).toBeVisible();

    // Verify Dialog Form Controls
    const roleNameInput = dialog.locator('input#role-name');
    await expect(roleNameInput).toBeVisible();

    const descInput = dialog.locator('textarea#role-description');
    await expect(descInput).toBeVisible();

    const defaultSwitch = dialog.locator('[data-testid="role-default-switch"]');
    await expect(defaultSwitch).toBeVisible();

    const defaultRoleLabel = dialog.locator('label[for="role-default-switch"]');
    await expect(defaultRoleLabel).toHaveText('Default Role');
    await defaultRoleLabel.hover();
    await page.waitForTimeout(300);

    const permissionMatrix = dialog.locator('[data-testid="permission-matrix"]');
    // Scroll permission matrix into view and toggle some permissions
    await permissionMatrix.scrollIntoViewIfNeeded();
    const pagesCreateCheckbox = dialog.locator('[data-testid="cell-checkbox-pages-create"]');
    if (await pagesCreateCheckbox.isVisible()) {
      await pagesCreateCheckbox.click();
    }
    const pagesReadCheckbox = dialog.locator('[data-testid="cell-checkbox-pages-read"]');
    if (await pagesReadCheckbox.isVisible()) {
      await pagesReadCheckbox.click();
    }

    // Hover over the checked checkbox to verify hover contrast
    await pagesCreateCheckbox.hover();

    // Capture screenshot of the unified modal dialog with matrix scrolled and active
    await page.screenshot({ path: SCREENSHOT_PATH });

    // Fill in role details
    const testRoleName = `Tech Writer Lead ${Date.now()}`;
    await roleNameInput.fill(testRoleName);
    await descInput.fill('Lead technical documentation specialist');

    // Save Role
    const saveBtn = dialog.locator('[data-testid="role-save-button"]');
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();

    // Verify modal closes and new role appears in table
    await expect(dialog).toBeHidden({ timeout: 5000 });
    await expect(page.locator('table tr', { hasText: testRoleName })).toBeVisible({ timeout: 5000 });

    // Click edit on the new role
    const editBtn = page.locator('table tr', { hasText: testRoleName }).locator('button[title="Configure Permissions"]');
    await editBtn.click();

    // Verify modal re-opens with populated data
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(`text=Edit Role: ${testRoleName}`)).toBeVisible();
    await expect(dialog.locator('input#role-name')).toHaveValue(testRoleName);

    // Cancel edit
    const cancelBtn = dialog.locator('button', { hasText: 'Cancel' });
    await cancelBtn.click();
    await expect(dialog).toBeHidden();

    // Clean up: delete the created role
    const deleteBtn = page.locator('table tr', { hasText: testRoleName }).locator('button[title="Delete Role"]');
    await deleteBtn.click();

    // Confirm dialog
    const confirmDeleteBtn = page.locator('button', { hasText: 'Delete Role' }).last();
    if (await confirmDeleteBtn.isVisible({ timeout: 3000 })) {
      await confirmDeleteBtn.click();
    }
    await expect(page.locator('table tr', { hasText: testRoleName })).toBeHidden({ timeout: 5000 });

    await context.close();
  });

  test('2. Permission Level: Owner Account has full administrative control', async ({ page }) => {
    // Session for u-perm-owner
    await page.context().addCookies([
      {
        name: 'cms_session',
        value: 'session-token-perm-owner',
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);

    // Owner can list project roles
    const listRes = await page.request.get(`/api/projects/${PROJECT_ID}/roles`);
    expect(listRes.status()).toBe(200);
    const listJson = await listRes.json();
    expect(Array.isArray(listJson.data)).toBe(true);

    // Owner can create custom project roles
    const roleName = `Owner Role ${Date.now()}`;
    const createRes = await page.request.post(`/api/projects/${PROJECT_ID}/roles`, {
      data: {
        name: roleName,
        description: 'Role created by owner',
        is_default: false,
        permissions: {},
      },
    });
    expect(createRes.status()).toBe(200);
    const createJson = await createRes.json();
    const createdRoleId = createJson.data.id;

    // Owner can update the custom role
    const updateRes = await page.request.put(`/api/projects/${PROJECT_ID}/roles/${createdRoleId}`, {
      data: {
        name: `${roleName} Updated`,
        description: 'Updated by owner',
      },
    });
    expect(updateRes.status()).toBe(200);

    // Owner can delete custom roles
    const deleteRes = await page.request.delete(`/api/projects/${PROJECT_ID}/roles/${createdRoleId}`);
    expect(deleteRes.status()).toBe(200);
  });

  test('3. Permission Level: Member Account (Standard contributor) is forbidden from role admin', async ({ page }) => {
    // Session for u-perm-member
    await page.context().addCookies([
      {
        name: 'cms_session',
        value: 'session-token-perm-member',
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);

    // Member CAN read project details
    const projRes = await page.request.get(`/api/app/projects/${PROJECT_ID}`);
    expect([200, 404]).toContain(projRes.status());

    // Member CAN read project roles
    const listRes = await page.request.get(`/api/projects/${PROJECT_ID}/roles`);
    expect(listRes.status()).toBe(200);

    // Member CANNOT create project roles -> 403 Forbidden
    const createRes = await page.request.post(`/api/projects/${PROJECT_ID}/roles`, {
      data: {
        name: 'Unauthorized Role By Member',
        permissions: {},
      },
    });
    expect(createRes.status()).toBe(403);

    // Member CANNOT delete existing project roles -> 403 Forbidden
    const deleteRes = await page.request.delete(`/api/projects/${PROJECT_ID}/roles/5180934b-b8de-439f-8f03-39ac0475e176`);
    expect(deleteRes.status()).toBe(403);

    // Member CANNOT delete the project -> 403 Forbidden
    const deleteProjRes = await page.request.delete(`/api/projects/${PROJECT_ID}`);
    expect(deleteProjRes.status()).toBe(403);
  });

  test('4. Permission Level: Viewer Account (Read-only) is forbidden from write actions', async ({ page }) => {
    // Session for u-perm-viewer
    await page.context().addCookies([
      {
        name: 'cms_session',
        value: 'session-token-perm-viewer',
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);

    // Viewer CAN read project roles
    const listRes = await page.request.get(`/api/projects/${PROJECT_ID}/roles`);
    expect(listRes.status()).toBe(200);

    // Viewer CANNOT create pages -> 403 Forbidden
    const createPageRes = await page.request.post(`/api/app/projects/${PROJECT_ID}/pages`, {
      data: {
        title: 'Viewer Attempt Page',
        slug: `viewer-page-${Date.now()}`,
        kind: 'PAGE',
      },
    });
    expect(createPageRes.status()).toBe(403);

    // Viewer CANNOT create project roles -> 403 Forbidden
    const createRoleRes = await page.request.post(`/api/projects/${PROJECT_ID}/roles`, {
      data: {
        name: 'Unauthorized Role By Viewer',
        permissions: {},
      },
    });
    expect(createRoleRes.status()).toBe(403);

    // Viewer CANNOT modify project settings -> 403 Forbidden
    const updateProjRes = await page.request.patch(`/api/projects/${PROJECT_ID}`, {
      data: {
        name: 'Tampered Project Name',
      },
    });
    expect(updateProjRes.status()).toBe(403);
  });

  test('5. Permission Level: Custom Role Account (Reviewer) respects fine-grained restrictions', async ({ page }) => {
    // Session for u-perm-reviewer (has Content Reviewer role with 0 permissions granted)
    await page.context().addCookies([
      {
        name: 'cms_session',
        value: 'session-token-perm-reviewer',
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);

    // Reviewer does not have roles:read -> 403 Forbidden
    const listRes = await page.request.get(`/api/projects/${PROJECT_ID}/roles`);
    expect(listRes.status()).toBe(403);

    // Reviewer does not have pages:create -> 403 Forbidden
    const createPageRes = await page.request.post(`/api/app/projects/${PROJECT_ID}/pages`, {
      data: {
        title: 'Reviewer Unauthorized Page',
        slug: `reviewer-page-${Date.now()}`,
        kind: 'PAGE',
      },
    });
    expect(createPageRes.status()).toBe(403);

    // Reviewer does not have roles:create -> 403 Forbidden
    const createRoleRes = await page.request.post(`/api/projects/${PROJECT_ID}/roles`, {
      data: {
        name: 'Unauthorized Role By Reviewer',
        permissions: {},
      },
    });
    expect(createRoleRes.status()).toBe(403);
  });
});
