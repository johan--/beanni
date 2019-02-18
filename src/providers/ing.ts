import { BankDataProviderInterface, FassInstitutionRelationship, AccountBalance } from '../types';
import puppeteer = require('puppeteer');
import { FassExecutionContext } from '../core';

const providerName = 'ING';

export class Ing implements BankDataProviderInterface {
    async getBalances(relationship : FassInstitutionRelationship, executionContext : FassExecutionContext): Promise<Array<AccountBalance>> {
        const balances = new Array<AccountBalance>();
        const browser = await puppeteer.launch({
            headless: !executionContext.debug,
            slowMo: 100
        });
        const page = await browser.newPage();

        try
        {
            await this.login(page, executionContext, relationship);

            await page.waitForSelector('ing-page-block.ing-all-accounts-summary');
            if (executionContext.debug) { console.log('8'); }

            var accountSummaryRows = await page.$$('ing-page-block.ing-all-accounts-summary .uia-account-row');
            for (const row of accountSummaryRows) {
                balances.push({
                    institution: providerName,
                    accountName: await row.$eval('h3', (el:any) => el.textContent),
                    accountNumber: await row.$eval('.acc .uia-account-number', (el:any) => el.textContent.trim()),
                    balance: parseFloat(await row.$eval('.cb .uia-account-current-balance-desktop', (el:any) => el.textContent.trim().replace('$', '').replace(',', '')))
                });
            }
        }
        finally
        {
            await this.logout(page, executionContext);
            await browser.close();
        }

        return balances;
    }

    private async login(page: puppeteer.Page, executionContext: FassExecutionContext, relationship: FassInstitutionRelationship) {
        await page.goto("https://www.ing.com.au/securebanking/");
        await page.waitForSelector('#cifField');
        if (executionContext.debug) {
            console.log('1');
        }
        await page.type('#cifField', relationship.username);
        if (executionContext.debug) {
            console.log('2');
        }
        await page.keyboard.press('Tab');
        if (executionContext.debug) {
            console.log('3');
        }
        // Click the secret pixel that fires up the accessible login form
        await page.evaluate(() => {
            var button = <any>document.querySelector('.ing-login-input input[type="image"].accessibleText');
            if (button != null)
                button.click();
        });
        //await page.click('.ing-login-input input[type="image"].accessibleText');
        await page.waitForSelector('.ing-accessible-login input[alt="1"]');
        if (executionContext.debug) {
            console.log('4');
        }
        // Type the PIN digit-by-digit
        for (const digit of relationship.password) {
            await page.evaluate((d) => {
                var button = <any>document.querySelector('.ing-accessible-login input[alt="' + d + '"]');
                if (button != null)
                    button.click();
            }, digit);
            if (executionContext.debug) {
                console.log('5');
            }
        }
        if (executionContext.debug) {
            console.log('6');
        }
        await page.evaluate(() => {
            var button = <any>document.querySelector('.ing-accessible-login input[alt="Login"]');
            if (button != null)
                button.click();
        });
        if (executionContext.debug) {
            console.log('7');
        }
    }

    private async logout(page: puppeteer.Page, executionContext: FassExecutionContext) {
        await page.evaluate(() => {
            var button = <any>document.querySelector('button.uia-logout');
            if (button != null)
                button.click();
        });
        if (executionContext.debug) {
            console.log('10');
        }
        await page.waitForSelector('.login-button');
        if (executionContext.debug) {
            console.log('11');
        }
    }
}
