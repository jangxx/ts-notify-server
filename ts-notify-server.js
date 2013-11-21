var net = require('net');
var fs = require('fs');
var TeamSpeakClient = require('node-teamspeak');
var url = require('url');
var restify = require('restify');

var config = {
	'port': 60000,
	'host': 'localhost',
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
var subClients = {};

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
	pushState(1, evt.client_nickname, evt.client_unique_identifier);
});
cl.on('clientleftview', function(evt) {
	var cc = connectedClients[evt.clid];
	if (!cc) return;
	pushState(2, cc.name, cc.id);
	output('Client ' + cc.name + ' disconnected [' + cc.id + ']', 'EVENT');
	delete connectedClients[evt.clid];
});

setInterval(function() {
	cl.send('version');
	for(i in subClients) {
		if(subClients[i].inactiveSince + 1000*60*60*12 < (new Date()).getTime()) {
			subClients[i].connection.closeConnection();
			delete subClients[i];
			output('SubClient (' + i + ') was deleted [inactive for 12h]', 'INFO');
			continue;
		}
		if(subClients[i].connection == undefined && subClients[i].inactiveSince + 1000*60*10 < (new Date()).getTime()) {
			delete subClients[i];
			output('SubClient (' + i + ') was deleted [no sse connection made in >10min]', 'INFO');
			continue;
		}
	}
}, 7*60*1000)

var server = restify.createServer({name: 'ts-notify-server'});
server.use(restify.queryParser());
server.use(restify.bodyParser());
server.get('/init', function(req, res, next) {
	var newId = generateId();
	subClients[newId] = new SubClient(newId);
	res.json(200, {'id': newId});
	output('A new SubClient has signed up (' + newId + ')', 'INFO');
});
server.get('/getsubscriptions', function(req, res, next) {
	var p = verifyParams(req.query, ["id"], res);
	if(subClients[p.id] == undefined) {
		res.send(400, 'Unknown Id');
		return;
	}
	var result = [];
	for(i in subClients[p.id].subsciptions) {
		if (subClients[p.id].subsciptions[i]) result.push(i);
	}
	res.json(200, result);
});
server.post('/subscribe', function(req, res, next) {
	var p = verifyParams(req.params, ["id", "userid"], res);
	if(subClients[p.id] == undefined) {
		res.send(400, 'Unknown Id');
		return;
	}
	subClients[p.id].subscriptions[p.userid] = true;
	res.send(200);
});
server.post('/unsubscribe', function(req, res, next) {
	var p = verifyParams(req.params, ["id", "userid"], res);
	if(subClients[p.id] == undefined) {
		res.send(400, 'Unknown Id');
		return;
	}
	if (subClients[p.id].subscriptions[p.userid])
		subClients[p.id].subscriptions[p.userid] = false;
	res.send(200);
});
server.get('/event', function(req, res) {
	var p = verifyParams(req.query, ["id"], res);
	if(subClients[p.id] == undefined) {
		res.send(400, 'Unknown Id');
		return;
	}
	res.connection.setTimeout(0);
	subClients[p.id].inactiveSince = (new Date()).getTime();
	subClients[p.id].connection = new SSEConnection(res);
	subClients[p.id].connection.init();
	subClients[p.id].connection.send('success');
});

server.listen(config.port, config.host, function() {
	output(server.name + ' running on ' + server.url, 'INFO');
});

function SubClient(id) {
	this.subscriptions = {};
	this.connection;
	this.id = id;
	this.inactiveSince = (new Date()).getTime();
}

function SSEConnection(res) {
	var connection = res;
	var standing = true;
	
	connection.on('close', function() {
		standing = false;
	});
	
	this.closeConnection = function() {
		if(standing) connection.end('closed');
	}
	this.init = function() {
		connection.status(200);
		connection.header('Content-Type','text/event-stream');
		connection.header('Cache-Control', 'no-cache');
		connection.header('Connection','keep-alive');
	}
	this.send = function(data) {
		if (standing) connection.write('data: ' + JSON.stringify(data) + '\n\n');
	}
}

function pushState(status, name, uid) {
	var updateObj = {
		'status': status,
		'name': name
	}
	var update = JSON.stringify(updateObj);
	for (i in subClients) {
		var sC = subClients[i];
		if (sC.subscriptions[uid] == true) {
			sC.connection.send(updateObj);
		}
	}
}

function verifyParams(given, needed, res) {
	for(i in needed) {
		if(given[needed[i]] == undefined) {
			res.send(new restify.MissingParameterError(needed[i]));
			return;
		}
	}
	return given;
}

function generateId() {
	var id = (new Date()).getTime();
	while(subClients[id] != undefined) {
		id = (new Date()).getTime();
	}
	return id;
}

function output(text, tag, force) {
	if (!config.output && !force) return;
	var _d = new Date();
	console.log("[" + ('0' + _d.getDate()).slice(-2) + "." + ('0' + (_d.getMonth()+1)).slice(-2) + "." + _d.getFullYear() + " " + ('0' + _d.getHours()).slice(-2) + ":" + ('0' + _d.getMinutes()).slice(-2) + ":" + ('0' + _d.getSeconds()).slice(-2) + "]" + (tag != undefined ? "[" + tag + "] " : " ") + text);
}

function TsClient(name, uniqueid) {
	this.name = name;
	this.id = uniqueid;
}