var net = require('net');
var fs = require('fs');

var config = {
	'port': 60000,
	'host': undefined,
	'name': undefined,
	'password': undefined,
	'output': true
}
if (fs.existsSync('ts-notify-server.json')) {
	var configFile = fs.readFileSync('ts-notify-server.json', {encoding: 'UTF-8'});
	var configFileConts = JSON.parse(configFile);
	for (i in configFileConts) {
		config[i] = configFileConts[i];
	}
}
var commandQueue = [
{cmd: 'use 1', fn: noop},
{cmd:'login ' + config.name + ' ' + config.password, fn: noop},
{cmd:'servernotifyregister event=server', fn: noop},
{cmd: 'clientlist -uid', fn: function(input) {
	var clients = input.split('|');
	clients.forEach(function(e) {
		var _args = e.split(' ');
		var args = {};
		for(i in _args) {
			var arg = _args[i].split('=');
			args[arg[0]] = arg[1];
		}
		if (args.client_unique_identifier == "ServerQuery") return;
		connectedClients[args.clid] = new Client(args.client_nickname, args.client_unique_identifier);
	});
}}
];
var queuePos = 0;
var connectedClients = {};
var connectedSockets = {};
var socketId = 1;
server = net.createServer();
socket = net.connect(10011, 'localhost');

socket.on('data', function(data) {
	if (queuePos-1 > 0 && commandQueue[queuePos-1].fn != noop) {
		commandQueue[queuePos-1].fn(data.toString());
		commandQueue[queuePos-1].fn = noop;
		return;
	}
	if (commandQueue.length > queuePos) {
		socket.write(commandQueue[queuePos].cmd + "\n");
		queuePos++;
	} else {
		answer = parseAnswer(data.toString());
		if (answer.args.client_unique_identifier == "ServerQuery") return;
		switch (answer.name) {
			case 'notifycliententerview':
				output('Client ' + answer.args.client_nickname + ' connected [' + answer.args.client_unique_identifier + ']');
				pushState(1, answer.args.client_nickname, answer.args.client_unique_identifier);
				connectedClients[answer.args.clid] = new Client(answer.args.client_nickname, answer.args.client_unique_identifier);
			break;
			case 'notifyclientleftview':
				var cc = connectedClients[answer.args.clid];
				if (!cc) return;
				pushState(2, cc.name, cc.id);
				output('Client ' + cc.name + ' disconnected [' + cc.id + ']');
				delete connectedClients[answer.args.clid];
			break;
		}
	}
});

server.listen(config.port, config.host);
server.on('connection', function(sock) {
	var sC = new SocketClient(socketId, sock);
	connectedSockets[sC.id] = sC;
	output('Socket ' + socketId + ' connected');
	sock.write('ok\n');
	socketId++;
	
	sock.on('close', function() {
		delete connectedSockets[sC.id];
	});
	sock.on('data', function(data) {
		if (data.toString().trim() == 'quit') {
			sock.end();
			return;
		}
		try {
			var req = JSON.parse(data.toString());
			switch(true) {
				case checkArgs('subscribe', ['uid'], req):
					sC.subscriptions[req.uid] = true;
					sock.write('ok\n');
					break;
				case checkArgs('unsubscribe', ['uid'], req):
					sC.subscriptions[req.uid] = false;
					sock.write('ok\n');
					break;
				default:
					sock.write('error\n');
					break;
			}
		} catch(e) {
			sock.write('error\n');
		} 
	});
});

function checkArgs(name, needed, given) {
	if (name != given.request) return false;
	for(i in needed) {
		if(given[needed[i]] == undefined) {
			return false;
		}
	}
	return true;
}

//status: 1=connect | 2=disconnect
function pushState(status, name, uid) {
	var updateObj = {
		'status': status,
		'name': name
	}
	var update = JSON.stringify(updateObj);
	for (i in connectedSockets) {
		var sC = connectedSockets[i];
		if (sC.subscriptions[uid] == true) {
			sC.socket.write(update + '\n');
		}
	}
}

function output(text) {
	if (!config.output) return;
	var _d = new Date();
	console.log("[" + _d.getDate() + "." + (_d.getMonth()+1) + "." + _d.getFullYear() + " " + _d.getHours() + ":" + _d.getMinutes() + ":" + _d.getSeconds() + "] " + text);
}

function noop() {}

function parseAnswer(notify) {
	var split = notify.split(" ");
	var name = split[0];
	var args = {};
	for (var i = 1; i < split.length; i++) {
		var arg = split[i].split("=", 2);
		if (arg.length < 2) arg[1] = "";
		args[arg[0]] = tsunescape(arg[1]).replace('\n\r', '');
	}
	return {'name': name, 'args': args};
}

function Client(name, uniqueid) {
	this.name = name;
	this.id = uniqueid;
}

function SocketClient(id, socket) {
	this.socket = socket;
	this.subscriptions = [];
	this.id = id;
}

function tsunescape(s){
	var r = s.replace(/\\s/g, " ");	// Whitespace
	r = r.replace(/\\p/g, "|");		// Pipe
	r = r.replace(/\\n/g, "\n");	// Newline
	r = r.replace(/\\r/g, "\r");	// Carriage Return
	r = r.replace(/\\t/g, "\t");	// Tabu
	r = r.replace(/\\v/g, "\v");	// Vertical Tab
	r = r.replace(/\\\//g, "\/");	// Slash
	r = r.replace(/\\\\/g, "\\"); 	// Backslash
	return r;
}