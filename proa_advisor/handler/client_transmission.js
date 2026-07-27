const clients = new Set();

function get_clients() {
    if (clients.size === 0) {
        console.log("No clients connected.");
    }
    return clients;
}

function add_client(client) {
    clients.add(client);
    hasInternet().then((internet) => {
        if (internet) {
            write_to_client(client, "message", { message: "Connected to server with internet access", type: "info" });
        } else {
            write_to_client(client, "message", { message: "Connected to server without internet access", type: "warning" });
        }
    });
}

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

function remove_client(client) {
    const removed = clients.delete(client);
    if (!removed) {
        console.log("Client not found.");
    }
}

function write_to_client(client, event_type, data) {
    // Convert an object to a string and send it to the client
    const message = `event: ${event_type}\ndata: ${JSON.stringify(data)}\n\n`;
    client.write(message);
}

function write_to_clients(event_type, data) {
    // Convert an object to a string and send it to all clients
    const message = `event: ${event_type}\ndata: ${JSON.stringify(data)}\n\n`;
    console.log(`Writing to ${clients.size} clients`);
    clients.forEach(client => {
        client.write(message);
    });
}

module.exports = {
    get_clients,
    add_client,
    remove_client,
    write_to_clients
}