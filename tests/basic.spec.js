const { test, expect } = require('@playwright/test');

test.describe('Yoga Pace basic flows', () => {
  test('loads the main controls', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Abrir ajustes' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Sesión/ })).toBeVisible();
  });

  test('can open settings, save values, and persist summary', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Abrir ajustes' }).click();
    await page.getByLabel('Duración total (minutos)').fill('12');
    await page.getByLabel('Intervalo de ejercicio (minutos)').fill('1');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await page.reload();
    await page.getByRole('button', { name: 'Sesión 00:00 Preparada' }).click();
    await expect(page.locator('#interval-time')).toHaveText('01:00');
    await expect(page.locator('#remaining-time')).toHaveText('12:00');
  });

  test('starts with a countdown and locks settings during an active session', async ({ page }) => {
    await page.goto('/');
    const settingsButton = page.getByRole('button', { name: 'Abrir ajustes' });
    await page.getByRole('button', { name: 'Play' }).click();
    await expect(page.locator('#countdown-overlay')).toBeVisible();
    await expect(settingsButton).toBeDisabled();
    await expect(page.locator('#countdown-value')).toHaveText('3');
    await expect(page.locator('#countdown-value')).toHaveText('1', { timeout: 3000 });
    await expect(page.locator('#countdown-overlay')).toBeHidden({ timeout: 2000 });
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
    await expect(settingsButton).toBeDisabled();
  });

  test('supports pause/resume/stop and unlocks settings after stop', async ({ page }) => {
    await page.goto('/');
    const settingsButton = page.getByRole('button', { name: 'Abrir ajustes' });
    await page.getByRole('button', { name: 'Play' }).click();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible({ timeout: 6000 });
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();
    await expect(settingsButton).toBeDisabled();
    await page.getByRole('button', { name: 'Resume' }).click();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
    await page.getByRole('button', { name: 'Stop' }).click();
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
    await expect(settingsButton).toBeEnabled();
  });

  test('enters focus mode after a short idle period during a session', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Play' }).click();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible({ timeout: 6000 });
    await page.waitForTimeout(3800);
    await expect(page.locator('#app')).toHaveClass(/focus-mode-active/);
  });
});
