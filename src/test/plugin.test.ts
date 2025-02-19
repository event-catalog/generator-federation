import { expect, it, describe, beforeEach, afterEach, vi } from 'vitest';
import utils from '@eventcatalog/sdk';
import plugin from '../index';
import path, { join } from 'node:path';
import fs from 'fs/promises';
import fsExtra from 'fs-extra';
// Fake eventcatalog config
const eventCatalogConfig = {
  title: 'My EventCatalog',
};

let catalogDir: string;

// Add mock for the local checkLicense module
vi.mock('../utils/checkLicense', () => ({
  default: () => Promise.resolve(),
}));

describe('generator-federation', () => {
  beforeEach(async () => {
    catalogDir = join(__dirname, 'catalog') || '';
    process.env.PROJECT_DIR = catalogDir;
    if (fsExtra.existsSync(catalogDir)) {
      await fsExtra.remove(catalogDir);
    }
  });

  // afterEach(async () => {
  //   // const exists = await fs.access(join(catalogDir)).then(() => true).catch(() => false);
  //   // if(exists) {
  //   //   await fs.rm(join(catalogDir), { recursive: true });
  //   // }
  // });

  it('clones the source directory and copies the files specified in the content to the destination directory', async () => {
    await plugin(eventCatalogConfig, {
      source: 'https://github.com/event-catalog/eventcatalog.git',
      copy: [
        {
          content: 'examples/default/domains/Orders/services',
          destination: path.join(catalogDir, 'services'),
        },
      ],
    });

    const services = await fs.readdir(path.join(catalogDir, 'services'));
    expect(services).toHaveLength(3);
  });

  it('clones the source directory and copies the files specified in the content array to the destination directory', async () => {
    await plugin(eventCatalogConfig, {
      source: 'https://github.com/event-catalog/eventcatalog.git',
      copy: [
        {
          content: ['examples/default/domains/Orders/services', 'examples/default/domains/Payment/services'],
          destination: path.join(catalogDir, 'services'),
        },
      ],
    });

    const services = await fs.readdir(path.join(catalogDir, 'services'));
    expect(services).toHaveLength(4);
  });

  describe('branch', () => {
    it('clones the source directory (with the given branch) and copies the files specified in the content array to the destination directory', async () => {
      await plugin(eventCatalogConfig, {
        source: 'https://github.com/event-catalog/eventcatalog.git',
        copy: [
          {
            content: ['examples/basic/services'],
            destination: path.join(catalogDir, 'services'),
          },
        ],
        branch: 'v1',
      });

      const services = await fs.readdir(path.join(catalogDir, 'services'));
      expect(services).toHaveLength(2);
    });
  });

  describe('override', () => {
    it('overrides the content if the destination directory already exists and override is true', async () => {
      await plugin(eventCatalogConfig, {
        source: 'https://github.com/event-catalog/eventcatalog.git',
        copy: [
          {
            content: ['examples/default/domains/Orders/services'],
            destination: path.join(catalogDir, 'services'),
          },
        ],
      });

      await plugin(eventCatalogConfig, {
        source: 'https://github.com/event-catalog/eventcatalog.git',
        copy: [
          {
            content: ['examples/default/domains/Orders/services'],
            destination: path.join(catalogDir, 'services'),
          },
        ],
        override: true,
      });

      const services = await fs.readdir(path.join(catalogDir, 'services'));
      expect(services).toHaveLength(3);
    });

    it('overides the content if the destination directory already exists and override is true', async () => {
      const { writeService } = utils(catalogDir);
      await writeService({
        id: 'InventoryService',
        name: 'Inventory Service',
        version: '1.0.0',
        summary: 'The inventory service',
        markdown: 'Hello world',
      });

      await plugin(eventCatalogConfig, {
        source: 'https://github.com/event-catalog/eventcatalog.git',
        copy: [
          {
            content: ['examples/default/domains/Orders/services', 'examples/default/domains/Payment/services'],
            destination: path.join(catalogDir, 'services'),
          },
        ],
        override: true,
      });

      const services = await fs.readdir(path.join(catalogDir, 'services'));
      expect(services).toHaveLength(4);
    });
  });

  describe('error handling', () => {
    it('throws an error if the content trying to copy is already in the destination directory', async () => {
      await plugin(eventCatalogConfig, {
        source: 'https://github.com/event-catalog/eventcatalog.git',
        copy: [
          {
            content: ['examples/default/domains/Orders/services'],
            destination: path.join(catalogDir, 'services'),
          },
        ],
      });

      await expect(
        plugin(eventCatalogConfig, {
          source: 'https://github.com/event-catalog/eventcatalog.git',
          copy: [
            {
              content: ['examples/default/domains/Orders/services'],
              destination: path.join(catalogDir, 'services'),
            },
          ],
        })
      ).rejects.toThrow(/Path already exists at/);
    });

    it('throws an error if any of the resources in the content are found in the destination directory', async () => {
      const { writeService } = utils(catalogDir);
      await writeService({
        id: 'InventoryService',
        name: 'Inventory Service',
        version: '1.0.0',
        summary: 'The inventory service',
        markdown: 'Hello world',
      });

      await expect(
        plugin(eventCatalogConfig, {
          source: 'https://github.com/event-catalog/eventcatalog.git',
          copy: [
            {
              content: ['examples/default/domains/Orders/services', 'examples/default/domains/Payment/services'],
              destination: path.join(catalogDir, 'services'),
            },
          ],
        })
      ).rejects.toThrow(/Path already exists at/);
    });
  });

  describe('deep check', () => {
    it('if deep check is true then each resource will be checked if it already exists in EventCatalog using its id', async () => {
      const { writeService } = utils(catalogDir);
      await writeService(
        {
          id: 'InventoryService',
          name: 'Inventory Service',
          version: '1.0.0',
          summary: 'The inventory service',
          markdown: 'Hello world',
        },
        {
          path: path.join('InventoryServiceDuplicated'),
        }
      );

      await expect(
        plugin(eventCatalogConfig, {
          source: 'https://github.com/event-catalog/eventcatalog.git',
          copy: [
            {
              content: ['examples/default/domains/Orders/services'],
              destination: path.join(catalogDir, 'services'),
            },
          ],
          enforceUniqueResources: true,
        })
      ).rejects.toThrow(/EventCatalog already has services with the id InventoryService/);
    });
  });
});
