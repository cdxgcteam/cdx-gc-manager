//START
(function(){

var logger = function (logStr) {
	var loggerOn = true;
	if (loggerOn) {
		console.log(logStr);
	}
};

var updateStatus = function(statusArea, mesg) {
	logger(mesg);
	$('#' + statusArea).html(mesg);
};

var pushFullTable = function(intable, tabledata) {
	//logger('pushFullTable JSON:\n'+JSON.stringify(tabledata));
	for(var i=(tabledata.length-1); i >= 0; i--) {
		addNewRow(
			intable,
			tabledata[i].taskid,
			tabledata[i].url,
			tabledata[i].poc,
			tabledata[i].minWorkTime,
			tabledata[i].workTime,
			tabledata[i].taskCreateDate,
			tabledata[i].taskCreateMS,
			0
		);
	}
};

var addNewRow = function (tbodyStr, id, url, poc, minTime, workTime, submittedTime, submittedTimeMS, completedCount) {
	var tempStr = '#' + tbodyStr;
	var baseTable = $(tempStr);
	
	var firstRowIDCheck = $(tempStr+' tr:first td:first');
	if (firstRowIDCheck.length == 1 && firstRowIDCheck[0].textContent === id) {
		logger('addNewRow :: The recieved row is a repeat of the first one ...');
		return 0;
	}
	// Else continue adding the new row.
	if (baseTable.length == 1) {

		// Create a new row:
		var newRow = baseTable[0].insertRow(0);

		cur_id = newRow.insertCell(0);
		cur_id.innerText = id;

		cur_url = newRow.insertCell(1);
		cur_url.innerHTML = '<a href="'+url+'" data-toggle="tooltip" data-placement="right" title="'+url+'">Link</a>';

		cur_poc = newRow.insertCell(2);
		cur_poc.innerText = poc;

		cur_min = newRow.insertCell(3);
		cur_min.innerText = minTime + ' ms';

		cur_time = newRow.insertCell(4);
		cur_time.innerText = workTime + ' ms';

		cur_submit = newRow.insertCell(5);
		cur_submit.innerText = submittedTime + '('+ submittedTimeMS +' ms)';

		cur_badge = newRow.insertCell(6);
		cur_badge.innerHTML = '<span class="badge">' + completedCount + '</span>';	
		
		// Add javascript additions:
		var turn_on_tooltip = 'tr:contains("'+id+'") a';
		$(turn_on_tooltip).tooltip();
		
		return 1;
	} else {
		return 0;
	}
};

// Socket Setup:
var socket = null;
var start_socket = function () {
	return $.Deferred(function (defer) {
		socket = io(document.location.origin);
		socket.on('connect', function(){
			logger('sio :: connected');
			defer.resolve(true);
			socket.on('updateFullAllTasks', function(data){
				pushFullTable('tasks_tbody', data);
			});
			socket.on('updateFullMalicious', function(data){
				pushFullTable('mal_tbody', data);
			});
			socket.on('redisCmdStatus',function (data) {
				updateStatus('redisCmdStatus', data);
			});
			socket.on('disconnect', function(){
				logger('sio :: disconnected');
			});
		});
	}).promise();
};

// Main: Running start...
var runner = function () {

	// For the table pages:
	var table_exists = null;
	var table_type = '';
	if (document.location.pathname === '/'){ // Malicious Dashboard
		table_exists = $('document:has(#mal_tbody)');
		table_type = 'mal';		
	} else if (document.location.pathname === '/viewalltasks') {
		table_exists = $('document:has(#tasks_tbody)');
		table_type = 'alltasks';
	}

	if (!_.isNull(table_exists)){
		logger('sio :: updateFullTable command sent');
		
		socket.emit('updateFullTable', {
			'tabletype': table_type,
			'updatetype': 'full'
		});
		
		setInterval(function () {
			logger('sio :: starting to update table...');
			var lastTimeObj = $('#tasks_tbody tr:first td:contains("ms)")');
			if (lastTimeObj.length == 1) {
				logger('sio :: first time obj found...');
				var lastTimeMS = lastTimeObj[0].textContent.match(/\((\d+)\s+ms\)/)[1];
				logger('sio :: requesting updates...');
				socket.emit('updateFullTable', {
					'tabletype': table_type,
					'updatetype': 'update',
					'lasttimems': lastTimeMS
				});
			}
		},5000);
	}

	// For the admin page:
	if (document.location.pathname === '/admin'){
		var redisCmds = ['exportAllKeys',
						'exportMalKeys',
						'clearSentOrder',
						'clearMalOrder',
						'clearAllKeys'];
		var jqFullRedisCmdList = redisCmds.join(', #');
		$('#' + jqFullRedisCmdList).click(function (evt) {
			var curRedisCmd = this.id;
			logger('Redis CMD :: ' + curRedisCmd);
			socket.emit('redisCmd', {cmd: curRedisCmd});
		});
		
		//Malicious Form Submittal:
		$('#malInput').submit(function (evt) {
			
		});
	}
};

$( document ).ready(function () {
	start_socket().then(runner);
	
});

//END
})();
