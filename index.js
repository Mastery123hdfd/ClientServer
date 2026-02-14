process.on("exit", code => {
  console.error("PROCESS EXITED WITH CODE:", code);
});



process.stdout.write = (function(write) {
  return function(string, encoding, fd) {
    write.apply(process.stdout, arguments);
    try { fs.fsyncSync(1); } catch(e) {}
  };
})(process.stdout.write);

admin = require("firebase-admin");

process.on("uncaughtException", err => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

process.on("unhandledRejection", err => {
  console.error("UNHANDLED REJECTION:", err);
});

let last = Date.now();

setInterval(() => {
  const now = Date.now();
  const diff = now - last;

  if (diff > 1000) { 
    console.error("EVENT LOOP FREEZE DETECTED:", diff, "ms");
  }

  last = now;
}, 500);



admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  databaseURL: process.env.FIREBASE_DB_URL
});
const db = admin.database();

function loadSession(token) {
  try{
  return db.ref("sessions/" + token).once("value").then(snap => snap.val());
  } catch(err){
    console.error("Error loading session:", err);
    return null;
  }
}


const WebSocket = require("ws");

const port = process.env.PORT || 10000;
const server = new WebSocket.Server({ port });

console.log("WebSocket server running on port", String(port).replace(/\n|\r/g, ""));

// Store monikers for each client
const clients = new Map();

// Proper history buffer
const history = {};

function validateRoomName(name) {
    // Only allow alphanumeric, underscores, and hyphens
    // Prevents path traversal attempts like "../" or "..\\"
    return /^[a-zA-Z0-9_-]+$/.test(name) && name.length > 0 && name.length <= 50;
}


let restrictedRooms = [];

//load from firebase
try{
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
         const restricted = room.restriction;
         if(restricted && restricted == true){
           restrictedRooms.push(room);
         }
        }); 
    console.log("History loaded from Firebase"); 
});
} catch(err){
  console.error("Error loading history from Firebase:", err);
}




const cmdliststring = ["====Command List====", "/help: Displays this menu", "/cmd: Activates command mode", "/getprlist: Gets a list of all private rooms; MOD / ADMIN ONLY; COMMAND MODE REQUIRED", "/strikemsg: Removes a message from the chat history and clears it from everyone's logs; MOD / ADMIN ONLY; COMMAND MODE REQUIRED", "/clearhist: Clears the entire history of the current chat room; ADMIN ONLY; COMMAND MODE REQUIRED", "/getplayers: Gets a list of all users currently online; BROKEN", "/login: Starts the login process", "/changename: Changes your name", "/gethistlength: Gets the length of the current chat history; ADMIN ONLY; COMMAND MODE REQUIRED", "/loginhelp: Gives you instructions on how to login"]; 

const loginfo = {};

//This is the Admin Account login I accidentally left here, you're not getting this info ;)
loginfo["testUser1"] ="101";

//Hard-coded accounts that are embedded into the server.



let modArray =[];
let adminArray =[];
let regArray =[];


history["main"] = [];





