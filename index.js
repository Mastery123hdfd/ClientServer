process.on("exit", code => {
  console.error("PROCESS EXITED WITH CODE:", code);
});


async function getAdmin(){
  const admin = require("firebase-admin");  
  return admin;
}




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


async function initMega() {
  const { Storage } = require('megajs');
    try {
        let megaDB = await new Storage({
            email: process.env.MEGA_EMAIL, password: process.env.MEGA_PASSWORD
        });
        megaDB.on('ready', () => {
          console.log("MEGA filesystem loaded.");
        });
        console.log("MEGA connected");
        return megaDB;
    } catch (err) {
        console.error("MEGA INIT ERROR:", err);
        setTimeout(initMega, 3000); // retry
    }
}

async function changePrTag(tag, user, socket){
  const newPrTag = tag;
          if (!ValidateName(newPrTag)) {
            socket.send("Invalid private room name.");
            return;
          }
          
          await ensureRoom(newPrTag, user, socket);
          
          user.prtag = newPrTag;

          for(const line of history[newPrTag]){
            try {
              if (isJson(line)) {
                const data = JSON.parse(line.toString());
                if (data.type === "regmeta" || data.type === "imgmeta") {
                  socket.send(JSON.stringify(data));
                  
                  const file = await downloadFromMega(data.id);
                  console.log("image in room " + newPrTag + " loaded: " + data.name);
                  socket.send(file, { binary: true });
                } else {
                  socket.send(line);
                }
              }
              else{
                socket.send(line);
              }
            } catch (e) {
              console.error("Error sending MEGA file:", e);
            }
          }
          return;
}

const http = require("http");
const WebSocket = require("ws");

const port = process.env.PORT || 10000;

// Create ONE HTTP server
const httpServer = http.createServer((req, res) => {
    if (req.url === "/debugbin") {
        const fs = require("fs");
        try {
            const data = fs.readFileSync("mega_yokiad.bin");
            res.writeHead(200, {
                "Content-Type": "application/octet-stream",
                "Content-Disposition": "attachment; filename=mega_yokiad.bin"
            });
            res.end(data);
        } catch (err) {
            res.writeHead(404);
            res.end("No debug file found");
        }
        return;
    }

    res.writeHead(200);
    res.end("Server is running");
});

// Attach WebSocket server to the SAME HTTP server
const server = new WebSocket.Server({ server: httpServer });


let megaDB = null;
let admin = null;
let db = null;

httpServer.listen(port, async () => {
    console.log("HTTP + WebSocket server running on port", port);

    console.log("Server ready");
    admin = await getAdmin();
    console.log("Firebase Admin received");
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
      databaseURL: process.env.FIREBASE_DB_URL
    });
    console.log("Firebase initialized!");
    db = admin.database();
    await loadFromFirebase(db);
    await loadAccounts(db);
   
    megaDB = await initMega();
    console.log("MEGA database loaded!");
});


function loadSession(token) {
  try{
  return db.ref("sessions/" + token).once("value").then(snap => snap.val());
  } catch(err){
    console.error("Error loading session:", err);
    return null;
  }
}




console.log("WebSocket server running on port", String(port).replace(/\n|\r/g, ""));

// Store monikers for each client
const clients = new Map();

// Proper history buffer
const history = {};

function ValidateName(name) {
    // Only allow alphanumeric, underscores, and hyphens
    // Prevents path traversal attempts like "../" or "..\\"
    if(name == "UNKNOWN") return false;
    return /^[A-Za-z0-9#{|}(). ]+$/.test(name) && name.length > 0 && name.length <= 50;

}


let restrictedRooms = [];

async function loadFromFirebase(db){
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
              else{
                try{
                  let data = null;
                  let raw = entry.toString();

                  if (raw.startsWith("{")) {
                    try {
                      data = JSON.parse(raw);
                    } catch (e) {
                      console.log("Invalid JSON from Firebase", raw);
                      return;
                    }
                    history[room].push(JSON.stringify(data));   
                  }
                } catch(err){
                  console.error("Error processing Firebase entry:", err);
                }
              }
            }); 
         const restricted = roomSnap.val().restriction;
         if(restricted && restricted == true){
           restrictedRooms.push(roomSnap.key);
         }
        }); 
      console.log("History loaded from Firebase"); 
    });
  } catch(err){
    console.error("Error loading history from Firebase:", err);
  }
}
function isJson(text){
  let data = null;
  let raw = text.toString();

  if (raw.startsWith("{")) {
      try {
          data = JSON.parse(raw);
      } catch (e) {
          console.log("Invalid JSON from client:", raw);
        return false;
      }
      return true;
    }
  return false;
}

