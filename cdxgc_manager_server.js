#!/usr/bin/env node
// ----------------------------
// Info:
// ----------------------------
// Title: cdxgc_manager_server.js
// Description: CDX Grey Cell Manager Server
// Author: Derek Yap <zangzi@gmail.com>
// License: MIT
// Version: 0.0.1
var version = "0.0.1";

// ----------------------------
// Requires:
// ----------------------------
// - Built-ins:
var main_https = null;
var https = require('https');
var path = require('path');
var util = require('util');	
var fs = require('fs');
var crypto = require('crypto');
var os = require('os');

// - Underscore
var _ = require('underscore');

// - Promises...
var when = require('when');

// - Random number generators:
var wellprng = require('well-rng');
var well = new wellprng();

// - Commander (Command Line Utility)
var cdxgc_man_args = require("commander");

// - Express and Routes Setup:
var express = require('express');
var routes = require('./routes');

// - socket.io:
var sioServer = require('socket.io');
var sio = null;

// - Redis -> Redis Driver/Adapter
var redis = require('redis');
var redispublish = null;

// - AMQP -> RabbitMQ Connection Library
var amqp = require('amqplib');
var coreChannel = null;

// - Logging
var winston = require('winston');
var logger = new (winston.Logger)({
	exitOnError: false,
	transports: [
		new (winston.transports.Console)({level: "debug", colorize: true, timestamp: true})//,
		//new (winston.transports.File)({ filename: 'info.log' })
	]//,
	// exceptionHandlers: [
	// 	new winston.transports.File({ filename: 'exceptions.log' })
	// ]
});
// - enable web server logging; pipe those log messages through winston
var winstonStream = {
    write: function(message, encoding){
        logger.info(message.slice(0, -1));
    }
};
// Log Errors:
function logErrors(err, req, res, next) {
  logger.error(err.stack);
  next(err);
}
// Client Error Handlers:
function clientErrorHandler(err, req, res, next) {
  if (req.xhr) {
    res.send(500, { error: 'Something failed!!' });
  } else {
    next(err);
  }
}
// "catch-all" error handler
function errorHandler(err, req, res, next) {
  res.status(500);
  res.render('error', { error: err });
}
// ----------------------------
// GLOBALS:
// ----------------------------
var WEB_SERVER_PORT = 3443;
var BASE_CERT_PATH = "/home/cdxgcserver/cdx_gc_certs2";
var CERT_OPTS = {
	cert: fs.readFileSync(BASE_CERT_PATH + '/manager/cert.pem'),
	key: fs.readFileSync(BASE_CERT_PATH + '/manager/key.pem'),
	// cert and key or
	// pfx: fs.readFileSync('../etc/client/keycert.p12'),
	//passphrase: 'kJppRZYkdm4Fc5xr',
	ca: [fs.readFileSync(BASE_CERT_PATH + '/rmqca/cacert.pem')]
};
var AMQP_EXCHANGE = "direct_cdxresults";
var AMQP_ROUTING_KEY = "task_results";
var AMQP_PORT = 5671;
//var AMQP_PORT = 5672;
var REDIS_PORT = 6379;
var REDIS_HOST = "127.0.0.1";

var REDIS_CMD_SUBSCRIPTION = "redis_cmd_sub";
var REDIS_MAL_SUBSCRIPTION = "redis_mal_sub";

// ----------------------------
// Commander:
// ----------------------------
cdxgc_man_args
	.version(version)
	.option('-wp, --web_port <port number>', 'Web Server Port (HTTPS Port Default: ' + WEB_SERVER_PORT +')', WEB_SERVER_PORT)
	.option('-ah, --amqp_host <server name or IP>', 'AMQP Server Host', os.hostname())
	.option('-ap, --amqp_port <port number>', 'AMQP Server Port', AMQP_PORT)
	.option('-rh, --redis_host <server name or IP>', 'Redis Server Host', REDIS_HOST)
	.option('-rp, --redis_port <port number>', 'Redis Server Port', REDIS_PORT)
	.parse(process.argv);

