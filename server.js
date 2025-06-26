const WebSocket = require('ws');

const PORT = 8080; // You can change this port if necessary
const wss = new WebSocket.Server({ port: PORT });

console.log(`WebSocket server started on ws://localhost:${PORT}`);
console.log(`React App (Installation) should connect to: ws://<YOUR_COMPUTER_LAN_IP_OR_LOCALHOST>:${PORT}/?type=installation`);
console.log(`Remote Control (Phone) should connect to: ws://<YOUR_COMPUTER_LAN_IP>:${PORT}/`);


let installationClient = null;
const phoneClients = new Set(); // Use a Set to manage multiple phone clients

wss.on('connection', (ws, req) => {
    const clientType = req.url?.includes('?type=installation') ? 'installation' : 'phone';
    const clientIp = req.socket.remoteAddress;
    console.log(`${clientType} client connected from ${clientIp}. Path: ${req.url}`);

    if (clientType === 'installation') {
        if (installationClient && installationClient.readyState === WebSocket.OPEN) {
            console.log('An installation is already connected. Closing new connection.');
            ws.close(1000, "Installation already connected");
            return;
        }
        installationClient = ws;
        console.log('Installation connected.');

        ws.on('message', (message) => {
            phoneClients.forEach(phone => {
                if (phone.readyState === WebSocket.OPEN) {
                    try {
                        phone.send(message.toString());
                    } catch (e) {
                        console.error("[Server] Error sending to phone:", e);
                    }
                }
            });
        });

        ws.on('close', (code, reason) => {
            console.log(`Installation disconnected. Code: ${code}, Reason: ${String(reason)}`);
            if (installationClient === ws) {
                 installationClient = null;
            }
            phoneClients.forEach(phone => {
                if (phone.readyState === WebSocket.OPEN) {
                    phone.send(JSON.stringify({ type: 'installationDisconnected' }));
                }
            });
        });

        ws.on('error', (error) => {
            console.error('Installation WebSocket error:', error);
            if (installationClient === ws) {
                installationClient = null;
            }
        });

    } else { // clientType === 'phone'
        phoneClients.add(ws);
        console.log(`Phone connected. Total phones: ${phoneClients.size}`);
        
        if (installationClient && installationClient.readyState === WebSocket.OPEN) {
            try {
                installationClient.send(JSON.stringify({ type: 'phoneConnected', id: `phone_${Date.now()}` }));
            } catch (e) {
                console.error("[Server] Error notifying installation of new phone:", e);
            }
        }

        ws.on('message', (message) => {
            const messageString = message.toString();
            if (installationClient && installationClient.readyState === WebSocket.OPEN) {
                try {
                    installationClient.send(messageString);
                } catch (e) {
                    console.error("[Server] Error sending to installation:", e);
                }
            }
        });

        ws.on('close', (code, reason) => {
            phoneClients.delete(ws);
            console.log(`Phone disconnected. Total phones: ${phoneClients.size}. Code: ${code}, Reason: ${String(reason)}`);
            if (installationClient && installationClient.readyState === WebSocket.OPEN) {
                 try {
                    installationClient.send(JSON.stringify({ type: 'phoneDisconnected' })); 
                } catch (e) {
                    console.error("[Server] Error notifying installation of phone disconnect:", e);
                }
            }
        });

        ws.on('error', (error) => {
            console.error('Phone WebSocket error:', error);
            phoneClients.delete(ws);
        });
    }
    try {
      ws.send(JSON.stringify({type: "connectionAck", message: `Welcome, ${clientType} client from ${clientIp}!`}));
    } catch (e) {
      console.error("[Server] Error sending welcome ack:", e);
    }
});

console.log('WebSocket server setup complete.');