//Loading from Mega
try{
  
} catch(err){
  console.error("Error Loading From MEGA");
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

async function ensureRoom(tag, user, socket) {
  if (!Array.isArray(history[tag])) {
    socket.send(JSON.stringify({ type: "clearHistoryChatless" }));
    if (user.mod || user.admin) {
      history[tag] = [];
      socket.send("Room created: " + tag);
      return true;
    } else {
      socket.send("Regular Users cannot create their own rooms. Use the room code given to you by a mod.");
      
      for (const line of history["main"]) {
        
        socket.send(line);
        continue;
      }

      return false;
    }
  }

  user.prtag = tag;

  return true;
}


const sharp = require('sharp');
function compressImage(buffer, mimeType) {
  const image = sharp(buffer);

  if (mimeType === "image/jpeg") {
    return image.jpeg({ quality: 70 }).toBuffer();
  } else if (mimeType === "image/png") {
    return image.png({ compressionLevel: 9 }).toBuffer();
  } else if (mimeType === "image/webp") {
    return image.webp({ quality: 70 }).toBuffer();
  } else if(mimeType === "image/gif") {
    return image.gif().toBuffer();
  }else if(mimeType === "image/avif") {
    return image.avif().toBuffer();
  }
  else {
    // fallback: no compression, just return the original buffer
    return buffer;
  }
}



async function createFolder(fold){
  const filedb = megaDB;
  return new Promise((resolve, reject) => {
    filedb.mkdir(fold, (err, folder) => {
      if (err) reject(err);
      else resolve(folder);
    });
  });
}

async function ensureFolder(fold) {
  if(!megaDB){
    console.log("Attempted to access ensureFolder("+fold+") before Mega startup!");
    return;
  }
  const filedb = megaDB;
  // Check if folder already exists
  for (const file of Object.values(filedb.files)) {
    if (file.name === fold && file.directory) {
      return file;
    }
  }
  return await createFolder(fold);
}

async function downloadFromMega(nodeId) {
  const filedb = megaDB;
  const file = megaDB.root.children.find(n => n.nodeId === nodeId);
  if (!file) throw new Error("File not found");

  return await new Promise((resolve, reject) => {
    const chunks = [];
    file.download()
      .on("data", c => chunks.push(c))
      .on("end", () => resolve(Buffer.concat(chunks)))
      .on("error", reject);
  });
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
  if (ValidateName(a.user)){
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
  if(ValidateName(a.user)){
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

  if (!ValidateName(a.user)) return;

  let snapshot;
  try {
    snapshot = await db.ref("sessions/" + token).once("value");
  } catch (err) {
    console.error("Error accessing session data:", err);
    return;
  }

  if (!snapshot.exists()) {
    console.log("Error! Session not found!");
    return;
  }

  await db.ref("sessions/" + token).update({
    mod: a.mod,
    admin: a.admin,
    disp: a.disp
  });
}


function convertUsertoAccount(user){
  return new Account(user.username, user.pass, user.admin, user.mod, user.moniker);
}

aclist = [];
modArray = [];
adminArray = [];
regArray = [];

async function loadAccounts(db){
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
}
//^Loads login data
function ensureAccount(user, pass){
  if (!ValidateName(user)) return false;
  if(loginfo[user]){
    return false;
  } else{
    const a = new Account(user, pass, false, false, user);
    loginfo[user]= pass;
    encodeLoginData(a, db);
    return true;
  }
}

//======================================================================================================
//======================================================================================================
//BANNING CODE
const bannedIPs = new Map();
//username, ip
//======================================================================================================
//========================================================================================================



server.on("connection", async (socket,req) => {
    console.log("Client connected");
    let firstmessage = true;
    let command = false;
    const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress;
    let ipBanArray = Array.from(bannedIPs.values())
    if(ipBanArray.includes(ip)){
      socket.send("You are banned. If you believe this is a mistake, please contact an admin.");
      socket.close();
      return;
    }
    

    
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
    let meta = null;
    changePrTag("main", clients.get(socket), socket);
    const user = clients.get(socket);
    await ensureRoom(user.prtag, user, socket);
    let received = 0;
    let receivedChunks = [];
    let filebuff = null;
    let sent;
    
          
  
  //===================================================================================================================
  //===================================================================================================================
  //==================================================Message Handler==================================================
  //===================================================================================================================
  //===================================================================================================================


    socket.on("message", async (msg, isBinary) => {
      if(!isBinary){
        console.log("WS: raw message:", msg.toString());
      } else if (isBinary){
        console.log("Binary received: " + isBinary + " length: " + msg.length);
      }
      
        if (! await ensureRoom(user.prtag, user, socket)) return;
      
        //==================== HANDLE ACTUAL DATA ==========================
        
        
        if(isBinary){
          if(!meta){
            console.log("No metadata sent!");
            return;
          }
          if (msg === undefined || msg === null) {
            console.log("Ignoring empty binary frame");
            return;
          }
          
          const fs = require("fs");
          console.log("Data received!!!");

          let megaSize = meta.size;

          received += msg.length;
          receivedChunks.push(msg);

          if(megaSize !== received){
            return;
          } else{
            received = 0;
            filebuff = Buffer.concat(receivedChunks);
          }
          console.log("FINAL LENGTH:" + filebuff.length);
          
          const filedb = megaDB;
          fs.writeFileSync("file_made.bin", filebuff);
          console.log("Written to file_made.bin");
          const targetFolder = megaDB.root;
          
          const up = targetFolder.upload({
            name: meta.name,
            size: meta.size
          });
          for (const chunk of receivedChunks) {
            up.write(chunk); 
          } // Finalize the stream 
          up.end();
          let id;
          up.on("complete", (file)=> {
            if(sent) return;
            console.log("Upload Complete");
            try{
              id = file.nodeId;
              sent = true;
              console.log("flag 'sent' marked true");
              for (const [client, cUser] of clients) {
                if (client.readyState === WebSocket.OPEN && cUser.prtag === user.prtag) {
                  let dat;
                    if(meta.isImg){

                      dat = (JSON.stringify({
                        type: "imgmeta",
                        name: meta.name,
                        size: meta.size,
                        mimetype: meta.type,
                        id: id
                      }));
                  //Compression removed for now, w/test/as causiHAO HAOHAOng some weird bugs and the performance hit isn't worth it for the small files we're dealing with, but will be re-added in the future with better error handling and support for more formats
                      
                      fs.writeFileSync("upload.bin", filebuff);

                      client.send(dat);
                      client.send(filebuff, { binary: true });
                    } else { 
                      dat = (JSON.stringify({
                        type: "regmeta",
                        name: meta.name,
                        size: meta.size,
                        mimetype: meta.type,
                        id: id
                      }));

                      fs.writeFileSync("upload.bin", filebuff);

                      client.send(dat);
                      client.send(filebuff, { binary: true });

                    }
                    console.log("SENT META TO CLIENTS: " + dat);
                    console.log("SENT FILES TO CLIENTS");
                
                    fs.writeFileSync("server_sent.bin", filebuff);
                    console.log("Wrote raw binary to server_sent.bin");

                    history[user.prtag].push(dat);
                    if(!sent){
                      db.ref("chatlog/" + user.prtag).push({dat});
                      sent =true;
                    }
                  continue;
                }
              }
            }
            catch (err){
              console.error("Error getting upload node id: ", err);
              id = "ERROR";
              sent = true;
            }
            
            
            fs.writeFileSync("mega_yokiad.bin", filebuff);
            console.log("Written to mega_yokiad.bin");
          
            filebuff = null;
            meta = null;
            receivedChunks = [];
            
          });
          return;
        }

        //====================== PARSE JSON ===============================
        
        let data = null;
        let raw = null;
        let text = "";
        if(!isBinary){
          raw = msg.toString();
          if (raw.startsWith("{")) {
            try {
                data = JSON.parse(raw);
            } catch (e) {
                console.log("Invalid JSON from client:", raw);
            }
          }
          text = data?.msg || raw;
        }

        if(text == "") return;

        user.active = true;

        if (firstmessage) {
            for (const line of history[user.prtag]) {
                socket.send(line);
                continue;
            }
            socket.send("Note; Storage is limited. Refrain from making Private Rooms if you don't have to. Report any bugs to the admins at 'Feedback' (The private room) or directly message me. Contact info at 'contact' (The private room). ");
            firstmessage = false;
        }

        //==================== HANDLE EMPTY MESSAGE ==========================
        if(text === ""){
          return;
        }

        // ===================== NAME CHANGE HANDLER =====================

        if (user.newName) {
            const newMoniker = text?.trim();

            if (!newMoniker || !ValidateName(newMoniker)) {
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

        if((text == "/changename" || text == "/changemoniker") && user.loggedIn){
          socket.send("Please input your new name.");
          user.newName = true;
          return;
        }

        // ===================== Get Users ========================

        if(text == "/getusers"){
          socket.send("================= USERS IN ROOM =================");
          for(const [client, cUser] of clients){
            if(client.readyState === WebSocket.OPEN && cUser.prtag === user.prtag){
              if(cUser.moniker !== "UNKNOWN"){
                socket.send("User: " + cUser.moniker);
              }
            }
          }
          return;
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
          if (!ValidateName(newPrTag)) {
            socket.send("Invalid private room name.");
            return;
          }
          
          await ensureRoom(newPrTag, user, socket);
          
          user.prtag = newPrTag;

          for(const line of history[newPrTag]){
            try {
              if (isJson(line)) {
                const data = JSON.parse(line.toString());
                if (data.type === "regmeta" || data.type === "imgmeta") {
                  socket.send(JSON.stringify(data));
                  
                  const file = await downloadFromMega(data.id);
                  console.log("image in room " + newPrTag + " loaded: " + data.name);
                  socket.send(file, { binary: true });
                } else {
                  socket.send(line);
                }
              }
              else{
                socket.send(line);
              }
            } catch (e) {
              console.error("Error sending MEGA file:", e);
            }
          }
          return;
        }

        //========================== Image Meta Handler ===============================
        if(data && data.type === "imgmeta"){
          meta = {name: data.msg, size: data.v1, type: data.v2, isImg: true, prtag: data.prtag};
          console.log("Image Meta created: "+  meta.name);
          receivedChunks = [];
          sent = false;
          return;
        }
      
        //=========================== Reg Meta Handler ================================
        if(data && data.type === "regmeta"){
          meta = {name: data.msg, size: data.v1, type: data.v2, isImg: false, prtag: data.prtag};
          console.log("Non-image Meta Created: "+ meta.name);
          receivedChunks = [];
          sent = false;
          return;
        }

      // ===================== HELP =====================

      if (text === "/help") {
        for (const k of cmdliststring) {
            socket.send(k);
        }
        return;
      }

      // ===================== LOG OUT =====================

      if (text == "/logout") {
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
            user.admin = acc.admin;
            user.mod = acc.mod;
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
      if(text == "/cmd" && user.mod == true){
        socket.send("Command Mode Activated. Do /cmdoff to disable.");
        command = true;
        return;
      }

      if (command) {

        // ===================== STRIKE MESSAGE =====================

        if (text == "/strikemsg") {
          console.log("Striked 1");
          const removed = history[user.prtag].pop();
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
          const file = megaDB.root.children.find(n => n.nodeId === JSON.parse(removed).id);
          if(!file){
            console.log("Invalid node id");
            return;
          }
          await file.delete(permament);
          console.log("Message removed from memory.");
          socket.send("Message Removed.");
          return;
        }
        // ===================== BAN USER ==========================
        if (text == "/banuser" && user.admin) {
          socket.send("Please input the username of the user you wish to ban");
          user.awaitingBanTarget = true;
          return;
        }

        // ===================== HANDLE BAN TARGET ==========================

        if (user.awaitingBanTarget == true) {
          clients.forEach((cUser, client) => {
            if (cUser.moniker === text) {
              if (client._socket && client._socket.remoteAddress) {
                const ip = client._socket.remoteAddress;
                if (!bannedIPs.has(text)) {
                  bannedIPs.set(cUser.moniker, ip);
                }
              }
              client.send("You have been banned by " + user.moniker);
              client.close();
              socket.send("User " + user.awaitingBanTarget + " has been banned.");
              user.awaitingBanTarget = false;
            }
          });
          return;
        } // I didn't do anything?

        // ====================== UNBAN USERS =======================
        
        if (text == "/unban" && user.admin) {
          socket.send("Please input the username of the user you wish to unban");
          user.awaitingUnbanTarget = true;
          return;
        }
        
        // ===================== HANDLE UNBAN TARGET ==========================

        if(user.awaitingUnbanTarget == true){
          if(bannedIPs.has(text)){
            bannedIPs.delete(text);
            socket.send("User " + text + " has been unbanned.");
          }
          
          user.awaitingUnbanTarget = false;
          return;
        }

        //====================== RESTRICT ROOM =====================

        if(text == "/restrictroom" && user.admin){
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
        
        if(text == "/unrestrictroom" && user.admin){
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

        if (text == "/clearhist" && user.admin) {
          for(const line of history[user.prtag]){
            try{
              if(isJson(line)){
                const data = JSON.parse(line.toString());
                if(data.type === "regmeta" || data.type === "imgmeta"){
                  const file = megaDB.root.children.find(n => n.nodeId === JSON.parse(line).id);
                    if(!file){
                      console.log("Invalid node id");
                      continue;
                    }
                  await file.delete(permament);
                }
              }
            }catch(err){
              console.error("Error during history clear:", err);
            }
          }
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

        if (text == "/getprlist" && user.mod) {

          socket.send("====Available Rooms====");

          for (const p of Object.keys(history)) {
              socket.send(p);
          }
          return;
        }

        // ===================== GET HISTORY LENGTH =====================

        if (text === "/gethistlength" && user.admin) {
  
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

        if (text == "/delroom" && user.admin) {

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

        if (text == "/getPlayerLoc" && user.admin) {

          for (const [client, cUser] of clients) {
              if (client.readyState === WebSocket.OPEN && cUser.active) {
                  socket.send(cUser.moniker);
                  socket.send(cUser.prtag);
              }
          }

          return;
        }

        // ===================== GIVE SELF MOD =====================

        if (text == "/giveSelfMod" && user.admin) {
          user.mod = true;
          updateLoginPermData(user, db);
          return;
        }

        // ===================== GIVE OTHER MOD =====================

        if (text == "/giveOtherMod" && user.admin) {

          socket.send("Please input the username of the user you wish to give mod privileges to");
          user.awaitingModTarget = true;
          return;
        }
//Random indent for some reason?
          // ===================== GIVE OTHER ADMIN =====================

          if (text == "/giveOtherAdmin" && user.admin) {

              socket.send("Please input the username of the user you wish to give admin to");
              user.awaitingAdminTarget = true;
          return;
          }

          // ===================== HANDLE ADMIN TARGET =====================
  
          if (user.awaitingAdminTarget == true) {

            clients.forEach((cUser, client) => {

                if (cUser.moniker === text) {

                    cUser.admin = true;
                    cUser.mod = true;

                    client.send("You have been given admin privileges by " + user.moniker);
                    socket.send("Admin privileges given to " + cUser.moniker);
                    let afromUser = convertUsertoAccount(cUser);
                    updateSession(afromUser, db, cUser.sessionToken);
                    db.ref("logindata/accountdata").once("value", snapshot => {
                      snapshot.forEach(child=>{
                        const val = child.val();
                        if(val.user === cUser.username && val.pass === cUser.pass){
                          child.ref.update({
                            admin: true,
                            mod: true
                          })
                        }
                      });
                    });
                    db.ref("sessions/"+cUser.sessionToken).update({
                      admin: true,
                      mod: true
                    });
                      
                    user.awaitingAdminTarget = false;
                }
            });
          }

          // ===================== HANDLE MOD TARGET =====================

          if (user.awaitingModTarget == true) {

            clients.forEach((cUser, client) => {

                if (cUser.moniker === text) {

                    cUser.mod = true;

                    client.send("You have been given mod privileges by " + user.moniker);
                    socket.send("Mod privileges given to " + cUser.moniker);
                    let afromUser = convertUsertoAccount(cUser);
                    updateSession(afromUser, db, cUser.sessionToken);
                    db.ref("logindata/accountdata").once("value", snapshot => {
                      snapshot.forEach(child=>{
                        const val = child.val();
                        if(val.user === cUser.username && val.pass === cUser.pass){
                          child.ref.update({
                            mod: true
                          })
                        }
                      });
                    });
                    db.ref("sessions/"+cUser.sessionToken).update({
                      mod: true
                    });
                    user.awaitingModTarget = false;
                }
            });
          }

          // ===================== COMMAND MODE OFF =====================

          if (text == "/cmdoff") {
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

      if(data && data.type !== "empty" || isBinary){
        return;
      } //super janky catch that prevents the login from being sent because its kind of broken xD

      let taggedString = `(${timestamp}) | ${user.moniker}: ${text}`;
      

      if (user.admin) {
        taggedString = `(${timestamp}) | [ADMIN] ${user.moniker}: ${text}`;
      } else if (user.mod) {
        taggedString = `(${timestamp}) | [MOD] ${user.moniker}: ${text}`;
      }
      //socket.send("String generated");
      try{
        if(restrictedRooms.includes(user.prtag) && !(user.mod || user.admin)){
          socket.send("Room is restricted. Only staff may message here.");
          return;
        }
      } catch(err){
        console.log("ERROR WITH RESTRICTED ROOMS");
        return;
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

      if (history[user.prtag].length > 350) {
        let removed = history[user.prtag].shift();
        if(isJson(removed)){
          const file = megaDB.root.children.find(n => n.nodeId === JSON.parse(removed).id);
          if(!file){
            console.log("Invalid node id");
            return;
          }
          await file.delete(permament);
          
        }
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
