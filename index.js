const util = require('util');
const fs = require('fs');
const http = require('http');

const TeamSpeakClient = require('node-teamspeak');
const socketio = require('socket.io');
const async = require('async');
const ip = require('ip');
const express = require('express');
const bodyparser = require('body-parser');

const configjson = require('./config.json');

var serverquery = configjson.ts;
var cl = null;
var keepaliveInterval = null;

if(!serverquery.name || !serverquery.password || serverquery.name == "" || serverquery.password == "") {
	util.log("No serverquery credentials have been provided in the config.json");
	process.exit();
}

var connectedClients = {};

init();

var app = express();
app.use(bodyparser.json());

var localApi = express.Router();

localApi.use(function(req, resp, next) {
	if(ip.isLoopback(req.ip)) {
		next();
	} else {
		util.log("Invalid IP (" + req.ip + ") tried to access the API");
		resp.end();
	}
});

localApi.get("/clients", function(req, resp) {
	resp.send(connectedClients);
	resp.end();
});

app.use("/api", localApi);

var server = http.createServer(app);

var io = socketio(server, {
    serveClient: false
});

io.on('connection', function(socket) {
	socket.fullaccess_allowed = false;
	socket.fullaccess_granted = false;
	socket.subscriptions = [];

	if(ip.isLoopback(socket.client.request.connection.remoteAddress)) {
		socket.fullaccess_allowed = true;
	}

	socket.on('subscribe', function(data) {
		if (socket.subscriptions.length < configjson.max_subscriptions) {
			socket.subscriptions.push(data);
		}
	});

	socket.on('subscribe by dbid', function(data) {
		if(!Array.isArray(data)) return;

		if(socket.subscriptions.length + data.length < configjson.max_subscriptions) {
			socket.subscriptions = socket.subscriptions.concat(data);
		}
	});

	socket.on('apiaccess', function(data) {
		if (!socket.fullaccess_allowed) return;

		if (configjson.api_keys != undefined && fs.existsSync(configjson.api_keys)) {
			try {
				var api_keys = fs.readFileSync(configjson.api_keys, {encoding: "UTF-8"});
				api_keys = api_keys.trim().split('\n');
				api_keys = api_keys.filter( (n) => (n != "") ); //remove "empty lines"
			} catch(e) {
				util.log("Error while reading api keys: " + err.message);
				var api_keys = [];
			}

			if (api_keys.indexOf(data) != -1) {
				socket.fullaccess_granted = true;
				util.log("Socket " + socket.id + " was granted full API access");
			} else {
				util.log("The provided api key '" + data + "' is invalid");
			}
		}
	});
});

server.listen(configjson.port, configjson.address, function() {
	util.log("Server is listening on " + configjson.address + ":" + configjson.port);
});

function pushState(status, name, uid, dbid) {
	var sockets = io.sockets.connected;

	for (let s in sockets) {
		if(sockets[s].fullaccess_granted) {
			sockets[s].emit("event", {status: status, name: name, uid: uid});
			continue;
		}

		if(sockets[s].subscriptions.indexOf(uid) != -1 || sockets[s].subscriptions.indexOf(dbid) != -1) {
			sockets[s].emit(status, name);
		}
	}
}

function init() {
    if(keepaliveInterval != null) {
        clearInterval(keepaliveInterval);
        keepaliveInterval = null;
    }

    connect(serverquery.host, serverquery.port, serverquery.name, serverquery.password, function(err, client) {
        if(err) {
			if(err.message) {
				util.log("An error occured: " + err.message);
			} else {
				util.log("An error occured:");
				console.log(err);
			}
            setTimeout(function() {
                init();
            }, configjson.reconnect_delay);
        } else {
            util.log("Connection to teamspeak server established");
            cl = client;

            keepaliveInterval = setInterval(function() {
                if(cl != null) cl.send('version');
            }, configjson.keepalive_interval);

            cl.on('close', function() {
                util.log("Connection to teamspeak server lost");

                if(keepaliveInterval != null) {
                    clearInterval(keepaliveInterval);
                    keepaliveInterval = null;
                }

                setTimeout(function() {
                    init();
                }, configjson.reconnect_delay);
            });
        }
    });
}

function connect(address, port, username, password, callback) {
	var cl = new TeamSpeakClient(address, port);
	cl.on('connect', function() {
		async.series([
			function(callback) {
				cl.send('login', {client_login_name: username, client_login_password: password}, callback);
			},
			function(callback) {
				cl.send('use', {sid: 1}, callback);
			},
			function(callback) {
				cl.send('clientupdate', {client_nickname: "ts-notify-server"}, callback);
			},
			function(callback) {
				cl.send('clientlist', ['uid'], function(err, resp) {
					if (resp.length == undefined) { //convert resp to array if no clients are connected
						resp = [resp];
					}

					for(i in resp) {
						if(resp[i].client_type == 1) continue; //skip serverquery clients
						connectedClients[resp[i].clid] = {
							name: resp[i].client_nickname,
							uniqueId: resp[i].client_unique_identifier,
							dbid: resp[i].client_database_id
						};
					}
					callback(null);
				});
			},
			function(callback) {
				cl.send('servernotifyregister', {'event': 'server'}, callback);
			}
		], function(err) {
			if(err) {
				util.log("Connection to teamspeak server failed");
				cl.end();
				callback(err);
			} else {
				//setting up required event listeners
				cl.on('cliententerview', function(evt) {
					if(evt.client_type == 1) return; //ignore serverqueries
					util.log('Client ' + evt.client_nickname + ' connected [' + evt.client_unique_identifier + ']');
					connectedClients[evt.clid] = {
						name: evt.client_nickname,
						uniqueId: evt.client_unique_identifier,
						dbid: evt.client_database_id
					};
					pushState("connected", evt.client_nickname, evt.client_unique_identifier, evt.client_database_id);
				});

				cl.on('clientleftview', function(evt) {
					var cc = connectedClients[evt.clid];
					if (!cc) return;
					pushState("disconnected", cc.name, cc.uniqueId, cc.dbid);
					util.log('Client ' + cc.name + ' disconnected [' + cc.uniqueId + '] [' + cc.dbid + ']');
					delete connectedClients[evt.clid];
				});

				callback(null, cl);
			}
		});
	});
}
