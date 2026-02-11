const admin = require("firebase-admin");

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  databaseURL: process.env.FIREBASE_DB_URL
});
const db = admin.database();

function loadSession(token) {
  return db.ref("sessions/" + token).once("value").then(snap => snap.val());
}


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

//Hard-coded accounts that are embedded into the server.


let modArray =[];
let adminArray =[];
let regArray =[];


history["main"] = [];




function ensureIsArray(tag){
  if (!Array.isArray(history[tag])) { history[tag] = []; }
}

function ensureRoom(tag, user, socket) {
    if (!Array.isArray(history[tag])) {
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

class Account{
  constructor(user, pass, admin, mod, disp){
    this.user = user;
    this.pass = pass;
    this.mod = mod;
    this.admin = admin;
    this.disp = disp;
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
      mod: a.mod,
      disp: a.disp
    }); 
  }
}
function updateLoginPermData(a, db){
  if(validateRoomName(a.user)){
    db.ref("logindata/accountdata").once("value", snapshot=>{
      snapshot.forEach(child => {
        const val = child.val();
        if(val.user === a.user && val.pass === a.pass){
          child.ref.update({
            mod: a.mod,
            admin: a.admin
          });
        }
      });
    });
  }
}

db.ref("logindata/accountdata").once("value", snapshot => {
  snapshot.forEach(child => {
    const a = child.val();
    aclist.push(new Account(a.user, a.pass, a.admin, a.mod, a.disp));
  });
  for (const a of aclist) {
    if (a.mod) modArray.push(a);
    if (a.admin) adminArray.push(a);
    regArray.push(a);
    loginfo[a.user] = a.pass; 
  } 
  console.log("Login accounts loaded."); 
});
//^Loads login data
function ensureAccount(user, pass){
  if (!validateRoomName(user)) return false;
  if(loginfo[user]){
    return false;
  } else{
    const a = new Account(user, pass, false, false, user);
    loginfo[user]= pass;
    encodeLoginData(a, db);
    return true;
  }
}

