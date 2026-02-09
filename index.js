const admin = require("firebase-admin");

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  databaseURL: process.env.FIREBASE_DB_URL
});
const db = admin.database();

const WebSocket = require("ws");

const port = process.env.PORT || 10000;
const server = new WebSocket.Server({ port });

console.log("WebSocket server running on port", port);

// Store monikers for each client
const clients = new Map();

// Proper history buffer
const history = {};

//load from firebase
db.ref("chatlog").once("value", snapshot => {
     snapshot.forEach(roomSnap => {
         const room = roomSnap.key;
          history[room] = [];
          roomSnap.forEach(msgSnap => {
             const entry = msgSnap.val();
              if (entry && entry.taggedMessage) {
                 history[room].push(entry.taggedMessage); 
                } 
            }); 
        }); 
    console.log("History loaded from Firebase"); 
});


//load from firebase
db.ref("chatlog").once("value", snapshot => {
     snapshot.forEach(roomSnap => {
         const room = roomSnap.key;
          history[room] = [];
          roomSnap.forEach(msgSnap => {
             const entry = msgSnap.val();
              if (entry && entry.taggedMessage) {
                 history[room].push(entry.taggedMessage); 
                } 
            }); 
        }); 
    console.log("History loaded from Firebase"); 
});

const cmdliststring = ["====Command List====", "/help: Displays this menu", "/cmd: Activates command mode", "/getprlist: Gets a list of all private rooms; MOD / ADMIN ONLY; COMMAND MODE REQUIRED", "/strikemsg: Removes a message from the chat history and clears it from everyone's logs; MOD / ADMIN ONLY; COMMAND MODE REQUIRED", "/clearhist: Clears the entire history of the current chat room; ADMIN ONLY; COMMAND MODE REQUIRED", "/getplayers: Gets a list of all users currently online; BROKEN", "/login: Starts the login process", "/changename: Changes your name", "/gethistlength: Gets the length of the current chat history; ADMIN ONLY; COMMAND MODE REQUIRED", "/loginhelp: Gives you instructions on how to login"]; 

const loginfo = {};

loginfo["mhwenAdminLoginMJC"] = "2249";
loginfo["testUser1"] ="101";
loginfo["modOliverLimb20213"] = "30412";
loginfo["testModerator3013"] = "lmrr1ls";

const testPass = "101";
const adminPass = "2249";
const modAdminPassArray = ["30412", "lmrr1ls"];



history["main"] = [];


function validateRoomName(name) {
    // Only allow alphanumeric, underscores, and hyphens
    // Prevents path traversal attempts like "../" or "..\\"
    return /^[a-zA-Z0-9_-]+$/.test(name) && name.length > 0 && name.length <= 50;
}

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

        if(msg == ""){
            return;
        }

        // First message = moniker
        if (!monikerSet) {
            clients.set(socket, {
                moniker: msg,
                admin: false,
                mod: false,
                prtag:"main",
                active: false
            });
            monikerSet = true;

            const user = clients.get(socket);

            socket.send(`Welcome, ${msg}!`);
            user.active = true;
            if(firstmessage){
                ensureRoom(user.prtag,user,socket);
                for (const line of history[user.prtag]) {
                    socket.send(line);
                }

               firstmessage = false;
            }
            socket.send("Note; Storage is limited. Please try not to open any Private Rooms if you don't have to. Refer to /help for a list of commands.");
            return;
        }
        const user = clients.get(socket);
        const now = new Date();
        const timestamp = now.toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour12: true });
        if(msg=="/help"){
          for(k of cmdliststring){
            socket.send(k);
          }
          return;
        }
        if(msg == "/loginhelp"){
          socket.send("Step 1: Input /login");
          socket.send("Step 2: Input username (E.X. testUser1)");
          socket.send("Step 3: Input password (E.X. 101)");
          socket.send("Use the login info given to you by a moderator or admin to login.");
          socket.send("NOTE: This system is temporary, a better login system is on the way!");
        }
        if(msg == "/changename" || msg == "/changemoniker"){
            monikerSet = false;
            socket.send("Please input your new username");   
            return;
        }
        if (data && data.type === "changePrTag") {
            const room = data.v1;

            if (!validateRoomName(room)) {
                socket.send("Invalid room name. Use only letters, numbers, underscores, and hyphens.");
                return;
            }

            if (!ensureRoom(room, user, socket)) {
                return;
            }

            user.prtag = room;

            socket.send(JSON.stringify({ type: "clearHistory" }));
               // Send room history
            for (const line of history[room]) {
               socket.send(line);
            }

            return;
        }

        if(msg == "/getplayers"){
          for (const [client, cUser] of clients) {
            if (client.readyState === WebSocket.OPEN && cUser.active) {
                socket.send(cUser.moniker);
            }
          }
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
                if(user.mod || user.admin){
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
                     db.ref("chatlog/" + user.prtag).limitToLast(1).once("value", snapshot => {
                     snapshot.forEach(child => child.ref.remove());
                    });
                }
                if (msg == "/clearhist" && user.admin) {
                    history[user.prtag] = [];
                    taggedMessage = JSON.stringify({ type: "clearHistory" });
                    db.ref("chatlog/" + user.prtag).remove();
                }
                if(msg == "/getprlist" && user.mod){
                    socket.send("====Available Rooms====");
                    for (const p of Object.keys(history)) {
                        socket.send(p);
                    }
                }
                if(msg=="/gethistlength" && user.admin){
                  socket.send(history[user.prtag].length);
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

            db.ref("chatlog/" + user.prtag).push({ taggedMessage });
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
