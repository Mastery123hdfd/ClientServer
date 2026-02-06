

const WebSocket = require("ws");

const port = process.env.PORT || 10000;
const server = new WebSocket.Server({ port });

console.log("WebSocket server running on port", port);

// Store monikers for each client
const clients = new Map();

// Proper history buffer
const history = [];


const loginfo = {};

loginfo["mhwenAdminLoginMJC"] = "1142";
loginfo["testUser1"] ="101";
loginfo["modOliverLimb20213"] = "30412";
loginfo["testModerator3013"] = "lmrr1ls";

const testPass = "101";
const adminPass = "1142";
const modAdminPassArray = ["30412"];

const admin = require("firebase-admin");

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  databaseURL: process.env.FIREBASE_DB_URL
});

const db = admin.database();

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
        let data;
        try{
            msg = msg.toString();
        } catch(e){
            data = JSON.parse(msg.data);
            
        }
        // First message = moniker
        if (!monikerSet) {
            clients.set(socket, {
                moniker: msg,
                admin: false,
                mod: false,
                prtag:"main"
            });
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
        const now = new Date();
        const timestamp = now.toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour12: true });
        if(msg == "/changename" || msg == "/changemoniker"){
            monikerSet = false;
            socket.send("Please input your new username");   
            return;
        }
        if(data.type == "changePrTag"){
            prtag = data.v1;
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
            const usersocket = clients.get(socket);
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
        const user = clients.get(socket);
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
        
        
        if(command){
            const usersocket = clients.get(socket);
            if(msg == "/strikemsg"){
                history.pop();
                taggedMessage = (JSON.stringify({type:"strikemsg"}));
                db.ref("chatlog").limitToLast(1).once("value", snapshot => {
                    snapshot.forEach(child => child.ref.remove());
                });
            }
            if(msg == "/clearhist" && usersocket.admin){
                history.length = 0;
                taggedMessage = (JSON.stringify({type: "clearHistory"}));
                db.ref("chatlog").remove();

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
        taggedMessage = (JSON.stringify({
            message:taggedString,
            prtag: "main",
            datatype:"chat"
        }));
        
        db.ref("chatlog").once("value", snapshot=>{
            snapshot.forEach(child =>{
                const entry = child.val();
                history.push(entry.taggedMessage);
            })
        })

        console.log("Broadcast:", taggedString);

        // Add to history (max 200)
        
        

        history.push(taggedMessage);
        if (history.length > 200 && taggedMessage != JSON.stringify({type: "clearHistory"}) && JSON.stringify({type: "strikemsg"})) {
            history.shift();
        }
        db.ref("chatlog").push({taggedMessage});
        // Broadcast to all clients
        for (const [client] of clients) {
            if (client.readyState === WebSocket.OPEN && user.prtag == taggedMessage.prtag) {
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
