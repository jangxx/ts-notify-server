<h1>ts-notify-server</h1>

Connects to a TeamSpeak3 server and monitors it for connections. Clients can connect to this server and get notified about their friends connecting/disconnecting.

<strong>Usage: node ts-notify-server.js</strong>

The default port this server runs on is 60000. You can change this and other things in the ts-notify-server.json.

Example config 'ts-notify-server.json':
<pre>
{
	"name": "ServerQuery login name",
	"password": "ServerQuery login password",
	"port": 12345,
	"host": "example.com"
}
</pre>

<strong>IMPORTANT:</strong> 'name' and 'password' are not optional; If you omit them or if they're wrong the server won't work.
