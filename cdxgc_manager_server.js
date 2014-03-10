#!/usr/bin/env node
// ----------------------------
// Info:
// ----------------------------
// Title: cdxgc_manager_server.js
// Description: CDX Grey Cell Manager Server
// Author: Derek Yap <zangzi@gmail.com>
// License: MIT
// Version: 0.0.1
var version = '0.0.1';

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
var cdxgc_man_args = require('commander');

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
		new (winston.transports.Console)({level: 'debug', colorize: true, timestamp: true})//,
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
// 'catch-all' error handler
function errorHandler(err, req, res, next) {
  res.status(500);
  res.render('error', { error: err });
}
// ----------------------------
// GLOBALS:
// ----------------------------
var POSSIBLE_SEED_KEY = [
'=Z<x.hVR87OG&gc,N!WfS7vv#cuanX|eyc{0mz6v]:zQ`>*x?m?-tvv#RAP&:1B)}<Y&rX!zOG3I[b=M:t`EXSP/t>Dv9pS/@;BSnn!4DuE`=]zgl0<l+YY&)%M*|hBWx4WGE6Tknlu5mJv}-H&x>ZRvu_(NmAdk@Ua.w,#e5VVG+lD=KJ+#[&-X&OnC[+aIY:MI|5rw,,;C>.w#/Q)^!c3!Sz1|vqg6v@!o+^vA!,~ux)~1hi-c~.)#OuY_0?4+',
'Q+{]-H_dgFAl`bhw%f1{yv~IdV1FS*s:e$v:gVE*J]Iv4aXwzf!`pEOm/+*BxZvpjHA7H=_^qg|?v{}XB8*6:d&~B+m7tv}@WV~<59b$q$z|!N&jZbm?LUR@[U6I$+{t7iiT~PvJ=JTC)SgH~CO78)=c$Hqh$f~xneBpv;Uu#zwh6DmI&Fuvl6`0|_9fTRpj=cFGQ;*LS"(|u$%`yb{/TUz<Fi<Y/,(N_|jpf]1Y4r!zI$R+pO#rU*gI-w74sK^3',
'*Ef;}$Y:p`zinV~4}eA6IVbcWs0DRavU~Hc(ox1ooNMJlxo;hEvN/vVt[q-xQMDS_;[~UrntFZdP72<=UlQvKb.8~F{eo%&z(PGf0KcxZC5B.k}H?]Z8v}7X}IhBi(s)T`6d>7pO(3x/vEK^p&gm,wL-gF9ux?GoqojLiA;{Tlxf-bhMpxar-J>b[G6:~Icbz8Py?a8l;_rZ4TPd<w&0y$~QWt(b"i8[VAixi"s_O-Y>cShb-mE_q1xm|3/2~%?Y'
];
var WEB_SERVER_PORT = 3443;
var BASE_CERT_PATH = '/home/cdxgcserver/cdx_gc_certs2';
var CERT_OPTS = {
	cert: fs.readFileSync(BASE_CERT_PATH + '/manager/cert.pem'),
	key: fs.readFileSync(BASE_CERT_PATH + '/manager/key.pem'),
	// cert and key or
	// pfx: fs.readFileSync('../etc/client/keycert.p12'),
	//passphrase: 'kJppRZYkdm4Fc5xr',
	ca: [fs.readFileSync(BASE_CERT_PATH + '/rmqca/cacert.pem')]
};
var AMQP_EXCHANGE = 'direct_cdxresults';
var AMQP_ROUTING_KEY = 'task_results';
var AMQP_PORT = 5671;
//var AMQP_PORT = 5672;
var REDIS_PORT = 6379;
var REDIS_HOST = '127.0.0.1';

var REDIS_CMD_SUBSCRIPTION = 'redis_cmd_sub';
var REDIS_MAL_SUBSCRIPTION = 'redis_mal_sub';
var REDIS_SENT_HEADER = 'sent_meta_';
var REDIS_SENT_ORDER_KEY = 'cdx_sent_order';
var REDIS_MAL_HEADER = 'mal_meta_';
var REDIS_MAL_ORDER_KEY = 'cdx_mal_order';

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
	logger.debug('redisCmdRecieve :: channel: ' + channel + ' :: msg: ' + message);
};

