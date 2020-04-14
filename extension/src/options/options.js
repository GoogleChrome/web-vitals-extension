// Saves options to chrome.storage
function save_options() {
    const enableOverlay = document.getElementById('overlay').checked;
    chrome.storage.sync.set({
        enableOverlay
    }, () => {
        // Update status to let user know options were saved.
        const status = document.getElementById('status');
        status.textContent = 'Options saved.';
        setTimeout(() => {
            status.textContent = '';
        }, 750);
    });
}

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
function restore_options() {
    chrome.storage.sync.get({
        enableOverlay: true
    }, ({enableOverlay}) => {
        document.getElementById('overlay').checked = enableOverlay;
    });
}
document.addEventListener('DOMContentLoaded', restore_options);
document.getElementById('save').addEventListener('click',
    save_options);