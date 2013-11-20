<h1>ts-notify-server</h1>

Connects to a TeamSpeak3 server and monitors it for connections. Clients can connect to this server and get notified about their friends connecting/disconnecting.
<strong>Update:</strong> Changed the server to be an EventSource-Server that you can configure to using a simple API.

<strong>Usage: node ts-notify-server.js</strong>

The default port this server runs on is 60000. You can change this and other things in the ts-notify-server.json.

Example config 'ts-notify-server.json':
<pre>
{
	"ts_name": "ServerQuery login name",
	"ts_password": "ServerQuery login password",
	"ts_host": "localhost",
	"ts_port": 10011,
	"port": 60000,
	"host": "example.com",
	"output": true
}
</pre>

<strong>IMPORTANT:</strong> 'ts_name' and 'ts_password' are not optional; If you omit them or if they're wrong the server won't work.

<h2>API overview</h2>
Note: All answers are in JSON format

<i>GET</i> <strong>/init</strong>

<u>Parameters</u>

* <i>none</i>
	
<u>Returns</u>

* <strong>id</strong>: An id representing your client on the server. Used to identify your requests.

---

<i>GET</i> <strong>/getsubscriptions</strong>

<u>Parameters</u>
	
* <strong>id</strong>: Your id as returned by /init
	
<u>Returns</u>

* <i>An array containing the uniqueIds you subscribed to</i>
	
---

<i>POST</i> <strong>/subscribe</strong>

<u>Parameters</u>

* <strong>id</strong>: Your id as returned by /init
* <strong>userid</strong>: The uniqueId you want to recieve updates about
	
<u>Returns</u>

* <i>HTTP 200 on success, an error otherwise</i>
	
---

<i>POST</i> <strong>/unsubscribe</strong>

<u>Parameters</u>

* <strong>id</strong>: Your id as returned by /init
* <strong>userid</strong>: The uniqueId you want to recieve updates about
	
<u>Returns</u>

* <i>HTTP 200 on success, an error otherwise</i>
	
---

<i>GET</i> <strong>/event</strong>

<u>Parameters</u>
	
* <strong>id</strong>: Your id as returned by /init
	
<u>Returns</u>

* <i>Returns HTTP 200, sets the Content-Type header to 'text/event-stream'. Point your EventSource to this endpoint</i>
