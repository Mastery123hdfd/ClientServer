const WebSocket = require("ws");

const port = process.env.PORT || 10000;
const server = new WebSocket.Server({ port });

console.log("WebSocket server running on port", port);

// Store monikers for each client
const clients = new Map();

// Proper history buffer
const history = [];

server.on("connection", socket => {
    console.log("Client connected");

    let monikerSet = false;
    let firstmessage = true;
    socket.send("Please input your moniker");

    socket.on("message", msg => {
        msg = msg.toString();

        // First message = moniker
        if (!monikerSet) {
            clients.set(socket, msg);
            monikerSet = true;

            socket.send(`Welcome, ${msg}!`);
            if(firstmessage){
                for (const line of history) {
                    socket.send(line);
               }
               firstmessage = false;
            }
            return;
        }
        if(msg == "/changename" || msg == "/changemoniker"){
            monikerSet = false;
            socket.send("Please input your new username");   
            return;
        }

        const moniker = clients.get(socket) || "UNKNOWN";
        const taggedMessage = `${moniker}: ${msg}`;

        console.log("Broadcast:", taggedMessage);

        // Add to history (max 200)
        
        history.push(taggedMessage);
        if (history.length > 200) {
            history.shift();
        }
        // Broadcast to all clients
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
