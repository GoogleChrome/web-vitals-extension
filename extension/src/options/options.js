let optionsOverlayNode = document.getElementById('overlay');
let optionsSaveBtn = document.getElementById('save'); 
let optionsStatus = document.getElementById('status');

// Saves options to chrome.storage
function save_options() {
    chrome.storage.sync.set({
        enableOverlay: optionsOverlayNode.checked
    }, () => {
        // Update status to let user know options were saved.
        optionsStatus.textContent = 'Options saved.';
        setTimeout(() => {
            optionsStatus.textContent = '';
        }, 750);
    });
}

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
function restore_options() {
    chrome.storage.sync.get({
        enableOverlay: false
    }, ({enableOverlay}) => {
        optionsOverlayNode.checked = enableOverlay;
    });
}
document.addEventListener('DOMContentLoaded', restore_options);
optionsSaveBtn.addEventListener('click', save_options);