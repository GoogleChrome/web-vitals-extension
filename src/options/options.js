const optionsOverlayNode = document.getElementById('overlay');
const optionsConsoleLoggingNode = document.getElementById('consoleLogging');
const optionsloggingURLPatternNode = document.getElementById('loggingURLPattern');
const optionsUserTimingNode = document.getElementById('userTiming');
const optionsPreferPhoneFieldNode = document.getElementById('preferPhoneField');
const optionsSaveBtn = document.getElementById('save');
const optionsStatus = document.getElementById('status');

/**
 * Save options to Chrome storage
 */
function saveOptions() {
  chrome.storage.sync.set({
    enableOverlay: optionsOverlayNode.checked,
    debug: optionsConsoleLoggingNode.checked,
    userTiming: optionsUserTimingNode.checked,
    preferPhoneField: optionsPreferPhoneFieldNode.checked,
    loggingURLPattern: optionsloggingURLPatternNode.value,
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
    debug: false,
    userTiming: false,
    preferPhoneField: false,
    loggingURLPattern: ''
  }, ({enableOverlay, debug, userTiming, preferPhoneField, loggingURLPattern}) => {
    optionsOverlayNode.checked = enableOverlay;
    optionsConsoleLoggingNode.checked = debug;
    optionsUserTimingNode.checked = userTiming;
    optionsPreferPhoneFieldNode.checked = preferPhoneField;
    optionsloggingURLPatternNode.value = loggingURLPattern;
  });
}
document.addEventListener('DOMContentLoaded', restoreOptions);
optionsSaveBtn.addEventListener('click', saveOptions);