var starter = function() {
	var deferred = when.defer();

	logger.info('Starting CDX GC Manager');

	logger.info('Web Server Port: ' + cdxgc_man_args.web_port);
	logger.info('AMQP Server: ' + cdxgc_man_args.amqp_host);
	logger.info('AMQP Port: ' + cdxgc_man_args.amqp_port);
	logger.info('Redis Server: ' + cdxgc_man_args.redis_host);
	logger.info('Redis Port: ' + cdxgc_man_args.redis_port);

	// Redis Setup:
	redisclient = redis.createClient(cdxgc_man_args.redis_port, cdxgc_man_args.redis_host);
	redispublish = redis.createClient(cdxgc_man_args.redis_port, cdxgc_man_args.redis_host);
    redispublish.on('connect', function (err) {
        logger.info('Redis Connected');
    });
    redispublish.on('error', function (err) {
        logger.error('Redis Error :: ' + err);
    });

	deferred.resolve(true);
	return deferred.promise;
};

var logMessage = function(msg) {
	logger.info('AMQP :: [x] %s:"%s"',
				msg.fields.routingKey,
				msg.content.toString());
};

starter()
.then(function() {
	logger.info('AMQP :: Start');
	// AMQP Setup:
	var amqpServerURL = 'amqps://' + cdxgc_man_args.amqp_host + ':' + cdxgc_man_args.amqp_port;
	logger.info('AMQP :: URL: ' + amqpServerURL);
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
		logger.error('AMQP Error :: '+ err);
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
app.get('/admin', routes.admin);
// Create HTTPS Server:
main_https = https.createServer(CERT_OPTS, app);
// Attach Socket.io
sio = sioServer(main_https);
// Inform on connections:
sio.on('connection',function (socket) {
	logger.info('sio :: on-connection :: connection made.');
	socket.on('updateFullTable', function(tableObject){
		logger.info('sio :: updateFullTable: ' + tableObject.tabletype);
		var main_defer = when.defer();
		var main_resolver = main_defer.resolver;
		var main_promise = main_defer.promise;
		
		var sort_key = null;
		var emit_key = null;
		if(tableObject.tabletype === 'mal') {
			// Pull only mal keys
			sort_key = REDIS_MAL_ORDER_KEY;
			emit_key = 'updateFullMalicious';
		} else if (tableObject.tabletype === 'alltasks') {
			// Pull all the keys:
			sort_key = REDIS_SENT_ORDER_KEY;
			emit_key = 'updateFullAllTasks';
		}
		
		if (tableObject.updatetype === 'full') {
			// Pull all the keys:
			redisclient.zrevrange(sort_key, 0, 29, function(err, reply) {
				logger.info('sio :: updateFullMalicious :: Zrevrange Reply: '+util.inspect(reply));
				if (reply.length == 0) {
					main_resolver.reject('no_data');
				} else {
					main_resolver.resolve(reply);
				}
			});
		} else if (tableObject.updatetype === 'update') {
			var currentTime = new Date();
			var endTimeObj = new Date();
			endTimeObj.setTime(tableObject.lasttimems);
			
			var startTimeMS = currentTime.getTime();
			var endTimeMS = endTimeObj.getTime();
			redisclient.zrevrangebyscore(sort_key, startTimeMS, endTimeMS, function(err, reply) {
				logger.info('sio :: updateFullMalicious :: Zrevrangebyscore Reply: '+util.inspect(reply));
				if (reply.length == 0) {
					main_resolver.reject('no_data');
				} else {
					main_resolver.resolve(reply);
				}
			});
		}

		var main_defer = when.map(main_promise, function(item){
			var defer = when.defer();
			logger.info('sio :: updateFullTable :: hmget item: '+item);
			redisclient.hgetall(item, function (err, reply) {
				logger.info('sio :: updateFullTable :: hmget reply: '+util.inspect(reply));
				defer.resolve(reply);
			});
			return defer.promise;
		}).then(function (fullTableData) {	
			logger.info('sio :: updateFullTable :: Blobs JSON:\n'+JSON.stringify(fullTableData));
			logger.info('sio :: updateFullTable :: ' + emit_key);
			socket.emit(emit_key, fullTableData);
		});	
	});
	socket.on('redisCmd', function (redisCmdObj) {
		var statusEmitStr = 'redisCmdStatus';
		var curCmd = redisCmdObj.cmd;
		logger.info('sio :: redisCmd :: Current Command: '+curCmd);
		if(curCmd === 'exportAllKeys' || 
		   curCmd === 'exportMalKeys')
		{
			logger.info('sio :: TODO Export All Keys');
			// Set up appending file stream
			// File format: <type: export_mal_keys or export_all_keys>_<day>_<mon>_<year>_<time 24h:mins:MS>.csv
			// Use async to keep pulling chunks
			// For each chunk, build the csv output and the write it to the stream
			// Keep going until the cursor is back to zero.
		} else if(curCmd === 'clearSentOrder' || 
		          curCmd === 'clearMalOrder')
		{
			var currentSortKey = null;
			if(curCmd === 'clearSentOrder') {
				currentSortKey = REDIS_SENT_ORDER_KEY;
			} else {
				currentSortKey = REDIS_MAL_ORDER_KEY;
			}
			socket.emit(statusEmitStr, 'Starting to remove: '+currentSortKey);
			redisclient.del(currentSortKey,function (err, reply) {
				if (err) {
					logger.warning('sio :: redisCmd :: '+currentSortKey+' :: Err: '+err);
					socket.emit(statusEmitStr, 'Err('+currentSortKey+'): '+err);
					return;
				}
				socket.emit(statusEmitStr, 'Cleared: '+currentSortKey);
			});
		} else if(curCmd === 'clearAllKeys'){
			logger.info('sio :: Clear All Keys');
			var deletedKeysDefer = when.map([REDIS_SENT_HEADER, REDIS_MAL_HEADER],
			function (redisKeyHeader) {
				var dataKeyDefer = when.defer();
				var dataKeyDeferRes = dataKeyDefer.resolver;
				var dataKeysToFind = redisKeyHeader + '*';
				socket.emit(statusEmitStr, 'Getting all keys matching: '+dataKeysToFind);
				redisclient.keys(dataKeysToFind, function (err, reply) {
					if (err) {
						logger.warn('sio :: redisCmd :: clearAllKeys ('+dataKeysToFind+') :: Err: '+err);
						socket.emit(statusEmitStr, 'Err(clearAllKeys - '+dataKeysToFind+'): '+err);
						return dataKeyDeferRes.reject(err);
					}
					socket.emit(statusEmitStr, 'Got this number of keys('+dataKeysToFind+'): '+reply.length);
					dataKeyDeferRes.resolve(reply);
				});
				return dataKeyDefer.promise;
			}).then(function(allItems){
				logger.debug('All Items: \n'+util.inspect(allItems));
				var finalList = _.flatten(allItems);
				logger.debug('Final List: \n'+util.inspect(finalList));
				return finalList;
			}).then(function (allItemsToDelete) {
				logger.info('sio :: redisCmd :: clearAllKeys - del :: starting deletion process.');
				logger.debug('All Items To Delete: \n'+util.inspect(allItemsToDelete));
				return when.map(allItemsToDelete, function (itemToDelete) {
					var deleteDefer = when.defer();
					var deleteRes = deleteDefer.resolver;
					redisclient.del(itemToDelete, function (err, reply) {
						if (err) {
							logger.warn('sio :: redisCmd :: clearAllKeys - del :: Err: '+err);
							socket.emit(statusEmitStr, 'Err(clearAllKeys - del): '+err);
							return deleteRes.reject(err);
						}
						socket.emit(statusEmitStr, 'Deleted key: '+itemToDelete+' Reply: '+reply);
						deleteRes.resolve(reply);
					});
					return deleteDefer.promise;
				});
				//return deleteMap.promise;
			}).then(function (keysDeleted) {
				logger.info('sio :: redisCmd :: clearAllKeys - sort :: starting deletion process.');
				logger.debug('Keys deleted:\n'+util.inspect(keysDeleted));
				socket.emit(statusEmitStr, 'Deleted all key types. Total: '+keysDeleted.length+' Now clearing sort orders...');
				return when.map([REDIS_SENT_ORDER_KEY,REDIS_MAL_ORDER_KEY], function (sortItemToDelete) {
					var deleteSortDefer = when.defer();
					var deleteSortRes = deleteSortDefer.resolver;
					redisclient.del(sortItemToDelete, function (err, reply) {
						if (err) {
							logger.warn('sio :: redisCmd :: clearAllKeys - sort: '+itemToDelete+' :: Err: '+err);
							socket.emit(statusEmitStr, 'Err(clearAllKeys - sort: '+itemToDelete+'): '+err);
							return deleteSortRes.reject(err);
						}
						socket.emit(statusEmitStr, 'Deleted sort: '+sortItemToDelete);
						deleteSortRes.resolve(reply);
					});
					return deleteSortDefer.promise;
				});
			}).then(function (keysDeleted) {
				socket.emit(statusEmitStr, 'Deleted all sort order keys. Total: '+keysDeleted.length+'. Deleted all keys. Done.');
			});
		}
	});
	//socket.on('malInput');
});
// Launch HTTPS Server:
main_https.listen(app.get('port'), function(){
	logger.info('Express server listening on port ' + app.get('port'));
});

