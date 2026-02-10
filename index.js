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



function validateRoomName(name) {
    // Only allow alphanumeric, underscores, and hyphens
    // Prevents path traversal attempts like "../" or "..\\"
    return /^[a-zA-Z0-9_-]+$/.test(name) && name.length > 0 && name.length <= 50;
}




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
//Hard-coded accounts that are embedded into the server.

const testPass = "101";
const adminPass = "2249";
let modAdminPassArray = ["30412", "lmrr1ls"];
let AdminPassArray = ["2249"];
let regularPass = ["101"];


history["main2"] = [];


function ensureRoom(tag, user, socket) {
    if (!history[tag]) {
        if(user.mod || user.admin){
            history[tag] = [];
            return true;
        }else{
            socket.send("Regular Users cannot create their own rooms. Open rooms created by admin: ler, open1, open2. Try them out or use the room code given to you by a mod.");
            for (const line of history["main2"]) {
                socket.send(line);
            }
            return false;
        }
        
    }
    return true;
}

class Account{
  constructor(user, pass, admin, mod){
    this.user = user;
    this.pass = pass;
    this.mod = mod;
    this.admin = admin;
  }
  verify(userin, passin){
    if(this.user == userin && this.pass == passin){
      return true;
    } else{
      return false;
    }
  }
  getuser(){
    return this.user;
  }
}

let aclist = [];

function encodeLoginData(a, db){
  if (validateRoomName(a.user)){
    db.ref("logindata/accountdata").push({
      user: a.user, 
      pass: a.pass, 
      admin: a.admin, 
      mod: a.mod 
    }); 
  }
}

db.ref("logindata/accountdata").once("value", snapshot => {
  snapshot.forEach(child => {
    const a = child.val();
    aclist.push(new Account(a.user, a.pass, a.admin, a.mod));
  });
  for (const a of aclist) {
    if (a.mod) modAdminPassArray.push(a.pass);
    if (a.admin) AdminPassArray.push(a.pass);
    loginfo[a.user] = a.pass; 
  } 
  console.log("Login accounts loaded."); 
});

function ensureAccount(user, pass){
  if (!validateRoomName(user)) return false;
  if(loginfo[user]){
    return false;
  } else{
    const a = new Account(user, pass, false, false);
    loginfo[user]= pass;
    encodeLoginData(a, db);
    return true;
  }
}

server.on("connection", socket => {
    console.log("Client connected");

    let firstmessage = true;
    let command = false;
    socket.send("Please input your moniker");
 // Decode login info from Account Info

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
            clients.set(socket, {
                moniker: "UNKNOWN (This Account is not Logged In)",
                admin: false,
                mod: false,
                prtag:"main2",
                active: false,
                loggedIn: false
            });
            

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
        if(user.newName){
          if(!validateRoomName(msg)){
            socket.send("Invalid Moniker");
            user.newName = false;
            return;
          } else{
            user.moniker = msg;
            user.newName = false;
            socket.send("Name changed. New name: " + user.moniker);
            return;
          }
        }
        const user = clients.get(socket);
        const now = new Date();
        const timestamp = now.toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour12: true });
        if(data && data.type == "sessionrestart"){
          const token = data.token;
          db.ref("sessions/" + token).once("value", snap =>{
            const session = snap.val();
            if (!session){
              socket.send("Invalid Session Token");
              return;
            } else{
              const username = session.username;
              const pass = loginfo[username];

              user.moniker = username;
              user.loggedIn = true;

              if(AdminPassArray.includes(pass)){
                user.admin = true;
                user.mod = true;
              } else if (modAdminPassArray.includes(pass)){
                user.mod = true;
              }
              console.log("Session restored");
            }
          });
          return;
        }
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
          socket.send("NOTE: This system is temporary, a better login system is currently being developed.");
        }
        if(msg=="/logout"){
          user.loggedIn = false;
          user.mod = false;
          user.admin = false;
          db.ref("sessions/" + user.sessionToken).remove();
          user.sessionToken = null;
          socket.send("Permissions and flags cleared");
        }
        if((msg == "/changename" || msg == "/changemoniker" ) && user.loggedIn){

            socket.send("Please input your new username");   
            user.newName = true;
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
      if (data && data.type == "login"){
        if(user.loggedIn){
          socket.send("Error: User already logged in");
          return;
        }
          const userin = data.v1;
          const passin = data.v2;
          const acnew = ensureAccount(userin, passin);
          if(acnew){
            user.moniker = userin;
            user.mod = false; 
            user.admin = false; 
            socket.send("Account created. Logged in as normal user.");
            return;
          } else{
            if(loginfo[userin] === passin){
              user.loggedIn = true;

              const token = Math.random().toString(36).slice(2);
              user.sessionToken = token; db.ref("sessions/" + token).set({ 
                username: userin,
                timestamp: Date.now()
              }); 
              socket.send(JSON.stringify({ type: "sessionToken", tokenid: token }));
              
              if(modAdminPassArray.includes(passin)){
                user.mod = true;
                socket.send("Socket upgraded to Moderator. Welcome, mod.");
                return;
              } else if(AdminPassArray.includes(passin)){
                user.mod = true;
                user.admin = true;
                socket.send("Welcome Administrator. Socket upgraded to Admin status.");
                return;
              } else  {
                user.mod = false;
                user.admin = false;
                socket.send("Normal user dected.");
                return;
              }
            } else{
              socket.send("Incorrect sign-in data");
              return;
            }
            
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
                if(msg=="/delroom" && user.admin){
                  if(user.prtag == "main2"){
                    socket.send("Room 'main' cannot be removed");
                    return;
                  } else{
                    let previoustag = user.prtag;
                    user.prtag = "main2";
                    socket.send(JSON.stringify({ type: "clearHistory" }));
                    for (const line of history["main2"]) {
                       socket.send(line);
                    }
                    db.ref("chatlog/" + previoustag).remove();
                    socket.send("Room removed; User moved to room 'main'");
                  }
                  return;
                }
                if(msg == "/getPlayerLoc" && user.admin){
                  for (const [client, cUser] of clients) {
                    if (client.readyState === WebSocket.OPEN && cUser.active) {
                      socket.send(cUser.moniker);
                      socket.send(cUser.prtag);
                      
                    }
                  }
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
