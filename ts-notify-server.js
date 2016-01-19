var net = require('net');
var fs = require('fs');
var TeamSpeakClient = require('node-teamspeak');
var url = require('url');
var socketio = require('socket.io');
var util = require('util');

var config = {
	'port': 6000,
	'ts_name': undefined,
	'ts_password': undefined,
	'ts_host': 'localhost',
	'ts_port': 10011,
	'ts_sid' : 1,
	'output': true
}
if (fs.existsSync('ts-notify-server.json')) {
	var configFile = fs.readFileSync('ts-notify-server.json', {encoding: 'UTF-8'});
	var configFileConts = JSON.parse(configFile);
	for (i in configFileConts) {
		config[i] = configFileConts[i];
	}
}

if(!config.ts_name || !config.ts_password) {
	output('ts_name or ts_password is missing in the configuration. Please create a "ts-notify-server.json" and fix the config there.', 'ERROR', true);
}

var connectedClients = {};

var cl = new TeamSpeakClient(config.ts_host, config.ts_port);
cl.send('login', {client_login_name: config.ts_name, client_login_password: config.ts_password}, function(err, response) {
	cl.send('use', {sid: config.ts_sid}, function(err, response) {
		cl.send('clientlist', ['uid'], function(err, resp) {
			for(i in resp) {
				if(resp[i].client_type == 1) continue;
				connectedClients[resp[i].clid] = new TsClient(resp[i].client_nickname, resp[i].client_unique_identifier);
			}
			cl.send('servernotifyregister', {'event': 'server'}, function(err, response) {});
		});
	});
});
cl.on('cliententerview', function(evt) {
	if(evt.client_type == 1) return;
	output('Client ' + evt.client_nickname + ' connected [' + evt.client_unique_identifier + ']', 'EVENT');
	connectedClients[evt.clid] = new TsClient(evt.client_nickname, evt.client_unique_identifier);
	pushState("connected", evt.client_nickname, evt.client_unique_identifier);
});
cl.on('clientleftview', function(evt) {
	var cc = connectedClients[evt.clid];
	if (!cc) return;
	pushState("disconnected", cc.name, cc.id);
	output('Client ' + cc.name + ' disconnected [' + cc.id + ']', 'EVENT');
	delete connectedClients[evt.clid];
});

setInterval(function() {
	cl.send('version');
}, 7*60*1000)

var io = new socketio(config.port);
output("Server is listening on port " + config.port, "INFO");

io.on('connection', function(socket) {
	socket.subscriptions = [];
	
	socket.on('subscribe', function(data) {
		socket.subscriptions.push(data);
	});
});

function pushState(status, name, uid) {
	var sockets = io.sockets.connected;
	
	for (s in sockets) {
		if(sockets[s].subscriptions.indexOf(uid) != -1) {
			sockets[s].emit(status, name);
		}
	}
}

function output(text, tag, force) {
	if (!config.output && !force) return;
	util.log('[' + tag + '] ' + text);
}

function TsClient(name, uniqueid) {
	this.name = name;
	this.id = uniqueid;
}