server.on("connection", socket => {
    console.log("Client connected");

    let firstmessage = true;
    let command = false;
 // Decode login info from Account Info
    clients.set(socket, {
      moniker: "UNKNOWN",
      user: null,
      pass:null,
      admin: false,
      mod: false,
      prtag:"main",
      active: false,
      loggedIn: false,
      sessionToken: null
    });
    const user = clients.get(socket);
    if (!validateRoomName(user.prtag)) { user.prtag = "main"; }
  
    socket.on("message",async msg => {
        
        ensureRoom(user.prtag, user, socket);
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
        
        user.active = true;
        if(firstmessage){
          ensureRoom(user.prtag,user,socket);
          for (const line of history[user.prtag]) {
             socket.send(line);
          }
          socket.send("Note; Storage is limited. Please try not to open any Private Rooms if you don't have to. Refer to /help for a list of commands.");
          firstmessage = false;
        }
            
        if(user.newName){
          if(!validateRoomName(msg)){
            socket.send("Invalid Moniker");
            user.newName = false;
            return;
          } else{
            user.moniker = msg;
            user.newName = false;
            socket.send("Name changed. New name: " + user.moniker);
            db.ref("logindata/accountdata").once("value", snapshot => {
              snapshot.forEach(child => {
                const val = child.val();
                if(val.user === user.username){ 
                  child.ref.update({ disp: msg });
                }
              });
            });
            return;
          }
        }
        const now = new Date();
        const timestamp = now.toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour12: true });
        if (data && data.type === "sessionrestart") {
            const token = data.token;
            const session = await loadSession(token);

            if (!session) {
              socket.send("Invalid Session Token");
              return;
            }

             user.moniker = session.username;
             user.loggedIn = true;
             user.admin = !!session.admin;
            user.mod = !!session.mod;
            user.sessionToken = token;
            if (!history[user.prtag]) history[user.prtag] = [];

            socket.send("Session restored for " + user.moniker);
             console.log("Session restored for", user.moniker);
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
          if(user.sessionToken){
            db.ref("sessions/" + user.sessionToken).remove();
            user.sessionToken = null;
          }
          socket.send("Permissions and flags cleared");
          return;
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
        socket.send("Login Data received; Beginnning Login Process");
        if(user.loggedIn){
          socket.send("Error: User already logged in");
          return;
        }
          const userin = data.v1;
          const passin = data.v2;
          const acnew = ensureAccount(userin, passin);
          if(acnew){
            let k = userin;
            db.ref("logindata/accountdata").once("value", snapshot => {
              snapshot.forEach(child => {
                const val = child.val();
                if(val.user == userin && val.pass == passin){
                  k = val.disp;
                }
              });
            });
            user.moniker = k;
            user.mod = false; 
            user.admin = false; 
            user.username = userin;
            user.pass = passin;
            socket.send("Account created. Logged in as normal user.");
            user.loggedIn = true;
            db.ref("logindata/accountdata").once("value", snapshot => {
            snapshot.forEach(child => {
    const a = child.val();
    aclist.push(new Account(a.user, a.pass, a.admin, a.mod, a.disp));
  });
  for (const a of aclist) {
    if (a.mod) modArray.push(a);
    if (a.admin) adminArray.push(a);
    regArray.push(a);
    loginfo[a.user] = a.pass; 
  } 
  console.log("Login accounts loaded."); 
});

          } else{
            if(loginfo[userin] === passin){
              user.username = userin;
              user.pass = passin;
              user.moniker = userin;
              user.loggedIn = true;
            }
          }
            
              
            const acc = aclist.find(a => a.user === userin && a.pass === passin);
            if (acc) {
                user.admin = acc.admin;
                user.mod = acc.mod;
                if(user.admin){
                    socket.send("WELCOME ADMINISTRATOR.");
                }
                if(user.mod && !user.admin){
                    socket.send("Welcome Moderator.");
                }
            }else if (!acnew){
              socket.send("Incorrect sign-in data");
              return;
            }
            if(user.sessionToken == null){
            const token = Math.random().toString(36).slice(2);
            user.sessionToken = token; db.ref("sessions/" + token).set({ 
                username: user.moniker,
                admin: !!user.admin,
                mod: !!user.mod,
                timestamp: Date.now(),
                disp: user.moniker,
            }).then(() => {
                console.log("Session token stored in Firebase for user:", user.moniker);
                socket.send(JSON.stringify({ type: "sessionToken", tokenid: token }));
            });
            socket.send(" Session token created");
            }
            return;
          }
      if(user.loggedIn == false){
            socket.send("Login required; create an account or log in to chat.");
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
                if (msg === "/gethistlength" && user.admin) {
                  /*socket.send("=== /gethistlength DEBUG START ===");
                  socket.send("user.prtag:" + user.prtag);
                  socket.send("type:" + typeof history[user.prtag]);
                  socket.send("isArray:" + Array.isArray(history[user.prtag]));
                  socket.send("=== /gethistlength DEBUG END ===");*/
                  socket.send("Length: " + history[user.prtag].length);
                  return; 
                }
                if(msg=="/delroom" && user.admin){
                  if(user.prtag == "main"){
                    socket.send("Room 'main' cannot be removed");
                    return;
                  } else{
                    let previoustag = user.prtag;
                    user.prtag = "main";
                    socket.send(JSON.stringify({ type: "clearHistory" }));
                    for (const line of history["main"]) {
                       socket.send(line);
                    }
                    for(const [client, cUser] of clients){
                      if(cUser.prtag == previoustag){
                        cUser.prtag = "main";
                      }
                    }
                    db.ref("chatlog/" + previoustag).remove();
                    delete history[previoustag];
                    socket.send("Room removed; User moved to room 'main'");
                    return;
                  }
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
                if(msg == "/giveSelfMod" && user.admin){
                  user.mod = true;
                  let a = new Account(user.username, user.pass, true, true, user.moniker);
                  updateLoginPermData(a, db);
                }
                if(msg =="/giveOtherMod" && user.admin){
                    socket.send("Please input the username of the user you wish to give mod privileges to");
                    user.awaitingModTarget = msg;
                    return;
                }
                if(msg== "/giveOtherAdmin" && user.admin){
                    socket.send("Please input the username of the user you wish to give admin to");
                    user.awaitingAdminTarget = msg;
                    return;
                }
                if(user.awaitingAdminTarget){
                    clients.forEach((cUser, client) => {
                        if(cUser.moniker === msg){
                            cUser.admin = true;
                            cUser.mod = true;
                            client.send("You have been given admin privileges by " + user.moniker);
                            socket.send("Admin privileges given to " + msg);
                            user.awaitingAdminTarget = null;
                            let a = new Account(cUser.username, cUser.pass, true, true, cUser.moniker);
                            updateLoginPermData(a, db);
                        }
                    });
                }
                if(user.awaitingModTarget){
                    clients.forEach((cUser, client) => {
                        if(cUser.moniker === msg){
                            cUser.mod = true;
                            client.send("You have been given mod privileges by " + user.moniker);
                            socket.send("Mod privileges given to " + msg);
                            user.awaitingModTarget = null;
                            let a = new Account(cUser.username, cUser.pass, true, cUser.admin, cUser.moniker);
                            updateLoginPermData(a, db);
                        }
                    });
                }
                
                
                if(msg == "/cmdoff"){
                    socket.send("Command Mode Deactivated");
                    command = false;
                    return;
                }
            }
        if(taggedMessage) {
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

        ensureRoom(user.prtag,user,socket);
      
        history[user.prtag].push(taggedMessage);

        if (history[user.prtag].length > 200) {
            history[user.prtag].shift();
            history[user.prtag].shift();
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
