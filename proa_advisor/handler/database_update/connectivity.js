async function hasInternet() {
    try {
        const controller = new AbortController();

        const timeout = setTimeout(() => controller.abort(), 5000);

        const response = await fetch("https://www.google.com/generate_204", {
            signal: controller.signal,
        });

        clearTimeout(timeout);

        return response.ok;
    } catch (err) {
        return false;
    }
}

module.exports = { hasInternet };