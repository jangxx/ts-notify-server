<h1>ts-notify-server</h1>

Connects to a TeamSpeak3 server and monitors it for connections. Clients can connect to this server and get notified about their friends connecting/disconnecting.

<strong>Usage: node ts-notify-server.js</strong>

The default port this server runs on is 60000. You can change this and the address the server runs on in a ts-notify-server.json.

Example config 'ts-notify-server.json':
<pre>
{
	"port": 12345,
	"host": "example.com"
}
</pre>
