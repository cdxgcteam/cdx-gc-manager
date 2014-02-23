#!/usr/bin/env node

var amqp = require('amqplib');
var when = require('when');
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
var AMQP_EXCHANGE = "direct_cdxresults";
var AMQP_ROUTING_KEY = "task_results";

var args = process.argv.slice(2);
var severity = AMQP_ROUTING_KEY;
var message = args.join(' ') || 'Hello World!';

var counter=0;
var counterInt;

var amqpServerURL = 'amqps://cdxgcserver:5671';
amqp.connect('amqp://localhost').then(function(conn) {
	return when(conn.createChannel().then(function(ch) {
		var ok = ch.assertExchange(AMQP_EXCHANGE, 'direct', {durable: false});
		
		return ok.then(function() {
			counterInt = setInterval(function () {
				if (counter >= 1000) {
					clearInterval(counterInt);
					conn.close();
					return;
				}
				ch.publish(AMQP_EXCHANGE, AMQP_ROUTING_KEY, new Buffer(message+counter));
				console.log(" [x] Sent %s:'%s'", severity, message);
				counter++;
			},1000);
			//return ch.close();
		});
	}));
}).then(null, console.warn);