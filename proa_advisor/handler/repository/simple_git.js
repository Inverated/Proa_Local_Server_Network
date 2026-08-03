// Run the following
// git fetch origin
// git reset --hard origin/main
// git pull origin main
const os = require("os");
const { simpleGit } = require("simple-git");
const { hasInternet } = require("../database_update/connectivity")
const git = simpleGit({
    baseDir: process.cwd()
}).outputHandler((command, stdout, stderr, args) => {
    // Print Git output in real time
    stdout.pipe(process.stdout);
    stderr.pipe(process.stderr);
});

async function updateRepo() {
    if (!await hasInternet()) {
        return { updated: false, message: "No internet connection. Skipping repository update." };
    }
    try {
        await git.fetch('origin', 'main');
        const current_platform = os.platform();
        // Only reset and pull if is running on linux (deployment server)
        if (current_platform === "linux") {
            await git.reset(['--hard', 'origin/main']);
            await git.pull('origin', 'main');
        }
        return { updated: true, message: "Repository updated successfully." };
    } catch (error) {
        return { updated: false, message: "Error updating repository." };
    }
}

module.exports = {
    updateRepo
};