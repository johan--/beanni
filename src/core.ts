import { BankDataProviderInterface, FassInstitutionRelationship, AccountBalance, BankDataDocumentProviderInterface } from './types';
import fs = require('fs');
import yaml = require('js-yaml');
import { SecretStore } from './secretStore';
import { DataStore } from './dataStore';
import _ from 'lodash';

interface FassConfig
{
    relationships: Array<FassInstitutionRelationship>;
}

export interface FassExecutionContext
{
    debug: boolean;
}

const CONFIG_PATH = './config.yaml';

export class Core
{
    dataStore: DataStore;
    secretStore: SecretStore;

    constructor(dataStore: DataStore, secretStore: SecretStore) {
        this.dataStore = dataStore;
        this.secretStore = secretStore;
    }

    async loadConfig() : Promise<FassConfig> {
        const configFileText = fs.readFileSync(CONFIG_PATH, 'utf8');
        let config = <FassConfig>yaml.safeLoad(configFileText);

        config.relationships.forEach(r => {
            if (r.name == null) {
                r.name = r.provider;
            }
        });

        var duplicateRelationshipNames = _(config.relationships)
            .groupBy((r : FassInstitutionRelationship) => r.name)
            .pickBy(x => x.length > 1)
            .keys()
            .value();
        if (duplicateRelationshipNames.length > 0)
        {
            throw 'Duplicate relationships: ' + duplicateRelationshipNames.join(', ') + '\nTo re-use the same provider multiple times, add a name property as well';
        }

        return config;
    }

    async validateConfig() {
        let config = await this.loadConfig();
        console.log('Config appears valid:')
        console.log(JSON.stringify(config, null, 2));
    }

    async fetch(executionContext:FassExecutionContext) {
        const config = await this.loadConfig();
        console.log('%s relationships to fetch from', config.relationships.length)

        const balances = new Array<AccountBalance>();

        try
        {
            await this.dataStore.open();

            for (const relationship of config.relationships) {
                console.log('[%s] Fetching \'%s\'', relationship.provider, relationship.name);
                const providerName = relationship.provider;
                var module = require('./providers/' + providerName);
                var provider = <BankDataProviderInterface>new module[providerName](executionContext);

                try
                {
                    console.log('[%s] Logging in', relationship.provider);
                    await provider.login(async (key : string) => {
                        return await this.secretStore.retrieveSecret(relationship.name + ':' + key);
                    });

                    console.log('[%s] Getting balances', relationship.provider);
                    var relationshipBalances = await provider.getBalances();
                    console.log('[%s] Found %s balances', relationship.provider, relationshipBalances.length);
                    relationshipBalances.forEach(b => {
                        balances.push(b);
                        this.dataStore.addBalance(b);
                    });

                    if (this.isDocumentProvider(provider))
                    {
                        var documentProvider = provider as BankDataDocumentProviderInterface;
                        console.log('[%s] Getting documents', relationship.provider);
                        await documentProvider.getDocuments();
                    }
                    else
                    {
                        console.log('[%s] Doesn\'t support documents; skipping', relationship.provider);
                    }
                }
                catch (ex)
                {
                    debugger;
                    console.error(ex);
                }
                finally
                {
                    console.log('[%s] Logging out', relationship.provider);
                    await provider.logout();
                }
            }

            console.log('Written %s balance entries to the data store', balances.length);
        }
        finally
        {
            await this.dataStore.close();
        }
    }

    isDocumentProvider (provider: BankDataProviderInterface | BankDataDocumentProviderInterface): provider is BankDataDocumentProviderInterface {
        return (<BankDataDocumentProviderInterface>provider).getDocuments !== undefined;
    }

    async init(executionContext:FassExecutionContext) {
        try
        {
            await fs.promises.access(CONFIG_PATH, fs.constants.F_OK);
            console.error('There\'s already a config.yaml file on disk; leaving it as-is');
        }
        catch
        {
            await fs.promises.copyFile(
                __dirname + '/../src/example-config.yaml',
                CONFIG_PATH,
                fs.constants.COPYFILE_EXCL
            );
            console.log('Created config.yaml')
        }
    }
}
