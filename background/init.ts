import logger from '../logger';
import chromeApi from '../chrome-api.js';
import storageService from '../storage-service.js';
import offlineQueue from '../offline-queue.js';
import { isLoggedIn } from '../auth.js';

const log = logger;

let isInitialized = false;
let initializationPromise: Promise<void> | null = null;

export function ensureInitialized() {
  if (!initializationPromise) {
    initializationPromise = initializeExtension();
  }
  return initializationPromise;
}

async function initializeExtension() {
  if (isInitialized) {
    log.debug('Extension already initialized');
    return;
  }
  try {
    log.info('Initializing IdeaPocket extension');

    // Create / reset context-menus
    try {
      await chromeApi.contextMenus.removeAll();
      await chromeApi.contextMenus.create({ id: 'saveToIdeaPocket', title: 'Save to IdeaPocket', contexts: ['page', 'link'] });
      await chromeApi.contextMenus.create({ id: 'saveSelectionToIdeaPocket', title: 'Save Selection as Highlight', contexts: ['selection'] });
      log.info('Context menus created');
    } catch (error: any) {
      log.error('Failed to create context menu:', { error: error.message });
    }

    // Storage sanity check
    try {
      await storageService.get('test');
      log.info('Storage service is operational');
    } catch (error: any) {
      log.error('Storage service check failed:', { error: error.message });
    }

    const authenticated = await isLoggedIn();
    log.info('Authentication status', { authenticated });

    const queueStatus = await offlineQueue.getQueueStatus();
    if (queueStatus.count > 0) {
      log.info('Found offline queue items', { count: queueStatus.count });
      offlineQueue.processQueue();
    }

    isInitialized = true;
    const manifest = chrome.runtime.getManifest();
    log.info(`IdeaPocket v${manifest.version} initialized successfully`);
  } catch (error: any) {
    log.error('Extension initialization failed:', { error: error.message });
    isInitialized = false;
    initializationPromise = null;
    throw error;
  }
}

export function bootstrap() {
  log.info('[Init] bootstrap start');

  // Startup / install listeners
  chromeApi.runtime.onStartup.addListener(() => {
    log.info('Extension startup event');
    ensureInitialized();
  });

  chromeApi.runtime.onInstalled.addListener(async (details) => {
    log.info('Extension installed/updated', { reason: details.reason });
    ensureInitialized();

    if (['update', 'chrome_update', 'install'].includes(details.reason)) {
      const session = await chrome.storage.session.get('reopenPopupAfterReload');
      if (session.reopenPopupAfterReload) {
        await chrome.storage.session.remove('reopenPopupAfterReload');
        await chromeApi.action.openPopup();
      }
    }
  });

  // Immediate initialization + reopen popup if needed
  (async () => {
    try {
      const session = await chrome.storage.session.get('reopenPopupAfterReload');
      if (session.reopenPopupAfterReload) {
        await chrome.storage.session.remove('reopenPopupAfterReload');
        await chromeApi.action.openPopup();
      }
    } catch (e: any) {
      logger.error('Failed to check for post-reload action', { error: e.message });
    }
  })();

  log.info('[Init] bootstrap done');
  // Kick off initialization immediately
  ensureInitialized();
} 