function ensureRoom(tag, user, socket) {
    if (!Array.isArray(history[tag])) {
      socket.send(JSON.stringify({ type: "clearHistoryChatless" }));
        if(user.mod || user.admin){
            history[tag] = [];
            
            socket.send("Room created: " + tag);

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
    db.ref("logindata/accountdata/").push({
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
    try{
      db.ref("logindata/accountdata").once("value", snapshot=>{
        (child => {
          const val = child.val();
          if(val.user === a.user && val.pass === a.pass){
            child.ref.update({
              mod: a.mod,
              admin: a.admin,
              disp: a.disp
          });
        }
      });
      });
    }catch(err){
      console.error("Error updating login permission data:", err);
  } 
}
}
async function updateSession(a, db, token){
  if (!token) {
    console.log("updateSession called with null token");
    return;
  }

 if(validateRoomName(a.user)){
  try{
  const snapshot = await db.ref("sessions/" + token).once("value");
  } catch(err){
    console.error("Error accessing session data:", err);
    return;
  }
  if(snapshot.exists()){
   const val = snapshot.val();
   const ref = db.ref("sessions/" + token);
   await ref.update({
    mod: a.mod,
    admin: a.admin,
    disp: a.disp
  });
 } else{
   console.log("Erorr! Session not found!");
   return;
  }
 }
}

function convertUsertoAccount(user){
  return new Account(user.username, user.pass, user.admin, user.mod, user.moniker);
}

aclist = [];
modArray = [];
adminArray = [];
regArray = [];
try{
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
} catch(err){
  console.error("Error loading login accounts from Firebase:", err);
}
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
    let token = null;
    let firstmessage = true;
    let command = false;
 // Decode login info from Account Info
    clients.set(socket, {
      moniker: "UNKNOWN",
      username: null,
      pass:null,
      admin: false,
      mod: false,
      prtag:"main",
      active: false,
      loggedIn: false,
      sessionToken: null
    });
    const user = clients.get(socket);
    ensureRoom(user.prtag, user, socket);
    if (!validateRoomName(user.prtag)) { user.prtag = "main"; }


  //Message Handler==================================================


    socket.on("message", async msg => {
    console.log("WS: raw message:", msg.toString());
        if (!ensureRoom(user.prtag, user, socket)) return;

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
        if (msg === "") return;

        user.active = true;

        if (firstmessage) {
            for (const line of history[user.prtag]) {
                socket.send(line);
            }
            socket.send("Note; Storage is limited. Refrain from making Private Rooms if you don't have to. Report any bugs to the admins at 'Feedback' (The private room) or directly message me. Contact info at 'contact' (The private room). ");
            firstmessage = false;
        }

        // ===================== NAME CHANGE HANDLER =====================

        if (user.newName) {
            const newMoniker = msg?.trim();

            if (!newMoniker || !validateRoomName(newMoniker)) {
                socket.send("Invalid Moniker.");
                user.newName = false;
                return;
            }

            user.moniker = newMoniker;
            user.newName = false;
            socket.send("Name changed. New name: " + user.moniker);
            let afromUser = convertUsertoAccount(user);
            updateSession(afromUser, db, user.sessionToken);
            return;
        }

        // ===================== CHANGE NAME ========================

        if((msg == "/changename" || msg == "/changemoniker") && user.loggedIn){
          socket.send("Please input your new name.");
          user.newName = true;
          return;
        }

        // ===================== Get Users ========================

        if(msg == "/getusers"){
          socket.send("================= USERS IN ROOM =================");
          for(const [client, cUser] of clients){
            if(client.readyState === WebSocket.OPEN && cUser.prtag === user.prtag){
              socket.send("User: " + cUser.moniker);
            }
          }
        }

        // ===================== SESSION RESTORE =====================

        if (data && data.type === "sessionrestart") {
            const token = data.token;
            const session = await loadSession(token);

            if (!session) return;

            user.username = session.username;
            user.pass = session.pass;
            user.admin = !!session.admin;
            user.mod = !!session.mod;
            user.moniker = session.disp || session.username;
            user.loggedIn = true;
            user.sessionToken = token;

            socket.send("Session restored for " + user.moniker);
            return;
        }

        //======================== CHANGE PRIVATE ROOM ======================
        if(data && data.type === "changePrTag"){
          const newPrTag = data.v1;
          if (!validateRoomName(newPrTag)) {
            socket.send("Invalid private room name.");
            return;
          }
          
          ensureRoom(newPrTag, user, socket);

          user.prtag = newPrTag;
          return;
        }

      // ===================== HELP =====================

      if (msg === "/help") {
        for (const k of cmdliststring) {
            socket.send(k);
        }
        return;
      }

      // ===================== LOG OUT =====================

      if (msg == "/logout") {
            if (user.sessionToken) {
                db.ref("sessions/" + user.sessionToken).remove();
            }
            user.username = null;
            user.pass = null;
            user.admin = false;
            user.mod = false;
            user.moniker = "UNKNOWN";
            user.loggedIn = false;
            user.sessionToken = null;
            socket.send("Logged out successfully");
            return;
          }

      // ===================== LOGIN =====================

      if (data && data.type === "login") {
        try {
            socket.send("Processing login...");

            const userin = data.v1;
            const passin = data.v2;

            if (user.loggedIn) {
                socket.send("Already logged in");
                return;
            }

            let acc = null;
            const snapshot = await db.ref("logindata/accountdata").once("value");
            let newaccount = 0;
            snapshot.forEach(child => {
                const val = child.val();
                if (val.user === userin && val.pass === passin) {
                    acc = new Account(val.user, val.pass, val.admin, val.mod, val.disp);
                    newaccount++;
                }
                if(val.user === userin && val.pass !== passin){
                    acc = null;
                    newaccount++;
                }
            });

            if(newaccount == 0){
              ensureAccount(userin, passin);
              acc = new Account(userin, passin, false, false, userin);
              user.username = userin;
              user.pass = passin;
              user.moniker = userin;
              user.admin = false;
              user.mod = false;
              user.loggedIn = true;
              socket.send("New account created and logged in as " + userin);
              
              db.ref("logindata/accountdata/").push({
                user: userin, 
                pass: passin,   
                disp: userin,
                admin: false,
                mod: false
              });
              return;
            }
            if (!acc) {
                socket.send("Incorrect sign-in data");
                return;
            }

            user.username = acc.user;
            user.pass = acc.pass;
            user.moniker = acc.disp || acc.user;
            user.admin = !!acc.admin;
            user.mod = !!acc.mod;
            user.loggedIn = true;

            socket.send("Login successful");
          
            // ======== Token Creation ========
            socket.send("Starting token creation process...");
          
            const token = require("crypto").randomBytes(16).toString("hex");

            socket.send("Token created!");
            db.ref("sessions/" + token).set({
              username: acc.user,
              pass: acc.pass,
              admin: acc.admin,
              mod: acc.mod,
              disp: acc.disp
            });
            user.sessionToken = token;
            socket.send(JSON.stringify({type: "sessionToken", tokenid: token}));
          
            socket.send("Session token sucessfully uploaded and distributed!!");
            return;

        } catch (err) {
            console.error("Login error:", err);
            return;
        }
      }

      if (!user.loggedIn) {
          socket.send("Login required.");
          return;
      }

      // ============================================================
      // ======================= COMMAND MODE =======================
      // ============================================================
      if(msg == "/cmd"){
        socket.send("Command Mode Activated. Do /cmdoff to disable.");
        command = true;
        return;
      }

      if (command) {

        // ===================== STRIKE MESSAGE =====================

        if (msg == "/strikemsg") {
          console.log("Striked 1");
          history[user.prtag].pop();
          let taggedMessage = JSON.stringify({ type: "strikemsg" });
          for (const [client, cUser] of clients) {
            if (client.readyState === WebSocket.OPEN && cUser.prtag === user.prtag) {
              client.send(taggedMessage);
            }
          }
          console.log("Console sent");
          db.ref("chatlog/" + user.prtag)
              .limitToLast(1)
              .once("value", snapshot => {
                  snapshot.forEach(child => child.ref.remove());
              });
          console.log("Message removed from memory.");
          socket.send("Message Removed.");
          return;
        }

        //====================== RESTRICT ROOM =====================

        if(msg == "/restrictroom" && user.admin){
          if(!restrictedRooms.includes(user.prtag)){
            restrictedRooms.push(user.prtag);
          }
          
          await db.ref("chatlog/" + user.prtag).set({
            restricted: true
          });
          socket.send("Room restricted. Only staff may message here from now on.");     
          return;
          
        }

        //======================= UNRESTRICT ROOM =====================
        
        if(msg == "/unrestrictroom" && user.admin){
          if(restrictedRooms.includes(user.prtag)){
            restrictedRooms = restrictedRooms.filter((restrictedRooms) => restrictedRooms !== user.prtag);
          }
          await db.ref("chatlog/" + user.prtag).set({
            restricted: false
          });
          socket.send("Room unrestricted. Regular users may message here again.");
          return;
        }

        // ===================== CLEAR HISTORY =====================

        if (msg == "/clearhist" && user.admin) {

          history[user.prtag] = [];
          let taggedMessage = JSON.stringify({ type: "clearHistory" });
          for (const [client, cUser] of clients) {
            if (client.readyState === WebSocket.OPEN && cUser.prtag === user.prtag) {
              client.send(taggedMessage);
            }
          }
          db.ref("chatlog/" + user.prtag).remove();
          return;
        }

        // ===================== GET PRIVATE ROOM LIST =====================

        if (msg == "/getprlist" && user.mod) {

          socket.send("====Available Rooms====");

          for (const p of Object.keys(history)) {
              socket.send(p);
          }
          return;
        }

        // ===================== GET HISTORY LENGTH =====================

        if (msg === "/gethistlength" && user.admin) {
  
            /*socket.send("=== /gethistlength DEBUG START ===");
            socket.send("user.prtag:", user.prtag);
            socket.send("type:", typeof history[user.prtag]);
            socket.send("isArray:", Array.isArray(history[user.prtag]));
            socket.send("=== /gethistlength DEBUG END ===");*/

            if (!Array.isArray(history[user.prtag])) {
              socket.send("Server error: history for room is not an array.");
              return;
            }

            socket.send("Length: " + history[user.prtag].length);
            return;
        }

        // ===================== DELETE ROOM =====================

        if (msg == "/delroom" && user.admin) {

          if (user.prtag == "main") {

            socket.send("Room 'main' cannot be removed");
            return;

          } else {

              let previoustag = user.prtag;
              user.prtag = "main";

              socket.send(JSON.stringify({ type: "clearHistory" }));

              for (const line of history["main"]) {
                  socket.send(line);
              }

              for (const [client, cUser] of clients) {
                  if (cUser.prtag == previoustag) {
                      cUser.prtag = "main";
                  }
              }
  
              db.ref("chatlog/" + previoustag).remove();
              delete history[previoustag];
  
              socket.send("Room removed; User moved to room 'main'");
              return;
          }
        }

        // ===================== GET PLAYER LOCATION =====================

        if (msg == "/getPlayerLoc" && user.admin) {

          for (const [client, cUser] of clients) {
              if (client.readyState === WebSocket.OPEN && cUser.active) {
                  socket.send(cUser.moniker);
                  socket.send(cUser.prtag);
              }
          }

          return;
        }

        // ===================== GIVE SELF MOD =====================

        if (msg == "/giveSelfMod" && user.admin) {
          user.mod = true;
          updateLoginPermData(user, db);
          return;
        }

        // ===================== GIVE OTHER MOD =====================

        if (msg == "/giveOtherMod" && user.admin) {

          socket.send("Please input the username of the user you wish to give mod privileges to");
          user.awaitingModTarget = true;
          return;
        }
//Random indent for some reason?
          // ===================== GIVE OTHER ADMIN =====================

          if (msg == "/giveOtherAdmin" && user.admin) {

              socket.send("Please input the username of the user you wish to give admin to");
              user.awaitingAdminTarget = true;
          return;
          }

          // ===================== HANDLE ADMIN TARGET =====================
  
          if (user.awaitingAdminTarget) {

            clients.forEach((cUser, client) => {

                if (cUser.moniker === msg) {

                    cUser.admin = true;
                    cUser.mod = true;

                    client.send("You have been given admin privileges by " + user.moniker);
                    socket.send("Admin privileges given to " + user.awaitingAdminTarget);
                    updateLoginPermData(cUser, db);

                    user.awaitingAdminTarget = false;
                }
            });
          }

          // ===================== HANDLE MOD TARGET =====================

          if (user.awaitingModTarget) {

            clients.forEach((cUser, client) => {

                if (cUser.moniker === msg) {

                    cUser.mod = true;

                    client.send("You have been given mod privileges by " + user.moniker);
                    socket.send("Mod privileges given to " + user.awaitingModTarget);
                    updateLoginPermData(cUser, db);
                    user.awaitingModTarget = false;
                }
            });
          }

          // ===================== COMMAND MODE OFF =====================

          if (msg == "/cmdoff") {
            socket.send("Command Mode Deactivated");
            command = false;
            return;
          }
      }

      // ===================== NORMAL CHAT =====================

      const timestamp = new Date().toLocaleTimeString("en-US", {
        timeZone: "America/Chicago",
        hour12: true
      });

      if(data && data.type === "login"){
        return;
      } //super janky catch that prevents the login from being sent because its kind of broken xD

      let taggedString = `(${timestamp}) | ${user.moniker}: ${msg}`;
      

      if (user.admin) {
        taggedString = `(${timestamp}) | [ADMIN] ${user.moniker}: ${msg}`;
      } else if (user.mod) {
        taggedString = `(${timestamp}) | [MOD] ${user.moniker}: ${msg}`;
      }
      //socket.send("String generated");
      try{
        if(restrictedRooms.includes(user.prtag) && !(user.mod || user.admin)){
          socket.send("Room is restricted. Only staff may message here.");
          return;
        }
      } catch(err){
        console.log("ERROR WITH RESTRICTED ROOMS");
      }
      //socket.send("Message Generating");

      
      const taggedMessage = JSON.stringify({
        message: taggedString,
        prtag: user.prtag,
        datatype: "chat"
      });
     // socket.send("Message Generated");
      //socket.send("Sending to history...");
      history[user.prtag].push(taggedMessage);

      if (history[user.prtag].length > 200) {
        history[user.prtag].shift();
      }
      //socket.send("History trimmed");

      db.ref("chatlog/" + user.prtag).push({ taggedMessage });
      //socket.send("Message being broadcasted");
      for (const [client, cUser] of clients) {
        if (client.readyState === WebSocket.OPEN && cUser.prtag === user.prtag) {
            client.send(taggedMessage);
        }
      }

      //socket.send("Mesage broadcasted!");
      return;
    
    });

    

    socket.on("close", () => {
        const user = clients.get(socket);
        const moniker = user ? user.moniker : "Anonymous";
        console.log(`Client disconnected: ${moniker}`);
        clients.delete(socket);

    });
});
