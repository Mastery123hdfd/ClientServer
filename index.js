

const WebSocket = require("ws");

const port = process.env.PORT || 10000;
const server = new WebSocket.Server({ port });

console.log("WebSocket server running on port", port);

// Store monikers for each client
const clients = new Map();

// Proper history buffer
const history = {};


const loginfo = {};

loginfo["mhwenAdminLoginMJC"] = "2249";
loginfo["testUser1"] ="101";
loginfo["modOliverLimb20213"] = "30412";
loginfo["testModerator3013"] = "lmrr1ls";

const testPass = "101";
const adminPass = "2249";
const modAdminPassArray = ["30412", "lmrr1ls"];

const admin = require("firebase-admin");

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  databaseURL: process.env.FIREBASE_DB_URL
});
const db = admin.database();

history["main"] = [];


function ensureRoom(tag, user, socket) {
    if (!history[tag]) {
        if(user.mod || user.admin){
            history[tag] = [];
            return true;
        }else{
            socket.send("Regular Users cannot create their own rooms. Open rooms created by admin: ler, open1, open2. Try them out or use the room code given to you by a mod.");
            for (const line of history["main"]) {
                socket.send(line);
            }
            return false;
        }
        
    }
    return true;
}


server.on("connection", socket => {
    console.log("Client connected");

    let monikerSet = false;
    let firstmessage = true;
    let loginmsg = false;
    let passmsg = false;
    let loginstring = "";
    let command = false;
    let passwordstring="";
    socket.send("Please input your moniker");
    

    socket.on("message", msg => {
       

        
        let data = null;
        let raw = msg.toString();

        if (raw.startsWith("{")) {
            try {
                data = JSON.parse(raw);
            } catch (e) {
                console.log("Invalid JSON from client:", raw);
            }
        }
        msg = data?.msg || raw;

        // First message = moniker
        if (!monikerSet) {
            clients.set(socket, {
                moniker: msg,
                admin: false,
                mod: false,
                prtag:"main"
            });
            monikerSet = true;

            const user = clients.get(socket);

            socket.send(`Welcome, ${msg}!`);
            if(firstmessage){
                ensureRoom(user.prtag,user,socket);
                for (const line of history[user.prtag]) {
                    socket.send(line);
                }

               firstmessage = false;
            }
            socket.send("Note; PR Rooms are highly experimental, not recommended to use. Chat history for PR room support has not been added.");
            return;
        }
        const user = clients.get(socket);
        const now = new Date();
        const timestamp = now.toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour12: true });
        if(msg == "/changename" || msg == "/changemoniker"){
            monikerSet = false;
            socket.send("Please input your new username");   
            return;
        }
        if (data && data.type === "changePrTag") {
            const room = data.v1;

            if (!ensureRoom(room, user, socket)) {
                return;
            }

            user.prtag = room;

            socket.send(JSON.stringify({ type: "clearHistory" }));

            db.ref("chatlog/" + room).once("value", snapshot => {
               snapshot.forEach(child => {
                    const entry = child.val();
                    if (entry && entry.taggedMessage) {
                       history[room].push(entry.taggedMessage);
                    }
               });

               // Send room history
               for (const line of history[room]) {
                   socket.send(line);
               }
            });

            return;
        }


        if(passmsg){
            passwordstring = msg;
            const user = clients.get(socket);


            if (loginstring in loginfo && loginfo[loginstring] == passwordstring) {
                if(passwordstring == testPass){
                    socket.send("Test successful, client not marked");
                }
                else if(modAdminPassArray.includes(passwordstring)){
                    socket.send("Account Upgraded to Moderator Status. NOTE: Changing monikers will revoke permissions.");
                    user.mod = true;
                    //make mod
                }
                else if(passwordstring == adminPass){
                    socket.send("Welcome, admin. Socket elevated to Admin levels. NOTE: Changing monikers will revoke permissions.");
                    user.mod = true;
                    user.admin = true;
                    //make mod AND admin
                }
                else{
                    socket.send("Incorrect Credentials.");
                }
                passmsg = false;
                return;
            } else{
                passmsg = false;
                socket.send("Incorrect Password");
                return;
            }
        }
        if(loginmsg){
            loginstring = msg;
            socket.send("Received login user");
            if(loginstring in loginfo){
                passmsg = true;
                loginmsg = false;
                return;
            }else{
                socket.send("Invalid Login Info");
            }
            loginmsg = false;
            return;
        }
        if(msg == "/login"){
            socket.send("Please input your login Username");
            loginmsg = true;
            return;
        }
        if(msg == "/cmd"){
                if(usersocket.mod || usersocket.admin){
                    command = true;
                    socket.send("Command Mode Activated");
                    return;
                }
                else{
                    socket.send("you do not have permission to use this command");
                    return;
                }
            }
            const moniker = user.moniker;
            let taggedString = "";
            if(user.mod){
                taggedString = `(${timestamp}) | [MOD] ${moniker}: ${msg}`;
            }
            if(user.admin){
                    taggedString = `(${timestamp}) | [ADMIN] ${moniker}: ${msg}`;
            }
            if(!user.admin && !user.mod){
                 taggedString= `(${timestamp}) | ${moniker}: ${msg}`;
            }
        
            let taggedMessage = null;
            if(command){
                if(msg == "/strikemsg"){
                    history[user.prtag].pop();
                    taggedMessage = (JSON.stringify({type:"strikemsg"}));
                     db.ref("chatlog").limitToLast(1).once("value", snapshot => {
                     snapshot.forEach(child => child.ref.remove());
                    });
                }
                if (msg == "/clearhist" && usersocket.admin) {
                    history[user.prtag] = [];
                    taggedMessage = JSON.stringify({ type: "clearHistory" });
                    db.ref("chatlog/" + user.prtag).remove();
                } else if(usersocket.mod && !usersocket.admin){
                    socket.send("Moderators cannot use this command.");
                    return;
                }
                if(msg =="/cmdoff"){
                    socket.send("Command Mode Deactivated");
                    command = false;
                    return;
                }
            }
        if(taggedMessage) {
        // send/broadcast this and return early
            ensureRoom(user.prtag,user,socket);
            history[user.prtag].push(taggedMessage);

            db.ref("chatlog").push({ taggedMessage });
            for (const [client] of clients) {
                client.send(taggedMessage);
            }
            return;
        }

        taggedMessage = (JSON.stringify({
            message:taggedString,
            prtag: user.prtag,
            datatype:"chat"
        }));
        
        

        console.log("Broadcast:", taggedString);

        // Add to history (max 200)
        
        

        ensureRoom(user.prtag,user,socket);
        history[user.prtag].push(taggedMessage);

        if (history[user.prtag].length > 200) {
            history[user.prtag].shift();
        }

        db.ref("chatlog/" + user.prtag).push({taggedMessage});
        // Broadcast to all clients
        const parsed = JSON.parse(taggedMessage);

        for (const [client, cUser] of clients) {
            if (client.readyState === WebSocket.OPEN && cUser.prtag === parsed.prtag) {
                client.send(taggedMessage);
            }
        }

    });

    socket.on("close", () => {
        const user = clients.get(socket);
        const moniker = user ? user.moniker : "Anonymous";
        console.log(`Client disconnected: ${moniker}`);
        clients.delete(socket);
    });
});
