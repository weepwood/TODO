import {expect} from '@playwright/test';
export async function chooseOption(trigger,value){
 const page=trigger.page();
 await trigger.click();
 const menu=page.getByRole('listbox');
 await expect(menu).toBeVisible();
 const option=typeof value==='object'?menu.getByRole('option',{name:value.label,exact:true}):menu.getByRole('option').and(menu.locator('[data-option-value='+JSON.stringify(String(value))+']'));
 await option.click();
 await expect(menu).toHaveCount(0);
}
