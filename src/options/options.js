const optionsOverlayNode = document.getElementById('overlay');
const optionsSaveBtn = document.getElementById('save');
const optionsStatus = document.getElementById('status');

/**
 * Save options to Chrome storage
 */
function saveOptions() {
  chrome.storage.sync.set({
    closedOverlayTabs: {}, // resets closed tab ids
    enableOverlay: optionsOverlayNode.checked,
  }, () => {
    // Update status to let user know options were saved.
    optionsStatus.textContent = 'Options saved.';
    setTimeout(() => {
      optionsStatus.textContent = '';
    }, 750);
  });
}

/**
 * Restores select box and checkbox state using the
 * preferences stored in chrome.storage
 */
function restoreOptions() {
  chrome.storage.sync.get({
    enableOverlay: false,
  }, ({enableOverlay}) => {
    optionsOverlayNode.checked = enableOverlay;
  });
}
document.addEventListener('DOMContentLoaded', restoreOptions);
optionsSaveBtn.addEventListener('click', saveOptions);
