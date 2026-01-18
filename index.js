const WebSocket = require("ws");

const port = process.env.PORT || 8080;
const server = new WebSocket.Server({ port });

console.log("WebSocket server running on port", port);

// Store monikers for each client
const clients = new Map();

server.on("connection", socket => {
    console.log("Client connected");

    // First message from a client will be their moniker
    let monikerSet = false;

    socket.on("message", msg => {
        msg = msg.toString();

        // If moniker not set, treat first message as moniker
        if (!monikerSet) {
            clients.set(socket, msg);
            monikerSet = true;
            console.log(`Client set moniker: ${msg}`);
            socket.send(`Welcome, ${msg}!`);
            return;
        }

        // Get the client's moniker
        const moniker = clients.get(socket) || "Unknown";

        // Build message with moniker prefix
        const taggedMessage = `${moniker}: ${msg}`;
        console.log("Broadcast:", taggedMessage);

        // Broadcast to all connected clients
        for (const [client] of clients) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(taggedMessage);
            }
        }
    });

    socket.on("close", () => {
        const moniker = clients.get(socket);
        console.log(`Client disconnected: ${moniker}`);
        clients.delete(socket);
    });
});