const clients = new Set();

function get_clients() {
    if (clients.size === 0) {
        console.log("No clients connected.");
    }
    return clients;
}

function add_client(client) {
    clients.add(client);
}

function remove_client(client) {
    const removed = clients.delete(client);
    if (!removed) {
        console.log("Client not found.");
    }
}

function write_to_clients(data) {
    // Convert an object to a string and send it to all clients
    const message = `data: ${JSON.stringify(data)}\n\n`;
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