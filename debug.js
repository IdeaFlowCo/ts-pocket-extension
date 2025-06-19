// Debug viewer for TsPocket extension

async function loadLogs() {
  const logsDiv = document.getElementById('logs');
  const statusDiv = document.getElementById('status');
  
  try {
    // Get debug logs from storage
    const result = await chrome.storage.local.get(['debugLogs', 'authToken', 'userId']);
    const logs = result.debugLogs || [];
    
    // Show auth status
    statusDiv.innerHTML = `
      <strong>Auth Status:</strong> ${result.authToken ? '✅ Logged in' : '❌ Not logged in'}<br>
      <strong>User ID:</strong> ${result.userId || 'None'}<br>
      <strong>Total Logs:</strong> ${logs.length}
    `;
    
    // Display logs in reverse order (newest first)
    logsDiv.innerHTML = logs.reverse().map(log => {
      const isError = log.message.includes('error') || log.message.includes('fail') || log.message.includes('❌');
      return `
        <div class="log-entry ${isError ? 'error' : ''}">
          <div class="timestamp">${log.timestamp}</div>
          <div class="message">${log.message}</div>
          ${log.data && Object.keys(log.data).length > 0 ? 
            `<div class="data">${JSON.stringify(log.data, null, 2)}</div>` : ''}
        </div>
      `;
    }).join('');
    
  } catch (error) {
    logsDiv.innerHTML = `<div class="error">Error loading logs: ${error.message}</div>`;
  }
}

async function clearLogs() {
  if (confirm('Clear all debug logs?')) {
    await chrome.storage.local.set({ debugLogs: [] });
    loadLogs();
  }
}

async function testSave() {
  try {
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Send message to background script to save
    const response = await chrome.runtime.sendMessage({ 
      action: 'saveCurrent',
      tab: { id: tab.id, url: tab.url, title: tab.title }
    });
    
    alert('Save request sent. Check logs for results.');
    setTimeout(loadLogs, 1000);
  } catch (error) {
    alert(`Error: ${error.message}`);
  }
}

// Event listeners
document.getElementById('refresh').addEventListener('click', loadLogs);
document.getElementById('clear').addEventListener('click', clearLogs);
document.getElementById('testSave').addEventListener('click', testSave);

// Auto-refresh every 2 seconds
setInterval(loadLogs, 2000);

// Initial load
loadLogs();