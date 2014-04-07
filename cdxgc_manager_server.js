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

// - Underscore/Lodash
//var _ = require('underscore');
var _ = require('lodash-node');

// - Promises...
var when = require('when');

// - Async
var async = require('async');

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
//var redispublish = null;

// - AMQP -> RabbitMQ Connection Library
var amqp = require('amqplib');
var coreChannel = null;

// - csv
var csv = require('csv');

// - moment - Date Formatter:
var moment = require('moment');

// - Logging
var winston = require('winston');
var logger = new (winston.Logger)({
	exitOnError: false,
	transports: [
		new (winston.transports.Console)({level: 'debug', colorize: true, timestamp: true}),
		new (winston.transports.File)({level: 'debug', colorize: true, timestamp: true, filename: 'info.log' })
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
  res.send(500, { error: 'Something failed!!' });
}
// ----------------------------
// GLOBALS:
// ----------------------------
var POSSIBLE_LARGE_SEEDS = [
'=Z<x.hVR87OG&gc,N!WfS7vv#cuanX|eyc{0mz6v]:zQ`>*x?m?-tvv#RAP&:1B)}<Y&rX!zOG3I[b=M:t`EXSP/t>Dv9pS/@;BSnn!4DuE`=]zgl0<l+YY&)%M*|hBWx4WGE6Tknlu5mJv}-H&x>ZRvu_(NmAdk@Ua.w,#e5VVG+lD=KJ+#[&-X&OnC[+aIY:MI|5rw,,;C>.w#/Q)^!c3!Sz1|vqg6v@!o+^vA!,~ux)~1hi-c~.)#OuY_0?4+',
'Q+{]-H_dgFAl`bhw%f1{yv~IdV1FS*s:e$v:gVE*J]Iv4aXwzf!`pEOm/+*BxZvpjHA7H=_^qg|?v{}XB8*6:d&~B+m7tv}@WV~<59b$q$z|!N&jZbm?LUR@[U6I$+{t7iiT~PvJ=JTC)SgH~CO78)=c$Hqh$f~xneBpv;Uu#zwh6DmI&Fuvl6`0|_9fTRpj=cFGQ;*LS"(|u$%`yb{/TUz<Fi<Y/,(N_|jpf]1Y4r!zI$R+pO#rU*gI-w74sK^3',
'*Ef;}$Y:p`zinV~4}eA6IVbcWs0DRavU~Hc(ox1ooNMJlxo;hEvN/vVt[q-xQMDS_;[~UrntFZdP72<=UlQvKb.8~F{eo%&z(PGf0KcxZC5B.k}H?]Z8v}7X}IhBi(s)T`6d>7pO(3x/vEK^p&gm,wL-gF9ux?GoqojLiA;{Tlxf-bhMpxar-J>b[G6:~Icbz8Py?a8l;_rZ4TPd<w&0y$~QWt(b"i8[VAixi"s_O-Y>cShb-mE_q1xm|3/2~%?Y'
];
var CHOOSEN_SEED = 0;
var WEB_SERVER_PORT = 3443;
var BASE_CSV_PATH = './public/csv';
var BASE_CSV_URL_PATH = '/csv';
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

var REDIS_RESULT_HEADER = 'result_';
var REDIS_SENT_HEADER = 'sent_meta_';
var REDIS_SENT_ORDER_KEY = 'cdx_sent_order';
var REDIS_MAL_HEADER = 'mal_meta_';
var REDIS_MAL_ORDER_KEY = 'cdx_mal_order';

var REDIS_MAL_QUEUE_KEY = 'cdx_mal_submits_queue';
var REDIS_CMD_QUEUE_KEY = 'cdx_cmd_submits_queue';
var REDIS_MAL_LOCK_KEY = 'cdx_mal_lock_key';
var REDIS_CMD_LOCK_KEY = 'cdx_cmd_lock_key';

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

var redisLock = {
	lockKeyHash: null,
	intervalCounter: 0,
	intervalObj: null,
	
	// lockKey : Redis Key to lock against
	// maxTime : In milliseconds, the expire time for the key
	setLock: function (lockKey, maxTime, maxRetries, maxTimeBetweenTries) {
		logger.debug('redisLock :: setLock :: lockKey: '+lockKey+' maxTime: '+maxTime+' maxRetries: '+maxRetries+' maxTimeBetweenTries: ', maxTimeBetweenTries);

		// Setup promise:
		var lockDefer = when.defer();
		var lockDeferRes = lockDefer.resolver;
		
		// Build lock string:
		var currentDate = new Date();
		var currentDigest = currentDate.toJSON() + POSSIBLE_LARGE_SEEDS[CHOOSEN_SEED];
		var shasum = crypto.createHash('sha1');
		shasum.update(currentDigest, 'utf8');
		var hashout = shasum.digest('hex');
		
		// Build set command:
		var curMaxRetries = maxRetries || 5;
		var curMaxTimeBetweenTries = maxTimeBetweenTries || 50;
		var setArgs = [lockKey, hashout, 'PX', maxTime, 'NX'];
		logger.debug('redisLock :: setLock :: Max Retries: '+curMaxRetries+' Max Time Between Tries: '+curMaxTimeBetweenTries);
		logger.debug('redisLock :: setLock :: Set Command Input: '+util.inspect(setArgs));
		redisLock.intervalObj = setInterval(function () {
			redisclient.set(setArgs, function (err, reply) {
				logger.debug('redisLock :: setLock :: Reply: '+reply+' Err: '+err);
				if(reply === 'OK') {
					redisLock.lockKeyHash = hashout;
					lockDeferRes.resolve(hashout);
					clearInterval(redisLock.intervalObj);
				} else {
					redisLock.intervalCounter++;
					if(redisLock.intervalCounter == curMaxRetries) {
						clearInterval(redisLock.intervalObj);
						lockDeferRes.reject('lockFail');
					}
				}
			});
		}, curMaxTimeBetweenTries);
		
		return lockDefer.promise;
	},
	releaseLock: function (lockKey, lockHash) {
		logger.debug('redisLock :: releaseLock :: lockKey: '+lockKey+' lockHash: '+lockHash);
		// release lock Script:
		var releaseLuaCode = 'if redis.call("get",KEYS[1]) == ARGV[1]\nthen\n    return redis.call("del",KEYS[1])\nelse\n    return 0\nend';
		
		// release lock defer:
		var lockDefer = when.defer();
		var lockDeferRes = lockDefer.resolver;
		
		// Use the hash provided unless one isn't and then take what we have on file in the object:
		var curLockHash = null;
		if (_.isUndefined(lockHash)) {
			curLockHash = redisLock.lockKeyHash;
		} else {
			curLockHash = lockHash;
		}
		var evalArgs = [releaseLuaCode, 1, lockKey, curLockHash];
		logger.debug('redisLock :: releaseLock :: Eval Command Input: '+util.inspect(evalArgs));
		redisclient.eval(evalArgs, function (err, reply) {
			logger.debug('redisLock :: releaseLock :: Reply: '+reply+' Err: '+err);
			if (reply == 1){
				logger.debug('redisLock :: releaseLock :: released!');
				lockDeferRes.resolve(reply);
			} else {
				logger.debug('redisLock :: releaseLock :: failed!');
				lockDeferRes.reject(err);
			}
		});
		return lockDefer.promise;
	}
};

var addTaskToQueue = function (queue,task){
	// Turn the received object to a string to push into the malicious list:
	var taskStr = JSON.stringify(task);
	
	var curLockKey = null;
	if(queue === REDIS_MAL_QUEUE_KEY) {
		curLockKey = REDIS_MAL_LOCK_KEY;
	} else if (queue === REDIS_CMD_QUEUE_KEY) {
		curLockKey = REDIS_CMD_LOCK_KEY;
	} else {
		return false;
	}
	
	// Handle all the command output:
	var lockProm = redisLock.setLock(curLockKey, 1000);
	return lockProm.then(function (lockHash) {
		logger.debug('addTaskToQueue :: lockHash: '+lockHash);
		var listPushDefer = when.defer();
		var listPushDeferRes = listPushDefer.resolver;
		
		var rpushArgs = [queue, taskStr];
		redisclient.rpush(rpushArgs, function (err, reply) {
			if (reply >= 1) {
				listPushDeferRes.resolve(reply);
			} else {
				listPushDeferRes.reject(err);
			}
		});
		
		return listPushDefer.promise;
	}).then(function (listLen) {
		logger.debug('List Length: '+listLen);
		// Release the lock:
		return redisLock.releaseLock(curLockKey);
	}).then(function (lockReleaseSuccess) {
		if (lockReleaseSuccess === 1){
			return true;
		} else {
			return false;
		}
	});
};

var redisCmdRecieve = function (channel, message) {
	logger.debug('redisCmdRecieve :: channel: ' + channel + ' :: msg: ' + message);
};

var starter = function() {
	var deferred = when.defer();

	logger.info('Starting CDX GC Manager');

	logger.info('OS Platform: '+os.platform());
	logger.info('Web Server Port: ' + cdxgc_man_args.web_port);
	logger.info('AMQP Server: ' + cdxgc_man_args.amqp_host);
	logger.info('AMQP Port: ' + cdxgc_man_args.amqp_port);
	logger.info('Redis Server: ' + cdxgc_man_args.redis_host);
	logger.info('Redis Port: ' + cdxgc_man_args.redis_port);

	CHOOSEN_SEED = well.randInt(0, (POSSIBLE_LARGE_SEEDS.length-1));
	logger.info('Choosen Seed [' + CHOOSEN_SEED + ']: ' + POSSIBLE_LARGE_SEEDS[CHOOSEN_SEED]);

	// Redis Setup:
	redisclient = redis.createClient(cdxgc_man_args.redis_port, cdxgc_man_args.redis_host);
    redisclient.on('connect', function (err) {
        logger.info('Redis Connected');
		deferred.resolve(true);
    });
    redisclient.on('error', function (err) {
        logger.error('Redis Error :: ' + err);
    });

	return deferred.promise;
};

// var logMessage = function(msg) {
// 	//logger.info('AMQP :: msg:\n'+util.inspect(msg));
// 	logger.info('AMQP :: [x] %s:"%s"',
// 				msg.fields.routingKey,
// 				msg.content.toString());
// };

var resultHandler = function(msg) {
	logger.info('resultHandler :: AMQP :: [x] %s:"%s"',
				msg.fields.routingKey,
				msg.content.toString());
	
	var resultObjStr = msg.content.toString();
	var resultObjs = JSON.parse(msg.content.toString());

	var promise = when.promise(function(resolve, reject, notify) {
		var testKey = '*'+resultObjs.taskID+'*';
		redisclient.keys(testKey, function (err, reply) {
			logger.debug('resultHandler :: found key: '+reply);
			if (err) {
				reject(err);
			} else {
				resolve(reply);
			}
		});
	}).then(function (foundKey) {
		var resultKey = REDIS_RESULT_HEADER+foundKey;
		logger.debug('resultHandler :: result key: '+resultKey);
		var resultSaveDefer = when.defer();
		var resultSaveDeferPromise = resultSaveDefer.promise;
		
		var hsetInput = [resultKey, resultObjs.executor, resultObjStr];
		redisclient.hset(hsetInput, function (err, reply) {
			if (err) {
				resultSaveDefer.reject(err);
			} else {
				logger.info('resultHandler :: result key set reply: '+reply);
				resultSaveDefer.resolve(reply);
			}
		});
		
		return resultSaveDeferPromise;
	}).then(function (replyState) {
		logger.info('resultHandler :: emitting the result obj to the browser.');
		sio.sockets.emit('taskUpdate', resultObjStr);
	});
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
				return ch.consume(queue, resultHandler, {noAck: true});
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
app.use(express.favicon('public/img/favicon.ico'));
app.use(express.logger({stream:winstonStream}));
app.use(express.json());
app.use(express.urlencoded());
app.use(express.methodOverride());
app.use(express.basicAuth(function (user, pass, callback) {
	var tempUser = 'cdxman_user_' + user;
	redisclient.get(tempUser, function (err, reply) {
		if (err) return callback(err);
		if(_.isNull(reply)) {
			var no_reply = 'login error.';
			return callback(no_reply);
		}
		if (reply === pass) {
			callback(null, user);
		} else {
			var bad_pass = 'login error.';
			return callback(bad_pass);
		}
	});
}));
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
			var fileHeader = null;
			var currentSortKey = null;
			var currentHeader = null;
			if (curCmd === 'exportAllKeys') {
				fileHeader = '/export_all_keys_';
				currentSortKey = REDIS_SENT_ORDER_KEY;
				currentHeader = REDIS_SENT_HEADER;
			} else if (curCmd === 'exportMalKeys'){
				fileHeader = '/export_mal_keys_';
				currentSortKey = REDIS_MAL_ORDER_KEY;
				currentHeader = REDIS_MAL_HEADER;
			}
			
			if (!_.isNull(fileHeader) && !_.isNull(currentSortKey)) {
				var currentDate = moment().format('DD_MM_YYYY_HHmmssZZ');
				var finalFileName = BASE_CSV_PATH + fileHeader + currentDate + ".csv";
				var finalUrlName = BASE_CSV_URL_PATH + fileHeader + currentDate + ".csv";
				socket.emit(statusEmitStr, 'Opening File for Writing: '+finalUrlName);
				var exportFileStream = fs.createWriteStream(finalFileName, {flags: 'a', encoding: null, mode: 0666});
				// Do the scan and get the chunks processed.
				var headerRegex = new RegExp(currentHeader,'i');
				logger.info('sio :: redisCmd :: Starting to export ('+currentSortKey+')');
				var scanState = 0;
				async.doUntil(
					function (callback) {
						var getExport = when.promise(function (resolve, reject, notify) {
							logger.debug('in when...1');
							redisclient.zscan(currentSortKey,scanState,function (err, reply) {
								logger.debug('Reply: \n'+util.inspect(reply));
								if (err) {
									logger.warning('sio :: redisCmd :: export ('+currentSortKey+') :: Err: '+err);
									socket.emit(statusEmitStr, 'Export Err('+currentSortKey+'): '+err);
									reject(err);
									return;
								}
								scanState = reply[0]; // Reply[0] == the cursor number.
								if (reply[1].length > 0){
									resolve(reply[1]);
								} else {
									reject('no data to process');
								}
							});
						}).then(function (data) { // Data Found Path...
							logger.debug('in when...2:\n'+util.inspect(data));
							var dataFilter = _.filter(data, function (item) {
								logger.debug('item: ' + item + ' match: ' + util.inspect(headerRegex.test(item)));
								return headerRegex.test(item);
							});
							return dataFilter;
						},function (rejectReason) { // Data NOT Found Path...
							logger.warn('sio :: redisCmd :: export ('+currentSortKey+') :: reject reason: '+ rejectReason);
							callback(null);
							return [];
						}).then(function (keyList) {
							logger.debug('in when...3');
							logger.info('sio :: redisCmd :: export ('+currentSortKey+') keylist:\n'+util.inspect(keyList));
							if (keyList.length > 0) {
								return when.map(keyList, function (itemToGetData) {
									var dataDefer = when.defer();
									var dataDeferRes = dataDefer.resolver;
									redisclient.hgetall(itemToGetData, function (err, reply) {
										logger.debug('sio :: redisCmd :: export ('+currentSortKey+') reply: '+util.inspect(reply));
										dataDeferRes.resolve(reply);
									});
									return dataDefer.promise;
								});
							}
						}).then(function (finalOutput) {
							logger.debug('FinalOutput: \n'+util.inspect(finalOutput));
							if (finalOutput.length > 0) {
								csv()
								.from.array(finalOutput, {
									columns:['cmd','taskid','poc','srcSystem','minWorkTime','workTime','taskCreateMS','taskCreateDate','urlNum','url']
								}).to.stream(exportFileStream, {
									end: false,
									eof: true
								});
							}
							callback(null);
						});
					},
					function () {
						socket.emit(statusEmitStr, 'Pulling data together...');
						return scanState === "0";
					},
					function (err) {
						socket.emit(statusEmitStr, 'File Ready: <a href=\"'+finalUrlName+'\">'+finalUrlName+'</a>');
						logger.info('Done exporting ('+currentSortKey+') :: File Path: '+finalFileName);
					}
				);
			} else {
				logger.warning('sio :: redisCmd :: export :: Err: '+err);
				socket.emit(statusEmitStr, 'Err(export): '+err);
			}
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
			var headers = [REDIS_SENT_HEADER, REDIS_MAL_HEADER, REDIS_RESULT_HEADER+REDIS_SENT_HEADER, REDIS_RESULT_HEADER+REDIS_MAL_HEADER]
			logger.debug('sio :: Clear All Keys :: headers: '+util.inspect(headers));
			var deletedKeysDefer = when.map(headers,
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
	socket.on('malInput', function (malInputObj) {
		var malInputEmitStr = 'malCmdStatus';
		logger.info('sio :: malInput :: Adding Mal Command: '+util.inspect(malInputObj));
		socket.emit(malInputEmitStr, 'Adding Mal Command: '+util.inspect(malInputObj));
		var addTaskPromise = addTaskToQueue(REDIS_MAL_QUEUE_KEY, malInputObj);
		addTaskPromise.then(function (addSuccess) {
			// AddSuccess should be a boolean value:
			if (addSuccess) {
				socket.emit(malInputEmitStr, 'Done Adding Mal Command: '+util.inspect(malInputObj));
				logger.info('sio :: malInput :: Done Adding Mal Command: '+util.inspect(malInputObj));
			} else {
				logger.info('sio :: malInput :: Problem Adding Mal Command: '+util.inspect(malInputObj));
				socket.emit(malInputEmitStr, 'Problem Adding Mal Command: '+util.inspect(malInputObj));
			}
		});
	});
	socket.on('othercmdinput', function (otherCmdInputObj) {
		var otherCmdInputEmitStr = 'otherCmdStatus';
		logger.info('sio :: othercmdinput :: Adding Command: '+util.inspect(otherCmdInputObj));
		socket.emit(otherCmdInputEmitStr, 'Adding Command: '+util.inspect(otherCmdInputObj));
		var addTaskPromise = addTaskToQueue(REDIS_CMD_QUEUE_KEY, otherCmdInputObj);
		addTaskPromise.then(function (addSuccess) {
			// AddSuccess should be a boolean value:
			if (addSuccess) {
				socket.emit(otherCmdInputEmitStr, 'Done Adding Command: '+util.inspect(otherCmdInputObj));
				logger.info('sio :: othercmdinput :: Done Adding Command: '+util.inspect(otherCmdInputObj));
			} else {
				logger.info('sio :: othercmdinput :: Problem Adding Command: '+util.inspect(otherCmdInputObj));
				socket.emit(otherCmdInputEmitStr, 'Problem Adding Command: '+util.inspect(otherCmdInputObj));
			}
		});
	});
	
});
// Launch HTTPS Server:
main_https.listen(app.get('port'), function(){
	logger.info('Express server listening on port ' + app.get('port'));
});