// ----------------------------
// Redis and AMQP:
// ----------------------------

var redisCmdRecieve = function (channel, message) {
	logger.debug("redisCmdRecieve :: channel: " + channel + " :: msg: " + message);
};

var starter = function() {
	var deferred = when.defer();

	logger.info("Starting CDX GC Manager");

	logger.info("Web Server Port: " + cdxgc_man_args.web_port);
	logger.info("AMQP Server: " + cdxgc_man_args.amqp_host);
	logger.info("AMQP Port: " + cdxgc_man_args.amqp_port);
	logger.info("Redis Server: " + cdxgc_man_args.redis_host);
	logger.info("Redis Port: " + cdxgc_man_args.redis_port);

	// Redis Setup:
	redispublish = redis.createClient(cdxgc_man_args.redis_port, cdxgc_man_args.redis_host);
    redispublish.on("connect", function (err) {
        logger.info("Redis Connected");
    });
    redispublish.on("error", function (err) {
        logger.error("Redis Error :: " + err);
    });

	deferred.resolve(true);
	return deferred.promise;
};

var logMessage = function(msg) {
	logger.info("AMQP :: [x] %s:'%s'",
				msg.fields.routingKey,
				msg.content.toString());
};

starter()
.then(function() {
	logger.info("AMQP :: Start");
	// AMQP Setup:
	var amqpServerURL = 'amqps://' + cdxgc_man_args.amqp_host + ':' + cdxgc_man_args.amqp_port;
	logger.info("AMQP :: URL: " + amqpServerURL);
	var amqpServer = amqp.connect(amqpServerURL, CERT_OPTS);
	amqpServer.then(function (amqpConn) {
		// Setup signals:
		process.on('SIGINT', function () {
			logger.info('SIGNAL: SIGINT caught: Closing connection.');
			amqpConn.close();
			process.exit(1); // May need to kick out.
		});
		process.on('SIGTERM', function () {
			logger.info('SIGNAL: SIGTERM caught: Closing connection.');
			amqpConn.close();
			process.exit(1); // May need to kick out.
		});
		
		return amqpConn.createChannel().then(function(ch) {
			coreChannel = ch;
			var ok = ch.assertExchange(AMQP_EXCHANGE, 'direct', {durable: false});

		    ok = ok.then(function() {
				logger.info('AMQP :: Exchange Asserted.');
				return ch.assertQueue('', {exclusive: true});
		    });

		    ok = ok.then(function(qok) {
				logger.info('AMQP :: Queue Asserted.');
				var queue = qok.queue;
				ch.bindQueue(queue, AMQP_EXCHANGE, AMQP_ROUTING_KEY);
				logger.info('AMQP :: Binding configured.');
				return queue;
		    });

		    ok = ok.then(function(queue) {
				logger.info('AMQP :: Consumer configured.');
				return ch.consume(queue, logMessage, {noAck: true});
		    });
			
		    return ok.then(function() {
				logger.info('AMQP :: [*] Waiting for task results.');
		    });
		});
		
	}).then(null,function (err) {
		logger.error("AMQP Error :: "+ err);
	});
});

// ----------------------------
// Express Setup Chain:
// ----------------------------
var app = express();

// all environments
app.set('port', process.env.PORT || cdxgc_man_args.web_port);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.use(express.favicon());
app.use(express.logger({stream:winstonStream}));
app.use(express.json());
app.use(express.urlencoded());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));
app.use(logErrors);
app.use(clientErrorHandler);
app.use(errorHandler);

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

// Routes:
app.get('/', routes.index);
app.get('/viewalltasks', routes.viewalltasks);
// Create HTTPS Server:
main_https = https.createServer(CERT_OPTS, app);
// Attach Socket.io
sio = sioServer(main_https);
// Inform on connections:
sio.on('connection',function () {
	logger.info("sio :: on-connection :: connection made.");
});
// Launch HTTPS Server:
main_https.listen(app.get('port'), function(){
	logger.info('Express server listening on port ' + app.get('port'));
});

