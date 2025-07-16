import logger from '../logger';
import chromeApi from '../chrome-api.js';
// Import save helpers from root background for now (circular ok)
// eslint-disable-next-line import/no-cycle
import { handleSave, handleSaveSelection } from '../background';

const log = logger;

export function bootstrap() {
  log.info('[Commands] bootstrap start');

  chromeApi.commands.onCommand.addListener(async (command) => {
    log.info(`Command received: ${command}`);

    if (command === 'quick-save') {
      const [tab] = await chromeApi.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        log.warn('No active tab found for quick-save.');
        return;
      }
      try {
        log.info('Executing quick-save command', { tabId: tab.id });
        await handleSave(tab, []);
        log.info('Quick-save successful.');
      } catch (error: any) {
        log.error('Quick-save failed, but will still open popup.', { error: error.message });
      }
      await chromeApi.action.openPopup();
      return;
    }

    if (command === 'save-selection') {
      const [tab] = await chromeApi.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        log.warn('No active tab found for save-selection.');
        return;
      }
      try {
        log.info('Executing save-selection command', { tabId: tab.id });
        const selectionText: string = await new Promise((resolve) => {
          chromeApi.tabs.sendMessage(tab.id, { action: 'getSelectionText' }, (response) => {
            resolve(response.text);
          });
        });
        const pageUrl: string = await new Promise((resolve) => {
          chromeApi.tabs.sendMessage(tab.id, { action: 'getPageUrl' }, (response) => {
            resolve(response.url);
          });
        });
        await handleSaveSelection(tab, selectionText, pageUrl);
        log.info('Selection saved successfully.');
      } catch (error: any) {
        log.error('Selection save failed, but will still open popup.', { error: error.message });
      }
      await chromeApi.action.openPopup();
    }
  });

  log.info('[Commands] bootstrap done');
} 