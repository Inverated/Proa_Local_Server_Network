import './styles.css';

// Controls for server
// 1. Switch to test mode (Consider how to select diff test data to use)
// 2. Restart server (if update is avaliable & downloaded)
//    Use git pull on server to check for update, pull if available
//    cant check if current running server is the pulled version. Either add a version check or restart immediately after pulling
//    remove ubuntu script to auto update to just manually do it over dev panel
//

export default function ServerManagementTab() {
    return (
        <section className="settings-tab-panel">
            <h3>Server Management</h3>
            <p>This is a dummy Server Management tab. Add server-specific settings controls here.</p>
        </section>
    );
}
