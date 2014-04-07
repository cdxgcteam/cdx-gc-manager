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
			tabledata[i],
			// .taskid,
// 			tabledata[i].taskType,
// 			tabledata[i].url,
// 			tabledata[i].poc,
// 			tabledata[i].minWorkTime,
// 			tabledata[i].workTime,
// 			tabledata[i].taskCreateDate,
// 			tabledata[i].taskCreateMS,
			0
		);
	}
};

//var addNewRow = function (tbodyStr, id, taskType, url, poc, minTime, workTime, submittedTime, submittedTimeMS, completedCount) {
var addNewRow = function (tbodyStr, inputData, completedCount) {
	var tempStr = '#' + tbodyStr;
	var baseTable = $(tempStr);
	
	var id = inputData.taskID;
	var firstRowIDCheck = $(tempStr+' tr:first td:first');
	if (firstRowIDCheck.length == 1 && firstRowIDCheck[0].textContent === id) {
		logger('addNewRow :: The recieved row is a repeat of the first one ...');
		return 0;
	}
	// Else continue adding the new row.
	if (baseTable.length == 1) {

		// Create a new row:
		var newRow = baseTable[0].insertRow(0);

		newRow

		// Task ID:
		var cellCounter = 0;
		cur_id = newRow.insertCell(cellCounter);
		cur_id.innerText = id;
		cellCounter++;

		// Task Type:
		cur_taskType = newRow.insertCell(cellCounter);
		cur_taskType.innerText = inputData.taskType;
		cellCounter++;
		
		// CMD:
		cur_cmd = newRow.insertCell(cellCounter);
		cur_cmd.innerText = inputData.cmd;
		cellCounter++;

		// URL:
		cur_url = newRow.insertCell(cellCounter);
		var url = inputData.url;
		var urlMatches = url.match(/htt(p|ps):\/\//i);
		if(!_.isNull(urlMatches)){
			cur_url.innerHTML = '<a href="'+url+'" data-toggle="tooltip" data-placement="right" title="'+url+'">Link</a>';
		} else {
			cur_url.innerText = 'None';
		}
		cellCounter++;

		// POC:
		cur_poc = newRow.insertCell(cellCounter);
		cur_poc.innerText = inputData.poc;
		cellCounter++;
		
		// Minimum Run Time:
		cur_min = newRow.insertCell(cellCounter);
		cur_min.innerText = inputData.minWorkTime + ' ms';
		cellCounter++;
		
		// Selected Run Time:
		cur_time = newRow.insertCell(cellCounter);
		cur_time.innerText = inputData.workTime + ' ms';
		cellCounter++;

		// Submission Time:
		cur_submit = newRow.insertCell(cellCounter);
		cur_submit.innerText = inputData.taskCreateDate + '('+ inputData.taskCreateMS +' ms)';
		cellCounter++;

		// Completed Items:
		cur_badge = newRow.insertCell(cellCounter);
		cur_badge.innerHTML = '<span class="badge">' + completedCount + '</span>';
		cellCounter++;
		
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
			socket.on('taskUpdate', function(data){
				logger('sio :: taskUpdate :: '+data);
				var taskObj = JSON.parse(data);
				var targetRowObject = 'td:contains("'+taskObj.taskID+'") ~ td > span';
				var curCount = _.parseInt($(targetRowObject).text());
				$(targetRowObject).text(curCount++);
			});
			socket.on('redisCmdStatus',function (data) {
				updateStatus('redisCmdStatus', data);
			});
			socket.on('malCmdStatus',function (data) {
				updateStatus('malCmdStatus', data);
			});
			socket.on('otherCmdStatus',function (data) {
				updateStatus('otherCmdStatus', data);
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
		
		//General Command Validators/Actions:
		$('#commandChoice').change(function (evt) {
			var currentValue = $(this).val();
			if(currentValue === 'Pause'){
				$('#pauseTime').prop('disabled', false)
			} else {
				$('#pauseTime').prop('disabled', true)
			}
		});
		
		// Malicious Form and General Command Form Time Validator
		$('#pauseTime, #malInputMinTime').change(function (evt) {
			var currentID = $(this).attr('id');
			var currentValue = $(this).val();
			var test = currentValue.match(/\d+$/i);
			if(!_.isNull(test)) {
				$('#'+currentID+' ~ span').remove();
				$(this).parent().removeClass('has-error has-feedback');
				$(this).parent().addClass('has-success has-feedback');
				$(this).parent().append('<span class="glyphicon glyphicon-ok form-control-feedback"></span>');
			} else {
				$('#'+currentID+' ~ span').remove();
				$(this).parent().removeClass('has-success has-feedback');
				$(this).parent().addClass('has-error has-feedback');
				$(this).parent().append('<span class="glyphicon glyphicon-remove form-control-feedback"></span>');
			}
		});
		
		// POC Validator:
		$('#commandPOC, #malInputPOC').change(function (evt) {
			var currentID = $(this).attr('id');
			var currentValue = $(this).val();
			var valMatches = currentValue.match(/\w+/i);
			if(currentValue === valMatches[0]){
				$('#'+currentID+' ~ span').remove();
				$(this).parent().removeClass('has-error has-feedback');
				$(this).parent().addClass('has-success has-feedback');
				$(this).parent().append('<span class="glyphicon glyphicon-ok form-control-feedback"></span>');
			} else {
				$('#'+currentID+' ~ span').remove();
				$(this).parent().removeClass('has-success has-feedback');
				$(this).parent().addClass('has-error has-feedback');
				$(this).parent().append('<span class="glyphicon glyphicon-remove form-control-feedback"></span>');
			}
		});
		
		//Malicious Form Validators:
		$('#malInputURL').change(function (evt) {
			var currentValue = $(this).val();
			var valMatches = currentValue.match(/htt(p|ps):\/\//i);
			if(!_.isNull(valMatches)){
				$('#malInputURL ~ span').remove();
				$('#malInputURL').parent().removeClass('has-error has-feedback');
				$('#malInputURL').parent().addClass('has-success has-feedback');
				$('#malInputURL').parent().append('<span class="glyphicon glyphicon-ok form-control-feedback"></span>');
			} else {
				$('#malInputURL ~ span').remove();
				$('#malInputURL').parent().removeClass('has-success has-feedback');
				$('#malInputURL').parent().addClass('has-error has-feedback');
				$('#malInputURL').parent().append('<span class="glyphicon glyphicon-remove form-control-feedback"></span>');
			}
		});
		
		//Malicious Form Submittal:
		$('#malInput').submit(function (evt) {
			var malInputURL = $('#malInputURL').val();
			var malInputPOC = $('#malInputPOC').val();
			var malInputMinTime = $('#malInputMinTime').val();
			
			if ($('#malInputURL').parent().hasClass('has-error') ||
				$('#malInputPOC').parent().hasClass('has-error') ||
				$('#malInputMinTime').parent().hasClass('has-error'))
			{
				alert('Please correct all the errors before it will submit!');
			} else {
				logger('malInput :: Recieved URL: '+malInputURL);
				logger('malInput :: Recieved POC: '+malInputPOC);
				logger('malInput :: Recieved MinTime: '+malInputMinTime);
				socket.emit('malInput', {
					cmd: 'execute_url',
					url: malInputURL,
					poc: malInputPOC,
					minTime: malInputMinTime
				});
			}
			evt.preventDefault();
		});
		
		$('#othercmdinput').submit(function (evt) {
			var cmdChoice = $('#commandChoice').val();
			var pauseTime = $('#pauseTime').val();
			var cmdPOC = $('#commandPOC').val();
			if ($('#commandPOC').parent().hasClass('has-error') ||
				$('#pauseTime').parent().hasClass('has-error'))
			{
				alert('Please correct all the errors before it will submit!');
			} else {
				logger('othercmdinput :: Command Choice: '+cmdChoice);
				logger('othercmdinput :: Pause Time: '+pauseTime);
				logger('othercmdinput :: Command POC: '+cmdPOC);
				socket.emit('othercmdinput', {
					cmd: cmdChoice,
					pauseTimeMS: pauseTime,
					poc: cmdPOC
				});
			}
			evt.preventDefault();
		});
	}
};

$( document ).ready(function () {
	start_socket().then(runner);
	
});

//END
})();
