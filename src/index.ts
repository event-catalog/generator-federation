import utils from '@eventcatalog/sdk';
import chalk from 'chalk';
import { execSync } from 'node:child_process';
import path, { join } from 'node:path';
import fs from 'fs/promises';
import fsExtra from 'fs-extra';
import checkLicense from './utils/checkLicense';
import fm from 'front-matter';
import os from 'node:os';
// The event.catalog.js values for your plugin
type EventCatalogConfig = any;

// Configuration for copying files
type CopyProps = {
  content: string | string[];
  destination: string;
};

// Configuration the users give your catalog
type GeneratorProps = {
  source: string;
  branch?: string;
  copy: CopyProps[];
  debug?: boolean;
  override?: boolean;
  enforceUniqueResources?: boolean;
};

const log = console.log;

const resources = ['services', 'events', 'domains', 'commands', 'queries', 'flows'];
const tmpDir = path.join(os.tmpdir(), 'eventcatalog');

const getFrontmatter = async (filename: string) => {
  const frontmatter = (await fs.readFile(filename, 'utf8').then((file) => fm(file))) as any;
  return frontmatter.attributes;
};

async function checkForExistingPaths(contents: string | string[], destination: string, enforceUniqueResources: boolean) {
  // @ts-ignore
  const { getService, getEvent, getDomain, getCommand, getQuery, getFlow } = utils(process.env.PROJECT_DIR);

  const resourceFunctions = {
    services: getService,
    events: getEvent,
    domains: getDomain,
    commands: getCommand,
    queries: getQuery,
    flows: getFlow,
  };

  const paths = Array.isArray(contents) ? contents : [contents];

  for (const content of paths) {
    const sourcePath = join(tmpDir, content);

    // Get all files and directories recursively from source
    const items = await fsExtra.readdir(sourcePath, { withFileTypes: true });

    for (const item of items) {
      // If enforceUniqueResources, then check if the resource is already in the catalog
      // depending on the catalog size this could take a while
      if (item.name.endsWith('.md') && enforceUniqueResources) {
        const { id } = await getFrontmatter(join(sourcePath, item.name));

        if (!id) {
          continue;
        }

        const resource = resources.find((resource) => item.parentPath.includes(resource));

        console.log(chalk.yellow(`Checking if ${resource} with id ${id} exists in the catalog...`));

        if (id && resource) {
          // Type assertion to handle indexing
          const resourceFunction = resourceFunctions[resource as keyof typeof resourceFunctions];
          const resourceExists = await resourceFunction(id);

          // Found the resource in the catalog.
          if (resourceExists) {
            console.log(chalk.red(`Warning: EventCatalog already has a ${resource} with id ${id}.`));
            throw new Error(`EventCatalog already has ${resource} with the id ${id}.`);
          }
        }
      }

      const destPath = join(destination, item.name);

      if (await fsExtra.pathExists(destPath)) {
        console.warn(
          chalk.red(`Warning: EventCatalog already has resources at ${destPath}. Use 'override: true' to force copy.`)
        );
        throw new Error(`Path already exists at ${destPath}. Use 'override: true' to force copy.`);
      }

      // If it's a directory, recursively check its contents
      if (item.isDirectory()) {
        await checkForExistingPaths(join(content, item.name), join(destination, item.name), enforceUniqueResources);
      }
    }
  }
}

export default async (_: EventCatalogConfig, options: GeneratorProps) => {
  if (!process.env.PROJECT_DIR) {
    process.env.PROJECT_DIR = process.cwd();
  }

  if (!process.env.PROJECT_DIR) {
    throw new Error('Please provide catalog url (env variable PROJECT_DIR)');
  }

  // Remove the tmpDir if it exists
  if (fsExtra.existsSync(tmpDir)) {
    await fsExtra.remove(tmpDir);
    await fsExtra.mkdir(tmpDir, { recursive: true });
  }

  console.log(chalk.green(`Cloning ${options.source}...`));

  // Clone the repo without checking out the files
  await execSync(`git clone --no-checkout ${options.source} ${tmpDir}`);

  // Sparse checkout the content
  await execSync(`git sparse-checkout init`, { cwd: tmpDir });

  // Collect all content paths for sparse checkout
  const allContentPaths = options.copy.flatMap(({ content }) => (Array.isArray(content) ? content : [content]));
  await execSync(`git sparse-checkout set ${allContentPaths.join(' ')} --no-cone`, { cwd: tmpDir });

  // Checkout the branch
  await execSync(`git checkout ${options.branch || 'main'}`, { cwd: tmpDir });

  // Check for existing paths first and copy for each configuration
  for (const copyConfig of options.copy) {
    if (!options.override) {
      try {
        await checkForExistingPaths(copyConfig.content, copyConfig.destination, options.enforceUniqueResources || false);
      } catch (error) {
        throw error;
      }
    }

    // Copy files for each configuration
    if (Array.isArray(copyConfig.content)) {
      for (const content of copyConfig.content) {
        await fsExtra.copy(join(tmpDir, content), copyConfig.destination);
      }
    } else {
      await fsExtra.copy(join(tmpDir, copyConfig.content), copyConfig.destination);
    }

    console.log(chalk.cyan(` - Files successfully copied to ${copyConfig.destination}`));
  }

  // Remove the tmpDir
  await fs.rm(tmpDir, { recursive: true });

  await checkLicense();
};
