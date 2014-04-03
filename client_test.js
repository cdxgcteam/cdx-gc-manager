#!/usr/bin/env node

var amqp = require('amqplib');
var when = require('when');
var all = require('when').all;
var fs = require('fs');

var BASE_CERT_PATH = "/home/cdxgcserver/cdx_gc_certs2";
var CERT_OPTS = {
	cert: fs.readFileSync(BASE_CERT_PATH + '/manager/cert.pem'),
	key: fs.readFileSync(BASE_CERT_PATH + '/manager/key.pem'),
	// cert and key or
	// pfx: fs.readFileSync('../etc/client/keycert.p12'),
	//passphrase: 'kJppRZYkdm4Fc5xr',
	ca: [fs.readFileSync(BASE_CERT_PATH + '/rmqca/cacert.pem')]
};
var AMQP_RESULTS_EXCHANGE = "direct_cdxresults";
var AMQP_RESULTS_ROUTING_KEY = "task_results";

var AMQP_TASK_EXCHANGE = "topic_cdxtasks";
var AMQP_TASK_BINDING_KEYS = ["all.*", "navy.linux.*"];

var AMQP_CH = null;

var message = 'Hello World!';

logMessage = function(msg) {
	console.log(" [x] %s:'%s'",
				msg.fields.routingKey,
				msg.content.toString());
	AMQP_CH.ack(msg);
	AMQP_CH.publish(AMQP_RESULTS_EXCHANGE, AMQP_RESULTS_ROUTING_KEY, new Buffer(message));
	console.log(" RESULT!! Sent %s:'%s'", message);
};

var amqpServerURL = 'amqps://cdxgcserver:5671';
amqp.connect('amqp://localhost').then(function(conn) {
	return when(conn.createChannel().then(function(ch) {
		AMQP_CH = ch;
		var tasks = ch.assertExchange(AMQP_TASK_EXCHANGE, 'topic', {durable: false});
		
	    tasks = tasks.then(function() {
			console.log('AMQP :: Tasks Exchange Asserted.');
			return ch.assertQueue('', {exclusive: true});
	    });
		
	    tasks = tasks.then(function(qok) {
			console.log('AMQP :: Tasks Queue Asserted.');
			var queue = qok.queue;
			return all(AMQP_TASK_BINDING_KEYS.map(function(rk) {
				ch.bindQueue(queue, AMQP_TASK_EXCHANGE, rk);
			})).then(function() {
				console.log('AMQP :: Tasks Queues Binded.');
				return queue;
			});
	    });
		
		tasks = tasks.then(function(queue) {
			return ch.consume(queue, logMessage, {noAck: false});
		});
		return tasks.then(function() {
			console.log(' AMQP :: Waiting for tasks. To exit press CTRL+C.');
		});
	}));
}).then(null, console.warn);