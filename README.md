<h1>ts-notify-server</h1>

Connects to a TeamSpeak3 server and monitors it for connections. Clients can connect to this server and get notified about their friends connecting/disconnecting via socket.io.

<strong>Usage: node ts-notify-server.js</strong>

The default port this server runs on is 6000. You can change this and other things in the ts-notify-server.json.

Example config 'ts-notify-server.json':
<pre>
{
	"ts_name": "ServerQuery login name",
	"ts_password": "ServerQuery login password",
	"ts_host": "localhost",
	"ts_port": 10011,
	"port": 6000,
	"host": "example.com",
	"output": true
}
</pre>

<strong>IMPORTANT:</strong> `ts_name` and `ts_password` are not optional; If you omit them or if they're wrong the server won't work.

<h2>API overview</h2>

The server communicates with the clients using socket.io.
To subscribe to the events of a certain client just emit a **subscribe** event with the *clientID* as data.

The server will then emit **connected** and **disconnected** events with the current nickname of the client as data.
